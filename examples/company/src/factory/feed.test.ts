import { describe, expect, it } from "vitest";
import {
  agentsWithPauses, approveTopReview, blockedBy, factoryAt, getFactory, pauseAgent, resumeAgent, rollbackLastDeploy, spend,
} from "./feed";
import { HISTORY_DAYS } from "./history";

describe("factory feed", () => {
  it("opens on a full catalogue with a review pile", () => {
    const s = getFactory();
    expect(s.services.length).toBe(24);
    expect(s.reviewPile.length).toBeGreaterThanOrEqual(10);
    expect(s.stages.review).toHaveLength(s.reviewPile.length);
    expect(s.sprawl.orphans).toHaveLength(3);
    expect(spend(s).agentTokens).toBeGreaterThan(0);
  });

  it("replays the timeline with only the services that existed", () => {
    const early = factoryAt(5);
    expect(early.services.length).toBe(10);
    expect(Object.keys(early.metrics)).toHaveLength(10);
    expect(factoryAt(HISTORY_DAYS + 10).t).toBe(HISTORY_DAYS);
  });

  it("groups blocked agents by the person they wait on", () => {
    const out = blockedBy({
      agents: [
        { id: "a", blockedOn: "review by @maria" },
        { id: "b", blockedOn: "review by @maria" },
        { id: "c", blockedOn: "CI runner capacity" },
        { id: "d", blockedOn: null },
      ] as never,
    });
    expect(out).toEqual({ "@maria": ["a", "b"], "CI runner capacity": ["c"] });
  });
});

describe("on-call macros", () => {
  it("holds a paused agent where it stopped, idle, until it is resumed", () => {
    const paused = new Map([["agent-7f3", 3]]);
    const later = agentsWithPauses(40, paused).find((a) => a.id === "agent-7f3")!;
    expect(later.paused).toBe(true);
    expect(later.state).toBe("idle");
    expect(later.to).toBeNull();
    expect(later.tokens).toBe(agentsWithPauses(3, new Map()).find((a) => a.id === "agent-7f3")!.tokens);
    expect(agentsWithPauses(40, paused).filter((a) => a.paused)).toHaveLength(1);
  });

  it("logs every macro on the live store, and refuses ones with nothing to do", () => {
    const before = getFactory().audit.length;
    expect(pauseAgent("agent-2c8", "@priya")).toBe(true);
    expect(pauseAgent("agent-2c8", "@priya")).toBe(false);
    expect(getFactory().agents.find((a) => a.id === "agent-2c8")!.paused).toBe(true);
    expect(resumeAgent("agent-2c8", "@priya")).toBe(true);
    expect(getFactory().agents.find((a) => a.id === "agent-2c8")!.paused).toBeUndefined();
    const pile = getFactory().reviewPile.length;
    expect(approveTopReview("@priya")).toBe(true);
    expect(getFactory().reviewPile).toHaveLength(pile - 1);
    // Nothing has shipped on a store that has not ticked.
    expect(rollbackLastDeploy("@priya")).toBe(false);
    const log = getFactory().audit.slice(before);
    expect(log.map((e) => e.action)).toEqual(["pause", "resume", "approve"]);
    expect(log.every((e) => e.who === "@priya")).toBe(true);
  });
});
