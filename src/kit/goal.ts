// Camera goals for SiteWorld's `hostGoal`: where to put the orbit camera so a
// point reads well. Pure, so go-to, follow and tours agree on one framing.
import { Vector3 } from "three";

/** What SiteWorld's `hostGoal` takes: the orbit camera's position and target. */
export interface CameraGoal {
  pos: Vector3;
  target: Vector3;
}

export type Point3 = readonly [number, number, number];

export interface GoalOptions {
  /** Camera distance from the target, metres. Default 7: a room and its
   * neighbours' edges at the viewport's 40° lens. */
  distance?: number;
  /** Angle above the horizon, radians. Default 0.62 (~35°): high enough to
   * see over a 4.2m wall into a room, low enough that pylons read as tall. */
  elevation?: number;
  /** Bearing of the camera from the target (0 = from +z, PI/2 = from +x).
   * Default: keep the side `from` is on, else from +z. */
  azimuth?: number;
  /** Where the camera is now; keeping its bearing makes a flight a dolly,
   * not a swing round the building. */
  from?: Point3 | Vector3 | null;
  /** Lifts the look-at point above `point` (metres), e.g. to a pylon's middle. */
  lift?: number;
  /** The camera never goes below this height. Default 1.2. */
  minY?: number;
}

function xyz(p: Point3 | Vector3): [number, number, number] {
  return p instanceof Vector3 ? [p.x, p.y, p.z] : [p[0], p[1], p[2]];
}

/** A pleasing orbit-camera goal looking at `point`. */
export function goalFor(point: Point3 | Vector3, opts: GoalOptions = {}): CameraGoal {
  const [px, py, pz] = xyz(point);
  const distance = opts.distance ?? 7;
  const elevation = opts.elevation ?? 0.62;
  const ty = py + (opts.lift ?? 0);
  let azimuth = opts.azimuth;
  if (azimuth === undefined) {
    azimuth = 0;
    if (opts.from) {
      const [fx, , fz] = xyz(opts.from);
      const dx = fx - px;
      const dz = fz - pz;
      // Directly overhead has no bearing to keep: fall back to +z.
      if (Math.hypot(dx, dz) > 1e-3) azimuth = Math.atan2(dx, dz);
    }
  }
  const flat = Math.cos(elevation) * distance;
  const y = Math.max(opts.minY ?? 1.2, ty + Math.sin(elevation) * distance);
  return {
    pos: new Vector3(px + Math.sin(azimuth) * flat, y, pz + Math.cos(azimuth) * flat),
    target: new Vector3(px, ty, pz),
  };
}

/** The same goal moved so its target sits on `point`, the camera keeping its
 * offset — how a follow tracks a mover without swinging. */
export function goalShifted(goal: CameraGoal, point: Point3 | Vector3): CameraGoal {
  const [x, y, z] = xyz(point);
  const target = new Vector3(x, y, z);
  return { pos: target.clone().add(goal.pos.clone().sub(goal.target)), target };
}

/** True when `point` has moved at least `minMove` metres from where `goal`
 * looks: SiteWorld restarts a whole eased flight on every new goal, so a
 * follower should only issue one when the mover has really gone somewhere. */
export function goalNeedsMove(goal: CameraGoal | null, point: Point3 | Vector3, minMove: number): boolean {
  if (!goal) return true;
  const [x, y, z] = xyz(point);
  return Math.hypot(goal.target.x - x, goal.target.y - y, goal.target.z - z) >= minMove;
}

/** Where a walker should stand to face `point`: `distance` metres out on the
 * side `from` is on (else +z), looking at it at eye height. Pair it with a
 * fresh `seq` for SiteWorld's `walkTo`. The spot is not checked against
 * walls — pass a `distance` that keeps it inside the room. */
export function standFor(
  point: Point3 | Vector3,
  opts: { distance?: number; from?: Point3 | Vector3 | null; eye?: number } = {},
): { at: [number, number]; lookAt: [number, number, number] } {
  const [px, py, pz] = xyz(point);
  const distance = opts.distance ?? 1.8;
  let azimuth = 0;
  if (opts.from) {
    const [fx, , fz] = xyz(opts.from);
    if (Math.hypot(fx - px, fz - pz) > 1e-3) azimuth = Math.atan2(fx - px, fz - pz);
  }
  return {
    at: [px + Math.sin(azimuth) * distance, pz + Math.cos(azimuth) * distance],
    lookAt: [px, opts.eye ?? Math.max(py, 1.5), pz],
  };
}
