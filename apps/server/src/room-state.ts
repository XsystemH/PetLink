import {
  MAX_PETS_PER_ROOM,
  petIdFor,
  roomIdFor,
  type MemberSummary,
  type PetAction,
  type PetState,
  type RoomAccess,
  type RoomSnapshot,
} from "@petlink/protocol";
import type { PersistedState } from "./store.js";

interface UserState {
  userId: string;
  displayName: string;
  roomId: string;
  currentRoomId: string;
  online: boolean;
  reconnecting: boolean;
  petRevision: number;
  access: RoomAccess;
}

interface InternalRoom {
  roomId: string;
  ownerUserId: string;
  pets: Map<string, PetState>;
  sequence: number;
}

interface DragLock {
  userId: string;
  expiresAt: number;
}

export class RoomStateManager {
  private readonly users = new Map<string, UserState>();
  private readonly rooms = new Map<string, InternalRoom>();
  private readonly locks = new Map<string, DragLock>();

  constructor(userIds: string[], persisted: PersistedState = { users: {} }) {
    for (const [index, userId] of userIds.entries()) {
      const saved = persisted.users[userId];
      const roomId = roomIdFor(userId);
      this.users.set(userId, {
        userId,
        displayName: saved?.displayName ?? `好友 ${index + 1}`,
        roomId,
        currentRoomId: roomId,
        online: false,
        reconnecting: false,
        petRevision: saved?.petRevision ?? 0,
        access: saved?.access ?? {
          allowVisitsWhileOwnerAway: true,
          allowFriendDrag: false,
        },
      });
      this.rooms.set(roomId, { roomId, ownerUserId: userId, pets: new Map(), sequence: 0 });
    }
  }

  hasUser(userId: string) {
    return this.users.has(userId);
  }

  connect(userId: string, displayName?: string) {
    const user = this.requireUser(userId);
    if (displayName) user.displayName = displayName.slice(0, 40);
    user.online = true;
    user.reconnecting = false;
    const pet = this.findPet(petIdFor(userId));
    if (!pet) {
      user.currentRoomId = user.roomId;
      this.requireRoom(user.roomId).pets.set(petIdFor(userId), this.createPet(user));
      this.bump(user.roomId);
    }
    return this.snapshot(user.currentRoomId);
  }

  markReconnecting(userId: string) {
    const user = this.requireUser(userId);
    if (!user.online) return [];
    user.reconnecting = true;
    return [user.currentRoomId, user.roomId];
  }

  disconnect(userId: string) {
    const user = this.requireUser(userId);
    const affected = new Set<string>();
    user.online = false;
    user.reconnecting = false;

    const ownPet = this.findPet(petIdFor(userId));
    if (ownPet) {
      this.requireRoom(ownPet.currentRoomId).pets.delete(ownPet.petId);
      affected.add(ownPet.currentRoomId);
    }

    const home = this.requireRoom(user.roomId);
    for (const pet of [...home.pets.values()]) {
      if (pet.ownerUserId === userId) continue;
      home.pets.delete(pet.petId);
      const visitor = this.requireUser(pet.ownerUserId);
      visitor.currentRoomId = visitor.roomId;
      pet.currentRoomId = visitor.roomId;
      pet.position = { x: 0.5, y: 0.82 };
      pet.action = "visiting";
      pet.actionStartedAt = Date.now();
      this.requireRoom(visitor.roomId).pets.set(pet.petId, pet);
      affected.add(visitor.roomId);
    }
    user.currentRoomId = user.roomId;
    affected.add(user.roomId);
    for (const roomId of affected) this.bump(roomId);
    return [...affected];
  }

