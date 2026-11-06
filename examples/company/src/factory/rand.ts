// Deterministic randomness for the factory demo.
//
// Two flavours, for two reasons: `rng` is a stream for simulations that step
// (the pipeline), and `noise` is a pure hash of its inputs so anything that is
// a function of time (agents, infra, metrics, history) can be evaluated at any
// tick in any order and still agree with itself — which is what makes
// timeline scrubbing and screenshots repeatable.

/** A linear-congruential stream in [0, 1). Same seed, same story. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** A stateless hash of integers to [0, 1). */
export function noise(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h = Math.imul(h ^ (p | 0), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  return (h >>> 0) / 2 ** 32;
}

/** A stable integer for a string, so names can seed `noise`. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
