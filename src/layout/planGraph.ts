// Questions a host asks of a planned building once it exists: which room is
// this point in (presence, "you are here"), which rooms open onto which (a
// guided tour, following a walker), and is every room reachable at all.
import type { CatalogPlan, DoorLink, LayoutRoom } from "./catalogLayout";

type PlanLike = Pick<CatalogPlan, "rooms" | "doorLinks">;

/** The room whose floor contains [x, z] (wall centre-lines count as inside the first room listed), or null. */
export function roomAt(plan: Pick<CatalogPlan, "rooms">, x: number, z: number): LayoutRoom | null {
  for (const r of plan.rooms) {
    if (x >= r.rect.minX && x <= r.rect.maxX && z >= r.rect.minZ && z <= r.rect.maxZ) return r;
  }
  return null;
}

/** Room id -> the rooms one door away (OUTSIDE included when there are entrances), each list in door order. */
export function roomNeighbours(plan: PlanLike): Record<string, string[]> {
  const out: Record<string, string[]> = Object.fromEntries(plan.rooms.map((r) => [r.id, [] as string[]]));
  const link = (from: string, to: string) => {
    const list = (out[from] ??= []);
    if (!list.includes(to)) list.push(to);
  };
  for (const { a, b } of plan.doorLinks) {
    link(a, b);
    link(b, a);
  }
  return out;
}

/** Every room id (and OUTSIDE, if reachable) a walker starting in `from` can get to through doors. */
export function reachableRooms(plan: PlanLike, from: string): Set<string> {
  const next = roomNeighbours(plan);
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    for (const n of next[queue.shift()!] ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

/** The fewest-doors walk from one room to another, as the doors to pass in order; [] if already there, null if none. */
export function doorPath(plan: PlanLike, from: string, to: string): DoorLink[] | null {
  if (from === to) return [];
  const via = new Map<string, DoorLink>();
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const here = queue.shift()!;
    for (const d of plan.doorLinks) {
      const there = d.a === here ? d.b : d.b === here ? d.a : null;
      if (there === null || seen.has(there)) continue;
      seen.add(there);
      via.set(there, d);
      if (there === to) {
        const path: DoorLink[] = [];
        for (let at = to; at !== from; ) {
          const step = via.get(at)!;
          path.unshift(step);
          at = step.a === at ? step.b : step.a;
        }
        return path;
      }
      queue.push(there);
    }
  }
  return null;
}
