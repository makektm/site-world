// The canvas-painting the infra props share: paint a canvas texture now and
// again once the webfont lands, and a two-line label plate built on it. Each
// prop used to need the same alive-flag/fonts.ready dance; one copy keeps the
// "draw again after the font arrives" fix from being missed in the next prop.
import { useEffect, type DependencyList } from "react";
import { Billboard } from "@react-three/drei";
import type { CanvasTexture } from "three";
import { INK, PAPER, PAPER_DIM, fitText } from "../core/engine";
import { useCanvasTexture } from "../core/useCanvasTexture";

/** The mono stack every painted surface in the world uses. */
export function infraFont(px: number, bold = false): string {
  return `${bold ? "700 " : ""}${px}px 'IBM Plex Mono', ui-monospace, monospace`;
}

/** A `width` x `height` px canvas texture painted by `paint` whenever `deps`
 * change, and once more when document fonts are ready — a canvas asked for
 * 'IBM Plex Mono' before it loads silently draws the fallback. The texture is
 * disposed on unmount (useCanvasTexture). */
export function useInfraPaint(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  deps: DependencyList,
): CanvasTexture {
  const { canvas, texture } = useCanvasTexture(width, height);
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const run = () => {
      if (!alive) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      paint(ctx, canvas.width, canvas.height);
      texture.needsUpdate = true;
    };
    run();
    void document.fonts?.ready.then(run);
    return () => {
      alive = false;
    };
    // `paint` is a fresh closure every render; what it draws is `deps`.
  }, [canvas, texture, ...deps]);
  return texture;
}

export interface InfraLabelProps {
  position: readonly [number, number, number];
  text: string;
  sub?: string;
  /** Colour of the sub line (a status colour, usually). */
  subColor?: string;
  /** Plate size in metres. */
  width?: number;
  height?: number;
  /** Turn to face the camera (default). False hangs it flat in its parent's frame, facing +z. */
  billboard?: boolean;
  /** Draw an INK plate behind the text, for labels over busy backgrounds. */
  plate?: boolean;
}

const LABEL_PX = 260;

/** A one- or two-line name plate: a title in PAPER and an optional status line. */
export function InfraLabel({
  position, text, sub, subColor = PAPER_DIM, width = 1.8, height = 0.48, billboard = true, plate = false,
}: InfraLabelProps) {
  const texture = useInfraPaint(
    Math.round(width * LABEL_PX),
    Math.round(height * LABEL_PX),
    (ctx, w, h) => {
      if (plate) {
        ctx.fillStyle = INK;
        ctx.globalAlpha = 0.82;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = PAPER_DIM;
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, w - 4, h - 4);
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = PAPER;
      ctx.font = infraFont(Math.round(h * (sub ? 0.4 : 0.55)), true);
      ctx.fillText(fitText(ctx, text, w - 20), w / 2, sub ? h * 0.34 : h / 2);
      if (sub) {
        ctx.fillStyle = subColor;
        ctx.font = infraFont(Math.round(h * 0.26));
        ctx.fillText(fitText(ctx, sub, w - 20), w / 2, h * 0.76);
      }
    },
    [text, sub, subColor, plate],
  );
  const mesh = (
    <mesh>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
  return billboard ? (
    <Billboard position={position as [number, number, number]}>{mesh}</Billboard>
  ) : (
    <group position={position as [number, number, number]}>{mesh}</group>
  );
}
