use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::thread;

use serde_json::{json, Value};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WindowEvent,
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

struct NativeHostProcess {
    child: Child,
    stdin: ChildStdin,
}

#[derive(Default)]
struct NativeHostState(Mutex<Option<NativeHostProcess>>);

fn safe_user_id(user_id: &str) -> bool {
    !user_id.is_empty()
        && user_id.len() <= 32
        && user_id.chars().all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        })
}

fn safe_pet_id(pet_id: &str) -> bool {
    pet_id.starts_with("pet-") && safe_user_id(&pet_id[4..])
}

fn pet_path(app: &AppHandle, user_id: &str) -> Result<PathBuf, String> {
    if !safe_user_id(user_id) {
        return Err("invalid user id".to_string());
    }
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("pets");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join(format!("{user_id}.json")))
}

#[tauri::command]
fn save_pet(app: AppHandle, user_id: String, pet: Value) -> Result<(), String> {
    let destination = pet_path(&app, &user_id)?;
    let temporary = destination.with_extension("json.tmp");
    let bytes = serde_json::to_vec(&pet).map_err(|error| error.to_string())?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("pet package is larger than 20 MB".to_string());
    }
    fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    fs::rename(temporary, destination).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_pet(app: AppHandle, user_id: String) -> Result<Option<Value>, String> {
    let path = pet_path(&app, &user_id)?;
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let value = serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
    Ok(Some(value))
}

fn native_host_path(app: &AppHandle) -> Result<PathBuf, String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let executable_dir = executable
        .parent()
        .ok_or_else(|| "PetLink executable directory is unavailable".to_string())?;
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    let mut candidates = vec![
        resource_dir.join("native").join("PetLink.NativeHost.exe"),
        resource_dir.join("PetLink.NativeHost.exe"),
        executable_dir.join("PetLink.NativeHost.exe"),
        executable_dir.join("native").join("PetLink.NativeHost.exe"),
    ];
    if let Some(source_tauri_dir) = executable_dir.parent().and_then(|path| path.parent()) {
        candidates.push(
            source_tauri_dir
                .join("native")
                .join("PetLink.NativeHost.exe"),
        );
    }
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| "PetLink 原生桌宠组件缺失，请重新安装。".to_string())
}

fn spawn_native_host(app: &AppHandle) -> Result<NativeHostProcess, String> {
    let path = native_host_path(app)?;
    let mut command = Command::new(path);
    command
        .arg(std::process::id().to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法连接原生桌宠输入通道".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法连接原生桌宠输出通道".to_string())?;
    let app_handle = app.clone();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(message) = serde_json::from_str::<Value>(&line) {
                let _ = app_handle.emit_to("main", "petlink:main", message);
            }
        }
    });
    Ok(NativeHostProcess { child, stdin })
}

fn write_native_command(
    app: &AppHandle,
    state: &tauri::State<NativeHostState>,
    command: &Value,
    start_if_needed: bool,
) -> Result<(), String> {
    let mut guard = state
        .0
        .lock()
        .map_err(|_| "原生桌宠状态不可用".to_string())?;
    if let Some(process) = guard.as_mut() {
        if process
            .child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_some()
        {
            *guard = None;
        }
    }
    if guard.is_none() {
        if !start_if_needed {
            return Ok(());
        }
        *guard = Some(spawn_native_host(app)?);
    }
    let process = guard.as_mut().ok_or_else(|| "原生桌宠未启动".to_string())?;
    let mut bytes = serde_json::to_vec(command).map_err(|error| error.to_string())?;
    bytes.push(b'\n');
    process
        .stdin
        .write_all(&bytes)
        .and_then(|_| process.stdin.flush())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn upsert_pet_window(
    app: AppHandle,
    native: tauri::State<NativeHostState>,
    pet_id: String,
    x: f64,
    y: f64,
    scale: f64,
    payload: Value,
    image_data_url: String,
) -> Result<(), String> {
    if !safe_pet_id(&pet_id) {
        return Err("invalid pet id".to_string());
    }
    if image_data_url.len() > 12 * 1024 * 1024
        || !image_data_url.starts_with("data:image/png;base64,")
    {
        return Err("invalid native pet image".to_string());
    }
    let pet_state = payload
        .get("state")
        .ok_or_else(|| "pet state is missing".to_string())?;
    let owner_user_id = pet_state
        .get("ownerUserId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let self_user_id = payload
        .get("selfUserId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    write_native_command(
        &app,
        &native,
        &json!({
            "type": "upsert",
            "petId": pet_id,
            "x": x,
            "y": y,
            "scale": scale,
            "action": pet_state.get("action").and_then(Value::as_str).unwrap_or("idle"),
            "direction": pet_state.get("direction").and_then(Value::as_str).unwrap_or("right"),
            "isOwner": owner_user_id == self_user_id,
            "imageDataUrl": image_data_url
        }),
        true,
    )
}

#[tauri::command]
fn hide_other_pet_windows(
    app: AppHandle,
    native: tauri::State<NativeHostState>,
    visible_pet_ids: Vec<String>,
) -> Result<(), String> {
    let pet_ids: Vec<String> = visible_pet_ids
        .into_iter()
        .filter(|pet_id| safe_pet_id(pet_id))
        .collect();
    write_native_command(
        &app,
        &native,
        &json!({ "type": "hide-others", "petIds": pet_ids }),
        false,
    )
}

#[tauri::command]
fn position_pet(
    _app: AppHandle,
    _pet_id: String,
    _x: f64,
    _y: f64,
    _scale: f64,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn show_control_center(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "settings window is missing".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

fn tray_native_command(app: &AppHandle, command_type: &str) {
    let state = app.state::<NativeHostState>();
    let _ = write_native_command(app, &state, &json!({ "type": command_type }), false);
}

fn stop_native_host(app: &AppHandle) {
    let state = app.state::<NativeHostState>();
    let _ = write_native_command(app, &state, &json!({ "type": "quit" }), false);
    if let Ok(mut guard) = state.0.lock() {
        if let Some(mut process) = guard.take() {
            let _ = process.child.wait();
        }
    };
}

pub fn run() {
    tauri::Builder::default()
        .manage(NativeHostState::default())
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "打开设置", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "显示桌宠", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "隐藏桌宠", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出 PetLink", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &show, &hide, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .tooltip("PetLink 桌宠")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        let _ = show_control_center(app.clone());
                    }
                    "show" => tray_native_command(app, "show-all"),
                    "hide" => tray_native_command(app, "hide-all"),
                    "quit" => {
                        stop_native_host(app);
                        app.exit(0);
                    }
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_pet,
            load_pet,
            upsert_pet_window,
            hide_other_pet_windows,
            position_pet,
            show_control_center
        ])
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running PetLink");
}
