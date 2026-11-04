// The wall switch that summons the demons, and the walk-up trigger that
// lets E pull it.
import { useEffect, useMemo, useRef } from "react";
import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { damp } from "maath/easing";
import { AdditiveBlending, Vector3, type Group, type MeshBasicMaterial } from "three";
import { isChromeOpen, isTypingTarget } from "../core/keys";
import {
  CRITICAL,
  ENTER_DIST,
  ENTER_FACING,
  EXIT_DIST,
  EXIT_FACING,
  PANEL_STANDOFF,
  PAPER,
} from "../core/engine";
import { doom } from "./doomStore";

/** The switch's plate and lever — the same near-invisible-fill-plus-Edges
 * idiom every prop in this room uses, mounted on the south wall the way
 * a wall panel is (`HALF - PANEL_STANDOFF`, rotated to face into the room).
 * A CRITICAL lamp breathes while no game is running, an invitation; the
 * lever throws down and the lamp burns steady while one is. Always
 * rendered, in both modes, like every other prop here — only the interact
 * system below is walk-mode only. */
/** Where the switch hangs: `x`, height `y`, and the wall it is on at `wallZ`
 * (its centre-line; the panel stands PANEL_STANDOFF in front of it). */
export interface SwitchAt {
  x: number;
  y: number;
  wallZ: number;
}

export function DemonSwitchProp({ at }: { at: SwitchAt }) {
  const lever = useRef<Group>(null);
  const lamp = useRef<MeshBasicMaterial>(null);
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const live = doom.director.phase !== "idle";
    if (lever.current) damp(lever.current.rotation, "x", live ? 0.9 : -0.9, 0.12, dt);
    if (lamp.current) {
      lamp.current.opacity = live ? 1 : 0.35 + 0.35 * Math.sin(state.clock.elapsedTime * 2.4);
    }
  });
  return (
    <group position={[at.x, at.y, at.wallZ - PANEL_STANDOFF]} rotation={[0, Math.PI, 0]}>
      <mesh>
        <boxGeometry args={[0.26, 0.4, 0.06]} />
        <meshBasicMaterial color={PAPER} transparent opacity={0.08} depthWrite={false} />
        <Edges color={PAPER} />
      </mesh>
      <group ref={lever} position={[0, 0, 0.04]} rotation={[-0.9, 0, 0]}>
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[0.03, 0.24, 0.03]} />
          <meshBasicMaterial color={PAPER} transparent opacity={0.2} depthWrite={false} />
          <Edges color={PAPER} />
        </mesh>
        <mesh position={[0, 0.25, 0]}>
          <sphereGeometry args={[0.035, 10, 8]} />
          <meshBasicMaterial color={CRITICAL} toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[0, 0.26, 0.035]}>
        <circleGeometry args={[0.03, 16]} />
        <meshBasicMaterial ref={lamp} color={CRITICAL} transparent blending={AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Same enter/exit hysteresis every walk-up trigger in this room already
 * uses (this reuses the same constants rather than a copy), plus its own E-key listener — deliberate press, not automatic
 * like a door, so this doesn't fire just from walking past. `onNear` is
 * for the DOM prompt the host renders outside the canvas;
 * `onActivate` fires once per press, not once per frame held. */
export function SwitchInteract({
  at, enabled, onNear, onActivate,
}: {
  at: SwitchAt;
  enabled: boolean;
  onNear: (near: boolean) => void;
  onActivate: () => void;
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
    const dx = at.x - camera.position.x;
    const dz = at.wallZ - camera.position.z;
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
  useEffect(() => {
    if (!enabled) return;
    const down = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || isChromeOpen()) return;
      if (event.code === "KeyE" && !event.repeat && inside.current) {
        onActivate();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [enabled, onActivate]);
  return null;
}
