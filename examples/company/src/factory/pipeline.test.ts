import { describe, expect, it } from "vitest";
import { DEPLOY_EVERY, initialPipeline, pipelineAt, reviewPile, stepPipeline } from "./pipeline";

function run(ticks: number) {
  let s = initialPipeline();
  const piles = [reviewPile(s).length];
  for (let i = 0; i < ticks; i += 1) {
    s = stepPipeline(s);
    piles.push(reviewPile(s).length);
  }
  return { s, piles };
}

describe("pipeline", () => {
  it("starts with a visible review pile", () => {
    expect(reviewPile(initialPipeline()).length).toBeGreaterThanOrEqual(10);
  });

  it("piles up at review because people are the bottleneck", () => {
    const { piles } = run(60);
    expect(piles[60]!).toBeGreaterThan(piles[0]!);
    // And it stays the biggest stage.
    const { s } = run(200);
    const counts = new Map<string, number>();
    for (const i of s.items) counts.set(i.stage, (counts.get(i.stage) ?? 0) + 1);
    const review = counts.get("review") ?? 0;
    for (const [stage, n] of counts) if (stage !== "review") expect(review).toBeGreaterThan(n);
  });

  it("stays bounded over a long run", () => {
    const { piles } = run(2000);
    expect(Math.max(...piles)).toBeLessThanOrEqual(31 + 2);
  });

  it("ships in deploy trains with bumped versions", () => {
    const { s } = run(DEPLOY_EVERY * 6);
    expect(s.deploys.length).toBeGreaterThan(0);
    for (const d of s.deploys) expect(d.tick % DEPLOY_EVERY).toBe(0);
    const before = initialPipeline().versions;
    const d = s.deploys[0]!;
    expect(d.version).not.toBe(before[d.service]);
  });

  it("rejects some PRs at CI", () => {
    expect(run(300).s.rejected).toBeGreaterThan(0);
  });

  it("replays to the same state as stepping", () => {
    const { s } = run(250);
    expect(pipelineAt(250)).toEqual(s);
    expect(pipelineAt(120)).toEqual(run(120).s);
  });
});
