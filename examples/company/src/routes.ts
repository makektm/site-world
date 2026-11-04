// Where people and agents stand, and the way they walk between services.
//
// The plan only promises that every doorway sits on one of a room's aisle
// lines, and that slots keep clear of those lines. So walkers keep to lanes
// beside the aisles and turn only where lanes cross: a route never cuts
// through a pylon's ring or a wall, whatever the catalogue makes the plan.
import { doorPath, type CatalogPlan, type LayoutRoom, type PathPoint, type SiteDoor } from "site-world";

/** Lanes run this far off the aisle's centre line: clear of the on-call plinth
 * at EDGE's crossing, well inside every door's half-width. */
export const LANE = 0.6;

type Lane = { kind: "h"; z: number } | { kind: "v"; x: number };

type Plan = Pick<CatalogPlan, "rooms" | "doorLinks" | "roomById">;

/** A floor point beside a slot, in the slot's own frame (+z toward its aisle). */
export function besideSlot(slot: { pos: readonly [number, number]; facing: number }, local: readonly [number, number]): [number, number] {
  const [lx, lz] = local;
  const c = Math.cos(slot.facing);
  const s = Math.sin(slot.facing);
  return [slot.pos[0] + lx * c + lz * s, slot.pos[1] - lx * s + lz * c];
}

/** Where an agent stands to work on a service: in front of the pylon and to
 * its right, off the name plate and outside the replica ring. */
export function workSpot(slot: { pos: readonly [number, number]; facing: number }): [number, number] {
  return besideSlot(slot, [1.25, 0.95]);
}

/** Where people gather in a room: just off the aisle crossing, out of the lanes. */
export function roomSpot(room: Pick<LayoutRoom, "aisleZ" | "aisleXs" | "center">): [number, number] {
  return [(room.aisleXs[0] ?? room.center[0]) - 0.9, room.aisleZ - 0.9];
}

function lanesOf(room: LayoutRoom): Lane[] {
  return [{ kind: "h", z: room.aisleZ + LANE }, ...room.aisleXs.map((x): Lane => ({ kind: "v", x: x + LANE }))];
}

function laneDistance(p: PathPoint, l: Lane): number {
  return l.kind === "h" ? Math.abs(p[1] - l.z) : Math.abs(p[0] - l.x);
}

function nearestLane(room: LayoutRoom, p: PathPoint): Lane {
  return lanesOf(room).reduce((best, l) => (laneDistance(p, l) < laneDistance(p, best) ? l : best));
}

function onLane(p: PathPoint, l: Lane): PathPoint {
  return l.kind === "h" ? [p[0], l.z] : [l.x, p[1]];
}

function sameLane(a: Lane, b: Lane): boolean {
  return a.kind === b.kind && (a.kind === "h" ? a.z === (b as typeof a).z : a.x === (b as { x: number }).x);
}

/** Along lanes from a point on `la` to `b` (on `lb`): the turns, then `b`. */
function laneWalk(room: LayoutRoom | undefined, la: Lane, b: PathPoint, lb: Lane): PathPoint[] {
  if (sameLane(la, lb) || !room) return [b];
  if (la.kind === "h" && lb.kind === "v") return [[lb.x, la.z], b];
  if (la.kind === "v" && lb.kind === "h") return [[la.x, lb.z], b];
  // Two different column aisles: over by the room's cross aisle.
  const h = room.aisleZ + LANE;
  if (la.kind === "v" && lb.kind === "v") return [[la.x, h], [lb.x, h], b];
  // Two horizontal lanes never happen in one room; go straight rather than guess.
  return [b];
}

/** A door's lane and its point on that lane. */
function doorLane(d: SiteDoor): { lane: Lane; at: PathPoint } {
  const [cx, cz] = d.doorway.center;
  // axis "z": the wall runs along z, so walkers pass through along x.
  return d.doorway.axis === "z"
    ? { lane: { kind: "h", z: cz + LANE }, at: [cx, cz + LANE] }
    : { lane: { kind: "v", x: cx + LANE }, at: [cx + LANE, cz] };
}

function dedupe(points: PathPoint[]): PathPoint[] {
  const out: PathPoint[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-3) out.push(p);
  }
  return out;
}

/** Waypoints from `from` in room `fromRoom` to `to` in room `toRoom`, through
 * the fewest doors. With no route between the rooms it is a straight line. */
export function routeBetween(
  plan: Plan,
  doors: readonly SiteDoor[],
  from: PathPoint,
  fromRoom: string,
  to: PathPoint,
  toRoom: string,
): PathPoint[] {
  const links = doorPath(plan, fromRoom, toRoom);
  const start = plan.roomById[fromRoom];
  const end = plan.roomById[toRoom];
  if (!links || !start || !end) return [from, to];
  const byId = new Map(doors.map((d) => [d.id, d]));
  let lane = nearestLane(start, from);
  let room = fromRoom;
  const points: PathPoint[] = [from, onLane(from, lane)];
  for (const link of links) {
    const door = byId.get(link.door);
    if (!door) return [from, to];
    const d = doorLane(door);
    const leg = laneWalk(plan.roomById[room], lane, d.at, d.lane);
    points.push(...leg);
    lane = d.lane;
    room = link.a === room ? link.b : link.a;
  }
  const endLane = nearestLane(end, to);
  points.push(...laneWalk(end, lane, onLane(to, endLane), endLane), to);
  return dedupe(points);
}
