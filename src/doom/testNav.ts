// A one-room floor plan for the game's tests: a single cell walled on all
// four sides, the way a plain room is. Test-only — nothing in the app
// imports it.
import type { NavCellSpec } from "../core/engine";
import { buildNav, type Nav, type Rect } from "./doomNav";

const T = 0.1; // half a wall's thickness

export function wallsAround(minX: number, maxX: number, minZ: number, maxZ: number): Rect[] {
  return [
    { minX: minX - T, maxX: maxX + T, minZ: minZ - T, maxZ: minZ + T },
    { minX: minX - T, maxX: maxX + T, minZ: maxZ - T, maxZ: maxZ + T },
    { minX: minX - T, maxX: minX + T, minZ: minZ - T, maxZ: maxZ + T },
    { minX: maxX - T, maxX: maxX + T, minZ: minZ - T, maxZ: maxZ + T },
  ];
}

export function roomNav(minX: number, maxX: number, minZ: number, maxZ: number): Nav {
  const room: NavCellSpec = { id: "room", zone: "main", minX, maxX, minZ, maxZ, y: 0 };
  const walls = wallsAround(minX, maxX, minZ, maxZ);
  return buildNav([room], [], walls, walls);
}
