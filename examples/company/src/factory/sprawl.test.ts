import { describe, expect, it } from "vitest";
import { CALLS, SERVICES, serviceByName } from "./catalog";
import { costHotspots, findLookAlikes, findOrphans, findUnowned, nameCore, nameSimilarity, sprawlReport } from "./sprawl";

describe("look-alike detection", () => {
  it("ignores noise words and separators", () => {
    expect(nameCore("notify-svc")).toBe("notify");
    expect(nameCore("Profiles_API")).toBe("profiles");
  });

  it("scores same-idea names high and unrelated names low", () => {
    expect(nameSimilarity("notifications", "notify-svc")).toBeGreaterThanOrEqual(0.75);
    expect(nameSimilarity("invoice-gen", "invoice-generator")).toBeGreaterThanOrEqual(0.75);
    expect(nameSimilarity("orders-api", "orders")).toBe(1);
    expect(nameSimilarity("payments", "billing")).toBeLessThan(0.5);
    // A short shared prefix is not a stem.
    expect(nameSimilarity("auth", "audit")).toBeLessThan(0.75);
  });

  it("only pairs services in the same domain", () => {
    const pairs = findLookAlikes([
      { name: "feature-flags", domain: "platform" },
      { name: "feature-flag-svc", domain: "platform" },
      { name: "feature-flags-api", domain: "growth" },
    ]);
    expect(pairs.map((p) => [p.a, p.b])).toEqual([["feature-flags", "feature-flag-svc"]]);
  });

  it("finds exactly the catalogue's three duplicate pairs", () => {
    const pairs = findLookAlikes(SERVICES).map((p) => [p.a, p.b].sort().join(" ~ ")).sort();
    expect(pairs).toEqual(["customer-profile ~ customer-profiles", "invoice-gen ~ invoice-generator", "notifications ~ notify-svc"]);
  });
});

describe("orphan detection", () => {
  it("needs both no callers and no traffic", () => {
    const services = [
      { name: "entry", baseRps: 100 },
      { name: "dead", baseRps: 0 },
      { name: "called-but-idle", baseRps: 0 },
    ];
    expect(findOrphans(services, [["entry", "called-but-idle"]])).toEqual(["dead"]);
  });

  it("prefers live rps over the baseline", () => {
    expect(findOrphans([{ name: "x", baseRps: 50 }], [], { x: 0 })).toEqual(["x"]);
  });

  it("finds the catalogue's three orphans", () => {
    expect(findOrphans(SERVICES, CALLS).sort()).toEqual(["ab-testing", "invoice-generator", "report-builder"]);
  });
});

describe("catalogue sprawl", () => {
  it("has three services owned only by an agent session", () => {
    expect(findUnowned(SERVICES).sort()).toEqual(["customer-profiles", "fraud-score", "notify-svc"]);
  });

  it("ranks token-heavy services among the cost hotspots", () => {
    const top = costHotspots(SERVICES, 3).map((h) => h.name);
    expect(top).toContain("analytics-worker");
    expect(top).toContain("fraud-score");
  });

  it("has every call edge between real services", () => {
    for (const [a, b] of CALLS) {
      expect(serviceByName.has(a), a).toBe(true);
      expect(serviceByName.has(b), b).toBe(true);
    }
    expect(SERVICES.length).toBe(24);
    expect(new Set(SERVICES.map((s) => s.name)).size).toBe(SERVICES.length);
  });

  it("turns everything into findings", () => {
    const r = sprawlReport(SERVICES, CALLS);
    expect(r.findings.filter((f) => f.kind === "orphan")).toHaveLength(3);
    expect(r.findings.filter((f) => f.kind === "look-alike")).toHaveLength(3);
  });
});
