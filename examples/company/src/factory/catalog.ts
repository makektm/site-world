// The factory's service catalogue: the company about six months after it let
// coding agents create and change services on their own.
//
// The original ten (services.ts) were written by people; fourteen more were
// made by agent sessions since, and the catalogue deliberately carries the
// mess that follows — look-alike duplicates, services nothing calls, and
// services whose only "owner" is the agent session that made them. sprawl.ts
// finds those from this data; nothing here labels them, because a real
// catalogue would not either.
//
// The shape is site-world-agnostic: `{ domains: {id,label}[], services:
// {name,domain,...}[] }` is what a layout function takes, and every extra
// field rides alongside.
import { SERVICES as ORIGINAL } from "../services";

export type FactoryDomain = "edge" | "commerce" | "payments" | "platform" | "growth" | "data";
export type Origin = "human" | "agent";

export interface DomainDef {
  id: FactoryDomain;
  label: string;
}

export interface FactoryService {
  name: string;
  domain: FactoryDomain;
  /** Who wrote the first commit: a person, or an agent session. */
  origin: Origin;
  /** Days ago the service first deployed. More than HISTORY_DAYS means it predates the timeline. */
  createdAt: number;
  /** A team handle ("@team-edge") or, when nobody adopted it, the agent session that made it. */
  owner: string;
  ownerKind: "team" | "agent";
  /** The PR or session that created it ("PR #212", "agent-7f3"). */
  createdBy: string;
  /** Compute + storage, USD per day. */
  costPerDay: number;
  /** LLM tokens the service itself spends per day (0 for most). */
  tokensPerDay: number;
  /** Normal traffic, requests per second. 0 means nothing calls it in production. */
  baseRps: number;
  baseP99: number;
  replicas: number;
  summary: string;
}

export interface Catalog {
  domains: readonly DomainDef[];
  services: readonly FactoryService[];
}

export const DOMAINS: readonly DomainDef[] = [
  { id: "edge", label: "Edge" },
  { id: "commerce", label: "Commerce" },
  { id: "payments", label: "Payments" },
  { id: "platform", label: "Platform" },
  { id: "growth", label: "Growth" },
  { id: "data", label: "Data" },
];

const TEAM: Record<string, string> = {
  edge: "@team-edge",
  commerce: "@team-shop",
  payments: "@team-money",
  platform: "@team-platform",
};

// What the people who built the first ten would say about them.
const ORIGINAL_META: Record<string, Pick<FactoryService, "createdAt" | "createdBy" | "costPerDay" | "summary">> = {
  "web-frontend": { createdAt: 640, createdBy: "PR #12", costPerDay: 96, summary: "storefront SSR" },
  "api-gateway": { createdAt: 610, createdBy: "PR #31", costPerDay: 120, summary: "routing, rate plans" },
  auth: { createdAt: 600, createdBy: "PR #40", costPerDay: 44, summary: "sessions, tokens" },
  catalog: { createdAt: 560, createdBy: "PR #77", costPerDay: 58, summary: "products, prices" },
  search: { createdAt: 520, createdBy: "PR #103", costPerDay: 140, summary: "product search" },
  orders: { createdAt: 500, createdBy: "PR #118", costPerDay: 72, summary: "checkout, order state" },
  payments: { createdAt: 470, createdBy: "PR #151", costPerDay: 88, summary: "card capture" },
  billing: { createdAt: 430, createdBy: "PR #170", costPerDay: 36, summary: "invoices, dunning" },
  notifications: { createdAt: 390, createdBy: "PR #188", costPerDay: 30, summary: "email, push" },
  "analytics-worker": { createdAt: 300, createdBy: "PR #240", costPerDay: 210, summary: "event rollups" },
};

const originals: FactoryService[] = ORIGINAL.map((s) => {
  const meta = ORIGINAL_META[s.name]!;
  return {
    name: s.name,
    domain: s.domain,
    origin: "human",
    ...meta,
    owner: TEAM[s.domain]!,
    ownerKind: "team",
    tokensPerDay: 0,
    baseRps: s.baseRps,
    baseP99: s.baseP99,
    replicas: s.replicas,
  };
});