  visit(userId: string, targetRoomId: string, returningHome = false) {
    const user = this.requireUser(userId);
    const targetRoom = this.requireRoom(targetRoomId);
    const targetOwner = this.requireUser(targetRoom.ownerUserId);
    if (!targetOwner.online || targetOwner.reconnecting) {
      throw new StateError("ROOM_OFFLINE", "对方离线或正在重连，暂时不能串门");
    }
    const ownerAway = targetOwner.currentRoomId !== targetOwner.roomId;
    if (!returningHome && ownerAway && !targetOwner.access.allowVisitsWhileOwnerAway) {
      throw new StateError("OWNER_AWAY", "房主外出时关闭了准入");
    }
    const capacity = ownerAway && !returningHome ? MAX_PETS_PER_ROOM - 1 : MAX_PETS_PER_ROOM;
    if (targetRoom.pets.size >= capacity) {
      throw new StateError("ROOM_FULL", "目标房间已经满员");
    }
    if (user.currentRoomId === targetRoomId) {
      return { affected: [targetRoomId], snapshot: this.snapshot(targetRoomId) };
    }

    const pet = this.findPet(petIdFor(userId));
    if (!pet) throw new StateError("PET_OFFLINE", "桌宠尚未上线");
    const sourceRoomId = pet.currentRoomId;
    this.requireRoom(sourceRoomId).pets.delete(pet.petId);
    pet.currentRoomId = targetRoomId;
    pet.position = { x: 0.08, y: 0.82 };
    pet.target = undefined;
    pet.action = "visiting";
    pet.actionStartedAt = Date.now();
    pet.revision += 1;
    targetRoom.pets.set(pet.petId, pet);
    user.currentRoomId = targetRoomId;
    this.bump(sourceRoomId);
    this.bump(targetRoomId);
    return { affected: [sourceRoomId, targetRoomId], snapshot: this.snapshot(targetRoomId) };
  }

  returnHome(userId: string) {
    return this.visit(userId, this.requireUser(userId).roomId, true);
  }

  setAction(userId: string, action: Extract<PetAction, "idle" | "move" | "interact" | "sleep">) {
    const pet = this.requireOwnPet(userId);
    pet.action = action;
    pet.actionStartedAt = Date.now();
    pet.target = undefined;
    pet.revision += 1;
    this.bump(pet.currentRoomId);
    return pet.currentRoomId;
  }

  moveTo(userId: string, position: { x: number; y: number }) {
    const pet = this.requireOwnPet(userId);
    pet.target = position;
    pet.direction = position.x < pet.position.x ? "left" : "right";
    pet.position = position;
    pet.action = "move";
    pet.actionStartedAt = Date.now();
    pet.revision += 1;
    this.bump(pet.currentRoomId);
    return pet.currentRoomId;
  }

  setScale(userId: string, scale: number) {
    const pet = this.requireOwnPet(userId);
    pet.scale = Math.max(0.5, Math.min(2, scale));
    pet.revision += 1;
    this.bump(pet.currentRoomId);
    return pet.currentRoomId;
  }

  beginDrag(userId: string, petId: string) {
    const pet = this.requirePetInCurrentRoom(userId, petId);
    const owner = this.requireUser(pet.ownerUserId);
    if (pet.ownerUserId !== userId && !owner.access.allowFriendDrag) {
      throw new StateError("DRAG_FORBIDDEN", "桌宠主人没有开启好友拖拽");
    }
    const existing = this.locks.get(petId);
    if (existing && existing.expiresAt > Date.now() && existing.userId !== userId) {
      throw new StateError("DRAG_BUSY", "这只桌宠正在被其他人拖拽");
    }
    this.locks.set(petId, { userId, expiresAt: Date.now() + 3_000 });
    pet.action = "dragged";
    pet.actionStartedAt = Date.now();
    pet.revision += 1;
    this.bump(pet.currentRoomId);
    return pet.currentRoomId;
  }

