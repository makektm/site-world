// How a demon gets from wherever it is to wherever it is going, on SITE's
// floor plan: a handful of non-overlapping floor rectangles (cells) and the
// edges between them it may cross (portals). A route is a portal-to-portal
// hop list computed once for every pair of cells when the floor plan is
// built; a frame only reads it. Walls and cover are 2D boxes a body is
// pushed out of, and a body can only change cell through a portal — so a
// demon can neither walk through a wall nor step off (or up) the gallery's
// edge, and never enters a side room: those are not cells.
//
// Plain numbers, no three.js, and nothing here allocates once the plan is
// built: every per-frame function writes into an object it is handed.

import type { NavCellSpec, NavZone } from "../core/engine";

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface NavCell extends NavCellSpec {
  index: number;
  cx: number;
  cz: number;
}

/** The open stretch of edge two linked cells share: the line x=`at` (for
 * `line` "x") or z=`at`, from `lo` to `hi` along it. */
export interface Portal {
  a: number;
  b: number;
  line: "x" | "z";
  at: number;
  lo: number;
  hi: number;
  cx: number;
  cz: number;
}

export interface Nav {
  cells: readonly NavCell[];
  portals: readonly Portal[];
  /** The portals touching each cell. */
  links: readonly (readonly number[])[];
  /** hop[from * n + to]: the first portal on the shortest route, -1 when
   * from === to or no route exists. */
  hop: Int16Array;
  /** What a body is pushed out of: walls and cover, in plan. */
  blockers: readonly Rect[];
  /** What a line of sight stops at: walls, and cover taller than an eye. */
  sight: readonly Rect[];
}

/** Anything that moves on the plan — a demon's Enemy satisfies it. */
export interface NavBody {
  x: number;
  z: number;
  /** Its cell, or -1 when not yet placed. */
  cell: number;
  vx: number;
  vz: number;
  kx: number;
  kz: number;
}

export interface Point {
  x: number;
  z: number;
}

const EPS = 1e-6;
// How far past a portal's middle a route aims, so a body passes through
// the opening instead of stopping on its line.
const PORTAL_LEAD = 0.9;
// The longest single step a body takes before its walls are checked: well
// under a wall's 0.2m thickness plus the thinnest demon's radius, so even a
// lunge or a hard shove cannot carry one clean through a wall in a frame.
const MAX_STEP = 0.12;
// How far ahead a body starts to steer along an obstacle rather than into it.
const LOOK = 0.7;

function sharedEdge(a: Rect, b: Rect): Omit<Portal, "a" | "b"> | null {
  const overlapZ = [Math.max(a.minZ, b.minZ), Math.min(a.maxZ, b.maxZ)] as const;
  const overlapX = [Math.max(a.minX, b.minX), Math.min(a.maxX, b.maxX)] as const;
  const edge = (line: "x" | "z", at: number, lo: number, hi: number) =>
    hi - lo > EPS
      ? { line, at, lo, hi, cx: line === "x" ? at : (lo + hi) / 2, cz: line === "x" ? (lo + hi) / 2 : at }
      : null;
  if (Math.abs(a.maxX - b.minX) < EPS) return edge("x", a.maxX, ...overlapZ);
  if (Math.abs(b.maxX - a.minX) < EPS) return edge("x", a.minX, ...overlapZ);
  if (Math.abs(a.maxZ - b.minZ) < EPS) return edge("z", a.maxZ, ...overlapX);
  if (Math.abs(b.maxZ - a.minZ) < EPS) return edge("z", a.minZ, ...overlapX);
  return null;
}

/** The floor plan, from its cells, the pairs of them a body may cross
 * between, and the boxes that block bodies and sight. Throws on a link
 * between cells that share no edge, so a mistyped plan fails at load, not
 * as a demon stuck in a corner. */
