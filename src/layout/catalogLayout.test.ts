import { describe, expect, it } from "vitest";
import { DOOR_H, WALL } from "../core/engine";
import {
  layoutCatalog, OUTSIDE, UNASSIGNED_DOMAIN,
  type Catalog, type CatalogPlan, type CatalogService, type FloorRect,
} from "./catalogLayout";
import { roomAt } from "./planGraph";

/** A catalog of `nd` domains and `ns` services, dealt unevenly so rooms differ in size. */
function catalog(nd: number, ns: number): Catalog<CatalogService & { owner: string }> {
  const domains = Array.from({ length: nd }, (_, i) => ({ id: `d${i}`, label: `Domain ${i}`, sub: `sub ${i}` }));
  const services = Array.from({ length: ns }, (_, i) => ({
    name: `svc-${String(i).padStart(3, "0")}`,
    // Squared index skews services toward the first domains.
    domain: `d${Math.floor(((i * i) % (ns * 7 + 1)) / (ns * 7 + 1) * nd)}`,
    owner: i % 3 ? "agent" : "human",
  }));
  return { domains, services };
}

const overlaps = (a: FloorRect, b: FloorRect, eps = 1e-6) =>
  a.minX < b.maxX - eps && b.minX < a.maxX - eps && a.minZ < b.maxZ - eps && b.minZ < a.maxZ - eps;

/** Flood fill from the first room using only geometry: a door joins whichever
 * rooms lie a step to either side of its gap, and the gap must be open at
 * walking height (no wall box covers it below DOOR_H). */
function floodFill(plan: CatalogPlan): Set<string> {
  const edges = new Map<string, Set<string>>();
  const join = (a: string, b: string) => {
    if (!edges.has(a)) edges.set(a, new Set());
    edges.get(a)!.add(b);
  };
  for (const d of plan.doors) {
    const [x, z] = d.doorway.center;
    const blocked = plan.walls.some((w) => {
      const [px, py, pz] = w.pos;
      const [sx, sy, sz] = w.size;
      return py - sy / 2 < DOOR_H - 0.01 && Math.abs(x - px) < sx / 2 - 1e-6 && Math.abs(z - pz) < sz / 2 - 1e-6;
    });
    expect(blocked, `door ${d.id} is walled up`).toBe(false);
    const step = 0.5;
    const [ax, az, bx, bz] = d.doorway.axis === "z" ? [x - step, z, x + step, z] : [x, z - step, x, z + step];
    const a = roomAt(plan, ax, az)?.id ?? OUTSIDE;
    const b = roomAt(plan, bx, bz)?.id ?? OUTSIDE;
    expect(a).not.toBe(b);
    join(a, b);
    join(b, a);
  }
  const start = plan.rooms[0]!.id;
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) for (const n of edges.get(queue.shift()!) ?? []) if (!seen.has(n)) seen.add(n), queue.push(n);
  return seen;
}

