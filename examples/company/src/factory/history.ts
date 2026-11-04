// Six months of the factory as a timeline, for time-lapse and replay.
//
// Time `t` is in days from the start of the timeline: 0 is the day the
// company switched to agent-first, HISTORY_DAYS is now, fractions are the
// time of day. The event list is generated once, deterministically, from the
// catalogue (service births match createdAt) plus seeded deploys, incidents
// and agent sessions whose volume grows as agents take over more of the work.
import { CALLS, SERVICES, type FactoryService } from "./catalog";
import { AGENTS } from "./agents";
import { hashString, noise } from "./rand";

export const HISTORY_DAYS = 180;

export type HistoryKind = "service-created" | "deploy" | "incident" | "session-start" | "session-end";

export interface HistoryEvent {
  /** Days since the timeline began; fractional part is time of day. */
  t: number;
  kind: HistoryKind;
  service?: string;
  agent?: string;
  version?: string;
  /** For incidents: when it was resolved, in the same units. */
  until?: number;
  text: string;
}

export interface Incident {
  service: string;
  from: number;
  until: number;
  text: string;
}

export interface HistoryState {
  t: number;
  services: readonly FactoryService[];
  calls: readonly (readonly [string, string])[];
  versions: Readonly<Record<string, string>>;
  /** Day (t) of each service's most recent deploy. */
  lastDeploy: Readonly<Record<string, number>>;
  deploys: number;
  incidents: readonly Incident[];
  activeSessions: readonly string[];
  /** The last few events at or before t, newest last. */
  recent: readonly HistoryEvent[];
  counts: { services: number; byAgents: number; byHumans: number; sessions: number };
}

/**
 * When a service first deployed, in timeline days; negative for the ones that
 * predate the timeline. Work hours on its creation day, so the time-lapse and
 * its "created" event agree to the minute.
 */
export function createdDay(s: Pick<FactoryService, "name" | "createdAt">): number {
  return HISTORY_DAYS - s.createdAt + 0.4 + noise(hashString(s.name), 1) * 0.3;
}

export function servicesAt(t: number): FactoryService[] {
  return SERVICES.filter((s) => createdDay(s) <= t);
}

const INCIDENTS: readonly Incident[] = [
  { service: "payments", from: 23.4, until: 23.6, text: "card capture timeouts after Stripe SDK bump" },
  { service: "search", from: 61.5, until: 62.1, text: "index rebuild starved catalog reads" },
  { service: "notifications", from: 88.6, until: 88.7, text: "duplicate emails: notify-svc and notifications both sent" },
  { service: "fraud-score", from: 121.4, until: 122.0, text: "LLM provider rate limit, orders held" },
  { service: "analytics-worker", from: 149.6, until: 150.4, text: "order-events backlog after partition change" },
  { service: "payments", from: 179.55, until: 180.5, text: "one replica down, p99 x3 (ongoing)" },
];

// Session ids look like the live ones but come from a hash, so the history
// never collides with the eight agents running now.
function sessionId(day: number, k: number): string {
  return `agent-${Math.floor(noise(day, k, 99) * 0xfff).toString(16).padStart(3, "0")}`;
}

function build(): HistoryEvent[] {
  const out: HistoryEvent[] = [];
  for (const s of SERVICES) {
    const at = createdDay(s);
    if (at < 0) continue;
    const who = s.origin === "agent" ? s.createdBy : `a person (${s.createdBy})`;
    out.push({ t: at, kind: "service-created", service: s.name, agent: s.origin === "agent" ? s.createdBy : undefined, text: `${s.name} created by ${who}` });
  }

  const version: Record<string, [number, number]> = {};
  for (const s of SERVICES) version[s.name] = [1 + (hashString(s.name) % 3), 0];
  for (let day = 0; day < HISTORY_DAYS; day += 1) {
    const live = servicesAt(day);
    // Deploys per day climb from a human pace (~3) to an agent pace (~18).
    const n = Math.round(3 + (day / HISTORY_DAYS) * 15 * (0.6 + noise(day, 2) * 0.8));
    for (let k = 0; k < n; k += 1) {
      const s = live[Math.floor(noise(day, k, 3) * live.length)]!;
      const v = version[s.name]!;
      v[1] += 1;
      const t = day + 0.35 + noise(day, k, 4) * 0.45;
      const agent = noise(day, k, 5) < day / HISTORY_DAYS + 0.1 ? sessionId(day, k) : undefined;
      out.push({ t, kind: "deploy", service: s.name, agent, version: `${v[0]}.${v[1]}.0`, text: `${s.name} ${v[0]}.${v[1]}.0` });
    }
    const sessions = Math.round(1 + (day / HISTORY_DAYS) * 9 * (0.5 + noise(day, 6)));
    for (let k = 0; k < sessions; k += 1) {
      const id = sessionId(day, 100 + k);
      const start = day + 0.3 + noise(day, k, 7) * 0.5;
      const end = start + 0.02 + noise(day, k, 8) * 0.25;
      const s = live[Math.floor(noise(day, k, 9) * live.length)]!;
      out.push({ t: start, kind: "session-start", agent: id, service: s.name, text: `${id} started on ${s.name}` });
      if (end < HISTORY_DAYS) out.push({ t: end, kind: "session-end", agent: id, service: s.name, text: `${id} finished` });
    }
  }

  for (const i of INCIDENTS) {
    out.push({ t: i.from, kind: "incident", service: i.service, until: i.until, text: i.text });
  }

  // The sessions running now started minutes ago and have not ended.
  for (const a of AGENTS) {
    const t = HISTORY_DAYS - a.startedMinAgo / (24 * 60);
    out.push({ t, kind: "session-start", agent: a.id, service: a.tasks[0]!.route[0], text: `${a.id} started: ${a.tasks[0]!.title}` });
  }

  return out.sort((a, b) => a.t - b.t);
}

export const HISTORY: readonly HistoryEvent[] = build();

/** Index of the first event after t. */
function upto(t: number): number {
  let lo = 0;
  let hi = HISTORY.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (HISTORY[mid]!.t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Events in [from, to), oldest first — e.g. one day: eventsBetween(d, d + 1). */
export function eventsBetween(from: number, to: number): HistoryEvent[] {
  return HISTORY.slice(upto(from - 1e-9), upto(to - 1e-9));
}

const RECENT = 8;

/** The factory as it stood at time t. */
export function stateAt(t: number): HistoryState {
  const end = upto(t);
  const versions: Record<string, string> = {};
  const lastDeploy: Record<string, number> = {};
  const sessions = new Set<string>();
  let deploys = 0;
  for (let i = 0; i < end; i += 1) {
    const e = HISTORY[i]!;
    if (e.kind === "deploy" && e.service) {
      deploys += 1;
      versions[e.service] = e.version!;
      lastDeploy[e.service] = e.t;
    } else if (e.kind === "session-start" && e.agent) sessions.add(e.agent);
    else if (e.kind === "session-end" && e.agent) sessions.delete(e.agent);
  }
  const services = servicesAt(t);
  const names = new Set(services.map((s) => s.name));
  const byAgents = services.filter((s) => s.origin === "agent").length;
  return {
    t,
    services,
    calls: CALLS.filter(([a, b]) => names.has(a) && names.has(b)),
    versions,
    lastDeploy,
    deploys,
    incidents: INCIDENTS.filter((i) => i.from <= t && t < i.until),
    activeSessions: [...sessions],
    recent: HISTORY.slice(Math.max(0, end - RECENT), end),
    counts: { services: services.length, byAgents, byHumans: services.length - byAgents, sessions: sessions.size },
  };
}
