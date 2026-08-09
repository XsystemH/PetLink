import { useEffect, useRef } from "react";
import type { PetAction, PetPackage } from "@petlink/protocol";

interface RigCanvasProps {
  pet: PetPackage;
  action: PetAction;
  actionStartedAt: number;
  direction?: "left" | "right";
  className?: string;
}

interface Transform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

const identity: Transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

export function RigCanvas({ pet, action, actionStartedAt, direction = "right", className }: RigCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let cancelled = false;
    let frame = 0;
    const images = new Map<string, HTMLImageElement>();

    Promise.all(
      pet.slots.map(
        (slot) =>
          new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
              images.set(slot.id, image);
              resolve();
            };
            image.onerror = () => reject(new Error(`无法载入图层 ${slot.id}`));
            image.src = slot.dataUrl;
          }),
      ),
    )
      .then(() => {
        const render = () => {
          if (cancelled) return;
          const rect = canvas.getBoundingClientRect();
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const targetWidth = Math.max(1, Math.round(rect.width * dpr));
          const targetHeight = Math.max(1, Math.round(rect.height * dpr));
          if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
          }
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.scale(targetWidth / pet.canvas.width, targetHeight / pet.canvas.height);
          if (direction === "left") {
            context.translate(pet.canvas.width, 0);
            context.scale(-1, 1);
          }

          const elapsed = Math.max(0, Date.now() - actionStartedAt);
          const authoredAction = action === "dragged" || action === "visiting" ? "idle" : action;
          const animation = pet.animations[authoredAction];
          const rawProgress = elapsed / animation.durationMs;
          const progress = animation.loop ? rawProgress % 1 : Math.min(1, rawProgress);

          if (action === "visiting") {
            const enter = Math.min(1, elapsed / 420);
            context.globalAlpha = enter;
            context.translate(pet.canvas.width / 2, pet.canvas.height * 0.9);
            context.scale(0.55 + enter * 0.45, 0.55 + enter * 0.45);
            context.translate(-pet.canvas.width / 2, -pet.canvas.height * 0.9);
          }
          if (action === "dragged") {
            context.translate(pet.canvas.width / 2, pet.canvas.height * 0.5);
            context.rotate((Math.sin(elapsed / 110) * 4 * Math.PI) / 180);
            context.translate(-pet.canvas.width / 2, -pet.canvas.height * 0.5);
          }

          const bones = new Map(pet.bones.map((bone) => [bone.id, bone]));
          for (const slot of [...pet.slots].sort((a, b) => a.zIndex - b.zIndex)) {
            const image = images.get(slot.id);
            if (!image) continue;
            const chain = [];
            let bone = bones.get(slot.bone);
            while (bone) {
              chain.unshift(bone);
              bone = bone.parent ? bones.get(bone.parent) : undefined;
            }
            context.save();
            for (const item of chain) {
              const transform = sample(animation.tracks[item.id], progress);
              const pivotX = item.pivotX * pet.canvas.width;
              const pivotY = item.pivotY * pet.canvas.height;
              context.translate(pivotX, pivotY);
              context.translate(transform.x * pet.canvas.width, transform.y * pet.canvas.height);
              context.rotate((transform.rotation * Math.PI) / 180);
              context.scale(transform.scaleX, transform.scaleY);
              context.translate(-pivotX, -pivotY);
            }
            context.drawImage(image, 0, 0, pet.canvas.width, pet.canvas.height);
            context.restore();
          }
          context.globalAlpha = 1;
          frame = requestAnimationFrame(render);
        };
        render();
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [pet, action, actionStartedAt, direction]);

  return <canvas ref={canvasRef} className={className} aria-label={`${pet.name}：${action}`} />;
}

function sample(track: PetPackage["animations"]["idle"]["tracks"][string] | undefined, progress: number): Transform {
  if (!track?.length) return identity;
  const nextIndex = track.findIndex((frame) => frame.at >= progress);
  if (nextIndex <= 0) return { ...identity, ...track[0] };
  if (nextIndex === -1) return { ...identity, ...track[track.length - 1] };
  const previous = track[nextIndex - 1]!;
  const next = track[nextIndex]!;
  const range = Math.max(0.0001, next.at - previous.at);
  const amount = (progress - previous.at) / range;
  return {
    x: lerp(previous.x, next.x, amount),
    y: lerp(previous.y, next.y, amount),
    rotation: lerp(previous.rotation, next.rotation, amount),
    scaleX: lerp(previous.scaleX, next.scaleX, amount),
    scaleY: lerp(previous.scaleY, next.scaleY, amount),
  };
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}
