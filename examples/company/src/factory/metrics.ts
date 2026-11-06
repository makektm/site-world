// Live request metrics for every factory service, as a pure function of tick.
//
// It covers all of the catalogue and is hashed from (service, tick) so the
// timeline replay can ask for any tick (liveFeed.ts derives the dashboards'
// sparklines the same way). The incidents: a payments replica down and
// analytics-worker slow, plus the factory's own: fraud-score slows whenever
// the LLM provider has its bad stretch (infra.ts).
import { SERVICES, type FactoryService } from "./catalog";
import { hashString, noise } from "./rand";

export type Health = "ok" | "warn" | "down";

export interface ServiceMetrics {
  rps: number;
  p99: number;
  /** Errors, as a fraction of requests. */
  errors: number;
  replicas: readonly Health[];
  health: Health;
}

function replicasFor(s: FactoryService): Health[] {
  const r: Health[] = Array.from({ length: s.replicas }, () => "ok");
  if (s.name === "payments") r[2] = "down";
  if (s.name === "analytics-worker") r[1] = "warn";
  return r;
}

export function metricsOf(s: FactoryService, tick: number): ServiceMetrics {
  const h = hashString(s.name);
  const replicas = replicasFor(s);
  // Orphans really serve nothing; zero is the signal sprawl.ts looks for.
  if (s.baseRps <= 0) return { rps: 0, p99: 0, errors: 0, replicas, health: "ok" };
  const wave = 1 + 0.18 * Math.sin(tick / 5 + s.baseRps);
  const rps = Math.round(s.baseRps * wave * (1 + (noise(h, tick, 1) - 0.5) * 0.12));
  let p99 = s.baseP99 * (1 + (noise(h, tick, 2) - 0.5) * 0.2);
  let errors = 0.002 + noise(h, tick, 3) * 0.004;
  if (s.name === "payments") {
    p99 *= 3.1;
    errors = 0.035 + noise(h, tick, 4) * 0.01;
  }
  if (s.name === "analytics-worker") p99 *= 2.4;
  if (s.name === "fraud-score" && tick % 120 >= 90) {
    p99 *= 2.6;
    errors *= 6;
  }
  let health: Health = "ok";
  if (replicas.every((r) => r === "down") || errors > 0.2) health = "down";
  else if (replicas.some((r) => r !== "ok") || errors > 0.02 || p99 > s.baseP99 * 2) health = "warn";
  return { rps, p99: Math.round(p99), errors, replicas, health };
}

export function metricsAt(tick: number, services: readonly FactoryService[] = SERVICES): Record<string, ServiceMetrics> {
  const out: Record<string, ServiceMetrics> = {};
  for (const s of services) out[s.name] = metricsOf(s, tick);
  return out;
}
