// Everything the services lean on that is not itself a service: databases,
// queues, third parties, and the secrets that unlock them.
//
// The static definitions are what an infra inventory would hold; `infraAt`
// turns them into live numbers as a pure function of the tick, so the live
// feed and the timeline replay read the same values for the same moment.
import { noise, hashString } from "./rand";

export type Status = "ok" | "warn" | "down";

export interface DatabaseDef {
  name: string;
  kind: "postgres" | "redis" | "clickhouse" | "object-store";
  /** The service that owns its schema. */
  owner: string;
  /** Other services that read it directly (a smell when not empty). */
  readers: readonly string[];
  /** How full, 0..1, at tick 0. */
  fill: number;
  /** Fill gained per tick. Negative for caches that evict. */
  growth: number;
}

export interface QueueDef {
  name: string;
  from: string;
  to: string;
  /** Messages waiting at tick 0. */
  backlog: number;
  /** Consumer throughput, messages per second. */
  throughput: number;
  /** Producer rate as a multiple of throughput; above 1 the backlog grows. */
  pressure: number;
}

export interface ExternalDef {
  name: string;
  kind: "payments" | "llm" | "auth" | "email";
  usedBy: readonly string[];
  latencyMs: number;
  errorRate: number;
  costPerDay: number;
}

export interface SecretGrant {
  key: string;
  /** What the key unlocks: an external or a database. */
  unlocks: string;
  holders: readonly { kind: "service" | "agent"; id: string }[];
  rotatedDaysAgo: number;
}

export const DATABASES: readonly DatabaseDef[] = [
  { name: "orders-db", kind: "postgres", owner: "orders", readers: ["analytics-worker"], fill: 0.62, growth: 0.0004 },
  { name: "catalog-db", kind: "postgres", owner: "catalog", readers: ["search"], fill: 0.41, growth: 0.0001 },
  { name: "payments-db", kind: "postgres", owner: "payments", readers: ["billing", "fraud-score"], fill: 0.55, growth: 0.0002 },
  { name: "sessions", kind: "redis", owner: "auth", readers: [], fill: 0.7, growth: -0.0002 },
  { name: "profiles-db", kind: "postgres", owner: "customer-profile", readers: ["customer-profiles", "referral-engine"], fill: 0.33, growth: 0.0003 },
  { name: "events", kind: "clickhouse", owner: "event-ingest", readers: ["analytics-worker", "report-builder"], fill: 0.86, growth: 0.0011 },
  { name: "features", kind: "redis", owner: "feature-store", readers: ["search"], fill: 0.48, growth: 0.0002 },
  { name: "invoices", kind: "object-store", owner: "invoice-gen", readers: ["invoice-generator"], fill: 0.27, growth: 0.0005 },
];

export const QUEUES: readonly QueueDef[] = [
  { name: "order-events", from: "orders", to: "analytics-worker", backlog: 18_000, throughput: 700, pressure: 1.08 },
  { name: "emails", from: "orders", to: "notifications", backlog: 120, throughput: 300, pressure: 0.95 },
  { name: "clickstream", from: "event-ingest", to: "analytics-worker", backlog: 4_000, throughput: 2_500, pressure: 1.0 },
  { name: "invoice-jobs", from: "billing", to: "invoice-gen", backlog: 40, throughput: 30, pressure: 0.9 },
  { name: "referral-mail", from: "referral-engine", to: "notify-svc", backlog: 900, throughput: 40, pressure: 1.12 },
];

export const EXTERNALS: readonly ExternalDef[] = [
  { name: "Stripe", kind: "payments", usedBy: ["payments", "billing"], latencyMs: 310, errorRate: 0.004, costPerDay: 260 },
  { name: "LLM provider", kind: "llm", usedBy: ["fraud-score", "report-builder", "referral-engine", "invoice-gen", "invoice-generator"], latencyMs: 1_800, errorRate: 0.01, costPerDay: 128 },
  { name: "Auth provider", kind: "auth", usedBy: ["auth"], latencyMs: 90, errorRate: 0.001, costPerDay: 40 },
  { name: "Email", kind: "email", usedBy: ["notifications", "notify-svc"], latencyMs: 420, errorRate: 0.006, costPerDay: 18 },
];

