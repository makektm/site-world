import { describe, expect, it } from "vitest";
import { blockedBy, factoryAt, getFactory, spend } from "./feed";
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
