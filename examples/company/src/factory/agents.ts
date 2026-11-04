// The agent sessions at work right now, and the three people around them.
//
// Each agent runs a looping script of tasks; a task is a route of services it
// works in and walks between, sometimes ending blocked on a human. `agentAt`
// evaluates the script at a tick as a pure function, so the world can show any
// moment (live or replayed) without having simulated the ones before it, and
// so tokens and cost only ever go up.
import type { FactoryDomain } from "./catalog";
import { hashString, noise } from "./rand";

export type AgentActivity = "working" | "walking" | "blocked" | "idle" | "done";

export interface AgentTask {
  title: string;
  /** Services it works in, in order. */
  route: readonly string[];
  /** Ticks spent working at each stop. */
  workTicks: number;
  /** When set, the task ends waiting on a person, e.g. "review by @maria". */
  blockedOn?: string;
  blockedTicks?: number;
}

export interface AgentDef {
  id: string;
  /** Short display name; for agents it is the session id ("agent-7f3"). */
  name: string;
  /** Who launched the session. */
  launchedBy: string;
  /** Minutes the session had been running at tick 0. */
  startedMinAgo: number;
  /** Tokens per working tick. */
  tokensPerTick: number;
  tasks: readonly AgentTask[];
}

export interface AgentState {
  id: string;
  name: string;
  launchedBy: string;
  task: string;
  taskIndex: number;
  state: AgentActivity;
  /** Where it is: the service it works in, or the one it is walking from. */
  service: string;
  /** While walking, where it is going; otherwise null. */
  to: string | null;
  /** While walking, 0..1 along the way; otherwise 0. */
  progress: number;
  route: readonly string[];
  blockedOn: string | null;
  tokens: number;
  /** USD spent on tokens so far. */
  cost: number;
  startedMinAgo: number;
  tasksDone: number;
}

export interface HumanDef {
  id: string;
  name: string;
  handle: string;
  role: string;
  /** Rooms they move between and how many ticks they stay in each. */
  schedule: readonly { room: Room; ticks: number }[];
}

export type Room = FactoryDomain | "oncall";

export interface HumanState {
  id: string;
  name: string;
  handle: string;
  role: string;
  room: Room;
}

/** Seconds of wall time one tick stands for in the live feed (feed.ts ticks every 1.5s). */
export const TICK_SECONDS = 1.5;
const WALK_TICKS = 2;
const DONE_TICKS = 2;
const IDLE_TICKS = 3;
const USD_PER_MTOK = 6;

export const AGENTS: readonly AgentDef[] = [
  {
    id: "agent-7f3", name: "agent-7f3", launchedBy: "@priya", startedMinAgo: 42, tokensPerTick: 21_000,
    tasks: [
      { title: "Add loyalty tiers to promo codes", route: ["promo-codes", "customer-profile", "orders"], workTicks: 5, blockedOn: "review by @maria", blockedTicks: 14 },
      { title: "Backfill profile timezones", route: ["customer-profile"], workTicks: 7 },
    ],
  },
  {
    id: "agent-2c8", name: "agent-2c8", launchedBy: "@jonas", startedMinAgo: 95, tokensPerTick: 16_000,
    tasks: [
      { title: "Partition events table by day", route: ["event-ingest", "analytics-worker"], workTicks: 6, blockedOn: "migration approval by @jonas", blockedTicks: 10 },
      { title: "Expose freshness metric on feature-store", route: ["feature-store", "search"], workTicks: 4 },
    ],
  },
  {
    id: "agent-a19", name: "agent-a19", launchedBy: "@maria", startedMinAgo: 18, tokensPerTick: 12_000,
    tasks: [
      { title: "Move invoice PDFs to invoice-generator", route: ["billing", "invoice-gen", "invoice-generator"], workTicks: 5, blockedOn: "review by @maria", blockedTicks: 16 },
    ],
  },
  {
    id: "agent-d40", name: "agent-d40", launchedBy: "@priya", startedMinAgo: 130, tokensPerTick: 34_000,
    tasks: [
      { title: "Tune fraud-score prompt for false positives", route: ["fraud-score", "payments", "orders"], workTicks: 6 },
      { title: "Cache fraud scores per card", route: ["fraud-score"], workTicks: 5, blockedOn: "STRIPE_LIVE_KEY grant", blockedTicks: 9 },
    ],
  },
  {
    id: "agent-5be", name: "agent-5be", launchedBy: "@priya", startedMinAgo: 7, tokensPerTick: 15_000,
    tasks: [
      { title: "Referral reminder after 3 days", route: ["referral-engine", "notify-svc"], workTicks: 5 },
      { title: "Unsubscribe link in referral mail", route: ["notify-svc", "notifications"], workTicks: 4, blockedOn: "review by @maria", blockedTicks: 12 },
    ],
  },
  {
    id: "agent-91a", name: "agent-91a", launchedBy: "@jonas", startedMinAgo: 61, tokensPerTick: 9_000,
    tasks: [
      { title: "Bump auth SDK, fix deprecations", route: ["auth", "api-gateway", "web-frontend"], workTicks: 4 },
      { title: "Rate-limit profile reads", route: ["rate-limiter", "customer-profiles"], workTicks: 5 },
    ],
  },
  {
    id: "agent-e02", name: "agent-e02", launchedBy: "@maria", startedMinAgo: 24, tokensPerTick: 11_000,
    tasks: [
      { title: "Flaky checkout test in orders", route: ["orders", "payments"], workTicks: 6, blockedOn: "CI runner capacity", blockedTicks: 6 },
      { title: "Search relevance A/B arm", route: ["search", "ab-testing", "feature-flags"], workTicks: 4 },
    ],
  },
  {
    id: "agent-c66", name: "agent-c66", launchedBy: "@jonas", startedMinAgo: 3, tokensPerTick: 27_000,
    tasks: [
      { title: "Weekly revenue report draft", route: ["report-builder", "analytics-worker", "billing"], workTicks: 5, blockedOn: "data access by @jonas", blockedTicks: 11 },
    ],
  },
];

