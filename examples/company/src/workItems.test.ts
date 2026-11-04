import { describe, expect, it } from "vitest";
import { initialPipeline, pipelineAt, STAGES } from "./factory/pipeline";
import { STATIONS, crateLabel, rejectId, workLineItems } from "./workItems";

describe("workLineItems", () => {
  it("has one station per pipeline stage, in order", () => {
    expect(STATIONS.map((s) => s.id)).toEqual([...STAGES]);
  });

  it("lists every item, oldest first, with its stage index", () => {
    const p = initialPipeline();
    const items = workLineItems(p);
    expect(items).toHaveLength(p.items.length);
    const review = items.filter((i) => i.stage === STAGES.indexOf("review"));
    expect(review.every((i) => i.status === "waiting-review")).toBe(true);
    // Oldest first: review ages were seeded rising, so the pile comes out reversed.
    const ages = items.map((i) => p.items.find((x) => x.id === i.id)!.age);
    expect([...ages].sort((a, b) => b - a)).toEqual(ages);
  });

  it("keeps a shipped item for its ship ticks, marked deployed", () => {
    let tick = 1;
    while (pipelineAt(tick).deploys.length === 0) tick += 1;
    const p = pipelineAt(tick);
    const shipped = p.deploys.filter((d) => d.tick === tick);
    const items = workLineItems(p);
    for (const d of shipped) expect(items.find((i) => i.id === d.id)?.status).toBe("deployed");
    expect(workLineItems(pipelineAt(tick + 2)).some((i) => shipped.some((d) => d.id === i.id))).toBe(false);
  });

  it("puts one failed crate in the bin per CI rejection still in flight", () => {
    const p = initialPipeline();
    const item = { ...p.items[0]!, rejections: 2 };
    const items = workLineItems({ ...p, items: [item] });
    expect(items.filter((i) => i.status === "failed").map((i) => i.id)).toEqual([rejectId(item.id, 1), rejectId(item.id, 2)]);
  });

  it("labels crates with the PR number", () => {
    expect(crateLabel("PR #1412")).toBe("#1412");
    expect(crateLabel("x")).toBe("x");
  });
});
