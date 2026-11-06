import { describe, expect, it } from "vitest";
import {
  bayOffsets, bayRowWidth, budgetState, compactNumber, dialAngle, heatBounds, heatColor, heatGrid,
  packetSpacing, packetSpeed, packetT, queuePacking, unitFill, wrapLines,
} from "./infraMath";

describe("queuePacking", () => {
  it("draws a few packets even when the queue is empty, so throughput still shows", () => {
    expect(queuePacking(0, 100)).toEqual({ count: 3, bunch: 0, over: false, severe: false });
  });
  it("grows the count with backlog on a log scale, capped", () => {
    const a = queuePacking(10, 100).count;
    const b = queuePacking(1000, 100).count;
    expect(b).toBeGreaterThan(a);
    expect(queuePacking(1e12, 100, 20).count).toBe(20);
  });
  it("flags over and severe against the threshold", () => {
    expect(queuePacking(150, 100)).toMatchObject({ over: true, severe: false, bunch: 0.75 });
    expect(queuePacking(400, 100)).toMatchObject({ over: true, severe: true, bunch: 1 });
  });
  it("survives a bad threshold and NaN backlog", () => {
    expect(queuePacking(Number.NaN, 0).count).toBe(3);
  });
});

describe("packetSpacing", () => {
  it("spreads packets evenly in free flow", () => {
    expect(packetSpacing(4, 0, 0)).toEqual([0, 0.25, 0.5, 0.75]);
  });
  it("crowds packets toward the outlet as the queue backs up", () => {
    const free = packetSpacing(8, 0, 0);
    const jammed = packetSpacing(8, 0, 1);
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean(jammed)).toBeGreaterThan(mean(free));
    // Gaps shrink toward the outlet when jammed.
    const gaps = jammed.slice(1).map((t, i) => t - jammed[i]!);
    expect(gaps[gaps.length - 1]!).toBeLessThan(gaps[0]!);
  });
  it("wraps phase and stays in 0..1", () => {
    for (const t of packetSpacing(10, 3.7, 0.5)) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(1);
    }
    expect(packetT(0, 4, -0.25, 0)).toBeCloseTo(0.75);
    expect(packetSpacing(0, 0, 0)).toEqual([]);
  });
});

describe("packetSpeed", () => {
  it("stands still with no throughput and rises with it, bounded", () => {
    expect(packetSpeed(0)).toBe(0);
    expect(packetSpeed(1000)).toBeGreaterThan(packetSpeed(1));
    expect(packetSpeed(1e15)).toBeLessThanOrEqual(0.9);
  });
});

describe("gauges", () => {
  it("clamps fills", () => {
    expect(unitFill(-1)).toBe(0);
    expect(unitFill(2)).toBe(1);
    expect(unitFill(Number.NaN)).toBe(0);
  });
  it("reads a budget", () => {
    expect(budgetState(50, 100)).toBe("ok");
    expect(budgetState(80, 100)).toBe("warn");
    expect(budgetState(101, 100)).toBe("over");
    expect(budgetState(1e9, undefined)).toBe("ok");
  });
  it("sweeps a dial from -sweep/2 to +sweep/2", () => {
    expect(dialAngle(0, 10, Math.PI)).toBeCloseTo(-Math.PI / 2);
    expect(dialAngle(10, 10, Math.PI)).toBeCloseTo(Math.PI / 2);
    expect(dialAngle(99, 10, Math.PI)).toBeCloseTo(Math.PI / 2);
    expect(dialAngle(5, 0, Math.PI)).toBeCloseTo(-Math.PI / 2);
  });
  it("prints compact numbers", () => {
    expect(compactNumber(950)).toBe("950");
    expect(compactNumber(1234)).toBe("1.2k");
    expect(compactNumber(1_500_000)).toBe("1.5M");
    expect(compactNumber(2.5)).toBe("2.5");
    expect(compactNumber(-3000)).toBe("-3k");
  });
});

describe("bayOffsets", () => {
  it("centres a row of bays on zero", () => {
    expect(bayOffsets(3, 1, 0.5)).toEqual([-1.5, 0, 1.5]);
    expect(bayRowWidth(3, 1, 0.5)).toBe(4);
    expect(bayOffsets(0, 1)).toEqual([]);
  });
});

describe("heat", () => {
  const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 5 };
  it("sizes the grid from bounds and cell size", () => {
    const g = heatGrid([], bounds, 0.5);
    expect([g.cols, g.rows, g.cells.length, g.max]).toEqual([20, 10, 200, 0]);
  });
  it("peaks at the point and falls off", () => {
    const g = heatGrid([{ x: 2.25, z: 2.25, value: 5 }], bounds, 0.5, 1);
    const at = (x: number, z: number) => g.cells[Math.floor(z / 0.5) * g.cols + Math.floor(x / 0.5)]!;
    expect(at(2.25, 2.25)).toBeCloseTo(1);
    expect(at(4.25, 2.25)).toBeLessThan(at(3.25, 2.25));
    expect(at(9.75, 4.75)).toBe(0);
    expect(g.max).toBeGreaterThan(0);
  });
  it("normalises against a fixed max when given", () => {
    const g = heatGrid([{ x: 2.25, z: 2.25, value: 1 }], bounds, 0.5, 0.01, 4);
    expect(Math.max(...g.cells)).toBeCloseTo(0.25);
  });
  it("ignores zero and negative values", () => {
    const g = heatGrid([{ x: 1, z: 1, value: -3 }, { x: 1, z: 1, value: 0 }], bounds);
    expect(Math.max(...g.cells)).toBe(0);
  });
  it("fits bounds round the points", () => {
    expect(heatBounds([{ x: 1, z: 2, value: 1 }, { x: -3, z: 5, value: 1 }], 1)).toEqual({ minX: -4, maxX: 2, minZ: 1, maxZ: 6 });
  });
  it("ramps colour and alpha from cold to hot", () => {
    expect(heatColor(0)[3]).toBe(0);
    expect(heatColor(1)).toEqual([255, 104, 119, 255]);
    expect(heatColor(0.5)[3]).toBeGreaterThan(heatColor(0.1)[3]);
  });
});

describe("wrapLines", () => {
  const measure = (s: string) => s.length;
  it("wraps on words", () => {
    expect(wrapLines("the quick brown fox jumps", 10, measure)).toEqual(["the quick", "brown fox", "jumps"]);
  });
  it("ends an overflowing note in an ellipsis", () => {
    const lines = wrapLines("one two three four five six", 9, measure, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith("…")).toBe(true);
  });
  it("cuts a word longer than a line", () => {
    expect(wrapLines("abcdefghijkl", 5, measure)[0]).toBe("abcde");
  });
  it("returns nothing for empty text", () => {
    expect(wrapLines("   ", 5, measure)).toEqual([]);
  });
});
