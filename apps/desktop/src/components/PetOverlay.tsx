import { useEffect, useRef, useState } from "react";
import type { PetPackage, PetState } from "@petlink/protocol";
import { petChannel, type PetWindowMessage } from "../lib/native";
import { RigCanvas } from "./RigCanvas";

export function PetOverlay({ petId }: { petId: string }) {
  const [payload, setPayload] = useState<{ petPackage: PetPackage; state: PetState; selfUserId: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const draggingRef = useRef(false);

  useEffect(() => {
    const listener = (event: MessageEvent<PetWindowMessage>) => {
      if (event.data.type === "pet-payload" && event.data.petId === petId) {
        setPayload({ petPackage: event.data.petPackage, state: event.data.state, selfUserId: event.data.selfUserId });
      }
    };
    petChannel.addEventListener("message", listener);
    petChannel.postMessage({ type: "pet-ready", petId } satisfies PetWindowMessage);
    return () => petChannel.removeEventListener("message", listener);
  }, [petId]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let lastSent = 0;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      unlisten = await getCurrentWindow().onMoved(async () => {
        if (!draggingRef.current || Date.now() - lastSent < 50) return;
        lastSent = Date.now();
        const { invoke } = await import("@tauri-apps/api/core");
        const position = (await invoke("current_pet_position")) as { x: number; y: number };
        petChannel.postMessage({ type: "drag-move", petId, position } satisfies PetWindowMessage);
      });
    });
    return () => unlisten?.();
  }, [petId]);

  async function startDrag() {
    if (!payload) return;
    draggingRef.current = true;
    petChannel.postMessage({ type: "drag-start", petId } satisfies PetWindowMessage);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("start_pet_drag");
      const position = (await invoke("current_pet_position")) as { x: number; y: number };
      petChannel.postMessage({ type: "drag-end", petId, position } satisfies PetWindowMessage);
    } catch (error) {
      console.error(error);
    } finally {
      draggingRef.current = false;
    }
  }

  async function showSettings() {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("show_control_center");
    setMenuOpen(false);
  }

  if (!payload) return <div className="pet-loading" />;
  const isOwner = payload.state.ownerUserId === payload.selfUserId;

  return (
    <main
      className="pet-overlay"
      onPointerDown={(event) => {
        if (event.button === 0 && !(event.target as HTMLElement).closest(".pet-menu")) void startDrag();
      }}
      onDoubleClick={() => petChannel.postMessage({ type: "interact", petId } satisfies PetWindowMessage)}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen((value) => !value);
      }}
    >
      <RigCanvas
        pet={payload.petPackage}
        action={payload.state.action}
        actionStartedAt={payload.state.actionStartedAt}
        direction={payload.state.direction}
        className="pet-canvas"
      />
      {menuOpen && (
        <div className="pet-menu" onPointerDown={(event) => event.stopPropagation()}>
          <button onClick={() => petChannel.postMessage({ type: "interact", petId } satisfies PetWindowMessage)}>互动</button>
          {isOwner &&
            (["idle", "move", "sleep"] as const).map((action) => (
              <button
                key={action}
                onClick={() => petChannel.postMessage({ type: "set-action", action } satisfies PetWindowMessage)}
              >
                {action === "idle" ? "待机" : action === "move" ? "走动" : "睡觉"}
              </button>
            ))}
          <button onClick={() => void showSettings()}>控制中心</button>
        </div>
      )}
    </main>
  );
}
