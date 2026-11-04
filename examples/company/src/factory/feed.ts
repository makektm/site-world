// The factory as one live value for the host, plus a replay of any moment.
//
// A module-level store read through
// useSyncExternalStore, ticking only while something is subscribed, and the
// snapshot object changes identity once per tick (never per render), which
// is what useSyncExternalStore needs to avoid render loops.
//
// Everything except the pipeline is a pure function of the tick; the pipeline
// is stepped, and pipelineAt reproduces the same steps for replay.
import { useMemo, useSyncExternalStore } from "react";
import { AGENTS, agentAt, agentsAt, humansAt, TICK_SECONDS, type AgentState, type HumanState, type Room } from "./agents";
import { CALLS, CATALOG, SERVICES, serviceByName, type Catalog, type FactoryDomain, type FactoryService } from "./catalog";
import { HISTORY_DAYS, stateAt, type HistoryState } from "./history";
import { infraAt, type InfraState } from "./infra";
import { metricsAt, type ServiceMetrics } from "./metrics";
import { NOTES, type StickyNote } from "./notes";
import {
  approveItem, byStage, initialPipeline, lastRollbackable, reviewPile, rollbackLast, stepPipeline, topOfReview,
  type DeployEvent, type PipelineState, type Stage, type WorkItem,
} from "./pipeline";
import { sprawlReport, type SprawlReport } from "./sprawl";

export interface FactoryState {
  tick: number;
  catalog: Catalog;
  services: readonly FactoryService[];
  calls: readonly (readonly [string, string])[];
  metrics: Readonly<Record<string, ServiceMetrics>>;
  agents: readonly AgentState[];
  humans: readonly HumanState[];
  pipeline: PipelineState;
  stages: Readonly<Record<Stage, readonly WorkItem[]>>;
  reviewPile: readonly WorkItem[];
  /** Deploys that shipped on this very tick: the host's cue to flash a pylon. */
  deploysNow: readonly DeployEvent[];
  infra: InfraState;
  sprawl: SprawlReport;
  notes: readonly StickyNote[];
  /** What people did from the on-call terminal, newest last. */
  audit: readonly AuditEntry[];
}

/** One macro run from the restricted terminal: who, what, on what, when. */
export interface AuditEntry {
  tick: number;
  who: string;
  action: "pause" | "resume" | "approve" | "rollback";
  target: string;
}

export interface FactoryReplay {
  /** Days since the timeline began (0..HISTORY_DAYS). */
  t: number;
  history: HistoryState;
  services: readonly FactoryService[];
  calls: readonly (readonly [string, string])[];
  metrics: Readonly<Record<string, ServiceMetrics>>;
  /** Agents at this time of day, limited to ones whose service existed by then. */
  agents: readonly AgentState[];
  infra: InfraState;
  sprawl: SprawlReport;
}

export const FACTORY_TICK_MS = 1500;

// Sprawl only changes when the catalogue does; computing it per tick would
// just make new arrays for the same answer.
const SPRAWL = sprawlReport(SERVICES, CALLS);

/**
 * The agents at a tick, with the paused ones held where they were when a
 * person stopped them: idle, going nowhere, their tokens frozen.
 */
export function agentsWithPauses(tick: number, pausedAt: ReadonlyMap<string, number>): AgentState[] {
  return AGENTS.map((def) => {
    const at = pausedAt.get(def.id);
    if (at === undefined) return agentAt(def, tick);
    return { ...agentAt(def, at), state: "idle", to: null, progress: 0, blockedOn: null, paused: true };
  });
}

// What the on-call macros changed. Module state like the pipeline: the live
// store owns it; replays never see it (an intervention is not history yet).
const pausedAt = new Map<string, number>();
let audit: readonly AuditEntry[] = [];
const AUDIT_KEEP = 20;

function snapshot(tick: number, pipeline: PipelineState): FactoryState {
  return {
    tick,
    catalog: CATALOG,
    services: SERVICES,
    calls: CALLS,
    metrics: metricsAt(tick),
    agents: agentsWithPauses(tick, pausedAt),
    humans: humansAt(tick),
    pipeline,
    stages: byStage(pipeline),
    reviewPile: reviewPile(pipeline),
    deploysNow: pipeline.deploys.filter((d) => d.tick === tick),
    infra: infraAt(tick),
    sprawl: SPRAWL,
    notes: NOTES,
    audit,
  };
}

let pipeline = initialPipeline();
let state: FactoryState = snapshot(0, pipeline);
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function step(): void {
  pipeline = stepPipeline(pipeline);
  state = snapshot(pipeline.tick, pipeline);
  for (const l of listeners) l();
}

