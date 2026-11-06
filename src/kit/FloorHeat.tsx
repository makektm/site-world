// A heat map painted on the floor: where the money (or tokens, or errors) go,
// as a glow pooled under the things that spend it. One canvas texel per grid
// cell, stretched with linear filtering, so a 40x40m floor at 4 cells a metre
// is a 160px canvas and the smoothing is free on the GPU.
import { useMemo } from "react";
import { heatBounds, heatColor, heatGrid, type HeatBounds, type HeatPoint } from "./infraMath";
import { useInfraPaint } from "./infraPaint";

export interface FloorHeatProps {
  points: readonly HeatPoint[];
  /** World rectangle to cover; defaults to the points' extent plus `radius * 2`. */
  bounds?: HeatBounds;
  /** Grid cells per metre. */
  resolution?: number;
  /** Each point's spread in metres (the gaussian's 1-sigma). */
  radius?: number;
  /** Value that reads as hottest; defaults to the hottest cell. Fix it to compare frames. */
  max?: number;
  /** Height above the floor; just above it so it never z-fights with a grid. */
  y?: number;
  opacity?: number;
}

/** A floor overlay heat map built from {x, z, value} points. */
export function FloorHeat({
  points, bounds, resolution = 4, radius = 1.5, max, y = 0.012, opacity = 0.6,
}: FloorHeatProps) {
  const cell = 1 / Math.max(0.1, resolution);
  const b = useMemo(() => bounds ?? heatBounds(points, radius * 2), [bounds, points, radius]);
  const grid = useMemo(() => heatGrid(points, b, cell, radius, max), [points, b, cell, radius, max]);
  const texture = useInfraPaint(
    grid.cols,
    grid.rows,
    (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let i = 0; i < grid.cells.length; i += 1) {
        const [r, g, bl, a] = heatColor(grid.cells[i]!);
        img.data[i * 4] = r;
        img.data[i * 4 + 1] = g;
        img.data[i * 4 + 2] = bl;
        img.data[i * 4 + 3] = a;
      }
      ctx.putImageData(img, 0, 0);
    },
    [grid],
  );
  // The grid rounds up to whole cells, so the plane is sized from the grid,
  // not the bounds, and anchored at the bounds' min corner to keep each texel
  // over the cell it was computed for.
  const w = grid.cols * cell;
  const d = grid.rows * cell;
  // Laid flat with rotation -PI/2 about x, the texture's top row (row 0)
  // lands at -z, which is minZ — the grid's own row order.
  return (
    <mesh position={[b.minX + w / 2, y, b.minZ + d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
