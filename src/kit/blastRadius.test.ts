// Blast radius is breadth-first: a node's depth is its SHORTEST hop count, a
// cycle cannot loop forever, and direction decides who is hurt.
import { describe, expect, it } from "vitest";
import { blastDepths, blastPaths, blastRadius } from "./blastRadius";

// web -> api -> payments -> ledger, api -> search, ledger -> api (a cycle)
const CALLS = [
  ["web", "api"],
  ["api", "payments"],
  ["payments", "ledger"],
  ["api", "search"],
  { from: "ledger", to: "api" },
] as const;

describe("blastRadius", () => {
  it("follows edges out with hop depth", () => {
    const hits = blastRadius(CALLS, "web", "out");
    expect(Object.fromEntries(blastDepths(hits))).toEqual({ web: 0, api: 1, payments: 2, search: 2, ledger: 3 });
    expect(hits[0]).toEqual({ id: "web", depth: 0, via: null });
  });

  it("walks back along edges for 'in' (who depends on this)", () => {
    const hits = blastRadius(CALLS, "payments", "in");
    expect(Object.fromEntries(blastDepths(hits))).toEqual({ payments: 0, api: 1, web: 2, ledger: 2 });
  });

  it("ignores direction for 'both'", () => {
    const ids = blastRadius([["a", "b"], ["c", "b"]], "a", "both").map((h) => h.id);
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("survives cycles and keeps the shortest depth", () => {
    const hits = blastRadius(CALLS, "ledger", "out");
    expect(blastDepths(hits).get("api")).toBe(1);
    expect(blastDepths(hits).get("payments")).toBe(2);
    expect(hits.map((h) => h.id)).toEqual(["ledger", "api", "payments", "search"]);
  });

  it("stops at maxDepth", () => {
    const ids = blastRadius(CALLS, "web", "out", { maxDepth: 1 }).map((h) => h.id);
    expect(ids).toEqual(["web", "api"]);
  });

  it("takes several starts, all at depth 0", () => {
    const d = blastDepths(blastRadius(CALLS, ["search", "ledger"], "in"));
    expect(d.get("search")).toBe(0);
    expect(d.get("ledger")).toBe(0);
    expect(d.get("api")).toBe(1);
  });

  it("returns just the start for an unknown node", () => {
    expect(blastRadius(CALLS, "ghost")).toEqual([{ id: "ghost", depth: 0, via: null }]);
  });

  it("gives the shortest-path tree's edges", () => {
    expect(blastPaths(blastRadius(CALLS, "web", "out", { maxDepth: 2 }))).toEqual([
      ["web", "api"],
      ["api", "payments"],
      ["api", "search"],
    ]);
  });
});
