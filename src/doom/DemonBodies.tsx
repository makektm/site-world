// The three demon bodies, drawn in the room's own line-art idiom — a dark
// translucent fill under drei <Edges> in CRITICAL, the way every prop here
// is a near-invisible fill plus Edges in PAPER — with glowing parts
// (eyes, hearts, the brute's core) in additive materials, which on this
// `flat linear` canvas read as light without a single scene light.
//
// Each body animates only its own limbs from its `Enemy` each frame, onto
// refs, no allocation: Demon.tsx's shell already owns position, facing,
// scale, summoning and death.
//
// Imp: a hunched torso with a beating heart showing through, a horned head
// with slit eyes, clawed arms that swing as it flies and snap forward in a
// lunge, and a wisp for legs. Wraith: an open cloak around nothing, one
// eye, a drei <Trail> streaming off its hem, three shards in orbit. Brute:
// a spiked dodecahedron around a writhing wireframe core (drei
// MeshDistortMaterial), a crown of horns, four eyes, fists that rise
// overhead through its slam's wind-up — the tell — and come down on the
// slam, and drei <Sparkles> hanging round it like heat.
import { useEffect, useMemo, useRef, type ComponentRef, type ReactNode } from "react";
import { Edges, MeshDistortMaterial, Sparkles, Trail } from "@react-three/drei";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { damp } from "maath/easing";
import { AdditiveBlending, BufferGeometry, Material, Mesh, type Group } from "three";
import { CRITICAL, INK, PAPER, WARN } from "../core/engine";
import { SLAM_COOLDOWN, SLAM_WINDUP, isAlive, type Enemy } from "./doomRules";
import { doom } from "./doomStore";

type MeshProps = ThreeElements["mesh"];

/** A solid part: dark translucent fill, CRITICAL edges. `children` is the
 * geometry. */
function Lined({ children, line = CRITICAL, fill = 0.72, ...props }: MeshProps & { children: ReactNode; line?: string; fill?: number }) {
  return (
    <mesh {...props}>
      {children}
      <meshBasicMaterial color={INK} transparent opacity={fill} depthWrite={false} />
      <Edges color={line} />
    </mesh>
  );
}

