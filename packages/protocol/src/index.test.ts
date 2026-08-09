import { describe, expect, it } from "vitest";
import { clientMessageSchema, petPackageSchema, roomIdFor } from "./index.js";

describe("protocol helpers", () => {
  it("creates a stable personal room id", () => {
    expect(roomIdFor("alice")).toBe("room-alice");
  });

  it("rejects a package without the four MVP animations", () => {
    const result = petPackageSchema.safeParse({ formatVersion: 1 });
    expect(result.success).toBe(false);
  });

  it("requires the final position on a drag-end message", () => {
    const base = { protocolVersion: 1, messageId: "message-123", timestamp: 1, type: "DRAG_END", petId: "pet-alice" };
    expect(clientMessageSchema.safeParse(base).success).toBe(false);
    expect(clientMessageSchema.safeParse({ ...base, position: { x: 0.7, y: 0.8 } }).success).toBe(true);
  });
});
