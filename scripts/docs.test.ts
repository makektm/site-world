// docs/REFERENCE.md is generated from the code. When an export is added, removed
// or its doc comment changes, run `bun run reference` and commit the result.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — a plain .mjs script with no types
import { render } from "./reference.mjs";

describe("docs/REFERENCE.md", () => {
  it("is current (run `bun run reference`)", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    expect(readFileSync(path.join(root, "docs/REFERENCE.md"), "utf8")).toBe(render());
  });

  // The entry points a newcomer meets first must say what they are.
  it("documents the primary entry points", () => {
    const ref = readFileSync(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "docs/REFERENCE.md"), "utf8");
    const primary = ["SiteWorld", "SiteWorldProps", "SiteCamera", "SiteRoom", "RoomEnv", "defineRoom", "SiteDoor", "Plinth", "PointProximity", "ConsoleRig", "WallScreen", "configureDoom", "roomDoomConfig", "GridFloor", "WallBoxes", "WallSolids"];
    for (const name of primary) {
      const row = ref.split("\n").find((l) => l.startsWith(`| \`${name}\` |`));
      expect(row, `${name} is not in REFERENCE.md`).toBeDefined();
      expect(row!.split("|")[3]!.trim(), `${name} has no doc comment`).not.toBe("");
    }
  });
});
