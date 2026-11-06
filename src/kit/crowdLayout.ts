// Fans out figures that would stand on the same spot. Several agents sent to
// one service would otherwise render inside each other and read as one; this
// spreads each such cluster on rings round the cluster's centre, far enough
// apart that figure and label tag stay separable.
//
// Deterministic: members are placed in id order, so the same set lays out the
// same way whatever order the host lists them in.
import { useMemo } from "react";
import type { PathPoint } from "./agentPath";

/** One figure to place: a stable id and the spot it wants. */
export interface CrowdMember {
  id: string;
  at: PathPoint;
}

/** How close counts as "the same spot", and how far apart to spread. */
export interface CrowdOptions {
  /** Members closer than this (metres) share a spot and are fanned out together. Default 0.5. */
  join?: number;
  /** Least distance between neighbours after fanning out, metres. Default 1.0: wide enough that neighbours' name tags mostly clear each other; see AgentFigure's labelLift for the rest. */
  spacing?: number;
}

/** Where each member should stand, by id: unchanged when alone, spread on rings when sharing a spot. */
export function crowdLayout(
  members: readonly CrowdMember[],
  { join = 0.5, spacing = 1.0 }: CrowdOptions = {},
): Map<string, [number, number]> {
  const sorted = [...members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // Single-linkage clusters by union-find: a chain of near neighbours is one
  // crowd even if its ends are further apart than `join`, because fanning
  // out only one end would push it into the other.
  const parent = sorted.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    return r;
  };
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i]!.at;
      const b = sorted[j]!.at;
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < join) {
        const ri = find(i);
        const rj = find(j);
        if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj);
      }
    }
  }
  const clusters = new Map<number, CrowdMember[]>();
  sorted.forEach((m, i) => {
    const root = find(i);
    const list = clusters.get(root);
    if (list) list.push(m);
    else clusters.set(root, [m]);
  });

  const out = new Map<string, [number, number]>();
  for (const group of clusters.values()) {
    if (group.length === 1) {
      const m = group[0]!;
      out.set(m.id, [m.at[0], m.at[1]]);
      continue;
    }
    const cx = group.reduce((s, m) => s + m.at[0], 0) / group.length;
    const cz = group.reduce((s, m) => s + m.at[1], 0) / group.length;
    fanOut(group.length, spacing).forEach(([dx, dz], i) => {
      out.set(group[i]!.id, [cx + dx, cz + dz]);
    });
  }
  return out;
}

/** Offsets [dx, dz] for `n` figures round a centre, every pair at least `spacing` apart. */
export function fanOut(n: number, spacing: number): [number, number][] {
  if (n <= 0) return [];
  if (n === 1) return [[0, 0]];
  // Up to six fit on one ring whose chord is exactly `spacing`: tight, and
  // the centre left empty so no one stands on the thing they crowd round.
  if (n <= 6) return ring(n, spacing / (2 * Math.sin(Math.PI / n)), 0);
  const offsets: [number, number][] = [];
  let left = n;
  for (let k = 1; left > 0; k += 1) {
    // Ring k sits k*spacing out, so rings are `spacing` apart radially. The
    // 0.95 keeps the chord between neighbours on a ring above `spacing`,
    // since a chord is a little shorter than the arc it cuts.
    const cap = Math.floor(2 * Math.PI * k * 0.95);
    const take = Math.min(left, cap);
    offsets.push(...ring(take, k * spacing, k * 0.5));
    left -= take;
  }
  return offsets;
}

function ring(n: number, radius: number, phase: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2;
    return [Math.sin(a) * radius, Math.cos(a) * radius] as [number, number];
  });
}

/** `crowdLayout`, memoised on the members' ids and spots rather than on the array's identity. */
export function useCrowdLayout(members: readonly CrowdMember[], options: CrowdOptions = {}): Map<string, [number, number]> {
  // Hosts usually rebuild the members array every render; keying on its
  // contents keeps the returned Map stable, so figures fed from it do not
  // re-run their effects each frame.
  const key = members.map((m) => `${m.id}@${m.at[0]},${m.at[1]}`).join("|");
  const { join, spacing } = options;
  const latest = useMemo(() => ({ members }), [key]);
  return useMemo(() => crowdLayout(latest.members, { join, spacing }), [latest, join, spacing]);
}
