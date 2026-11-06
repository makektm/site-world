// A checkpoint on a belt: two posts and a header the belt runs through, a
// board on top naming the stage with the count of work waiting there, and a
// status light. The board is painted on both faces, because a line is walked
// along from either end.
import { useEffect, useRef } from "react";
import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, type SpriteMaterial } from "three";
import { CRITICAL, INK, OK, PAPER, PAPER_DIM, WALL_FILL, WARN, fitText, getGlowTexture } from "../core/engine";
import { useCanvasTexture } from "../core/useCanvasTexture";
import type { StationStatus } from "./workLineLayout";

/** Status-light colour per station status. */
export const STATION_COLOR: Record<StationStatus, string> = { idle: PAPER_DIM, ok: OK, warn: WARN, critical: CRITICAL };

export interface StationProps {
  /** Floor position [x, z] of the gate's centre. */
  at: readonly [number, number];
  /** Rotation about y; the belt runs along the gate's local z. */
  rotationY?: number;
  /** The clear width between the posts, metres — the belt's width. */
  width?: number;
  /** Height of the header's underside, metres. */
  height?: number;
  /** Stage name, e.g. "REVIEW". */
  label: string;
  /** Items waiting at this stage. */
  count?: number;
  status?: StationStatus;
  /** A second line under the label, e.g. "2 humans". */
  sub?: string;
  /** Orbit-mode click on the board or posts. */
  onSelect?: () => void;
  /** Reduced motion: a critical light holds steady instead of pulsing. */
  reduce?: boolean;
}

const BOARD_H = 0.62;
const POST = 0.12;

/** A gate on a belt with a stage label, a waiting-count and a status light. */
export function Station({
  at, rotationY = 0, width = 1.1, height = 1.6, label, count = 0, status = "idle", sub, onSelect, reduce = false,
}: StationProps) {
  const span = width + 0.3;
  const boardW = Math.max(span + POST * 2, 1.9);
  const color = STATION_COLOR[status];
  const { canvas, texture } = useCanvasTexture(Math.round(boardW * 240), Math.round(BOARD_H * 240));
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const paint = () => {
      if (!alive) return;
      const { width: w, height: h } = canvas;
      const mono = (px: number, bold = false) => `${bold ? "700 " : ""}${px}px 'IBM Plex Mono', ui-monospace, monospace`;
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      const countText = String(count);
      ctx.textBaseline = "middle";
      ctx.textAlign = "right";
      ctx.fillStyle = color;
      ctx.font = mono(Math.round(h * 0.6), true);
      const countW = ctx.measureText(countText).width;
      ctx.fillText(countText, w - 26, h / 2 + 4);
      ctx.textAlign = "left";
      ctx.fillStyle = PAPER;
      // Shrink before truncating: a stage name is short and must read whole.
      const room = w - countW - 70;
      let px = Math.round(h * (sub ? 0.34 : 0.42));
      ctx.font = mono(px, true);
      while (px > 18 && ctx.measureText(label).width > room) {
        px -= 2;
        ctx.font = mono(px, true);
      }
      ctx.fillText(fitText(ctx, label, room), 26, sub ? h * 0.36 : h / 2 + 2);
      if (sub) {
        ctx.fillStyle = PAPER_DIM;
        ctx.font = mono(Math.round(h * 0.2));
        ctx.fillText(fitText(ctx, sub, w - countW - 70), 26, h * 0.72);
      }
      texture.needsUpdate = true;
    };
    paint();
    void document.fonts?.ready.then(paint);
    return () => {
      alive = false;
    };
  }, [canvas, texture, label, sub, count, color]);

  const glow = useRef<SpriteMaterial>(null);
  useFrame(({ clock }) => {
    if (!glow.current) return;
    glow.current.opacity = status === "critical" && !reduce ? 0.45 + 0.35 * Math.sin(clock.elapsedTime * 4) : 0.6;
  });

  // A pointer cursor set on hover must not outlive the hover (see Plinth.tsx).
  const hovered = useRef(false);
  const active = onSelect !== undefined;
  useEffect(() => () => {
    if (!hovered.current) return;
    hovered.current = false;
    document.body.style.cursor = "";
  }, [active]);
  const pointer = onSelect
    ? {
      onClick: (e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        onSelect();
      },
      onPointerOver: () => {
        hovered.current = true;
        document.body.style.cursor = "pointer";
      },
      onPointerOut: () => {
        hovered.current = false;
        document.body.style.cursor = "";
      },
    }
    : {};

  const boardY = height + 0.12 + BOARD_H / 2;
  return (
    <group position={[at[0], 0, at[1]]} rotation={[0, rotationY, 0]}>
      <group {...pointer}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (span / 2 + POST / 2), (height + 0.12) / 2, 0]}>
            <boxGeometry args={[POST, height + 0.12, POST * 2]} />
            <meshBasicMaterial color={WALL_FILL} />
            <Edges color={PAPER} />
          </mesh>
        ))}
        <mesh position={[0, height + 0.06, 0]}>
          <boxGeometry args={[span + POST * 2, 0.12, POST * 2]} />
          <meshBasicMaterial color={WALL_FILL} />
          <Edges color={PAPER} />
        </mesh>
        {[0, Math.PI].map((ry) => (
          <mesh key={ry} position={[0, boardY, 0]} rotation={[0, ry, 0]}>
            {/* Two single-sided planes back to back rather than one DoubleSide
                plane, whose back face would show the text mirrored. */}
            <planeGeometry args={[boardW, BOARD_H]} />
            <meshBasicMaterial map={texture} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <group position={[0, boardY + BOARD_H / 2 + 0.18, 0]}>
        <mesh>
          <octahedronGeometry args={[0.11, 0]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        <sprite scale={[1.1, 1.1, 1]}>
          <spriteMaterial ref={glow} map={getGlowTexture()} color={color} transparent opacity={0.6} depthWrite={false} blending={AdditiveBlending} />
        </sprite>
      </group>
      {status === "critical" && (
        // A floor pool under a jammed gate, so the problem shows from above
        // too, where the board is seen edge-on.
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[span * 2.2, span * 2.2]} />
          <meshBasicMaterial map={getGlowTexture()} color={CRITICAL} transparent opacity={0.35} depthWrite={false} blending={AdditiveBlending} />
        </mesh>
      )}
    </group>
  );
}

