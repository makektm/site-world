// The live numbers the rooms draw: the factory's per-tick metrics for every
// service, plus a short rps history for the dashboards' sparklines.
//
// metricsOf is a pure function of (service, tick), so the history is
// recomputed from the tick instead of being accumulated — a page that
// subscribes late still gets a full sparkline.
import { useFactory } from "./factory/feed";
import { SERVICES } from "./factory/catalog";
import { metricsOf, type Health, type ServiceMetrics } from "./factory/metrics";

export type { Health } from "./factory/metrics";

export interface ServiceState extends ServiceMetrics {
  /** The last HISTORY rps samples, oldest first. */
  history: readonly number[];
}

export type Feed = Readonly<Record<string, ServiceState>>;

const HISTORY = 24;

export const HEALTH_LABEL: Record<Health, string> = { ok: "OK", warn: "DEGRADED", down: "DOWN" };

function feedAt(tick: number): Feed {
  const out: Record<string, ServiceState> = {};
  for (const s of SERVICES) {
    const history = Array.from({ length: HISTORY }, (_, i) => metricsOf(s, tick - HISTORY + 1 + i).rps);
    out[s.name] = { ...metricsOf(s, tick), history };
  }
  return out;
}

// Every room reads the feed; one shared snapshot per tick keeps the work (and
// the object identity rooms memo on) the same for all of them.
let last: { tick: number; feed: Feed } | null = null;

export function useFeed(): Feed {
  const { tick } = useFactory();
  if (last?.tick !== tick) last = { tick, feed: feedAt(tick) };
  return last.feed;
}
