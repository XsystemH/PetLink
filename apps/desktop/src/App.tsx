import { useEffect, useRef, useState } from "react";
import {
  makeEnvelope,
  petIdFor,
  roomIdFor,
  type MemberSummary,
  type PetAction,
  type PetPackage,
  type PetState,
  type RoomAccess,
  type RoomSnapshot,
  type ServerMessage,
} from "@petlink/protocol";
import { PetPartsEditor } from "./components/PetPartsEditor";
import { fetchPet, joinSession, uploadPet, type Session } from "./lib/api";
import { createFallbackPet } from "./lib/fallback-pet";
import { createDefaultPartSources, generatePetFromParts } from "./lib/generate-pet";
import {
  hideAllNativePets,
  isTauri,
  listenForMainMessages,
  loadLocalPet,
  saveLocalPet,
  showControlCenter,
  syncNativePets,
  type PetWindowMessage,
} from "./lib/native";
import { RealtimeClient, type ConnectionStatus } from "./lib/realtime";

const defaultAccess: RoomAccess = { allowVisitsWhileOwnerAway: true, allowFriendDrag: false };
const defaultServer = "http://116.62.37.128";
const randomDelayBounds = { minimum: 3, maximum: 120 };

interface RandomTiming {
  minimum: number;
  maximum: number;
}

