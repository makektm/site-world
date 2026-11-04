// The building, as plain data: four 10m rooms in a 2x2 grid, one per domain,
// with a doorway in each wall they share. North is -z.
//
//        x<0           x>0
//   z<0  EDGE    <->   COMMERCE
//         ^               ^
//   z>0  PLATFORM <->  PAYMENTS
import {
  DOOR_H, PANEL_STANDOFF, WALL, type DoorSignSpec, type SiteDoor, type WallSegment,
} from "site-world";
import type { Domain } from "./services";

export const HALF = 10; // the building: x, z in [-10, 10]
const T = 0.2; // wall thickness
const GAP = 1.2; // door half-width
const Y = WALL / 2;

export const BOUNDS = { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };

export interface RoomInfo {
  id: Domain;
  name: string;
  sub: string;
  /** Floor centre [x, z]. */
  center: readonly [number, number];
}

export const ROOMS: Record<Domain, RoomInfo> = {
  edge: { id: "edge", name: "EDGE", sub: "traffic in · identity", center: [-5, -5] },
  commerce: { id: "commerce", name: "COMMERCE", sub: "catalog · search · orders", center: [5, -5] },
  payments: { id: "payments", name: "PAYMENTS", sub: "money · PCI zone", center: [5, 5] },
  platform: { id: "platform", name: "PLATFORM", sub: "async · data", center: [-5, 5] },
};

/** A wall run along x (at z) or along z (at x) from `a` to `b`, split around
 * a doorway centred at `door` if given. */
function run(axis: "x" | "z", at: number, a: number, b: number, door?: number): WallSegment[] {
  const piece = (p: number, q: number): WallSegment =>
    axis === "x"
      ? { pos: [(p + q) / 2, Y, at], size: [q - p, WALL, T] }
      : { pos: [at, Y, (p + q) / 2], size: [T, WALL, q - p] };
  if (door === undefined) return [piece(a, b)];
  const header: WallSegment =
    axis === "x"
      ? { pos: [door, DOOR_H + (WALL - DOOR_H) / 2, at], size: [GAP * 2, WALL - DOOR_H, T] }
      : { pos: [at, DOOR_H + (WALL - DOOR_H) / 2, door], size: [T, WALL - DOOR_H, GAP * 2] };
  return [piece(a, door - GAP), piece(door + GAP, b), header];
}

export const WALLS: WallSegment[] = [
  // the shell
  ...run("x", -HALF, -HALF, HALF),
  ...run("x", HALF, -HALF, HALF),
  ...run("z", -HALF, -HALF, HALF),
  ...run("z", HALF, -HALF, HALF),
  // the cross between the rooms, a door in each arm
  ...run("z", 0, -HALF, 0, -5), // EDGE | COMMERCE
  ...run("z", 0, 0, HALF, 5), // PLATFORM | PAYMENTS
  ...run("x", 0, -HALF, 0, -5), // EDGE / PLATFORM
  ...run("x", 0, 0, HALF, 5), // COMMERCE / PAYMENTS
];

export const DOORS: SiteDoor[] = [
  { id: "edge-commerce", code: "E-C", doorway: { center: [0, -5], axis: "z", halfWidth: GAP }, kind: "slide" },
  { id: "platform-payments", code: "P-P", doorway: { center: [0, 5], axis: "z", halfWidth: GAP }, kind: "slide" },
  { id: "edge-platform", code: "E-P", doorway: { center: [-5, 0], axis: "x", halfWidth: GAP }, kind: "slide" },
  // Into the PCI zone: a heavier, bi-parting door.
  { id: "commerce-payments", code: "PCI", doorway: { center: [5, 0], axis: "x", halfWidth: GAP }, kind: "biparting" },
];

/** Two banners per doorway, one on each face of its header, each naming the
 * room on the far side. */
function banners(door: SiteDoor, a: Domain, b: Domain, i: number): DoorSignSpec[] {
  const { center, axis } = door.doorway;
  const y = DOOR_H + (WALL - DOOR_H) / 2;
  // A doorway in a wall running along z separates rooms to its -x and +x.
  const sides: [Domain, number][] = axis === "z" ? [[b, -Math.PI / 2], [a, Math.PI / 2]] : [[b, Math.PI], [a, 0]];
  return sides.map(([behind, rotationY], j) => {
    const out = PANEL_STANDOFF;
    const pos: [number, number, number] = [
      center[0] + Math.sin(rotationY) * out,
      y,
      center[1] + Math.cos(rotationY) * out,
    ];
    return {
      label: ROOMS[behind].name,
      sub: ROOMS[behind].sub,
      panelId: `D${i * 2 + j + 1}`,
      wall: center,
      pos,
      rotationY,
      width: GAP * 2,
      height: 1.0,
    };
  });
}

// [door, the room on its -x/-z side, the room on its +x/+z side]
export const DOOR_SIGNS: DoorSignSpec[] = [
  ...banners(DOORS[0]!, "edge", "commerce", 0),
  ...banners(DOORS[1]!, "platform", "payments", 1),
  ...banners(DOORS[2]!, "edge", "platform", 2),
  ...banners(DOORS[3]!, "commerce", "payments", 3),
];
