import { describe, expect, it } from "vitest";
import {
  layoutWorkLine, nearestAlong, offsetAcross, pileRows, pileSlot, polylineLength, queueStatus, samplePath, stationAlong,
  type FloorPoint, type WorkItem,
} from "./workLineLayout";

const L: FloorPoint[] = [[0, 0], [0, 10], [5, 10]];

describe("belt paths", () => {
  it("measures and samples a polyline, extending its ends", () => {
    expect(polylineLength(L)).toBe(15);
    expect(samplePath(L, 4)).toMatchObject({ x: 0, z: 4, rotY: 0 });
    const corner = samplePath(L, 12);
    expect(corner.x).toBeCloseTo(2);
    expect(corner.z).toBeCloseTo(10);
    expect(corner.rotY).toBeCloseTo(Math.PI / 2);
    expect(samplePath(L, -2)).toMatchObject({ x: 0, z: -2 });
    expect(samplePath(L, 17).x).toBeCloseTo(7);
  });

  it("offsets across the belt along local +x", () => {
    const [x, z] = offsetAcross(samplePath(L, 12), 1);
    // Heading +x, local +x is world -z.
    expect(x).toBeCloseTo(2);
    expect(z).toBeCloseTo(9);
  });

  it("finds the nearest distance along", () => {
    expect(nearestAlong(L, 0.5, 3)).toBeCloseTo(3);
    expect(nearestAlong(L, 3, 11)).toBeCloseTo(13);
    expect(nearestAlong(L, -4, -4)).toBe(0);
  });

  it("spaces stations evenly unless placed", () => {
    expect(stationAlong([{}, {}, {}], 8)).toEqual([2, 4, 6]);
    expect(stationAlong([{ at: 0.5 }], 8)).toEqual([4]);
  });
});

describe("piles", () => {
  const o = { cols: 2, rows: 3, pitch: 0.5, layer: 0.4 };
  it("fills across, then back, then up", () => {
    expect(pileSlot(0, o)).toMatchObject({ col: 0, row: 0, level: 0, back: 0.25, side: -0.25, up: 0 });
    expect(pileSlot(1, o)).toMatchObject({ col: 1, row: 0, level: 0, side: 0.25 });
    expect(pileSlot(2, o)).toMatchObject({ col: 0, row: 1, back: 0.75 });
    expect(pileSlot(6, o)).toMatchObject({ col: 0, row: 0, level: 1, up: 0.4 });
    expect(pileSlot(13, o)).toMatchObject({ col: 1, row: 0, level: 2 });
  });

  it("gives every crate in a pile its own slot", () => {
    const keys = new Set(Array.from({ length: 40 }, (_, i) => {
      const s = pileSlot(i, o);
      return `${s.back}/${s.side}/${s.up}`;
    }));
    expect(keys.size).toBe(40);
  });

  it("always has at least one row", () => {
    expect(pileRows(0.1, 0.5)).toBe(1);
    expect(pileRows(2.1, 0.5)).toBe(4);
  });

  it("lights a station by its queue", () => {
    expect(queueStatus(0, 4, 8)).toBe("idle");
    expect(queueStatus(2, 4, 8)).toBe("ok");
    expect(queueStatus(4, 4, 8)).toBe("warn");
    expect(queueStatus(9, 4, 8)).toBe("critical");
  });
});

describe("layoutWorkLine", () => {
  const g = { path: [[0, 0], [0, 12]] as FloorPoint[], stations: [{}, {}, {}], gateDepth: 0.4, cols: 2, pitch: 0.5, layer: 0.4 };
  const item = (id: string, stage: number, status: WorkItem["status"]): WorkItem => ({ id, stage, status });

  it("puts working items in the gate and the rest in a pile in front of it", () => {
    const out = layoutWorkLine(g, [item("a", 1, "working"), item("b", 1, "queued"), item("c", 1, "waiting-review")]);
    expect(out.along).toEqual([3, 6, 9]);
    expect(out.counts).toEqual([0, 3, 0]);
    expect(out.items.get("a")).toMatchObject({ kind: "gate", along: 6 });
    const b = out.items.get("b")!;
    const c = out.items.get("c")!;
    if (b.kind !== "belt" || c.kind !== "belt") throw new Error("expected belt placements");
    expect(b.along).toBeLessThan(6 - 0.2);
    expect(b.along).toBeGreaterThan(3 + 0.2);
    expect(c.along).toBe(b.along);
    expect(c.side).not.toBe(b.side);
  });

  it("piles a backlog upward once it fills the gap to the previous station", () => {
    const backlog = Array.from({ length: 30 }, (_, i) => item(`r${i}`, 2, "waiting-review"));
    const out = layoutWorkLine(g, backlog);
    expect(out.counts[2]).toBe(30);
    const placements = [...out.items.values()];
    const minAlong = Math.min(...placements.map((p) => (p.kind === "belt" ? p.along : Infinity)));
    expect(minAlong).toBeGreaterThan(out.along[1]! + 0.2);
    expect(Math.max(...placements.map((p) => (p.kind === "belt" ? p.up : 0)))).toBeGreaterThan(0);
  });

  it("stacks sooner under a row cap", () => {
    const backlog = Array.from({ length: 12 }, (_, i) => item(`r${i}`, 2, "waiting-review"));
    const out = layoutWorkLine({ ...g, maxRows: 2 }, backlog);
    expect(out.rows[2]).toBe(2);
    expect(Math.max(...[...out.items.values()].map((p) => (p.kind === "belt" ? p.up : 0)))).toBeCloseTo(0.8);
  });

  it("sends failed items to the bin and deployed items away, uncounted", () => {
    const out = layoutWorkLine(g, [item("x", 1, "failed"), item("y", 2, "deployed"), item("z", 0, "failed")]);
    expect(out.counts).toEqual([0, 0, 0]);
    expect(out.rejected).toEqual(["x", "z"]);
    expect(out.items.get("z")).toEqual({ kind: "reject", slot: 1 });
    expect(out.items.get("y")).toEqual({ kind: "deployed" });
  });

  it("clamps stages to the stations it has", () => {
    const out = layoutWorkLine(g, [item("a", 7, "queued"), item("b", -1, "queued")]);
    expect(out.counts).toEqual([1, 0, 1]);
  });
});
