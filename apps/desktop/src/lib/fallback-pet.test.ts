import { describe, expect, it } from "vitest";
import { petPackageSchema } from "@petlink/protocol";
import { createFallbackPet } from "./fallback-pet";

describe("fallback pet", () => {
  it("conforms to the lightweight package contract", () => {
    const pet = createFallbackPet("alice", "小桃");
    expect(petPackageSchema.parse(pet).bones).toHaveLength(3);
    expect(Object.keys(pet.animations)).toEqual(["idle", "move", "interact", "sleep"]);
  });
});
