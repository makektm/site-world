// Fuzzy matching for the go-to palette: a subsequence match, scored so that a
// prefix beats a hit at a word start, which beats a hit mid-word, which beats
// scattered letters. Pure, so ranking is tested rather than eyeballed.

/** A score for `query` against `text` (higher is better), or null when the
 * query's characters do not all appear in order. Case-insensitive; spaces in
 * the query are ignored. */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return 0;
  const t = text.toLowerCase();
  const exact = t.indexOf(q);
  if (exact === 0) return 1000 - t.length;
  if (exact > 0) {
    const atWord = /[\s\-_./:]/.test(t[exact - 1]!);
    return (atWord ? 800 : 600) - exact - t.length * 0.1;
  }
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (const ch of q) {
    const at = t.indexOf(ch, ti);
    if (at < 0) return null;
    // Runs and word starts are what a person types from memory.
    if (at === prev + 1) score += 6;
    if (at === 0 || /[\s\-_./:]/.test(t[at - 1]!)) score += 8;
    score -= Math.min(at - ti, 10);
    prev = at;
    ti = at + 1;
  }
  return score - t.length * 0.1;
}

/** Anything the palette can search: a label, and optional extra words. */
export interface Searchable {
  label: string;
  kind?: string;
  keywords?: readonly string[];
}

/** `items` ranked by their best field match, best first; all of them, in
 * their own order, for an empty query. The label counts most. */
export function fuzzySearch<T extends Searchable>(items: readonly T[], query: string, limit = 12): T[] {
  if (!query.trim()) return items.slice(0, limit);
  const scored: { item: T; score: number; i: number }[] = [];
  items.forEach((item, i) => {
    let best = fuzzyScore(query, item.label);
    for (const extra of [item.kind, ...(item.keywords ?? [])]) {
      if (!extra) continue;
      const s = fuzzyScore(query, extra);
      if (s !== null && (best === null || s - 50 > best)) best = s - 50;
    }
    if (best !== null) scored.push({ item, score: best, i });
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, limit).map((s) => s.item);
}