/** Every invariant a host relies on, for any catalog. */
function checkPlan(plan: CatalogPlan, cat: Catalog) {
  // Rooms tile their buildings without overlap; buildings and wings never overlap.
  for (let i = 0; i < plan.rooms.length; i++) {
    for (let j = i + 1; j < plan.rooms.length; j++) {
      expect(overlaps(plan.rooms[i]!.rect, plan.rooms[j]!.rect), `${plan.rooms[i]!.id} / ${plan.rooms[j]!.id}`).toBe(false);
    }
  }
  const blocks = [...plan.buildings.map((b) => b.rect), ...plan.wings.map((w) => w.rect)];
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) expect(overlaps(blocks[i]!, blocks[j]!)).toBe(false);
  for (const b of plan.buildings) {
    const area = (r: FloorRect) => (r.maxX - r.minX) * (r.maxZ - r.minZ);
    const rooms = plan.rooms.filter((r) => r.building === b.index);
    expect(rooms.reduce((s, r) => s + area(r.rect), 0)).toBeCloseTo(area(b.rect), 6);
  }

  // Every service has exactly one slot, inside its room, clear of walls,
  // aisles and doorways, and no two slots share a spot.
  const unique = new Set(cat.services.map((s) => s.name));
  expect(plan.slots.length).toBe(unique.size);
  const seenPos = new Set<string>();
  for (const s of plan.slots) {
    const room = plan.roomById[s.room]!;
    const [x, z] = s.pos;
    expect(x > room.rect.minX + 1 && x < room.rect.maxX - 1 && z > room.rect.minZ + 1 && z < room.rect.maxZ - 1).toBe(true);
    expect(Math.abs(z - room.aisleZ)).toBeGreaterThanOrEqual(1.2 + 1.2 - 1e-6);
    for (const ax of room.aisleXs) expect(Math.abs(x - ax)).toBeGreaterThanOrEqual(1.2 + 1.2 - 1e-6);
    for (const d of plan.doors) expect(Math.hypot(x - d.doorway.center[0], z - d.doorway.center[1])).toBeGreaterThan(2);
    const key = `${x},${z}`;
    expect(seenPos.has(key)).toBe(false);
    seenPos.add(key);
    expect(room.services).toContain(s.name);
  }
  for (const r of plan.rooms) expect(r.capacity).toBeGreaterThanOrEqual(r.services.length);

  // Every door opens onto an aisle of each room it joins.
  for (const link of plan.doorLinks) {
    const d = plan.doors.find((x) => x.id === link.door)!;
    for (const id of [link.a, link.b]) {
      if (id === OUTSIDE) continue;
      const r = plan.roomById[id]!;
      const on = d.doorway.axis === "z" ? d.doorway.center[1] === r.aisleZ : r.aisleXs.includes(d.doorway.center[0]);
      expect(on, `${d.id} misses ${id}'s aisle`).toBe(true);
    }
  }

  // Walls: whole height or headers over gaps, nothing degenerate.
  for (const w of plan.walls) {
    for (const s of w.size) expect(s).toBeGreaterThan(0);
    expect(w.pos[1] + w.size[1] / 2).toBeCloseTo(WALL, 6);
  }

  // Doors and signs: unique ids, two banners per door.
  expect(new Set(plan.doors.map((d) => d.id)).size).toBe(plan.doors.length);
  expect(plan.doorSigns.length).toBe(plan.doors.length * 2);
  expect(new Set(plan.doorSigns.map((s) => s.panelId)).size).toBe(plan.doorSigns.length);

  // Reachability: one flood fill from the first room reaches every room.
  const reached = floodFill(plan);
  for (const r of plan.rooms) expect(reached.has(r.id), `${r.id} unreachable`).toBe(true);
}

