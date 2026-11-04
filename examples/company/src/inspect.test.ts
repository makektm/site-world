import { describe, expect, it } from "vitest";
import { factoryAt, getFactory } from "./factory/feed";
import { metricsAt } from "./factory/metrics";
import { inspectFor, tickAge, workIdOf, type InspectSource } from "./inspect";
import type { Feed } from "./liveFeed";

const live = getFactory();
const feed: Feed = Object.fromEntries(Object.entries(metricsAt(0)).map(([k, m]) => [k, { ...m, history: [] }]));
const value = (v: ReturnType<typeof inspectFor>, label: string) =>
  [...(v?.fields ?? []), ...(v?.sections.flatMap((s) => s.fields ?? []) ?? [])].find((f) => f.label === label)?.value;

describe("inspect panel text", () => {
  it("tells a service's owner, origin, numbers, calls and findings", () => {
    const v = inspectFor({ kind: "service", id: "payments" }, live, feed)!;
    expect(v.title).toBe("payments");
    expect(value(v, "health")).toBe("DEGRADED");
    expect(v.tone).toBe("warn");
    expect(value(v, "called by")).toBe("orders");
    expect(value(v, "calls")).toBe("billing, fraud-score");
    expect(value(v, "origin")).toBe("human PR");
  });

  it("flags sprawl on the service it applies to", () => {
    expect(value(inspectFor({ kind: "service", id: "ab-testing" }, live, feed), "orphan")).toMatch(/nothing calls it/);
    expect(value(inspectFor({ kind: "service", id: "notify-svc" }, live, feed), "look-alike")).toMatch(/^notifications/);
    expect(inspectFor({ kind: "service", id: "notify-svc" }, live, feed)!.fields.find((f) => f.label === "owner")!.tone).toBe("warn");
  });

  it("counts a service's age from the moment shown", () => {
    const now = value(inspectFor({ kind: "service", id: "report-builder" }, live, feed), "age");
    const replay = factoryAt(179);
    const src: InspectSource = { ...live, ...replay, daysAgo: 1 };
    expect(now).not.toBe(value(inspectFor({ kind: "service", id: "report-builder" }, src, feed), "age"));
  });

  it("tells an agent's task, state and spend", () => {
    const a = live.agents[0]!;
    const v = inspectFor({ kind: "agent", id: a.id }, live, feed)!;
    expect(value(v, "task")).toBe(a.task);
    expect(value(v, "route")).toBe(a.route.join(" → "));
    expect(v.subtitle).toBe(`launched by ${a.launchedBy}`);
  });

  it("reads a crate back to its PR, rejects included", () => {
    const item = live.pipeline.items.find((i) => i.stage === "review")!;
    const v = inspectFor({ kind: "work", id: `${item.id} ✕1` }, live, feed)!;
    expect(v.title).toBe(item.id);
    expect(value(v, "stage")).toBe("review");
    expect(value(v, "author")).toBe(item.author);
    expect(workIdOf("PR #1 ✕3")).toBe("PR #1");
  });

  it("covers the review station, tanks and third parties, and nothing unknown", () => {
    expect(inspectFor({ kind: "stage", id: "review" }, live, feed)!.fields[0]!.value).toBe(String(live.reviewPile.length));
    const db = live.infra.databases[0]!;
    expect(value(inspectFor({ kind: "db", id: db.name }, live, feed), "owner")).toBe(db.owner);
    const ext = live.infra.externals[0]!;
    expect(value(inspectFor({ kind: "external", id: ext.name }, live, feed), "used by")).toBe(ext.usedBy.join(", "));
    expect(inspectFor({ kind: "service", id: "nope" }, live, feed)).toBeNull();
    expect(inspectFor({ kind: "nope", id: "x" }, live, feed)).toBeNull();
  });

  it("prints factory time briefly", () => {
    expect(tickAge(10)).toBe("15s");
    expect(tickAge(400)).toBe("10m");
    expect(tickAge(4000)).toBe("1h40");
  });
});
