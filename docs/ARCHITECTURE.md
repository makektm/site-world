# Architecture

## The shape

```
host app ──renders──▶ <SiteWorld rooms doors solids camera …>{scene children}</SiteWorld>
                          │
        ┌─────────────────┼────────────────────────────────────────────┐
   canvas tree (three.js)                         DOM tree (React)
   CameraRig · doors · scene children             useModel() per room  ──▶ model
   room.Scene({model, env}) ◀─────────────────────────────────────────── model
   WalkRig (octree physics) · Orbit/Fly rigs      room.Overlay({model, env})  ← terminal screens
   DoomRig                                         sw-screen-layer
```

`<SiteWorld>` is the only thing a host mounts. Everything else is data or a child.

## Two React trees, one model

The three.js canvas is a separate React reconciler from the DOM. Hooks and context do not cross it,
and a terminal's screen must be a real DOM element (inputs, focus, text selection). So a **room** is
four functions over one model:

| Function | Runs in | Does |
| --- | --- | --- |
| `useModel(env)` | DOM tree (inside `<SiteWorld>`) | fetches/derives; the only place hooks for the room's data live |
| `Scene({model, env})` | canvas | draws the plinth, boards, props; mounts the `ConsoleRig` |
| `Overlay({model, env})` | DOM, beside the canvas | the screen's contents, in a `.sw-screen` div |
| `Colliders()` | canvas, into the octree | invisible solids (a plinth) |

`SiteWorld` calls every room's `useModel` in list order each render. The list is a module constant, so
hook order is stable — do not pass a list that changes between renders.

## Terminals: one slot

All terminals of all rooms share one `activeId` (`core/terminals.ts`). Powering one closes the others
by construction, so a room never names another room. Per terminal the slot tracks `on` (powered),
`rig` (the 3D screen still exists — it outlives `on` so the screen collapses to a line before it
unmounts), `near`, `focus` (a token, bump = take the keyboard) and `anchor` (the line the orbit click
came from, for the fly-in).

**Walking up never powers a terminal.** Proximity only sets `near`; **E** (walk) or a click (orbit)
powers it; walking out of range closes it. A screen that lights up unbidden steals the keyboard from
someone who was only passing.

## Doors

A door is data (`SiteDoor`): `{ id, code, doorway: { center, axis, halfWidth }, kind }`. From a list of
them the engine draws leaves and frames, runs one walk-up trigger each, and adds a collider box across
each *closed* door's gap to a separate small octree (three's `Octree` has no incremental update, so a
door toggle must not rebuild the static world). The wall above a door is yours: put a header box of
height `WALL - DOOR_H` over the gap in your walls so a closed door meets it.

## Walk physics

`WalkRig` (walk/WalkPhysics.tsx) moves a capsule against an octree built from `solids`, `cylinders`
(round solids) and each room's `Colliders`. Numbers (gravity, jump impulse, coyote time, jump buffer,
eye height, crouch) live in `core/engine.ts` and `walk/walkStance.ts`. `KILL_PLANE_Y` respawns a faller
at the last checkpoint (`checkpoint` prop).

## Screens

`ConsoleRig` places a mast with glass in front of a plinth and, each frame, projects the DOM screen's
four corners through the camera to a CSS matrix (`screens/screenWarp.ts`), so the DOM *is* the glass.
That is why the content is a fixed `CONSOLE_PX_W x CONSOLE_PX_H` and why the layer must be a sibling of
the canvas: a click on glass must not reach the pointer lock or orbit controls.

## Boundaries (enforced by `src/boundary.test.ts`)

`src/` imports react, three, @react-three/fiber, @react-three/drei, maath and itself. No host
concepts: a world is built from props. If you need something from the host, add a prop or a callback.

## Doom

Optional. `configureDoom(config)` builds the one game; `<SiteWorld doomSwitchAt>` mounts its rig and
HUD. The config is a floor plan (`buildNav`), wall boxes, rift points and eye height; `roomDoomConfig`
makes one for a single rectangular room. See [GUIDE-doom.md](GUIDE-doom.md).
