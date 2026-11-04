// Guided camera tours: a list of stops, each a camera goal and a caption, that
// a person (or an agent answering "show me why checkout is slow") steps
// through. The hook hands out the current stop's goal for SiteWorld's
// `hostGoal`; <TourCaption> is the card with next / prev / stop.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { goalFor, type CameraGoal, type GoalOptions, type Point3 } from "./goal";
import type { SelectionRef } from "./selection";

/** One stop: either an explicit `goal`, or a point `at` framed by goalFor. */
export interface TourStop {
  id?: string;
  title?: string;
  caption: ReactNode;
  goal?: CameraGoal;
  at?: Point3;
  frame?: GoalOptions;
  /** What to select while at this stop, for the host to light. */
  select?: SelectionRef;
  /** Auto-advance after this long, ms, while the tour is playing. */
  holdMs?: number;
}

/** A tour's position: `index` is null when no tour is running. */
export interface TourPosition {
  index: number | null;
}

export type TourAction =
  | { type: "start"; at?: number }
  | { type: "next" }
  | { type: "prev" }
  | { type: "go"; at: number }
  | { type: "stop" };

/** The next position for `action` over `count` stops. Next past the last stop
 * ends the tour; prev at the first stays there. */
export function tourStep(pos: TourPosition, action: TourAction, count: number): TourPosition {
  if (count <= 0) return { index: null };
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i));
  switch (action.type) {
    case "start":
      return { index: clamp(action.at ?? 0) };
    case "go":
      return pos.index === null ? pos : { index: clamp(action.at) };
    case "next":
      if (pos.index === null) return pos;
      return pos.index + 1 >= count ? { index: null } : { index: pos.index + 1 };
    case "prev":
      return pos.index === null ? pos : { index: clamp(pos.index - 1) };
    case "stop":
      return { index: null };
  }
}

/** What `useTour` returns. */
export interface TourApi {
  active: boolean;
  index: number | null;
  count: number;
  stop: TourStop | null;
  /** The current stop's camera goal, stable for as long as the stop is —
   * SiteWorld restarts a flight whenever the goal's identity changes. */
  goal: CameraGoal | null;
  start: (at?: number) => void;
  next: () => void;
  prev: () => void;
  go: (at: number) => void;
  end: () => void;
}

/** Step through `stops`. `opts.from` (e.g. the host's cameraRef as a point)
 * is read when a stop's goal is first framed, so `at` stops keep the side of
 * the building the camera is already on. Stops with `holdMs` advance on
 * their own. A new `stops` array (by identity) ends a running tour, so memoise it. */
export function useTour(stops: readonly TourStop[], opts: { from?: () => Point3 | null } = {}): TourApi {
  // The stops a position belongs to ride along with it, so a new list ends a
  // running tour by derivation rather than by an effect resetting state.
  const [pos, setPos] = useState<{ index: number | null; of: readonly TourStop[] | null }>({ index: null, of: null });
  const count = stops.length;
  const fromRef = useRef(opts.from);
  fromRef.current = opts.from;

  const dispatch = useCallback(
    (a: TourAction) =>
      setPos((p) => ({ index: tourStep(p.of === stops ? p : { index: null }, a, stops.length).index, of: stops })),
    [stops],
  );
  const index = pos.of === stops && pos.index !== null && pos.index < count ? pos.index : null;
  const stop = index === null ? null : stops[index]!;

  // Framed once per stop: `from` is read when the stop is reached, not live.
  const goal = useMemo<CameraGoal | null>(() => {
    if (!stop) return null;
    return stop.goal ?? (stop.at ? goalFor(stop.at, { from: fromRef.current?.() ?? null, ...stop.frame }) : null);
  }, [stop]);

  const hold = stop?.holdMs;
  useEffect(() => {
    if (index === null || !hold) return;
    const timer = setTimeout(() => dispatch({ type: "next" }), hold);
    return () => clearTimeout(timer);
  }, [index, hold, dispatch]);

  return {
    active: index !== null,
    index,
    count,
    stop,
    goal,
    start: useCallback((at?: number) => dispatch({ type: "start", at }), [dispatch]),
    next: useCallback(() => dispatch({ type: "next" }), [dispatch]),
    prev: useCallback(() => dispatch({ type: "prev" }), [dispatch]),
    go: useCallback((at: number) => dispatch({ type: "go", at }), [dispatch]),
    end: useCallback(() => dispatch({ type: "stop" }), [dispatch]),
  };
}
