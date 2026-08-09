import type { PetPackage } from "@petlink/protocol";
import { defaultAnimations } from "./fallback-pet";

const SIZE = 512;

export async function generatePetFromImage(
  file: File,
  userId: string,
  name: string,
): Promise<PetPackage> {
  if (file.size > 20 * 1024 * 1024) throw new Error("图片不能超过 20 MB");
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("请上传 PNG、JPEG 或 WebP 图片");

  const image = await createImageBitmap(file);
  const source = document.createElement("canvas");
  source.width = SIZE;
  source.height = SIZE;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器无法创建图像画布");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const ratio = Math.min((SIZE * 0.9) / image.width, (SIZE * 0.9) / image.height);
  const width = image.width * ratio;
  const height = image.height * ratio;
  context.drawImage(image, (SIZE - width) / 2, SIZE - height - 20, width, height);
  image.close();

  const pixels = context.getImageData(0, 0, SIZE, SIZE);
  removeFlatBackground(pixels);
  context.putImageData(pixels, 0, 0);
  const bounds = alphaBounds(pixels);
  if (!bounds || bounds.width < 80 || bounds.height < 120) {
    throw new Error("未识别到足够清晰的完整角色，请换一张主体更大的图片");
  }

  const splitY = Math.round(bounds.top + bounds.height * 0.4);
  const head = layerCanvas(pixels, (y) => y <= splitY + 3, splitY, true);
  const body = layerCanvas(pixels, (y) => y > splitY - 3, splitY, false);
  if (countOpaque(head) < 1_000 || countOpaque(body) < 1_000) {
    throw new Error("无法稳定拆分头部和身体，请使用角色完整、背景简单的图片");
  }

  return {
    formatVersion: 1,
    petId: `pet-${userId}`,
    name: name.trim().slice(0, 40) || "我的桌宠",
    canvas: { width: SIZE, height: SIZE },
    bones: [
      { id: "root", parent: null, pivotX: 0.5, pivotY: Math.min(0.95, bounds.bottom / SIZE) },
      { id: "body", parent: "root", pivotX: 0.5, pivotY: Math.min(0.9, (splitY + bounds.height * 0.32) / SIZE) },
      { id: "head", parent: "body", pivotX: 0.5, pivotY: splitY / SIZE },
    ],
    slots: [
      { id: "body", bone: "body", dataUrl: body.toDataURL("image/webp", 0.92), zIndex: 0 },
      { id: "head", bone: "head", dataUrl: head.toDataURL("image/webp", 0.92), zIndex: 1 },
    ],
    animations: defaultAnimations(),
    createdAt: Date.now(),
    sourceName: file.name.slice(0, 120),
  };
}

function removeFlatBackground(image: ImageData) {
  let transparent = 0;
  for (let index = 3; index < image.data.length; index += 4) {
    if (image.data[index]! < 245) transparent += 1;
  }
  if (transparent > image.width * image.height * 0.03) return;

  const corners = [
    pixelAt(image, 4, 4),
    pixelAt(image, image.width - 5, 4),
    pixelAt(image, 4, image.height - 5),
    pixelAt(image, image.width - 5, image.height - 5),
  ];
  const background = corners.reduce(
    (value, pixel) => value.map((channel, index) => channel + pixel[index]! / corners.length),
    [0, 0, 0],
  );
  for (let index = 0; index < image.data.length; index += 4) {
    const distance = Math.sqrt(
      (image.data[index]! - background[0]!) ** 2 +
        (image.data[index + 1]! - background[1]!) ** 2 +
        (image.data[index + 2]! - background[2]!) ** 2,
    );
    image.data[index + 3] = Math.round(Math.max(0, Math.min(255, (distance - 18) * 5)));
  }
}

function pixelAt(image: ImageData, x: number, y: number) {
  const index = (y * image.width + x) * 4;
  return [image.data[index]!, image.data[index + 1]!, image.data[index + 2]!];
}

function alphaBounds(image: ImageData) {
  let left = image.width;
  let right = -1;
  let top = image.height;
  let bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3]! < 32) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : { left, right, top, bottom, width: right - left + 1, height: bottom - top + 1 };
}

function layerCanvas(image: ImageData, keep: (y: number) => boolean, splitY: number, head: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d")!;
  const layer = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * 4;
      if (!keep(y)) layer.data[index + 3] = 0;
      const featherDistance = head ? splitY + 3 - y : y - (splitY - 3);
      if (featherDistance >= 0 && featherDistance < 6) {
        layer.data[index + 3] = Math.round(layer.data[index + 3]! * (featherDistance / 6));
      }
    }
  }
  context.putImageData(layer, 0, 0);
  return canvas;
}

function countOpaque(canvas: HTMLCanvasElement) {
  const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  let count = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index]! > 32) count += 1;
  return count;
}
