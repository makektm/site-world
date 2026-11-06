// Following re-goals only when the mover has gone somewhere (each new goal is
// a whole new flight), keeps the camera's offset, and lets go when inactive.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Point3 } from "./goal";
import { useFollow } from "./useFollow";

describe("useFollow", () => {
  it("tracks a mover, throttled by distance and time", () => {
    vi.useFakeTimers();
    try {
      let at: Point3 = [0, 0, 0];
      const { result, rerender } = renderHook(({ on }) => useFollow(() => at, on, { intervalMs: 500, minMove: 1 }), {
        initialProps: { on: true },
      });
      const first = result.current!;
      expect(first.target.toArray()).toEqual([0, 0, 0]);

      at = [0.4, 0, 0];
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(result.current).toBe(first);

      at = [3, 0, 0];
      act(() => {
        vi.advanceTimersByTime(500);
      });
      const second = result.current!;
      expect(second.target.x).toBe(3);
      expect(second.pos.x - first.pos.x).toBeCloseTo(3, 6);

      rerender({ on: false });
      expect(result.current).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
