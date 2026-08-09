import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import {
  clientMessageSchema,
  makeEnvelope,
  petPackageSchema,
  roomAccessSchema,
  roomIdFor,
  userIdSchema,
  type ServerMessage,
} from "@petlink/protocol";
import { WebSocket, WebSocketServer } from "ws";
import { bearerToken, issueToken, verifyToken } from "./auth.js";
import { loadConfig } from "./config.js";
import { RoomStateManager, StateError } from "./room-state.js";
import { FileStore } from "./store.js";

const config = loadConfig();
const store = new FileStore(config.dataDir);
await store.initialize();
const state = new RoomStateManager(config.userIds, await store.loadState());

const sockets = new Map<string, { id: string; socket: WebSocket; messageTimes: number[] }>();
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const joinAttempts = new Map<string, number[]>();
const pendingDisplayNames = new Map<string, string>();

function json(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function allowedOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;
  if (!origin) return "*";
  return config.origins.has(origin) ? origin : "null";
}

function setCors(request: IncomingMessage, response: ServerResponse) {
  response.setHeader("access-control-allow-origin", allowedOrigin(request));
  response.setHeader("access-control-allow-headers", "authorization, content-type");
  response.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,OPTIONS");
  response.setHeader("vary", "Origin");
}

async function parseJson(request: IncomingMessage, maxBytes = 256 * 1024) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "请求内容过大");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "INVALID_JSON", "请求不是有效的 JSON");
  }
}

function authenticatedUser(request: IncomingMessage) {
  const payload = verifyToken(bearerToken(request.headers.authorization), config.tokenSecret);
  if (!payload || !state.hasUser(payload.sub)) {
    throw new HttpError(401, "UNAUTHORIZED", "登录信息无效或已经过期");
  }
  return payload.sub;
}