export const HUMANS: readonly HumanDef[] = [
  {
    id: "maria", name: "Maria Okafor", handle: "@maria", role: "staff engineer, reviews payments + platform",
    schedule: [{ room: "payments", ticks: 30 }, { room: "platform", ticks: 20 }, { room: "oncall", ticks: 10 }],
  },
  {
    id: "jonas", name: "Jonas Weber", handle: "@jonas", role: "data lead",
    schedule: [{ room: "data", ticks: 40 }, { room: "platform", ticks: 15 }],
  },
  {
    id: "priya", name: "Priya Raman", handle: "@priya", role: "on-call, growth",
    schedule: [{ room: "oncall", ticks: 25 }, { room: "growth", ticks: 25 }, { room: "commerce", ticks: 12 }],
  },
];

interface Segment {
  kind: AgentActivity;
  task: number;
  service: string;
  to: string | null;
  len: number;
}

// An agent's script flattened into timed segments, one loop of all its tasks.
function segmentsOf(def: AgentDef): Segment[] {
  const out: Segment[] = [];
  def.tasks.forEach((t, task) => {
    t.route.forEach((service, i) => {
      // Jitter work a little per stop so agents with similar scripts drift apart.
      const len = t.workTicks + Math.floor(noise(hashString(def.id), task, i) * 3);
      out.push({ kind: "working", task, service, to: null, len });
      const next = t.route[i + 1];
      if (next) out.push({ kind: "walking", task, service, to: next, len: WALK_TICKS });
    });
    const last = t.route[t.route.length - 1]!;
    if (t.blockedOn) out.push({ kind: "blocked", task, service: last, to: null, len: t.blockedTicks ?? 10 });
    out.push({ kind: "done", task, service: last, to: null, len: DONE_TICKS });
    out.push({ kind: "idle", task, service: last, to: null, len: IDLE_TICKS });
  });
  return out;
}

const scripts = new Map(AGENTS.map((a) => [a.id, segmentsOf(a)]));

/** One agent at a tick. Ticks below 0 are clamped: the session had not started earlier. */
export function agentAt(def: AgentDef, tick: number): AgentState {
  const segs = scripts.get(def.id) ?? segmentsOf(def);
  const cycle = segs.reduce((n, s) => n + s.len, 0);
  const workPerCycle = segs.reduce((n, s) => n + (s.kind === "working" ? s.len : 0), 0);
  const t = Math.max(0, Math.floor(tick));
  // Offset each agent into its own loop so they are not all on stop one at tick 0.
  const local = t + (hashString(def.id) % cycle);
  const loops = Math.floor(local / cycle);
  let rest = local % cycle;
  let worked = loops * workPerCycle;
  let tasksDone = loops * def.tasks.length;
  let seg = segs[0]!;
  let into = 0;
  for (const s of segs) {
    if (rest < s.len) {
      seg = s;
      into = rest;
      break;
    }
    rest -= s.len;
    if (s.kind === "working") worked += s.len;
    if (s.kind === "done") tasksDone += 1;
  }
  if (seg.kind === "working") worked += into + 1;
  const task = def.tasks[seg.task]!;
  const tokens = Math.round(worked * def.tokensPerTick);
  return {
    id: def.id,
    name: def.name,
    launchedBy: def.launchedBy,
    task: task.title,
    taskIndex: seg.task,
    state: seg.kind,
    service: seg.service,
    to: seg.to,
    progress: seg.kind === "walking" ? (into + 1) / (seg.len + 1) : 0,
    route: task.route,
    blockedOn: seg.kind === "blocked" ? (task.blockedOn ?? null) : null,
    tokens,
    cost: Math.round((tokens / 1e6) * USD_PER_MTOK * 100) / 100,
    startedMinAgo: def.startedMinAgo + Math.round((t * TICK_SECONDS) / 60),
    tasksDone,
  };
}

export function agentsAt(tick: number): AgentState[] {
  return AGENTS.map((a) => agentAt(a, tick));
}

export function humanAt(def: HumanDef, tick: number): HumanState {
  const cycle = def.schedule.reduce((n, s) => n + s.ticks, 0);
  let rest = Math.max(0, Math.floor(tick)) % cycle;
  let room = def.schedule[0]!.room;
  for (const s of def.schedule) {
    if (rest < s.ticks) {
      room = s.room;
      break;
    }
    rest -= s.ticks;
  }
  return { id: def.id, name: def.name, handle: def.handle, role: def.role, room };
}

export function humansAt(tick: number): HumanState[] {
  return HUMANS.map((h) => humanAt(h, tick));
}
