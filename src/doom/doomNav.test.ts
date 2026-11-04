// The floor plan's geometry on a small made-up plan — a room, a corridor
// off it, a ledge beside the corridor that touches it but is not linked to
// it, and a ramp up to the ledge at the far end — so each rule can be seen
// on its own.
import { describe, expect, it } from "vitest";
import type { NavCellSpec } from "../core/engine";
import {
  buildNav, cellAt, floorY, lineClear, locate, moveBody, portalBetween, routeToward, slide, waypoint,
  type NavBody, type Point,
} from "./doomNav";

const cell = (id: string, minX: number, maxX: number, minZ: number, maxZ: number, y = 0): NavCellSpec => ({
  id, zone: "main", minX, maxX, minZ, maxZ, y,
});

// room: x 0..10, z 0..10. corridor: x 10..20, z 4..6, off the room's east
// side. ledge: x 10..20, z 6..8, beside the corridor, 1m up, linked to
// nothing but a ramp at its far end.
const ROOM = cell("room", 0, 10, 0, 10);
const CORRIDOR = cell("corridor", 10, 20, 4, 6);
const LEDGE = cell("ledge", 10, 18, 6, 8, 1);
const RAMP: NavCellSpec = { ...cell("ramp", 18, 20, 6, 8), ramp: { footZ: 6, topZ: 8, rise: 1 } };
// A pillar in the room.
const PILLAR = { minX: 4, maxX: 6, minZ: 4, maxZ: 6 };
const T = 0.1;
const wall = (minX: number, maxX: number, minZ: number, maxZ: number) => ({
  minX: minX - T, maxX: maxX + T, minZ: minZ - T, maxZ: maxZ + T,
});
// The room's four walls, its east one open where the corridor leaves; the
// corridor's south wall; the ledge's north wall and the far end. Nothing
// between the corridor and the ledge: that edge is a drop, not a wall.
const WALLS = [
  wall(0, 10, 0, 0), wall(0, 10, 10, 10), wall(0, 0, 0, 10), wall(10, 10, 0, 4), wall(10, 10, 6, 10),
  wall(10, 20, 4, 4), wall(10, 20, 8, 8), wall(20, 20, 4, 8),
];
const NAV = buildNav(
  [ROOM, CORRIDOR, LEDGE, RAMP],
  [["room", "corridor"], ["corridor", "ramp"], ["ramp", "ledge"]],
  [PILLAR, ...WALLS],
  [PILLAR],
);

function body(x: number, z: number): NavBody {
  return { x, z, cell: cellAt(NAV, x, z), vx: 0, vz: 0, kx: 0, kz: 0 };
}

describe("building the plan", () => {
  it("finds each link's opening on the edge its two cells share", () => {
    const p = NAV.portals[portalBetween(NAV, 0, 1)]!;
    expect([p.line, p.at, p.lo, p.hi]).toEqual(["x", 10, 4, 6]);
  });

  it("refuses a link between cells that do not touch, and a cell that isn't there", () => {
    expect(() => buildNav([ROOM, RAMP], [["room", "ramp"]], [], [])).toThrow(/share no edge/);
    expect(() => buildNav([ROOM], [["room", "nowhere"]], [], [])).toThrow(/no such cell/);
  });

  it("links only what it is told to: touching is not linked", () => {
    expect(portalBetween(NAV, 1, 2)).toBe(-1);
  });
});

describe("where a point is", () => {
  it("names the cell, and none off the plan", () => {
    expect(cellAt(NAV, 5, 5)).toBe(0);
    expect(cellAt(NAV, 15, 5)).toBe(1);
    expect(cellAt(NAV, 15, 12)).toBe(-1);
  });

  it("reads floor height off a ledge and along a ramp", () => {
    expect(floorY(NAV, 2, 12, 7)).toBe(1);
    expect(floorY(NAV, 3, 19, 6)).toBe(0);
    expect(floorY(NAV, 3, 19, 7)).toBeCloseTo(0.5);
    expect(floorY(NAV, 3, 19, 8)).toBe(1);
  });

  it("pulls a point off the plan onto the first cell, at its nearest edge", () => {
    const out: Point = { x: 0, z: 0 };
    expect(locate(NAV, -3, 5, out)).toBe(0);
    expect(out).toEqual({ x: 0, z: 5 });
    expect(locate(NAV, 15, 5, out)).toBe(1);
    expect(out).toEqual({ x: 15, z: 5 });
  });
});