const server = createServer(async (request, response) => {
  setCors(request, response);
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  try {
    const url = new URL(request.url ?? "/", config.publicUrl);
    if (request.method === "GET" && url.pathname === "/health") {
      json(response, 200, { ok: true, users: state.members().length, now: Date.now() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/session/join") {
      const remoteAddress = request.socket.remoteAddress ?? "unknown";
      const now = Date.now();
      const attempts = (joinAttempts.get(remoteAddress) ?? []).filter((time) => now - time < 60_000);
      attempts.push(now);
      joinAttempts.set(remoteAddress, attempts);
      if (attempts.length > 10) throw new HttpError(429, "RATE_LIMITED", "登录尝试过于频繁，请稍后再试");
      const body = (await parseJson(request)) as Record<string, unknown>;
      const userId = userIdSchema.parse(body.userId);
      const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 40) : undefined;
      if (!state.hasUser(userId) || body.accessCode !== config.userAccessCodes.get(userId)) {
        throw new HttpError(403, "JOIN_DENIED", "用户或访问码不正确");
      }
      if (displayName) pendingDisplayNames.set(userId, displayName);
      json(response, 200, {
        token: issueToken(userId, config.tokenSecret),
        userId,
        displayName: displayName || state.members().find((member) => member.userId === userId)?.displayName,
        wsUrl: config.publicUrl.replace(/^http/, "ws") + "/realtime",
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/members") {
      authenticatedUser(request);
      json(response, 200, { members: state.members() });
      return;
    }

    const roomMatch = url.pathname.match(/^\/api\/rooms\/(room-[a-z0-9-]+)$/);
    if (request.method === "GET" && roomMatch?.[1]) {
      authenticatedUser(request);
      json(response, 200, { room: state.snapshot(roomMatch[1]) });
      return;
    }

    if (request.method === "PATCH" && url.pathname === "/api/rooms/me/access") {
      const userId = authenticatedUser(request);
      const access = roomAccessSchema.parse(await parseJson(request));
      state.setAccess(userId, access);
      await store.saveState(state.persisted());
      broadcastMembers();
      broadcastRoom(roomIdFor(userId));
      json(response, 200, { room: state.snapshot(roomIdFor(userId)) });
      return;
    }

    if (request.method === "PUT" && url.pathname === "/api/pets/me") {
      const userId = authenticatedUser(request);
      const petPackage = petPackageSchema.parse(await parseJson(request, 25 * 1024 * 1024));
      if (petPackage.petId !== `pet-${userId}`) {
        throw new HttpError(400, "PET_OWNER_MISMATCH", "桌宠包与当前用户不匹配");
      }
      const revision = Date.now();
      await store.savePet(userId, petPackage);
      state.setPetRevision(userId, revision);
      await store.saveState(state.persisted());
      broadcastMembers();
      json(response, 200, { ok: true, revision });
      return;
    }

    const petMatch = url.pathname.match(/^\/api\/pets\/([a-z0-9-]+)$/);
    if (request.method === "GET" && petMatch?.[1]) {
      authenticatedUser(request);
      if (!state.hasUser(petMatch[1])) throw new HttpError(404, "UNKNOWN_USER", "用户不存在");
      const petPackage = await store.loadPet(petMatch[1]);
      if (!petPackage) throw new HttpError(404, "PET_NOT_GENERATED", "该用户尚未生成桌宠");
      json(response, 200, { pet: petPackage });
      return;
    }

    throw new HttpError(404, "NOT_FOUND", "接口不存在");
  } catch (error) {
    if (error instanceof HttpError) {
      json(response, error.status, { error: error.code, message: error.message });
    } else if (error instanceof StateError) {
      json(response, 400, { error: error.code, message: error.message });
    } else {
      console.error(error);
      json(response, 500, { error: "INTERNAL_ERROR", message: "服务器内部错误" });
    }
  }
});

const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", config.publicUrl);
  if (url.pathname !== "/realtime") {
    socket.destroy();
    return;
  }
  const payload = verifyToken(url.searchParams.get("token") ?? undefined, config.tokenSecret);
  if (!payload || !state.hasUser(payload.sub)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  websocketServer.handleUpgrade(request, socket, head, (ws) => {
    websocketServer.emit("connection", ws, payload.sub);
  });
});

websocketServer.on("connection", (socket: WebSocket, userId: string) => {
  const connectionId = randomUUID();
  const old = sockets.get(userId);
  if (old) old.socket.close(4001, "Replaced by a newer connection");
  sockets.set(userId, { id: connectionId, socket, messageTimes: [] });
  const timer = disconnectTimers.get(userId);
  if (timer) clearTimeout(timer);
  disconnectTimers.delete(userId);

  const member = state.members().find((item) => item.userId === userId);
  const room = state.connect(userId, pendingDisplayNames.get(userId) ?? member?.displayName);
  pendingDisplayNames.delete(userId);
  void store.saveState(state.persisted());
  send(socket, {
    ...makeEnvelope(),
    type: "WELCOME",
    self: state.members().find((item) => item.userId === userId)!,
    members: state.members(),
    room,
  });
  broadcastMembers();
  broadcastRoom(room.roomId);

  socket.on("message", (data) => {
    const connection = sockets.get(userId);
    if (!connection || connection.id !== connectionId) return;
    const now = Date.now();
    connection.messageTimes = connection.messageTimes.filter((time) => now - time < 1_000);
    connection.messageTimes.push(now);
    if (connection.messageTimes.length > 60) {
      sendError(socket, "RATE_LIMITED", "操作过于频繁");
      return;
    }

    try {
      const message = clientMessageSchema.parse(JSON.parse(data.toString()));
      const affected = new Set<string>();
      switch (message.type) {
        case "SUBSCRIBE": {
          const currentRoomId = state.members().find((item) => item.userId === userId)!.currentRoomId;
          send(socket, { ...makeEnvelope(), type: "ROOM_SNAPSHOT", room: state.snapshot(currentRoomId) });
          break;
        }
        case "MOVE_TO":
          affected.add(state.moveTo(userId, message.position));
          break;
        case "SET_ACTION":
          affected.add(state.setAction(userId, message.action));
          break;
        case "SET_SCALE":
          affected.add(state.setScale(userId, message.scale));
          break;
        case "DRAG_BEGIN":
          affected.add(state.beginDrag(userId, message.petId));
          break;
        case "DRAG_MOVE":
          affected.add(state.dragMove(userId, message.petId, message.position));
          break;
        case "DRAG_END":
          affected.add(state.endDrag(userId, message.petId));
          break;
        case "INTERACT":
          affected.add(state.interact(userId, message.petId));
          break;
        case "VISIT_REQUEST": {
          const result = state.visit(userId, message.targetRoomId);
          result.affected.forEach((roomId) => affected.add(roomId));
          send(socket, { ...makeEnvelope(), type: "VISIT_ACCEPTED", room: result.snapshot });
          broadcastMembers();
          break;
        }
        case "RETURN_HOME": {
          const result = state.returnHome(userId);
          result.affected.forEach((roomId) => affected.add(roomId));
          send(socket, { ...makeEnvelope(), type: "VISIT_ACCEPTED", room: result.snapshot });
          broadcastMembers();
          break;
        }
        case "SET_ROOM_ACCESS":
          affected.add(state.setAccess(userId, message.access));
          void store.saveState(state.persisted());
          broadcastMembers();
          break;
        case "PING":
          send(socket, { ...makeEnvelope(), type: "PONG" });
          break;
      }
      affected.forEach(broadcastRoom);
    } catch (error) {
      if (error instanceof StateError) sendError(socket, error.code, error.message);
      else sendError(socket, "INVALID_MESSAGE", "消息格式不正确");
    }
  });

  socket.on("close", () => {
    if (sockets.get(userId)?.id !== connectionId) return;
    sockets.delete(userId);
    const affected = state.markReconnecting(userId);
    affected.forEach(broadcastRoom);
    broadcastMembers();
    const timeout = setTimeout(() => {
      disconnectTimers.delete(userId);
      state.disconnect(userId).forEach(broadcastRoom);
      broadcastMembers();
    }, config.reconnectGraceMs);
    disconnectTimers.set(userId, timeout);
  });
});

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function sendError(socket: WebSocket, code: string, message: string) {
  send(socket, { ...makeEnvelope(), type: "ERROR", code, message });
}

function broadcastMembers() {
  const message: ServerMessage = { ...makeEnvelope(), type: "MEMBERS_CHANGED", members: state.members() };
  for (const { socket } of sockets.values()) send(socket, message);
}

function broadcastRoom(roomId: string) {
  const message: ServerMessage = { ...makeEnvelope(), type: "ROOM_SNAPSHOT", room: state.snapshot(roomId) };
  for (const [userId, { socket }] of sockets.entries()) {
    const member = state.members().find((item) => item.userId === userId);
    if (member?.currentRoomId === roomId) send(socket, message);
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

server.listen(config.port, config.host, () => {
  console.log(`PetLink server listening at ${config.publicUrl}`);
  console.log(`Configured users: ${config.userIds.join(", ")}`);
});

function shutdown() {
  for (const timer of disconnectTimers.values()) clearTimeout(timer);
  websocketServer.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
