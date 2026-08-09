import { describe, expect, it } from "vitest";
import { calculateImagePlacement, createDefaultPartSources } from "./generate-pet";

describe("pet part cropping", () => {
  it("starts every part centered at the initial zoom", () => {
    const sources = createDefaultPartSources();
    expect(Object.values(sources).every((source) => (
      source.offsetX === 0 && source.offsetY === 0 && source.zoom === 1
    ))).toBe(true);
  });

  it("uses the same cover, zoom and offset model as the editor preview", () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 };
    const centered = calculateImagePlacement(400, 200, bounds, { offsetX: 0, offsetY: 0, zoom: 1 });
    const movedRight = calculateImagePlacement(400, 200, bounds, { offsetX: 1, offsetY: 0, zoom: 1 });
    const zoomed = calculateImagePlacement(400, 200, bounds, { offsetX: 0, offsetY: 0, zoom: 2 });

    expect(centered).toEqual({ x: -50, y: 0, width: 200, height: 100 });
    expect(movedRight).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(zoomed).toEqual({ x: -150, y: -50, width: 400, height: 200 });
  });
});
