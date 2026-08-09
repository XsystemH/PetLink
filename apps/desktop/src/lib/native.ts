import type { PetPackage, PetState, RoomSnapshot } from "@petlink/protocol";

export interface PetWindowPayload {
  type: "pet-payload";
  petId: string;
  selfUserId: string;
  petPackage: PetPackage;
  state: PetState;
}

export type PetWindowMessage =
  | { type: "drag-start"; petId: string }
  | { type: "drag-move"; petId: string; position: { x: number; y: number } }
  | { type: "drag-end"; petId: string; position: { x: number; y: number } }
  | { type: "interact"; petId: string }
  | { type: "set-action"; action: "idle" | "move" | "interact" | "sleep" }
  | { type: "open-settings"; petId: string }
  | { type: "native-error"; message: string };

const fallbackChannel = new BroadcastChannel("petlink-pets");

export function isTauri() {
  return "__TAURI_INTERNALS__" in window;
}

export async function listenForMainMessages(listener: (message: PetWindowMessage) => void) {
  if (isTauri()) {
    const { listen } = await import("@tauri-apps/api/event");
    return listen<PetWindowMessage>("petlink:main", (event) => listener(event.payload));
  }
  const handler = (event: MessageEvent<PetWindowMessage>) => listener(event.data);
  fallbackChannel.addEventListener("message", handler);
  return () => fallbackChannel.removeEventListener("message", handler);
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
    const payload: PetWindowPayload = {
      type: "pet-payload",
      petId: pet.petId,
      selfUserId,
      petPackage,
      state: pet,
    };
    const imageDataUrl = await rasterizePet(petPackage);
    await invoke("upsert_pet_window", {
      petId: pet.petId,
      x: pet.position.x,
      y: pet.position.y,
      scale: pet.scale,
      payload,
      imageDataUrl,
    });
  }
}

const rasterCache = new Map<string, string>();

async function rasterizePet(pet: PetPackage) {
  const cacheKey = `${pet.petId}:${pet.createdAt}`;
  const cached = rasterCache.get(cacheKey);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = pet.canvas.width;
  canvas.height = pet.canvas.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建原生桌宠图片");
  for (const slot of [...pet.slots].sort((left, right) => left.zIndex - right.zIndex)) {
    const image = await loadLayer(slot.dataUrl, slot.id);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }
  const result = canvas.toDataURL("image/png");
  rasterCache.set(cacheKey, result);
  return result;
}

function loadLayer(dataUrl: string, slotId: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`无法载入桌宠图层 ${slotId}`));
    image.src = dataUrl;
  });
}

export async function hideAllNativePets() {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("hide_other_pet_windows", { visiblePetIds: [] });
}

export async function showControlCenter() {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("show_control_center");
}
