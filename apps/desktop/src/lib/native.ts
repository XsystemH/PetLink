import type { PetPackage, PetState, RoomSnapshot } from "@petlink/protocol";

export interface PetWindowPayload {
  type: "pet-payload";
  petId: string;
  selfUserId: string;
  petPackage: PetPackage;
  state: PetState;
}

export type PetWindowMessage =
  | PetWindowPayload
  | { type: "pet-ready"; petId: string }
  | { type: "drag-start"; petId: string }
  | { type: "drag-move"; petId: string; position: { x: number; y: number } }
  | { type: "drag-end"; petId: string; position: { x: number; y: number } }
  | { type: "interact"; petId: string }
  | { type: "set-action"; action: "idle" | "move" | "interact" | "sleep" };

export const petChannel = new BroadcastChannel("petlink-pets");

export function isTauri() {
  return "__TAURI_INTERNALS__" in window;
}

export async function saveLocalPet(userId: string, pet: PetPackage) {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_pet", { userId, pet });
  } else {
    localStorage.setItem(`petlink:pet:${userId}`, JSON.stringify(pet));
  }
}

export async function loadLocalPet(userId: string): Promise<PetPackage | null> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke("load_pet", { userId })) as PetPackage | null;
  }
  const raw = localStorage.getItem(`petlink:pet:${userId}`);
  return raw ? (JSON.parse(raw) as PetPackage) : null;
}

export async function syncNativePets(
  room: RoomSnapshot,
  packages: Record<string, PetPackage>,
  selfUserId: string,
) {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const visibleIds = room.pets.map((pet) => pet.petId);
  await invoke("hide_other_pet_windows", { visiblePetIds: visibleIds });
  for (const pet of room.pets) {
    const petPackage = packages[pet.ownerUserId];
    if (!petPackage) continue;
    await invoke("ensure_pet_window", { petId: pet.petId });
    await invoke("position_pet", {
      petId: pet.petId,
      x: pet.position.x,
      y: pet.position.y,
      scale: pet.scale,
    });
    petChannel.postMessage({
      type: "pet-payload",
      petId: pet.petId,
      selfUserId,
      petPackage,
      state: pet,
    } satisfies PetWindowPayload);
  }
}
