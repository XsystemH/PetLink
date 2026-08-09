import { useEffect, useMemo, useRef, useState } from "react";
import {
  makeEnvelope,
  petIdFor,
  roomIdFor,
  type MemberSummary,
  type PetPackage,
  type RoomAccess,
  type RoomSnapshot,
  type ServerMessage,
} from "@petlink/protocol";
import { RigCanvas } from "./components/RigCanvas";
import { fetchPet, joinSession, uploadPet, type Session } from "./lib/api";
import { createFallbackPet } from "./lib/fallback-pet";
import { generatePetFromImage } from "./lib/generate-pet";
import {
  loadLocalPet,
  petChannel,
  saveLocalPet,
  syncNativePets,
  type PetWindowMessage,
} from "./lib/native";
import { RealtimeClient } from "./lib/realtime";

const defaultAccess: RoomAccess = { allowVisitsWhileOwnerAway: true, allowFriendDrag: false };

export function App() {
  const [serverUrl, setServerUrl] = useState(localStorage.getItem("petlink:server") ?? "http://127.0.0.1:8787");
  const [userId, setUserId] = useState(localStorage.getItem("petlink:user") ?? "alice");
  const [displayName, setDisplayName] = useState(localStorage.getItem("petlink:name") ?? "Alice");
  const [accessCode, setAccessCode] = useState("petlink-dev");
  const [session, setSession] = useState<Session | null>(null);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [packages, setPackages] = useState<Record<string, PetPackage>>({});
  const [draftPet, setDraftPet] = useState<PetPackage | null>(null);
  const [petName, setPetName] = useState("我的桌宠");
  const [ownAccess, setOwnAccess] = useState<RoomAccess>(defaultAccess);
  const [randomBehavior, setRandomBehavior] = useState(true);
  const [petScale, setPetScale] = useState(1);
  const [connecting, setConnecting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("先连接服务器，再上传一张角色图片。");
  const realtimeRef = useRef<RealtimeClient | null>(null);
  const revisionsRef = useRef(new Map<string, number>());

  const self = members.find((member) => member.userId === session?.userId);
  const currentRoomOwner = members.find((member) => member.userId === room?.ownerUserId);

  async function connect() {
    setConnecting(true);
    try {
      const joined = await joinSession(serverUrl, userId.trim().toLowerCase(), displayName.trim(), accessCode);
      localStorage.setItem("petlink:server", joined.serverUrl);
      localStorage.setItem("petlink:user", joined.userId);
      localStorage.setItem("petlink:name", joined.displayName);
      realtimeRef.current?.close();
      const realtime = new RealtimeClient(joined);
      realtimeRef.current = realtime;
      realtime.onMessage((message) => handleServerMessage(message, joined));
      setSession(joined);
      const localPet = (await loadLocalPet(joined.userId)) ?? createFallbackPet(joined.userId, joined.displayName);
      setPackages((current) => ({ ...current, [joined.userId]: localPet }));
      setDraftPet(localPet);
      realtime.connect();
      setNotice("正在进入你的房间……");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "连接失败");
    } finally {
      setConnecting(false);
    }
  }

  function handleServerMessage(message: ServerMessage, joined: Session) {
    switch (message.type) {
      case "WELCOME":
        setMembers(message.members);
        setRoom(message.room);
        setPetScale(message.room.pets.find((pet) => pet.ownerUserId === joined.userId)?.scale ?? 1);
        if (message.room.ownerUserId === joined.userId) setOwnAccess(message.room.access);
        setNotice(`已进入 ${message.room.ownerUserId} 的房间`);
        break;
      case "ROOM_SNAPSHOT":
        setRoom(message.room);
        break;
      case "VISIT_ACCEPTED":
        setRoom(message.room);
        setNotice(`已进入 ${message.room.ownerUserId} 的房间`);
        break;
      case "MEMBERS_CHANGED":
        setMembers(message.members);
        break;
      case "NOTICE":
      case "ERROR":
        setNotice(message.message);
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
        if (!cancelled) {
          revisionsRef.current.set(petState.ownerUserId, revision);
          setPackages((current) => ({
            ...current,
            [petState.ownerUserId]: remote ?? current[petState.ownerUserId] ?? createFallbackPet(petState.ownerUserId, member?.displayName),
          }));
        }
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [session, room, members, packages]);

  useEffect(() => {
    if (!session || !room) return;
    void syncNativePets(room, packages, session.userId);
  }, [session, room, packages]);

  useEffect(() => {
    const listener = (event: MessageEvent<PetWindowMessage>) => {
      const message = event.data;
      if (!room || !session) return;
      if (message.type === "pet-ready") {
        const petState = room.pets.find((pet) => pet.petId === message.petId);
        if (!petState) return;
        const petPackage = packages[petState.ownerUserId];
        if (!petPackage) return;
        petChannel.postMessage({
          type: "pet-payload",
          petId: message.petId,
          selfUserId: session.userId,
          petPackage,
          state: petState,
        } satisfies PetWindowMessage);
      } else if (message.type === "drag-start") {
        command({ type: "DRAG_BEGIN", petId: message.petId });
      } else if (message.type === "drag-move") {
        command({ type: "DRAG_MOVE", petId: message.petId, position: message.position });
      } else if (message.type === "drag-end") {
        command({ type: "DRAG_MOVE", petId: message.petId, position: message.position });
        command({ type: "DRAG_END", petId: message.petId });
      } else if (message.type === "interact") {
        command({ type: "INTERACT", petId: message.petId });
      } else if (message.type === "set-action") {
        command({ type: "SET_ACTION", action: message.action });
      }
    };
    petChannel.addEventListener("message", listener);
    return () => petChannel.removeEventListener("message", listener);
  }, [room, session, packages]);

  useEffect(() => {
    if (!randomBehavior || !session) return;
    const timer = window.setInterval(() => {
      const ownPet = room?.pets.find((pet) => pet.ownerUserId === session.userId);
      if (!ownPet || ownPet.action === "dragged" || ownPet.action === "visiting") return;
      const roll = Math.random();
      if (roll < 0.68) {
        command({
          type: "MOVE_TO",
          position: { x: 0.08 + Math.random() * 0.84, y: 0.76 + Math.random() * 0.12 },
        });
      } else if (roll < 0.9) command({ type: "SET_ACTION", action: "idle" });
      else command({ type: "SET_ACTION", action: "sleep" });
    }, 7_500);
    return () => window.clearInterval(timer);
  }, [randomBehavior, room, session]);

  useEffect(() => () => realtimeRef.current?.close(), []);

  function command(payload: Record<string, unknown>) {
    realtimeRef.current?.send({ ...makeEnvelope(), ...payload } as never);
  }

  async function generate(file: File) {
    if (!session) {
      setNotice("请先连接服务器并选择自己的用户身份");
      return;
    }
    setGenerating(true);
    try {
      const generated = await generatePetFromImage(file, session.userId, petName);
      await saveLocalPet(session.userId, generated);
      setDraftPet(generated);
      setPackages((current) => ({ ...current, [session.userId]: generated }));
      setNotice("桌宠已生成并保存在本机，可以预览后发布给好友");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "图片生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function publish() {
    if (!session || !draftPet) return;
    try {
      const revision = await uploadPet(session, draftPet);
      revisionsRef.current.set(session.userId, revision);
      setNotice("桌宠素材已发布，房间里的好友会自动更新");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "发布失败");
    }
  }

  function updateAccess(next: RoomAccess) {
    setOwnAccess(next);
    command({ type: "SET_ROOM_ACCESS", access: next });
  }

  const roomTitle = currentRoomOwner ? `${currentRoomOwner.displayName}的房间` : "尚未进入房间";

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <span className="eyebrow">PETLINK · 五人私享空间</span>
          <h1>让桌宠去朋友家串门</h1>
          <p>每个人拥有自己的房间；进入同一房间的人看到相同的桌宠、动作与相对位置。</p>
        </div>
        <div className={`connection-pill ${session ? "online" : ""}`}>
          <span />{session ? "已连接" : "未连接"}
        </div>
      </header>

      <section className="notice" aria-live="polite">{notice}</section>

      {!session ? (
        <section className="panel connect-panel">
          <div className="panel-heading"><span>01</span><div><h2>连接私人服务器</h2><p>使用服务器预先配置的五个身份之一。</p></div></div>
          <div className="form-grid">
            <label>服务器地址<input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} /></label>
            <label>用户 ID<input value={userId} onChange={(event) => setUserId(event.target.value)} /></label>
            <label>显示昵称<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
            <label>访问码<input type="password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} /></label>
          </div>
          <button className="primary" disabled={connecting} onClick={() => void connect()}>{connecting ? "连接中…" : "进入我的房间"}</button>
        </section>
      ) : (
        <>
          <section className="room-layout">
            <div className="panel stage-panel">
              <div className="panel-heading compact"><span>LIVE</span><div><h2>{roomTitle}</h2><p>{room?.pets.length ?? 0} / 5 只桌宠在这里</p></div></div>
              <RoomPreview room={room} packages={packages} onInteract={(petId) => command({ type: "INTERACT", petId })} />
              <div className="stage-actions">
                {self?.currentRoomId !== self?.roomId && <button onClick={() => command({ type: "RETURN_HOME" })}>返回我的房间</button>}
                <button onClick={() => command({ type: "SET_ACTION", action: "idle" })}>待机</button>
                <button onClick={() => command({ type: "SET_ACTION", action: "move" })}>走动</button>
                <button onClick={() => command({ type: "SET_ACTION", action: "interact" })}>互动</button>
                <button onClick={() => command({ type: "SET_ACTION", action: "sleep" })}>睡觉</button>
              </div>
            </div>

            <aside className="panel friends-panel">
              <div className="panel-heading compact"><span>02</span><div><h2>朋友的房间</h2><p>离线房间不能进入。</p></div></div>
              <div className="friend-list">
                {members.map((member) => {
                  const isHere = self?.currentRoomId === member.roomId;
                  const ownerAway = member.currentRoomId !== member.roomId;
                  return (
                    <article className="friend-card" key={member.userId}>
                      <div className="avatar">{member.displayName.slice(0, 1).toUpperCase()}</div>
                      <div><strong>{member.displayName}</strong><small>{member.online ? ownerAway ? "在线 · 外出" : "在线 · 在家" : "离线"}</small></div>
                      <button disabled={!member.online || isHere || member.reconnecting} onClick={() => command({ type: "VISIT_REQUEST", targetRoomId: member.roomId })}>{isHere ? "当前" : "串门"}</button>
                    </article>
                  );
                })}
              </div>
            </aside>
          </section>

          <section className="lower-grid">
            <div className="panel studio-panel">
              <div className="panel-heading"><span>03</span><div><h2>从图片生成桌宠</h2><p>自动拆成头部和身体两层，生成四个基础动作。</p></div></div>
              <div className="studio-content">
                <div className="upload-zone">
                  <input id="pet-image" type="file" accept="image/png,image/jpeg,image/webp" disabled={generating} onChange={(event) => { const file = event.target.files?.[0]; if (file) void generate(file); }} />
                  <label htmlFor="pet-image"><strong>{generating ? "正在生成…" : "选择角色图片"}</strong><span>PNG / JPEG / WebP · 最大 20 MB</span></label>
                  <input className="pet-name" value={petName} maxLength={40} onChange={(event) => setPetName(event.target.value)} aria-label="桌宠名称" />
                </div>
                <div className="pet-preview">
                  {draftPet ? <RigCanvas pet={draftPet} action="idle" actionStartedAt={0} /> : <div className="empty-pet">等待图片</div>}
                </div>
              </div>
              <button className="primary" disabled={!draftPet} onClick={() => void publish()}>发布给房间里的朋友</button>
            </div>

            <div className="panel settings-panel">
              <div className="panel-heading"><span>04</span><div><h2>房间和行为</h2><p>这些设置只影响你的房间和桌宠。</p></div></div>
              <SettingRow label="我外出时仍允许访客" description="你在线串门时，其他人仍能进入你的房间。" checked={ownAccess.allowVisitsWhileOwnerAway} onChange={(value) => updateAccess({ ...ownAccess, allowVisitsWhileOwnerAway: value })} />
              <SettingRow label="允许好友拖拽我的桌宠" description="默认只允许点击互动。" checked={ownAccess.allowFriendDrag} onChange={(value) => updateAccess({ ...ownAccess, allowFriendDrag: value })} />
              <SettingRow label="随机游走与休息" description="桌宠会偶尔移动、待机或睡觉。" checked={randomBehavior} onChange={setRandomBehavior} />
              <label className="range-row">
                <span><strong>桌宠大小</strong><small>{Math.round(petScale * 100)}%</small></span>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={petScale}
                  onChange={(event) => setPetScale(Number(event.target.value))}
                  onPointerUp={() => command({ type: "SET_SCALE", scale: petScale })}
                  onKeyUp={() => command({ type: "SET_SCALE", scale: petScale })}
                />
              </label>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function RoomPreview({ room, packages, onInteract }: { room: RoomSnapshot | null; packages: Record<string, PetPackage>; onInteract: (petId: string) => void }) {
  const pets = useMemo(() => room?.pets ?? [], [room]);
  return (
    <div className="room-preview">
      <div className="room-sky"><i /><i /><i /></div>
      <div className="room-floor" />
      {pets.map((state) => {
        const pet = packages[state.ownerUserId];
        if (!pet) return null;
        return (
          <button
            className="preview-pet"
            key={state.petId}
            style={{ left: `${state.position.x * 100}%`, top: `${state.position.y * 100}%`, transform: `translate(-50%, -78%) scale(${state.scale})` }}
            onDoubleClick={() => onInteract(state.petId)}
            title={`双击和 ${pet.name} 互动`}
          >
            <RigCanvas pet={pet} action={state.action} actionStartedAt={state.actionStartedAt} direction={state.direction} />
          </button>
        );
      })}
      {!pets.length && <div className="empty-room">房间里还没有桌宠</div>}
    </div>
  );
}

function SettingRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="setting-row">
      <span><strong>{label}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i />
    </label>
  );
}
