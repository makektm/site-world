// Standing and crouching in walk mode (WalkPhysics.tsx), and how fast each
// walks. Left Shift crouches. On the ground the feet stay where they are and
// the head — the top of the capsule, and the camera with it — drops from EYE
// to CROUCH_EYE. In the air it is the other way round: the head, and the view,
// stay put and the legs are drawn up, so a jump with Shift held tucks the feet
// rather than dropping the camera. Letting go stands back up, but only where
// there is room (above the head on the ground, below the feet in the air): in
// a low space the walker stays low rather than being pushed into the floor.
import type { Capsule } from "three/addons/math/Capsule.js";
import type { Octree } from "three/addons/math/Octree.js";
import { EYE, PLAYER_RADIUS } from "../core/engine";

export const WALK_SPEED = 3.6;
export const CROUCH_SPEED = 1.8;
/** Eye height crouched. The capsule's crown is this plus PLAYER_RADIUS: 1.35m. */
export const CROUCH_EYE = 1.0;
/** maath `damp` smooth time for the head going down and coming back up. */
export const CROUCH_EASE_S = 0.08;

/** Whether the walker is low enough to count as crouched: Shift held, or
 * still too low to have finished standing (or held down by a ceiling). */
export function isCrouched(held: boolean, eye: number): boolean {
  return held || eye < EYE - 0.05;
}

/** Whether nothing solid is above the walker's head, up to the crown of the
 * standing capsule. `probe` is scratch space, so a frame allocates nothing:
 * the part of the standing capsule that is above the head now. Only a hit
 * from above counts — a wall alongside would push the walker sideways, which
 * the collision pass resolves on its own. */
export function hasHeadroom(octree: Octree, capsule: Capsule, probe: Capsule): boolean {
  probe.start.copy(capsule.end);
  probe.end.set(capsule.end.x, capsule.start.y + EYE - PLAYER_RADIUS, capsule.end.z);
  const hit = octree.capsuleIntersect(probe);
  return !hit || hit.normal.y > -0.5;
}

/** Whether nothing solid is below the feet, down to where the legs would end
 * at full length (the head staying where it is). The mirror of `hasHeadroom`
 * for a walker in the air: only a hit from below counts, since a wall alongside
 * does not stop the legs lengthening. */
export function hasLegRoom(octree: Octree, capsule: Capsule, probe: Capsule): boolean {
  probe.start.copy(capsule.start);
  probe.end.set(capsule.start.x, capsule.end.y - (EYE - PLAYER_RADIUS), capsule.start.z);
  const hit = octree.capsuleIntersect(probe);
  return !hit || hit.normal.y < 0.5;
}

/** Sets the capsule's length from the eased eye height. On the ground the feet
 * stay put and the head moves; in the air the head stays put and the feet are
 * drawn up (or let back down). */
export function setStance(capsule: Capsule, eye: number, grounded: boolean): void {
  const length = eye - PLAYER_RADIUS;
  if (grounded) capsule.end.y = capsule.start.y + length;
  else capsule.start.y = capsule.end.y - length;
}

/** The eye height to ease toward this frame. `room` — head-room on the ground,
 * leg room in the air — is only asked when the walker is low and wants to
 * stand, since it queries the Octree. */
export function eyeTarget(crouchHeld: boolean, eye: number, room: () => boolean): number {
  if (crouchHeld) return CROUCH_EYE;
  if (eye >= EYE - 0.001) return EYE;
  return room() ? EYE : eye;
}