/** A lit part: additive, untoned — a glow on this canvas. */
function Glow({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return (
    <meshBasicMaterial
      color={color} transparent opacity={opacity} depthWrite={false}
      blending={AdditiveBlending} toneMapped={false}
    />
  );
}

/** Mid-lunge: the imp's arms and jaw both read it. */
function lunging(e: Enemy, t: number): boolean {
  return t < e.lungeUntil;
}

// ------------------------------------------------------------------- imp

export function ImpBody({ enemy }: { enemy: Enemy }) {
  const bob = useRef<Group>(null);
  const heart = useRef<Mesh>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const tail = useRef<Mesh>(null);
  const jaw = useRef<Mesh>(null);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const t = doom.time;
    const p = enemy.phase;
    const lunge = lunging(enemy, t);
    if (bob.current) bob.current.position.y = Math.sin(t * 4 + p) * 0.06;
    if (heart.current) {
      // Beats faster the lower its health.
      const rate = 5 + (1 - enemy.hp / enemy.maxHp) * 10;
      heart.current.scale.setScalar(0.85 + Math.max(0, Math.sin(t * rate + p)) * 0.35);
    }
    // Arms: a flying swing, thrown forward for a lunge.
    const swing = Math.sin(t * 9 + p) * 0.55;
    if (armL.current) damp(armL.current.rotation, "x", lunge ? -1.5 : swing, 0.06, dt);
    if (armR.current) damp(armR.current.rotation, "x", lunge ? -1.5 : -swing, 0.06, dt);
    if (tail.current) tail.current.rotation.z = Math.sin(t * 5 + p) * 0.35;
    if (jaw.current) damp(jaw.current.scale, "y", lunge ? 3.5 : 1, 0.05, dt);
  });

  return (
    <group ref={bob}>
      {/* torso */}
      <Lined position={[0, 0.92, 0]}>
        <icosahedronGeometry args={[0.3, 0]} />
      </Lined>
      <mesh ref={heart} position={[0, 0.92, 0.04]}>
        <icosahedronGeometry args={[0.11, 1]} />
        <Glow color={CRITICAL} />
      </mesh>
      {/* head */}
      <group position={[0, 1.3, 0.04]}>
        <Lined>
          <dodecahedronGeometry args={[0.19, 0]} />
        </Lined>
        {/* slit eyes, angled into a scowl */}
        <mesh position={[-0.075, 0.03, 0.16]} rotation={[0, 0, -0.45]}>
          <boxGeometry args={[0.09, 0.022, 0.02]} />
          <Glow color={WARN} />
        </mesh>
        <mesh position={[0.075, 0.03, 0.16]} rotation={[0, 0, 0.45]}>
          <boxGeometry args={[0.09, 0.022, 0.02]} />
          <Glow color={WARN} />
        </mesh>
        <mesh ref={jaw} position={[0, -0.075, 0.165]}>
          <boxGeometry args={[0.1, 0.015, 0.02]} />
          <Glow color={CRITICAL} />
        </mesh>
        {/* horns */}
        <Lined position={[-0.13, 0.17, 0]} rotation={[0, 0, 0.55]}>
          <coneGeometry args={[0.045, 0.3, 5]} />
        </Lined>
        <Lined position={[0.13, 0.17, 0]} rotation={[0, 0, -0.55]}>
          <coneGeometry args={[0.045, 0.3, 5]} />
        </Lined>
      </group>
      {/* arms: a pivot at the shoulder, a claw hanging from it */}
      <group ref={armL} position={[-0.3, 1.02, 0]}>
        <Lined position={[-0.04, -0.2, 0.05]} rotation={[Math.PI, 0, -0.2]}>
          <coneGeometry args={[0.06, 0.42, 4]} />
        </Lined>
      </group>
      <group ref={armR} position={[0.3, 1.02, 0]}>
        <Lined position={[0.04, -0.2, 0.05]} rotation={[Math.PI, 0, 0.2]}>
          <coneGeometry args={[0.06, 0.42, 4]} />
        </Lined>
      </group>
      {/* a wisp for legs */}
      <Lined ref={tail} position={[0, 0.48, 0]} rotation={[Math.PI, 0, 0]} fill={0.4}>
        <coneGeometry args={[0.18, 0.5, 6]} />
      </Lined>
    </group>
  );
}

// ---------------------------------------------------------------- wraith

const trailFade = (w: number) => w * w;
const trailMesh = (ref: unknown): Mesh | null => (ref instanceof Mesh ? ref : null);

