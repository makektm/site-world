// A goal looks at its point from the requested distance and height, keeps the
// side the camera is already on, and never dips under the floor.
import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { goalFor, goalNeedsMove, goalShifted, standFor } from "./goal";

describe("goalFor", () => {
  it("targets the point and stands `distance` away", () => {
    const g = goalFor([2, 0, -3], { distance: 10 });
    expect(g.target.toArray()).toEqual([2, 0, -3]);
    expect(g.pos.distanceTo(g.target)).toBeCloseTo(10, 5);
    // default bearing: from +z
    expect(g.pos.x).toBeCloseTo(2, 5);
    expect(g.pos.z).toBeGreaterThan(-3);
  });

  it("keeps the bearing of `from`", () => {
    const g = goalFor([0, 0, 0], { from: [10, 5, 0] });
    expect(g.pos.x).toBeGreaterThan(0);
    expect(Math.abs(g.pos.z)).toBeLessThan(1e-6);
  });

  it("lets `azimuth` override `from`", () => {
    const g = goalFor(new Vector3(0, 0, 0), { from: [10, 5, 0], azimuth: Math.PI });
    expect(g.pos.z).toBeLessThan(0);
  });

  it("lifts the target and respects minY", () => {
    const g = goalFor([0, 0, 0], { lift: 1.5, elevation: -0.5, minY: 2 });
    expect(g.target.y).toBe(1.5);
    expect(g.pos.y).toBe(2);
  });

  it("falls back to +z when `from` is straight overhead", () => {
    const g = goalFor([1, 0, 1], { from: [1, 20, 1] });
    expect(g.pos.z).toBeGreaterThan(1);
  });
});

describe("following", () => {
  it("shifts a goal keeping its offset", () => {
    const g = goalFor([0, 0, 0]);
    const s = goalShifted(g, [3, 0, 4]);
    expect(s.target.toArray()).toEqual([3, 0, 4]);
    expect(s.pos.clone().sub(s.target).distanceTo(g.pos.clone().sub(g.target))).toBeCloseTo(0, 6);
  });

  it("asks for a move only past minMove", () => {
    const g = goalFor([0, 0, 0]);
    expect(goalNeedsMove(null, [0, 0, 0], 1)).toBe(true);
    expect(goalNeedsMove(g, [0.5, 0, 0], 1)).toBe(false);
    expect(goalNeedsMove(g, [1.2, 0, 0], 1)).toBe(true);
  });
});

describe("standFor", () => {
  it("stands on the side the walker comes from, facing the point", () => {
    const s = standFor([0, 0, 0], { from: [10, 1.6, 0], distance: 2 });
    expect(s.at[0]).toBeCloseTo(2);
    expect(s.at[1]).toBeCloseTo(0);
    expect(s.lookAt).toEqual([0, 1.5, 0]);
  });
  it("defaults to +z when there is no bearing", () => {
    const s = standFor([3, 2, 4]);
    expect(s.at[0]).toBeCloseTo(3);
    expect(s.at[1]).toBeCloseTo(5.8);
    expect(s.lookAt[1]).toBe(2);
  });
});
