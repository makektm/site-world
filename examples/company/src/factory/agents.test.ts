import { describe, expect, it } from "vitest";
import { AGENTS, agentAt, agentsAt, humansAt } from "./agents";
import { serviceByName } from "./catalog";

describe("agents", () => {
  it("runs eight sessions in real services", () => {
    expect(AGENTS).toHaveLength(8);
    for (const a of AGENTS) for (const t of a.tasks) for (const s of t.route) expect(serviceByName.has(s), s).toBe(true);
  });

  it("is deterministic and only ever spends more", () => {
    for (const a of AGENTS) {
      let prev = agentAt(a, 0).tokens;
      for (let t = 1; t < 400; t += 1) {
        const s = agentAt(a, t);
        expect(s.tokens).toBeGreaterThanOrEqual(prev);
        prev = s.tokens;
      }
      expect(agentAt(a, 77)).toEqual(agentAt(a, 77));
    }
  });

  it("walks, works, blocks and finishes over time", () => {
    const seen = new Set<string>();
    for (let t = 0; t < 200; t += 1) for (const a of agentsAt(t)) seen.add(a.state);
    expect([...seen].sort()).toEqual(["blocked", "done", "idle", "walking", "working"]);
  });

  it("names a blocker only while blocked, and a destination only while walking", () => {
    for (let t = 0; t < 200; t += 1) {
      for (const a of agentsAt(t)) {
        expect(a.blockedOn !== null).toBe(a.state === "blocked");
        expect(a.to !== null).toBe(a.state === "walking");
      }
    }
  });

  it("has someone blocked on a review at the start", () => {
    // The opening shot of the demo should show the bottleneck.
    const blocked = Array.from({ length: 40 }, (_, t) => agentsAt(t).filter((a) => a.state === "blocked").length);
    expect(Math.max(...blocked)).toBeGreaterThan(0);
  });

  it("puts three humans in rooms", () => {
    expect(humansAt(0)).toHaveLength(3);
  });
});
