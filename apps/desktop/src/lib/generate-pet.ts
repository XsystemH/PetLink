import type { PetPackage } from "@petlink/protocol";
import { defaultAnimations } from "./fallback-pet";

export const PET_CANVAS_SIZE = 512;
export const FIXED_RIG = {
  headCenterY: 0.3,
  headRadiusX: 0.23,
  headRadiusY: 0.24,
  neckY: 0.44,
  bodyCenterY: 0.67,
  bodyRadiusX: 0.22,
  bodyRadiusY: 0.27,
  footY: 0.92,
} as const;

export interface PetAlignment {
  /** Multiplier applied after fitting the whole source image inside the canvas. */
  zoom: number;
  /** Canvas-relative translation; 1 means one full canvas width/height. */
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_ALIGNMENT: PetAlignment = { zoom: 1, offsetX: 0, offsetY: 0 };

export async function loadSourceImage(file: File) {
  validateSource(file);
  return createImageBitmap(file);
}

export function drawAlignedSource(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  alignment: PetAlignment,
  size = PET_CANVAS_SIZE,
) {
  context.clearRect(0, 0, size, size);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const fittedScale = Math.min((size * 0.88) / image.width, (size * 0.88) / image.height);
  const scale = fittedScale * clamp(alignment.zoom, 0.55, 3);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (size - width) / 2 + clamp(alignment.offsetX, -0.65, 0.65) * size;
  const y = (size - height) / 2 + clamp(alignment.offsetY, -0.65, 0.65) * size;
  context.drawImage(image, x, y, width, height);
}

export async function generatePetFromImage(
  file: File,
  userId: string,
  name: string,
  alignment: PetAlignment = DEFAULT_ALIGNMENT,
): Promise<PetPackage> {
  validateSource(file);
  const image = await createImageBitmap(file);
  const source = document.createElement("canvas");
  source.width = PET_CANVAS_SIZE;
  source.height = PET_CANVAS_SIZE;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法创建图片画布，请重新启动 PetLink 后再试");

  drawAlignedSource(context, image, alignment);
  image.close();

  const pixels = context.getImageData(0, 0, PET_CANVAS_SIZE, PET_CANVAS_SIZE);
  removeFlatBackground(pixels);
  context.putImageData(pixels, 0, 0);

  const bounds = alphaBounds(pixels);
  if (!bounds || bounds.width < 28 || bounds.height < 48) {
    throw new Error("虚线框内没有足够的角色内容，请放大图片并把角色拖到框内");
  }

  const splitY = Math.round(FIXED_RIG.neckY * PET_CANVAS_SIZE);
  const head = createLayer(pixels, "head", splitY);
  const body = createLayer(pixels, "body", splitY);

  return {
    formatVersion: 1,
    petId: `pet-${userId}`,
    name: name.trim().slice(0, 40) || "我的桌宠",
    canvas: { width: PET_CANVAS_SIZE, height: PET_CANVAS_SIZE },
    bones: [
      { id: "root", parent: null, pivotX: 0.5, pivotY: FIXED_RIG.footY },
      { id: "body", parent: "root", pivotX: 0.5, pivotY: 0.69 },
      { id: "head", parent: "body", pivotX: 0.5, pivotY: FIXED_RIG.neckY },
    ],
    slots: [
      { id: "body", bone: "body", dataUrl: body.toDataURL("image/webp", 0.94), zIndex: 0 },
      { id: "head", bone: "head", dataUrl: head.toDataURL("image/webp", 0.94), zIndex: 1 },
    ],
    animations: defaultAnimations(),
    createdAt: Date.now(),
    sourceName: file.name.slice(0, 120),
  };
}

function validateSource(file: File) {
  if (file.size > 20 * 1024 * 1024) throw new Error("图片不能超过 20 MB");
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("请选择 PNG、JPEG 或 WebP 图片");
}

function createLayer(image: ImageData, kind: "head" | "body", splitY: number) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d")!;
  const layer = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  const overlap = 14;
  for (let y = 0; y < image.height; y += 1) {
    let multiplier = 1;
    if (kind === "head") {
      if (y > splitY + overlap) multiplier = 0;
      else if (y > splitY) multiplier = 1 - (y - splitY) / overlap;
    } else {
      if (y < splitY - overlap) multiplier = 0;
      else if (y < splitY) multiplier = 1 - (splitY - y) / overlap;
    }
    if (multiplier === 1) continue;
    for (let x = 0; x < image.width; x += 1) {
      const alphaIndex = (y * image.width + x) * 4 + 3;
      layer.data[alphaIndex] = Math.round(layer.data[alphaIndex]! * multiplier);
    }
  }
  context.putImageData(layer, 0, 0);
  return canvas;
}

/** Removes only a simple, nearly uniform background. Complex backgrounds are kept intact. */
function removeFlatBackground(image: ImageData) {
  let alreadyTransparent = 0;
  for (let index = 3; index < image.data.length; index += 4) {
    if (image.data[index]! < 245) alreadyTransparent += 1;
  }
  if (alreadyTransparent > image.width * image.height * 0.02) return;

  const corners = [
    pixelAt(image, 4, 4),
    pixelAt(image, image.width - 5, 4),
    pixelAt(image, 4, image.height - 5),
    pixelAt(image, image.width - 5, image.height - 5),
  ];
  const spread = Math.max(...corners.flatMap((left) => corners.map((right) => colorDistance(left, right))));
  if (spread > 42) return;

  const background = corners.reduce(
    (value, pixel) => value.map((channel, index) => channel + pixel[index]! / corners.length),
    [0, 0, 0],
  );
  for (let index = 0; index < image.data.length; index += 4) {
    const distance = colorDistance(
      [image.data[index]!, image.data[index + 1]!, image.data[index + 2]!],
      background,
    );
    image.data[index + 3] = Math.round(clamp((distance - 16) * 6, 0, 255));
  }
}

function pixelAt(image: ImageData, x: number, y: number) {
  const index = (y * image.width + x) * 4;
  return [image.data[index]!, image.data[index + 1]!, image.data[index + 2]!];
}

function colorDistance(left: number[], right: number[]) {
  return Math.sqrt(
    (left[0]! - right[0]!) ** 2 +
      (left[1]! - right[1]!) ** 2 +
      (left[2]! - right[2]!) ** 2,
  );
}

function alphaBounds(image: ImageData) {
  let left = image.width;
  let right = -1;
  let top = image.height;
  let bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3]! < 24) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left
    ? null
    : { left, right, top, bottom, width: right - left + 1, height: bottom - top + 1 };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