// The factory only ticks while something is watching it.
export function subscribeFactory(l: () => void): () => void {
  listeners.add(l);
  timer ??= setInterval(step, FACTORY_TICK_MS);
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function getFactory(): FactoryState {
  return state;
}

// The restricted macros. Each is one narrow, logged change to the model —
// the point is that a person acts on the factory from inside it without a
// shell: they can stop an agent, let one PR through, undo one deploy, and
// nothing else. Each returns false when there was nothing to do.

function publish(entry: AuditEntry): void {
  audit = [...audit, entry].slice(-AUDIT_KEEP);
  // Deploys already flown this tick must not fly again; only a rollback's
  // own event is new.
  const fresh = entry.action === "rollback" ? pipeline.deploys.slice(-1) : [];
  state = { ...snapshot(pipeline.tick, pipeline), deploysNow: fresh };
  for (const l of listeners) l();
}

export function pauseAgent(id: string, who: string): boolean {
  if (pausedAt.has(id) || !AGENTS.some((a) => a.id === id)) return false;
  pausedAt.set(id, state.tick);
  publish({ tick: state.tick, who, action: "pause", target: id });
  return true;
}

export function resumeAgent(id: string, who: string): boolean {
  if (!pausedAt.delete(id)) return false;
  publish({ tick: state.tick, who, action: "resume", target: id });
  return true;
}

export function approveTopReview(who: string): boolean {
  const top = topOfReview(pipeline);
  if (!top) return false;
  pipeline = approveItem(pipeline, top.id);
  publish({ tick: state.tick, who, action: "approve", target: top.id });
  return true;
}

export function rollbackLastDeploy(who: string): boolean {
  const d = lastRollbackable(pipeline);
  if (!d) return false;
  pipeline = rollbackLast(pipeline, who);
  publish({ tick: state.tick, who, action: "rollback", target: `${d.service} v${d.version}` });
  return true;
}

export function useFactory(): FactoryState {
  return useSyncExternalStore(subscribeFactory, getFactory, getFactory);
}

/** Within a replayed day, the time of day drives the per-tick animation. */
export function replayTick(t: number): number {
  const clamped = Math.min(HISTORY_DAYS, Math.max(0, t));
  return Math.floor(((clamped % 1) * 86_400) / TICK_SECONDS);
}

/** The factory at timeline time t (days). Pure; the hook below memoises it. */
export function factoryAt(t: number): FactoryReplay {
  const clamped = Math.min(HISTORY_DAYS, Math.max(0, t));
  const history = stateAt(clamped);
  const tick = replayTick(clamped);
  const names = new Set(history.services.map((s) => s.name));
  return {
    t: clamped,
    history,
    services: history.services,
    calls: history.calls,
    metrics: metricsAt(tick, history.services),
    agents: agentsAt(tick).filter((a) => names.has(a.service)),
    infra: infraAt(tick),
    sprawl: sprawlReport(history.services, history.calls),
  };
}

export function useFactoryAt(t: number): FactoryReplay {
  return useMemo(() => factoryAt(t), [t]);
}

// Selectors: plain functions over a state, so the host can call them in
// render without new hooks.

export function agentsAtService(s: Pick<FactoryState, "agents">, service: string): AgentState[] {
  return s.agents.filter((a) => a.service === service || a.to === service);
}

export function agentsInDomain(s: Pick<FactoryState, "agents">, domain: FactoryDomain): AgentState[] {
  return s.agents.filter((a) => serviceByName.get(a.service)?.domain === domain);
}

export function humansInRoom(s: Pick<FactoryState, "humans">, room: Room): HumanState[] {
  return s.humans.filter((h) => h.room === room);
}

export function workForService(s: Pick<FactoryState, "pipeline">, service: string): WorkItem[] {
  return s.pipeline.items.filter((i) => i.service === service);
}

export function servicesInDomain(s: Pick<FactoryState, "services">, domain: FactoryDomain): FactoryService[] {
  return s.services.filter((x) => x.domain === domain);
}

/** Who is blocked on whom right now, e.g. { "@maria": ["agent-7f3", ...] }. */
export function blockedBy(s: Pick<FactoryState, "agents">): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const a of s.agents) {
    if (!a.blockedOn) continue;
    const who = /@\w+/.exec(a.blockedOn)?.[0] ?? a.blockedOn;
    (out[who] ??= []).push(a.id);
  }
  return out;
}

/** Total token spend per day across services, and live agent spend so far. */
export function spend(s: Pick<FactoryState, "services" | "agents">): { serviceTokensPerDay: number; serviceUsdPerDay: number; agentTokens: number; agentUsd: number } {
  return {
    serviceTokensPerDay: s.services.reduce((n, x) => n + x.tokensPerDay, 0),
    serviceUsdPerDay: s.services.reduce((n, x) => n + x.costPerDay, 0),
    agentTokens: s.agents.reduce((n, a) => n + a.tokens, 0),
    agentUsd: Math.round(s.agents.reduce((n, a) => n + a.cost, 0) * 100) / 100,
  };
}
