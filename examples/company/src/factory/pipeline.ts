// How work flows: ticket -> agent -> pr -> ci -> review -> deploy.
//
// The story it tells is the factory's real constraint: agents open PRs far
// faster than people can review them, so the review stage piles up while
// every other stage stays short. CI rejects a share of PRs back to their
// agent; approved work ships in periodic deploy trains, each one a
// DeployEvent the host can flash on a pylon.
//
// `stepPipeline` is pure (randomness is hashed from the tick and the item), so
// the live store steps it and `pipelineAt` can replay any tick from scratch
// and land on the same state.
import { serviceByName } from "./catalog";
import { AGENTS } from "./agents";
import { hashString, noise } from "./rand";

export const STAGES = ["ticket", "agent", "pr", "ci", "review", "deploy"] as const;
export type Stage = (typeof STAGES)[number];
export type ItemStatus = "ok" | "failing" | "waiting";

export interface WorkItem {
  id: string;
  title: string;
  /** The agent session that wrote it. */
  author: string;
  service: string;
  stage: Stage;
  status: ItemStatus;
  /** Ticks since the ticket was filed. */
  age: number;
  /** Ticks in the current stage. */
  stageAge: number;
  /** Times CI sent it back. */
  rejections: number;
  /** Who it waits on while in review. */
  reviewer: string | null;
}

export interface DeployEvent {
  tick: number;
  service: string;
  version: string;
  id: string;
  author: string;
  /** Set on a rollback: the deploy it undid. */
  rollbackOf?: string;
}

export interface PipelineState {
  tick: number;
  items: readonly WorkItem[];
  /** The most recent deploys, newest last. */
  deploys: readonly DeployEvent[];
  versions: Readonly<Record<string, string>>;
  nextId: number;
  shipped: number;
  rejected: number;
}

/** Ticks between one human review finishing and the next. The bottleneck. */
export const REVIEW_EVERY = 4;
/** Ticks between deploy trains. */
export const DEPLOY_EVERY = 10;
/** Chance per tick that some agent files a new ticket. */
const SPAWN_CHANCE = 0.55;
const CI_FAIL_CHANCE = 0.18;
// When the pile gets this tall a human batch-approves the oldest few, which is
// both what really happens and what keeps a long-running demo bounded.
const PILE_LIMIT = 30;
const BATCH_APPROVE = 8;
const KEEP_DEPLOYS = 24;

const WORK = [
  "Add retry with jitter to",
  "Fix flaky test in",
  "Bump dependencies in",
  "Add tracing spans to",
  "Remove dead endpoint from",
  "Add index for slow query in",
  "Split handler module in",
  "Add OpenAPI schema to",
  "Raise timeout budget in",
  "Cache hot read path in",
  "Migrate config to flags in",
  "Add contract test for",
];

// Who a PR waits on is a function of where it lands; the same three people
// review everything, which is the point.
function reviewerFor(service: string): string {
  const d = serviceByName.get(service)?.domain;
  if (d === "payments" || d === "platform") return "@maria";
  if (d === "data") return "@jonas";
  return "@priya";
}

function newItem(n: number): WorkItem {
  const agent = AGENTS[Math.floor(noise(n, 11) * AGENTS.length)]!;
  const route = agent.tasks.flatMap((t) => t.route);
  const service = route[Math.floor(noise(n, 12) * route.length)]!;
  const verb = WORK[Math.floor(noise(n, 13) * WORK.length)]!;
  return {
    id: `PR #${n}`,
    title: `${verb} ${service}`,
    author: agent.id,
    service,
    stage: "ticket",
    status: "ok",
    age: 0,
    stageAge: 0,
    rejections: 0,
    reviewer: null,
  };
}

function bump(version: string): string {
  const [maj, min, patch] = version.split(".").map(Number);
  return `${maj}.${min}.${(patch ?? 0) + 1}`;
}

const into = (item: WorkItem, stage: Stage, status: ItemStatus): WorkItem => ({
  ...item,
  stage,
  status,
  stageAge: 0,
  reviewer: stage === "review" ? reviewerFor(item.service) : null,
});

export function initialPipeline(): PipelineState {
  const versions: Record<string, string> = {};
  for (const name of serviceByName.keys()) {
    const h = hashString(name);
    versions[name] = `${1 + (h % 3)}.${(h >>> 4) % 40}.${(h >>> 10) % 9}`;
  }
  // Arrive mid-story: a pile already waiting on people, a few in flight.
  const items: WorkItem[] = [];
  let id = 1400;
  const seed: [Stage, ItemStatus, number][] = [
    ...Array.from({ length: 12 }, (_, i): [Stage, ItemStatus, number] => ["review", "waiting", 40 + i * 9]),
    ["ci", "failing", 6], ["ci", "ok", 4], ["ci", "ok", 3],
    ["pr", "ok", 2], ["agent", "ok", 3], ["agent", "ok", 1], ["agent", "ok", 2],
    ["ticket", "ok", 0], ["deploy", "waiting", 22],
  ];
  for (const [stage, status, age] of seed) {
    const item = newItem(id);
    id += 1;
    items.push({ ...into(item, stage, status), age, stageAge: stage === "review" ? age - 6 : 1 });
  }
  return { tick: 0, items, deploys: [], versions, nextId: id, shipped: 0, rejected: 0 };
}

