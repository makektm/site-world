// The package imports nothing it does not own. Every non-relative import must
// be on ALLOWED, and every relative import must stay inside src/. This is what
// keeps site-world a library: a world (its rooms, layout, data) is
// handed in as arguments, never imported.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.dirname(new URL(import.meta.url).pathname);

// Runtime dependencies are exactly the package's peerDependencies, plus
// three's addons and (in tests only) vitest / testing-library / node builtins.
const ALLOWED = [
  /^react$/,
  /^react\/jsx-runtime$/,
  /^react-dom$/,
  /^three$/,
  /^three\/addons\//,
  /^@react-three\/fiber$/,
  /^@react-three\/drei$/,
  /^maath(\/|$)/,
];
const TEST_ONLY = [/^vitest$/, /^@testing-library\//, /^node:/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const sources = files(SRC).filter((f) => /\.tsx?$/.test(f));

describe("site-world's imports", () => {
  it.each(sources.map((f) => path.relative(SRC, f)))("%s imports only what the package owns", (rel) => {
    const text = readFileSync(path.join(SRC, rel), "utf8");
    const specs = [...text.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]!);
    const isTest = /\.test\.tsx?$|testNav\.ts$/.test(rel);
    const bad = specs.filter((s) => {
      if (s.startsWith(".")) {
        const resolved = path.resolve(path.dirname(path.join(SRC, rel)), s);
        return !resolved.startsWith(SRC + path.sep);
      }
      if (ALLOWED.some((re) => re.test(s))) return false;
      return !(isTest && TEST_ONLY.some((re) => re.test(s)));
    });
    expect(bad).toEqual([]);
  });

  it("has a public entry that exports every module", () => {
    const index = readFileSync(path.join(SRC, "index.ts"), "utf8");
    const modules = sources
      .map((f) => path.relative(SRC, f))
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$|testNav\.ts$|^index\.ts$|\.d\.ts$|boundary/.test(f))
      .map((f) => "./" + f.replace(/\.tsx?$/, ""));
    for (const m of modules) expect(index, `${m} is not exported from index.ts`).toContain(`"${m}"`);
  });
});
