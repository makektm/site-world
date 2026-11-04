// The numbers behind the infrastructure props (Tank, QueuePipe, Meter,
// FloorHeat, LoadingDock, StickyNote): pure, so the mapping from a host's data
// to a shape is tested here rather than eyeballed in a scene.
import { CRITICAL, INFO, INK, OK, WARN } from "../core/engine";

/** The three states every infra prop colours by. Kept separate from any
 * host's own health type so the library never has to know one. */
export type InfraHealth = "ok" | "warn" | "down";

/** Health -> palette colour, the same mapping the company example's pylons use. */
export const INFRA_HEALTH_COLOR: Record<InfraHealth, string> = { ok: OK, warn: WARN, down: CRITICAL };

function clamp(v: number, lo: number, hi: number): number {
  // NaN from a host's division by zero must not reach a scale or a canvas.
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

// ---------------------------------------------------------------- queues

export interface QueuePacking {
  /** How many packets to draw in the pipe. */
  count: number;
  /** 0 = evenly spread (free flow), 1 = jammed hard against the outlet. */
  bunch: number;
  /** Backlog is past the threshold: the pipe bulges and changes colour. */
  over: boolean;
  /** Backlog is past three thresholds: the warn colour becomes critical. */
  severe: boolean;
}

/** Backlog -> how a QueuePipe packs its packets. The count grows on a log
 * scale so a queue of 50 and one of 50 000 both read, and never draws fewer
 * than `minPackets`, so an empty queue still shows its throughput moving. */
export function queuePacking(
  backlog: number,
  threshold: number,
  maxPackets = 28,
  minPackets = 3,
): QueuePacking {
  const b = Math.max(0, Number.isFinite(backlog) ? backlog : 0);
  const t = threshold > 0 ? threshold : 1;
  const count = Math.round(clamp(minPackets + Math.log2(1 + b) * 2, minPackets, Math.max(minPackets, maxPackets)));
  return { count, bunch: clamp(b / t, 0, 2) / 2, over: b > t, severe: b > t * 3 };
}

/** Where packet `i` of `count` sits along the pipe, 0 at the inlet and 1 at
 * the outlet, at `phase` laps. Spacing is even at `bunch` 0; as `bunch`
 * grows the warp crowds packets toward the outlet AND slows them there,
 * which is what a backed-up queue looks like — no separate jam animation. */
export function packetT(i: number, count: number, phase: number, bunch: number): number {
  if (count <= 0) return 0;
  const u = (((i / count + phase) % 1) + 1) % 1;
  const exponent = 1 + clamp(bunch, 0, 1) * 3;
  return 1 - (1 - u) ** exponent;
}

/** All packet positions at once; see packetT. */
export function packetSpacing(count: number, phase: number, bunch: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => packetT(i, count, phase, bunch));
}

/** Throughput (messages/s) -> laps of the pipe per second, on a log scale:
 * about one lap every 6s at 1/s and every 2s at 1000/s. Zero stands still. */
export function packetSpeed(throughput: number): number {
  if (!(throughput > 0)) return 0;
  return clamp(0.15 + Math.log10(1 + throughput) * 0.12, 0.15, 0.9);
}

// ---------------------------------------------------------------- tanks, meters

/** Any fill, ratio or level clamped into 0..1 (NaN reads as empty). */
export function unitFill(v: number): number {
  return clamp(v, 0, 1);
}

export type BudgetState = "ok" | "warn" | "over";

/** Spend against a budget: warn from `warnAt` of it (default 80%), over past it.
 * No budget (undefined or <= 0) is always ok — there is nothing to be over. */
export function budgetState(value: number, budget: number | undefined, warnAt = 0.8): BudgetState {
  if (budget === undefined || !(budget > 0)) return "ok";
  if (value > budget) return "over";
  return value >= budget * warnAt ? "warn" : "ok";
}

/** BudgetState -> palette colour. */
export const BUDGET_COLOR: Record<BudgetState, string> = { ok: INFO, warn: WARN, over: CRITICAL };

/** A dial's needle angle for `value` of `max`, sweeping `sweep` radians
 * clockwise from the left (−sweep/2 is the zero mark, +sweep/2 is full). */
export function dialAngle(value: number, max: number, sweep = Math.PI * 1.5): number {
  const f = max > 0 ? clamp(value / max, 0, 1) : 0;
  return -sweep / 2 + f * sweep;
}

/** Short human figure: 950, 1.2k, 34k, 1.5M. Long numbers do not fit a gauge. */
export function compactNumber(v: number): string {
  if (!Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1e9) return `${s}${trim(a / 1e9)}B`;
  if (a >= 1e6) return `${s}${trim(a / 1e6)}M`;
  if (a >= 1e3) return `${s}${trim(a / 1e3)}k`;
  return `${s}${a >= 10 || a === Math.round(a) ? Math.round(a) : a.toFixed(1)}`;
}

function trim(n: number): string {
  return n >= 100 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "");
}

// ---------------------------------------------------------------- loading dock

/** Centres (along the dock's local x) of `count` bays `bayWidth` wide with
 * `gap` between them, the row centred on 0. */
export function bayOffsets(count: number, bayWidth: number, gap = 0.2): number[] {
  const n = Math.max(0, Math.floor(count));
  const span = n * bayWidth + Math.max(0, n - 1) * gap;
  return Array.from({ length: n }, (_, i) => -span / 2 + bayWidth / 2 + i * (bayWidth + gap));
}