export function App() {
  const [serverUrl, setServerUrl] = useState(localStorage.getItem("petlink:server") ?? defaultServer);
  const [userId, setUserId] = useState(localStorage.getItem("petlink:user") ?? "");
  const [displayName, setDisplayName] = useState(localStorage.getItem("petlink:name") ?? "");
  const [accessCode, setAccessCode] = useState(localStorage.getItem("petlink:code") ?? "");
  const [session, setSession] = useState<Session | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("offline");
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [packages, setPackages] = useState<Record<string, PetPackage>>({});
  const [draftPet, setDraftPet] = useState<PetPackage | null>(null);
  const [partSources, setPartSources] = useState(createDefaultPartSources);
  const [petName, setPetName] = useState("我的桌宠");
  const [ownAccess, setOwnAccess] = useState<RoomAccess>(defaultAccess);
  const [randomBehavior, setRandomBehavior] = useState(localStorage.getItem("petlink:random") !== "false");
  const [randomTiming, setRandomTiming] = useState<RandomTiming>(loadRandomTiming);
  const [petScale, setPetScale] = useState(Number(localStorage.getItem("petlink:scale") ?? 1));
  const [connecting, setConnecting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("桌宠会直接显示在电脑桌面上；此窗口只用于设置。");
  const realtimeRef = useRef<RealtimeClient | null>(null);
  const revisionsRef = useRef(new Map<string, number>());
  const autoStartedRef = useRef(false);
  const roomRef = useRef<RoomSnapshot | null>(null);
  const noticeResetRef = useRef<number | null>(null);

  const activeUserId = session?.userId ?? (userId.trim().toLowerCase() || null);
  const self = members.find((member) => member.userId === activeUserId);
  const currentOwner = members.find((member) => member.roomId === self?.currentRoomId);
  const isHome = !self || self.currentRoomId === self.roomId;

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    const hasSavedLogin = Boolean(
      localStorage.getItem("petlink:user") &&
      localStorage.getItem("petlink:code") &&
      localStorage.getItem("petlink:server"),
    );
    if (hasSavedLogin) void connect(true);
    else void showControlCenter();
  }, []);

  async function connect(automatic = false) {
    const normalizedUserId = userId.trim().toLowerCase();
    if (!normalizedUserId || !accessCode.trim()) {
      setNotice("请填写用户名和邀请码。");
      if (automatic) await showControlCenter();
      return;
    }
    setConnecting(true);
    setConnectionStatus("connecting");
    try {
      const joined = await joinSession(serverUrl, normalizedUserId, displayName.trim() || normalizedUserId, accessCode.trim());
      localStorage.setItem("petlink:server", joined.serverUrl);
      localStorage.setItem("petlink:user", joined.userId);
      localStorage.setItem("petlink:name", joined.displayName);
      localStorage.setItem("petlink:code", accessCode.trim());
      setServerUrl(joined.serverUrl);
      setUserId(joined.userId);
      setDisplayName(joined.displayName);
      setSession(joined);

      const localPet = (await loadLocalPet(joined.userId)) ?? createFallbackPet(joined.userId, joined.displayName);
      setPackages((current) => ({ ...current, [joined.userId]: localPet }));
      setDraftPet(localPet);
      setPetName(localPet.name);

      realtimeRef.current?.close();
      const realtime = new RealtimeClient(joined);
      realtimeRef.current = realtime;
      realtime.onStatus(setConnectionStatus);
      realtime.onMessage((message) => handleServerMessage(message, joined));
      realtime.connect();
      setNotice("正在连接好友，桌宠会直接出现在桌面上……");
    } catch (error) {
      await startOffline(normalizedUserId, displayName.trim() || normalizedUserId);
      setNotice(`${errorMessage(error, "无法连接服务器")}；已进入本地模式，桌宠仍可正常使用。`);
      if (automatic) await showControlCenter();
    } finally {
      setConnecting(false);
    }
  }

  async function startOffline(localUserId: string, localName: string) {
    realtimeRef.current?.close();
    realtimeRef.current = null;
    setSession(null);
    setConnectionStatus("offline");
    const localPet = (await loadLocalPet(localUserId)) ?? createFallbackPet(localUserId, localName);
    setPackages({ [localUserId]: localPet });
    setDraftPet(localPet);
    setPetName(localPet.name);
    setMembers([]);
    setRoom(localRoom(localUserId, petScale));
  }

  function handleServerMessage(message: ServerMessage, joined: Session) {
    switch (message.type) {
      case "WELCOME":
        setMembers(message.members);
        setRoom(message.room);
        setPetScale(message.room.pets.find((pet) => pet.ownerUserId === joined.userId)?.scale ?? 1);
        if (message.room.ownerUserId === joined.userId) setOwnAccess(message.room.access);
        setNotice("联机成功。桌宠已显示在桌面上，关闭此窗口也不会退出。");
        break;
      case "ROOM_SNAPSHOT":
      case "VISIT_ACCEPTED":
        setRoom(message.room);
        break;
      case "MEMBERS_CHANGED":
        setMembers(message.members);
        break;
      case "NOTICE":
        setNotice(message.message);
        break;
      case "ERROR":
        if (message.code === "RATE_LIMITED") {
          setNotice("拖拽消息已自动限速，位置仍会在松手时准确同步。");
          if (noticeResetRef.current !== null) window.clearTimeout(noticeResetRef.current);
          noticeResetRef.current = window.setTimeout(() => {
            setNotice("联机正常。桌宠会直接显示在电脑桌面上。");
          }, 2_500);
        } else {
          setNotice(message.message);
        }
        break;
      case "PONG":
        break;
    }
  }

  useEffect(() => {
    if (!session || !room) return;
    let cancelled = false;
    void Promise.all(
      room.pets.map(async (petState) => {
        const member = members.find((item) => item.userId === petState.ownerUserId);
        const revision = member?.petRevision ?? 0;
        if (packages[petState.ownerUserId] && revisionsRef.current.get(petState.ownerUserId) === revision) return;
        const remote = await fetchPet(session, petState.ownerUserId).catch(() => null);
        if (cancelled) return;
        revisionsRef.current.set(petState.ownerUserId, revision);
        setPackages((current) => ({
          ...current,
          [petState.ownerUserId]: remote ?? current[petState.ownerUserId] ?? createFallbackPet(petState.ownerUserId, member?.displayName),
        }));
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [session, room, members, packages]);

  useEffect(() => {
    if (!room || !activeUserId) return;
    void syncNativePets(room, packages, activeUserId, randomBehavior, randomTiming.minimum, randomTiming.maximum).catch((error) => {
      setNotice(`桌宠窗口显示失败：${errorMessage(error, "未知错误")}`);
    });
  }, [room, packages, activeUserId, randomBehavior, randomTiming.minimum, randomTiming.maximum]);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    const listener = (message: PetWindowMessage) => {
      if (message.type === "open-settings") {
        void showControlCenter();
        return;
      }
      if (message.type === "native-error") {
        setNotice(`原生桌宠错误：${message.message}`);
        return;
      }
      if (!roomRef.current || !activeUserId) return;
      if (message.type === "drag-start") {
        sendOrApply({ type: "DRAG_BEGIN", petId: message.petId });
      } else if (message.type === "drag-move") {
        sendOrApply({ type: "DRAG_MOVE", petId: message.petId, position: message.position });
      } else if (message.type === "drag-end") {
        sendOrApply({ type: "DRAG_END", petId: message.petId, position: message.position });
      } else if (message.type === "interact") {
        sendOrApply({ type: "INTERACT", petId: message.petId });
      } else if (message.type === "move-to") {
        sendOrApply({ type: "MOVE_TO", position: message.position });
      } else if (message.type === "set-action") {
        runAction(message.action);
      }
    };
    void listenForMainMessages(listener).then((unlisten) => {
      if (cancelled) unlisten();
      else dispose = unlisten;
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [activeUserId]);

  useEffect(() => {
    if (isTauri() || !randomBehavior || !activeUserId) return;
    let timer: number | undefined;
    const schedule = () => {
      const delaySeconds = randomTiming.minimum + Math.random() * (randomTiming.maximum - randomTiming.minimum);
      timer = window.setTimeout(run, delaySeconds * 1_000);
    };
    const run = () => {
      const ownPet = roomRef.current?.pets.find((pet) => pet.ownerUserId === activeUserId);
      if (!ownPet || ownPet.action === "dragged") {
        schedule();
        return;
      }
      if (ownPet.action === "sleep") {
        sendOrApply({ type: "SET_ACTION", action: "idle" });
        schedule();
        return;
      }
      const roll = Math.random();
      if (roll < 0.68) moveSomewhere();
      else if (roll < 0.82) sendOrApply({ type: "SET_ACTION", action: "idle" });
      else if (roll < 0.94) sendOrApply({ type: "SET_ACTION", action: "interact" });
      else sendOrApply({ type: "SET_ACTION", action: "sleep" });
      schedule();
    };
    schedule();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [randomBehavior, activeUserId, randomTiming.minimum, randomTiming.maximum]);

  useEffect(() => () => {
    realtimeRef.current?.close();
    if (noticeResetRef.current !== null) window.clearTimeout(noticeResetRef.current);
  }, []);

  function command(payload: Record<string, unknown>) {
    return realtimeRef.current?.send({ ...makeEnvelope(), ...payload } as never) ?? false;
  }

  function sendOrApply(payload: Record<string, unknown>) {
    if (command(payload)) return;
    if (!activeUserId) return;
    setRoom((current) => current ? applyLocalCommand(current, activeUserId, payload) : current);
  }

  function moveSomewhere() {
    sendOrApply({
      type: "MOVE_TO",
      position: { x: 0.08 + Math.random() * 0.84, y: 0.86 + Math.random() * 0.07 },
    });
  }

  function runAction(action: "idle" | "move" | "interact" | "sleep") {
    if (action === "move") moveSomewhere();
    else sendOrApply({ type: "SET_ACTION", action });
  }

  async function generate() {
    if (!activeUserId) {
      setNotice("请先登录后再生成桌宠。");
      return;
    }
    setGenerating(true);
    try {
      const generated = await generatePetFromParts(partSources, activeUserId, petName);
      await saveLocalPet(activeUserId, generated);
      setDraftPet(generated);
      setPackages((current) => ({ ...current, [activeUserId]: generated }));
      if (session) {
        const revision = await uploadPet(session, generated);
        revisionsRef.current.set(activeUserId, revision);
        setNotice("生成成功：新桌宠已立即应用到桌面，并同步给好友。右键桌宠可选择动作。");
      } else {
        setNotice("生成成功：新桌宠已立即应用到桌面。本地模式不会上传素材。");
      }
    } catch (error) {
      setNotice(errorMessage(error, "桌宠生成失败"));
    } finally {
      setGenerating(false);
    }
  }

  function updateAccess(next: RoomAccess) {
    setOwnAccess(next);
    command({ type: "SET_ROOM_ACCESS", access: next });
  }

  function updateScale(next: number) {
    setPetScale(next);
    localStorage.setItem("petlink:scale", String(next));
    sendOrApply({ type: "SET_SCALE", scale: next });
  }

  function setRandom(next: boolean) {
    setRandomBehavior(next);
    localStorage.setItem("petlink:random", String(next));
  }

  function setRandomMinimum(next: number) {
    setRandomTiming((current) => saveRandomTiming({
      minimum: clampRandomDelay(next),
      maximum: Math.max(current.maximum, clampRandomDelay(next)),
    }));
  }

  function setRandomMaximum(next: number) {
    setRandomTiming((current) => saveRandomTiming({
      minimum: Math.min(current.minimum, clampRandomDelay(next)),
      maximum: clampRandomDelay(next),
    }));
  }

  async function signOut() {
    realtimeRef.current?.close();
    realtimeRef.current = null;
    setSession(null);
    setConnectionStatus("offline");
    setMembers([]);
    setRoom(null);
    localStorage.removeItem("petlink:code");
    setAccessCode("");
    await hideAllNativePets();
    setNotice("已退出。登录后桌宠会重新出现在电脑桌面上。");
  }

  const locationText = connectionStatus === "online"
    ? isHome ? "在自己的桌面" : `正在访问 ${currentOwner ? memberDisplayName(currentOwner) : "好友"} 的桌面`
    : "本地模式";

  return (
    <main className="settings-shell">
      <header className="titlebar" data-tauri-drag-region>
        <div data-tauri-drag-region>
          <span className="app-mark">P</span>
          <div data-tauri-drag-region><strong>PetLink</strong><small>桌宠设置</small></div>
        </div>
        <span className={`status-dot ${connectionStatus}`}>{connectionStatus === "online" ? "好友在线" : connectionStatus === "reconnecting" ? "正在重连" : connectionStatus === "connecting" ? "正在连接" : "本地可用"}</span>
      </header>

      <div className="notice" aria-live="polite">{notice}</div>

      {!session && connectionStatus !== "offline" ? null : !activeUserId || !localStorage.getItem("petlink:code") ? (
        <section className="card login-card">
          <SectionTitle number="1" title="连接你的桌宠" description="首次填写一次，之后启动时会自动连接并直接显示桌宠。" />
          <div className="form-grid">
            <label>服务器地址<input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} /></label>
            <label>用户名<input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="例如 piaozy" /></label>
            <label>显示名称<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如 PiaoZY" /></label>
            <label>邀请码<input type="password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} /></label>
          </div>
          <button className="primary" disabled={connecting} onClick={() => void connect()}>{connecting ? "连接中……" : "登录并显示桌宠"}</button>
        </section>
      ) : (
        <div className="content-grid">
          <div className="main-column">
            <section className="card pet-controls">
              <SectionTitle number="1" title="桌宠控制" description={`${draftPet?.name ?? "桌宠"} · ${locationText}`} />
              <div className="action-row">
                <button onClick={() => runAction("idle")}>待机</button>
                <button onClick={() => runAction("move")}>走动</button>
                <button onClick={() => runAction("interact")}>互动</button>
                <button onClick={() => runAction("sleep")}>睡觉</button>
              </div>
              <label className="range-row">
                <span><strong>桌宠大小</strong><small>{Math.round(petScale * 100)}%</small></span>
                <input type="range" min="0.5" max="2" step="0.1" value={petScale} onChange={(event) => updateScale(Number(event.target.value))} />
              </label>
              <Toggle label="随机游走" description="桌宠会在桌面底部走动、待机和偶尔休息。" checked={randomBehavior} onChange={setRandom} />
              <div className={`random-timing${randomBehavior ? "" : " disabled"}`}>
                <span><strong>行为触发间隔</strong><small>保持当前状态后随机等待</small></span>
                <label>最短<input aria-label="随机行为最短等待秒数" type="number" min={randomDelayBounds.minimum} max={randomDelayBounds.maximum} step="1" disabled={!randomBehavior} value={randomTiming.minimum} onChange={(event) => setRandomMinimum(Number(event.target.value))} /> 秒</label>
                <label>最长<input aria-label="随机行为最长等待秒数" type="number" min={randomDelayBounds.minimum} max={randomDelayBounds.maximum} step="1" disabled={!randomBehavior} value={randomTiming.maximum} onChange={(event) => setRandomMaximum(Number(event.target.value))} /> 秒</label>
              </div>
            </section>

            <section className="card generator-card">
              <SectionTitle number="2" title="组合骨骼桌宠" description="头、躯干、双耳和四肢分别使用照片或纯色，并绑定同一套固定骨骼。" />
              <PetPartsEditor value={partSources} onChange={setPartSources} />
              <div className="generator-fields">
                <label>桌宠名称<input value={petName} maxLength={40} onChange={(event) => setPetName(event.target.value)} /></label>
                <button className="reset-parts" type="button" onClick={() => { setPartSources(createDefaultPartSources()); setPetName("我的桌宠"); }}>恢复初始桌宠</button>
              </div>
              <button className="primary" disabled={generating} onClick={() => void generate()}>{generating ? "正在生成……" : "生成并应用到桌面"}</button>
            </section>
          </div>

          <aside className="side-column">
            <section className="card friends-card">
              <SectionTitle number="3" title="好友串门" description="串门后，大家的桌宠会直接出现在同一桌面坐标中。" />
              {connectionStatus !== "online" ? (
                <p className="empty-copy">当前是本地模式，恢复连接后才能串门。</p>
              ) : (
                <div className="friend-list">
                  {members.filter((member) => member.userId !== activeUserId).map((member) => {
                    const visiting = self?.currentRoomId === member.roomId;
                    const friendName = memberDisplayName(member);
                    return (
                      <article className="friend" key={member.userId}>
                        <span className="avatar">{friendName.slice(0, 1).toUpperCase()}</span>
                        <span><strong>{friendName}</strong><small>{member.online ? member.reconnecting ? "重连中" : "在线" : "离线"}</small></span>
                        <button disabled={!member.online || member.reconnecting || visiting} onClick={() => command({ type: "VISIT_REQUEST", targetRoomId: member.roomId })}>{visiting ? "正在串门" : "去串门"}</button>
                      </article>
                    );
                  })}
                  {!isHome && <button className="return-home" onClick={() => command({ type: "RETURN_HOME" })}>返回自己的桌面</button>}
                </div>
              )}
            </section>

            <section className="card access-card">
              <SectionTitle number="4" title="访问权限" description="只控制朋友能否访问你的桌面状态。" />
              <Toggle label="我外出时仍允许串门" description="你正在别人桌面串门时，朋友仍可进入你的桌面。" checked={ownAccess.allowVisitsWhileOwnerAway} onChange={(value) => updateAccess({ ...ownAccess, allowVisitsWhileOwnerAway: value })} />
              <Toggle label="允许朋友拖动我的桌宠" description="关闭时，只有你自己可以拖动它。" checked={ownAccess.allowFriendDrag} onChange={(value) => updateAccess({ ...ownAccess, allowFriendDrag: value })} />
            </section>

            <section className="card account-card">
              <strong>{displayName || userId}</strong>
              <small>{serverUrl}</small>
              <button onClick={() => void signOut()}>退出登录</button>
            </section>
          </aside>
        </div>
      )}
      <footer>关闭设置窗口不会退出 PetLink；可通过系统托盘或右键桌宠再次打开。</footer>
    </main>
  );
}

function SectionTitle({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="section-title"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></div>;
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span><strong>{label}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i />
    </label>
  );
}

function localRoom(userId: string, scale: number): RoomSnapshot {
  const now = Date.now();
  return {
    roomId: roomIdFor(userId),
    ownerUserId: userId,
    ownerOnline: false,
    ownerPresent: true,
    temporarilyClosed: false,
    access: defaultAccess,
    pets: [{
      petId: petIdFor(userId),
      ownerUserId: userId,
      currentRoomId: roomIdFor(userId),
      position: { x: 0.5, y: 0.9 },
      direction: "right",
      action: "idle",
      actionStartedAt: now,
      scale,
      revision: 0,
    }],
    sequence: 0,
    serverTime: now,
  };
}

function applyLocalCommand(room: RoomSnapshot, userId: string, command: Record<string, unknown>): RoomSnapshot {
  const ownPetId = petIdFor(userId);
  const now = Date.now();
  const pets = room.pets.map((pet): PetState => {
    if (pet.petId !== ownPetId) return pet;
    switch (command.type) {
      case "MOVE_TO": {
        const position = command.position as { x: number; y: number };
        return { ...pet, position, target: position, direction: position.x < pet.position.x ? "left" : "right", action: "move", actionStartedAt: now, revision: pet.revision + 1 };
      }
      case "SET_ACTION":
        return { ...pet, action: command.action as PetAction, target: undefined, actionStartedAt: now, revision: pet.revision + 1 };
      case "SET_SCALE":
        return { ...pet, scale: Number(command.scale), revision: pet.revision + 1 };
      case "DRAG_BEGIN":
        return { ...pet, action: "dragged", actionStartedAt: now, revision: pet.revision + 1 };
      case "DRAG_MOVE":
        return { ...pet, position: command.position as { x: number; y: number }, target: undefined, action: "dragged", revision: pet.revision + 1 };
      case "DRAG_END":
        return {
          ...pet,
          position: command.position as { x: number; y: number },
          target: undefined,
          action: "idle",
          actionStartedAt: now,
          revision: pet.revision + 1,
        };
      case "INTERACT":
        return { ...pet, action: "interact", actionStartedAt: now, revision: pet.revision + 1 };
      default:
        return pet;
    }
  });
  return { ...room, pets, sequence: room.sequence + 1, serverTime: now };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function clampRandomDelay(value: number) {
  const rounded = Math.round(Number.isFinite(value) ? value : randomDelayBounds.minimum);
  return Math.min(randomDelayBounds.maximum, Math.max(randomDelayBounds.minimum, rounded));
}

function loadRandomTiming(): RandomTiming {
  const storedMinimum = clampRandomDelay(Number(localStorage.getItem("petlink:random-min-seconds") ?? 8));
  const storedMaximum = clampRandomDelay(Number(localStorage.getItem("petlink:random-max-seconds") ?? 18));
  return {
    minimum: Math.min(storedMinimum, storedMaximum),
    maximum: Math.max(storedMinimum, storedMaximum),
  };
}

function saveRandomTiming(timing: RandomTiming) {
  localStorage.setItem("petlink:random-min-seconds", String(timing.minimum));
  localStorage.setItem("petlink:random-max-seconds", String(timing.maximum));
  return timing;
}

function memberDisplayName(member: MemberSummary) {
  if (!/^好友\s*\d+$/u.test(member.displayName)) return member.displayName;
  const configuredNames: Record<string, string> = {
    susu: "Susu",
    piaozy: "PiaoZY",
    chuang: "Chuang",
    ncy: "NCY",
    fjw: "FJW",
  };
  return configuredNames[member.userId] ?? member.userId;
}
