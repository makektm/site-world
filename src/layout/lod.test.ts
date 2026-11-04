import { describe, expect, it } from "vitest";
import { distanceToRect, LOD_THRESHOLDS, lodFor, lodForRect } from "./lod";

const { detail, room } = LOD_THRESHOLDS;

describe("lodFor", () => {
  it("steps detail -> room -> campus with distance", () => {
    expect(lodFor(0)).toBe("detail");
    expect(lodFor(detail - 0.01)).toBe("detail");
    expect(lodFor(detail)).toBe("room");
    expect(lodFor(room)).toBe("campus");
  });

  it("holds a level just past its threshold when told the previous one", () => {
    expect(lodFor(detail * 1.05, LOD_THRESHOLDS, "detail")).toBe("detail");
    expect(lodFor(detail * 1.2, LOD_THRESHOLDS, "detail")).toBe("room");
    expect(lodFor(room * 1.05, LOD_THRESHOLDS, "room")).toBe("room");
    expect(lodFor(room * 2, LOD_THRESHOLDS, "detail")).toBe("campus");
  });

  it("never delays a step toward more detail", () => {
    expect(lodFor(detail - 0.01, LOD_THRESHOLDS, "campus")).toBe("detail");
  });

  it("takes custom thresholds", () => {
    expect(lodFor(5, { detail: 4, room: 6 })).toBe("room");
  });
});

describe("distanceToRect / lodForRect", () => {
  const r = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
  it("is 0 inside and the edge distance outside", () => {
    expect(distanceToRect(5, 5, r)).toBe(0);
    expect(distanceToRect(13, 14, r)).toBe(5);
  });
  it("counts a camera's height", () => {
    expect(lodForRect({ x: 5, z: 5 }, r)).toBe("detail");
    expect(lodForRect({ x: 5, z: 5, y: room + 1 }, r)).toBe("campus");
  });
});
