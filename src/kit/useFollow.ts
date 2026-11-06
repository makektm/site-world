// Follow a moving thing (an agent walking between services) with the orbit
// camera. SiteWorld's fly rig eases a full flight on every new goal, so a
// per-frame goal would never arrive; instead the mover is polled on a timer
// and a new goal is issued only once it has moved far enough.
import { useEffect, useRef, useState } from "react";
import { goalFor, goalNeedsMove, goalShifted, type CameraGoal, type GoalOptions, type Point3 } from "./goal";

export interface FollowOptions extends GoalOptions {
  /** How often to look where the mover is, ms. Default 900 — a little under
   * one flight (FLY_MS), so the camera is rarely still for long. */
  intervalMs?: number;
  /** Metres the mover must travel before the camera moves. Default 0.75. */
  minMove?: number;
}

/** A goal for SiteWorld's `hostGoal` that tracks `getPoint()` while `active`
 * (null when not active or the mover is gone). `getPoint` may read refs and
 * change identity freely; it is read on the timer, not as a dependency. The
 * first goal is framed by `goalFor(point, opts)`; later ones keep that
 * camera offset so the view slides rather than swings. */
export function useFollow(
  getPoint: () => Point3 | null,
  active: boolean,
  opts: FollowOptions = {},
): CameraGoal | null {
  const [goal, setGoal] = useState<CameraGoal | null>(null);
  const getRef = useRef(getPoint);
  getRef.current = getPoint;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const intervalMs = opts.intervalMs ?? 900;

  useEffect(() => {
    if (!active) {
      setGoal(null);
      return;
    }
    let last: CameraGoal | null = null;
    const tick = () => {
      const p = getRef.current();
      if (!p) return;
      const o = optsRef.current;
      if (!goalNeedsMove(last, p, last ? o.minMove ?? 0.75 : 0)) return;
      last = last ? goalShifted(last, p) : goalFor(p, o);
      setGoal(last);
    };
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);

  return active ? goal : null;
}
