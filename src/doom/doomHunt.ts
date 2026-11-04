// What a demon knows about where the walker is, and so where it is going.
// Hiding is meant to work, briefly: a demon hunts what it can see, smell or
// hear, tracks the walker for a few seconds after losing sight of them (so
// ducking round a corner doesn't shake a demon on your heels), then walks
// to the last place it saw them, then wanders the plan — slower, cell to
// cell — until either it stumbles into contact or it catches the scent
// again on its own. So a walker who breaks line of sight and keeps quiet
// buys roughly MEMORY + the search + SCENT_AFTER seconds; one who fires
// gives themself away to everything within earshot.
//
// Brutes are also slowed in a corridor: at their size it is a squeeze, which
// makes a corridor the one place a brute can be outrun and fought on the
// walker's terms.
//
// Pure: nav reads, number writes, no allocation.

import type { Enemy } from "./doomRules";
import { lineClear, zoneOf, type Nav } from "./doomNav";

export type Awareness = "hunt" | "search" | "wander";

/** Where the walker is, as the demons may know it: on the plan (see
 * doomNav.ts's locate), and whether a shot rang out just now. */
export interface Quarry {
  x: number;
  z: number;
  cell: number;
  heard: boolean;
}

// Seen at any range down a clear line; a large arena's diagonal is ~27m.
export const SIGHT_RANGE = 30;
// Close enough to sense round a corner or through a crate.
export const SMELL_RANGE = 3.5;
// A shot carries this far, walls or not.
export const HEAR_RANGE = 18;
// How long a demon keeps tracking after it loses contact.
export const MEMORY = 3.5;
// Senses are checked on this cadence, not every frame: a line of sight is
// the one per-demon test that walks every wall on the plan.
export const SENSE_EVERY = 0.15;
// Arrived at the last sighting: close enough to give up and start wandering.
export const SEARCH_REACH = 1.3;
// A search that cannot reach its spot (the walker stood where a demon
// doesn't fit) gives up after this long.
export const SEARCH_GIVE_UP = 10;
export const WANDER_PACE = 0.55;
export const WANDER_RETARGET = 5;
// Wandering this long, a demon catches the scent again on its own.
export const SCENT_AFTER = 9;
export const SQUEEZE_PACE = 0.6;

function remember(e: Enemy, q: Quarry, now: number): void {
  e.aware = "hunt";
  e.seenAt = now;
  e.lastX = q.x;
  e.lastZ = q.z;
  e.lastCell = q.cell;
}

/** A freshly summoned demon knows where the walker was when it rose. */
export function awaken(e: Enemy, q: Quarry, now: number): void {
  remember(e, q, now);
  e.senseAt = now + (e.id % 7) * (SENSE_EVERY / 7);
}

/** Update what `e` knows, and set its goal (goalX/goalZ/goalCell) and its
 * pace for this frame. */
export function sense(e: Enemy, nav: Nav, q: Quarry, now: number, rand: () => number): void {
  if (now >= e.senseAt) {
    e.senseAt = now + SENSE_EVERY;
    const dist = Math.hypot(q.x - e.x, q.z - e.z);
    const contact =
      dist < SMELL_RANGE ||
      (q.heard && dist < HEAR_RANGE) ||
      (dist < SIGHT_RANGE && lineClear(nav.sight, e.x, e.z, q.x, q.z));
    if (contact) remember(e, q, now);
  }

  if (e.aware === "hunt" && now - e.seenAt > MEMORY) {
    e.aware = "search";
    e.searchSince = now;
  }
  if (e.aware === "search") {
    const there = Math.hypot(e.lastX - e.x, e.lastZ - e.z) < SEARCH_REACH;
    if (there || now - e.searchSince > SEARCH_GIVE_UP) {
      e.aware = "wander";
      e.wanderSince = now;
      e.wanderAt = now;
    }
  }
  if (e.aware === "wander" && now - e.wanderSince > SCENT_AFTER) remember(e, q, now);

  switch (e.aware) {
    case "hunt":
      // Within its memory it tracks the walker's real position — it heard
      // the footsteps round the corner.
      e.goalX = q.x;
      e.goalZ = q.z;
      e.goalCell = q.cell;
      break;
    case "search":
      e.goalX = e.lastX;
      e.goalZ = e.lastZ;
      e.goalCell = e.lastCell;
      break;
    case "wander": {
      const arrived = Math.hypot(e.goalX - e.x, e.goalZ - e.z) < SEARCH_REACH;
      if (now >= e.wanderAt || arrived) {
        const c = nav.cells[Math.min(nav.cells.length - 1, Math.floor(rand() * nav.cells.length))]!;
        e.goalCell = c.index;
        e.goalX = c.cx;
        e.goalZ = c.cz;
        e.wanderAt = now + WANDER_RETARGET;
      }
      break;
    }
  }

  let pace = e.aware === "wander" ? WANDER_PACE : 1;
  if (e.kind === "brute" && zoneOf(nav, e.cell) === "tunnel") pace *= SQUEEZE_PACE;
  e.pace = pace;
}

/** How far apart in height a demon and the walker's feet may be and still
 * touch: a demon on the floor cannot bite, or slam, the walker up on the
 * gallery, and one on the gallery cannot reach down off its edge. */
export const REACH_RISE = 0.9;

export function sameLevel(e: Enemy, feetY: number): boolean {
  return Math.abs(e.y - feetY) < REACH_RISE;
}
