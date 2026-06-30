import { describe, it, expect } from "vitest";
import { Selector } from "../src/selector.js";

const entries = [
  { path: "/v1.png", orientation: "vertical" },
  { path: "/v2.png", orientation: "vertical" },
  { path: "/h1.png", orientation: "horizontal" },
];

describe("Selector", () => {
  it("filters by orientation", () => {
    const s = new Selector();
    for (let i = 0; i < 20; i++) {
      const picked = s.pick(entries, "horizontal");
      expect(picked.orientation).toBe("horizontal");
    }
  });

  it("returns null when nothing matches", () => {
    const s = new Selector();
    expect(s.pick([], "all")).toBeNull();
    // entries has no square images, so a square filter yields nothing
    const squares = entries.filter((e) => e.orientation === "square");
    expect(s.pick(squares, "all")).toBeNull();
  });

  it("avoids repeating the immediately-previous pick", () => {
    const s = new Selector();
    const verticals = entries.filter((e) => e.orientation === "vertical");
    let prev = s.pick(verticals, "all").path;
    for (let i = 0; i < 30; i++) {
      const next = s.pick(verticals, "all").path;
      expect(next).not.toBe(prev);
      prev = next;
    }
  });

  it("still returns the only candidate even if it was last", () => {
    const s = new Selector();
    const one = [{ path: "/solo.png", orientation: "vertical" }];
    expect(s.pick(one, "all").path).toBe("/solo.png");
    expect(s.pick(one, "all").path).toBe("/solo.png");
  });
});
