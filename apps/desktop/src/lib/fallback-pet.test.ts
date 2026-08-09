import { describe, expect, it } from "vitest";
import { petPackageSchema } from "@petlink/protocol";
import { createFallbackPet } from "./fallback-pet";

describe("fallback pet", () => {
  it("conforms to the fixed nine-bone package contract", () => {
    const pet = createFallbackPet("alice", "小桃");
    const parsed = petPackageSchema.parse(pet);
    expect(parsed.bones).toHaveLength(9);
    expect(parsed.slots).toHaveLength(8);
    expect(parsed.animations.move.tracks["leg-left"]).toBeDefined();
    expect(parsed.animations.move.tracks["leg-right"]).toBeDefined();
    expect(Object.keys(pet.animations)).toEqual(["idle", "move", "interact", "sleep"]);
  });
});