export function buildNav(
  specs: readonly NavCellSpec[],
  linkPairs: readonly (readonly [string, string])[],
  blockers: readonly Rect[],
  sight: readonly Rect[],
): Nav {
  const cells: NavCell[] = specs.map((s, index) => ({
    ...s, index, cx: (s.minX + s.maxX) / 2, cz: (s.minZ + s.maxZ) / 2,
  }));
  const byId = new Map(cells.map((c) => [c.id, c.index]));
  const portals: Portal[] = linkPairs.map(([ida, idb]) => {
    const a = byId.get(ida);
    const b = byId.get(idb);
    if (a === undefined || b === undefined) throw new Error(`nav link ${ida}-${idb}: no such cell`);
    const edge = sharedEdge(cells[a]!, cells[b]!);
    if (!edge) throw new Error(`nav link ${ida}-${idb}: the cells share no edge`);
    return { a, b, ...edge };
  });
  const links = cells.map((c) => portals.flatMap((p, i) => (p.a === c.index || p.b === c.index ? [i] : [])));

  // Floyd-Warshall over cells, an edge's cost the walk from one cell's
  // centre to the other's through the portal's middle; `first` keeps the
  // portal each shortest route leaves by.
  const n = cells.length;
  const dist = new Float64Array(n * n).fill(Infinity);
  const hop = new Int16Array(n * n).fill(-1);
  for (let i = 0; i < n; i += 1) dist[i * n + i] = 0;
  portals.forEach((p, pi) => {
    const a = cells[p.a]!;
    const b = cells[p.b]!;
    const cost = Math.hypot(a.cx - p.cx, a.cz - p.cz) + Math.hypot(b.cx - p.cx, b.cz - p.cz);
    dist[p.a * n + p.b] = cost;
    dist[p.b * n + p.a] = cost;
    hop[p.a * n + p.b] = pi;
    hop[p.b * n + p.a] = pi;
  });
  for (let k = 0; k < n; k += 1) {
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const via = dist[i * n + k]! + dist[k * n + j]!;
        if (via < dist[i * n + j]!) {
          dist[i * n + j] = via;
          hop[i * n + j] = hop[i * n + k]!;
        }
      }
    }
  }
  return { cells, portals, links, hop, blockers, sight };
}

function inside(c: Rect, x: number, z: number): boolean {
  return x >= c.minX - EPS && x <= c.maxX + EPS && z >= c.minZ - EPS && z <= c.maxZ + EPS;
}

/** The cell a point stands in, or -1. */
export function cellAt(nav: Nav, x: number, z: number): number {
  for (let i = 0; i < nav.cells.length; i += 1) if (inside(nav.cells[i]!, x, z)) return i;
  return -1;
}

export function zoneOf(nav: Nav, cell: number): NavZone {
  return cell >= 0 ? nav.cells[cell]!.zone : "main";
}

/** Floor height at a point in a cell: flat, or along a ramp. */
export function floorY(nav: Nav, cell: number, _x: number, z: number): number {
  if (cell < 0) return 0;
  const c = nav.cells[cell]!;
  if (!c.ramp) return c.y;
  const t = (z - c.ramp.footZ) / (c.ramp.topZ - c.ramp.footZ);
  return c.y + c.ramp.rise * Math.min(1, Math.max(0, t));
}

/** Where to aim a body for: the point `quarry` stands at, placed on the
 * plan. Off the plan (the walker in a side room) it is pulled onto the
 * first cell — the main room, which every side room opens off — at the
 * nearest point, so a demon presses at that room's doorway. Writes
 * `out` and returns its cell. */
export function locate(nav: Nav, x: number, z: number, out: Point): number {
  const c = cellAt(nav, x, z);
  if (c >= 0) {
    out.x = x;
    out.z = z;
    return c;
  }
  const m = nav.cells[0]!;
  out.x = Math.min(m.maxX, Math.max(m.minX, x));
  out.z = Math.min(m.maxZ, Math.max(m.minZ, z));
  return 0;
}

/** The portal between two cells, or -1 when they are not linked. */
export function portalBetween(nav: Nav, a: number, b: number): number {
  const ls = nav.links[a];
  if (!ls) return -1;
  for (let i = 0; i < ls.length; i += 1) {
    const p = nav.portals[ls[i]!]!;
    if ((p.a === a && p.b === b) || (p.a === b && p.b === a)) return ls[i]!;
  }
  return -1;
}