// The interesting rows are the agent holders: a session that finished weeks
// ago still holding the live Stripe key is exactly what a human should spot.
export const SECRETS: readonly SecretGrant[] = [
  { key: "STRIPE_LIVE_KEY", unlocks: "Stripe", holders: [{ kind: "service", id: "payments" }, { kind: "service", id: "billing" }, { kind: "agent", id: "agent-a19" }], rotatedDaysAgo: 94 },
  { key: "LLM_API_KEY", unlocks: "LLM provider", holders: [{ kind: "service", id: "fraud-score" }, { kind: "service", id: "report-builder" }, { kind: "service", id: "referral-engine" }, { kind: "service", id: "invoice-gen" }, { kind: "service", id: "invoice-generator" }, { kind: "agent", id: "agent-d40" }, { kind: "agent", id: "agent-c66" }], rotatedDaysAgo: 12 },
  { key: "AUTH_CLIENT_SECRET", unlocks: "Auth provider", holders: [{ kind: "service", id: "auth" }], rotatedDaysAgo: 30 },
  { key: "EMAIL_SMTP_PASS", unlocks: "Email", holders: [{ kind: "service", id: "notifications" }, { kind: "service", id: "notify-svc" }, { kind: "agent", id: "agent-5be" }], rotatedDaysAgo: 160 },
  { key: "ORDERS_DB_URL", unlocks: "orders-db", holders: [{ kind: "service", id: "orders" }, { kind: "service", id: "analytics-worker" }, { kind: "agent", id: "agent-2c8" }], rotatedDaysAgo: 45 },
  { key: "EVENTS_DB_URL", unlocks: "events", holders: [{ kind: "service", id: "event-ingest" }, { kind: "service", id: "analytics-worker" }, { kind: "service", id: "report-builder" }], rotatedDaysAgo: 20 },
];

export interface DatabaseState extends DatabaseDef {
  status: Status;
}
export interface QueueState extends QueueDef {
  status: Status;
}
export interface ExternalState extends ExternalDef {
  status: Status;
}

export interface InfraState {
  databases: readonly DatabaseState[];
  queues: readonly QueueState[];
  externals: readonly ExternalState[];
  secrets: readonly SecretGrant[];
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// Fill wraps back down as if someone archived old data, so a demo left
// running all afternoon does not end with every database at 100%.
function fillAt(db: DatabaseDef, tick: number): number {
  const drift = (Math.abs(db.growth) * tick) % 0.25;
  const jitter = (noise(hashString(db.name), tick) - 0.5) * 0.01;
  return clamp01(db.fill + Math.sign(db.growth) * drift + jitter);
}

function backlogAt(q: QueueDef, tick: number): number {
  // A slow sawtooth: pressure > 1 builds a backlog that a periodic
  // autoscale (every 200 ticks) drains again.
  const t = tick % 200;
  const built = (q.pressure - 1) * q.throughput * 1.5 * t;
  const wobble = (noise(hashString(q.name), tick) - 0.5) * q.throughput * 0.6;
  return Math.max(0, Math.round(q.backlog + built + wobble));
}

// The LLM provider has a bad stretch every so often; fraud-score and the
// report builder are the services that feel it.
function externalAt(e: ExternalDef, tick: number): ExternalState {
  const n = noise(hashString(e.name), tick);
  const degraded = e.kind === "llm" && tick % 120 >= 90;
  const latencyMs = Math.round(e.latencyMs * (1 + (n - 0.5) * 0.3) * (degraded ? 2.6 : 1));
  const errorRate = e.errorRate * (1 + n) * (degraded ? 6 : 1);
  const status: Status = errorRate > 0.1 ? "down" : degraded || errorRate > 0.03 ? "warn" : "ok";
  return { ...e, latencyMs, errorRate, status };
}

export function infraAt(tick: number): InfraState {
  return {
    databases: DATABASES.map((db) => {
      const fill = fillAt(db, tick);
      return { ...db, fill, status: fill > 0.95 ? "down" : fill > 0.85 ? "warn" : "ok" };
    }),
    queues: QUEUES.map((q) => {
      const backlog = backlogAt(q, tick);
      // Seconds of work waiting: a backlog is only bad relative to the consumer.
      const lag = backlog / q.throughput;
      return { ...q, backlog, status: lag > 60 ? "down" : lag > 15 ? "warn" : "ok" };
    }),
    externals: EXTERNALS.map((e) => externalAt(e, tick)),
    secrets: SECRETS,
  };
}

/** Everything a key unlocks for one holder (a service or an agent session). */
export function grantsFor(id: string): SecretGrant[] {
  return SECRETS.filter((s) => s.holders.some((h) => h.id === id));
}
