// A database or storage volume as a glass tank: how full it is (the liquid's
// level), whether it is healthy (the liquid's colour), and whether it is
// filling up (ripples spreading on the surface, faster the faster it grows).
// A level you can read across the room is the point; the exact figure is on
// the label.
import { useRef } from "react";
import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { damp } from "maath/easing";
import { AdditiveBlending, DoubleSide, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { PAPER, PAPER_DIM, WALL_FILL, getGlowTexture } from "../core/engine";
import { INFRA_HEALTH_COLOR, unitFill, type InfraHealth } from "./infraMath";
import { InfraLabel } from "./infraPaint";

export interface TankProps {
  /** Floor point the tank stands on. */
  position: readonly [number, number, number];
  /** Liquid level 0..1 (clamped). */
  fill: number;
  health?: InfraHealth;
  label?: string;
  /** Second label line; defaults to the fill as a percentage. */
  sub?: string;
  radius?: number;
  height?: number;
  /** Fill change per day (or any period the host chooses), as a fraction:
   * 0.02 = growing 2%/day. Non-zero draws a ripple; its pace follows the magnitude. */
  growth?: number;
  /** Reduced motion: the level snaps instead of easing and the ripple holds still. */
  reduce?: boolean;
}

const BASE_H = 0.12;
const RIPPLES = 2;

/** A storage tank: glass shell, coloured liquid at `fill`, optional growth ripple and label. */
export function Tank({
  position, fill, health = "ok", label, sub, radius = 0.6, height = 1.8, growth = 0, reduce = false,
}: TankProps) {
  const liquid = useRef<Mesh>(null);
  const surface = useRef<Group>(null);
  const ripples = useRef<(Mesh | null)[]>([]);
  const want = unitFill(fill);
  const live = useRef({ level: want });
  const color = INFRA_HEALTH_COLOR[health];
  const inner = radius * 0.9;
  const bodyH = height - BASE_H;
  // Ripples only mean something when the level is moving; a tank at rest is still.
  const ripplePace = growth === 0 ? 0 : Math.min(1.2, 0.25 + Math.abs(growth) * 20);

  useFrame(({ clock }, dt) => {
    if (reduce) live.current.level = want;
    else damp(live.current, "level", want, 0.5, dt);
    // A hair of liquid even when empty, so the colour (health) still shows.
    const h = Math.max(0.02, live.current.level * bodyH * 0.96);
    if (liquid.current) {
      liquid.current.scale.y = h;
      liquid.current.position.y = BASE_H + h / 2;
    }
    if (surface.current) surface.current.position.y = BASE_H + h + 0.003;
    ripples.current.forEach((m, i) => {
      if (!m) return;
      const mat = m.material as MeshBasicMaterial;
      if (ripplePace === 0) {
        m.visible = false;
        return;
      }
      m.visible = true;
      // Shrinking rings for a draining tank, spreading ones for a growing one.
      const raw = reduce ? 0.5 + i * 0.25 : (clock.elapsedTime * ripplePace + i / RIPPLES) % 1;
      const k = growth > 0 ? raw : 1 - raw;
      const s = 0.15 + k * 0.8;
      m.scale.set(s, s, 1);
      mat.opacity = 0.7 * (1 - raw);
    });
  });

  const [x, y, z] = position;
  return (
    <group position={[x, y, z]}>
      {/* Plinth */}
      <mesh position={[0, BASE_H / 2, 0]}>
        <cylinderGeometry args={[radius * 1.08, radius * 1.12, BASE_H, 32]} />
        <meshBasicMaterial color={WALL_FILL} />
        <Edges color={PAPER} />
      </mesh>
      {/* Glass: barely-there fill, its rims drawn as edges, so the liquid inside reads. */}
      <mesh position={[0, BASE_H + bodyH / 2, 0]} renderOrder={2}>
        <cylinderGeometry args={[radius, radius, bodyH, 32, 1, true]} />
        <meshBasicMaterial color={PAPER} transparent opacity={0.07} side={DoubleSide} depthWrite={false} />
        <Edges color={PAPER_DIM} />
      </mesh>
      <mesh position={[0, height, 0]}>
        <cylinderGeometry args={[radius * 1.02, radius * 1.02, 0.05, 32]} />
        <meshBasicMaterial color={WALL_FILL} />
        <Edges color={PAPER} />
      </mesh>
      {/* Level ticks at quarters, on the front, to read the fill against. */}
      {[0.25, 0.5, 0.75].map((f) => (
        <mesh key={f} position={[0, BASE_H + f * bodyH * 0.96, radius + 0.004]}>
          <planeGeometry args={[0.14, 0.012]} />
          <meshBasicMaterial color={PAPER_DIM} toneMapped={false} />
        </mesh>
      ))}
      <mesh ref={liquid} position={[0, BASE_H + 0.5, 0]} renderOrder={1}>
        <cylinderGeometry args={[inner, inner, 1, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={surface} position={[0, BASE_H + 1, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[inner, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} toneMapped={false} />
        </mesh>
        {Array.from({ length: RIPPLES }, (_, i) => (
          <mesh
            key={i}
            ref={(el) => { ripples.current[i] = el; }}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.004 + i * 0.001, 0]}
            visible={false}
          >
            <ringGeometry args={[inner * 0.9, inner, 40]} />
            <meshBasicMaterial color={PAPER} transparent opacity={0} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
        <sprite scale={[radius * 3, radius * 3, 1]}>
          <spriteMaterial map={getGlowTexture()} color={color} transparent opacity={0.35} depthWrite={false} blending={AdditiveBlending} />
        </sprite>
      </group>
      {label && (
        <InfraLabel
          position={[0, height + 0.45, 0]}
          text={label}
          sub={sub ?? `${Math.round(want * 100)}% full${growth ? ` · ${growth > 0 ? "+" : ""}${(growth * 100).toFixed(1)}%/d` : ""}`}
          subColor={color}
        />
      )}
    </group>
  );
}