export function WraithBody({ enemy }: { enemy: Enemy }) {
  const bob = useRef<Group>(null);
  const shards = useRef<Group>(null);
  const eye = useRef<Mesh>(null);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const t = doom.time;
    if (bob.current) {
      bob.current.position.y = Math.sin(t * 3 + enemy.phase) * 0.14;
      // Leans into its own speed.
      bob.current.rotation.x = Math.min(0.5, Math.hypot(enemy.vx, enemy.vz) * 0.08);
    }
    if (shards.current) shards.current.rotation.y += dt * 3.2;
    if (eye.current) eye.current.scale.setScalar(isAlive(enemy) ? 1 + Math.sin(t * 11) * 0.12 : 0.5);
  });

  // drei's <Trail> builds its line geometry and material itself and never
  // disposes them (R3F only frees what JSX creates), and it rebuilds the
  // material whenever its children change identity. Keep the child stable,
  // free a replaced material, and free both when the wraith goes.
  // Typed as the geometry, but drei 10.7 forwards it to the trail's mesh;
  // `trailMesh` checks rather than trusts either.
  const trail = useRef<ComponentRef<typeof Trail>>(null);
  const trailHead = useMemo(
    () => (
      <mesh position={[0, 0.72, 0]}>
        <sphereGeometry args={[0.04, 6, 4]} />
        <Glow color={CRITICAL} />
      </mesh>
    ),
    [],
  );
  const trailMat = useRef<Material | null>(null);
  useEffect(() => {
    const m = trailMesh(trail.current)?.material;
    if (m instanceof Material && m !== trailMat.current) {
      trailMat.current?.dispose();
      trailMat.current = m;
    }
  });
  useEffect(() => {
    const ref = trail.current as unknown;
    return () => {
      const geometry = ref instanceof BufferGeometry ? ref : trailMesh(ref)?.geometry;
      geometry?.dispose();
      trailMat.current?.dispose();
      trailMat.current = null;
    };
  }, []);

  return (
    <group ref={bob}>
      {/* the cloak: an open cone around nothing */}
      <Lined position={[0, 1.2, 0]} rotation={[Math.PI, 0, 0]} fill={0.55}>
        <coneGeometry args={[0.34, 1.0, 7, 1, true]} />
      </Lined>
      {/* hood */}
      <Lined position={[0, 1.83, -0.02]}>
        <coneGeometry args={[0.2, 0.36, 7]} />
      </Lined>
      {/* one eye, ringed */}
      <group position={[0, 1.62, 0.15]}>
        <mesh ref={eye}>
          <sphereGeometry args={[0.06, 12, 8]} />
          <Glow color={PAPER} />
        </mesh>
        <mesh>
          <torusGeometry args={[0.1, 0.012, 6, 20]} />
          <Glow color={CRITICAL} />
        </mesh>
      </group>
      {/* the hem's streamer */}
      <Trail ref={trail} width={0.9} length={5} color={CRITICAL} attenuation={trailFade}>
        {trailHead}
      </Trail>
      {/* shards in orbit */}
      <group ref={shards} position={[0, 1.25, 0]}>
        {[0, 1, 2].map((i) => (
          <Lined
            key={i}
            position={[Math.cos((i * Math.PI * 2) / 3) * 0.5, (i - 1) * 0.15, Math.sin((i * Math.PI * 2) / 3) * 0.5]}
            rotation={[i, i * 2, 0]}
          >
            <tetrahedronGeometry args={[0.07, 0]} />
          </Lined>
        ))}
      </group>
    </group>
  );
}

// ----------------------------------------------------------------- brute

const SPIKES = [0, 1, 2, 3, 4, 5, 6, 7];

