import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// The example imports the library from source, so editing src/ hot-reloads.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "site-world": path.resolve(here, "../../src/index.ts") } },
});