/** Total width of that row of bays, for sizing the platform under it. */
export function bayRowWidth(count: number, bayWidth: number, gap = 0.2): number {
  const n = Math.max(0, Math.floor(count));
  return n * bayWidth + Math.max(0, n - 1) * gap;
}

// ---------------------------------------------------------------- heat

export interface HeatPoint {
  x: number;
  z: number;
  value: number;
}

export interface HeatBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface HeatGrid {
  cols: number;
  rows: number;
  /** Row-major, row 0 at minZ, column 0 at minX. Each cell already divided by `max`. */
  cells: Float32Array;
  /** The value that maps to 1 (the hottest cell, or the caller's fixed scale). */
  max: number;
}

/** The smallest rectangle round every point, grown by `pad` metres on each side. */
export function heatBounds(points: readonly HeatPoint[], pad = 2): HeatBounds {
  if (points.length === 0) return { minX: -pad, maxX: pad, minZ: -pad, maxZ: pad };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

/** Splats each point as a gaussian of `radius` metres (the falloff's 1-sigma)
 * onto a grid of `cellSize`-metre cells covering `bounds`, and normalises to
 * 0..1 against the hottest cell or `fixedMax`. A fixed max lets two heat maps,
 * or two moments of one, be compared; the hottest-cell default always shows
 * the shape. Cells beyond 3 sigma are skipped: the tail is invisible. */
export function heatGrid(
  points: readonly HeatPoint[],
  bounds: HeatBounds,
  cellSize = 0.25,
  radius = 1.5,
  fixedMax?: number,
): HeatGrid {
  const size = cellSize > 0 ? cellSize : 0.25;
  const cols = Math.max(1, Math.min(1024, Math.ceil((bounds.maxX - bounds.minX) / size)));
  const rows = Math.max(1, Math.min(1024, Math.ceil((bounds.maxZ - bounds.minZ) / size)));
  const cells = new Float32Array(cols * rows);
  const sigma = radius > 0 ? radius : size;
  const reach = sigma * 3;
  const inv2s2 = 1 / (2 * sigma * sigma);
  for (const p of points) {
    if (!(p.value > 0)) continue;
    const c0 = Math.max(0, Math.floor((p.x - reach - bounds.minX) / size));
    const c1 = Math.min(cols - 1, Math.floor((p.x + reach - bounds.minX) / size));
    const r0 = Math.max(0, Math.floor((p.z - reach - bounds.minZ) / size));
    const r1 = Math.min(rows - 1, Math.floor((p.z + reach - bounds.minZ) / size));
    for (let r = r0; r <= r1; r += 1) {
      const dz = bounds.minZ + (r + 0.5) * size - p.z;
      for (let c = c0; c <= c1; c += 1) {
        const dx = bounds.minX + (c + 0.5) * size - p.x;
        cells[r * cols + c]! += p.value * Math.exp(-(dx * dx + dz * dz) * inv2s2);
      }
    }
  }
  let hottest = 0;
  for (const v of cells) hottest = Math.max(hottest, v);
  const max = fixedMax !== undefined && fixedMax > 0 ? fixedMax : hottest;
  if (max > 0) for (let i = 0; i < cells.length; i += 1) cells[i] = Math.min(1, cells[i]! / max);
  return { cols, rows, cells, max };
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Cold is the floor itself (INK) so an untouched area reads as no heat, not as
// a blue "low": INFO -> WARN -> CRITICAL then carries the palette's own
// meaning of calm -> attention -> alarm.
const HEAT_STOPS: readonly (readonly [number, readonly [number, number, number]])[] = [
  [0, hexRgb(INK)],
  [0.3, hexRgb(INFO)],
  [0.65, hexRgb(WARN)],
  [1, hexRgb(CRITICAL)],
];

/** 0..1 -> [r, g, b, a] bytes on the heat ramp; alpha rises with heat so the
 * cold edge of the overlay fades into the floor rather than ending in a square. */
export function heatColor(t: number): [number, number, number, number] {
  const v = clamp(t, 0, 1);
  let i = 1;
  while (i < HEAT_STOPS.length - 1 && v > HEAT_STOPS[i]![0]) i += 1;
  const [t0, c0] = HEAT_STOPS[i - 1]!;
  const [t1, c1] = HEAT_STOPS[i]!;
  const f = t1 > t0 ? (v - t0) / (t1 - t0) : 0;
  const mix = (k: number) => Math.round(c0[k]! + (c1[k]! - c0[k]!) * f);
  return [mix(0), mix(1), mix(2), Math.round(255 * Math.min(1, v * 1.6))];
}

// ---------------------------------------------------------------- notes

/** Greedy word wrap against any width measure (a canvas's measureText in the
 * scene, a character count in tests). At most `maxLines`; the last line that
 * would overflow ends in an ellipsis. A single word wider than the line is cut. */
export function wrapLines(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
  maxLines = 6,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const cut = (w: string) => {
    let s = w;
    while (s.length > 1 && measure(s) > maxWidth) s = s.slice(0, -1);
    return s;
  };
  let i = 0;
  for (; i < words.length; i += 1) {
    const word = words[i]!;
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = measure(word) <= maxWidth ? word : cut(word);
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) {
    lines.push(line);
    line = "";
  }
  const truncated = i < words.length || line !== "";
  if (truncated && lines.length > 0) {
    let last = lines[lines.length - 1]!;
    while (last.length > 1 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}
