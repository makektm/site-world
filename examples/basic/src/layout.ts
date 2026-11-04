// The world's layout, as plain data: one room, a door in its south wall
// into a small annex, and the walls around both. Everything site-world draws or
// collides with is derived from these numbers.
import { DOOR_H, WALL, type SiteDoor, type WallSegment } from "site-world";

export const HALF = 6; // room: x, z in [-6, 6]
export const ANNEX_Z = 10; // annex: z in [6, 10], x in [-2, 2]
export const GAP = 1.5; // door half-width
const T = 0.2; // wall thickness
const Y = WALL / 2;

export const WALLS: WallSegment[] = [
  { pos: [0, Y, -HALF], size: [HALF * 2, WALL, T] }, // north
  { pos: [-HALF, Y, 0], size: [T, WALL, HALF * 2] }, // west
  { pos: [HALF, Y, 0], size: [T, WALL, HALF * 2] }, // east
  // south wall, split around the door gap
  { pos: [-(HALF + GAP) / 2, Y, HALF], size: [HALF - GAP, WALL, T] },
  { pos: [(HALF + GAP) / 2, Y, HALF], size: [HALF - GAP, WALL, T] },
  // the annex
  { pos: [-2, Y, (HALF + ANNEX_Z) / 2], size: [T, WALL, ANNEX_Z - HALF] },
  { pos: [2, Y, (HALF + ANNEX_Z) / 2], size: [T, WALL, ANNEX_Z - HALF] },
  { pos: [0, Y, ANNEX_Z], size: [4, WALL, T] },
  // a header over the door: a closed door meets it at DOOR_H
  { pos: [0, DOOR_H + (WALL - DOOR_H) / 2, HALF], size: [GAP * 2, WALL - DOOR_H, T] },
];

export const DOORS: SiteDoor[] = [
  { id: "annex", code: "ANX", doorway: { center: [0, HALF], axis: "x", halfWidth: GAP }, kind: "slide" },
];

export const BOUNDS = { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: ANNEX_Z };
