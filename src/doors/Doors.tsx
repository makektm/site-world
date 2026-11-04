// Doors, drawn and wired from a list of SiteDoor: a leaf per door, a walk-up
// trigger per door reporting into one open/closed record, and the collider box
// across each closed door. Nothing here names a door — the list is the world's
// (worldDoors.ts).
import { useCallback, useMemo, useState } from "react";
import type { RefObject } from "react";
import type { Group } from "three";
import { PointProximity } from "../core/PointProximity";
import { BiPartingDoor, SlidingDoor } from "./SlidingDoor";
import { allClosed, type DoorsOpen, type SiteDoor } from "./door";
import { COLLIDER_WALL_T, DOOR_H } from "../core/engine";

/** Open/closed per door, all closed. Each door's own PointProximity resets to
 * closed when walking stops (its `enabled` going false fires the cleanup), so
 * no mode effect is needed. */
export function useDoorsOpen(doors: readonly SiteDoor[]): [DoorsOpen, (id: string, open: boolean) => void] {
  const initial = useMemo(() => allClosed(doors), [doors]);
  const [open, setOpenState] = useState<DoorsOpen>(initial);
  const setOpen = useCallback(
    (id: string, next: boolean) => setOpenState((cur) => (cur[id] === next ? cur : { ...cur, [id]: next })),
    [],
  );
  return [open, setOpen];
}

export function SiteDoorLeaves({ doors, open }: { doors: readonly SiteDoor[]; open: DoorsOpen }) {
  return (
    <>
      {doors.map(({ id, code, doorway, kind }) => {
        const Leaf = kind === "biparting" ? BiPartingDoor : SlidingDoor;
        return <Leaf key={id} {...doorway} code={code} open={open[id] ?? false} />;
      })}
    </>
  );
}

export function SiteDoorTriggers({
  doors, enabled, setOpen,
}: {
  doors: readonly SiteDoor[];
  enabled: boolean;
  setOpen: (id: string, open: boolean) => void;
}) {
  return (
    <>
      {doors.map(({ id, doorway }) => (
        <DoorTrigger key={id} id={id} point={doorway.center} enabled={enabled} setOpen={setOpen} />
      ))}
    </>
  );
}

// One component per door so each gets a stable `onNear` of its own.
function DoorTrigger({
  id, point, enabled, setOpen,
}: {
  id: string;
  point: readonly [number, number];
  enabled: boolean;
  setOpen: (id: string, open: boolean) => void;
}) {
  const onNear = useCallback((near: boolean) => setOpen(id, near), [id, setOpen]);
  return <PointProximity enabled={enabled} point={point} onNear={onNear} />;
}

/** The doors' own collider boxes — deliberately never joined into the static
 * walk colliders. That group's Octree is rebuilt only when its solids change;
 * folding a door in would force a full-scene rebuild on every open/closed
 * toggle, and three.js's Octree has no incremental add/remove. A second, tiny
 * Octree holding only these boxes costs nothing to rebuild. One box across
 * each closed door's full gap, whatever its leaf looks like: a bi-parting
 * pair's two half-gap boxes abut at the middle, so one box is the same
 * collision. Each box is DOOR_H tall, so a closed door meets its static header
 * exactly. */
export function DoorColliders({
  doors, doorsOpen, colliderRef,
}: {
  doors: readonly SiteDoor[];
  doorsOpen: DoorsOpen;
  colliderRef: RefObject<Group | null>;
}) {
  return (
    <group ref={colliderRef} visible={false}>
      {doors.filter(({ id }) => !doorsOpen[id]).map(({ id, doorway: { center, axis, halfWidth } }) => (
        <mesh key={id} position={[center[0], DOOR_H / 2, center[1]]}>
          <boxGeometry args={axis === "x" ? [halfWidth * 2, DOOR_H, COLLIDER_WALL_T] : [COLLIDER_WALL_T, DOOR_H, halfWidth * 2]} />
        </mesh>
      ))}
    </group>
  );
}
