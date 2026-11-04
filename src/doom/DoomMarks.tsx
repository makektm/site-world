// The marks a fight leaves on SITE: a hole where each round struck a wall
// or a piece of cover, a scorch where one struck the floor or a brute's
// slam landed, and a splat of ichor where each demon fell. Both pools
// (doomWorld.ts's marks and splats) are ring buffers, so the oldest mark
// gives way to the newest, and each fades out over the end of its life.
//
// Instanced flat quads rather than drei's <Decal>, on purpose. <Decal>
// builds a DecalGeometry — a fresh BufferGeometry clipped from the target
// mesh — each time one is placed, which is an allocation per round fired
// and a mount per mark; and every surface a round can strike here (a wall
// box, a crate, the floor) is flat, so the clipped geometry would only ever
// be a quad anyway. One <Instances> per pool is one draw call for up to 96
// marks; a mark is placed once, when its slot is reused (its `stamp`
// changes), and after that a frame only writes its fading colour.
//
// Additive, like every other light-drawn thing in the scene: a hole is a
// ring of heat that cools from amber to a dim line and then goes, rather
// than a dark patch the near-black walls could not show.
import { useEffect, useMemo, useRef } from "react";
import { Instance, Instances, type PositionMesh } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending } from "three";
import { useCanvasTexture } from "../core/useCanvasTexture";
import { doom } from "./doomStore";
import {
  MARK_FADE, MARK_LIFE, MAX_MARKS, MAX_SPLATS, SPLAT_FADE, SPLAT_LIFE, type Mark,
} from "./doomWorld";
import { drawBulletHole, drawIchor } from "./markArt";
import { HIDDEN_SCALE, POOL_DRAW_PRIORITY } from "./DoomEffects";

const MARK_SLOTS = Array.from({ length: MAX_MARKS }, (_, i) => i);
const SPLAT_SLOTS = Array.from({ length: MAX_SPLATS }, (_, i) => i);
// Off the surface, on top of the material's polygon offset, so a mark on a
// wall and one on the floor beside it never fight the surface they lie on.
const LIFT = 0.006;
const TEX = 128;

/** How a mark's colour runs over its life: `hot` for the first `cool`
 * seconds, easing to `cold`, then fading to nothing over the last `fade`. */
interface Tint {
  hot: readonly [number, number, number];
  cold: readonly [number, number, number];
  cool: number;
  life: number;
  fade: number;
}

// Amber heat cooling to a dim paper line.
const HOLE_TINT: Tint = { hot: [1.6, 0.85, 0.3], cold: [0.42, 0.4, 0.36], cool: 1.4, life: MARK_LIFE, fade: MARK_FADE };
// CRITICAL, bright as it lands, settling darker.
const ICHOR_TINT: Tint = { hot: [1.3, 0.3, 0.38], cold: [0.62, 0.12, 0.17], cool: 2.5, life: SPLAT_LIFE, fade: SPLAT_FADE };

function useArt(draw: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const { canvas, texture } = useCanvasTexture(TEX, TEX);
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, TEX, TEX);
    draw(ctx, TEX);
    texture.needsUpdate = true;
  }, [canvas, texture, draw]);
  return texture;
}

function MarkLayer({ pool, slots, tint, draw }: {
  pool: readonly Mark[];
  slots: readonly number[];
  tint: Tint;
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
}) {
  const texture = useArt(draw);
  const count = slots.length;
  const refs = useRef<(PositionMesh | null)[]>([]);
  // The stamp each slot was last placed for; -1 while it is hidden.
  const placed = useMemo(() => new Int32Array(count).fill(-1), [count]);
  useFrame(() => {
    const now = doom.time;
    for (let i = 0; i < count; i += 1) {
      const m = pool[i]!;
      const inst = refs.current[i];
      if (!inst) continue;
      if (!m.active) {
        if (placed[i] !== -1) {
          inst.scale.setScalar(HIDDEN_SCALE);
          inst.updateMatrixWorld();
          placed[i] = -1;
        }
        continue;
      }
      if (placed[i] !== m.stamp) {
        inst.position.set(m.x + m.nx * LIFT, m.y + m.ny * LIFT, m.z + m.nz * LIFT);
        // A plane faces +z; turn that onto the surface's normal, then spin
        // it about the normal so no two marks look stamped from one die.
        inst.lookAt(m.x + m.nx, m.y + m.ny, m.z + m.nz);
        inst.rotateZ(m.spin);
        inst.scale.set(m.size, m.size, 1);
        inst.updateMatrixWorld();
        placed[i] = m.stamp;
      }
      const age = now - m.bornAt;
      const heat = Math.max(0, 1 - age / tint.cool);
      const k = heat * heat;
      const fade = Math.min(1, Math.max(0, (tint.life - age) / tint.fade));
      inst.color.setRGB(
        (tint.cold[0] + (tint.hot[0] - tint.cold[0]) * k) * fade,
        (tint.cold[1] + (tint.hot[1] - tint.cold[1]) * k) * fade,
        (tint.cold[2] + (tint.hot[2] - tint.cold[2]) * k) * fade,
      );
    }
  }, POOL_DRAW_PRIORITY);
  return (
    <Instances limit={count} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        polygonOffset
        polygonOffsetFactor={-4}
        toneMapped={false}
      />
      {slots.map((i) => (
        <Instance key={i} ref={(el) => { refs.current[i] = el as PositionMesh | null; }} scale={HIDDEN_SCALE} />
      ))}
    </Instances>
  );
}

export function DoomMarks() {
  return (
    <>
      <MarkLayer pool={doom.marks} slots={MARK_SLOTS} tint={HOLE_TINT} draw={drawBulletHole} />
      <MarkLayer pool={doom.splats} slots={SPLAT_SLOTS} tint={ICHOR_TINT} draw={drawIchor} />
    </>
  );
}
