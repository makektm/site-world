// Plain building blocks for a world's floor and walls, so a host can stand up a
// room without writing geometry: a graph-paper floor over a rectangle, and
// wall boxes drawn as dark fill with cream edges (the same boxes the walk
// solids use, so what you see is what you collide with).
import { Edges, Grid } from "@react-three/drei";
import { PAPER, WALL_FILL, type WallSegment } from "../core/engine";

/** A graph-paper floor over [minX, maxX] x [minZ, maxZ]. */
export function GridFloor({
  minX, maxX, minZ, maxZ,
}: {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}) {
  return (
    <Grid
      args={[maxX - minX, maxZ - minZ]}
      cellSize={0.5}
      cellThickness={0.45}
      cellColor={PAPER}
      sectionSize={2}
      sectionThickness={1.05}
      sectionColor={PAPER}
      fadeDistance={64}
      fadeStrength={0.18}
      infiniteGrid={false}
      position={[(minX + maxX) / 2, 0.001, (minZ + maxZ) / 2]}
    />
  );
}

/** Wall boxes: opaque dark fill with a cream edge. Pass the same list to
 * <WallSolids> so the walker cannot pass through what is drawn. */
export function WallBoxes({ walls }: { walls: readonly WallSegment[] }) {
  return (
    <>
      {walls.map((w, i) => (
        <mesh key={i} position={[w.pos[0], w.pos[1], w.pos[2]]}>
          <boxGeometry args={[w.size[0], w.size[1], w.size[2]]} />
          <meshBasicMaterial color={WALL_FILL} />
          <Edges color={PAPER} />
        </mesh>
      ))}
    </>
  );
}

/** The invisible collision twin of <WallBoxes>: give it to <SiteWorld solids>. */
export function WallSolids({ walls }: { walls: readonly WallSegment[] }) {
  return (
    <>
      {walls.map((w, i) => (
        <mesh key={i} position={[w.pos[0], w.pos[1], w.pos[2]]}>
          <boxGeometry args={[w.size[0], w.size[1], w.size[2]]} />
        </mesh>
      ))}
    </>
  );
}

/** A flat floor slab to stand on, as a walk solid. Cover the whole footprint. */
export function FloorSolid({
  minX, maxX, minZ, maxZ,
}: {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}) {
  return (
    <mesh position={[(minX + maxX) / 2, -0.05, (minZ + maxZ) / 2]}>
      <boxGeometry args={[maxX - minX, 0.1, maxZ - minZ]} />
    </mesh>
  );
}
