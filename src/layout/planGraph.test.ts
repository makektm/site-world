import { describe, expect, it } from "vitest";
import { layoutCatalog, OUTSIDE } from "./catalogLayout";
import { doorPath, reachableRooms, roomAt, roomNeighbours } from "./planGraph";

const domains = Array.from({ length: 6 }, (_, i) => ({ id: `d${i}`, label: `D${i}` }));
const services = Array.from({ length: 30 }, (_, i) => ({ name: `s${i}`, domain: `d${i % 6}` }));

describe("plan graph", () => {
  const plan = layoutCatalog({ domains, services });

  it("finds the room a point is in", () => {
    for (const r of plan.rooms) expect(roomAt(plan, r.center[0], r.center[1])?.id).toBe(r.id);
    expect(roomAt(plan, plan.bounds.maxX + 5, 0)).toBeNull();
  });

  it("lists neighbours both ways", () => {
    const n = roomNeighbours(plan);
    for (const l of plan.doorLinks) {
      expect(n[l.a]).toContain(l.b);
      expect(n[l.b]).toContain(l.a);
    }
  });

  it("reaches every room from any room", () => {
    for (const r of plan.rooms) expect(reachableRooms(plan, r.id).size).toBe(plan.rooms.length);
  });

  it("walks the fewest doors between rooms", () => {
    expect(doorPath(plan, "d0", "d0")).toEqual([]);
    const path = doorPath(plan, "d0", "d5")!;
    expect(path.length).toBeGreaterThan(0);
    let at = "d0";
    for (const step of path) {
      expect([step.a, step.b]).toContain(at);
      at = step.a === at ? step.b : step.a;
    }
    expect(at).toBe("d5");
    expect(doorPath({ rooms: plan.rooms, doorLinks: [] }, "d0", "d5")).toBeNull();
  });

  it("goes out of one building and into the next on a campus", () => {
    const campus = layoutCatalog({ domains, services }, { maxDomainsPerBuilding: 3 });
    const path = doorPath(campus, "d0", "d5")!;
    expect(path.some((s) => s.b === OUTSIDE)).toBe(true);
  });
});
