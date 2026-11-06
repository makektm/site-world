# Guide: the kit (agents, work, infra, interactions)

`src/kit/` is a box of parts for showing a software factory in your world. Every part takes data as
props and draws it; none of them knows your services. `src/layout/` plans the building from a catalogue.
`examples/company` uses all of it — read `App.tsx` and `FactoryScene.tsx` there for the wiring.

## Plan the building from a catalogue

```ts
const plan = layoutCatalog({ domains, services }, { entrances: true, wings: [{ id: "hall", label: "HALL", side: "north", width: 30, depth: 12 }] });
// plan.walls, plan.doors, plan.rooms, plan.slotByName["orders"].pos, plan.wings …
```

One room per domain, one slot per service. Pass `plan.walls` to `<WallBoxes>`/`<WallSolids>` and
`plan.doors` to `<SiteWorld>`. `lodFor` / `lodForRect` pick how much to draw by camera distance.

## What there is to draw

| Want to show | Use |
| --- | --- |
| an agent session at work, walking between services | `<AgentFigure>` (+ `agentPath`, `crowdLayout`) |
| a person in the room | `<PresenceMarker>` |
| work flowing ticket → agent → PR → CI → review → deploy | `<WorkLine>` (belts, stations, crates, a reject bin) |
| databases, queues, third parties | `<Tank>`, `<QueuePipe>`, `<LoadingDock>` |
| cost, a budget, spend across the floor | `<Meter>`, `<FloorHeat>` |
| secrets, notes left in the world | `<Padlock>`, `<StickyNote>` |

## Make things inspectable

```tsx
const SELECTION = createSelectionStore();            // module constant: both React trees read it
<Selectable store={SELECTION} kind="service" id="orders" mode={mode}>…</Selectable>   // in the canvas
<SelectionCrosshair store={SELECTION} enabled={mode === "walk"} />                     // E in walk mode
const sel = useSelection(SELECTION);                                                   // DOM side
<InspectPanel open={!!sel.selected} title=… fields=… actions=… onClose={sel.clear} />  // in `overlay`
```

`blastRadius(calls, id)` lists who breaks if a service fails; draw it however you like.

## Move the camera

Everything that moves the camera hands `<SiteWorld hostGoal>` a goal; the host picks which wins.

- `goalFor(point, { from, distance })` — fly to a point. `<GoToPalette>` is a fuzzy search that reports a pick.
- `standFor(point, { from, distance })` — while walking, where to stand facing a point; hand it to `<SiteWorld walkTo={{ ...spot, seq }}>` with a new `seq` per jump.
- `useFollow(getPoint, on)` — keep the camera on something moving (an agent's `bodyRef`).
- `useTour(stops)` + `<TourCaption>` — a guided walk through a story, arrows and Esc.
- `useTimeline` + `<TimelineScrubber>` — scrub or play back time; you render the moment it shows.

`useLayers(defs)` + `<LayerBar>` toggle what is drawn (traffic, cost, ownership…).

## Keys the kit claims

While mounted: `<GoToPalette>` takes **/** and **Ctrl/Cmd+K**, `<LayerBar>` the digits **1–9**,
`<SelectionCrosshair>` **E** in walk mode. All skip text fields and open dialogs. If your app already
uses one, pass `hotkeys={false}` (or `useKey={false}`) and open or toggle it yourself.

## Rules

- Pass `reduce` through: decorative motion stops, motion that means something (an agent walking) stays.
- Keep host data out of the kit: new parts take props, like the rest of `src/`.
