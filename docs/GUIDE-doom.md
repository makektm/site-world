# Guide: the demon game

Optional. Without `doomSwitchAt`, none of it mounts.

```ts
configureDoom(roomDoomConfig(bounds, walls));      // once, at module load, before first render
<SiteWorld doomSwitchAt={{ x: 3, y: 1.4, wallZ: -6 }} … />
```

`doomSwitchAt` is where the switch hangs: `x`, height `y`, and the wall's centre-line `wallZ`
(it stands `PANEL_STANDOFF` in front, facing into the room). In walk mode, walk up and press **E**.

## A bigger world

`roomDoomConfig` covers one rectangle. For several rooms build a `DoomConfig` yourself:

- `nav`: `buildNav(cells, links, blockers, sight)` — walkable rectangles (`NavCellSpec`), the links
  between cells that share an edge, and the boxes that block bodies and sight. It throws on a mistyped
  link, so a bad plan fails at load.
- `walls`: boxes a round stops against. `ceiling`, `eye`.
- `rifts`: summoning points `[x, z]` per zone (`"main"`, `"undercroft"`).

Demons walk only what is on the nav; they press at doorways but never come through rooms you left off.
Best score persists in `localStorage` (`site.doom.best`) when available.

## Removing it

Delete the `configureDoom` call and the `doomSwitchAt` prop. Tree-shaking drops the rest.
