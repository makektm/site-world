// docs/REFERENCE.md is generated from the code. When an export is added, removed
// or its doc comment changes, run `bun run reference` and commit the result.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — a plain .mjs script with no types
import { render } from "./reference.mjs";

describe("docs/REFERENCE.md", () => {
  it("is current (run `bun run reference`)", () => {
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    expect(readFileSync(path.join(root, "docs/REFERENCE.md"), "utf8")).toBe(render());
  });
});
