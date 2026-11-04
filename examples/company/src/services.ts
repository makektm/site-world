// The company's ten services as data, and a fake live feed for them.
//
// In a real host this file is the adapter: it reads your service catalogue
// (Kubernetes, Consul, a service registry, a YAML file an agent maintains)
// and your metrics, and hands the world plain numbers. Everything the rooms
// draw — pylon heights, replica colours, dashboards, traffic arcs — is
// derived from what is here.
import { useSyncExternalStore } from "react";

export type Health = "ok" | "warn" | "down";
export type Domain = "edge" | "commerce" | "payments" | "platform";

export interface ServiceDef {
  name: string;
  domain: Domain;
  /** Where its pylon stands, [x, z] in metres. */
  at: readonly [number, number];
  /** Normal traffic, requests per second. */
  baseRps: number;
  baseP99: number;
  replicas: number;
}

export const SERVICES: readonly ServiceDef[] = [
  { name: "web-frontend", domain: "edge", at: [-7.5, -3.5], baseRps: 2400, baseP99: 120, replicas: 4 },
  { name: "api-gateway", domain: "edge", at: [-3.5, -4.5], baseRps: 3100, baseP99: 45, replicas: 5 },
  { name: "auth", domain: "edge", at: [-6.5, -7.4], baseRps: 900, baseP99: 22, replicas: 3 },
  { name: "catalog", domain: "commerce", at: [3.5, -7], baseRps: 1500, baseP99: 38, replicas: 3 },
  { name: "search", domain: "commerce", at: [7.5, -6.6], baseRps: 1100, baseP99: 70, replicas: 3 },
  { name: "orders", domain: "commerce", at: [6.8, -3.2], baseRps: 420, baseP99: 95, replicas: 3 },
  { name: "payments", domain: "payments", at: [4.5, 6.5], baseRps: 180, baseP99: 140, replicas: 3 },
  { name: "billing", domain: "payments", at: [7.5, 3.8], baseRps: 60, baseP99: 210, replicas: 2 },
  { name: "notifications", domain: "platform", at: [-4, 6], baseRps: 310, baseP99: 30, replicas: 2 },
  { name: "analytics-worker", domain: "platform", at: [-7.5, 3.5], baseRps: 800, baseP99: 600, replicas: 4 },
];

/** Who calls whom: [caller, callee]. Drawn as arcs over the walls. */
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
];

export const byName = new Map(SERVICES.map((s) => [s.name, s]));

export interface ServiceState {
  rps: number;
  p99: number;
  /** Errors, as a fraction of requests. */
  errors: number;
  replicas: readonly Health[];
  /** The last HISTORY rps samples, oldest first. */
  history: readonly number[];
  health: Health;
}

export type Feed = Readonly<Record<string, ServiceState>>;

const HISTORY = 24;
const TICK_MS = 1500;

// The incident the demo tells: one payments replica has died and the rest
// are slow, and the analytics queue is backing up behind a deploy.
function replicasFor(def: ServiceDef): Health[] {
  const r: Health[] = Array.from({ length: def.replicas }, () => "ok");
  if (def.name === "payments") r[2] = "down";
  if (def.name === "analytics-worker") r[1] = "warn";
  return r;
}

function healthOf(errors: number, p99: number, base: number, replicas: readonly Health[]): Health {
  if (replicas.every((r) => r === "down") || errors > 0.2) return "down";
  if (replicas.some((r) => r !== "ok") || errors > 0.02 || p99 > base * 2) return "warn";
  return "ok";
}

// A small deterministic generator, so every load (and every screenshot)
// tells the same story.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const rand = rng(7);

function sample(def: ServiceDef, t: number): { rps: number; p99: number; errors: number } {
  const wave = 1 + 0.18 * Math.sin(t / 5 + def.baseRps);
  const noise = 1 + (rand() - 0.5) * 0.12;
  let p99 = def.baseP99 * (1 + (rand() - 0.5) * 0.2);
  let errors = 0.002 + rand() * 0.004;
  if (def.name === "payments") {
    p99 *= 3.1;
    errors = 0.035 + rand() * 0.01;
  }
  if (def.name === "analytics-worker") p99 *= 2.4;
  return { rps: Math.round(def.baseRps * wave * noise), p99: Math.round(p99), errors };
}

function initial(): Feed {
  const out: Record<string, ServiceState> = {};
  for (const def of SERVICES) {
    const history: number[] = [];
    for (let t = -HISTORY; t < 0; t += 1) history.push(sample(def, t).rps);
    const now = sample(def, 0);
    const replicas = replicasFor(def);
    out[def.name] = { ...now, replicas, history, health: healthOf(now.errors, now.p99, def.baseP99, replicas) };
  }
  return out;
}

let feed: Feed = initial();
let tick = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function step(): void {
  tick += 1;
  const next: Record<string, ServiceState> = {};
  for (const def of SERVICES) {
    const prev = feed[def.name]!;
    const now = sample(def, tick);
    next[def.name] = {
      ...now,
      replicas: prev.replicas,
      history: [...prev.history.slice(1 - HISTORY), now.rps],
      health: healthOf(now.errors, now.p99, def.baseP99, prev.replicas),
    };
  }
  feed = next;
  for (const l of listeners) l();
}

// The feed only ticks while something is watching it.
function subscribe(l: () => void): () => void {
  listeners.add(l);
  timer ??= setInterval(step, TICK_MS);
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useFeed(): Feed {
  return useSyncExternalStore(subscribe, () => feed);
}

export const HEALTH_LABEL: Record<Health, string> = { ok: "OK", warn: "DEGRADED", down: "DOWN" };
