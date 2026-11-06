// How much detail a part of the world deserves from where the camera is now.
// Checked a few times a second, not every frame, and only re-renders the
// caller when the level actually changes (lodFor's hysteresis keeps a camera
// parked on a threshold from flickering between two).
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { LOD_THRESHOLDS, lodForRect, type FloorRect, type Lod } from "site-world";

const EVERY = 12; // frames

export function useLod(rect: FloorRect): Lod {
  const [lod, setLod] = useState<Lod>("room");
  // A random phase spreads the checks of many callers over different frames.
  const frame = useRef(Math.floor(Math.random() * EVERY));
  const last = useRef<Lod>(lod);
  useFrame(({ camera }) => {
    frame.current += 1;
    if (frame.current % EVERY !== 0) return;
    const p = camera.position;
    const next = lodForRect({ x: p.x, z: p.z, y: p.y }, rect, LOD_THRESHOLDS, last.current);
    if (next !== last.current) {
      last.current = next;
      setLod(next);
    }
  });
  return lod;
}

/** A small rect round a floor point, for things that are not rooms. */
export function rectAround([x, z]: readonly [number, number], r = 1): FloorRect {
  return { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r };
}
