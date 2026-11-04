// The door leaf's plating as data. What could go wrong with a metal look is
// plates that are the wrong size for the door they sit on, a rivet drawn off
// the leaf, or a brushing that changes every time the door remounts.
import { describe, expect, it } from "vitest";
import { doorLayout, KICK_H, PLATE_W, RIVET_INSET, seeded } from "./doorMetal";
import { DOOR_H } from "../core/engine";


// Leaf widths spanning the range a doorway takes: narrow, typical, and a wide
// bi-parting pair's single panel.
const WIDTHS = [1.6, 3.2, 3.6, 4, 7.2];

describe("doorLayout", () => {
  it("divides every door into plates no wider than PLATE_W", () => {
    for (const width of WIDTHS) {
      const { seamsX } = doorLayout(width);
      const edges = [0, ...seamsX, width];
      for (let i = 1; i < edges.length; i++) {
        expect(edges[i]! - edges[i - 1]!).toBeLessThanOrEqual(PLATE_W + 1e-9);
      }
    }
  });

  it("puts seams strictly inside the leaf, in order", () => {
    for (const width of WIDTHS) {
      const { seamsX, seamsY } = doorLayout(width);
      for (const x of seamsX) expect(x).toBeGreaterThan(0);
      for (const x of seamsX) expect(x).toBeLessThan(width);
      expect([...seamsX].sort((a, b) => a - b)).toEqual(seamsX);
      for (const y of seamsY) {
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(DOOR_H);
      }
      // The lowest seam is the kick plate's top edge.
      expect(Math.max(...seamsY)).toBeCloseTo(DOOR_H - KICK_H, 9);
    }
  });

  it("keeps every rivet on the leaf and off its edge", () => {
    for (const width of WIDTHS) {
      for (const [x, y] of doorLayout(width).rivets) {
        expect(x).toBeGreaterThanOrEqual(RIVET_INSET - 1e-9);
        expect(x).toBeLessThanOrEqual(width - RIVET_INSET + 1e-9);
        expect(y).toBeGreaterThanOrEqual(RIVET_INSET - 1e-9);
        expect(y).toBeLessThanOrEqual(DOOR_H - RIVET_INSET + 1e-9);
      }
    }
  });

  it("shows more plates on a wider door, not bigger ones", () => {
    const narrow = doorLayout(1.2);
    const wide = doorLayout(7.2);
    expect(narrow.seamsX.length).toBe(0);
    expect(wide.seamsX.length).toBeGreaterThan(narrow.seamsX.length);
    expect(wide.rivets.length).toBeGreaterThan(narrow.rivets.length);
  });
});

describe("seeded", () => {
  it("repeats for a seed and differs between seeds", () => {
    const a = seeded(7);
    const b = seeded(7);
    const c = seeded(8);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    for (const v of first) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
