// Who is reached from a node by following edges: the blast radius of a change
// or an outage. Pure and breadth-first, so each node's depth is its shortest
// hop count and `via` gives one shortest path back — the host draws it.

/** A directed edge, `from` -> `to` (e.g. caller -> callee). */
export type BlastEdge = readonly [from: string, to: string] | { readonly from: string; readonly to: string };

/** Which way to walk: `out` follows from->to, `in` walks back to->from (for
 * call edges, "who breaks if this fails"), `both` ignores direction. */
export type BlastDirection = "out" | "in" | "both";

/** One reached node: hops from the nearest start, and the node it was reached
 * from (null for a start). */
export interface BlastHit {
  id: string;
  depth: number;
  via: string | null;
}

function ends(e: BlastEdge): [string, string] {
  return Array.isArray(e) ? [e[0], e[1]] : [(e as { from: string }).from, (e as { to: string }).to];
}

/** Every node reachable from `start` (one id or several) along `edges`, with
 * its hop depth, in breadth-first order (starts first, at depth 0). Cycles
 * are safe; `maxDepth` stops the walk early. */
export function blastRadius(
  edges: readonly BlastEdge[],
  start: string | readonly string[],
  direction: BlastDirection = "out",
  opts: { maxDepth?: number } = {},
): BlastHit[] {
  const maxDepth = opts.maxDepth ?? Infinity;
  const next = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const list = next.get(a);
    if (list) list.push(b);
    else next.set(a, [b]);
  };
  for (const e of edges) {
    const [from, to] = ends(e);
    if (direction !== "in") link(from, to);
    if (direction !== "out") link(to, from);
  }
  const starts = typeof start === "string" ? [start] : start;
  const seen = new Map<string, BlastHit>();
  const order: BlastHit[] = [];
  for (const id of starts) {
    if (seen.has(id)) continue;
    const hit = { id, depth: 0, via: null };
    seen.set(id, hit);
    order.push(hit);
  }
  for (let i = 0; i < order.length; i += 1) {
    const cur = order[i]!;
    if (cur.depth >= maxDepth) continue;
    for (const n of next.get(cur.id) ?? []) {
      if (seen.has(n)) continue;
      const hit = { id: n, depth: cur.depth + 1, via: cur.id };
      seen.set(n, hit);
      order.push(hit);
    }
  }
  return order;
}

/** The same result as a lookup, id -> depth, for colouring nodes. */
export function blastDepths(hits: readonly BlastHit[]): Map<string, number> {
  return new Map(hits.map((h) => [h.id, h.depth]));
}

/** The edges of the shortest-path tree `hits` describes, as [via, id] pairs —
 * the arcs a host lights to show how the blast travelled. */
export function blastPaths(hits: readonly BlastHit[]): [string, string][] {
  return hits.filter((h) => h.via !== null).map((h) => [h.via!, h.id]);
}
