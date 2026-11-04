// A door leaf with real depth: a steel slab carrying two rows of raised,
// stepped plates and a darker kick plate on each face, domed bolts at every
// plate corner, and a lit strip at its foot. The plates and bolts are drei
// <Instances> (one draw call each per leaf), laid out by doorLayout.
//
// Drawn in the leaf's own frame — long side along x, thickness along z —
// and turned a quarter when the doorway runs along z.

import { Fragment, useMemo } from "react";
import { Edges, Instance, Instances } from "@react-three/drei";
import { doorLayout, KICK_H } from "./doorMetal";
import { useGrainTexture } from "./DoorMetal";
import { DOOR_H, PHOS } from "../core/engine";

// How far a plate stands off the slab: a wide low step and a narrower high one.
const STEP_LOW = 0.014;
const STEP_HIGH = 0.034;
// Each plate is inset from its cell, so the seams between plates are channels.
const PLATE_INSET = 0.05;
const BOLT_R = 0.024;

interface Rect { x: number; y: number; w: number; h: number }

/** The plates' rectangles in leaf-centre coordinates, from the layout. */
function plateRects(length: number): Rect[] {
  const { seamsX, seamsY } = doorLayout(length);
  const xs = [0, ...seamsX, length];
  const ys = [0, ...seamsY, DOOR_H];
  const rects: Rect[] = [];
  for (let r = 0; r < ys.length - 1; r++) {
    for (let c = 0; c < xs.length - 1; c++) {
      const x0 = xs[c]! + PLATE_INSET;
      const x1 = xs[c + 1]! - PLATE_INSET;
      const y0 = ys[r]! + PLATE_INSET;
      const y1 = ys[r + 1]! - PLATE_INSET;
      rects.push({ x: (x0 + x1) / 2 - length / 2, y: DOOR_H / 2 - (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 });
    }
  }
  return rects;
}

export function DoorLeaf({ w, d }: { w: number; d: number }) {
  const length = Math.max(w, d);
  const thick = Math.min(w, d);
  const alongZ = w < d;
  const grain = useGrainTexture(length, DOOR_H);
  const rects = useMemo(() => plateRects(length), [length]);
  const bolts = useMemo(() => doorLayout(length).rivets, [length]);
  const kickTop = DOOR_H - KICK_H;
  const faces = [1, -1] as const;

  return (
    <>
      {/* The slab: the parent's mesh supplies this geometry. */}
      <boxGeometry args={[w, DOOR_H, d]} />
      <meshStandardMaterial color="#9aa6b3" map={grain} metalness={0.55} roughness={0.5} />
      <Edges color="#10151b" />
      <group rotation={[0, alongZ ? Math.PI / 2 : 0, 0]}>
        {faces.map((f) => (
          <group key={f} rotation={[0, f === 1 ? 0 : Math.PI, 0]}>
            <Instances limit={rects.length * 2} castShadow={false}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#ffffff" map={grain} metalness={0.55} roughness={0.4} />
              {rects.map((r, i) => {
                // The lowest row is the kick plate: darker and shallower.
                const kick = Math.abs(r.y - (DOOR_H / 2 - (kickTop + DOOR_H) / 2)) < 1e-6;
                const z = thick / 2;
                return kick ? (
                  <Instance key={i} position={[r.x, r.y, z + STEP_LOW * 0.75]} scale={[r.w, r.h, STEP_LOW * 1.5]} color="#6f7a86" />
                ) : (
                  <Fragment key={i}>
                    <Instance position={[r.x, r.y, z + STEP_LOW / 2]} scale={[r.w, r.h, STEP_LOW]} color="#aab4bf" />
                    <Instance position={[r.x, r.y, z + STEP_LOW + (STEP_HIGH - STEP_LOW) / 2]} scale={[r.w - 0.1, r.h - 0.1, STEP_HIGH - STEP_LOW]} color="#dfe5ec" />
                  </Fragment>
                );
              })}
            </Instances>
            <Instances limit={bolts.length}>
              <sphereGeometry args={[BOLT_R, 8, 6]} />
              <meshStandardMaterial color="#ffffff" metalness={0.6} roughness={0.3} />
              {bolts.map(([bx, by], i) => (
                <Instance key={i} position={[bx - length / 2, DOOR_H / 2 - by, thick / 2 + STEP_HIGH]} scale={[1, 1, 0.6]} />
              ))}
            </Instances>
          </group>
        ))}
      </group>
      {/* Lit foot strip, proud of both faces. */}
      <mesh position={[0, -DOOR_H / 2 + 0.1, 0]}>
        <boxGeometry args={[alongZ ? w + 0.1 : w, 0.05, alongZ ? d : d + 0.1]} />
        <meshBasicMaterial color={PHOS} toneMapped={false} />
      </mesh>
    </>
  );
}
