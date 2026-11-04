// Sprawl findings, derived from the catalogue alone.
//
// Agents add services faster than people notice them; these are the four
// questions a human asks of a catalogue they did not write: what is dead,
// what is a duplicate, what does nobody own, and what is expensive. All pure,
// so the host can recompute them for any point on the timeline.
import type { FactoryService } from "./catalog";

type Call = readonly [string, string];

export interface LookAlike {
  a: string;
  b: string;
  /** 0..1, how alike the names are once suffixes are ignored. */
  score: number;
}

export interface CostHotspot {
  name: string;
  /** Compute plus tokens, USD per day. */
  usdPerDay: number;
  tokensPerDay: number;
}

export type FindingKind = "orphan" | "look-alike" | "unowned" | "cost";

export interface Finding {
  kind: FindingKind;
  services: readonly string[];
  severity: "info" | "warn";
  text: string;
}

export interface SprawlReport {
  orphans: readonly string[];
  lookAlikes: readonly LookAlike[];
  unowned: readonly string[];
  hotspots: readonly CostHotspot[];
  findings: readonly Finding[];
}

/** What a million tokens costs the company, blended across input and output. */
export const USD_PER_MTOK = 6;

// Words that say nothing about what a service does; agents append them freely
// ("notify-svc", "profiles-api"), so two names that differ only by them are
// the same idea.
const NOISE_WORDS = new Set(["svc", "service", "api", "app", "server", "v2", "new", "next"]);

/** The part of a name that carries meaning: lower case, no noise words, no separators. */
export function nameCore(name: string): string {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !NOISE_WORDS.has(w))
    .join("");
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i += 1) out.push(s.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice over character bigrams. */
function dice(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.length === 0 || B.length === 0) return a === b ? 1 : 0;
  const pool = new Map<string, number>();
  for (const g of A) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of B) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hit += 1;
      pool.set(g, n - 1);
    }
  }
  return (2 * hit) / (A.length + B.length);
}

// A shared stem counts for more than scattered bigrams: "notify" and
// "notifications" share little by Dice but are obviously the same idea. The
// stem must be long enough that "pay" vs "payroll" does not qualify.
const MIN_STEM = 5;

function stemRatio(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (i < MIN_STEM) return 0;
  return i / Math.min(a.length, b.length);
}

/** How alike two service names are, 0..1. */
export function nameSimilarity(a: string, b: string): number {
  const ca = nameCore(a);
  const cb = nameCore(b);
  if (!ca || !cb) return 0;
  if (ca === cb) return 1;
  return Math.max(dice(ca, cb), 0.95 * stemRatio(ca, cb));
}

/** Pairs of services in the same domain whose names say they do the same job. */
export function findLookAlikes(
  services: readonly Pick<FactoryService, "name" | "domain">[],
  threshold = 0.75,
): LookAlike[] {
  const out: LookAlike[] = [];
  for (let i = 0; i < services.length; i += 1) {
    for (let j = i + 1; j < services.length; j += 1) {
      const a = services[i]!;
      const b = services[j]!;
      if (a.domain !== b.domain) continue;
      const score = nameSimilarity(a.name, b.name);
      if (score >= threshold) out.push({ a: a.name, b: b.name, score });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

/**
 * Services nobody calls and that serve no traffic. Both conditions, because an
 * entry point (web-frontend) has no callers but plenty of traffic.
 * `rps` overrides baseRps with live numbers when the host has them.
 */
export function findOrphans(
  services: readonly Pick<FactoryService, "name" | "baseRps">[],
  calls: readonly Call[],
  rps?: Readonly<Record<string, number>>,
): string[] {
  const called = new Set(calls.map(([, to]) => to));
  return services
    .filter((s) => !called.has(s.name) && (rps?.[s.name] ?? s.baseRps) <= 0)
    .map((s) => s.name);
}

/** Services whose only owner is the agent session that made them. */
export function findUnowned(services: readonly Pick<FactoryService, "name" | "ownerKind">[]): string[] {
  return services.filter((s) => s.ownerKind === "agent").map((s) => s.name);
}

/** The most expensive services per day, compute plus tokens. */
export function costHotspots(
  services: readonly Pick<FactoryService, "name" | "costPerDay" | "tokensPerDay">[],
  top = 5,
): CostHotspot[] {
  return services
    .map((s) => ({
      name: s.name,
      tokensPerDay: s.tokensPerDay,
      usdPerDay: Math.round(s.costPerDay + (s.tokensPerDay / 1e6) * USD_PER_MTOK),
    }))
    .sort((a, b) => b.usdPerDay - a.usdPerDay)
    .slice(0, top);
}

export function sprawlReport(services: readonly FactoryService[], calls: readonly Call[]): SprawlReport {
  const orphans = findOrphans(services, calls);
  const lookAlikes = findLookAlikes(services);
  const unowned = findUnowned(services);
  const hotspots = costHotspots(services);
  const findings: Finding[] = [
    ...orphans.map((name): Finding => ({ kind: "orphan", services: [name], severity: "warn", text: `${name}: no callers, no traffic` })),
    ...lookAlikes.map((p): Finding => ({ kind: "look-alike", services: [p.a, p.b], severity: "warn", text: `${p.a} ≈ ${p.b} (${Math.round(p.score * 100)}%)` })),
    ...unowned.map((name): Finding => ({ kind: "unowned", services: [name], severity: "warn", text: `${name}: owned only by an agent session` })),
    ...hotspots.map((h): Finding => ({ kind: "cost", services: [h.name], severity: "info", text: `${h.name}: $${h.usdPerDay}/day` })),
  ];
  return { orphans, lookAlikes, unowned, hotspots, findings };
}
