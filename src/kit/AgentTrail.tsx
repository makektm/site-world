// A faint line along the floor where something has just been: it records the
// followed object's position as it moves and fades from now to the oldest
// point. Render it beside the object, under the same parent, because it reads
// `target.position` (parent space) and draws in that same space.
import { useEffect, useMemo, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Line, LineBasicMaterial, type Object3D } from "three";
import { PAPER_DIM } from "../core/engine";

/** A fading line of the recent path of `target`, drawn on the floor in the parent's space. */
export function AgentTrail({
  target, color = PAPER_DIM, length = 48, minStep = 0.12, y = 0.03, opacity = 0.6,
}: {
  /** The moving object to follow (its `.position`, not its world position). */
  target: RefObject<Object3D | null>;
  color?: string;
  /** How many points the trail keeps; with `minStep` this sets how far back it reaches. */
  length?: number;
  /** A new point is kept only once the target has moved this far (metres), so standing still does not eat the history. */
  minStep?: number;
  /** Height above the floor. */
  y?: number;
  opacity?: number;
}) {
  const n = Math.max(2, Math.floor(length));
  // Imperative, because the buffer is rewritten in place every few frames and
  // drei's <Line> would rebuild its geometry on every new points array.
  const line = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(n * 3), 3));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(n * 3), 3));
    geometry.setDrawRange(0, 0);
    // Additive, so fading a vertex's colour to black fades it out; no
    // per-vertex alpha needed.
    const material = new LineBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
    });
    const obj = new Line(geometry, material);
    obj.frustumCulled = false;
    return obj;
  }, [n]);
  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as LineBasicMaterial).dispose();
  }, [line]);
  useEffect(() => {
    const m = line.material as LineBasicMaterial;
    m.color.set(color);
    m.opacity = opacity;
  }, [line, color, opacity]);

  const history = useMemo(() => ({ xs: [] as number[], zs: [] as number[] }), [line]);

  useFrame(() => {
    const t = target.current;
    if (!t) return;
    const { xs, zs } = history;
    const lx = xs[xs.length - 1];
    const lz = zs[zs.length - 1];
    if (lx !== undefined && lz !== undefined && Math.hypot(t.position.x - lx, t.position.z - lz) < minStep) return;
    xs.push(t.position.x);
    zs.push(t.position.z);
    if (xs.length > n) {
      xs.shift();
      zs.shift();
    }
    const pos = line.geometry.getAttribute("position") as BufferAttribute;
    const col = line.geometry.getAttribute("color") as BufferAttribute;
    const count = xs.length;
    for (let i = 0; i < count; i += 1) {
      pos.setXYZ(i, xs[i]!, y, zs[i]!);
      const f = count === 1 ? 1 : i / (count - 1);
      col.setXYZ(i, f, f, f);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    line.geometry.setDrawRange(0, count);
  });

  return <primitive object={line} />;
}
