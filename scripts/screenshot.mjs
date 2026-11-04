// Regenerates the README's images from examples/company: builds it, serves
// it, and photographs it in headless Chromium —
//   media/overview.png  the building from the orbit camera's home
//   media/terminal.png  the on-call console, after a click on its plinth
//                       has flown the camera in and powered the screen
//   media/walk.png      first person, from the walk-mode start
//
//   bun run screenshot
//
// Needs Playwright with its Chromium (`bunx playwright install chromium` if
// it is missing). Not part of `check`: a GPU-less CI renders WebGL through
// SwiftShader, which works but is slow, and the images only change when the
// look does.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PerspectiveCamera, Vector3 } from "three";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLE = path.join(ROOT, "examples/company");
const MEDIA = path.join(ROOT, "media");
const PORT = 4319;
const URL = `http://localhost:${PORT}/`;
// CSS pixels; written at 2x for high-density screens.
const VIEW = { width: 1200, height: 700 };
// Copied from examples/company (App.tsx CAMERA, oncallRoom.tsx ONCALL_PLINTH)
// to find the plinth on screen. If they drift, the powered-screen check below
// fails the run instead of writing a dark shot.
const HOME = [3, 21, 17];
const TARGET = [0, 0, 0.5];
const PLINTH = [-2.2, 0.8, -8];
const FOV = 40; // SiteWorld's

let chromium;
try {
  // require, not import: a globally installed Playwright is found through
  // NODE_PATH, which ESM resolution ignores.
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  console.error("playwright is not installed: bun add -d playwright && bunx playwright install chromium");
  process.exit(1);
}

/** Where a world point lands on screen from the orbit home. */
function onScreen([x, y, z]) {
  const cam = new PerspectiveCamera(FOV, VIEW.width / VIEW.height, 0.08, 90);
  cam.position.set(...HOME);
  cam.lookAt(...TARGET);
  cam.updateMatrixWorld();
  const v = new Vector3(x, y, z).project(cam);
  return { x: ((v.x + 1) / 2) * VIEW.width, y: ((1 - v.y) / 2) * VIEW.height };
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
  await page.waitForTimeout(2500);
  // The demo's mode buttons are page chrome, not the library: keep them out of the shots.
  await page.addStyleTag({ content: ".bar { visibility: hidden !important; }" });
  mkdirSync(MEDIA, { recursive: true });
  await page.screenshot({ path: path.join(MEDIA, "overview.png") });

  // Power the on-call terminal: a click on its plinth flies the camera in.
  const at = onScreen(PLINTH);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(2500);
  const powered = await page.$$eval(".sw-screen", (els) => els.some((el) => getComputedStyle(el).visibility === "visible"));
  if (!powered) throw new Error(`no terminal powered: the click at ${Math.round(at.x)},${Math.round(at.y)} missed the plinth`);
  await page.screenshot({ path: path.join(MEDIA, "terminal.png") });

  // The bar is hidden, and a hidden button takes no pointer clicks.
  await page.$$eval(".bar button", (bs) => bs.find((b) => b.textContent === "walk")?.click());
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(MEDIA, "walk.png") });

  await browser.close();
  if (errors.length) {
    console.error("page errors:\n" + errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("wrote media/overview.png, media/terminal.png and media/walk.png");
  }
} finally {
  stop();
}
