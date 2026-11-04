import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Example tests import the library the way the examples do; vite resolves
  // the bare name through each example's own config, vitest needs it here.
  resolve: { alias: { "site-world": fileURLToPath(new URL("./src/index.ts", import.meta.url)) } },
  test: {
    environment: "jsdom",
    // Examples may carry tests for their own pure data helpers; the glob is
    // separate so it never changes which library tests run.
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts", "examples/*/src/**/*.test.ts"],
    // A suite that silently runs nothing is a failure, not a pass.
    passWithNoTests: false,
    restoreMocks: true,
  },
});
