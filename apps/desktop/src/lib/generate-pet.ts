import type { PetPackage } from "@petlink/protocol";
import { defaultAnimations } from "./fallback-pet";

export const PET_CANVAS_SIZE = 512;

export type PetPartId =
  | "ear-left"
  | "ear-right"
  | "arm-left"
  | "arm-right"
  | "leg-left"
  | "leg-right"
  | "body"
  | "head";

export interface PetPartSource {
  color: string;
  file: File | null;
  enabled: boolean;
}

export type PetPartSources = Record<PetPartId, PetPartSource>;

interface PartDefinition {
  id: PetPartId;
  label: string;
  shape: "circle" | "capsule" | "ear";
  bounds: { x: number; y: number; width: number; height: number };
  pivot: { x: number; y: number };
  parent: "root" | PetPartId;
  zIndex: number;
  optional?: boolean;
  defaultColor: string;
}

export const PET_PARTS: readonly PartDefinition[] = [
  {
    id: "ear-left", label: "左耳", shape: "ear",
    bounds: { x: 132, y: 35, width: 108, height: 145 },
    pivot: { x: 0.39, y: 0.29 }, parent: "head", zIndex: -3, optional: true, defaultColor: "#d895ad",
  },
  {
    id: "ear-right", label: "右耳", shape: "ear",
    bounds: { x: 272, y: 35, width: 108, height: 145 },
    pivot: { x: 0.61, y: 0.29 }, parent: "head", zIndex: -3, optional: true, defaultColor: "#d895ad",
  },
  {
    id: "arm-left", label: "左臂", shape: "capsule",
    bounds: { x: 112, y: 254, width: 76, height: 178 },
    pivot: { x: 0.33, y: 0.52 }, parent: "body", zIndex: -2, defaultColor: "#b56985",
  },
  {
    id: "arm-right", label: "右臂", shape: "capsule",
    bounds: { x: 324, y: 254, width: 76, height: 178 },
    pivot: { x: 0.67, y: 0.52 }, parent: "body", zIndex: -2, defaultColor: "#b56985",
  },
  {
    id: "leg-left", label: "左腿", shape: "capsule",
    bounds: { x: 174, y: 374, width: 78, height: 125 },
    pivot: { x: 0.42, y: 0.76 }, parent: "body", zIndex: -1, defaultColor: "#92526c",
  },
  {
    id: "leg-right", label: "右腿", shape: "capsule",
    bounds: { x: 260, y: 374, width: 78, height: 125 },
    pivot: { x: 0.58, y: 0.76 }, parent: "body", zIndex: -1, defaultColor: "#92526c",
  },
  {
    id: "body", label: "躯干", shape: "capsule",
    bounds: { x: 166, y: 222, width: 180, height: 225 },
    pivot: { x: 0.5, y: 0.48 }, parent: "root", zIndex: 0, defaultColor: "#b96986",
  },
  {
    id: "head", label: "头部", shape: "circle",
    bounds: { x: 126, y: 76, width: 260, height: 230 },
    pivot: { x: 0.5, y: 0.45 }, parent: "body", zIndex: 2, defaultColor: "#e1a1b7",
  },
] as const;

export function createDefaultPartSources(): PetPartSources {
  return Object.fromEntries(PET_PARTS.map((part) => [
    part.id,
    { color: part.defaultColor, file: null, enabled: true },
  ])) as PetPartSources;
}

export async function generatePetFromParts(
  sources: PetPartSources,
  userId: string,
  name: string,
): Promise<PetPackage> {
  const slots: PetPackage["slots"] = [];
  const sourceNames: string[] = [];

  for (const part of PET_PARTS) {
    const source = sources[part.id];
    if (!source.enabled && part.optional) continue;
    const canvas = await renderPart(part, source);
    slots.push({
      id: part.id,
      bone: part.id,
      dataUrl: canvas.toDataURL("image/webp", 0.94),
      zIndex: part.zIndex,
    });
    if (source.file) sourceNames.push(source.file.name);
  }

  return {
    formatVersion: 1,
    petId: `pet-${userId}`,
    name: name.trim().slice(0, 40) || "我的桌宠",
    canvas: { width: PET_CANVAS_SIZE, height: PET_CANVAS_SIZE },
    bones: [
      { id: "root", parent: null, pivotX: 0.5, pivotY: 0.92 },
      ...PET_PARTS.map((part) => ({
        id: part.id,
        parent: part.parent,
        pivotX: part.pivot.x,
        pivotY: part.pivot.y,
      })),
    ],
    slots,
    animations: defaultAnimations(),
    createdAt: Date.now(),
    sourceName: sourceNames.length > 0
      ? [...new Set(sourceNames)].join(", ").slice(0, 120)
      : "PetLink 分部件纯色素材",
  };
}

async function renderPart(part: PartDefinition, source: PetPartSource) {
  if (source.file) validateSource(source.file);
  const canvas = document.createElement("canvas");
  canvas.width = PET_CANVAS_SIZE;
  canvas.height = PET_CANVAS_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(`无法创建${part.label}画布`);

  context.save();
  addPartPath(context, part);
  context.clip();
  if (source.file) {
    const image = await createImageBitmap(source.file);
    drawImageCover(context, image, part.bounds);
    image.close();
  } else {
    context.fillStyle = validColor(source.color) ? source.color : part.defaultColor;
    context.fillRect(part.bounds.x, part.bounds.y, part.bounds.width, part.bounds.height);
  }
  context.restore();
  return canvas;
}

function addPartPath(context: CanvasRenderingContext2D, part: PartDefinition) {
  const { x, y, width, height } = part.bounds;
  context.beginPath();
  if (part.shape === "circle") {
    context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  } else if (part.shape === "capsule") {
    context.roundRect(x, y, width, height, Math.min(width, height) / 2);
  } else if (part.id === "ear-left") {
    context.moveTo(x + width * 0.22, y + height * 0.08);
    context.bezierCurveTo(x + width * 0.05, y + height * 0.42, x + width * 0.02, y + height * 0.82, x + width * 0.28, y + height * 0.94);
    context.quadraticCurveTo(x + width * 0.63, y + height, x + width * 0.88, y + height * 0.82);
    context.bezierCurveTo(x + width * 0.72, y + height * 0.52, x + width * 0.49, y + height * 0.22, x + width * 0.22, y + height * 0.08);
  } else {
    context.moveTo(x + width * 0.78, y + height * 0.08);
    context.bezierCurveTo(x + width * 0.95, y + height * 0.42, x + width * 0.98, y + height * 0.82, x + width * 0.72, y + height * 0.94);
    context.quadraticCurveTo(x + width * 0.37, y + height, x + width * 0.12, y + height * 0.82);
    context.bezierCurveTo(x + width * 0.28, y + height * 0.52, x + width * 0.51, y + height * 0.22, x + width * 0.78, y + height * 0.08);
  }
  context.closePath();
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: ImageBitmap,
  bounds: { x: number; y: number; width: number; height: number },
) {
  const scale = Math.max(bounds.width / image.width, bounds.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  context.drawImage(
    image,
    bounds.x + (bounds.width - width) / 2,
    bounds.y + (bounds.height - height) / 2,
    width,
    height,
  );
}

function validateSource(file: File) {
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} 超过 20 MB`);
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error(`${file.name} 不是 PNG、JPEG 或 WebP`);
}

function validColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}
