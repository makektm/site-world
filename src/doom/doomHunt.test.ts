// What a demon knows: that hiding works for a while, that it does not work
// forever, and that a shot gives the walker away.
import { describe, expect, it } from "vitest";
import type { NavCellSpec } from "../core/engine";
import { makeEnemy } from "./doomRules";
import { buildNav } from "./doomNav";
import {
  MEMORY, SCENT_AFTER, SENSE_EVERY, SQUEEZE_PACE, WANDER_PACE, awaken, sense, type Quarry,
} from "./doomHunt";
import { wallsAround } from "./testNav";

// One 20m room with a 6m screen down its middle, and a corridor off it.
const ROOM: NavCellSpec = { id: "room", zone: "main", minX: -10, maxX: 10, minZ: -10, maxZ: 10, y: 0 };
const TUNNEL: NavCellSpec = { id: "tunnel", zone: "tunnel", minX: 10, maxX: 20, minZ: -1, maxZ: 1, y: 0 };
const SCREEN = { minX: -0.2, maxX: 0.2, minZ: -3, maxZ: 3 };
const NAV = buildNav([ROOM, TUNNEL], [["room", "tunnel"]], [SCREEN, ...wallsAround(-10, 10, -10, 10)], [SCREEN]);

// The walker, hidden behind the screen from a demon at (-8, 0); in plain
// view of one at (4, 9).
const HIDDEN: Quarry = { x: 4, z: 0, cell: 0, heard: false };
const rand = () => 0.99;

/** Run `sense` every frame for `seconds` from `t0`, the demon standing
 * still; returns the time reached. */
function watch(e: ReturnType<typeof makeEnemy>, q: Quarry, t0: number, seconds: number): number {
  let t = t0;
  for (let i = 0; i < seconds * 60; i += 1) {
    t += 1 / 60;
    sense(e, NAV, q, t, rand);
  }
  return t;
}

function demon(x: number, z: number) {
  const e = makeEnemy(1, "imp", x, z, 0, 0);
  e.cell = 0;
  return e;
}

describe("sight", () => {
  it("a demon that can see the walker hunts them, at their real position", () => {
    const e = demon(4, 9);
    awaken(e, HIDDEN, 0);
    watch(e, HIDDEN, 0, MEMORY + 2);
    expect(e.aware).toBe("hunt");
    expect([e.goalX, e.goalZ]).toEqual([4, 0]);
  });

  it("losing sight, it tracks for its memory, then goes to where it last saw them", () => {
    const e = demon(-8, 0);
    awaken(e, { ...HIDDEN, x: -5, z: 6 }, 0);
    // The walker slips behind the screen.
    let t = watch(e, HIDDEN, 0, MEMORY - 0.5);
    expect(e.aware).toBe("hunt");
    expect([e.goalX, e.goalZ]).toEqual([4, 0]);
    t = watch(e, HIDDEN, t, 1);
    expect(e.aware).toBe("search");
    expect([e.goalX, e.goalZ]).toEqual([-5, 6]);
    expect(e.pace).toBe(1);
  });
});

describe("hiding", () => {
  it("at the last sighting and still no contact, it wanders — slower, elsewhere", () => {
    const e = demon(-5, 6);
    awaken(e, { ...HIDDEN, x: -5, z: 6 }, 0);
    watch(e, HIDDEN, 0, MEMORY + 1);
    expect(e.aware).toBe("wander");
    expect(e.pace).toBe(WANDER_PACE);
    // Wandering toward a cell of the plan, not toward the walker.
    expect([e.goalX, e.goalZ]).toEqual([15, 0]);
  });

  it("but not forever: wandering long enough, it catches the scent", () => {
    const e = demon(-5, 6);
    awaken(e, { ...HIDDEN, x: -5, z: 6 }, 0);
    let t = watch(e, HIDDEN, 0, MEMORY + 1);
    expect(e.aware).toBe("wander");
    t = watch(e, HIDDEN, t, SCENT_AFTER - 1);
    expect(e.aware).toBe("wander");
    watch(e, HIDDEN, t, 1 + SENSE_EVERY);
    expect(e.aware).toBe("hunt");
    expect([e.goalX, e.goalZ]).toEqual([4, 0]);
  });

  it("a shot gives the walker away to a demon that cannot see them", () => {
    const e = demon(-5, 6);
    awaken(e, { ...HIDDEN, x: -5, z: 6 }, 0);
    const t = watch(e, HIDDEN, 0, MEMORY + 1);
    expect(e.aware).toBe("wander");
    watch(e, { ...HIDDEN, heard: true }, t, SENSE_EVERY * 2);
    expect(e.aware).toBe("hunt");
  });

  it("close enough, it smells the walker through the screen", () => {
    const e = demon(-1.5, 0);
    awaken(e, { ...HIDDEN, x: -8, z: 8 }, 0);
    watch(e, { ...HIDDEN, x: 1.5, z: 0 }, 0, MEMORY + 1);
    expect(e.aware).toBe("hunt");
  });
});

describe("the tunnel", () => {
  it("is a squeeze for a brute, and no trouble for an imp", () => {
    const brute = makeEnemy(1, "brute", 15, 0, 0, 0);
    brute.cell = 1;
    const imp = makeEnemy(2, "imp", 15, 0, 0, 0);
    imp.cell = 1;
    const q: Quarry = { x: 18, z: 0, cell: 1, heard: false };
    awaken(brute, q, 0);
    awaken(imp, q, 0);
    sense(brute, NAV, q, 0.1, rand);
    sense(imp, NAV, q, 0.1, rand);
    expect(brute.pace).toBe(SQUEEZE_PACE);
    expect(imp.pace).toBe(1);
  });
});
