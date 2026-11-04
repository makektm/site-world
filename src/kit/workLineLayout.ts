// The factory floor's geometry, kept free of three.js and React so it can be
// tested: where a point along a belt is, where each station stands, and where
// the nth crate waiting at a station sits in its pile. WorkLine.tsx only turns
// these numbers into motion.
//
// Positions along a belt are measured in metres from the belt's first point
// ("along"), across it in metres along the belt's local +x, which is the
// left-hand side for someone facing downstream ("side"), and up from the belt's surface ("up"). Keeping crates in
// those coordinates, not world space, is what lets an advancing crate follow
// the belt round a corner instead of cutting across it.

/** A floor point [x, z]. */
export type FloorPoint = readonly [number, number];

/** Where a unit of work is in its life. `failed` items leave the belt for the
 * reject bin and `deployed` items leave the line altogether; everything else
 * waits at (or, for `working`, inside) its stage's station. */
export type WorkStatus =
  | "queued"
  | "working"
  | "passing"
  | "failing"
  | "waiting-review"
  | "merged"
  | "failed"
  | "deployed";

/** One unit of work on a line: a ticket, a PR. */
export interface WorkItem {
  id: string;
  /** Index into the line's stations. Out-of-range values are clamped. */
  stage: number;
  status: WorkStatus;
  /** A few characters painted on the crate's lid, e.g. "#412". */
  label?: string;
  /** Overrides the status colour, e.g. to colour by author or kind. */
  color?: string;
}

/** A sample of a belt: its point, and the rotation about y that turns local
 * +z downstream (so local +x points across the belt, to the left of someone
 * facing downstream). */
export interface PathSample {
  x: number;
  z: number;
  rotY: number;
}

/** Total length of a polyline, metres. */
export function polylineLength(path: readonly FloorPoint[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

/** The point `s` metres along `path`, with its heading. Before the start and
 * past the end the first and last segments are extended, so a pile that
 * outgrows its belt keeps queuing in a straight line instead of collapsing on
 * the endpoint. */
export function samplePath(path: readonly FloorPoint[], s: number): PathSample {
  if (path.length === 0) return { x: 0, z: 0, rotY: 0 };
  if (path.length === 1) return { x: path[0]![0], z: path[0]![1], rotY: 0 };
  let start = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const last = i === path.length - 1;
    if ((s <= start + len || last) && len > 0) {
      // Only the first segment extrapolates backwards; later ones clamp at 0.
      const t = i === 1 ? (s - start) / len : Math.max(0, (s - start) / len);
      const dx = (b[0] - a[0]) / len;
      const dz = (b[1] - a[1]) / len;
      return { x: a[0] + dx * len * t, z: a[1] + dz * len * t, rotY: Math.atan2(dx, dz) };
    }
    start += len;
  }
  const end = path[path.length - 1]!;
  return { x: end[0], z: end[1], rotY: 0 };
}

/** Moves a sample `side` metres across the belt, along its local +x. */
export function offsetAcross(p: PathSample, side: number): FloorPoint {
  return [p.x + Math.cos(p.rotY) * side, p.z - Math.sin(p.rotY) * side];
}

/** The distance along `path` of the point on it nearest [x, z]. */
export function nearestAlong(path: readonly FloorPoint[], x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  let start = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    const len = Math.sqrt(len2);
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / len2)) : 0;
    const d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
    if (d < bestD) {
      bestD = d;
      best = start + len * t;
    }
    start += len;
  }
  return best;
}

/** Each station's distance along a belt of `length`: its own `at` (a 0..1
 * fraction) where given, else evenly spaced with room before the first for
 * its pile and room after the last for finished work to leave. */
export function stationAlong(stations: readonly { at?: number }[], length: number): number[] {
  const n = stations.length;
  return stations.map((s, i) => (s.at ?? (i + 1) / (n + 1)) * length);
}

export interface PileOptions {
  /** Crates side by side across the belt. */
  cols: number;
  /** Rows back along the belt before the pile starts stacking upward. */
  rows: number;
  /** Centre-to-centre spacing of crates on the belt, metres. */
  pitch: number;
  /** Height of one layer, metres. */
  layer: number;
}

export interface PileSlot {
  col: number;
  row: number;
  level: number;
  /** Metres upstream of the pile's front edge to the crate's centre. */
  back: number;
  /** Metres across the belt from its centre line (local +x positive). */
  side: number;
  /** Metres above the belt surface to the crate's base. */
  up: number;
}

/** Where the `index`th crate (0 = first in line) of a pile sits. The pile fills
 * across the belt first, then back along it until `rows` is used up, then
 * stacks upward: so a backlog first grows long and then grows tall, and a
 * bottleneck reads as a heap rather than a slightly longer queue. */
