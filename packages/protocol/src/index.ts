import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;
export const MAX_USERS = 5;
export const MAX_PETS_PER_ROOM = 5;

export const userIdSchema = z.string().regex(/^[a-z0-9-]{1,32}$/);
export const roomIdSchema = z.string().regex(/^room-[a-z0-9-]{1,32}$/);
export const petIdSchema = z.string().regex(/^pet-[a-z0-9-]{1,32}$/);

export const normalizedPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const petActionSchema = z.enum([
  "idle",
  "move",
  "interact",
  "sleep",
  "dragged",
  "visiting",
]);

export type PetAction = z.infer<typeof petActionSchema>;

export const petStateSchema = z.object({
  petId: petIdSchema,
  ownerUserId: userIdSchema,
  currentRoomId: roomIdSchema,
  position: normalizedPointSchema,
  target: normalizedPointSchema.optional(),
  direction: z.enum(["left", "right"]),
  action: petActionSchema,
  actionStartedAt: z.number().int().nonnegative(),
  scale: z.number().min(0.5).max(2),
  revision: z.number().int().nonnegative(),
});

export type PetState = z.infer<typeof petStateSchema>;

export const roomAccessSchema = z.object({
  allowVisitsWhileOwnerAway: z.boolean(),
  allowFriendDrag: z.boolean(),
});

export type RoomAccess = z.infer<typeof roomAccessSchema>;

export const roomSnapshotSchema = z.object({
  roomId: roomIdSchema,
  ownerUserId: userIdSchema,
  ownerOnline: z.boolean(),
  ownerPresent: z.boolean(),
  temporarilyClosed: z.boolean(),
  access: roomAccessSchema,
  pets: z.array(petStateSchema).max(MAX_PETS_PER_ROOM),
  sequence: z.number().int().nonnegative(),
  serverTime: z.number().int().nonnegative(),
});

export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;

export const memberSummarySchema = z.object({
  userId: userIdSchema,
  displayName: z.string().min(1).max(40),
  roomId: roomIdSchema,
  currentRoomId: roomIdSchema,
  online: z.boolean(),
  reconnecting: z.boolean(),
  petRevision: z.number().int().nonnegative(),
});

export type MemberSummary = z.infer<typeof memberSummarySchema>;

const envelopeBase = {
  protocolVersion: z.literal(PROTOCOL_VERSION),
  messageId: z.string().min(8).max(80),
  timestamp: z.number().int().nonnegative(),
};

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ ...envelopeBase, type: z.literal("SUBSCRIBE") }),
  z.object({
    ...envelopeBase,
    type: z.literal("MOVE_TO"),
    position: normalizedPointSchema,
  }),
  z.object({
    ...envelopeBase,
    type: z.literal("SET_ACTION"),
    action: z.enum(["idle", "move", "interact", "sleep"]),
  }),
  z.object({
    ...envelopeBase,
    type: z.literal("SET_SCALE"),
    scale: z.number().min(0.5).max(2),
  }),
  z.object({ ...envelopeBase, type: z.literal("DRAG_BEGIN"), petId: petIdSchema }),
  z.object({
    ...envelopeBase,
    type: z.literal("DRAG_MOVE"),
    petId: petIdSchema,
    position: normalizedPointSchema,
  }),
  z.object({
    ...envelopeBase,
    type: z.literal("DRAG_END"),
    petId: petIdSchema,
    position: normalizedPointSchema,
  }),
  z.object({
    ...envelopeBase,
    type: z.literal("INTERACT"),
    petId: petIdSchema,
  }),
  z.object({
    ...envelopeBase,
    type: z.literal("VISIT_REQUEST"),
    targetRoomId: roomIdSchema,
  }),
  z.object({ ...envelopeBase, type: z.literal("RETURN_HOME") }),
  z.object({
    ...envelopeBase,
    type: z.literal("SET_ROOM_ACCESS"),
    access: roomAccessSchema,
  }),
  z.object({ ...envelopeBase, type: z.literal("PING") }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    ...envelopeBase,
    type: z.literal("WELCOME"),
    self: memberSummarySchema,
    members: z.array(memberSummarySchema).max(MAX_USERS),
    room: roomSnapshotSchema,
  }),
  z.object({
    ...envelopeBase,
    type: z.literal("ROOM_SNAPSHOT"),
    room: roomSnapshotSchema,
  }),
  z.object({
    ...envelopeBase,
    type: z.literal("MEMBERS_CHANGED"),
    members: z.array(memberSummarySchema).max(MAX_USERS),
  }),
  z.object({
    ...envelopeBase,
    type: z.literal("VISIT_ACCEPTED"),
    room: roomSnapshotSchema,
  }),
  z.object({
    ...envelopeBase,
    type: z.literal("NOTICE"),
    code: z.string().min(1).max(64),
    message: z.string().min(1).max(240),
  }),
  z.object({
    ...envelopeBase,
    type: z.literal("ERROR"),
    code: z.string().min(1).max(64),
    message: z.string().min(1).max(240),
  }),
  z.object({ ...envelopeBase, type: z.literal("PONG") }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

export const boneSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  parent: z.string().nullable(),
  pivotX: z.number().min(0).max(1),
  pivotY: z.number().min(0).max(1),
});

export const textureSlotSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  bone: z.string(),
  dataUrl: z.string().startsWith("data:image/").max(8_000_000),
  zIndex: z.number().int().min(-16).max(16),
});

export const keyframeSchema = z.object({
  at: z.number().min(0).max(1),
  x: z.number().min(-1).max(1).default(0),
  y: z.number().min(-1).max(1).default(0),
  rotation: z.number().min(-180).max(180).default(0),
  scaleX: z.number().min(0.25).max(2).default(1),
  scaleY: z.number().min(0.25).max(2).default(1),
});

export const animationSchema = z.object({
  durationMs: z.number().int().min(100).max(5000),
  loop: z.boolean(),
  tracks: z.record(z.array(keyframeSchema).min(1).max(30)),
});

export const petPackageSchema = z.object({
  formatVersion: z.literal(1),
  petId: petIdSchema,
  name: z.string().min(1).max(40),
  canvas: z.object({
    width: z.number().int().min(64).max(1024),
    height: z.number().int().min(64).max(1024),
  }),
  bones: z.array(boneSchema).min(3).max(10),
  slots: z.array(textureSlotSchema).min(2).max(10),
  animations: z.object({
    idle: animationSchema,
    move: animationSchema,
    interact: animationSchema,
    sleep: animationSchema,
  }),
  createdAt: z.number().int().nonnegative(),
  sourceName: z.string().max(120),
});

export type PetPackage = z.infer<typeof petPackageSchema>;

export function makeEnvelope() {
  const messageId = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return {
    protocolVersion: PROTOCOL_VERSION,
    messageId,
    timestamp: Date.now(),
  } as const;
}

export function roomIdFor(userId: string) {
  return `room-${userId}`;
}

export function petIdFor(userId: string) {
  return `pet-${userId}`;
}
