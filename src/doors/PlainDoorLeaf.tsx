// A plain door: one flat slab and nothing else, no frame. Opaque PAPER with an
// <Edges> outline, not the near-invisible fill every other prop in a room uses —
// a door has to read as an actual barrier, so its fill carries the shape and
// the edges only emphasise the silhouette.
//
// Takes the same props as DoorLeaf and, like it, draws into its parent mesh: the
// parent supplies the position and any animation. No texture, no lit material.
import { Edges } from "@react-three/drei";
import { DOOR_H, PAPER } from "../core/engine";

/** The plain door: one flat PAPER slab with an outline, no frame, drawn into its parent mesh. */
export function PlainDoorLeaf({ w, d }: { w: number; d: number }) {
  return (
    <>
      <boxGeometry args={[w, DOOR_H, d]} />
      <meshBasicMaterial color={PAPER} />
      <Edges color={PAPER} />
    </>
  );
}
