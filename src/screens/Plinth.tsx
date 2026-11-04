// A plinth: the little pedestal a terminal's screen stands in front of. A
// faint box with cream edges and a top plate; click it (orbit mode) to power
// the terminal. Pair it with <ConsoleRig> (the screen) and a PointProximity
// (walk-up detection) inside a room's Scene, and give the same footprint to the
// room's Colliders so a walker cannot pass through it.
import { Edges } from "@react-three/drei";
import { DoubleSide } from "three";
import { PAPER } from "../core/engine";

export function Plinth({
  at, width = 0.64, height = 1.05, onActivate,
}: {
  /** Floor position [x, z]. */
  at: readonly [number, number];
  width?: number;
  height?: number;
  /** Orbit-mode click. Leave undefined to make it inert (walk mode). */
  onActivate?: () => void;
}) {
  return (
    <group position={[at[0], 0, at[1]]}>
      <mesh
        position={[0, height / 2, 0]}
        onClick={(event) => {
          event.stopPropagation();
          onActivate?.();
        }}
        onPointerOver={() => {
          if (onActivate) document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
        }}
      >
        <boxGeometry args={[width, height, width]} />
        <meshBasicMaterial color={PAPER} transparent opacity={0.06} depthWrite={false} side={DoubleSide} />
        <Edges color={PAPER} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, height + 0.002, 0]}>
        <planeGeometry args={[width * 1.22, width * 1.22]} />
        <meshBasicMaterial color={PAPER} transparent opacity={0.08} />
        <Edges color={PAPER} />
      </mesh>
    </group>
  );
}
