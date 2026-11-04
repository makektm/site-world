// A teammate who is in the room right now: a simple standing person (tapered
// torso and a head, full walker height) on a ring in their own colour, with
// their name above. The silhouette is deliberately unlike AgentFigure's
// hovering capsule, so people and agents never read as the same thing.
//
// Positions arrive from the network in jumps; the marker glides between them
// rather than teleporting, and turns to the way it is going.
import { useEffect, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { damp, dampAngle } from "maath/easing";
import { AdditiveBlending, BackSide, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { EYE, PAPER, WALL_FILL, getGlowTexture } from "../core/engine";
import { NameTag } from "./NameTag";
import { floorHeading, type PathPoint } from "./agentPath";

const TORSO_H = 1.0;
const HEAD_R = 0.14;
// The head at eye height, so a marker stands exactly as tall as the walker
// the remote person is (or would be) in walk mode.
const HEAD_Y = EYE - 0.04;

/** Props for {@link PresenceMarker}. */
export interface PresenceMarkerProps {
  /** The person's name, on the tag. */
  name: string;
  /** A second line: what they are looking at, their role. */
  sub?: string;
  /** Their colour: ring, outline accent and tag edge. */
  color: string;
  /** Where they stand, [x, z]. Changes glide rather than jump. */
  position: PathPoint;
  /** Which way they face (rotation about y, 0 faces +z). Defaults to the way they last moved. */
  heading?: number;
  /** Dim them: connected but inactive (tab in the background). */
  away?: boolean;
  /** Draw the selection ring. */
  selected?: boolean;
  /** Click handler; also turns on the pointer cursor. */
  onSelect?: () => void;
  /** Hide the name tag. */
  hideLabel?: boolean;
  /** The moving body, for a host that follows the person with a camera. */
  bodyRef?: RefObject<Group | null>;
  /** Prefers-reduced-motion: the ring holds still and position changes snap. */
  reduce?: boolean;
}

/** A human teammate's presence: a standing silhouette on a ring in their colour, with their name. */
export function PresenceMarker({
  name, sub, color, position, heading, away = false, selected = false, onSelect, hideLabel = false, bodyRef,
  reduce = false,
}: PresenceMarkerProps) {
  const body = useRef<Group>(null);
  const ringMesh = useRef<Mesh>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const motion = useRef({ x: position[0], z: position[1], heading: heading ?? 0 }).current;
  const dim = away ? 0.4 : 1;

  // Same cursor discipline as Plinth: reset it if we unmount or go inert mid-hover.
  const [hovered, setHovered] = useState(false);
  const hoveredRef = useRef(false);
  const active = onSelect !== undefined;
  useEffect(() => () => {
    if (!hoveredRef.current) return;
    hoveredRef.current = false;
    document.body.style.cursor = "default";
  }, [active]);

  const setBody = (el: Group | null) => {
    body.current = el;
    if (bodyRef) bodyRef.current = el;
  };

  useFrame(({ clock }, dt) => {
    const g = body.current;
    if (!g) return;
    const [gx, gz] = position;
    const dist = Math.hypot(gx - motion.x, gz - motion.z);
    if (reduce) {
      motion.x = gx;
      motion.z = gz;
    } else {
      damp(motion, "x", gx, 0.35, dt);
      damp(motion, "z", gz, 0.35, dt);
    }
    const want = heading ?? (dist > 0.05 ? floorHeading([motion.x, motion.z], [gx, gz]) : motion.heading);
    if (reduce) motion.heading = want;
    else dampAngle(motion, "heading", want, 0.25, dt);
    g.position.set(motion.x, 0, motion.z);
    g.rotation.y = motion.heading;
    if (ringMesh.current && ringMat.current) {
      // A slow breath on the ring: "this person is live", the multiplayer
      // cursor's blink, kept slow enough not to compete with alerts.
      const s = reduce ? 1 : 1 + 0.06 * Math.sin(clock.elapsedTime * 1.6);
      ringMesh.current.scale.set(s, s, 1);
      ringMat.current.opacity = 0.85 * dim;
    }
  });

  const outline = selected || hovered ? PAPER : color;
  return (
    <group ref={setBody}>
      <group
        onClick={(event) => {
          if (!onSelect) return;
          event.stopPropagation();
          onSelect();
        }}
        onPointerOver={(event) => {
          if (!onSelect) return;
          event.stopPropagation();
          setHovered(true);
          hoveredRef.current = true;
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          if (!hoveredRef.current) return;
          hoveredRef.current = false;
          document.body.style.cursor = "default";
        }}
      >
        <mesh position={[0, 0.3 + TORSO_H / 2, 0]}>
          <cylinderGeometry args={[0.15, 0.23, TORSO_H, 14]} />
          <meshBasicMaterial color={WALL_FILL} transparent={away} opacity={dim} />
        </mesh>
        <mesh position={[0, 0.3 + TORSO_H / 2, 0]}>
          <cylinderGeometry args={[0.168, 0.25, TORSO_H + 0.03, 14]} />
          <meshBasicMaterial color={outline} side={BackSide} transparent={away} opacity={dim} />
        </mesh>
        {/* Legs as one narrow block: enough of a stance to read as standing. */}
        <mesh position={[0, 0.15, 0]}>
          <boxGeometry args={[0.24, 0.3, 0.14]} />
          <meshBasicMaterial color={WALL_FILL} transparent={away} opacity={dim} />
        </mesh>
        <mesh position={[0, HEAD_Y, 0]}>
          <sphereGeometry args={[HEAD_R, 16, 12]} />
          <meshBasicMaterial color={WALL_FILL} transparent={away} opacity={dim} />
        </mesh>
        <mesh position={[0, HEAD_Y, 0]}>
          <sphereGeometry args={[HEAD_R + 0.017, 16, 12]} />
          <meshBasicMaterial color={outline} side={BackSide} transparent={away} opacity={dim} />
        </mesh>
        {/* A nose-stripe of colour on the face, so you can tell which way they look. */}
        <mesh position={[0, HEAD_Y + 0.01, HEAD_R - 0.01]}>
          <boxGeometry args={[0.14, 0.035, 0.04]} />
          <meshBasicMaterial color={color} toneMapped={false} transparent={away} opacity={dim} />
        </mesh>
      </group>
      <mesh ref={ringMesh} position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.5, 48]} />
        <meshBasicMaterial ref={ringMat} color={color} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {/* A tick on the ring toward their facing: heading at a glance from above. */}
      <mesh position={[0, 0.015, 0.58]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.07, 3, -Math.PI / 2]} />
        <meshBasicMaterial color={color} transparent opacity={0.9 * dim} depthWrite={false} toneMapped={false} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.016, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.56, 0.6, 48]} />
          <meshBasicMaterial color={PAPER} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.5, 1.5]} />
        <meshBasicMaterial map={getGlowTexture()} color={color} transparent opacity={0.3 * dim} depthWrite={false} blending={AdditiveBlending} />
      </mesh>
      {!hideLabel && (
        <NameTag text={name} sub={sub} accent={color} position={[0, HEAD_Y + HEAD_R + 0.12, 0]} height={0.19} opacity={away ? 0.6 : 1} />
      )}
    </group>
  );
}
