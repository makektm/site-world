// One unit of work — a ticket, a PR — as a box: dark body, edges in its
// status colour, an optional tag painted on the lid. Drawn at its own origin,
// base on y=0, so a host (or WorkLine) can move the group it sits in without
// knowing its size.
import { useEffect, useRef, useState } from "react";
import { Edges } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { AdditiveBlending } from "three";
import { CRITICAL, INFO, INK, OK, PAPER, PAPER_DIM, WARN, fitText, getGlowTexture } from "../core/engine";
import { useCanvasTexture } from "../core/useCanvasTexture";
import type { WorkStatus } from "./workLineLayout";

/** Edge colour per work status. */
export const CRATE_COLOR: Record<WorkStatus, string> = {
  queued: PAPER_DIM,
  working: PAPER,
  passing: OK,
  failing: CRITICAL,
  "waiting-review": WARN,
  merged: INFO,
  failed: CRITICAL,
  deployed: OK,
};

export interface CrateProps {
  status: WorkStatus;
  /** A few characters on the lid, e.g. "#412". */
  label?: string;
  /** Overrides the status colour. */
  color?: string;
  /** Edge length, metres. */
  size?: number;
  position?: readonly [number, number, number];
  rotationY?: number;
  /** Draws a halo round it. */
  selected?: boolean;
  /** Orbit-mode click. Leave undefined to make it inert. */
  onSelect?: () => void;
  /** Called with true on pointer enter and false on leave. */
  onHover?: (hovered: boolean) => void;
}

/** One unit of work as a box coloured by its status, with an optional lid tag. */
export function Crate({
  status, label, color, size = 0.34, position = [0, 0, 0], rotationY = 0, selected = false, onSelect, onHover,
}: CrateProps) {
  const c = color ?? CRATE_COLOR[status];
  const [hover, setHover] = useState(false);
  // A pointer cursor set on hover must not outlive the hover (see Plinth.tsx).
  const hovered = useRef(false);
  const interactive = onSelect !== undefined || onHover !== undefined;
  useEffect(() => () => {
    if (!hovered.current) return;
    hovered.current = false;
    document.body.style.cursor = "default";
  }, [interactive]);
  const handlers = interactive
    ? {
      onClick: (e: ThreeEvent<MouseEvent>) => {
        if (!onSelect) return;
        e.stopPropagation();
        onSelect();
      },
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        hovered.current = true;
        setHover(true);
        if (onSelect) document.body.style.cursor = "pointer";
        onHover?.(true);
      },
      onPointerOut: () => {
        hovered.current = false;
        setHover(false);
        document.body.style.cursor = "default";
        onHover?.(false);
      },
    }
    : {};
  const loud = status === "failing" || status === "failed";
  return (
    <group position={position as [number, number, number]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, size / 2, 0]} scale={hover ? 1.08 : 1} {...handlers}>
        <boxGeometry args={[size, size, size]} />
        <meshBasicMaterial color={INK} />
        <Edges color={c} />
      </mesh>
      {label && <Lid label={label} color={c} size={size} />}
      {(selected || hover || loud) && (
        <sprite position={[0, size / 2, 0]} scale={[size * (selected ? 4 : 3), size * (selected ? 4 : 3), 1]}>
          <spriteMaterial
            map={getGlowTexture()}
            color={selected ? PAPER : c}
            transparent
            opacity={selected ? 0.7 : 0.45}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </sprite>
      )}
    </group>
  );
}

function Lid({ label, color, size }: { label: string; color: string; size: number }) {
  const { canvas, texture } = useCanvasTexture(128, 128);
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const paint = () => {
      if (!alive) return;
      const { width: w, height: h } = canvas;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 40px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.fillText(fitText(ctx, label, w - 12), w / 2, h / 2 + 2);
      texture.needsUpdate = true;
    };
    paint();
    void document.fonts?.ready.then(paint);
    return () => {
      alive = false;
    };
  }, [canvas, texture, label, color]);
  return (
    <mesh position={[0, size + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size * 0.84, size * 0.84]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