  dragMove(userId: string, petId: string, position: { x: number; y: number }) {
    const pet = this.requirePetInCurrentRoom(userId, petId);
    const lock = this.locks.get(petId);
    if (!lock || lock.userId !== userId || lock.expiresAt < Date.now()) {
      throw new StateError("DRAG_LOCK_LOST", "拖拽控制权已经失效");
    }
    lock.expiresAt = Date.now() + 3_000;
    pet.position = position;
    pet.target = undefined;
    pet.action = "dragged";
    pet.revision += 1;
    this.bump(pet.currentRoomId);
    return pet.currentRoomId;
  }

  endDrag(userId: string, petId: string) {
    const pet = this.requirePetInCurrentRoom(userId, petId);
    const lock = this.locks.get(petId);
    if (lock?.userId === userId) this.locks.delete(petId);
    pet.action = "idle";
    pet.actionStartedAt = Date.now();
    pet.revision += 1;
    this.bump(pet.currentRoomId);
    return pet.currentRoomId;
  }

  interact(userId: string, petId: string) {
    const pet = this.requirePetInCurrentRoom(userId, petId);
    pet.action = "interact";
    pet.actionStartedAt = Date.now();
    pet.revision += 1;
    this.bump(pet.currentRoomId);
    return pet.currentRoomId;
  }

  setAccess(userId: string, access: RoomAccess) {
    const user = this.requireUser(userId);
    user.access = access;
    this.bump(user.roomId);
    return user.roomId;
  }

  setPetRevision(userId: string, revision: number) {
    const user = this.requireUser(userId);
    user.petRevision = revision;
  }

  snapshot(roomId: string): RoomSnapshot {
    const room = this.requireRoom(roomId);
    const owner = this.requireUser(room.ownerUserId);
    return {
      roomId,
      ownerUserId: owner.userId,
      ownerOnline: owner.online,
      ownerPresent: owner.currentRoomId === owner.roomId && owner.online,
      temporarilyClosed: owner.reconnecting,
      access: owner.access,
      pets: [...room.pets.values()].map((pet) => structuredClone(pet)),
      sequence: room.sequence,
      serverTime: Date.now(),
    };
  }

  members(): MemberSummary[] {
    return [...this.users.values()].map((user) => ({
      userId: user.userId,
      displayName: user.displayName,
      roomId: user.roomId,
      currentRoomId: user.currentRoomId,
      online: user.online,
      reconnecting: user.reconnecting,
      petRevision: user.petRevision,
    }));
  }

  persisted(): PersistedState {
    return {
      users: Object.fromEntries(
        [...this.users.values()].map((user) => [
          user.userId,
          {
            displayName: user.displayName,
            access: user.access,
            petRevision: user.petRevision,
          },
        ]),
      ),
    };
  }

  private createPet(user: UserState): PetState {
    return {
      petId: petIdFor(user.userId),
      ownerUserId: user.userId,
      currentRoomId: user.roomId,
      position: { x: 0.5, y: 0.82 },
      direction: "right",
      action: "idle",
      actionStartedAt: Date.now(),
      scale: 1,
      revision: 0,
    };
  }

  private requireOwnPet(userId: string) {
    const pet = this.findPet(petIdFor(userId));
    if (!pet) throw new StateError("PET_OFFLINE", "桌宠尚未上线");
    return pet;
  }

  private requirePetInCurrentRoom(userId: string, petId: string) {
    const user = this.requireUser(userId);
    const pet = this.requireRoom(user.currentRoomId).pets.get(petId);
    if (!pet) throw new StateError("PET_NOT_HERE", "桌宠不在当前房间");
    return pet;
  }

  private findPet(petId: string) {
    for (const room of this.rooms.values()) {
      const pet = room.pets.get(petId);
      if (pet) return pet;
    }
    return undefined;
  }

  private bump(roomId: string) {
    this.requireRoom(roomId).sequence += 1;
  }

  private requireUser(userId: string) {
    const user = this.users.get(userId);
    if (!user) throw new StateError("UNKNOWN_USER", "用户不存在");
    return user;
  }

  private requireRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) throw new StateError("UNKNOWN_ROOM", "房间不存在");
    return room;
  }
}

export class StateError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