export function pileSlot(index: number, o: PileOptions): PileSlot {
  const cols = Math.max(1, Math.floor(o.cols));
  const rows = Math.max(1, Math.floor(o.rows));
  const col = index % cols;
  const row = Math.floor(index / cols) % rows;
  const level = Math.floor(index / (cols * rows));
  return {
    col,
    row,
    level,
    back: o.pitch * (row + 0.5),
    side: (col - (cols - 1) / 2) * o.pitch,
    up: level * o.layer,
  };
}

/** How many rows of `pitch` fit in `room` metres; at least one, so a station
 * crowded by its neighbour still has somewhere to stack. */
export function pileRows(room: number, pitch: number): number {
  return Math.max(1, Math.floor(room / pitch));
}

/** Station light: from its queue unless the host says otherwise. */
export type StationStatus = "idle" | "ok" | "warn" | "critical";

/** The default light for a queue of `count`: busy is fine, a backlog warns,
 * a heap is critical. */
export function queueStatus(count: number, warnAt: number, critAt: number): StationStatus {
  if (count >= critAt) return "critical";
  if (count >= warnAt) return "warn";
  return count > 0 ? "ok" : "idle";
}

export interface WorkLineGeometry {
  path: readonly FloorPoint[];
  stations: readonly { at?: number }[];
  /** Belt depth taken by a station's gate, metres. Piles start in front of it. */
  gateDepth: number;
  cols: number;
  pitch: number;
  layer: number;
  /** Most rows a pile takes before stacking, even with room to spare: a
   * backlog that climbs reads as one sooner than one that only lengthens. */
  maxRows?: number;
}

/** Where a crate is headed. `belt` and `gate` are belt coordinates; `reject`
 * is a slot index in the reject bin; `deployed` has left the line. */
export type Placement =
  | { kind: "belt" | "gate"; stage: number; along: number; side: number; up: number }
  | { kind: "reject"; slot: number }
  | { kind: "deployed" };

export interface WorkLineLayout {
  /** Each station's distance along the belt. */
  along: number[];
  /** Items at each stage, gate and pile together (failed and deployed excluded). */
  counts: number[];
  /** Rows each station's pile has before stacking. */
  rows: number[];
  /** Placement per item id. */
  items: Map<string, Placement>;
  /** Failed items, oldest first, in reject-bin order. */
  rejected: string[];
}

/** Places every item. At each stage, up to `cols` `working` items sit inside
 * the gate; everything else waits in that stage's pile in the order given, so
 * the first item in `items` is the one nearest the gate. */
export function layoutWorkLine(g: WorkLineGeometry, items: readonly WorkItem[]): WorkLineLayout {
  const n = g.stations.length;
  const length = polylineLength(g.path);
  const along = stationAlong(g.stations, length);
  const half = g.gateDepth / 2;
  const rows = along.map((a, i) => {
    const prev = i === 0 ? 0 : along[i - 1]! + half;
    return Math.min(pileRows(a - half - prev, g.pitch), Math.max(1, Math.floor(g.maxRows ?? Infinity)));
  });
  const counts = new Array<number>(n).fill(0);
  const inGate = new Array<number>(n).fill(0);
  const inPile = new Array<number>(n).fill(0);
  const placed = new Map<string, Placement>();
  const rejected: string[] = [];
  const cols = Math.max(1, Math.floor(g.cols));

  for (const item of items) {
    if (item.status === "deployed") {
      placed.set(item.id, { kind: "deployed" });
      continue;
    }
    if (item.status === "failed") {
      placed.set(item.id, { kind: "reject", slot: rejected.length });
      rejected.push(item.id);
      continue;
    }
    if (n === 0) continue;
    const stage = Math.min(n - 1, Math.max(0, Math.floor(item.stage)));
    counts[stage]! += 1;
    if (item.status === "working" && inGate[stage]! < cols) {
      const col = inGate[stage]!;
      inGate[stage]! += 1;
      placed.set(item.id, { kind: "gate", stage, along: along[stage]!, side: (col - (cols - 1) / 2) * g.pitch, up: 0 });
      continue;
    }
    const slot = pileSlot(inPile[stage]!, { cols, rows: rows[stage]!, pitch: g.pitch, layer: g.layer });
    inPile[stage]! += 1;
    // A small gap between the gate and the first row, so the front crates do
    // not clip the gate's posts.
    placed.set(item.id, { kind: "belt", stage, along: along[stage]! - half - g.pitch * 0.15 - slot.back, side: slot.side, up: slot.up });
  }
  return { along, counts, rows, items: placed, rejected };
}
