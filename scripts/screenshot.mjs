// Regenerates the README's images from examples/company: builds it, serves
// it, and photographs it in headless Chromium —
//   media/overview.png  the building from the orbit camera's home
//   media/overview-full.png  the same, with every layer on (?layers=all)
//   media/factory.png   the factory hall: the work line and its review pile
//   media/inspect.png   a selected service: the inspect panel and its blast radius
//   media/terminal.png  the on-call console, after a click on its plinth
//                       has flown the camera in and powered the screen
//   media/walk.png      first person, from the walk-mode start
//
//   bun run screenshot
//
// The camera is moved the way a person would: the go-to palette ("/", type,
// Enter), so the shots follow the plan when the building changes and no
// world coordinates are copied in here.
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLE = path.join(ROOT, "examples/company");
const MEDIA = path.join(ROOT, "media");
const PORT = 4319;
const URL = `http://localhost:${PORT}/`;
// CSS pixels; written at 2x for high-density screens.
const VIEW = { width: 1200, height: 700 };
let chromium;
try {
  // require, not import: a globally installed Playwright is found through
  // NODE_PATH, which ESM resolution ignores.
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  console.error("playwright is not installed: bun add -d playwright && bunx playwright install chromium");
  process.exit(1);
}

/** Back to the orbit home, so the next go-to approaches from the front door
 * (go-to keeps the direction the camera came from). */
async function home(page) {
  await page.$$eval(".bar button", (bs) => bs.find((b) => b.textContent === "home")?.click());
  await page.waitForTimeout(2200);
}

/** Fly the camera with the go-to palette, as a person would. */
async function goTo(page, query, { settle = 2600, zoomOut = 0 } = {}) {
  await page.keyboard.press("Escape");
  await page.mouse.move(VIEW.width / 2, VIEW.height - 4);
  await page.keyboard.press("/");
  await page.waitForSelector(".sw-goto input");
  await page.keyboard.type(query);
  await page.waitForTimeout(150);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(settle);
  // The palette frames for a person standing close; a picture wants more of
  // the room round it. A wheel step pulls the orbit camera back.
  if (zoomOut > 0) {
    await page.mouse.move(VIEW.width / 2, VIEW.height / 2);
    for (let i = 0; i < zoomOut; i += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(1500);
  }
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

  // Early, while the people and agents are still about their rooms rather
  // than crowding the front door. The bar is hidden, and a hidden button
  // takes no pointer clicks.
  const modeTo = (m) => page.$$eval(".bar button", (bs, want) => bs.find((b) => b.textContent === want)?.click(), m);
  await modeTo("walk");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(MEDIA, "walk.png") });
  await modeTo("orbit");
  await page.waitForTimeout(2500);

  await goTo(page, "factory hall", { zoomOut: 4 });
  await page.screenshot({ path: path.join(MEDIA, "factory.png") });

  // Selecting a service opens its panel; the blast-radius layer is on by default.
  await home(page);
  await goTo(page, "orders", { zoomOut: 10 });
  if (!(await page.$(".sw-inspect"))) throw new Error("no inspect panel after going to a service");
  await page.screenshot({ path: path.join(MEDIA, "inspect.png") });

  // Power the on-call terminal: it stands in the middle of EDGE, so after
  // flying to the room it is under the screen's centre, and a click on its
  // plinth flies the camera in.
  await page.click(".sw-inspect-close");
  await home(page);
  await goTo(page, "EDGE");
  await page.mouse.click(VIEW.width / 2, VIEW.height / 2);
  await page.waitForTimeout(2500);
  const powered = await page.$$eval(".sw-screen", (els) => els.some((el) => getComputedStyle(el).visibility === "visible"));
  if (!powered) throw new Error("no terminal powered: the click at the screen centre missed the plinth");
  await page.screenshot({ path: path.join(MEDIA, "terminal.png") });

  // The full picture: every layer on, from the orbit home.
  await page.goto(`${URL}?layers=all`);
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: ".bar { visibility: hidden !important; }" });
  await page.screenshot({ path: path.join(MEDIA, "overview-full.png") });

  await browser.close();
  if (errors.length) {
    console.error("page errors:\n" + errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("wrote media/overview.png, overview-full.png, factory.png, inspect.png, terminal.png and walk.png");
  }
} finally {
  stop();
}
