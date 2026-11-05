// What a site-world door is, as data. The list of a world's doors is the
// host's; the engine (Doors.tsx, DoorColliders) reads any list of these. A door opens when a walker is within reach of the middle of its gap
// (`doorway.center`).
import type { Doorway } from "../core/engine";

/** A door as data: id, three-letter code, the doorway (centre, axis, half-width) and how it opens. */
export type SiteDoor = {
  id: string;
  /** The short stencil on the steel frame's ID plate (the plain style draws no frame, so no code). */
  code: string;
  doorway: Doorway;
  /** `slide`: one leaf rolls up into the header. `biparting`: two panels
   * slide sideways into the flanking walls. Collision is the same either
   * way — a box across the full gap — so this is purely the leaf's look. */
  kind: "slide" | "biparting";
};

/** door id -> open. */
export type DoorsOpen = Readonly<Record<string, boolean>>;

export const allClosed = (doors: readonly SiteDoor[]): DoorsOpen =>
  Object.fromEntries(doors.map((d) => [d.id, false]));
