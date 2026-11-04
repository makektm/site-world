// The room's name over each doorway, so a walker knows what is behind a door
// before opening it — the one thing a schematic world never says out loud
// until its walls are solid enough to need it. A banner hung on the door's
// header, centred in it, on the main room's own side. One reusable component
// for every door, not several near-identical copies (see useCanvasTexture.ts's
// own header on that exact mistake, made nine times over before that file
// existed).
import { useEffect } from "react";
import { Line } from "@react-three/drei";
import { DoubleSide } from "three";
import { fitText, INK, PAPER_DIM, PHOS, PHOS_HI, type DoorSignSpec } from "../core/engine";
import { WallCoordTag } from "../screens/WallCoordTag";
import { useCanvasTexture } from "../core/useCanvasTexture";

// Texels to the metre: about what the other plaques and boards carry. A banner
// is as wide as its doorway, so its texture follows that width.
const PX_PER_M = 320;
// The name's cap height is 0.4m, readable from across the main room's 17m; the
// line under it is a quarter of that.
const LABEL_PX = 180;
const SUB_PX = 44;
// Clear of the banner's own frame on each side.
const PAD_PX = 36;

/** A single banner: build-time text, drawn once and never touched again —
 * a "reference, not a reading" shape, like a wall plaque. */
function DoorSign({ label, sub, panelId, wall, pos, rotationY, width, height }: DoorSignSpec) {
  const { canvas, texture } = useCanvasTexture(Math.round(width * PX_PER_M), Math.round(height * PX_PER_M));

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
      ctx.strokeStyle = PHOS;
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // A name is never ellipsised: a banner too narrow for it shrinks it.
      ctx.font = `700 ${LABEL_PX}px 'IBM Plex Mono', monospace`;
      const fit = Math.min(1, (w - 2 * PAD_PX) / ctx.measureText(label).width);
      ctx.font = `700 ${Math.floor(LABEL_PX * fit)}px 'IBM Plex Mono', monospace`;
      ctx.fillStyle = PHOS_HI;
      ctx.fillText(label, w / 2, h * 0.41);
      ctx.font = `${SUB_PX}px 'IBM Plex Mono', monospace`;
      ctx.fillStyle = PAPER_DIM;
      ctx.fillText(fitText(ctx, sub, w - 2 * PAD_PX), w / 2, h * 0.795);
      texture.needsUpdate = true;
    };
    paint();
    // And again once the webfont has actually arrived — a canvas asked for
    // 'IBM Plex Mono' before it loads silently draws the fallback.
    void document.fonts?.ready.then(paint);
    return () => {
      live = false;
    };
  }, [canvas, texture, label, sub]);

  const frame: [number, number, number][] = [
    [-width / 2, -height / 2, 0.001],
    [width / 2, -height / 2, 0.001],
    [width / 2, height / 2, 0.001],
    [-width / 2, height / 2, 0.001],
    [-width / 2, -height / 2, 0.001],
  ];
  return (
    <group position={[pos[0], pos[1], pos[2]]} rotation={[0, rotationY, 0]}>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} side={DoubleSide} toneMapped={false} />
      </mesh>
      <Line points={frame} color={PHOS} lineWidth={1} transparent opacity={0.5} />
      <WallCoordTag id={panelId} x={wall[0]} z={wall[1]} panelW={width} panelH={height} />
    </group>
  );
}

/** One banner per doorway spec. A room with no door (only floor gaps) simply
 * has no sign. */
export function DoorSigns({ signs }: { signs: readonly DoorSignSpec[] }) {
  return (
    <>
      {signs.map((sign) => (
        <DoorSign key={sign.label} {...sign} />
      ))}
    </>
  );
}