describe("layoutCatalog", () => {
  it.each([
    [3, 9],
    [4, 10],
    [6, 24],
    [6, 40],
    [9, 60],
    [12, 200],
    [25, 200],
  ])("%i domains, %i services: no overlaps, every slot clear, every room reachable", (nd, ns) => {
    const cat = catalog(nd, ns);
    const plan = layoutCatalog(cat);
    expect(plan.rooms.length).toBe(nd);
    checkPlan(plan, cat);
  });

  it("3 domains fill one rectangular building, the last room stretching over the empty cell", () => {
    const plan = layoutCatalog(catalog(3, 9));
    expect(plan.mode).toBe("building");
    expect(plan.buildings).toHaveLength(1);
    const last = plan.rooms[2]!;
    expect(last.aisleXs).toHaveLength(2);
    expect(last.rect.minX).toBe(plan.buildingBounds.minX);
    expect(last.rect.maxX).toBe(plan.buildingBounds.maxX);
    // One building, no entrances: a closed shell like examples/company.
    expect(plan.doorLinks.some((l) => l.b === OUTSIDE)).toBe(false);
  });

  it("rooms grow with their service count", () => {
    const plan = layoutCatalog({
      domains: [{ id: "small", label: "S" }, { id: "big", label: "B" }],
      services: [
        { name: "a", domain: "small" },
        ...Array.from({ length: 60 }, (_, i) => ({ name: `b${i}`, domain: "big" })),
      ],
    });
    const w = (id: string) => plan.roomById[id]!.rect.maxX - plan.roomById[id]!.rect.minX;
    expect(w("big")).toBeGreaterThan(w("small"));
    checkPlan(plan, { domains: [], services: plan.slots.map((s) => s.service) });
  });

  it("is deterministic, whatever order the services arrive in", () => {
    const cat = catalog(6, 40);
    const a = layoutCatalog(cat);
    const b = layoutCatalog({ domains: cat.domains, services: [...cat.services].reverse() });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(layoutCatalog(cat))).toBe(JSON.stringify(a));
  });

  it("orders slots by service name within each room", () => {
    const plan = layoutCatalog(catalog(4, 40));
    for (const r of plan.rooms) expect([...r.services]).toEqual([...r.services].sort());
  });

  it("splits more than 9 domains into an even campus of buildings joined through entrances", () => {
    const plan = layoutCatalog(catalog(10, 50));
    expect(plan.mode).toBe("campus");
    expect(plan.buildings.map((b) => b.rooms.length)).toEqual([5, 5]);
    expect(plan.buildings[0]!.rect.maxX).toBeLessThan(plan.buildings[1]!.rect.minX);
    expect(plan.doorLinks.filter((l) => l.b === OUTSIDE)).toHaveLength(2);
    expect(floodFill(plan).has(OUTSIDE)).toBe(true);
  });

  it("honours maxDomainsPerBuilding", () => {
    const plan = layoutCatalog(catalog(6, 12), { maxDomainsPerBuilding: 2 });
    expect(plan.buildings).toHaveLength(3);
    checkPlan(plan, catalog(6, 12));
  });

  it("keeps the shape of examples/company's door data", () => {
    const plan = layoutCatalog(catalog(4, 10));
    const d = plan.doors[0]!;
    expect(Object.keys(d).sort()).toEqual(["code", "doorway", "id", "kind"]);
    expect(d.doorway.halfWidth).toBe(1.2);
    expect(d.code).toMatch(/^[A-Z0-9]-[A-Z0-9]$/);
    const s = plan.doorSigns[0]!;
    expect(Object.keys(s).sort()).toEqual(["height", "label", "panelId", "pos", "rotationY", "sub", "wall", "width"]);
    // 2x2 like examples/company: two doors in rows, two between them.
    expect(plan.doors).toHaveLength(4);
  });

  it("lets the host choose door kinds", () => {
    const plan = layoutCatalog(catalog(4, 10), { doorKind: (a, b) => (a === "d1" || b === "d1" ? "biparting" : "slide") });
    for (const l of plan.doorLinks) {
      const kind = plan.doors.find((d) => d.id === l.door)!.kind;
      expect(kind).toBe(l.a === "d1" || l.b === "d1" ? "biparting" : "slide");
    }
  });

  it("leaves spare slots with headroom", () => {
    const tight = layoutCatalog(catalog(4, 40));
    const loose = layoutCatalog(catalog(4, 40), { headroom: 0.5 });
    const cap = (p: CatalogPlan) => p.rooms.reduce((s, r) => s + r.capacity, 0);
    expect(cap(loose)).toBeGreaterThanOrEqual(Math.ceil(40 * 1.5));
    expect(cap(loose)).toBeGreaterThan(cap(tight));
  });

  it("places wings outside the buildings, stacking on a side, and widens bounds", () => {
    const cat = catalog(4, 20);
    const plan = layoutCatalog(cat, {
      wings: [
        { id: "factory", label: "FACTORY", side: "east", width: 20, depth: 14 },
        { id: "dock", side: "east", width: 10, depth: 6, gap: 2 },
        { id: "yard", side: "south", width: 12, depth: 5 },
        { id: "bad", side: "north", width: 0, depth: 5 },
      ],
    });
    expect(plan.wings.map((w) => w.id)).toEqual(["factory", "dock", "yard"]);
    const [factory, dock] = plan.wings;
    expect(factory!.rect.minX).toBe(plan.buildingBounds.maxX + 4);
    expect(dock!.rect.minX).toBe(factory!.rect.maxX + 2);
    expect(dock!.label).toBe("DOCK");
    expect(plan.bounds.maxX).toBe(dock!.rect.maxX);
    expect(plan.warnings.some((w) => w.includes('"bad"'))).toBe(true);
    checkPlan(plan, cat);
  });

  it("gathers services of unknown domains in an UNASSIGNED room and drops duplicate names", () => {
    const plan = layoutCatalog({
      domains: [{ id: "a", label: "A" }, { id: "a", label: "again" }],
      services: [
        { name: "x", domain: "a" },
        { name: "y", domain: "ghost" },
        { name: "x", domain: "ghost" },
      ],
    });
    expect(plan.rooms.map((r) => r.id)).toEqual(["a", UNASSIGNED_DOMAIN]);
    expect(plan.slotByName.y!.room).toBe(UNASSIGNED_DOMAIN);
    expect(plan.slotByName.x!.room).toBe("a");
    expect(plan.warnings).toHaveLength(3);
  });

  it("carries the host's own service fields through to the slot", () => {
    const plan = layoutCatalog(catalog(3, 9));
    expect(plan.slots[0]!.service.owner).toMatch(/agent|human/);
  });

  it("returns an empty plan for an empty catalog", () => {
    const plan = layoutCatalog({ domains: [], services: [] });
    expect(plan.rooms).toEqual([]);
    expect(plan.walls).toEqual([]);
    expect(plan.bounds).toEqual({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 });
  });

  it("frames the camera on the plan and starts a walker on an aisle crossing", () => {
    const plan = layoutCatalog(catalog(4, 10));
    const r = plan.rooms[0]!;
    expect(plan.camera.walkStart).toEqual([r.center[0], r.aisleZ]);
    expect(plan.camera.target[0]).toBeCloseTo((plan.bounds.minX + plan.bounds.maxX) / 2, 6);
  });
});
