// A ready-made DoomConfig for the common case: one rectangular room with
// walls around it. Anything bigger (several rooms, ramps, cover) builds its own
// config with buildNav — see doomWorld.ts's DoomConfig.
import type { WallSegment } from "../core/engine";
import { EYE, WALL } from "../core/engine";
import { buildNav } from "./doomNav";
import type { DoomConfig } from "./doomWorld";

export interface RoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Demons walk `bounds` and are stopped by `walls`; they rise from eight
 * points just inside the room (corners and wall midpoints). */
export function roomDoomConfig(bounds: RoomBounds, walls: readonly WallSegment[]): DoomConfig {
  const { minX, maxX, minZ, maxZ } = bounds;
  const inset = 1.3;
  const [x0, x1, z0, z1] = [minX + inset, maxX - inset, minZ + inset, maxZ - inset];
  const [cx, cz] = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  const rect = ({ pos, size }: WallSegment) => ({
    minX: pos[0] - size[0] / 2,
    maxX: pos[0] + size[0] / 2,
    minZ: pos[2] - size[2] / 2,
    maxZ: pos[2] + size[2] / 2,
  });
  const blockers = walls.map(rect);
  return {
    nav: buildNav([{ id: "room", zone: "main", ...bounds, y: 0 }], [], blockers, blockers),
    walls,
    ceiling: WALL,
    rifts: {
      main: [[x0, z0], [cx, z0], [x1, z0], [x0, cz], [x1, cz], [x0, z1], [cx, z1], [x1, z1]],
      undercroft: [],
    },
    eye: EYE,
  };
}
