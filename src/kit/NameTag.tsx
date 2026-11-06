// A floating name tag: a dark pill with a coloured edge, one bold line and an
// optional dim second line, drawn to a canvas and shown on a sprite so it
// always faces the camera. Sized to its text, so a short name is a short tag
// rather than a fixed-width plate with a lot of empty dark.
import { useEffect, useMemo } from "react";
import { INK, PAPER, PAPER_DIM, fitText } from "../core/engine";
import { useCanvasTexture } from "../core/useCanvasTexture";

const FONT = "'IBM Plex Mono', ui-monospace, monospace";
const LINE_PX = 44;
const SUB_PX = 30;
const PAD_X = 26;
// Wide enough for a long agent session name; past this the text is cut with
// an ellipsis rather than the tag growing across the room.
const MAX_W = 900;

/** Floating, camera-facing text tag on a canvas texture; anchored at its bottom centre. */
export function NameTag({
  text, sub, accent = PAPER, position = [0, 0, 0], height = 0.2, opacity = 1,
}: {
  text: string;
  /** A dimmer second line (state, ticket, branch). */
  sub?: string;
  /** Edge and marker colour. */
  accent?: string;
  /** Where the tag's bottom centre sits, in the parent's space. */
  position?: readonly [number, number, number];
  /** World height of a one-line tag, metres; a two-line tag is taller in proportion. */
  height?: number;
  opacity?: number;
}) {
  const hPx = sub ? LINE_PX + SUB_PX + 44 : LINE_PX + 34;
  // Measured before the canvas exists, because the canvas's size depends on
  // it. jsdom (tests) has no 2D context; a monospace estimate stands in.
  const wPx = useMemo(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    let w: number;
    if (ctx) {
      ctx.font = `700 ${LINE_PX}px ${FONT}`;
      w = ctx.measureText(text).width;
      if (sub) {
        ctx.font = `${SUB_PX}px ${FONT}`;
        w = Math.max(w, ctx.measureText(sub).width);
      }
    } else {
      w = Math.max(text.length * LINE_PX * 0.6, (sub?.length ?? 0) * SUB_PX * 0.6);
    }
    // Rounded up to 32px so a tag whose text changes by a character or two
    // keeps its canvas instead of rebuilding the texture.
    return Math.min(MAX_W, Math.ceil((w + PAD_X * 2 + 18) / 32) * 32);
  }, [text, sub]);
  const { canvas, texture } = useCanvasTexture(wPx, hPx);

  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const paint = () => {
      if (!alive) return;
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      const r = 14;
      ctx.beginPath();
      ctx.roundRect(3, 3, w - 6, h - 6, r);
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.86;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3;
      ctx.strokeStyle = accent;
      ctx.stroke();
      // A marker bar in the accent: the colour still reads when the tag is
      // small and far, where the thin edge does not.
      ctx.fillStyle = accent;
      ctx.fillRect(PAD_X - 12, 16, 6, h - 32);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = PAPER;
      ctx.font = `700 ${LINE_PX}px ${FONT}`;
      const x = PAD_X + 6;
      const maxText = w - x - PAD_X;
      ctx.fillText(fitText(ctx, text, maxText), x, sub ? 18 + LINE_PX / 2 + 4 : h / 2 + 2);
      if (sub) {
        ctx.fillStyle = PAPER_DIM;
        ctx.font = `${SUB_PX}px ${FONT}`;
        ctx.fillText(fitText(ctx, sub, maxText), x, h - 22 - SUB_PX / 2 + 2);
      }
      texture.needsUpdate = true;
    };
    paint();
    void document.fonts?.ready.then(paint);
    return () => {
      alive = false;
    };
  }, [canvas, texture, text, sub, accent]);

  const worldH = (height * hPx) / (LINE_PX + 34);
  const worldW = (worldH * wPx) / hPx;
  return (
    <sprite position={position as [number, number, number]} scale={[worldW, worldH, 1]} center={[0.5, 0]}>
      <spriteMaterial map={texture} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </sprite>
  );
}