export function BruteBody({ enemy }: { enemy: Enemy }) {
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const jaw = useRef<Mesh>(null);
  const torso = useRef<Group>(null);
  const core = useRef<Mesh>(null);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const t = doom.time;
    const speed = Math.hypot(enemy.vx, enemy.vz);
    const stride = Math.sin(t * (2 + speed * 2.2) + enemy.phase);
    const enraged = enemy.hp * 2 < enemy.maxHp;

    // The slam: arms climb overhead through the wind-up, come down hard on
    // the slam, and settle back into a walk swing after it.
    let armTarget = stride * 0.4;
    let armLag = 0.15;
    if (enemy.windupUntil >= 0) {
      const k = 1 - Math.max(0, enemy.windupUntil - t) / SLAM_WINDUP;
      armTarget = -2.8 * k;
      armLag = 0.08;
    } else if (t - (enemy.slamReadyAt - SLAM_COOLDOWN) < 0.35) {
      armTarget = -0.2;
      armLag = 0.02;
    }
    if (armL.current) damp(armL.current.rotation, "x", armTarget, armLag, dt);
    if (armR.current) damp(armR.current.rotation, "x", armTarget, armLag, dt);
    if (legL.current) legL.current.rotation.x = stride * 0.45;
    if (legR.current) legR.current.rotation.x = -stride * 0.45;
    if (torso.current) {
      torso.current.position.y = Math.abs(stride) * 0.06;
      // Shudders while enraged.
      torso.current.rotation.z = enraged ? Math.sin(t * 40) * 0.03 : 0;
    }
    if (jaw.current) damp(jaw.current.rotation, "x", enemy.windupUntil >= 0 ? 0.7 : 0.1, 0.08, dt);
    if (core.current) core.current.scale.setScalar(enraged ? 1.15 + Math.sin(t * 14) * 0.1 : 1);
  });

  // drei mounts this material as a <primitive>, which R3F never disposes.
  const distort = useRef<ComponentRef<typeof MeshDistortMaterial>>(null);
  useEffect(() => {
    const m = distort.current;
    return () => m?.dispose();
  }, []);

  return (
    <group>
      <group ref={torso}>
        <Lined position={[0, 1.4, 0]} fill={0.5}>
          <dodecahedronGeometry args={[0.72, 0]} />
        </Lined>
        <mesh ref={core} position={[0, 1.4, 0]}>
          <icosahedronGeometry args={[0.34, 6]} />
          <MeshDistortMaterial ref={distort} color="#000000" emissive={CRITICAL} emissiveIntensity={1.4} distort={0.45} speed={2.5} wireframe toneMapped={false} />
        </mesh>
        {/* a ring of spikes round the waist */}
        {SPIKES.map((i) => (
          <group key={i} position={[0, 1.3, 0]} rotation={[0, (i / SPIKES.length) * Math.PI * 2, 0]}>
            <Lined position={[0.78, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <coneGeometry args={[0.08, 0.38, 5]} />
            </Lined>
          </group>
        ))}
        {/* head: a heavy block, four eyes, a jaw that drops for the slam */}
        <group position={[0, 2.12, 0.1]}>
          <Lined>
            <boxGeometry args={[0.52, 0.34, 0.42]} />
          </Lined>
          {[-0.15, -0.05, 0.05, 0.15].map((x, i) => (
            <mesh key={x} position={[x, 0.05 + (i === 0 || i === 3 ? -0.03 : 0), 0.22]}>
              <boxGeometry args={[0.055, 0.035, 0.02]} />
              <Glow color={WARN} />
            </mesh>
          ))}
          <group position={[0, -0.17, 0.16]}>
            <Lined ref={jaw} position={[0, -0.06, 0.02]}>
              <boxGeometry args={[0.44, 0.1, 0.12]} />
            </Lined>
          </group>
          {/* the crown */}
          <Lined position={[-0.3, 0.32, 0]} rotation={[0, 0, 0.75]}>
            <coneGeometry args={[0.09, 0.6, 6]} />
          </Lined>
          <Lined position={[0.3, 0.32, 0]} rotation={[0, 0, -0.75]}>
            <coneGeometry args={[0.09, 0.6, 6]} />
          </Lined>
          <Lined position={[0, 0.3, -0.12]} rotation={[-0.3, 0, 0]}>
            <coneGeometry args={[0.06, 0.4, 5]} />
          </Lined>
        </group>
        {/* arms from the shoulder: a forearm and a fist */}
        {([-1, 1] as const).map((side) => (
          <group key={side} ref={side < 0 ? armL : armR} position={[side * 0.85, 1.8, 0]}>
            <Lined position={[0, -0.42, 0]}>
              <cylinderGeometry args={[0.12, 0.09, 0.8, 6]} />
            </Lined>
            <Lined position={[0, -0.92, 0.04]}>
              <boxGeometry args={[0.32, 0.3, 0.32]} />
            </Lined>
          </group>
        ))}
      </group>
      {/* legs */}
      {([-1, 1] as const).map((side) => (
        <group key={side} ref={side < 0 ? legL : legR} position={[side * 0.36, 0.72, 0]}>
          <Lined position={[0, -0.36, 0]}>
            <cylinderGeometry args={[0.17, 0.13, 0.72, 6]} />
          </Lined>
        </group>
      ))}
      <Sparkles count={26} scale={[2.4, 2.6, 2.4]} position={[0, 1.4, 0]} size={3} speed={0.5} color={CRITICAL} opacity={0.8} />
    </group>
  );
}
