/** Shared orbit math: the one home for "where does a point sit on a ring
 * around a pivot," so a ring drawn on the floor and the bodies moving on it
 * share one centre and radius and can never drift onto two different
 * circles.
 *
 * `pivot`/`[x, z]` are world-space ground coordinates (y is up and handled
 * by each caller).
 */

export const TAU = Math.PI * 2;

/** Angular speed (radians/sec) CI runners revolve at, absent a caller's own
 * override — a full lap in a bit under a minute. */
export const DEFAULT_ORBIT_SPEED = 0.12;

/** A point at `angle` radians around `pivot`, `radius` out. */
export function orbitPos(pivot: [number, number], radius: number, angle: number): [number, number] {
  return [pivot[0] + Math.cos(angle) * radius, pivot[1] + Math.sin(angle) * radius];
}

/** A body's angle at animation time `elapsed`: `phase` fixes where distinct
 * bodies land so they never overlap, `speed` is 0 for a body that only
 * holds a fixed position (a presence marker, never a motion path) and
 * nonzero for one that actually revolves. */
export function orbitAngle(phase: number, elapsed: number, speed: number): number {
  return phase * TAU + elapsed * speed;
}

/** The ring itself, as a closed line loop — the drawn path a `speed`-driven
 * `orbitPos` traces, at a fixed height `y` off the floor. */
export function ringPoints(pivot: [number, number], radius: number, y: number, segments = 64): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= segments; i += 1) {
    const [x, z] = orbitPos(pivot, radius, (i / segments) * TAU);
    pts.push([x, y, z]);
  }
  return pts;
}
