// What the inspect panel says about whatever is selected. Pure: a selection
// and the factory's state in, the panel's text out, so the same rules serve a
// live moment and a replayed one, and the host only adds the buttons.
import { compactNumber, type InspectField, type InspectSection, type InspectTone, type SelectionRef } from "site-world";
import type { AgentState, HumanState } from "./factory/agents";
import { TICK_SECONDS } from "./factory/agents";
import type { FactoryService } from "./factory/catalog";
import type { InfraState } from "./factory/infra";
import type { Health } from "./factory/metrics";
import type { PipelineState, WorkItem } from "./factory/pipeline";
import type { SprawlReport } from "./factory/sprawl";
import type { Feed } from "./liveFeed";

/** The parts of the factory an inspection reads: a live FactoryState or a replay both fit. */
export interface InspectSource {
  services: readonly FactoryService[];
  calls: readonly (readonly [string, string])[];
  agents: readonly AgentState[];
  humans: readonly HumanState[];
  pipeline: PipelineState;
  infra: InfraState;
  sprawl: SprawlReport;
  /** Days before now the moment shown is; 0 when live. Ages are counted from it. */
  daysAgo?: number;
}

export interface InspectView {
  kind: string;
  title: string;
  subtitle?: string;
  tone: InspectTone;
  fields: InspectField[];
  sections: InspectSection[];
}

const HEALTH_TONE: Record<Health, InspectTone> = { ok: "ok", warn: "warn", down: "critical" };
const HEALTH_WORD: Record<Health, string> = { ok: "OK", warn: "DEGRADED", down: "DOWN" };

const STATE_TONE: Record<AgentState["state"], InspectTone> = {
  working: "info",
  walking: "dim",
  blocked: "critical",
  idle: "dim",
  done: "ok",
};

