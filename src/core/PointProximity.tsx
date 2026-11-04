// Walk-up detection for one point on the floor: "a walker is close and facing
// it". The enter/exit pair has hysteresis (ENTER_* tighter than EXIT_*), so a
// walker at the edge does not flicker. Doors use it for their gap's middle and
// terminals for their plinth; a host can use it for anything E operates.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { ENTER_DIST, ENTER_FACING, EXIT_DIST, EXIT_FACING } from "./engine";

/** Calls `onNear` only when the answer changes, never once per frame. Works
 * from any side of `point`: the direction to it always points toward it from
 * wherever the camera stands. While `enabled` is false it reports "not near"
 * once and then stays quiet. */
export function PointProximity({
  enabled, point, onNear,
}: {
  enabled: boolean;
  point: readonly [number, number];
  onNear: (near: boolean) => void;
}) {
  const inside = useRef(false);
  const forward = useMemo(() => new Vector3(), []);
  useEffect(() => {
    if (!enabled && inside.current) {
      inside.current = false;
      onNear(false);
    }
  }, [enabled, onNear]);
  useFrame(({ camera }) => {
    if (!enabled) return;
    camera.getWorldDirection(forward);
    const flen = Math.hypot(forward.x, forward.z) || 1;
    const dx = point[0] - camera.position.x;
    const dz = point[1] - camera.position.z;
    const dist = Math.hypot(dx, dz);
    const facing = dist < 1e-3 ? 1 : (forward.x * dx + forward.z * dz) / (flen * dist);
    const next = inside.current
      ? dist < EXIT_DIST && facing > EXIT_FACING
      : dist < ENTER_DIST && facing > ENTER_FACING;
    if (next !== inside.current) {
      inside.current = next;
      onNear(next);
    }
  });
  return null;
}
