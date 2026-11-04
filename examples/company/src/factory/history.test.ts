import { describe, expect, it } from "vitest";
import { SERVICES } from "./catalog";
import { eventsBetween, HISTORY, HISTORY_DAYS, servicesAt, stateAt } from "./history";

describe("history", () => {
  it("is sorted by time", () => {
    for (let i = 1; i < HISTORY.length; i += 1) expect(HISTORY[i]!.t).toBeGreaterThanOrEqual(HISTORY[i - 1]!.t);
  });

  it("grows monotonically: services and deploys never go backwards", () => {
    let prev = stateAt(0);
    for (let t = 0.25; t <= HISTORY_DAYS; t += 0.25) {
      const s = stateAt(t);
      expect(s.counts.services).toBeGreaterThanOrEqual(prev.counts.services);
      expect(s.deploys).toBeGreaterThanOrEqual(prev.deploys);
      const before = new Set(prev.services.map((x) => x.name));
      const now = new Set(s.services.map((x) => x.name));
      for (const n of before) expect(now.has(n)).toBe(true);
      prev = s;
    }
  });

  it("starts with the original ten and ends with the whole catalogue", () => {
    expect(servicesAt(0).length).toBe(10);
    expect(stateAt(0).counts.byAgents).toBe(0);
    expect(stateAt(HISTORY_DAYS).services.length).toBe(SERVICES.length);
  });

  it("only draws calls between services that exist", () => {
    const s = stateAt(60);
    const names = new Set(s.services.map((x) => x.name));
    for (const [a, b] of s.calls) expect(names.has(a) && names.has(b)).toBe(true);
  });

  it("has a service-created event for each service born on the timeline", () => {
    const created = HISTORY.filter((e) => e.kind === "service-created").map((e) => e.service);
    expect(created.length).toBe(SERVICES.length - 10);
  });

  it("deploys more per day once agents take over", () => {
    const deploys = (d: number) => eventsBetween(d, d + 1).filter((e) => e.kind === "deploy").length;
    const early = deploys(1) + deploys(2) + deploys(3);
    const late = deploys(176) + deploys(177) + deploys(178);
    expect(late).toBeGreaterThan(early);
  });

  it("knows the ongoing payments incident at now", () => {
    expect(stateAt(HISTORY_DAYS).incidents.map((i) => i.service)).toContain("payments");
  });
});
