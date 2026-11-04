// A belt along a polyline: a dark body with cream edges, side rails, and a
// chevron surface that slides downstream so the direction of travel reads
// even in a still screenshot. Each straight run is its own mesh with its own
// small canvas, because a texture's repeat is per texture and runs differ in
// length; a 64x128 canvas per run is cheaper than a custom shader.
import { useEffect, useMemo } from "react";
import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { RepeatWrapping } from "three";
import { PAPER, PAPER_DIM, WALL_FILL } from "../core/engine";
import { useCanvasTexture } from "../core/useCanvasTexture";
import type { FloorPoint } from "./workLineLayout";

/** One chevron tile's length along the belt, metres. */
const TILE = 0.5;

export interface ConveyorProps {
  /** Floor points [x, z], upstream first. Two points make a straight belt. */
  path: readonly FloorPoint[];
  /** Belt width, metres. */
  width?: number;
  /** Height of the belt surface above the floor, metres. */
  height?: number;
  /** Surface speed, metres per second, downstream. */
  speed?: number;
  /** Chevron colour. */
  color?: string;
  /** Reduced motion: the surface stands still. */
  reduce?: boolean;
}

/** A conveyor belt along a straight or polyline path, its surface sliding downstream. */
export function Conveyor({ path, width = 1.1, height = 0.35, speed = 0.4, color = PAPER_DIM, reduce = false }: ConveyorProps) {
  const runs = useMemo(() => {
    const out: { x: number; z: number; len: number; rotY: number }[] = [];
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len <= 0) continue;
      out.push({ x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, len, rotY: Math.atan2(b[0] - a[0], b[1] - a[1]) });
    }
    return out;
  }, [path]);
  // Inner corners: a square pad under each joint so the belt has no notch where
  // two runs meet at an angle.
  const joints = path.slice(1, -1);
  return (
    <group>
      {runs.map((r, i) => (
        <Run key={i} {...r} width={width} height={height} speed={reduce ? 0 : speed} color={color} />
      ))}
      {joints.map((p, i) => (
        <mesh key={`j${i}`} position={[p[0], height / 2, p[1]]}>
          <boxGeometry args={[width, height, width]} />
          <meshBasicMaterial color={WALL_FILL} />
          <Edges color={PAPER} />
        </mesh>
      ))}
    </group>
  );
}

function Run({ x, z, len, rotY, width, height, speed, color }: {
  x: number; z: number; len: number; rotY: number; width: number; height: number; speed: number; color: string;
}) {
  const { canvas, texture } = useCanvasTexture(64, 128);
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width: w, height: h } = canvas;
    ctx.fillStyle = WALL_FILL;
    ctx.fillRect(0, 0, w, h);
    // Chevrons point to the canvas bottom: with the plane laid flat and the
    // run turned downstream, that is the belt's direction of travel.
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(8, h * 0.3);
    ctx.lineTo(w / 2, h * 0.62);
    ctx.lineTo(w - 8, h * 0.3);
    ctx.stroke();
    ctx.globalAlpha = 1;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.needsUpdate = true;
  }, [canvas, texture, color]);
  useEffect(() => {
    texture.repeat.set(1, len / TILE);
  }, [texture, len]);
  // Texture content appears at uv - offset; the plane's v grows upstream, so a
  // growing offset carries the chevrons downstream.
  useFrame((_, dt) => {
    if (speed === 0) return;
    texture.offset.y = (texture.offset.y + (speed * Math.min(dt, 0.1)) / TILE) % 1;
  });
  const rail = 0.05;
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, height / 2 - 0.005, 0]}>
        <boxGeometry args={[width, height - 0.01, len]} />
        <meshBasicMaterial color={WALL_FILL} />
        <Edges color={PAPER} />
      </mesh>
      <mesh position={[0, height + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width * 0.92, len]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (width / 2 + rail / 2), height + rail / 2, 0]}>
          <boxGeometry args={[rail, rail, len]} />
          <meshBasicMaterial color={WALL_FILL} />
          <Edges color={PAPER} />
        </mesh>
      ))}
    </group>
  );
}
