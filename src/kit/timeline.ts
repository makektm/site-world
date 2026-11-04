// A playhead over a window of history (`start`..`end`, epoch ms), for scrubbing
// the building back to "what did it look like when the deploy went out".
// `live` means "follow the newest moment": the playhead sits on `end` as the
// host moves `end` forward. Seeking anywhere leaves live; playing to the end
// rejoins it.
import { useCallback, useEffect, useRef, useState } from "react";

/** The playhead's state. `t` is meaningful only when not `live`. */
export interface TimelineState {
  t: number;
  playing: boolean;
  /** Playback rate: history ms per real ms. */
  speed: number;
  live: boolean;
}

export type TimelineAction =
  | { type: "seek"; t: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle" }
  | { type: "speed"; speed: number }
  | { type: "live" }
  | { type: "tick"; dtMs: number };

/** The next state for `action`, within [start, end]. */
export function timelineReduce(
  s: TimelineState,
  a: TimelineAction,
  start: number,
  end: number,
): TimelineState {
  const clamp = (t: number) => Math.max(start, Math.min(end, t));
  switch (a.type) {
    case "seek":
      return { ...s, t: clamp(a.t), live: false };
    case "play":
      // Playing from live has nowhere to go: rewind to the start first.
      return s.live || s.t >= end ? { ...s, t: start, live: false, playing: true } : { ...s, playing: true };
    case "pause":
      return s.live ? { ...s, t: end, live: false, playing: false } : { ...s, playing: false };
    case "toggle":
      return timelineReduce(s, { type: s.playing ? "pause" : "play" }, start, end);
    case "speed":
      return a.speed > 0 ? { ...s, speed: a.speed } : s;
    case "live":
      return { ...s, t: end, live: true, playing: false };
    case "tick": {
      if (!s.playing || s.live) return s;
      const t = s.t + a.dtMs * s.speed;
      return t >= end ? { ...s, t: end, live: true, playing: false } : { ...s, t: clamp(t) };
    }
  }
}

/** Where the playhead is: `end` while live. */
export function playheadAt(s: TimelineState, end: number): number {
  return s.live ? end : s.t;
}

export interface TimelineOptions {
  start: number;
  end: number;
  /** Start live (default) or at `start`. */
  live?: boolean;
  speed?: number;
  /** How often playback advances, ms. Default 100: the host re-renders on each
   * step, so this is deliberately not every frame. */
  tickMs?: number;
}

/** What `useTimeline` returns. `t` is the playhead (=`end` while live). */
export interface TimelineApi {
  start: number;
  end: number;
  t: number;
  playing: boolean;
  speed: number;
  live: boolean;
  /** 0..1 along the window. */
  progress: number;
  seek: (t: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setSpeed: (speed: number) => void;
  goLive: () => void;
}

/** A playhead over [start, end]; the host may move both (a sliding window). */
export function useTimeline({ start, end, live = true, speed = 1, tickMs = 100 }: TimelineOptions): TimelineApi {
  const [s, setS] = useState<TimelineState>({ t: live ? end : start, playing: false, speed, live });
  const range = useRef({ start, end });
  range.current = { start, end };
  const dispatch = useCallback((a: TimelineAction) => {
    setS((cur) => timelineReduce(cur, a, range.current.start, range.current.end));
  }, []);

  useEffect(() => {
    if (!s.playing) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      dispatch({ type: "tick", dtMs: now - last });
      last = now;
    }, tickMs);
    return () => clearInterval(timer);
  }, [s.playing, tickMs, dispatch]);

  const t = Math.max(start, Math.min(end, playheadAt(s, end)));
  return {
    start,
    end,
    t,
    playing: s.playing,
    speed: s.speed,
    live: s.live,
    progress: end > start ? (t - start) / (end - start) : 1,
    seek: useCallback((to: number) => dispatch({ type: "seek", t: to }), [dispatch]),
    play: useCallback(() => dispatch({ type: "play" }), [dispatch]),
    pause: useCallback(() => dispatch({ type: "pause" }), [dispatch]),
    toggle: useCallback(() => dispatch({ type: "toggle" }), [dispatch]),
    setSpeed: useCallback((v: number) => dispatch({ type: "speed", speed: v }), [dispatch]),
    goLive: useCallback(() => dispatch({ type: "live" }), [dispatch]),
  };
}
