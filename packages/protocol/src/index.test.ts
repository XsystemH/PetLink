import { describe, expect, it } from "vitest";
import { petPackageSchema, roomIdFor } from "./index.js";

describe("protocol helpers", () => {
  it("creates a stable personal room id", () => {
    expect(roomIdFor("alice")).toBe("room-alice");
  });

  it("rejects a package without the four MVP animations", () => {
    const result = petPackageSchema.safeParse({ formatVersion: 1 });
    expect(result.success).toBe(false);
  });
});