/** Ticks of factory time as a short age: "45s", "12m", "2h05". */
export function tickAge(ticks: number): string {
  const s = Math.round(ticks * TICK_SECONDS);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

export function days(n: number): string {
  const d = Math.max(0, Math.round(n));
  return d === 1 ? "1 day" : `${d} days`;
}

const list = (xs: readonly string[]) => (xs.length ? xs.join(", ") : "none");

/** "PR #1412 ✕2" (a reject crate) -> "PR #1412". */
export function workIdOf(crateId: string): string {
  return crateId.split(" ✕")[0]!;
}

function service(name: string, src: InspectSource, feed: Feed): InspectView | null {
  const def = src.services.find((s) => s.name === name);
  if (!def) return null;
  const m = feed[name];
  const callers = src.calls.filter(([, b]) => b === name).map(([a]) => a);
  const callees = src.calls.filter(([a]) => a === name).map(([, b]) => b);
  const look = src.sprawl.lookAlikes.find((p) => p.a === name || p.b === name);
  const orphan = src.sprawl.orphans.includes(name);
  const unowned = src.sprawl.unowned.includes(name);
  const flags: InspectField[] = [];
  if (orphan) flags.push({ label: "orphan", value: "nothing calls it and it serves no traffic", tone: "warn" });
  if (look) flags.push({ label: "look-alike", value: `${look.a === name ? look.b : look.a} (${Math.round(look.score * 100)}% similar)`, tone: "warn" });
  if (unowned) flags.push({ label: "no owner", value: `only ${def.owner}, the session that made it`, tone: "warn" });
  const agents = src.agents.filter((a) => a.service === name || a.to === name);
  const dbs = src.infra.databases.filter((d) => d.owner === name || d.readers.includes(name));
  const queues = src.infra.queues.filter((q) => q.from === name || q.to === name);
  const health = m?.health ?? "ok";
  const replicas = m ? `${m.replicas.length}${m.replicas.some((r) => r !== "ok") ? ` (${m.replicas.filter((r) => r !== "ok").length} not OK)` : ""}` : "—";
  return {
    kind: "service",
    title: name,
    subtitle: `${def.domain} · ${def.summary}`,
    tone: HEALTH_TONE[health],
    fields: [
      { label: "health", value: HEALTH_WORD[health], tone: HEALTH_TONE[health] },
      { label: "rps", value: m ? String(m.rps) : "—" },
      { label: "p99", value: m ? `${m.p99}ms` : "—", tone: m && m.p99 > def.baseP99 * 2 ? "warn" : undefined },
      { label: "errors", value: m ? `${(m.errors * 100).toFixed(1)}%` : "—", tone: m && m.errors > 0.02 ? "critical" : undefined },
      { label: "replicas", value: replicas },
      { label: "owner", value: def.owner, tone: unowned ? "warn" : undefined },
      { label: "origin", value: def.origin === "agent" ? "agent session" : "human PR", tone: def.origin === "agent" ? "info" : undefined },
      { label: "created by", value: def.createdBy },
      { label: "age", value: days(def.createdAt - (src.daysAgo ?? 0)) },
      { label: "cost", value: `$${def.costPerDay}/day${def.tokensPerDay ? ` · ${compactNumber(def.tokensPerDay)} tok` : ""}` },
    ],
    sections: [
      { title: "Calls", fields: [{ label: "called by", value: list(callers) }, { label: "calls", value: list(callees) }] },
      { title: "Sprawl", fields: flags.length ? flags : [{ label: "findings", value: "none", tone: "ok" }] },
      {
        title: "Being changed by",
        fields: agents.length
          ? agents.map((a) => ({ label: a.name, value: a.blockedOn ? `blocked: ${a.blockedOn}` : a.task, tone: STATE_TONE[a.state] }))
          : [{ label: "agents", value: "none right now", tone: "dim" }],
      },
      ...(dbs.length || queues.length
        ? [{
            title: "Leans on",
            fields: [
              ...dbs.map((d): InspectField => ({ label: d.owner === name ? "owns" : "reads", value: `${d.name} (${d.kind})`, tone: HEALTH_TONE[d.status] })),
              ...queues.map((q): InspectField => ({ label: q.from === name ? "produces" : "consumes", value: `${q.name} · ${compactNumber(q.backlog)} waiting`, tone: HEALTH_TONE[q.status] })),
            ],
          }]
        : []),
    ],
  };
}

function agent(id: string, src: InspectSource): InspectView | null {
  const a = src.agents.find((x) => x.id === id);
  if (!a) return null;
  const state = a.paused ? "paused" : a.state === "blocked" ? "needs a human" : a.state;
  return {
    kind: "agent",
    title: a.name,
    subtitle: `launched by ${a.launchedBy}`,
    tone: a.paused ? "warn" : STATE_TONE[a.state],
    fields: [
      { label: "task", value: a.task },
      { label: "state", value: state, tone: a.paused ? "warn" : STATE_TONE[a.state] },
      ...(a.blockedOn ? [{ label: "blocked on", value: a.blockedOn, tone: "critical" as const }] : []),
      { label: "at", value: a.to ? `${a.service} → ${a.to}` : a.service },
      { label: "route", value: a.route.join(" → ") },
      { label: "tokens", value: compactNumber(a.tokens) },
      { label: "spend", value: `$${a.cost.toFixed(2)}` },
      { label: "running", value: a.startedMinAgo < 60 ? `${a.startedMinAgo}m` : `${Math.floor(a.startedMinAgo / 60)}h${String(a.startedMinAgo % 60).padStart(2, "0")}` },
      { label: "tasks done", value: String(a.tasksDone) },
    ],
    sections: [],
  };
}

function person(id: string, src: InspectSource): InspectView | null {
  const h = src.humans.find((x) => x.id === id);
  if (!h) return null;
  const launched = src.agents.filter((a) => a.launchedBy === h.handle);
  const waiting = src.agents.filter((a) => a.blockedOn?.includes(h.handle));
  const reviews = src.pipeline.items.filter((i) => i.reviewer === h.handle);
  return {
    kind: "person",
    title: h.name,
    subtitle: `${h.handle} · ${h.role}`,
    tone: waiting.length ? "warn" : "info",
    fields: [
      { label: "in", value: h.room === "oncall" ? "edge · on call" : h.room },
      { label: "agents", value: list(launched.map((a) => a.name)) },
      { label: "reviews owed", value: String(reviews.length), tone: reviews.length >= 8 ? "warn" : undefined },
    ],
    sections: waiting.length
      ? [{ title: "Waiting on them", fields: waiting.map((a) => ({ label: a.name, value: a.blockedOn!, tone: "critical" as const })) }]
      : [],
  };
}

const STAGE_TONE = (item: WorkItem): InspectTone =>
  item.status === "failing" ? "critical" : item.stage === "review" ? "warn" : item.stage === "deploy" ? "ok" : "info";

function work(crateId: string, src: InspectSource): InspectView | null {
  const id = workIdOf(crateId);
  const item = src.pipeline.items.find((i) => i.id === id);
  if (!item) {
    const shipped = [...src.pipeline.deploys].reverse().find((d) => d.id === id);
    return shipped
      ? {
          kind: "work",
          title: id,
          subtitle: `shipped ${shipped.service} v${shipped.version}`,
          tone: "ok",
          fields: [{ label: "stage", value: "deployed", tone: "ok" }, { label: "author", value: shipped.author }],
          sections: [],
        }
      : null;
  }
  return {
    kind: "work",
    title: id,
    subtitle: item.title,
    tone: STAGE_TONE(item),
    fields: [
      { label: "stage", value: item.stage, tone: STAGE_TONE(item) },
      { label: "status", value: item.status, tone: item.status === "failing" ? "critical" : undefined },
      { label: "author", value: item.author },
      { label: "service", value: item.service },
      { label: "age", value: tickAge(item.age) },
      { label: "in stage", value: tickAge(item.stageAge), tone: item.stage === "review" && item.stageAge > 400 ? "warn" : undefined },
      ...(item.reviewer ? [{ label: "reviewer", value: item.reviewer }] : []),
      ...(item.rejections ? [{ label: "CI rejections", value: String(item.rejections), tone: "warn" as const }] : []),
    ],
    sections: [],
  };
}

function stage(id: string, src: InspectSource): InspectView | null {
  const items = src.pipeline.items.filter((i) => i.stage === id).sort((a, b) => b.stageAge - a.stageAge);
  const oldest = items[0];
  return {
    kind: "stage",
    title: id.toUpperCase(),
    subtitle: id === "review" ? "three people review everything the agents write" : "a station on the work line",
    tone: id === "review" && items.length >= 16 ? "critical" : items.length >= 8 ? "warn" : "info",
    fields: [
      { label: "items", value: String(items.length) },
      { label: "oldest", value: oldest ? `${oldest.id} · ${tickAge(oldest.stageAge)}` : "—" },
    ],
    sections: items.length
      ? [{ title: "Longest waiting", fields: items.slice(0, 6).map((i) => ({ label: i.id, value: `${i.service} · ${i.author}`, tone: STAGE_TONE(i) })) }]
      : [],
  };
}

function db(name: string, src: InspectSource): InspectView | null {
  const d = src.infra.databases.find((x) => x.name === name);
  if (!d) return null;
  return {
    kind: "database",
    title: d.name,
    subtitle: d.kind,
    tone: HEALTH_TONE[d.status],
    fields: [
      { label: "status", value: HEALTH_WORD[d.status], tone: HEALTH_TONE[d.status] },
      { label: "owner", value: d.owner },
      { label: "readers", value: list(d.readers) },
      { label: "full", value: `${Math.round(d.fill * 100)}%`, tone: d.fill > 0.85 ? "warn" : undefined },
    ],
    sections: [],
  };
}

function external(name: string, src: InspectSource): InspectView | null {
  const e = src.infra.externals.find((x) => x.name === name);
  if (!e) return null;
  return {
    kind: "external",
    title: e.name,
    subtitle: `third party · ${e.kind}`,
    tone: HEALTH_TONE[e.status],
    fields: [
      { label: "status", value: HEALTH_WORD[e.status], tone: HEALTH_TONE[e.status] },
      { label: "used by", value: list(e.usedBy) },
      { label: "latency", value: `${e.latencyMs}ms` },
      { label: "errors", value: `${(e.errorRate * 100).toFixed(1)}%`, tone: e.errorRate > 0.02 ? "critical" : undefined },
      { label: "cost", value: `$${e.costPerDay}/day` },
    ],
    sections: [],
  };
}

/** The panel for a selection, or null when it names nothing in this state
 * (an agent that had not started yet on a replayed day). */
export function inspectFor(ref: SelectionRef, src: InspectSource, feed: Feed): InspectView | null {
  switch (ref.kind) {
    case "service":
      return service(ref.id, src, feed);
    case "agent":
      return agent(ref.id, src);
    case "person":
      return person(ref.id, src);
    case "work":
      return work(ref.id, src);
    case "stage":
      return stage(ref.id, src);
    case "db":
      return db(ref.id, src);
    case "external":
      return external(ref.id, src);
    default:
      return null;
  }
}
