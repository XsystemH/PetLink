import type { PetPackage } from "@petlink/protocol";

function svgData(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function frame(
  at: number,
  rotation = 0,
  x = 0,
  y = 0,
  scaleX = 1,
  scaleY = 1,
) {
  return { at, x, y, rotation, scaleX, scaleY };
}

const commonAnimations: PetPackage["animations"] = {
  idle: {
    durationMs: 2200,
    loop: true,
    tracks: {
      root: [frame(0), frame(0.5, 0, 0, -0.01, 1.01, 0.99), frame(1)],
      body: [frame(0, -1), frame(0.5, 1), frame(1, -1)],
      head: [frame(0, -2), frame(0.5, 2, 0, -0.008), frame(1, -2)],
      "ear-left": [frame(0, -2), frame(0.5, 3), frame(1, -2)],
      "ear-right": [frame(0, 2), frame(0.5, -3), frame(1, 2)],
      "arm-left": [frame(0, 2), frame(0.5, -2), frame(1, 2)],
      "arm-right": [frame(0, -2), frame(0.5, 2), frame(1, -2)],
    },
  },
  move: {
    durationMs: 720,
    loop: true,
    tracks: {
      root: [frame(0, -1), frame(0.25, 0, 0, -0.035, 1.02, 0.98), frame(0.5, 1), frame(0.75, 0, 0, -0.035, 1.02, 0.98), frame(1, -1)],
      body: [frame(0, -2), frame(0.5, 2), frame(1, -2)],
      head: [frame(0, 2), frame(0.5, -2), frame(1, 2)],
      "arm-left": [frame(0, -18), frame(0.5, 18), frame(1, -18)],
      "arm-right": [frame(0, 18), frame(0.5, -18), frame(1, 18)],
      "leg-left": [frame(0, 24), frame(0.5, -24), frame(1, 24)],
      "leg-right": [frame(0, -24), frame(0.5, 24), frame(1, -24)],
      "ear-left": [frame(0, -4), frame(0.5, 5), frame(1, -4)],
      "ear-right": [frame(0, 4), frame(0.5, -5), frame(1, 4)],
    },
  },
  interact: {
    durationMs: 900,
    loop: false,
    tracks: {
      root: [frame(0), frame(0.35, -3, 0, -0.11, 1.07, 0.93), frame(0.7, 3, 0, -0.025, 0.98, 1.02), frame(1)],
      head: [frame(0), frame(0.35, -8), frame(0.7, 7), frame(1)],
      "arm-left": [frame(0), frame(0.35, 58), frame(0.7, 35), frame(1)],
      "arm-right": [frame(0), frame(0.35, -58), frame(0.7, -35), frame(1)],
      "leg-left": [frame(0), frame(0.35, -18), frame(0.7, 10), frame(1)],
      "leg-right": [frame(0), frame(0.35, 18), frame(0.7, -10), frame(1)],
      "ear-left": [frame(0), frame(0.35, -12), frame(0.7, 8), frame(1)],
      "ear-right": [frame(0), frame(0.35, 12), frame(0.7, -8), frame(1)],
    },
  },
  sleep: {
    durationMs: 3000,
    loop: true,
    tracks: {
      root: [frame(0, -8, 0, 0.035, 1.04, 0.91), frame(0.5, -8, 0, 0.045, 1.06, 0.89), frame(1, -8, 0, 0.035, 1.04, 0.91)],
      head: [frame(0, -4), frame(0.5, -6), frame(1, -4)],
      "arm-left": [frame(0, 28), frame(0.5, 31), frame(1, 28)],
      "arm-right": [frame(0, -28), frame(0.5, -31), frame(1, -28)],
      "leg-left": [frame(0, 14), frame(0.5, 17), frame(1, 14)],
      "leg-right": [frame(0, -14), frame(0.5, -17), frame(1, -14)],
      "ear-left": [frame(0, 8), frame(0.5, 11), frame(1, 8)],
      "ear-right": [frame(0, -8), frame(0.5, -11), frame(1, -8)],
    },
  },
};

export function createFallbackPet(userId: string, displayName = "桌宠"): PetPackage {
  const colorSeed = [...userId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const hue = colorSeed % 360;
  const light = `hsl(${hue}, 70%, 76%)`;
  const middle = `hsl(${hue}, 62%, 68%)`;
  const dark = `hsl(${hue}, 55%, 52%)`;
  const layer = (content: string) => svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">${content}</svg>`);

  return {
    formatVersion: 1,
    petId: `pet-${userId}`,
    name: displayName,
    canvas: { width: 512, height: 512 },
    bones: [
      { id: "root", parent: null, pivotX: 0.5, pivotY: 0.92 },
      { id: "ear-left", parent: "head", pivotX: 0.39, pivotY: 0.29 },
      { id: "ear-right", parent: "head", pivotX: 0.61, pivotY: 0.29 },
      { id: "arm-left", parent: "body", pivotX: 0.33, pivotY: 0.52 },
      { id: "arm-right", parent: "body", pivotX: 0.67, pivotY: 0.52 },
      { id: "leg-left", parent: "body", pivotX: 0.42, pivotY: 0.76 },
      { id: "leg-right", parent: "body", pivotX: 0.58, pivotY: 0.76 },
      { id: "body", parent: "root", pivotX: 0.5, pivotY: 0.48 },
      { id: "head", parent: "body", pivotX: 0.5, pivotY: 0.45 },
    ],
    slots: [
      { id: "ear-left", bone: "ear-left", dataUrl: layer(`<path d="M156 47 C132 96 132 153 162 171 Q195 181 225 154 C205 108 181 70 156 47" fill="${middle}"/>`), zIndex: -3 },
      { id: "ear-right", bone: "ear-right", dataUrl: layer(`<path d="M356 47 C380 96 380 153 350 171 Q317 181 287 154 C307 108 331 70 356 47" fill="${middle}"/>`), zIndex: -3 },
      { id: "arm-left", bone: "arm-left", dataUrl: layer(`<rect x="112" y="254" width="76" height="178" rx="38" fill="${middle}"/>`), zIndex: -2 },
      { id: "arm-right", bone: "arm-right", dataUrl: layer(`<rect x="324" y="254" width="76" height="178" rx="38" fill="${middle}"/>`), zIndex: -2 },
      { id: "leg-left", bone: "leg-left", dataUrl: layer(`<rect x="174" y="374" width="78" height="125" rx="39" fill="${dark}"/>`), zIndex: -1 },
      { id: "leg-right", bone: "leg-right", dataUrl: layer(`<rect x="260" y="374" width="78" height="125" rx="39" fill="${dark}"/>`), zIndex: -1 },
      { id: "body", bone: "body", dataUrl: layer(`<rect x="166" y="222" width="180" height="225" rx="90" fill="${middle}"/>`), zIndex: 0 },
      { id: "head", bone: "head", dataUrl: layer(`<ellipse cx="256" cy="191" rx="130" ry="115" fill="${light}"/><circle cx="212" cy="194" r="13" fill="#342d3b"/><circle cx="300" cy="194" r="13" fill="#342d3b"/><path d="M232 236 Q256 256 280 236" fill="none" stroke="#342d3b" stroke-width="9" stroke-linecap="round"/>`), zIndex: 2 },
    ],
    animations: structuredClone(commonAnimations),
    createdAt: Date.now(),
    sourceName: "PetLink 默认九骨骼桌宠",
  };
}

export function defaultAnimations(): PetPackage["animations"] {
  return structuredClone(commonAnimations);
}
