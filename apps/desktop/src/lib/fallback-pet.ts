import type { PetPackage } from "@petlink/protocol";

function svgData(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const commonAnimations: PetPackage["animations"] = {
  idle: {
    durationMs: 2200,
    loop: true,
    tracks: {
      body: [
        { at: 0, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        { at: 0.5, x: 0, y: -0.012, rotation: 0, scaleX: 1.01, scaleY: 0.99 },
        { at: 1, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      ],
      head: [
        { at: 0, x: 0, y: 0, rotation: -1.5, scaleX: 1, scaleY: 1 },
        { at: 0.5, x: 0, y: 0, rotation: 1.5, scaleX: 1, scaleY: 1 },
        { at: 1, x: 0, y: 0, rotation: -1.5, scaleX: 1, scaleY: 1 },
      ],
    },
  },
  move: {
    durationMs: 650,
    loop: true,
    tracks: {
      root: [
        { at: 0, x: 0, y: 0, rotation: -2, scaleX: 1, scaleY: 1 },
        { at: 0.5, x: 0, y: -0.035, rotation: 2, scaleX: 1.03, scaleY: 0.97 },
        { at: 1, x: 0, y: 0, rotation: -2, scaleX: 1, scaleY: 1 },
      ],
    },
  },
  interact: {
    durationMs: 700,
    loop: false,
    tracks: {
      root: [
        { at: 0, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        { at: 0.35, x: 0, y: -0.08, rotation: -6, scaleX: 1.08, scaleY: 0.92 },
        { at: 0.7, x: 0, y: -0.02, rotation: 5, scaleX: 0.97, scaleY: 1.03 },
        { at: 1, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      ],
    },
  },
  sleep: {
    durationMs: 3000,
    loop: true,
    tracks: {
      root: [
        { at: 0, x: 0, y: 0.04, rotation: -8, scaleX: 1.04, scaleY: 0.9 },
        { at: 0.5, x: 0, y: 0.045, rotation: -8, scaleX: 1.06, scaleY: 0.88 },
        { at: 1, x: 0, y: 0.04, rotation: -8, scaleX: 1.04, scaleY: 0.9 },
      ],
    },
  },
};

export function createFallbackPet(userId: string, displayName = "桌宠"): PetPackage {
  const colorSeed = [...userId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const hue = colorSeed % 360;
  const body = svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
    <ellipse cx="256" cy="354" rx="116" ry="122" fill="hsl(${hue}, 62%, 68%)"/>
    <ellipse cx="218" cy="445" rx="52" ry="25" fill="hsl(${hue}, 55%, 52%)"/>
    <ellipse cx="294" cy="445" rx="52" ry="25" fill="hsl(${hue}, 55%, 52%)"/>
  </svg>`);
  const head = svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
    <circle cx="256" cy="204" r="126" fill="hsl(${hue}, 70%, 76%)"/>
    <path d="M154 118 L190 42 L228 105" fill="hsl(${hue}, 70%, 76%)"/>
    <path d="M284 105 L322 42 L358 118" fill="hsl(${hue}, 70%, 76%)"/>
    <circle cx="212" cy="204" r="13" fill="#342d3b"/><circle cx="300" cy="204" r="13" fill="#342d3b"/>
    <path d="M232 246 Q256 266 280 246" fill="none" stroke="#342d3b" stroke-width="9" stroke-linecap="round"/>
  </svg>`);
  return {
    formatVersion: 1,
    petId: `pet-${userId}`,
    name: displayName,
    canvas: { width: 512, height: 512 },
    bones: [
      { id: "root", parent: null, pivotX: 0.5, pivotY: 0.9 },
      { id: "body", parent: "root", pivotX: 0.5, pivotY: 0.72 },
      { id: "head", parent: "body", pivotX: 0.5, pivotY: 0.38 },
    ],
    slots: [
      { id: "body", bone: "body", dataUrl: body, zIndex: 0 },
      { id: "head", bone: "head", dataUrl: head, zIndex: 1 },
    ],
    animations: structuredClone(commonAnimations),
    createdAt: Date.now(),
    sourceName: "PetLink 默认桌宠",
  };
}

export function defaultAnimations(): PetPackage["animations"] {
  return structuredClone(commonAnimations);
}
