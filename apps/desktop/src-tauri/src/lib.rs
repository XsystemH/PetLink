use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Size, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

fn safe_user_id(user_id: &str) -> bool {
    !user_id.is_empty()
        && user_id.len() <= 32
        && user_id
            .chars()
            .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-')
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

fn overlay_label(pet_id: &str) -> Result<String, String> {
    if !pet_id.starts_with("pet-") || !pet_id[4..].chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("invalid pet id".to_string());
    }
    Ok(format!("overlay-{pet_id}"))
}

#[tauri::command]
fn ensure_pet_window(app: AppHandle, pet_id: String) -> Result<(), String> {
    let label = overlay_label(&pet_id)?;
    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|error| error.to_string())?;
        return Ok(());
    }
    let url = format!("index.html?pet={pet_id}");
    WebviewWindowBuilder::new(&app, label, WebviewUrl::App(url.into()))
        .title("PetLink 桌宠")
        .inner_size(220.0, 220.0)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_other_pet_windows(app: AppHandle, visible_pet_ids: Vec<String>) -> Result<(), String> {
    let visible: Vec<String> = visible_pet_ids
        .iter()
        .filter_map(|pet_id| overlay_label(pet_id).ok())
        .collect();
    for (label, window) in app.webview_windows() {
        if label.starts_with("overlay-pet-") && !visible.contains(&label) {
            window.hide().map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn position_pet(app: AppHandle, pet_id: String, x: f64, y: f64, scale: f64) -> Result<(), String> {
    let label = overlay_label(&pet_id)?;
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "pet window is not ready".to_string())?;
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or(app.primary_monitor().map_err(|error| error.to_string())?)
        .ok_or_else(|| "no monitor available".to_string())?;
    let factor = monitor.scale_factor();
    let pet_size = (220.0 * scale.clamp(0.5, 2.0) * factor).round() as u32;
    window
        .set_size(Size::Physical(PhysicalSize::new(pet_size, pet_size)))
        .map_err(|error| error.to_string())?;
    let size = monitor.size();
    let origin = monitor.position();
    let px = origin.x + (x.clamp(0.0, 1.0) * size.width as f64).round() as i32 - pet_size as i32 / 2;
    let py = origin.y + (y.clamp(0.0, 1.0) * size.height as f64).round() as i32 - (pet_size as f64 * 0.78) as i32;
    window
        .set_position(PhysicalPosition::new(px, py))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn start_pet_drag(window: WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|error| error.to_string())
}

#[derive(Serialize, Deserialize)]
struct NormalizedPosition {
    x: f64,
    y: f64,
}

#[tauri::command]
fn current_pet_position(app: AppHandle, window: WebviewWindow) -> Result<NormalizedPosition, String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or(app.primary_monitor().map_err(|error| error.to_string())?)
        .ok_or_else(|| "no monitor available".to_string())?;
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let window_size = window.outer_size().map_err(|error| error.to_string())?;
    let monitor_size = monitor.size();
    let origin = monitor.position();
    Ok(NormalizedPosition {
        x: (((position.x - origin.x) as f64 + window_size.width as f64 / 2.0)
            / monitor_size.width as f64)
            .clamp(0.0, 1.0),
        y: (((position.y - origin.y) as f64 + window_size.height as f64 * 0.78)
            / monitor_size.height as f64)
            .clamp(0.0, 1.0),
    })
}

#[tauri::command]
fn show_control_center(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "control center window is missing".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            save_pet,
            load_pet,
            ensure_pet_window,
            hide_other_pet_windows,
            position_pet,
            start_pet_drag,
            current_pet_position,
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
