// The sprawl layer, drawn round the pylons rather than on them: tree rings at
// each base for age, a coloured hazard collar on both halves of a look-alike
// pair with a line on the floor joining them, and dust settling round the
// orphans nothing calls. Two layers share it: age (the rings) and ownership
// (collars, links and dust, alongside the pylons' own trim and plates in
// serviceRoom.tsx).
import { useEffect, useMemo, useRef } from "react";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { MeshBasicMaterial, RingGeometry, type Sprite } from "three";
import { NameTag, PAPER_DIM, getGlowTexture, ringPoints, type ServiceSlot } from "site-world";
import type { FactoryService } from "./factory/catalog";
import { PLAN } from "./plan";
import { MAX_RINGS, type PylonLook } from "./sprawlLook";
import { rectAround, useLod } from "./useLod";

const RING0 = 0.36;
const RING_STEP = 0.07;
const DUST = 10;
const DUST_TINT = "#3d382c";

type Slot = ServiceSlot<FactoryService>;

/** The rings' geometry and material, shared by every pylon and disposed with the layer. */
function useRingKit() {
  const kit = useMemo(
    () => ({
      geometries: Array.from({ length: MAX_RINGS }, (_, i) => new RingGeometry(RING0 + i * RING_STEP, RING0 + i * RING_STEP + 0.022, 40)),
      material: new MeshBasicMaterial({ color: PAPER_DIM, transparent: true, opacity: 0.6, depthWrite: false }),
    }),
    [],
  );
  useEffect(
    () => () => {
      kit.geometries.forEach((g) => g.dispose());
      kit.material.dispose();
    },
    [kit],
  );
  return kit;
}

function AgeRings({ slot, rings, kit }: { slot: Slot; rings: number; kit: ReturnType<typeof useRingKit> }) {
  return (
    <group position={[slot.pos[0], 0.02, slot.pos[1]]} rotation={[-Math.PI / 2, 0, 0]}>
      {kit.geometries.slice(0, rings).map((g, i) => (
        <mesh key={i} geometry={g} material={kit.material} />
      ))}
    </group>
  );
}

function Collar({ slot, tint }: { slot: Slot; tint: string }) {
  const ring = useMemo(() => ringPoints([0, 0], 1.32, 0.03, 48), []);
  return (
    <group position={[slot.pos[0], 0, slot.pos[1]]}>
      {[0.28, 0.5].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.3, 0.31, 0.1, 6, 1, true]} />
          <meshBasicMaterial color={tint} toneMapped={false} />
        </mesh>
      ))}
      <Line points={ring} color={tint} lineWidth={1.5} transparent opacity={0.85} dashed dashSize={0.22} gapSize={0.12} />
    </group>
  );
}

function PairLink({ a, b, tint }: { a: Slot; b: Slot; tint: string }) {
  const mid: [number, number] = [(a.pos[0] + b.pos[0]) / 2, (a.pos[1] + b.pos[1]) / 2];
  const lod = useLod(rectAround(mid));
  const points = useMemo(() => {
    // From ring edge to ring edge, so the line reads as joining the two collars.
    const dx = b.pos[0] - a.pos[0];
    const dz = b.pos[1] - a.pos[1];
    const d = Math.hypot(dx, dz) || 1;
    const k = 1.32 / d;
    return [
      [a.pos[0] + dx * k, 0.04, a.pos[1] + dz * k],
      [b.pos[0] - dx * k, 0.04, b.pos[1] - dz * k],
    ] as [number, number, number][];
  }, [a, b]);
  return (
    <>
      <Line points={points} color={tint} lineWidth={2.5} transparent opacity={0.9} dashed dashSize={0.3} gapSize={0.15} />
      {lod === "detail" && <NameTag text="≈ look-alike" sub={`${a.name} · ${b.name}`} accent={tint} position={[mid[0], 0.5, mid[1]]} height={0.2} />}
    </>
  );
}

/** Dust settling on a service nothing calls: a dark patch and a few motes drifting down. */
function Dust({ slot, reduce }: { slot: Slot; reduce: boolean }) {
  const motes = useRef<(Sprite | null)[]>([]);
  const seeds = useMemo(() => Array.from({ length: DUST }, (_, i) => ({ a: i * 2.4 + slot.index, r: 0.35 + ((i * 37) % 7) * 0.12, v: 0.06 + (i % 3) * 0.03 })), [slot.index]);
  useFrame(({ clock }) => {
    const t = reduce ? 0 : clock.elapsedTime;
    seeds.forEach((s, i) => {
      const m = motes.current[i];
      if (!m) return;
      const y = 2.6 - ((t * s.v + i / DUST) % 1) * 2.5;
      m.position.set(Math.cos(s.a + t * 0.05) * s.r, y, Math.sin(s.a + t * 0.05) * s.r);
    });
  });
  return (
    <group position={[slot.pos[0], 0, slot.pos[1]]}>
      {/* Murky rather than black: on a black floor, black reads as nothing at all. */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.25, 40]} />
        <meshBasicMaterial color={DUST_TINT} transparent opacity={0.55} depthWrite={false} />
      </mesh>
      {seeds.map((_, i) => (
        <sprite key={i} ref={(el) => { motes.current[i] = el; }} scale={[0.14, 0.14, 1]}>
          <spriteMaterial map={getGlowTexture()} color="#a59e8c" transparent opacity={0.8} depthWrite={false} />
        </sprite>
      ))}
    </group>
  );
}

export interface SprawlProps {
  looks: ReadonlyMap<string, PylonLook>;
  /** The age layer: tree rings. */
  showAge: boolean;
  /** The ownership layer: look-alike collars and links, orphan dust. */
  showFindings: boolean;
  reduce: boolean;
}

export function Sprawl({ looks, showAge, showFindings, reduce }: SprawlProps) {
  const kit = useRingKit();
  const slots = PLAN.slots.filter((s) => looks.has(s.name));
  const pairs = slots.flatMap((s) => {
    const p = looks.get(s.name)!.pair;
    const other = p && PLAN.slotByName[p.with];
    // Each pair once: from the name that sorts first.
    return p && other && s.name < p.with ? [{ a: s, b: other, tint: p.tint }] : [];
  });
  return (
    <>
      {slots.map((s) => {
        const look = looks.get(s.name)!;
        return (
          <group key={s.name}>
            {showAge && <AgeRings slot={s} rings={look.rings} kit={kit} />}
            {showFindings && look.pair && <Collar slot={s} tint={look.pair.tint} />}
            {showFindings && look.orphan && <Dust slot={s} reduce={reduce} />}
          </group>
        );
      })}
      {showFindings && pairs.map((p) => (
        <PairLink key={`${p.a.name}~${p.b.name}`} a={p.a} b={p.b} tint={p.tint} />
      ))}
    </>
  );
}
