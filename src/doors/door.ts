// What a SITE door is, as data. The list of this world's doors is
// worldDoors.ts; the engine (SiteDoors.tsx, DoorColliders) reads any list of
// these. A door opens when a walker is within reach of the middle of its gap
// (`doorway.center`).
import type { Doorway } from "../core/engine";

export type SiteDoor = {
  id: string;
  /** The short stencil on the frame's ID plate. */
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
