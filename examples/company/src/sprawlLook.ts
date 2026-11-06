// How sprawl shows on a pylon: the catalogue facts (who made it, how old it
// is) and the findings (orphan, look-alike, unowned) turned into a look. Pure,
// so the same rules apply live and on a replayed day.
import type { FactoryService } from "./factory/catalog";
import type { SprawlReport } from "./factory/sprawl";

/**
 * One tint per look-alike pair, so two pairs in one room do not read as one
 * group of four. Chosen away from the health colours (green, amber, red) and
 * the agent blue, which already mean something on a pylon.
 */
export const PAIR_TINTS = ["#b48cff", "#ff6fd8", "#62e6ff", "#f2f07a"] as const;

export interface PylonLook {
  origin: FactoryService["origin"];
  /** Tree rings at the base: one per started 120 days of age, at most 6. */
  rings: number;
  orphan: boolean;
  /** Owned only by the agent session that made it. */
  unowned: boolean;
  /** The pair's tint and the other service's name, for a look-alike. */
  pair: { tint: string; with: string } | null;
}

export const MAX_RINGS = 6;

export function ageRings(createdDaysAgo: number): number {
  return Math.min(MAX_RINGS, 1 + Math.floor(Math.max(0, createdDaysAgo) / 120));
}

export function pylonLooks(services: readonly FactoryService[], report: SprawlReport): Map<string, PylonLook> {
  const orphans = new Set(report.orphans);
  const unowned = new Set(report.unowned);
  const pairs = new Map<string, { tint: string; with: string }>();
  report.lookAlikes.forEach((p, i) => {
    const tint = PAIR_TINTS[i % PAIR_TINTS.length]!;
    // A service in two pairs keeps its first (strongest) one: one tint per pylon.
    if (!pairs.has(p.a)) pairs.set(p.a, { tint, with: p.b });
    if (!pairs.has(p.b)) pairs.set(p.b, { tint, with: p.a });
  });
  return new Map(
    services.map((s) => [
      s.name,
      {
        origin: s.origin,
        rings: ageRings(s.createdAt),
        orphan: orphans.has(s.name),
        unowned: unowned.has(s.name),
        pair: pairs.get(s.name) ?? null,
      },
    ]),
  );
}

/**
 * Looks as they were `daysAgo` days before now: every service younger by that
 * much (fewer rings), and the findings of that moment's catalogue.
 */
export function looksAt(services: readonly FactoryService[], report: SprawlReport, daysAgo: number): Map<string, PylonLook> {
  return pylonLooks(services.map((s) => ({ ...s, createdAt: s.createdAt - daysAgo })), report);
}
