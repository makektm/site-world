// Where a walker is along a list of floor waypoints after some time, and which
// way it faces. Pure, so the figure's motion can be tested without a canvas
// and so a host can ask "where will this agent be at t" (a timeline scrubber)
// with the same numbers the figure draws.
//
// A heading is a rotation about y in the engine's convention: 0 faces +z,
// PI/2 faces +x — the value to put straight into `rotation.y`.

/** A point on the floor, [x, z] in metres. */
export type PathPoint = readonly [number, number];

/** A human walking pace, m/s; what a figure on a path moves at unless told otherwise. */
export const AGENT_WALK_SPEED = 1.4;

/** One reading of a walk along a path. */
export interface PathSample {
  x: number;
  z: number;
  /** Rotation about y that faces the direction of travel (0 faces +z). */
  heading: number;
  /** Metres travelled along the path, after clamping (or wrapping, on a loop). */
  distance: number;
  /** True once an open path has been walked to its end. A loop is never done. */
  done: boolean;
}

/** The heading (rotation about y) that turns +z toward `to` from `from`; 0 when the two coincide. */
export function floorHeading(from: PathPoint, to: PathPoint): number {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  if (dx === 0 && dz === 0) return 0;
  return Math.atan2(dx, dz);
}

type Leg = readonly [PathPoint, PathPoint];

function legs(points: readonly PathPoint[], loop: boolean): Leg[] {
  const out: Leg[] = [];
  for (let i = 1; i < points.length; i += 1) out.push([points[i - 1]!, points[i]!]);
  if (loop && points.length > 2) out.push([points[points.length - 1]!, points[0]!]);
  return out;
}

function legLength([a, b]: Leg): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Total length of the path in metres; `loop` adds the leg from the last point back to the first. */
export function pathLength(points: readonly PathPoint[], loop = false): number {
  return legs(points, loop).reduce((sum, leg) => sum + legLength(leg), 0);
}

/** The point `distance` metres along the path. An open path clamps to its ends; a loop wraps. */
export function samplePath(points: readonly PathPoint[], distance: number, loop = false): PathSample {
  const first = points[0];
  if (!first) return { x: 0, z: 0, heading: 0, distance: 0, done: true };
  // Zero-length legs (a waypoint repeated to mean "pause here") have no
  // direction; skipping them keeps the heading from snapping to 0 mid-walk.
  const real = legs(points, loop).filter((leg) => legLength(leg) > 1e-9);
  const total = real.reduce((sum, leg) => sum + legLength(leg), 0);
  if (real.length === 0 || total === 0) return { x: first[0], z: first[1], heading: 0, distance: 0, done: true };

  const d = loop ? ((distance % total) + total) % total : Math.min(Math.max(distance, 0), total);
  const done = !loop && distance >= total;

  let left = d;
  for (let i = 0; i < real.length; i += 1) {
    const leg = real[i]!;
    const len = legLength(leg);
    if (left <= len || i === real.length - 1) {
      const t = Math.min(left / len, 1);
      const [a, b] = leg;
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, heading: floorHeading(a, b), distance: d, done };
    }
    left -= len;
  }
  // Unreachable: the loop above returns on the last leg at the latest.
  return { x: first[0], z: first[1], heading: 0, distance: d, done };
}

/** A path's real legs and their lengths, worked out once, for a caller that
 * samples the same path every frame (a walking figure) and must not allocate. */
export interface PreparedPath {
  /** Flat [ax, az, bx, bz] per real (non-zero) leg. */
  legs: Float64Array;
  lengths: Float64Array;
  total: number;
  first: PathPoint | undefined;
  loop: boolean;
}

/** Prepares `points` for `samplePathInto`. */
export function preparePath(points: readonly PathPoint[], loop = false): PreparedPath {
  const real = legs(points, loop).filter((leg) => legLength(leg) > 1e-9);
  const flat = new Float64Array(real.length * 4);
  const lengths = new Float64Array(real.length);
  let total = 0;
  real.forEach(([a, b], i) => {
    flat.set([a[0], a[1], b[0], b[1]], i * 4);
    lengths[i] = legLength([a, b]);
    total += lengths[i]!;
  });
  return { legs: flat, lengths, total, first: points[0], loop };
}

/** `samplePath` over a prepared path, written into `out`. Same numbers. */
export function samplePathInto(path: PreparedPath, distance: number, out: PathSample): PathSample {
  const { legs: L, lengths, total, first, loop } = path;
  const n = lengths.length;
  if (!first || n === 0 || total === 0) {
    out.x = first?.[0] ?? 0;
    out.z = first?.[1] ?? 0;
    out.heading = 0;
    out.distance = 0;
    out.done = true;
    return out;
  }
  const d = loop ? ((distance % total) + total) % total : Math.min(Math.max(distance, 0), total);
  out.distance = d;
  out.done = !loop && distance >= total;
  let left = d;
  for (let i = 0; i < n; i += 1) {
    const len = lengths[i]!;
    if (left <= len || i === n - 1) {
      const t = Math.min(left / len, 1);
      const ax = L[i * 4]!;
      const az = L[i * 4 + 1]!;
      const bx = L[i * 4 + 2]!;
      const bz = L[i * 4 + 3]!;
      out.x = ax + (bx - ax) * t;
      out.z = az + (bz - az) * t;
      out.heading = Math.atan2(bx - ax, bz - az);
      return out;
    }
    left -= len;
  }
  return out;
}

/** Where a walker is `elapsed` seconds after setting off along the path at `speed` m/s. */
export function walkPath(
  points: readonly PathPoint[],
  elapsed: number,
  speed: number = AGENT_WALK_SPEED,
  loop = false,
): PathSample {
  return samplePath(points, Math.max(0, elapsed) * speed, loop);
}
