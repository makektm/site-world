import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    // A suite that silently runs nothing is a failure, not a pass.
    passWithNoTests: false,
    restoreMocks: true,
  },
});