/** The next point on the route from cell `from` to cell `to`: just past
 * the middle of the first portal on it. False, with `out` untouched, when
 * the two are the same cell or unconnected. */
export function waypoint(nav: Nav, from: number, to: number, out: Point): boolean {
  if (from < 0 || to < 0) return false;
  const pi = nav.hop[from * nav.cells.length + to]!;
  if (pi < 0) return false;
  const p = nav.portals[pi]!;
  const next = nav.cells[p.a === from ? p.b : p.a]!;
  if (p.line === "x") {
    out.x = p.at + Math.sign(next.cx - p.at) * PORTAL_LEAD;
    out.z = p.cz;
  } else {
    out.x = p.cx;
    out.z = p.at + Math.sign(next.cz - p.at) * PORTAL_LEAD;
  }
  return true;
}

/** True when nothing in `rects` crosses the segment a→b on the plan. */
export function lineClear(rects: readonly Rect[], ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const loX = Math.min(ax, bx);
  const hiX = Math.max(ax, bx);
  const loZ = Math.min(az, bz);
  const hiZ = Math.max(az, bz);
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i]!;
    if (r.maxX < loX || r.minX > hiX || r.maxZ < loZ || r.minZ > hiZ) continue;
    let t0 = 0;
    let t1 = 1;
    if (Math.abs(dx) < 1e-12) {
      if (ax < r.minX || ax > r.maxX) continue;
    } else {
      let ta = (r.minX - ax) / dx;
      let tb = (r.maxX - ax) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-12) {
      if (az < r.minZ || az > r.maxZ) continue;
    } else {
      let ta = (r.minZ - az) / dz;
      let tb = (r.maxZ - az) / dz;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    return false;
  }
  return true;
}

/** Where a body in `from` should head for a goal in `to`: the goal itself
 * when it shares the cell, or stands in the next one with nothing in the
 * way; otherwise the route's next waypoint. Writes `out`; true when that
 * is the goal itself. */
export function routeToward(
  nav: Nav, from: number, x: number, z: number, to: number, gx: number, gz: number, out: Point,
): boolean {
  if (from < 0 || from === to || (portalBetween(nav, from, to) >= 0 && lineClear(nav.sight, x, z, gx, gz))) {
    out.x = gx;
    out.z = gz;
    return true;
  }
  if (waypoint(nav, from, to, out)) return false;
  out.x = gx;
  out.z = gz;
  return true;
}

/** Keep a body's new position if it is still in its cell, or has crossed
 * into a linked one through their portal's opening. */
function settle(nav: Nav, b: NavBody): boolean {
  if (b.cell < 0) {
    b.cell = cellAt(nav, b.x, b.z);
    return true;
  }
  if (inside(nav.cells[b.cell]!, b.x, b.z)) return true;
  const ls = nav.links[b.cell]!;
  for (let i = 0; i < ls.length; i += 1) {
    const p = nav.portals[ls[i]!]!;
    const other = p.a === b.cell ? p.b : p.a;
    if (!inside(nav.cells[other]!, b.x, b.z)) continue;
    const along = p.line === "x" ? b.z : b.x;
    if (along < p.lo - EPS || along > p.hi + EPS) continue;
    b.cell = other;
    return true;
  }
  return false;
}

/** Push a body of `radius` out of every blocker it overlaps, and take the
 * part of its velocity and shove that points into the one it touched. */
