// The frame a door leaf hangs in: two jamb posts and a lintel standing proud
// of the wall on both faces, hazard stripes down the reveal and the posts'
// inner edges, a drum housing and hydraulic rams at the head, bolt heads
// (drei <Instances>), a stencilled ID plate, and a lamp that reads the door:
// PHOS when it stands open, amber while it is shut.
//
// Visual only. The gap, the walls either side and the header above are the
// colliders WalkPhysics builds; every part here sits outside the gap, on or
// proud of a face that is already solid.

import { useEffect, useMemo } from "react";
import { Edges, Instance, Instances } from "@react-three/drei";
import { RepeatWrapping } from "three";
import { drawHazard, drawIdPlate } from "./doorMetal";
import { useGrainTexture } from "./DoorMetal";
import { COLLIDER_WALL_T, DOOR_H, DOOR_POST_W, INK, PAPER, PHOS, WARN } from "../core/engine";
import { useCanvasTexture } from "../core/useCanvasTexture";

// The engine owns the width (DOOR_POST_W): panels hung beside a door are placed from it.
const POST_W = DOOR_POST_W;
const PROUD = 0.09;
const LINTEL_H = 0.2;
const DEPTH = COLLIDER_WALL_T + 2 * PROUD;
const FRAME_STEEL = "#8693a1";

function useHazard(w: number, h: number) {
  const { canvas, texture } = useCanvasTexture(Math.round(w * 200), Math.round(h * 200));
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawHazard(ctx, canvas.width, canvas.height, 44, WARN, INK);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.needsUpdate = true;
  }, [canvas, texture]);
  return texture;
}

function IdPlate({ code, position, rotationY }: { code: string; position: [number, number, number]; rotationY: number }) {
  const { canvas, texture } = useCanvasTexture(176, 88);
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const paint = () => {
      if (!alive) return;
      drawIdPlate(ctx, canvas.width, canvas.height, code, PAPER, INK);
      texture.needsUpdate = true;
    };
    paint();
    void document.fonts?.ready.then(paint);
    return () => {
      alive = false;
    };
  }, [canvas, texture, code]);
  return (
    <mesh position={position} rotation={[0, rotationY, 0]}>
      <planeGeometry args={[0.2, 0.1]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

export function DoorFrame({
  center, axis, halfWidth, open, code,
}: {
  center: readonly [number, number];
  axis: "x" | "z";
  halfWidth: number;
  open: boolean;
  /** The short stencil on the ID plate. */
  code: string;
}) {
  const grain = useGrainTexture(POST_W, DOOR_H);
  const reveal = useHazard(DEPTH, DOOR_H);
  const edge = useHazard(0.07, DOOR_H);
  const lamp = open ? PHOS : WARN;
  const sides = [1, -1] as const;
  const span = halfWidth + POST_W;
  const zFace = DEPTH / 2;

  const bolts = useMemo(() => {
    const out: [number, number, number][] = [];
    for (const sx of sides) {
      for (const y of [0.25, 1.05, 1.85, 2.5]) {
        for (const dx of [-0.09, 0.09]) out.push([sx * (halfWidth + POST_W / 2) + dx, y, 0]);
      }
    }
    for (let x = -halfWidth + 0.3; x < halfWidth - 0.2; x += 0.6) out.push([x, DOOR_H + LINTEL_H / 2, 0]);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [halfWidth]);

  return (
    <group position={[center[0], 0, center[1]]} rotation={[0, axis === "x" ? 0 : Math.PI / 2, 0]}>
      {sides.map((sx) => (
        <group key={sx}>
          {/* Jamb post. */}
          <mesh position={[sx * (halfWidth + POST_W / 2), DOOR_H / 2, 0]}>
            <boxGeometry args={[POST_W, DOOR_H, DEPTH]} />
            <meshStandardMaterial color={FRAME_STEEL} map={grain} metalness={0.55} roughness={0.5} />
            <Edges color="#0b0f14" />
          </mesh>
          {/* Hazard stripes down the reveal, facing the gap. */}
          <mesh position={[sx * halfWidth - sx * 0.002, DOOR_H / 2, 0]} rotation={[0, -sx * Math.PI / 2, 0]}>
            <planeGeometry args={[DEPTH, DOOR_H]} />
            <meshBasicMaterial map={reveal} toneMapped={false} />
          </mesh>
          {/* ...and a stripe along each face's inner edge. */}
          {sides.map((f) => (
            <mesh key={f} position={[sx * (halfWidth + 0.05), DOOR_H / 2, f * (zFace + 0.002)]} rotation={[0, f === 1 ? 0 : Math.PI, 0]}>
              <planeGeometry args={[0.07, DOOR_H]} />
              <meshBasicMaterial map={edge} toneMapped={false} />
            </mesh>
          ))}
          {/* Hydraulic ram on each face: a housing and its rod running up into the head. */}
          {sides.map((f) => (
            <group key={f} position={[sx * (halfWidth + POST_W * 0.62), 0, f * (zFace + 0.05)]}>
              <mesh position={[0, 2.25, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.6, 12]} />
                <meshStandardMaterial color="#b4bfcb" metalness={0.6} roughness={0.35} />
              </mesh>
              <mesh position={[0, 2.62, 0]}>
                <cylinderGeometry args={[0.022, 0.022, 0.2, 8]} />
                <meshStandardMaterial color="#dfe5ec" metalness={1} roughness={0.2} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      {/* Lintel across the head, and the drum housing on each face. */}
      <mesh position={[0, DOOR_H + LINTEL_H / 2, 0]}>
        <boxGeometry args={[span * 2, LINTEL_H, DEPTH]} />
        <meshStandardMaterial color={FRAME_STEEL} map={grain} metalness={0.55} roughness={0.5} />
        <Edges color="#0b0f14" />
      </mesh>
      {sides.map((f) => (
        <group key={f}>
          <mesh position={[0, DOOR_H + 0.1, f * (zFace + 0.04)]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.07, 0.07, halfWidth * 2, 16]} />
            <meshStandardMaterial color="#a0abb8" metalness={0.6} roughness={0.4} />
          </mesh>
          {/* The lamp: reads the door at a glance, from either side. */}
          <mesh position={[0, DOOR_H + 0.1, f * (zFace + 0.115)]}>
            <boxGeometry args={[0.34, 0.07, 0.03]} />
            <meshBasicMaterial color={lamp} toneMapped={false} />
          </mesh>
          <IdPlate code={code} position={[-(halfWidth + POST_W / 2), 1.5, f * (zFace + 0.004)]} rotationY={f === 1 ? 0 : Math.PI} />
        </group>
      ))}
      <Instances limit={bolts.length * 2}>
        <sphereGeometry args={[0.026, 8, 6]} />
        <meshStandardMaterial color="#ffffff" metalness={0.6} roughness={0.3} />
        {sides.flatMap((f) =>
          bolts.map(([bx, by], i) => (
            <Instance key={`${f}-${i}`} position={[bx, by, f * zFace]} scale={[1, 1, 0.6]} />
          )),
        )}
      </Instances>
    </group>
  );
}
