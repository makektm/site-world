# AGENTS.md — read this first

`site-world` is a React Three Fiber library: a walkable 3D "operations room" viewport.
This file is the map for any agent (or human) changing the repo. It is short on purpose.

## Commands (run from the repo root)

```bash
bun install
bun run typecheck      # tsc over src/ and scripts/
bun run test           # vitest (jsdom). Includes the boundary test and the docs-are-current test
bun run check          # typecheck (src, scripts, example) + test
bun run example        # hot-reloading demo (examples/basic)
bun run reference      # (uses node) regenerate docs/REFERENCE.md from the code (CI fails if it is stale)
bun run screenshot     # (uses node + Playwright) regenerate media/*.png, the README images, from the example
```

Never run a bare binary; use the scripts so config and caching apply.

## Where things live

```
src/index.ts          the ONLY public surface. Every module is re-exported here.
src/core/             engine constants + helpers, the SiteRoom contract (room.ts),
                      terminal slot (terminals.ts), keys/hotkeys, canvas textures, PointProximity
src/doors/            door data (door.ts), leaves/frames/signs, collider boxes, walk-up triggers
src/walk/             WalkRig: capsule physics on an octree; stance (crouch) math
src/screens/          ConsoleRig (screen projected onto 3D glass), Plinth, WallScreen, wall tags, prompts
src/camera/           orbit math
src/world/            SiteWorld (the viewport) and WorldParts (GridFloor, WallBoxes, solids)
src/doom/             the optional demon game: rules, nav, hunt AI, store, 3D bodies, HUD
examples/basic/       a toy world using only the public API — keep it compiling and small
docs/                 ARCHITECTURE, GUIDE-*, REFERENCE (generated)
```

## Rules that are tested (you cannot break them quietly)

1. **The package imports nothing it does not own.** `src/boundary.test.ts`: relative imports stay in
   `src/`; non-relative imports must be react / three / @react-three/* / maath. A host's world (layout,
   rooms, data) is passed in as arguments — never imported.
2. **Everything is exported from `src/index.ts`.** The same test fails if a module is missing from it.
3. **`docs/REFERENCE.md` is generated.** `scripts/docs.test.ts` fails when it is stale: run `bun run reference`.

## Conventions

- One concept per file; no barrel files except `src/index.ts`.
- Prefer derived state and handlers. `useEffect` is for subscriptions (keyboard, resize) and for syncing
  imperative three.js objects (camera, octree) — not for deriving React state.
- A **room** is a module that calls `defineRoom` (src/core/room.ts). Hosts compose rooms; the viewport
  never names one. Adding a room must not require editing `SiteWorld`.
- Data in, behaviour out: doors, signs, solids, cameras, the Doom floor plan are all *props*.
- Coordinates are metres, y up. A wall is `{ pos, size }` with `pos` its centre. `WALL` is the wall
  height, `DOOR_H` the door height, `EYE` the eye height (see `src/core/engine.ts`).
- Comments say *why* (a measured bug, a constraint), not what. Keep them true when you change code.
- Keep `examples/basic` and the guides in step with the API you change.

## Doing a change

1. Read the guide closest to your task (`docs/GUIDE-*.md`) and `docs/ARCHITECTURE.md`.
2. Change code, add or adjust a test next to it (`*.test.ts` beside the module).
3. `bun run reference` if exports changed; `bun run check`.
4. Commit with a message that says what and why, in one short paragraph.

## Gotchas

- SiteWorld is **two React trees**: the three.js canvas and the DOM beside it. Hooks and context do not
  cross; that is why a room has `useModel` (DOM side) + `Scene` (canvas side) + `Overlay` (DOM side).
- A terminal's screen is a DOM element warped onto 3D glass each frame; its content must be
  `CONSOLE_PX_W x CONSOLE_PX_H` and it must live inside the `.sw-screen` div that the rig drives.
- three's `Octree` has no incremental update. Static solids rebuild only when their React element
  identity changes — memoise what you pass as `solids`. Door boxes live in a separate tiny octree.
- WebGPU renderer cannot compile the line materials drei's `Grid` uses; SiteWorld forces `WebGLRenderer`.
- `reduce` (prefers-reduced-motion) disables walk mode in hosts; the library does not decide that for you.
