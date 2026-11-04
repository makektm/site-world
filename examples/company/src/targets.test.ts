import { describe, expect, it } from "vitest";
import { fuzzySearch } from "site-world";
import { getFactory } from "./factory/feed";
import type { AgentState } from "./factory/agents";
import { PLAN } from "./plan";
import { FOLLOW, goToTargets, pickStuckAgent, splitTargetId } from "./targets";

const live = getFactory();

describe("go-to targets", () => {
  const targets = goToTargets(live);

  it("lists every service, room, agent (twice: go and follow), database and third party once", () => {
    const ids = targets.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(targets.filter((t) => t.kind === "service")).toHaveLength(24);
    expect(targets.filter((t) => t.kind === "room")).toHaveLength(PLAN.rooms.length + PLAN.wings.length);
    expect(targets.filter((t) => t.kind === "agent")).toHaveLength(live.agents.length);
    expect(targets.filter((t) => t.kind === FOLLOW)).toHaveLength(live.agents.length);
    expect(targets.filter((t) => t.kind === "external")).toHaveLength(live.infra.externals.length);
  });

  it("puts a service at its pylon", () => {
    const t = targets.find((x) => x.id === "service:payments")!;
    const slot = PLAN.slotByName.payments!;
    expect([t.pos[0], t.pos[2]]).toEqual([slot.pos[0], slot.pos[1]]);
  });

  it("is findable by the palette's search", () => {
    expect(fuzzySearch(targets, "pay")[0]!.label).toBe("payments");
    expect(fuzzySearch(targets, "follow 7f3")[0]!.id).toBe(`${FOLLOW}:agent-7f3`);
  });

  it("splits ids whose own part has colons", () => {
    expect(splitTargetId("db:a:b")).toEqual({ kind: "db", id: "a:b" });
  });
});

describe("the tour's stuck agent", () => {
  const agent = (id: string, over: Partial<AgentState>): AgentState =>
    ({ id, name: id, state: "working", blockedOn: null, route: ["search"], paused: false, ...over }) as AgentState;

  it("prefers one stuck on a person, on the checkout path", () => {
    const pick = pickStuckAgent([
      agent("a", { state: "blocked", blockedOn: "CI runner capacity", route: ["orders"] }),
      agent("b", { state: "blocked", blockedOn: "review by @maria", route: ["orders"] }),
      agent("c", { state: "blocked", blockedOn: "review by @maria", route: ["search"] }),
    ]);
    expect(pick).toBe("b");
  });

  it("falls back to the checkout fixer when nobody is stuck", () => {
    expect(pickStuckAgent([agent("a", {})])).toBe("agent-e02");
  });
});