// Created since the switch, oldest first. Agent session ids double as the
// agent's name (agents.ts reuses some of them).
const created: FactoryService[] = [
  { name: "rate-limiter", domain: "edge", origin: "human", createdAt: 171, owner: "@team-edge", ownerKind: "team", createdBy: "PR #402", costPerDay: 18, tokensPerDay: 0, baseRps: 3100, baseP99: 4, replicas: 3, summary: "token buckets per key" },
  { name: "feature-flags", domain: "platform", origin: "human", createdAt: 164, owner: "@team-platform", ownerKind: "team", createdBy: "PR #415", costPerDay: 12, tokensPerDay: 0, baseRps: 1900, baseP99: 6, replicas: 2, summary: "flags, rollouts" },
  { name: "event-ingest", domain: "data", origin: "agent", createdAt: 151, owner: "@team-data", ownerKind: "team", createdBy: "agent-2c8", costPerDay: 64, tokensPerDay: 0, baseRps: 2600, baseP99: 18, replicas: 4, summary: "clickstream intake" },
  { name: "customer-profile", domain: "growth", origin: "agent", createdAt: 138, owner: "@team-growth", ownerKind: "team", createdBy: "agent-7f3", costPerDay: 40, tokensPerDay: 0, baseRps: 640, baseP99: 26, replicas: 2, summary: "who the customer is" },
  { name: "invoice-gen", domain: "payments", origin: "agent", createdAt: 126, owner: "@team-money", ownerKind: "team", createdBy: "agent-a19", costPerDay: 22, tokensPerDay: 40_000, baseRps: 35, baseP99: 380, replicas: 2, summary: "PDF invoices" },
  { name: "promo-codes", domain: "growth", origin: "agent", createdAt: 112, owner: "@team-growth", ownerKind: "team", createdBy: "agent-7f3", costPerDay: 16, tokensPerDay: 0, baseRps: 260, baseP99: 14, replicas: 2, summary: "codes, redemptions" },
  { name: "feature-store", domain: "data", origin: "agent", createdAt: 97, owner: "@team-data", ownerKind: "team", createdBy: "agent-2c8", costPerDay: 180, tokensPerDay: 0, baseRps: 900, baseP99: 12, replicas: 3, summary: "ranking features" },
  { name: "fraud-score", domain: "payments", origin: "agent", createdAt: 84, owner: "agent-d40", ownerKind: "agent", createdBy: "agent-d40", costPerDay: 95, tokensPerDay: 14_000_000, baseRps: 190, baseP99: 240, replicas: 2, summary: "LLM risk score per order" },
  { name: "referral-engine", domain: "growth", origin: "agent", createdAt: 70, owner: "@team-growth", ownerKind: "team", createdBy: "agent-5be", costPerDay: 28, tokensPerDay: 300_000, baseRps: 140, baseP99: 60, replicas: 2, summary: "invite links, rewards" },
  { name: "notify-svc", domain: "platform", origin: "agent", createdAt: 58, owner: "agent-5be", ownerKind: "agent", createdBy: "agent-5be", costPerDay: 26, tokensPerDay: 0, baseRps: 45, baseP99: 34, replicas: 2, summary: "sends referral emails" },
  { name: "ab-testing", domain: "growth", origin: "agent", createdAt: 47, owner: "@team-growth", ownerKind: "team", createdBy: "agent-e02", costPerDay: 34, tokensPerDay: 0, baseRps: 0, baseP99: 0, replicas: 2, summary: "experiment assignment" },
  { name: "customer-profiles", domain: "growth", origin: "agent", createdAt: 33, owner: "agent-91a", ownerKind: "agent", createdBy: "agent-91a", costPerDay: 38, tokensPerDay: 0, baseRps: 120, baseP99: 31, replicas: 2, summary: "profile reads for promos" },
  { name: "invoice-generator", domain: "payments", origin: "agent", createdAt: 21, owner: "@team-money", ownerKind: "team", createdBy: "agent-a19", costPerDay: 20, tokensPerDay: 55_000, baseRps: 0, baseP99: 0, replicas: 1, summary: "invoice rendering (v2?)" },
  { name: "report-builder", domain: "data", origin: "agent", createdAt: 9, owner: "@team-data", ownerKind: "team", createdBy: "agent-c66", costPerDay: 48, tokensPerDay: 7_000_000, baseRps: 0, baseP99: 0, replicas: 1, summary: "LLM-written weekly reports" },
];

export const SERVICES: readonly FactoryService[] = [...originals, ...created];

/** Who calls whom: [caller, callee]. The first eleven are services.ts's CALLS. */
export const CALLS: readonly (readonly [string, string])[] = [
  ["web-frontend", "api-gateway"],
  ["api-gateway", "auth"],
  ["api-gateway", "catalog"],
  ["api-gateway", "search"],
  ["api-gateway", "orders"],
  ["search", "catalog"],
  ["orders", "payments"],
  ["orders", "notifications"],
  ["orders", "analytics-worker"],
  ["payments", "billing"],
  ["billing", "notifications"],
  ["api-gateway", "rate-limiter"],
  ["web-frontend", "feature-flags"],
  ["web-frontend", "event-ingest"],
  ["event-ingest", "analytics-worker"],
  ["api-gateway", "customer-profile"],
  ["billing", "invoice-gen"],
  ["invoice-gen", "notifications"],
  ["orders", "promo-codes"],
  ["analytics-worker", "feature-store"],
  ["search", "feature-store"],
  ["orders", "fraud-score"],
  ["payments", "fraud-score"],
  ["web-frontend", "referral-engine"],
  ["referral-engine", "customer-profile"],
  ["referral-engine", "notify-svc"],
  ["promo-codes", "customer-profiles"],
];

export const CATALOG: Catalog = { domains: DOMAINS, services: SERVICES };

export const serviceByName: ReadonlyMap<string, FactoryService> = new Map(SERVICES.map((s) => [s.name, s]));
