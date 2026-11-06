# Guide: add a door

```ts
const DOORS: SiteDoor[] = [
  { id: "annex", code: "ANX", doorway: { center: [0, 6], axis: "x", halfWidth: 1.5 }, kind: "slide" },
];
```

- `center` is the middle of the gap, on the wall's centre-line. `axis` is the direction the gap *runs*
  ("x": a gap in a north/south wall). `halfWidth` is half the gap.
- `kind: "slide"` — one leaf rolls up into the header. `"biparting"` — two panels slide into the flanking walls.
- `code` is the three-letter stencil on the steel frame's ID plate (the plain style has no frame, so does not draw it).

Pass `doors={DOORS}` to `<SiteWorld>`. The leaf, frame, walk-up trigger and collider come for free.

## Steel or plain

`<SiteWorld doorStyle>` picks how every door looks. `"steel"` (the default) is the brushed-metal door: grain
textures, hazard stripes, an ID plate, bolts, and a lit environment that `SiteWorld` mounts for it. `"plain"` is a
flat PAPER slab with no frame, in the same unlit material as your walls: no textures, no lights, far less to
draw. Opening, the walk-up trigger and the collider are identical, so switching the style never changes where a
walker can go. `SlidingDoor`, `BiPartingDoor` and `SiteDoorLeaves` take the same `doorStyle` if you draw doors yourself.

## Your walls must leave the gap

The doorway is a *hole you cut in your own walls*. Split the wall into two boxes around the gap, and put a
header box over it: `{ pos: [cx, DOOR_H + (WALL - DOOR_H) / 2, cz], size: [halfWidth * 2, WALL - DOOR_H, 0.2] }`.
A closed door's collider is `DOOR_H` tall, so it meets the header exactly.

## Make the gap as wide as the room behind it

A doorway narrower than the room it leads to leaves a jamb a walker can snag on at the edge of the gap.

## A name over the door

`doorSigns={[…DoorSignSpec]}` hangs a banner on the header (see `DoorSignSpec`).
