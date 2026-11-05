// Sliding doors for the viewport's doorways.
//
// A leaf is DOOR_H tall and stands on the floor; a header (from the
// host's layout) fills the doorway from there up to WALL. Most doorways
// are single vertical roll-ups: the leaf's top stays pinned at DOOR_H and its
// height damps down to a sliver, so it retracts into the header like a
// shutter instead of rising through it. A wide doorway can be bi-parting:
// its two panels slide sideways into the flanking walls.
//
// The visual leaf here and the collider WalkPhysics.tsx builds from
// `open`/`closed` are two separate things kept in sync only by both
// reading the same boolean: three.js's Octree has no incremental update
// (fromGraphNode re-adds every triangle, confirmed against its own docs),
// so collision toggles a small door-only Octree once per open/closed
// transition rather than riding the leaf's own smooth animation.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { damp } from "maath/easing";
import type { Group, Mesh } from "three";
import { DoorFrame } from "./DoorFrame";
import { DoorLeaf } from "./DoorLeaf";
import { PlainDoorLeaf } from "./PlainDoorLeaf";
import { DEFAULT_DOOR_STYLE, type DoorStyle } from "./doorStyle";
import {
  COLLIDER_WALL_T,
  DOOR_H,
} from "../core/engine";


// A leaf is a little thinner than the wall it hangs in: closed it reads flush
// in its doorway with a 0.02m reveal each side, and a panel retracted into a
// flanking wall is hidden inside that wall's box, not coincident with its
// faces.
const LEAF_T = COLLIDER_WALL_T - 0.08;
// How much of its height a rolled-up leaf keeps, hanging under the header.
const ROLLED_UP = 0.03;

/** The components a door style draws with: steel is a frame and a leaf, plain
 * is a flat leaf and no frame (`Frame` is null). Both leaves take the same
 * props (`w`, `d`), so a door picks its parts here and lays them out the same
 * way. Choosing between components, not between hooks, keeps each component's
 * hooks unconditional and the plain parts free of textures. */
export function doorParts(style: DoorStyle) {
  return style === "plain"
    ? { Frame: null, Leaf: PlainDoorLeaf }
    : { Frame: DoorFrame, Leaf: DoorLeaf };
}

/** The visual leaf: `axis` is which way the doorway gap runs — "x" for a
 * doorway in a north/south wall, "z" for one in an east/west wall. The leaf hangs
 * from a group at DOOR_H, so scaling the group's y scales the leaf toward its
 * top: `damp` (maath, an explicit dependency) eases that scale toward
 * whichever target `open` currently names, redirecting smoothly if it flips
 * again mid-roll — the same reason FlyRig's one-shot camera flight uses a
 * duration-based tween instead: a door toggles back and forth, a camera
 * flight doesn't. */
export function SlidingDoor({
  open, center, axis, halfWidth, code, doorStyle = DEFAULT_DOOR_STYLE,
}: {
  /** The short stencil on the frame's ID plate (steel style only). */
  code: string;
  open: boolean;
  center: readonly [number, number];
  axis: "x" | "z";
  halfWidth: number;
  doorStyle?: DoorStyle;
}) {
  const { Frame, Leaf } = doorParts(doorStyle);
  const ref = useRef<Group>(null);
  useFrame((_, delta) => {
    if (!ref.current) return;
    damp(ref.current.scale, "y", open ? ROLLED_UP : 1, 0.22, delta);
  });
  const w = axis === "x" ? halfWidth * 2 : LEAF_T;
  const d = axis === "z" ? halfWidth * 2 : LEAF_T;
  return (
    <>
      {Frame && <Frame center={center} axis={axis} halfWidth={halfWidth} open={open} code={code} />}
      <group ref={ref} position={[center[0], DOOR_H, center[1]]}>
        <mesh position={[0, -DOOR_H / 2, 0]}>
          <Leaf w={w} d={d} />
        </mesh>
      </group>
    </>
  );
}

/** A center-opening pair for a wide doorway: two panels, each
 * `halfWidth` wide (not `halfWidth * 2` — together they cover the same
 * full gap the single-leaf SlidingDoor above spans), meeting at `center`
 * when closed and retracting outward along `axis` when open.
 *
 * Retract distance is exactly `halfWidth`, not a taste — that's the
 * minimum that clears a panel past the gap at all (its own width), and it
 * lands each panel's near edge exactly on the doorway's own boundary,
 * flush against the flanking wall run rather than short of it or
 * overhanging past it. Worked example: with a 3.6m-wide panel and a ≈4.9m flanking
 * wall run, a retracted panel starts exactly at the gap edge and sits
 * inside the run with ~1.3m to spare before the room's corner, for either panel. Retracted,
 * a panel lies inside that wall's box (LEAF_T is thinner than the wall) and
 * is hidden by its faces. */
export function BiPartingDoor({
  open, center, axis, halfWidth, code, doorStyle = DEFAULT_DOOR_STYLE,
}: {
  code: string;
  open: boolean;
  center: readonly [number, number];
  axis: "x" | "z";
  halfWidth: number;
  doorStyle?: DoorStyle;
}) {
  const { Frame, Leaf } = doorParts(doorStyle);
  const negRef = useRef<Mesh>(null);
  const posRef = useRef<Mesh>(null);
  const closedOffset = halfWidth / 2;
  const openOffset = halfWidth * 1.5;
  useFrame((_, delta) => {
    const target = open ? openOffset : closedOffset;
    if (negRef.current) damp(negRef.current.position, axis, center[axis === "x" ? 0 : 1] - target, 0.22, delta);
    if (posRef.current) damp(posRef.current.position, axis, center[axis === "x" ? 0 : 1] + target, 0.22, delta);
  });
  const w = axis === "x" ? halfWidth : LEAF_T;
  const d = axis === "z" ? halfWidth : LEAF_T;
  const negPos: [number, number, number] = axis === "x"
    ? [center[0] - closedOffset, DOOR_H / 2, center[1]]
    : [center[0], DOOR_H / 2, center[1] - closedOffset];
  const posPos: [number, number, number] = axis === "x"
    ? [center[0] + closedOffset, DOOR_H / 2, center[1]]
    : [center[0], DOOR_H / 2, center[1] + closedOffset];
  return (
    <>
      {Frame && <Frame center={center} axis={axis} halfWidth={halfWidth} open={open} code={code} />}
      <mesh ref={negRef} position={negPos}>
        <Leaf w={w} d={d} />
      </mesh>
      <mesh ref={posRef} position={posPos}>
        <Leaf w={w} d={d} />
      </mesh>
    </>
  );
}