describe("routes", () => {
  it("heads for the first portal on the way, just past its middle", () => {
    const out: Point = { x: 0, z: 0 };
    // Room to ledge goes room → corridor → ramp → ledge.
    expect(waypoint(NAV, 0, 2, out)).toBe(true);
    expect(out.x).toBeGreaterThan(10);
    expect(out.z).toBeCloseTo(5);
    expect(waypoint(NAV, 1, 2, out)).toBe(true);
    expect(out.x).toBeCloseTo(19);
    expect(out.z).toBeGreaterThan(6);
    expect(waypoint(NAV, 1, 1, out)).toBe(false);
  });

  it("goes straight for a goal in the same cell, or the next one in plain sight", () => {
    const out: Point = { x: 0, z: 0 };
    expect(routeToward(NAV, 0, 1, 1, 0, 8, 8, out)).toBe(true);
    expect(routeToward(NAV, 0, 8, 5, 1, 14, 5, out)).toBe(true);
    // A goal on the ledge above, though it is right there: via the ramp.
    expect(routeToward(NAV, 1, 12, 5, 2, 12, 7, out)).toBe(false);
    expect(out.x).toBeCloseTo(19);
  });
});

describe("moving", () => {
  it("never goes through a wall, however hard it is shoved", () => {
    const b = body(5, 1);
    moveBody(NAV, b, 0, -40, 0.4);
    expect(b.z).toBeGreaterThanOrEqual(0.1 + 0.4 - 1e-9);
    expect(b.cell).toBe(0);
  });

  it("crosses into a linked cell through its portal, and says so", () => {
    const b = body(9.5, 5);
    moveBody(NAV, b, 2, 0, 0.4);
    expect(b.x).toBeCloseTo(11.5);
    expect(b.cell).toBe(1);
  });

  it("will not step off the corridor onto the ledge beside it, or climb up from it — but slides along", () => {
    const b = body(14, 5.5);
    moveBody(NAV, b, 1, 1.5, 0.4);
    expect(b.cell).toBe(1);
    expect(b.z).toBeLessThanOrEqual(6);
    expect(b.x).toBeCloseTo(15);
  });

  it("comes up the ramp onto the ledge", () => {
    const b = body(19, 5);
    moveBody(NAV, b, 0, 2, 0.4);
    expect(b.cell).toBe(3);
    moveBody(NAV, b, -3, 0, 0.4);
    expect(b.cell).toBe(2);
  });

  it("is pushed clear of cover it walks into", () => {
    const b = body(3, 5);
    moveBody(NAV, b, 0.8, 0, 0.4);
    expect(b.x).toBeLessThanOrEqual(4 - 0.4 + 1e-9);
  });
});

describe("seeing and steering round things", () => {
  it("a pillar blocks a line of sight, open floor does not", () => {
    expect(lineClear(NAV.sight, 1, 5, 9, 5)).toBe(false);
    expect(lineClear(NAV.sight, 1, 1, 9, 1)).toBe(true);
  });

  it("bends a heading straight at a pillar along its face instead", () => {
    const out: Point = { x: 0, z: 0 };
    slide(NAV, 3.5, 5, 0.4, 1, 0, 1, out);
    expect(out.x).toBeLessThan(0.5);
    expect(Math.abs(out.z)).toBeGreaterThan(0.8);
    // And leaves one that is clear of everything alone.
    slide(NAV, 2, 8, 0.4, 1, 0, 1, out);
    expect(out).toEqual({ x: 1, z: 0 });
  });
});
