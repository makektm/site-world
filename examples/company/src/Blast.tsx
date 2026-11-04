// Blast radius: if the selected service fails, who breaks? Walks the call
// graph backwards from it (callers of callers) and marks each service hit by
// how many hops away it is, with the calls that carry the failure drawn hot
// over the roofs. The host decides when: a selected service and the layer on.
import { useMemo } from "react";
import { QuadraticBezierLine } from "@react-three/drei";
import { AdditiveBlending, QuadraticBezierCurve3, Vector3 } from "three";
import {
  CRITICAL, NameTag, PAPER, PAPER_DIM, WALL, WARN, blastDepths, blastPaths, blastRadius, getGlowTexture,
} from "site-world";

type FloorPos = readonly [number, number];

/** Colour by hops from the failure: the direct callers are red, the next ring amber, then dim. */
export function blastColor(depth: number): string {
  return depth === 0 ? PAPER : depth === 1 ? CRITICAL : depth === 2 ? WARN : PAPER_DIM;
}

const ARC_Y = WALL + 0.7;

function HotArc({ a, b, color }: { a: FloorPos; b: FloorPos; color: string }) {
  const curve = useMemo(() => {
    const start = new Vector3(a[0], ARC_Y, a[1]);
    const end = new Vector3(b[0], ARC_Y, b[1]);
    const mid = start.clone().lerp(end, 0.5);
    mid.y += start.distanceTo(end) * 0.32;
    return new QuadraticBezierCurve3(start, mid, end);
  }, [a, b]);
  return <QuadraticBezierLine start={curve.v0} mid={curve.v1} end={curve.v2} color={color} lineWidth={3} transparent opacity={0.9} />;
}

export interface BlastProps {
  /** The failing service. */
  service: string;
  calls: readonly (readonly [string, string])[];
  slots: Readonly<Record<string, { pos: FloorPos }>>;
}

export function Blast({ service, calls, slots }: BlastProps) {
  const hits = useMemo(() => blastRadius(calls.map(([from, to]) => ({ from, to })), service, "in"), [calls, service]);
  const depths = useMemo(() => blastDepths(hits), [hits]);
  const paths = useMemo(() => blastPaths(hits), [hits]);
  const origin = slots[service];
  if (!origin) return null;
  const affected = hits.length - 1;
  return (
    <>
      {hits.map((h) => {
        const s = slots[h.id];
        if (!s) return null;
        const color = blastColor(h.depth);
        return (
          <group key={h.id} position={[s.pos[0], 0, s.pos[1]]}>
            <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[1.3, h.depth === 0 ? 1.5 : 1.42, 48]} />
              <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} toneMapped={false} />
            </mesh>
            <sprite position={[0, 0.3, 0]} scale={[3.4, 3.4, 1]}>
              <spriteMaterial map={getGlowTexture()} color={color} transparent opacity={0.35} depthWrite={false} blending={AdditiveBlending} />
            </sprite>
          </group>
        );
      })}
      {/* Callee -> caller: the direction the failure travels. */}
      {paths.map(([via, id]) => {
        const a = slots[via];
        const b = slots[id];
        return a && b ? <HotArc key={`${via}>${id}`} a={a.pos} b={b.pos} color={blastColor(depths.get(id) ?? 3)} /> : null;
      })}
      <NameTag
        text={`if ${service} fails`}
        sub={affected === 0 ? "nothing calls it" : `${affected} service${affected === 1 ? "" : "s"} break`}
        accent={CRITICAL}
        position={[origin.pos[0], WALL + 0.4, origin.pos[1]]}
        height={0.34}
      />
    </>
  );
}
