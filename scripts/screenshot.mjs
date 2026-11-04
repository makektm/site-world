// Regenerates the README's images from the example world: builds
// examples/basic, serves it, and photographs it in headless Chromium —
// media/overview.png from the orbit camera's home, then media/terminal.png
// once a click on the plinth has flown the camera in and powered its screen.
//
//   bun run screenshot
//
// Needs Playwright with its Chromium (`bunx playwright install chromium` if
// it is missing). Not part of `check`: a GPU-less CI renders WebGL through
// SwiftShader, which works but is slow, and the image only changes when the
// look does.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLE = path.join(ROOT, "examples/basic");
const MEDIA = path.join(ROOT, "media");
const PORT = 4319;
const URL = `http://localhost:${PORT}/`;
// CSS pixels; written at 2x for high-density screens.
const VIEW = { width: 1200, height: 700 };
// Where the example's notes plinth lands on screen from its orbit home, at VIEW.
const PLINTH_AT = { x: 457, y: 225 };

let chromium;
try {
  // require, not import: a globally installed Playwright is found through
  // NODE_PATH, which ESM resolution ignores.
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  console.error("playwright is not installed: bun add -d playwright && bunx playwright install chromium");
  process.exit(1);
}

const build = spawnSync("bun", ["run", "build"], { cwd: EXAMPLE, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn("bunx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: EXAMPLE, stdio: "ignore" });
const stop = () => server.kill();
process.on("exit", stop);

try {
  for (let i = 0; ; i += 1) {
    try {
      await fetch(URL);
      break;
    } catch {
      if (i > 50) throw new Error(`preview server did not start on ${URL}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1500);
  // The demo's mode buttons are page chrome, not the library: keep them out of the shots.
  await page.addStyleTag({ content: ".bar { display: none !important; }" });
  mkdirSync(MEDIA, { recursive: true });
  await page.screenshot({ path: path.join(MEDIA, "overview.png") });
  // Power the terminal: a click on its plinth flies the camera in and lights the screen.
  await page.mouse.click(PLINTH_AT.x, PLINTH_AT.y);
  await page.waitForTimeout(2500);
  // A camera or layout change moves the plinth; fail rather than ship a shot with the screen dark.
  const powered = await page.$$eval(".sw-screen", (els) => els.some((el) => getComputedStyle(el).visibility === "visible"));
  if (!powered) throw new Error(`no terminal powered: the click at ${PLINTH_AT.x},${PLINTH_AT.y} missed the plinth; update PLINTH_AT`);
  await page.screenshot({ path: path.join(MEDIA, "terminal.png") });
  await browser.close();
  if (errors.length) {
    console.error("page errors:\n" + errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("wrote media/overview.png and media/terminal.png");
  }
} finally {
  stop();
}
