import { describe, expect, it } from "vitest";
import { roomAt } from "site-world";
import { PLAN } from "./plan";
import { LANE, besideSlot, roomSpot, routeBetween, workSpot } from "./routes";

const slot = (name: string) => PLAN.slotByName[name]!;

function route(from: string, to: string) {
  const a = slot(from);
  const b = slot(to);
  return routeBetween(PLAN, PLAN.doors, workSpot(a), a.room, workSpot(b), b.room);
}

describe("besideSlot", () => {
  it("turns the slot's local frame by its facing", () => {
    const s = { pos: [1, 2] as const, facing: Math.PI / 2 };
    const [x, z] = besideSlot(s, [0, 1]);
    // Facing +x: local +z (toward the aisle) is world +x.
    expect(x).toBeCloseTo(2);
    expect(z).toBeCloseTo(2);
  });
});

describe("routeBetween", () => {
  it("starts and ends on the two work spots", () => {
    const r = route("api-gateway", "fraud-score");
    expect(r[0]).toEqual(workSpot(slot("api-gateway")));
    expect(r[r.length - 1]).toEqual(workSpot(slot("fraud-score")));
  });

  it("walks axis-aligned lanes between its first and last legs", () => {
    for (const [a, b] of [["api-gateway", "fraud-score"], ["notify-svc", "report-builder"], ["auth", "customer-profiles"]] as const) {
      const r = route(a, b);
      for (let i = 1; i + 2 < r.length; i += 1) {
        const [p, q] = [r[i]!, r[i + 1]!];
        expect(Math.min(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]))).toBeLessThan(1e-9);
      }
    }
  });

  it("crosses each wall only through a doorway", () => {
    const r = route("auth", "report-builder");
    for (let i = 0; i + 1 < r.length; i += 1) {
      const [p, q] = [r[i]!, r[i + 1]!];
      // Sample the leg; every sample is in a room or in a doorway's gap.
      for (let t = 0; t <= 1; t += 0.02) {
        const x = p[0] + (q[0] - p[0]) * t;
        const z = p[1] + (q[1] - p[1]) * t;
        const inRoom = roomAt(PLAN, x, z) !== null;
        expect(inRoom).toBe(true);
      }
    }
    const crossings = PLAN.doors.filter((d) =>
      r.some((p) => Math.hypot(p[0] - d.doorway.center[0] - (d.doorway.axis === "x" ? LANE : 0), p[1] - d.doorway.center[1] - (d.doorway.axis === "z" ? LANE : 0)) < 1e-6),
    );
    // EDGE -> COMMERCE -> PAYMENTS -> DATA, or EDGE -> PLATFORM -> GROWTH -> DATA: three doors either way.
    expect(crossings).toHaveLength(3);
  });

  it("stays in one room for two services that share it", () => {
    const r = route("notifications", "notify-svc");
    for (const p of r) expect(roomAt(PLAN, p[0], p[1])?.id).toBe("platform");
  });

  it("falls back to a straight line between rooms it cannot connect", () => {
    expect(routeBetween(PLAN, PLAN.doors, [0, 0], "edge", [1, 1], "nowhere")).toEqual([[0, 0], [1, 1]]);
  });
});

describe("spots", () => {
  it("puts every work spot outside its pylon's replica ring and inside its room", () => {
    for (const s of PLAN.slots) {
      const [x, z] = workSpot(s);
      expect(Math.hypot(x - s.pos[0], z - s.pos[1])).toBeGreaterThan(1.3);
      expect(roomAt(PLAN, x, z)?.id).toBe(s.room);
    }
  });

  it("keeps the gathering spot off the walking lanes", () => {
    for (const room of PLAN.rooms) {
      const [x, z] = roomSpot(room);
      expect(Math.abs(z - (room.aisleZ + LANE))).toBeGreaterThan(1);
      expect(Math.abs(x - (room.aisleXs[0]! + LANE))).toBeGreaterThan(1);
    }
  });
});
