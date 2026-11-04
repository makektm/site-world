// Level of detail for a plan with hundreds of pylons: a room far from the
// camera does not need its labels, glow sprites and traffic, only its outline
// and a count. The host decides what each level draws; this only says which
// level a room is at, so every room in every host draws the same way at the
// same distance.
import type { FloorRect } from "./catalogLayout";

/** "detail": everything. "room": the room as a block with a summary. "campus": the building as a block. */
export type Lod = "campus" | "room" | "detail";

/** Floor distances (metres) under which a thing is drawn at "detail", then "room". */
export interface LodThresholds {
  detail: number;
  room: number;
}

/** About one large room across for detail (labels stay readable), two or three for room blocks. */
export const LOD_THRESHOLDS: LodThresholds = { detail: 18, room: 48 };

// A camera parked on a threshold would flip a room's level every frame as it
// drifts by centimetres; leaving a level takes this much further than entering it.
const HYSTERESIS = 0.1;

/** The level for a floor distance; pass the level it has now to keep it from flickering at a threshold. */
export function lodFor(distance: number, thresholds: LodThresholds = LOD_THRESHOLDS, previous?: Lod): Lod {
  const rank = { detail: 0, room: 1, campus: 2 } as const;
  const plain: Lod = distance < thresholds.detail ? "detail" : distance < thresholds.room ? "room" : "campus";
  if (previous === undefined || previous === plain) return plain;
  // Only a move toward less detail is held back: zooming in should never wait.
  if (rank[plain] < rank[previous]) return plain;
  const held = previous === "detail" ? thresholds.detail : thresholds.room;
  return distance < held * (1 + HYSTERESIS) ? previous : plain;
}

/** Floor distance from a point to the nearest edge of a rect; 0 inside it. */
export function distanceToRect(x: number, z: number, r: FloorRect): number {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}

/** `lodFor` the distance from a viewer's floor position (or a camera's 3D one, height included) to a room. */
export function lodForRect(
  viewer: { x: number; z: number; y?: number },
  rect: FloorRect,
  thresholds: LodThresholds = LOD_THRESHOLDS,
  previous?: Lod,
): Lod {
  // An orbit camera high over a room is as far from its pylons as one beside it.
  const d = Math.hypot(distanceToRect(viewer.x, viewer.z, rect), viewer.y ?? 0);
  return lodFor(d, thresholds, previous);
}