/** One tick of the pipeline. Pure: same state in, same state out. */
export function stepPipeline(prev: PipelineState): PipelineState {
  const tick = prev.tick + 1;
  let rejected = prev.rejected;
  const moved: WorkItem[] = prev.items.map((raw) => {
    const item = { ...raw, age: raw.age + 1, stageAge: raw.stageAge + 1 };
    const n = noise(tick, hashString(item.id));
    switch (item.stage) {
      case "ticket":
        return item.stageAge >= 1 ? into(item, "agent", "ok") : item;
      case "agent":
        return item.stageAge >= 3 && n < 0.6 ? into(item, "pr", "ok") : item;
      case "pr":
        return item.stageAge >= 1 ? into(item, "ci", "ok") : item;
      case "ci":
        if (item.status === "failing") {
          if (item.stageAge < 2) return item;
          rejected += 1;
          return { ...into(item, "agent", "ok"), rejections: item.rejections + 1 };
        }
        if (item.stageAge < 2) return item;
        return n < CI_FAIL_CHANCE ? { ...item, status: "failing", stageAge: 0 } : into(item, "review", "waiting");
      default:
        return item;
    }
  });

  // People review oldest first, slowly; the pile limit is the batch approve.
  const reviewing = moved.filter((i) => i.stage === "review").sort((a, b) => b.stageAge - a.stageAge);
  let approve = tick % REVIEW_EVERY === 0 ? 1 : 0;
  if (reviewing.length > PILE_LIMIT) approve = BATCH_APPROVE;
  const approved = new Set(reviewing.slice(0, approve).map((i) => i.id));
  let items = moved.map((i) => (approved.has(i.id) ? into(i, "deploy", "waiting") : i));

  const deploys = [...prev.deploys];
  const versions = { ...prev.versions };
  let shipped = prev.shipped;
  if (tick % DEPLOY_EVERY === 0) {
    for (const i of items) {
      if (i.stage !== "deploy") continue;
      versions[i.service] = bump(versions[i.service] ?? "0.1.0");
      deploys.push({ tick, service: i.service, version: versions[i.service]!, id: i.id, author: i.author });
      shipped += 1;
    }
    items = items.filter((i) => i.stage !== "deploy");
  }

  let nextId = prev.nextId;
  if (noise(tick, 1) < SPAWN_CHANCE) {
    items.push(newItem(nextId));
    nextId += 1;
  }

  return { tick, items, deploys: deploys.slice(-KEEP_DEPLOYS), versions, nextId, shipped, rejected };
}

// What an on-call human can do to the line from a restricted terminal. Both
// are pure, like a tick, so the live store can apply them between ticks.

/** The review item a person would approve next: the one waiting longest. */
export function topOfReview(state: PipelineState): WorkItem | null {
  let top: WorkItem | null = null;
  for (const i of state.items) {
    if (i.stage === "review" && (!top || i.stageAge > top.stageAge)) top = i;
  }
  return top;
}

/** Approve one review item now: it joins the next deploy train. */
export function approveItem(state: PipelineState, id: string): PipelineState {
  if (!state.items.some((i) => i.id === id && i.stage === "review")) return state;
  return { ...state, items: state.items.map((i) => (i.id === id ? into(i, "deploy", "waiting") : i)) };
}

/** The newest deploy that is not a rollback and has not been rolled back. */
export function lastRollbackable(state: PipelineState): DeployEvent | null {
  const undone = new Set(state.deploys.flatMap((d) => (d.rollbackOf ? [d.rollbackOf] : [])));
  for (let k = state.deploys.length - 1; k >= 0; k -= 1) {
    const d = state.deploys[k]!;
    if (!d.rollbackOf && !undone.has(`${d.id}@${d.tick}`)) return d;
  }
  return null;
}

function unbump(version: string): string {
  const [maj, min, patch] = version.split(".").map(Number);
  return `${maj}.${min}.${Math.max(0, (patch ?? 0) - 1)}`;
}

/**
 * Roll the newest deploy back: its service returns to the version it had
 * before, recorded as a deploy of its own (so it flies to the pylon like any
 * other) that names what it undid. A no-op when there is nothing to undo.
 */
export function rollbackLast(state: PipelineState, by: string): PipelineState {
  const d = lastRollbackable(state);
  if (!d) return state;
  // The version before d: the previous deploy of that service if we still
  // hold it, else one patch down.
  const before = [...state.deploys].reverse().find((x) => x.service === d.service && x.tick < d.tick)?.version ?? unbump(d.version);
  const event: DeployEvent = { tick: state.tick, service: d.service, version: before, id: `rollback of ${d.id}`, author: by, rollbackOf: `${d.id}@${d.tick}` };
  return {
    ...state,
    versions: { ...state.versions, [d.service]: before },
    deploys: [...state.deploys, event].slice(-KEEP_DEPLOYS),
  };
}

// Checkpoints so replaying tick 5000 does not re-simulate from 0 every frame.
const CHECKPOINT = 100;
const checkpoints: PipelineState[] = [initialPipeline()];

/** The pipeline at any tick, identical to stepping the live store that far. */
export function pipelineAt(tick: number): PipelineState {
  const t = Math.max(0, Math.floor(tick));
  const k = Math.min(Math.floor(t / CHECKPOINT), checkpoints.length - 1);
  let s = checkpoints[k]!;
  while (s.tick < t) {
    s = stepPipeline(s);
    if (s.tick % CHECKPOINT === 0 && s.tick / CHECKPOINT === checkpoints.length) checkpoints.push(s);
  }
  return s;
}

/** Items per stage, in STAGES order — the shape a pipeline board draws. */
export function byStage(state: PipelineState): Record<Stage, WorkItem[]> {
  const out = Object.fromEntries(STAGES.map((s) => [s, [] as WorkItem[]])) as Record<Stage, WorkItem[]>;
  for (const i of state.items) out[i.stage].push(i);
  return out;
}

export function reviewPile(state: PipelineState): WorkItem[] {
  return state.items.filter((i) => i.stage === "review");
}
