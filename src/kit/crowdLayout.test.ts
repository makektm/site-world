import { describe, expect, it } from "vitest";
import { crowdLayout, fanOut, type CrowdMember } from "./crowdLayout";

function minGap(points: [number, number][]): number {
  let min = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      min = Math.min(min, Math.hypot(points[i]![0] - points[j]![0], points[i]![1] - points[j]![1]));
    }
  }
  return min;
}

describe("fanOut", () => {
  it("keeps every pair at least `spacing` apart, for small and large crowds", () => {
    for (let n = 2; n <= 40; n += 1) {
      const pts = fanOut(n, 0.75);
      expect(pts).toHaveLength(n);
      expect(minGap(pts)).toBeGreaterThanOrEqual(0.75 - 1e-9);
    }
  });

  it("puts one figure on the spot and none for an empty crowd", () => {
    expect(fanOut(1, 1)).toEqual([[0, 0]]);
    expect(fanOut(0, 1)).toEqual([]);
  });

  it("stays compact: a pair sits half a spacing either side of the centre", () => {
    const [a, b] = fanOut(2, 1);
    expect(Math.hypot(...a!)).toBeCloseTo(0.5);
    expect(Math.hypot(...b!)).toBeCloseTo(0.5);
  });
});

describe("crowdLayout", () => {
  const members: CrowdMember[] = [
    { id: "c", at: [5, 5] },
    { id: "a", at: [5, 5] },
    { id: "b", at: [5.1, 5] },
    { id: "lonely", at: [-3, 2] },
  ];

  it("leaves a lone member exactly where it asked to be", () => {
    expect(crowdLayout(members).get("lonely")).toEqual([-3, 2]);
  });

  it("fans out members sharing a spot round their centre", () => {
    const out = crowdLayout(members, { spacing: 0.8 });
    const crowd = ["a", "b", "c"].map((id) => out.get(id)!);
    expect(minGap(crowd)).toBeGreaterThanOrEqual(0.8 - 1e-9);
    const cx = crowd.reduce((s, p) => s + p[0], 0) / 3;
    const cz = crowd.reduce((s, p) => s + p[1], 0) / 3;
    expect(cx).toBeCloseTo((5 + 5 + 5.1) / 3);
    expect(cz).toBeCloseTo(5);
  });

  it("is independent of input order", () => {
    const a = crowdLayout(members);
    const b = crowdLayout([...members].reverse());
    for (const m of members) expect(b.get(m.id)).toEqual(a.get(m.id));
  });

  it("chains near neighbours into one crowd", () => {
    const chain: CrowdMember[] = [
      { id: "1", at: [0, 0] },
      { id: "2", at: [0.4, 0] },
      { id: "3", at: [0.8, 0] },
    ];
    const out = crowdLayout(chain, { join: 0.5, spacing: 0.75 });
    expect(minGap(chain.map((m) => out.get(m.id)!))).toBeGreaterThanOrEqual(0.75 - 1e-9);
  });

  it("returns an empty map for no members", () => {
    expect(crowdLayout([]).size).toBe(0);
  });
});
