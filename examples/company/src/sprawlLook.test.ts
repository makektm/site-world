import { describe, expect, it } from "vitest";
import { CALLS, SERVICES } from "./factory/catalog";
import { sprawlReport } from "./factory/sprawl";
import { MAX_RINGS, ageRings, looksAt, pylonLooks } from "./sprawlLook";

describe("pylonLooks", () => {
  const looks = pylonLooks(SERVICES, sprawlReport(SERVICES, CALLS));

  it("gives both services of a look-alike pair the same tint, and each pair its own", () => {
    const a = looks.get("notifications")!.pair!;
    const b = looks.get("notify-svc")!.pair!;
    expect(a.tint).toBe(b.tint);
    expect(a.with).toBe("notify-svc");
    expect(looks.get("invoice-gen")!.pair!.tint).not.toBe(a.tint);
  });

  it("marks orphans and agent-only owners", () => {
    expect(looks.get("report-builder")!.orphan).toBe(true);
    expect(looks.get("fraud-score")!.unowned).toBe(true);
    expect(looks.get("orders")!.orphan || looks.get("orders")!.unowned).toBe(false);
  });

  it("carries the origin through", () => {
    expect(looks.get("orders")!.origin).toBe("human");
    expect(looks.get("fraud-score")!.origin).toBe("agent");
  });
});

describe("ageRings", () => {
  it("adds a ring per 120 days, from one, up to the cap", () => {
    expect(ageRings(0)).toBe(1);
    expect(ageRings(119)).toBe(1);
    expect(ageRings(120)).toBe(2);
    expect(ageRings(10_000)).toBe(MAX_RINGS);
  });
});

describe("looks at a past moment", () => {
  it("makes every service younger by the days gone back", () => {
    const s = SERVICES.find((x) => x.createdAt > 300)!;
    const report = sprawlReport(SERVICES, CALLS);
    expect(looksAt(SERVICES, report, 0).get(s.name)!.rings).toBeGreaterThan(looksAt(SERVICES, report, 200).get(s.name)!.rings);
  });
});
