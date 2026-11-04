# Guide: build a world from nothing

Copy `examples/basic`, then follow along. The files are `layout.ts` (data), `notesRoom.tsx` (a room),
`App.tsx` (composition).

## 1. Layout is data

Coordinates are metres, y up, the floor is y = 0. A wall is a box: `{ pos: [x, y, z], size: [w, h, d] }`
with `pos` the **centre**. Use `WALL` (4.2) for wall height so doors, signs and the ceiling agree.

```ts
const WALLS: WallSegment[] = [
  { pos: [0, WALL / 2, -6], size: [12, WALL, 0.2] },   // north wall of a 12 x 12 room
  // …
];
```

## 2. Draw it, and make it solid

```tsx
<SiteWorld … solids={<><FloorSolid {...bounds} /><WallSolids walls={WALLS} /></>}>
  <GridFloor {...bounds} />
  <WallBoxes walls={WALLS} />
</SiteWorld>
```

`solids` is what the walker collides with. **Memoise it** (`useMemo`) — as with `rooms`, `doors` and `cylinders`, keep identities stable: the octree rebuilds when its
element identity changes. `WallBoxes` and `WallSolids` take the same list, so what you see is what you hit.

## 3. Cameras

`SiteCamera` has four fields (pass a module constant or memoise it): orbit `home` and `target`, and the walker's `walkStart` `[x, z]` and
`walkLookAt`. `mode` ("orbit" | "walk") is yours to own: render your own toggle.

## 4. Add rooms and doors

[GUIDE-add-a-room.md](GUIDE-add-a-room.md), [GUIDE-add-a-door.md](GUIDE-add-a-door.md).

## 5. The host contract

`cameraRef` — give `<SiteWorld>` a `useRef({x, z})`; it writes the camera floor position into it every
frame so your DOM-side code can read it without re-rendering.
`onOpenPage(to)` — what a terminal calls to send the user somewhere in your app.
`consoleId` / `onConsoleExit` — only if you run your own console (not a room terminal) that must
close terminals when it opens.
`hostGoal` / `hostPrompt` — an orbit fly-in and an "[E] …" prompt for that same console.
