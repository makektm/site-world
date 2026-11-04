// Everything the world keeps in a fixed pool, drawn: the sidearm's rounds
// as tracers, sparks, floor rings, and pickups. Each pool is mounted once at
// its full size and each frame only copies the pool's slots onto refs —
// an inactive slot is scaled to nothing or hidden — so a burst of fifty
// sparks never mounts a component or allocates a thing.
//
// Rounds and sparks, the two big pools, are drei <Instances>: one draw call
// each however many are live. Rings and pickups are few (MAX_RINGS,
// MAX_PICKUPS) and each needs its own animated material, so they are a
// fixed row of slot components instead.
import { useRef } from "react";
import { Edges, Float, Instance, Instances, type PositionMesh } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { PHOS, WARN } from "../core/engine";
import { SIDEARM } from "./doomRules";
import { doom } from "./doomStore";
import { MAX_BULLETS, MAX_PICKUPS, MAX_RINGS, MAX_SPARKS } from "./doomWorld";

// <Instances> copies each instance's matrixWorld into its buffer in its own
// priority-0 frame callback. The pools are written here one step earlier,
// and each instance's matrix refreshed on the spot, so a tracer is drawn
// where its round is this frame rather than where it was last frame — a
// metre behind, at this speed. DoomRig steps the world earlier still.
export const POOL_DRAW_PRIORITY = -1;

// How an unused slot is hidden: shrunk to nothing visible, but not to zero.
// <Instances> decomposes each instance's matrix into position, rotation and
// scale every frame, and a zero scale decomposes into a NaN rotation — a
// NaN matrix, which WebGL leaves undefined: some drivers drop the triangles,
// SwiftShader draws the slot at its last place or at the origin.
export const HIDDEN_SCALE = 1e-4;

const BULLET_SLOTS = Array.from({ length: MAX_BULLETS }, (_, i) => i);
const SPARK_SLOTS = Array.from({ length: MAX_SPARKS }, (_, i) => i);
const RING_SLOTS = Array.from({ length: MAX_RINGS }, (_, i) => i);
const PICKUP_SLOTS = Array.from({ length: MAX_PICKUPS }, (_, i) => i);

// A tracer's full length. It trails behind the round's head rather than
// straddling it, and grows to this length over its first TRACER_LEN of
// flight — so the streak starts at the muzzle instead of poking back past
// the player's eye.
const TRACER_LEN = 1.1;

/** Rounds in flight: a hot core and a softer, wider halo, both stretched
 * along the round's travel (lookAt its own velocity) so each reads as a
 * tracer streak rather than a dot. */
function Tracers() {
  const cores = useRef<(PositionMesh | null)[]>([]);
  const halos = useRef<(PositionMesh | null)[]>([]);
  useFrame(() => {
    for (let i = 0; i < MAX_BULLETS; i += 1) {
      const b = doom.bullets[i]!;
      const core = cores.current[i];
      const halo = halos.current[i];
      if (!core || !halo) continue;
      if (!b.active) {
        // Instances reads matrixWorld before the render pass refreshes it,
        // so a slot hidden without this is drawn one more frame at full size.
        if (core.scale.x !== HIDDEN_SCALE) {
          core.scale.setScalar(HIDDEN_SCALE);
          halo.scale.setScalar(HIDDEN_SCALE);
          core.updateMatrixWorld();
          halo.updateMatrixWorld();
        }
        continue;
      }
      const speed = Math.hypot(b.vx, b.vy, b.vz) || 1;
      const stretch = Math.min(1, ((SIDEARM.bulletLife - b.life) * speed + 0.05) / TRACER_LEN);
      // Centre of the streak: half its current length back along travel.
      const back = (TRACER_LEN * stretch) / 2 / speed;
      core.position.set(b.x - b.vx * back, b.y - b.vy * back, b.z - b.vz * back);
      core.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
      core.scale.set(1, 1, stretch);
      halo.position.copy(core.position);
      halo.quaternion.copy(core.quaternion);
      halo.scale.set(1, 1, stretch);
      core.updateMatrixWorld();
      halo.updateMatrixWorld();
    }
  }, POOL_DRAW_PRIORITY);
  return (
    <>
      <Instances limit={MAX_BULLETS} frustumCulled={false}>
        <boxGeometry args={[0.018, 0.018, TRACER_LEN]} />
        <meshBasicMaterial color="#fff4d6" toneMapped={false} />
        {BULLET_SLOTS.map((i) => (
          <Instance key={i} ref={(el) => { cores.current[i] = el as PositionMesh | null; }} scale={HIDDEN_SCALE} />
        ))}
      </Instances>
      <Instances limit={MAX_BULLETS} frustumCulled={false}>
        <boxGeometry args={[0.05, 0.05, TRACER_LEN]} />
        <meshBasicMaterial color={WARN} transparent opacity={0.35} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        {BULLET_SLOTS.map((i) => (
          <Instance key={i} ref={(el) => { halos.current[i] = el as PositionMesh | null; }} scale={HIDDEN_SCALE} />
        ))}
      </Instances>
    </>
  );
}

/** Sparks: tiny additive octahedra, each tinted from its slot's colour and
 * shrinking as its life runs out. */
