// Ranking a person can predict: prefix, then word start, then mid-word, then
// scattered letters; no match is no match.
import { describe, expect, it } from "vitest";
import { fuzzyScore, fuzzySearch } from "./fuzzy";

const T = [
  { label: "payments-ledger", kind: "service" },
  { label: "ledger", kind: "database" },
  { label: "old-ledger-sync", kind: "service", keywords: ["legacy"] },
  { label: "checkout", kind: "service" },
  { label: "kafka orders", kind: "queue" },
];

describe("fuzzyScore", () => {
  it("rejects letters out of order", () => {
    expect(fuzzyScore("tuo", "checkout")).toBeNull();
    expect(fuzzyScore("chk", "checkout")).not.toBeNull();
  });

  it("orders prefix > word start > mid-word > scattered", () => {
    const prefix = fuzzyScore("led", "ledger")!;
    const word = fuzzyScore("led", "payments-ledger")!;
    const mid = fuzzyScore("edg", "payments-ledger")!;
    const scattered = fuzzyScore("pld", "payments-ledger")!;
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(scattered);
  });

  it("ignores case and spaces", () => {
    expect(fuzzyScore("Kafka O", "kafka orders")).not.toBeNull();
  });
});

describe("fuzzySearch", () => {
  it("returns everything, in order, for an empty query", () => {
    expect(fuzzySearch(T, "  ").map((t) => t.label)).toEqual(T.map((t) => t.label));
  });

  it("ranks the best label first", () => {
    expect(fuzzySearch(T, "ledger").map((t) => t.label)).toEqual(["ledger", "old-ledger-sync", "payments-ledger"]);
  });

  it("finds by kind and keywords", () => {
    expect(fuzzySearch(T, "queue").map((t) => t.label)).toEqual(["kafka orders"]);
    expect(fuzzySearch(T, "legacy").map((t) => t.label)).toEqual(["old-ledger-sync"]);
  });

  it("limits the list", () => {
    expect(fuzzySearch(T, "e", 2)).toHaveLength(2);
  });
});
