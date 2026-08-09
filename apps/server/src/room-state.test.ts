import { describe, expect, it } from "vitest";
import { RoomStateManager, StateError } from "./room-state.js";

describe("RoomStateManager", () => {
  it("moves a visitor and gives every viewer the same room snapshot", () => {
    const state = new RoomStateManager(["alice", "bob", "carol"]);
    state.connect("alice");
    state.connect("bob");
    state.connect("carol");
    state.visit("alice", "room-bob");
    state.visit("carol", "room-bob");

    const room = state.snapshot("room-bob");
    expect(room.pets.map((pet) => pet.ownerUserId).sort()).toEqual(["alice", "bob", "carol"]);
    expect(state.members().find((member) => member.userId === "alice")?.currentRoomId).toBe("room-bob");
  });

  it("keeps an online-away room open only when its owner allows it", () => {
    const state = new RoomStateManager(["alice", "bob", "carol"]);
    state.connect("alice");
    state.connect("bob");
    state.connect("carol");
    state.visit("bob", "room-carol");
    state.setAccess("bob", { allowVisitsWhileOwnerAway: false, allowFriendDrag: false });

    expect(() => state.visit("alice", "room-bob")).toThrowError(StateError);
  });

  it("ejects visitors when a room owner goes offline", () => {
    const state = new RoomStateManager(["alice", "bob"]);
    state.connect("alice");
    state.connect("bob");
    state.visit("alice", "room-bob");
    state.disconnect("bob");

    expect(state.snapshot("room-bob").pets).toHaveLength(0);
    expect(state.snapshot("room-alice").pets[0]?.ownerUserId).toBe("alice");
  });

  it("always lets an online owner return even when away access is closed", () => {
    const state = new RoomStateManager(["alice", "bob"]);
    state.connect("alice");
    state.connect("bob");
    state.visit("alice", "room-bob");
    state.setAccess("alice", { allowVisitsWhileOwnerAway: false, allowFriendDrag: false });
    state.returnHome("alice");
    expect(state.snapshot("room-alice").pets[0]?.ownerUserId).toBe("alice");
  });

  it("commits the final drag position atomically", () => {
    const state = new RoomStateManager(["alice"]);
    state.connect("alice");
    state.beginDrag("alice", "pet-alice");
    state.endDrag("alice", "pet-alice", { x: 0.72, y: 0.88 });

    const pet = state.snapshot("room-alice").pets[0];
    expect(pet?.position).toEqual({ x: 0.72, y: 0.88 });
    expect(pet?.action).toBe("idle");
  });
});
