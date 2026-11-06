// Access, drawn as the objects people already read it as: a padlock hung on
// whatever is restricted (a door, a pylon, a terminal), and a small key that
// floats beside whoever holds a secret. Built from primitives rather than a
// texture so they light and occlude with the room and read from any side.
import { useRef } from "react";
import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, type Group } from "three";
import { INK, OK, WALL_FILL, WARN, getGlowTexture } from "../core/engine";
import { InfraLabel } from "./infraPaint";

export interface PadlockProps {
  /** Centre of the lock body. */
  position: readonly [number, number, number];
  /** Turn about y; the keyhole faces local +z. */
  rotationY?: number;
  /** Body height in metres; everything else scales with it. */
  size?: number;
  color?: string;
  /** False draws the shackle lifted open, in OK, for access just granted. */
  locked?: boolean;
  /** Who may pass, e.g. "on-call only"; shown under the lock. */
  label?: string;
}

/** A padlock to hang on anything restricted. */
export function Padlock({ position, rotationY = 0, size = 0.3, color = WARN, locked = true, label }: PadlockProps) {
  const s = size;
  const tint = locked ? color : OK;
  const [x, y, z] = position;
  return (
    <group position={[x, y, z]} rotation={[0, rotationY, 0]}>
      <mesh>
        <boxGeometry args={[s * 0.9, s * 0.75, s * 0.35]} />
        <meshBasicMaterial color={WALL_FILL} />
        <Edges color={tint} />
      </mesh>
      {/* Shackle: a half torus standing on the body; open = lifted and swung. */}
      <group position={[locked ? 0 : s * 0.12, s * 0.375 + (locked ? 0 : s * 0.15), 0]} rotation={[0, locked ? 0 : 0.9, 0]}>
        <mesh>
          <torusGeometry args={[s * 0.28, s * 0.055, 8, 20, Math.PI]} />
          <meshBasicMaterial color={tint} toneMapped={false} />
        </mesh>
      </group>
      {/* Keyhole: a dot and a slot, on the front face. */}
      <group position={[0, 0, s * 0.176]}>
        <mesh position={[0, s * 0.06, 0]}>
          <circleGeometry args={[s * 0.07, 16]} />
          <meshBasicMaterial color={tint} toneMapped={false} />
        </mesh>
        <mesh position={[0, -s * 0.06, 0]}>
          <planeGeometry args={[s * 0.05, s * 0.18]} />
          <meshBasicMaterial color={tint} toneMapped={false} />
        </mesh>
      </group>
      <sprite scale={[s * 3, s * 3, 1]}>
        <spriteMaterial map={getGlowTexture()} color={tint} transparent opacity={0.25} depthWrite={false} blending={AdditiveBlending} />
      </sprite>
      {label && <InfraLabel position={[0, -s * 0.75, 0]} text={label} width={1.1} height={0.2} plate />}
    </group>
  );
}

export interface KeyBadgeProps {
  /** Where the key floats, usually just above an agent's shoulder. */
  position: readonly [number, number, number];
  /** Key length in metres. */
  size?: number;
  color?: string;
  /** The secret's name, e.g. "STRIPE_KEY"; shown beside the key. */
  label?: string;
  /** Reduced motion: no spin or bob. */
  reduce?: boolean;
}

/** A small floating key, to attach to an agent that holds a secret. */
export function KeyBadge({ position, size = 0.22, color = WARN, label, reduce = false }: KeyBadgeProps) {
  const key = useRef<Group>(null);
  const s = size;
  useFrame(({ clock }) => {
    if (!key.current || reduce) return;
    const t = clock.elapsedTime;
    key.current.rotation.y = t * 1.2;
    key.current.position.y = Math.sin(t * 2) * s * 0.08;
  });
  const [x, y, z] = position;
  return (
    <group position={[x, y, z]}>
      {/* Lying on its side, bow up, so its outline reads while it turns. */}
      <group ref={key} rotation={[0, 0.6, 0]}>
        <group rotation={[0, 0, -Math.PI / 2]}>
          <mesh position={[0, -s * 0.32, 0]}>
            <torusGeometry args={[s * 0.16, s * 0.05, 8, 20]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          <mesh position={[0, s * 0.12, 0]}>
            <boxGeometry args={[s * 0.07, s * 0.6, s * 0.05]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          {[0.3, 0.4].map((t) => (
            <mesh key={t} position={[s * 0.07, s * t, 0]}>
              <boxGeometry args={[s * 0.1, s * 0.05, s * 0.05]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
          ))}
          <mesh position={[0, -s * 0.32, 0]}>
            <circleGeometry args={[s * 0.1, 16]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        </group>
      </group>
      <sprite scale={[s * 3.5, s * 3.5, 1]}>
        <spriteMaterial map={getGlowTexture()} color={color} transparent opacity={0.35} depthWrite={false} blending={AdditiveBlending} />
      </sprite>
      {label && <InfraLabel position={[0, -s * 0.7, 0]} text={label} width={0.8} height={0.15} plate />}
    </group>
  );
}
