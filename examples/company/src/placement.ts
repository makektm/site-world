// Where the non-service things stand, worked out from the plan rather than
// typed in: a database beside the service that owns it, a domain's meters
// beside its dashboard, a note on the wall it names. All pure, so the plan can
// grow (more services, more rooms) without anyone re-measuring.
import type { FloorRect, LayoutRoom, SiteDoor } from "site-world";
import type { FactoryDomain, FactoryService } from "./factory/catalog";
import type { NoteWall } from "./factory/notes";
import { USD_PER_MTOK } from "./factory/sprawl";
import { besideSlot } from "./routes";

type SlotLike = { pos: readonly [number, number]; facing: number };

/** A database stands behind its owner's pylon, on the side away from the
 * aisle, where slots always leave room before the wall. */
export function tankSpot(slot: SlotLike): [number, number] {
  return besideSlot(slot, [0, -1.6]);
}

export const TANK_RADIUS = 0.4;
export const TANK_HEIGHT = 1.4;

/** A wall's floor line point and the turn that faces something on it into the room. */
export interface WallSpot {
  wall: [number, number];
  rotationY: number;
}

const FACING: Record<NoteWall, number> = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 };

function doorGaps(doors: readonly SiteDoor[], axis: "x" | "z", at: number): [number, number][] {
  return doors
    .filter((d) => d.doorway.axis === axis && Math.abs((axis === "x" ? d.doorway.center[1] : d.doorway.center[0]) - at) < 1e-6)
    .map((d) => {
      const c = axis === "x" ? d.doorway.center[0] : d.doorway.center[1];
      return [c - d.doorway.halfWidth, c + d.doorway.halfWidth];
    });
}

/** Nearest point to `want` in [lo, hi] that keeps `half` clear of every gap. */
function clearOf(want: number, half: number, lo: number, hi: number, gaps: readonly [number, number][]): number {
  const ok = (v: number) => v - half >= lo && v + half <= hi && gaps.every(([a, b]) => v + half <= a || v - half >= b);
  for (let step = 0; step <= hi - lo; step += 0.1) {
    if (ok(want - step)) return want - step;
    if (ok(want + step)) return want + step;
  }
  return Math.min(hi - half, Math.max(lo + half, want));
}

/** Floor things standing against a wall (closer than `reach`) block the stretch of wall behind them. */
function blockedBy(obstacles: readonly (readonly [number, number])[], axis: "x" | "z", at: number, reach = 1.2, half = 0.7): [number, number][] {
  return obstacles
    .filter((p) => Math.abs((axis === "x" ? p[1] : p[0]) - at) < reach)
    .map((p) => {
      const c = axis === "x" ? p[0] : p[1];
      return [c - half, c + half];
    });
}

/** A spot on one wall of a room level with `near` (a pylon), slid clear of
 * doorways, corners and anything standing in front of that wall (`obstacles`, floor points). */
export function wallSpot(
  room: Pick<LayoutRoom, "rect">,
  side: NoteWall,
  near: readonly [number, number],
  doors: readonly SiteDoor[],
  half = 0.4,
  obstacles: readonly (readonly [number, number])[] = [],
): WallSpot {
  const r = room.rect;
  const rotationY = FACING[side];
  if (side === "north" || side === "south") {
    const z = side === "north" ? r.minZ : r.maxZ;
    const gaps = [...doorGaps(doors, "x", z), ...blockedBy(obstacles, "x", z)];
    return { wall: [clearOf(near[0], half, r.minX + 0.3, r.maxX - 0.3, gaps), z], rotationY };
  }
  const x = side === "west" ? r.minX : r.maxX;
  const gaps = [...doorGaps(doors, "z", x), ...blockedBy(obstacles, "z", x)];
  return { wall: [x, clearOf(near[1], half, r.minZ + 0.3, r.maxZ - 0.3, gaps)], rotationY };
}

/**
 * Floor points for `count` meters standing in a row beside a room's board
 * (`board` is the board's wall point; the row stands `off` metres into the
 * room), nearest the board first, skipping door gaps and corners.
 */
export function meterSpots(
  room: Pick<LayoutRoom, "rect">,
  board: { wall: readonly [number, number]; rotationY: number },
  doors: readonly SiteDoor[],
  count: number,
  { boardHalf = 1.9, pitch = 0.55, off = 0.55 } = {},
): [number, number][] {
  const r = room.rect;
  const [bx, bz] = board.wall;
  const gaps = doorGaps(doors, "x", bz);
  const into = Math.cos(board.rotationY) >= 0 ? 1 : -1;
  const ok = (x: number) => x - 0.3 >= r.minX && x + 0.3 <= r.maxX && gaps.every(([a, b]) => x + 0.35 <= a || x - 0.35 >= b);
  const out: [number, number][] = [];
  for (let k = 0; out.length < count && k < 40; k += 1) {
    // Fan out from the board's edges, alternating sides, so a row splits round
    // a doorway instead of giving up.
    for (const sign of [1, -1]) {
      const x = bx + sign * (boardHalf + 0.5 + k * pitch);
      if (out.length < count && ok(x)) out.push([x, bz + into * off]);
    }
  }
  return out;
}

export interface DomainSpend {
  /** Compute and storage plus the LLM tokens the domain's services burn, USD/day. */
  usdPerDay: number;
  tokensPerDay: number;
}

export function domainSpend(services: readonly FactoryService[]): Record<FactoryDomain, DomainSpend> {
  const out = {} as Record<FactoryDomain, DomainSpend>;
  for (const s of services) {
    const d = (out[s.domain] ??= { usdPerDay: 0, tokensPerDay: 0 });
    d.usdPerDay += s.costPerDay + (s.tokensPerDay / 1e6) * USD_PER_MTOK;
    d.tokensPerDay += s.tokensPerDay;
  }
  return out;
}

/** True when the rect contains the point (edges included). */
export function inside(r: FloorRect, p: readonly [number, number]): boolean {
  return p[0] >= r.minX && p[0] <= r.maxX && p[1] >= r.minZ && p[1] <= r.maxZ;
}
