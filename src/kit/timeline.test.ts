// The playhead: seeking leaves live, playing advances at `speed` and rejoins
// live at the end, and live tracks a moving `end`.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { timelineReduce, useTimeline, type TimelineState } from "./timeline";

const S0: TimelineState = { t: 0, playing: false, speed: 1, live: true };

describe("timelineReduce", () => {
  it("seeks within the window and leaves live", () => {
    const s = timelineReduce(S0, { type: "seek", t: 5000 }, 0, 1000);
    expect(s).toMatchObject({ t: 1000, live: false });
    expect(timelineReduce(S0, { type: "seek", t: -5 }, 0, 1000).t).toBe(0);
  });

  it("plays from the start when live", () => {
    expect(timelineReduce(S0, { type: "play" }, 0, 1000)).toMatchObject({ t: 0, playing: true, live: false });
  });

  it("advances by dt x speed and rejoins live at the end", () => {
    let s: TimelineState = { t: 0, playing: true, speed: 10, live: false };
    s = timelineReduce(s, { type: "tick", dtMs: 50 }, 0, 1000);
    expect(s.t).toBe(500);
    s = timelineReduce(s, { type: "tick", dtMs: 60 }, 0, 1000);
    expect(s).toMatchObject({ t: 1000, live: true, playing: false });
  });

  it("does not tick while paused, and pausing live freezes at the end", () => {
    const paused: TimelineState = { t: 10, playing: false, speed: 1, live: false };
    expect(timelineReduce(paused, { type: "tick", dtMs: 100 }, 0, 1000)).toBe(paused);
    expect(timelineReduce(S0, { type: "pause" }, 0, 1000)).toMatchObject({ t: 1000, live: false });
  });

  it("rejects a non-positive speed", () => {
    expect(timelineReduce(S0, { type: "speed", speed: 0 }, 0, 1)).toBe(S0);
    expect(timelineReduce(S0, { type: "speed", speed: 60 }, 0, 1).speed).toBe(60);
  });
});

describe("useTimeline", () => {
  it("follows a moving end while live, and plays on a timer", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance", "Date"] });
    try {
      const { result, rerender } = renderHook(({ end }) => useTimeline({ start: 0, end, speed: 100 }), {
        initialProps: { end: 10_000 },
      });
      expect(result.current).toMatchObject({ t: 10_000, live: true, progress: 1 });
      rerender({ end: 20_000 });
      expect(result.current.t).toBe(20_000);

      act(() => result.current.seek(1000));
      expect(result.current).toMatchObject({ t: 1000, live: false });
      act(() => result.current.play());
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(result.current.t).toBeGreaterThan(1000);
      act(() => result.current.goLive());
      expect(result.current).toMatchObject({ t: 20_000, live: true, playing: false });
    } finally {
      vi.useRealTimers();
    }
  });
});
