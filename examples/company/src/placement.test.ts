import { describe, expect, it } from "vitest";
import { roomAt } from "site-world";
import { SERVICES } from "./factory/catalog";
import { DATABASES } from "./factory/infra";
import { PLAN, boardSpot } from "./plan";
import { TANK_RADIUS, domainSpend, meterSpots, tankSpot, wallSpot } from "./placement";

describe("tankSpot", () => {
  it("stands every database inside its owner's room, clear of every pylon's ring", () => {
    for (const db of DATABASES) {
      const owner = PLAN.slotByName[db.owner]!;
      const [x, z] = tankSpot(owner);
      const room = PLAN.roomById[owner.room]!.rect;
      expect(x - TANK_RADIUS).toBeGreaterThan(room.minX + 0.1);
      expect(x + TANK_RADIUS).toBeLessThan(room.maxX - 0.1);
      expect(z - TANK_RADIUS).toBeGreaterThan(room.minZ + 0.1);
      expect(z + TANK_RADIUS).toBeLessThan(room.maxZ - 0.1);
      for (const s of PLAN.slots) expect(Math.hypot(x - s.pos[0], z - s.pos[1])).toBeGreaterThan(1.05 + TANK_RADIUS - 0.5);
    }
  });
});

describe("meterSpots", () => {
  it("finds two spots per room, inside it and out of every doorway", () => {
    for (const room of PLAN.rooms) {
      const spots = meterSpots(room, boardSpot(room), PLAN.doors, 2);
      expect(spots).toHaveLength(2);
      for (const [x, z] of spots) {
        expect(roomAt(PLAN, x, z)?.id).toBe(room.id);
        for (const d of PLAN.doors) {
          if (d.doorway.axis !== "x") continue;
          const near = Math.abs(d.doorway.center[1] - z) < 1;
          if (near) expect(Math.abs(x - d.doorway.center[0])).toBeGreaterThan(d.doorway.halfWidth);
        }
      }
    }
  });
});

describe("wallSpot", () => {
  it("slides a note off a doorway on its wall", () => {
    const growth = PLAN.roomById.growth!;
    const door = PLAN.doors.find((d) => d.code === "OUT")!;
    const spot = wallSpot(growth, "south", door.doorway.center, PLAN.doors);
    expect(spot.wall[1]).toBe(growth.rect.maxZ);
    expect(Math.abs(spot.wall[0] - door.doorway.center[0])).toBeGreaterThanOrEqual(door.doorway.halfWidth + 0.4 - 1e-9);
    expect(spot.rotationY).toBeCloseTo(Math.PI);
  });
});

describe("domainSpend", () => {
  it("adds compute and token cost per domain", () => {
    const spend = domainSpend(SERVICES);
    const total = Object.values(spend).reduce((n, d) => n + d.usdPerDay, 0);
    const want = SERVICES.reduce((n, s) => n + s.costPerDay + (s.tokensPerDay / 1e6) * 6, 0);
    expect(total).toBeCloseTo(want);
    expect(spend.payments.tokensPerDay).toBeGreaterThan(spend.edge.tokensPerDay);
  });
});

describe("wallSpot obstacles", () => {
  it("slides a note out from behind something standing at the wall", () => {
    const data = PLAN.roomById.data!;
    const near: [number, number] = [9.2, 7];
    const free = wallSpot(data, "north", near, PLAN.doors);
    const blocked = wallSpot(data, "north", near, PLAN.doors, 0.35, [[free.wall[0], data.rect.minZ + 0.6]]);
    expect(Math.abs(blocked.wall[0] - free.wall[0])).toBeGreaterThanOrEqual(0.7 + 0.35 - 1e-9);
  });
});
