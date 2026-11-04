// One demon on the floor: the shared shell every kind wears — where it
// stands, which way it faces, its summoning and its death, the white flash
// when a round lands, the red footprint ring, the health bar — around a
// kind-specific body from DemonBodies.tsx.
//
// Every value here is read from the demon's own `Enemy` object in doom's
// world each frame, and written straight onto refs: a demon moving never
// re-renders React. The component mounts when the demon is summoned and
// unmounts when the world removes its body after DEATH_TIME, which is the
// only time the demon list itself changes (see doomStore.ts).
import { useRef } from "react";
import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { dampAngle } from "maath/easing";
import { AdditiveBlending, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { CRITICAL, INK, PAPER } from "../core/engine";
import { DEATH_TIME, ENEMY_SPECS, SPAWN_TIME, isAlive, type Enemy } from "./doomRules";
import { doom } from "./doomStore";
import { BruteBody, ImpBody, WraithBody } from "./DemonBodies";

// How long the white hit flash takes to fade.
const FLASH = 0.12;

function HealthBar({ enemy, y, width }: { enemy: Enemy; y: number; width: number }) {
  const group = useRef<Group>(null);
  const fill = useRef<Mesh>(null);
  useFrame(() => {
    if (!group.current || !fill.current) return;
    const frac = enemy.hp / enemy.maxHp;
    // Only once it's been hurt, and never on a corpse: a full bar over
    // every imp would be noise.
    group.current.visible = frac < 1 && isAlive(enemy);
    fill.current.scale.x = Math.max(0.001, frac);
    fill.current.position.x = (-width * (1 - frac)) / 2;
  });
  return (
    <Billboard ref={group} position={[0, y, 0]}>
      <mesh>
        <planeGeometry args={[width + 0.04, 0.09]} />
        <meshBasicMaterial color={INK} transparent opacity={0.75} depthWrite={false} />
      </mesh>
      <mesh ref={fill} position={[0, 0, 0.001]}>
        <planeGeometry args={[width, 0.05]} />
        <meshBasicMaterial color={CRITICAL} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

/** The footprint: a ring on the floor under the demon, so where it
 * actually stands reads at a glance even while it floats. Pulses on the
 * demon's own phase, so a pack's rings don't blink in unison. */
function Footprint({ enemy, radius }: { enemy: Enemy; radius: number }) {
  const mat = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    if (!mat.current) return;
    const t = doom.time;
    mat.current.opacity = isAlive(enemy) ? 0.35 + Math.sin(t * 6 + enemy.phase) * 0.15 : 0;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
      <ringGeometry args={[radius * 0.82, radius, 32]} />
      <meshBasicMaterial ref={mat} color={CRITICAL} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
    </mesh>
  );
}

export function Demon({ enemy }: { enemy: Enemy }) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const flash = useRef<MeshBasicMaterial>(null);
  const spec = ENEMY_SPECS[enemy.kind];

  useFrame((_, dtRaw) => {
    const r = root.current;
    const b = body.current;
    if (!r || !b) return;
    const dt = Math.min(dtRaw, 0.05);
    const t = doom.time;
    // y is the floor under it — the gallery and its ramp stand above the
    // main floor.
    r.position.set(enemy.x, enemy.y, enemy.z);

    // Summoning: rises out of the floor and grows into itself.
    const born = Math.min(1, (t - enemy.spawnedAt) / SPAWN_TIME);
    let scale = 0.15 + 0.85 * born * born;
    let lift = (born - 1) * 1.2;

    // Hit: a squash-and-stretch pop on top of the flash.
    const sinceHit = t - enemy.hitAt;
    const pop = sinceHit < FLASH ? 1 - sinceHit / FLASH : 0;

    if (!isAlive(enemy)) {
      // Death: spins up, swells for an instant, then collapses to nothing
      // while the world throws its sparks.
      const k = Math.min(1, (t - enemy.diedAt) / DEATH_TIME);
      scale *= k < 0.2 ? 1 + k * 1.5 : Math.max(0, 1.3 * (1 - (k - 0.2) / 0.8));
      b.rotation.y += dt * (6 + k * 30);
      lift += k * 0.4;
    } else {
      dampAngle(b.rotation, "y", enemy.heading, 0.1, dt);
    }

    b.position.y = lift;
    b.scale.set(scale * (1 + pop * 0.18), scale * (1 - pop * 0.12), scale * (1 + pop * 0.18));
    if (flash.current) {
      flash.current.opacity = isAlive(enemy) ? pop * 0.85 : Math.max(0, 1 - (t - enemy.diedAt) / DEATH_TIME);
    }
  });

  const Body = enemy.kind === "imp" ? ImpBody : enemy.kind === "wraith" ? WraithBody : BruteBody;
  return (
    <group ref={root} position={[enemy.x, enemy.y, enemy.z]}>
      <Footprint enemy={enemy} radius={spec.radius} />
      <group ref={body}>
        <Body enemy={enemy} />
        {/* The hit flash: a white shell over the body, additive so it reads
            as light rather than paint. */}
        <mesh position={[0, spec.height, 0]}>
          <icosahedronGeometry args={[spec.hitRadius * 0.95, 1]} />
          <meshBasicMaterial
            ref={flash} color={PAPER} transparent opacity={0} depthWrite={false}
            blending={AdditiveBlending} toneMapped={false}
          />
        </mesh>
      </group>
      <HealthBar enemy={enemy} y={spec.height + spec.hitRadius + 0.3} width={enemy.kind === "brute" ? 1.6 : 0.6} />
    </group>
  );
}
