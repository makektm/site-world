import { describe, expect, it } from "vitest";
import { AGENT_WALK_SPEED, floorHeading, pathLength, samplePath, walkPath } from "./agentPath";

const L = [[0, 0], [4, 0], [4, 3]] as const;

describe("agentPath", () => {
  it("measures open and looped paths", () => {
    expect(pathLength(L)).toBeCloseTo(7);
    expect(pathLength(L, true)).toBeCloseTo(12);
    expect(pathLength([])).toBe(0);
    expect(pathLength([[1, 1]])).toBe(0);
  });

  it("uses the engine's heading convention (0 faces +z, PI/2 faces +x)", () => {
    expect(floorHeading([0, 0], [0, 1])).toBeCloseTo(0);
    expect(floorHeading([0, 0], [1, 0])).toBeCloseTo(Math.PI / 2);
    expect(floorHeading([0, 0], [-1, 0])).toBeCloseTo(-Math.PI / 2);
    expect(floorHeading([2, 2], [2, 2])).toBe(0);
  });

  it("interpolates along legs and turns at corners", () => {
    const a = samplePath(L, 2);
    expect([a.x, a.z]).toEqual([2, 0]);
    expect(a.heading).toBeCloseTo(Math.PI / 2);
    expect(a.done).toBe(false);
    const b = samplePath(L, 5.5);
    expect(b.x).toBeCloseTo(4);
    expect(b.z).toBeCloseTo(1.5);
    expect(b.heading).toBeCloseTo(0);
  });

  it("clamps an open path at both ends and reports done", () => {
    const start = samplePath(L, -3);
    expect([start.x, start.z, start.done]).toEqual([0, 0, false]);
    const end = samplePath(L, 99);
    expect(end.x).toBeCloseTo(4);
    expect(end.z).toBeCloseTo(3);
    expect(end.done).toBe(true);
    expect(end.distance).toBeCloseTo(7);
  });

  it("wraps a loop and never finishes it", () => {
    const s = samplePath(L, 12 + 1, true);
    expect(s.x).toBeCloseTo(1);
    expect(s.z).toBeCloseTo(0);
    expect(s.done).toBe(false);
    // On the closing leg, heading back toward the first point.
    const back = samplePath(L, 9.5, true);
    expect(back.heading).toBeCloseTo(floorHeading([4, 3], [0, 0]));
  });

  it("keeps the heading through repeated waypoints", () => {
    const pause = [[0, 0], [2, 0], [2, 0], [2, 2]] as const;
    expect(samplePath(pause, 2).heading).toBeCloseTo(Math.PI / 2);
    expect(samplePath(pause, 3).heading).toBeCloseTo(0);
  });

  it("handles degenerate paths", () => {
    expect(samplePath([], 1)).toEqual({ x: 0, z: 0, heading: 0, distance: 0, done: true });
    expect(samplePath([[3, 4]], 1)).toMatchObject({ x: 3, z: 4, done: true });
    expect(samplePath([[3, 4], [3, 4]], 1)).toMatchObject({ x: 3, z: 4, done: true });
  });

  it("walks at the given speed", () => {
    const s = walkPath(L, 2);
    expect(s.x).toBeCloseTo(2 * AGENT_WALK_SPEED);
    expect(walkPath(L, 1, 3).x).toBeCloseTo(3);
    expect(walkPath(L, -5).x).toBe(0);
  });
});
