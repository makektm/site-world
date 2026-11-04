// A tour steps forward and back within its stops, ends past the last one,
// hands out one stable goal per stop (a new goal identity restarts a flight),
// and auto-advances only stops that ask to.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { tourStep, useTour, type TourStop } from "./tour";

describe("tourStep", () => {
  it("starts, steps, clamps and ends", () => {
    let p = tourStep({ index: null }, { type: "next" }, 3);
    expect(p.index).toBeNull();
    p = tourStep(p, { type: "start" }, 3);
    expect(p.index).toBe(0);
    p = tourStep(p, { type: "prev" }, 3);
    expect(p.index).toBe(0);
    p = tourStep(p, { type: "go", at: 9 }, 3);
    expect(p.index).toBe(2);
    p = tourStep(p, { type: "next" }, 3);
    expect(p.index).toBeNull();
    expect(tourStep({ index: 1 }, { type: "stop" }, 3).index).toBeNull();
    expect(tourStep({ index: null }, { type: "start" }, 0).index).toBeNull();
  });
});

const STOPS: TourStop[] = [
  { title: "edge", caption: "traffic comes in here", at: [0, 0, 0] },
  { caption: "checkout waits on payments", goal: { pos: new Vector3(1, 2, 3), target: new Vector3(0, 0, 0) }, holdMs: 500 },
  { caption: "the slow query", at: [5, 0, 5] },
];

describe("useTour", () => {
  it("frames `at` stops once and keeps the goal stable", () => {
    const { result, rerender } = renderHook(() => useTour(STOPS, { from: () => [10, 5, 0] }));
    expect(result.current.goal).toBeNull();
    act(() => result.current.start());
    const g = result.current.goal!;
    expect(g.target.toArray()).toEqual([0, 0, 0]);
    expect(g.pos.x).toBeGreaterThan(0); // kept the camera's side
    rerender();
    expect(result.current.goal).toBe(g);
    act(() => result.current.next());
    expect(result.current.goal).toBe(STOPS[1]!.goal);
  });

  it("auto-advances a stop with holdMs", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useTour(STOPS));
      act(() => result.current.start(1));
      act(() => {
        vi.advanceTimersByTime(499);
      });
      expect(result.current.index).toBe(1);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.index).toBe(2);
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.index).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ends when handed new stops", () => {
    const { result, rerender } = renderHook(({ s }) => useTour(s), { initialProps: { s: STOPS } });
    act(() => result.current.start());
    expect(result.current.active).toBe(true);
    rerender({ s: [...STOPS] });
    expect(result.current.active).toBe(false);
  });
});