function pushOut(nav: Nav, b: NavBody, radius: number): void {
  const rs = nav.blockers;
  for (let i = 0; i < rs.length; i += 1) {
    const r = rs[i]!;
    if (b.x < r.minX - radius || b.x > r.maxX + radius || b.z < r.minZ - radius || b.z > r.maxZ + radius) continue;
    const qx = Math.min(r.maxX, Math.max(r.minX, b.x));
    const qz = Math.min(r.maxZ, Math.max(r.minZ, b.z));
    let nx = b.x - qx;
    let nz = b.z - qz;
    const d2 = nx * nx + nz * nz;
    if (d2 >= radius * radius) continue;
    let depth: number;
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      nx /= d;
      nz /= d;
      depth = radius - d;
    } else {
      // The centre is inside the box: out through the nearest face.
      const toMinX = b.x - r.minX;
      const toMaxX = r.maxX - b.x;
      const toMinZ = b.z - r.minZ;
      const toMaxZ = r.maxZ - b.z;
      const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
      nx = m === toMinX ? -1 : m === toMaxX ? 1 : 0;
      nz = nx !== 0 ? 0 : m === toMinZ ? -1 : 1;
      depth = m + radius;
    }
    b.x += nx * depth;
    b.z += nz * depth;
    const vn = b.vx * nx + b.vz * nz;
    if (vn < 0) { b.vx -= vn * nx; b.vz -= vn * nz; }
    const kn = b.kx * nx + b.kz * nz;
    if (kn < 0) { b.kx -= kn * nx; b.kz -= kn * nz; }
  }
}

/** Move a body by (dx, dz) on the plan: in steps short enough that no wall
 * is skipped, one axis at a time so a blocked axis slides along the other,
 * refusing any step that would leave its cell except through a portal, and
 * pushed clear of walls and cover after each step. */
export function moveBody(nav: Nav, b: NavBody, dx: number, dz: number, radius: number): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / MAX_STEP));
  const sx = dx / steps;
  const sz = dz / steps;
  for (let s = 0; s < steps; s += 1) {
    const ox = b.x;
    b.x += sx;
    if (!settle(nav, b)) {
      b.x = ox;
      if (b.vx * sx > 0) b.vx = 0;
      if (b.kx * sx > 0) b.kx = 0;
    }
    const oz = b.z;
    b.z += sz;
    if (!settle(nav, b)) {
      b.z = oz;
      if (b.vz * sz > 0) b.vz = 0;
      if (b.kz * sz > 0) b.kz = 0;
    }
    const px = b.x;
    const pz = b.z;
    pushOut(nav, b, radius);
    if (!settle(nav, b)) {
      b.x = px;
      b.z = pz;
    }
  }
}

/** Bend a unit heading (dirX, dirZ) around whatever blocker lies just
 * ahead: the part of it pointing into the obstacle is taken away, and a
 * push along the obstacle's face added — toward whichever way the heading
 * already leans, or `side` (±1) when it hits the face square-on. Writes the
 * new unit heading into `out`. */
export function slide(
  nav: Nav, x: number, z: number, radius: number, dirX: number, dirZ: number, side: number, out: Point,
): void {
  let ux = dirX;
  let uz = dirZ;
  const rs = nav.blockers;
  const reach = radius + LOOK;
  for (let i = 0; i < rs.length; i += 1) {
    const r = rs[i]!;
    if (x < r.minX - reach || x > r.maxX + reach || z < r.minZ - reach || z > r.maxZ + reach) continue;
    const qx = Math.min(r.maxX, Math.max(r.minX, x));
    const qz = Math.min(r.maxZ, Math.max(r.minZ, z));
    const ox = x - qx;
    const oz = z - qz;
    const d = Math.hypot(ox, oz);
    if (d < 1e-6 || d > reach) continue;
    const nx = ox / d;
    const nz = oz / d;
    const into = ux * nx + uz * nz;
    if (into >= 0) continue;
    const w = 1 - Math.min(1, Math.max(0, (d - radius) / LOOK));
    let tx = -nz;
    let tz = nx;
    const lean = tx * dirX + tz * dirZ;
    const s = Math.abs(lean) < 0.05 ? side : Math.sign(lean);
    tx *= s;
    tz *= s;
    ux += (-nx * into + tx * -into) * w;
    uz += (-nz * into + tz * -into) * w;
  }
  const len = Math.hypot(ux, uz);
  if (len > 1e-6) {
    out.x = ux / len;
    out.z = uz / len;
  } else {
    out.x = dirX;
    out.z = dirZ;
  }
}