function Sparks() {
  const refs = useRef<(PositionMesh | null)[]>([]);
  useFrame(() => {
    for (let i = 0; i < MAX_SPARKS; i += 1) {
      const s = doom.sparks[i]!;
      const inst = refs.current[i];
      if (!inst) continue;
      if (!s.active) {
        if (inst.scale.x !== HIDDEN_SCALE) {
          inst.scale.setScalar(HIDDEN_SCALE);
          inst.updateMatrixWorld();
        }
        continue;
      }
      inst.position.set(s.x, s.y, s.z);
      inst.scale.setScalar(s.size * (s.life / s.maxLife));
      inst.rotation.x += 0.2;
      inst.rotation.y += 0.3;
      inst.color.setHex(s.color);
      inst.updateMatrixWorld();
    }
  }, POOL_DRAW_PRIORITY);
  return (
    <Instances limit={MAX_SPARKS} frustumCulled={false}>
      <octahedronGeometry args={[0.035, 0]} />
      <meshBasicMaterial transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      {SPARK_SLOTS.map((i) => (
        <Instance key={i} ref={(el) => { refs.current[i] = el as PositionMesh | null; }} scale={HIDDEN_SCALE} />
      ))}
    </Instances>
  );
}

/** One ring slot. A death is a shockwave racing out; a slam, a heavier one;
 * a summoning, a spinning circle with a column of light that fades as the
 * demon finishes rising; a wind-up, the slam's actual blast radius drawn
 * on the floor and flashing faster as it's about to land — the warning
 * that makes the brute fair. */
function RingSlot({ index }: { index: number }) {
  const group = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const beam = useRef<Mesh>(null);
  const beamMat = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    const r = doom.rings[index]!;
    const g = group.current;
    if (!g || !ring.current || !ringMat.current || !beam.current || !beamMat.current) return;
    g.visible = r.active;
    if (!r.active) return;
    const k = Math.min(1, (doom.time - r.bornAt) / r.duration);
    g.position.set(r.x, r.y + 0.03, r.z);
    ringMat.current.color.setHex(r.color);
    beam.current.visible = r.kind === "rift";
    let radius = r.radius;
    let opacity = 1 - k;
    switch (r.kind) {
      case "death":
        radius = r.radius * (1 - (1 - k) * (1 - k));
        break;
      case "slam":
        radius = r.radius * (0.25 + 0.75 * (1 - (1 - k) ** 3));
        break;
      case "rift":
        radius = r.radius * (0.7 + 0.3 * Math.sin(k * Math.PI));
        opacity = Math.sin(k * Math.PI);
        ring.current.rotation.z = k * 6;
        beam.current.scale.set(radius * 0.5, 1 + k * 1.5, radius * 0.5);
        beamMat.current.opacity = 0.45 * (1 - k);
        break;
      case "windup":
        opacity = 0.35 + 0.65 * Math.abs(Math.sin(k * k * 22));
        break;
    }
    ring.current.scale.set(radius, radius, 1);
    ringMat.current.opacity = opacity;
  });
  return (
    <group ref={group} visible={false}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1, 64]} />
        <meshBasicMaterial ref={ringMat} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh ref={beam} position={[0, 1.2, 0]}>
        <cylinderGeometry args={[1, 1, 2.4, 24, 1, true]} />
        <meshBasicMaterial ref={beamMat} color={WARN} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** One pickup slot: a green cross for health, an amber cell for rounds,
 * bobbing on drei <Float>, blinking through its last few seconds. */
function PickupSlot({ index }: { index: number }) {
  const group = useRef<Group>(null);
  const health = useRef<Group>(null);
  const ammo = useRef<Group>(null);
  useFrame(() => {
    const p = doom.pickups[index]!;
    const g = group.current;
    if (!g || !health.current || !ammo.current) return;
    const age = doom.time - p.bornAt;
    g.visible = p.active && (age < 14 || Math.sin(age * 20) > 0);
    if (!p.active) return;
    g.position.set(p.x, p.y + 0.75, p.z);
    g.rotation.y = age * 1.8;
    health.current.visible = p.kind === "health";
    ammo.current.visible = p.kind === "ammo";
  });
  return (
    <group ref={group} visible={false}>
      <Float speed={3} floatIntensity={0.6} rotationIntensity={0}>
        <group ref={health}>
          <mesh>
            <boxGeometry args={[0.36, 0.11, 0.11]} />
            <meshBasicMaterial color={PHOS} transparent opacity={0.85} toneMapped={false} />
            <Edges color={PHOS} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.11, 0.36, 0.11]} />
            <meshBasicMaterial color={PHOS} transparent opacity={0.85} toneMapped={false} />
            <Edges color={PHOS} />
          </mesh>
        </group>
        <group ref={ammo}>
          <mesh>
            <cylinderGeometry args={[0.1, 0.1, 0.34, 8]} />
            <meshBasicMaterial color={WARN} transparent opacity={0.35} depthWrite={false} toneMapped={false} />
            <Edges color={WARN} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.06, 8]} />
            <meshBasicMaterial color={WARN} toneMapped={false} />
          </mesh>
        </group>
      </Float>
    </group>
  );
}

export function DoomEffects() {
  return (
    <>
      <Tracers />
      <Sparks />
      {RING_SLOTS.map((i) => <RingSlot key={i} index={i} />)}
      {PICKUP_SLOTS.map((i) => <PickupSlot key={i} index={i} />)}
    </>
  );
}
