# Guide: add a room

A room is one file that calls `defineRoom`. `examples/basic/src/notesRoom.tsx` is the template.

```tsx
export const myRoom = defineRoom({
  id: "my-room",
  terminals: [{ id: "my-terminal", stand: [x, z], flyOffset: 0.46 }],
  useModel(env) { /* hooks + data → model */ },
  Scene({ model, env }) { /* inside the canvas */ },
  Overlay({ model, env }) { /* DOM beside the canvas: the screen */ },
  Colliders: () => <mesh …/>,                 // optional walk solids
  prompt: (model, env) => "NOTES" | null,      // optional "[E] …" text
});
```

Then add it to the `rooms` list you pass `<SiteWorld>`. Nothing else changes. Two rules: the `rooms` list must
be a **module constant** (hooks run per room in list order), and every terminal `id` must be unique across
all rooms (`terminals.get(id)` throws on an unknown id).

## Checklist for a terminal

1. `terminals: [{ id, stand, flyOffset? }]` — `stand` is the plinth (the orbit fly-in faces from it);
   `flyOffset` makes the orbit camera fly in to the screen.
2. In `Scene`: `<Plinth at onActivate>`; `<PointProximity enabled point onNear>` (walk-up);
   and the screen, with its full prop list:
   ```tsx
   {term.rig && (
     <ConsoleRig px={x} pz={z} offset={0.46} anchor={term.anchor} mode={env.mode} reduce={env.reduce}
       powered={term.on} screen={term.screenRef} onPoweredOff={() => term.setRig(false)} />
   )}
   ```
   (`px`/`pz` are the plinth; `offset` how far in front of it the screen stands.)
   Pass `onActivate` only in orbit mode (`env.mode !== "walk"`).
3. In `Overlay`: `<div className="sw-screen" ref={term.screenRef} style={{visibility:"hidden"}}>`
   containing a `CONSOLE_PX_W x CONSOLE_PX_H` element while `term.rig`. Use `term.on ? term.focus : 0` as
   a focus token for your input, and `term.onExit` for Esc.
4. In `Colliders`: a box the size of the plinth, so no one walks through it.
5. `prompt`: `term.near && !term.on ? "LABEL" : null`.

## Boards on walls

Draw a canvas texture with `useCanvasTexture(w, h)` onto a plane hung `PANEL_STANDOFF` in front of a
wall (`hungOnWall(wallPoint, rotationY)`). `WallScreen` is a wall-mounted *interactive* screen
(a terminal without a plinth).

## Data

Fetch in `useModel` (it is in the DOM tree, so your query client and contexts are available there and
in `Overlay`). Return plain data; `Scene` gets it as `model`. Do not use `useEffect` for derived data.
