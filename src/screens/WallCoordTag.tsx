// A small reusable tile that prints a short ID ("P3", "W7") over a world
// (x, z) coordinate. "P3 at (4, 8.5)" or "the wall W8" is a real, unambiguous
// handle for talking about a specific spot instead of describing it — useful
// the moment there's more than one of anything on the wall. The IDs are the host's (panels, wall runs).
//
// The coordinate is always the wall centre-line point a panel hangs at, never
// the shifted position of its plane (the engine's standoffs), so the
// number a person quotes stays put if a panel's standoff changes.
//
// Two ways to place it, both in the top-right corner as seen from the room:
// `WallCoordTag` nests inside a panel's own (possibly rotated) group;
// `WallCoordMarker` stands alone in world space for a bare wall run that
// carries no panel. A plane's local +x is the right hand of someone facing
// its front face, so "top-right" is just the top of the +x end.
import { useEffect } from "react";
import { DoubleSide } from "three";
import { INK, PAPER, PAPER_DIM, WALL, WALL_FACE, type WallRun } from "../core/engine";
import { useCanvasTexture } from "../core/useCanvasTexture";

const TAG_W = 0.38;
const TAG_H = 0.17;
const TAG_MARGIN = 0.02;
// In front of the surface it labels, and past the frame lines panels draw at
// 0.001-0.003, so it never z-fights with either.
const TAG_LIFT = 0.005;

function useTagTexture(id: string, x: number, z: number) {
  // 800 texels to the metre both ways.
  const { canvas, texture } = useCanvasTexture(304, 136);

  const label = `${x.toFixed(1)}, ${z.toFixed(1)}`;

  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let live = true;
    const paint = () => {
      if (!live) return;
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = PAPER_DIM;
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = PAPER;
      ctx.font = "700 70px 'IBM Plex Mono', monospace";
      ctx.fillText(id, w / 2, 47);
      ctx.fillStyle = PAPER_DIM;
      ctx.font = "28px 'IBM Plex Mono', monospace";
      ctx.fillText(label, w / 2, 108);
      texture.needsUpdate = true;
    };
    paint();
    // And again once the webfont has actually arrived — a canvas asked for
    // 'IBM Plex Mono' before it loads silently draws the fallback.
    void document.fonts?.ready.then(paint);
    return () => {
      live = false;
    };
  }, [canvas, texture, id, label]);

  return texture;
}

/** The tile itself: its top-right corner TAG_MARGIN in from (`right`, `top`)
 * in the parent's own frame, and `lift` in front of it. */
function Tag({
  id, x, z, right, top, lift,
}: {
  id: string;
  x: number;
  z: number;
  right: number;
  top: number;
  lift: number;
}) {
  const texture = useTagTexture(id, x, z);
  return (
    <mesh position={[right - TAG_W / 2 - TAG_MARGIN, top - TAG_H / 2 - TAG_MARGIN, lift]}>
      <planeGeometry args={[TAG_W, TAG_H]} />
      <meshBasicMaterial map={texture} side={DoubleSide} transparent toneMapped={false} />
    </mesh>
  );
}

/** Drop as a child into any wall panel's own group: sits in that panel's
 * top-right corner and inherits the panel's own position/rotation. `id` is
 * the panel's own, assigned by the host; `x`, `z` are the wall
 * centre-line point it hangs at. */
export function WallCoordTag({
  id, x, z, panelW, panelH,
}: {
  id: string;
  x: number;
  z: number;
  panelW: number;
  panelH: number;
}) {
  return <Tag id={id} x={x} z={z} right={panelW / 2} top={panelH / 2} lift={TAG_LIFT} />;
}

/** A standalone tag for a bare wall run that carries no panel: in the run's
 * top-right corner on the wall's visible face, its coordinate the run's
 * midpoint. Positioned and oriented in world space from the run's own
 * centre-line, then lifted off the face along the inward normal. */
export function WallCoordMarker({ run }: { run: WallRun }) {
  return (
    <group position={[run.x, WALL / 2, run.z]} rotation={[0, run.ry, 0]}>
      <Tag
        id={run.id}
        x={run.x}
        z={run.z}
        right={run.length / 2 - run.rightInset}
        top={WALL / 2}
        lift={WALL_FACE + TAG_LIFT}
      />
    </group>
  );
}
