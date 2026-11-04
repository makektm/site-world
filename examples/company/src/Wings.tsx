// The areas the plan reserves outside the rooms — the factory hall and the
// loading dock — marked on the ground: a dashed outline and the area's name,
// so the site reads as one place before anything stands in them.
import { useEffect, useMemo } from "react";
import { Line } from "@react-three/drei";
import { PAPER, PAPER_DIM, fitText, useCanvasTexture, type LayoutWing } from "site-world";

const LABEL_H = 1.4;
const PX = 160;

function GroundLabel({ text, x, z, width }: { text: string; x: number; z: number; width: number }) {
  const { canvas, texture } = useCanvasTexture(Math.round(width * PX), Math.round(LABEL_H * PX));
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const paint = () => {
      if (!alive) return;
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = PAPER;
      ctx.globalAlpha = 0.55;
      ctx.font = `700 ${Math.round(h * 0.62)}px 'IBM Plex Mono', ui-monospace, monospace`;
      ctx.fillText(fitText(ctx, text, w - 20), w / 2, h / 2);
      ctx.globalAlpha = 1;
      texture.needsUpdate = true;
    };
    paint();
    void document.fonts?.ready.then(paint);
    return () => {
      alive = false;
    };
  }, [canvas, texture, text]);
  return (
    <mesh position={[x, 0.016, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, LABEL_H]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/** Each wing's outline, and its name along its edge nearest the building. */
export function Wings({ wings }: { wings: readonly LayoutWing[] }) {
  return (
    <>
      {wings.map((w) => (
        <Wing key={w.id} wing={w} />
      ))}
    </>
  );
}

function Wing({ wing }: { wing: LayoutWing }) {
  const { minX, maxX, minZ, maxZ } = wing.rect;
  const inset = 0.4;
  const outline = useMemo(
    () =>
      [
        [minX + inset, 0.02, minZ + inset],
        [maxX - inset, 0.02, minZ + inset],
        [maxX - inset, 0.02, maxZ - inset],
        [minX + inset, 0.02, maxZ - inset],
        [minX + inset, 0.02, minZ + inset],
      ] as [number, number, number][],
    [minX, maxX, minZ, maxZ],
  );
  // The name sits on the side that faces the building, where a walker arrives.
  const z = wing.side === "north" ? maxZ - inset - LABEL_H / 2 - 0.3 : minZ + inset + LABEL_H / 2 + 0.3;
  return (
    <>
      <Line points={outline} color={PAPER_DIM} lineWidth={1} transparent opacity={0.5} dashed dashSize={0.4} gapSize={0.25} />
      <GroundLabel text={wing.label} x={(minX + maxX) / 2} z={z} width={Math.min(maxX - minX - 1, 9)} />
    </>
  );
}
