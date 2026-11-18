import { describe, expect, it } from "vitest";
import { TONES, assignTones, toneByHash } from "./tones";

describe("per-person colours", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `user-${i}-${"x".repeat(i + 3)}`);
  it("gives every member of a project a different colour (up to the palette size)", () => {
    const m = assignTones(ids);
    expect(new Set([...m.values()]).size).toBe(12);
  });
  it("is stable: the same people always get the same colours, whatever the order", () => {
    const a = assignTones(ids), b = assignTones([...ids].reverse());
    ids.forEach((id) => expect(a.get(id)).toBe(b.get(id)));
  });
  it("falls back to a hash colour for people it does not know", () => {
    expect(TONES).toContain(toneByHash("somebody-else"));
    expect(toneByHash("same")).toBe(toneByHash("same"));
  });
});
