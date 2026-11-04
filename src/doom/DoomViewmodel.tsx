// The sidearm in the player's hand, drawn in its own drei <Hud> scene on
// top of the world: its own camera, cleared depth, so it never clips into a
// wall the player is pressed against and never inherits the world camera's
// narrow 40° lens. The world camera is only read (for sway and walk bob),
// never parented to.
//
// Line-art like everything else in SITE — dark fill, PAPER edges — with
// the working parts lit: a strip of twelve round indicators along the
// slide that go dark as the magazine empties (the ammo count is on the gun,
// not only on the HUD), a glowing cell in the grip that drains with them,
// coils round the barrel that flare on each shot, a CRITICAL front sight.
//
// Every motion is maath `damp` toward a target computed from the world's
// state, per frame, onto refs: recoil (from doom.lastShotAt), the reload
// (tilt, roll, the cell dropping out and back), sway against the look
// direction's change, a walk bob from how far the eye moved, and dropping
// out of view on death.
import { useMemo, useRef, type ReactNode } from "react";
import { Edges, Hud, PerspectiveCamera } from "@react-three/drei";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { damp } from "maath/easing";
import { AdditiveBlending, Color, Vector3, type Camera, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { CRITICAL, INK, PAPER, PHOS, WARN } from "../core/engine";
import { SIDEARM } from "./doomRules";
import { doom } from "./doomStore";

// Where the gun rests in the Hud camera's view: low and right.
const REST_X = 0.17;
const REST_Y = -0.15;
const REST_Z = -0.5;
// The model below is drawn at roughly real pistol size; at this distance
// through the Hud's lens that fills too much of SITE's small viewport, so
// the whole rig is scaled down rather than every part redrawn.
const RIG_SCALE = 0.62;
const FLASH_TIME = 0.055;
const MAG_SLOTS = Array.from({ length: SIDEARM.magSize }, (_, i) => i);
// Parsed once: Color.set(string) runs a regex, not something for a frame loop.
const CELL_OK = new Color(PHOS);
const CELL_LOW = new Color(CRITICAL);

function Part({ children, ...props }: ThreeElements["mesh"] & { children: ReactNode }) {
  return (
    <mesh {...props}>
      {children}
      <meshBasicMaterial color={INK} transparent opacity={0.88} />
      <Edges color={PAPER} />
    </mesh>
  );
}

function Sidearm({ world }: { world: Camera }) {
  const rig = useRef<Group>(null);
  const cell = useRef<Mesh>(null);
  const cellMat = useRef<MeshBasicMaterial>(null);
  const coils = useRef<Group>(null);
  const flash = useRef<Group>(null);
  const slots = useRef<(MeshBasicMaterial | null)[]>([]);
  // Scratch, allocated once: last frame's look direction and eye.
  const scratch = useMemo(() => ({ fwd: new Vector3(), prevFwd: new Vector3(), prevEye: new Vector3(), bob: 0, primed: false }), []);

  useFrame((_, dtRaw) => {
    const g = rig.current;
    if (!g) return;
    const dt = Math.min(dtRaw, 0.05);
    const t = doom.time;

    // Sway: the gun lags the turn a little, the way a held weight does.
    world.getWorldDirection(scratch.fwd);
    if (!scratch.primed) {
      scratch.prevFwd.copy(scratch.fwd);
      scratch.prevEye.copy(world.position);
      scratch.primed = true;
    }
    const yawDelta = scratch.fwd.x * scratch.prevFwd.z - scratch.fwd.z * scratch.prevFwd.x;
    const pitchDelta = scratch.fwd.y - scratch.prevFwd.y;
    scratch.prevFwd.copy(scratch.fwd);
    // Walk bob: phase advances with the distance the eye covered.
    const moved = Math.hypot(world.position.x - scratch.prevEye.x, world.position.z - scratch.prevEye.z);
    scratch.prevEye.copy(world.position);
    scratch.bob += Math.min(moved, 0.3) * 9;
    const walking = moved / Math.max(dt, 1e-3) > 0.5 ? 1 : 0;

    // Recoil: a sharp kick back and up that recovers over ~0.15s.
    const since = t - doom.lastShotAt;
    const kick = since < 0.15 ? 1 - since / 0.15 : 0;

    // Reload: tilt down and roll over, cell drops out and back in.
    const a = doom.ammo;
    const r = a.reloadEndsAt >= 0 ? 1 - Math.max(0, a.reloadEndsAt - t) / SIDEARM.reloadTime : -1;
    const arc = r >= 0 ? Math.sin(Math.PI * r) : 0;

    const dead = doom.director.phase === "dead";
    const breathe = Math.sin(t * 1.6) * 0.004;

    const tx = REST_X + Math.sin(scratch.bob) * 0.012 * walking - yawDelta * 1.6;
    const ty = REST_Y + breathe - Math.abs(Math.cos(scratch.bob)) * 0.012 * walking - arc * 0.08 - pitchDelta * 0.8 - (dead ? 0.6 : 0);
    const tz = REST_Z + kick * 0.05;
    damp(g.position, "x", tx, 0.08, dt);
    damp(g.position, "y", ty, dead ? 0.4 : 0.08, dt);
    damp(g.position, "z", tz, kick > 0 ? 0.015 : 0.08, dt);
    damp(g.rotation, "x", kick * 0.22 - arc * 0.7, kick > 0 ? 0.02 : 0.08, dt);
    damp(g.rotation, "z", arc * 0.9 + yawDelta * 2, 0.08, dt);
    damp(g.rotation, "y", 0.06 + yawDelta * 2, 0.08, dt);

    // The cell in the grip drains with the magazine and drops out mid-reload.
    const frac = a.mag / SIDEARM.magSize;
    if (cell.current) {
      damp(cell.current.scale, "y", Math.max(0.02, r >= 0 ? (r > 0.5 ? r : 0.02) : frac), 0.06, dt);
      damp(cell.current.position, "y", r >= 0 && r < 0.6 ? -0.28 : -0.12, 0.06, dt);
    }
    if (cellMat.current) cellMat.current.color.copy(a.mag <= 3 ? CELL_LOW : CELL_OK);

    for (let i = 0; i < SIDEARM.magSize; i += 1) {
      const m = slots.current[i];
      if (m) m.opacity = i < a.mag ? 1 : 0.12;
    }
    if (coils.current) {
      coils.current.rotation.z += dt * (1 + kick * 40);
      coils.current.scale.setScalar(1 + kick * 0.25);
    }
    if (flash.current) {
      const on = since < FLASH_TIME;
      flash.current.visible = on;
      if (on) {
        // A different flower each shot, keyed on the shot's own time.
        flash.current.rotation.z = (doom.lastShotAt * 7919) % (Math.PI * 2);
        flash.current.scale.setScalar(0.8 + ((doom.lastShotAt * 104729) % 1) * 0.6);
      }
    }
  });

  return (
    <group ref={rig} position={[REST_X, REST_Y, REST_Z]} rotation={[0, 0.06, 0]} scale={RIG_SCALE}>
      {/* slide and frame */}
      <Part position={[0, 0.035, -0.04]}>
        <boxGeometry args={[0.085, 0.07, 0.34]} />
      </Part>
      <Part position={[0, -0.02, 0.01]}>
        <boxGeometry args={[0.08, 0.045, 0.26]} />
      </Part>
      {/* slide serrations */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0.0435, 0.035, 0.07 + i * 0.018]}>
          <boxGeometry args={[0.002, 0.05, 0.006]} />
          <meshBasicMaterial color={PAPER} />
        </mesh>
      ))}
      {/* barrel, with three coils */}
      <Part position={[0, 0.035, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.12, 10]} />
      </Part>
      <group ref={coils} position={[0, 0.035, -0.19]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0, -i * 0.035]}>
            <torusGeometry args={[0.036, 0.004, 6, 18]} />
            <meshBasicMaterial color={WARN} transparent opacity={0.9} blending={AdditiveBlending} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {/* sights: rear notch in PAPER, front post lit CRITICAL */}
      <mesh position={[-0.018, 0.078, 0.11]}>
        <boxGeometry args={[0.012, 0.014, 0.012]} />
        <meshBasicMaterial color={PAPER} />
      </mesh>
      <mesh position={[0.018, 0.078, 0.11]}>
        <boxGeometry args={[0.012, 0.014, 0.012]} />
        <meshBasicMaterial color={PAPER} />
      </mesh>
      <mesh position={[0, 0.078, -0.19]}>
        <boxGeometry args={[0.008, 0.016, 0.008]} />
        <meshBasicMaterial color={CRITICAL} toneMapped={false} />
      </mesh>
      {/* the round indicators, one per round in a full magazine */}
      {MAG_SLOTS.map((i) => (
        <mesh key={i} position={[-0.0445, 0.045, -0.17 + i * 0.022]}>
          <boxGeometry args={[0.003, 0.012, 0.012]} />
          <meshBasicMaterial
            ref={(el) => { slots.current[i] = el; }}
            color={PHOS} transparent toneMapped={false}
          />
        </mesh>
      ))}
      {/* grip, see-through, with the cell inside */}
      <group position={[0, -0.02, 0.09]} rotation={[0.28, 0, 0]}>
        <mesh position={[0, -0.09, 0]}>
          <boxGeometry args={[0.07, 0.17, 0.085]} />
          <meshBasicMaterial color={INK} transparent opacity={0.45} depthWrite={false} />
          <Edges color={PAPER} />
        </mesh>
        <mesh ref={cell} position={[0, -0.12, 0]}>
          <boxGeometry args={[0.035, 0.13, 0.05]} />
          <meshBasicMaterial ref={cellMat} color={PHOS} transparent opacity={0.9} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
      </group>
      {/* trigger */}
      <mesh position={[0, -0.06, -0.02]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.012, 0.04, 0.012]} />
        <meshBasicMaterial color={PAPER} />
      </mesh>
      {/* muzzle flash: two crossed petals and a hot centre */}
      <group ref={flash} position={[0, 0.035, -0.34]} visible={false}>
        <mesh>
          <planeGeometry args={[0.1, 0.028]} />
          <meshBasicMaterial color={WARN} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <planeGeometry args={[0.1, 0.028]} />
          <meshBasicMaterial color={WARN} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
        <mesh>
          <circleGeometry args={[0.02, 12]} />
          <meshBasicMaterial color="#fff4d6" transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Mount only in walk mode: while mounted, drei's Hud takes over the frame
 * render (it draws the world scene, then this one on top), and r3f's own
 * render resumes the moment it unmounts. */
export function DoomViewmodel({ world }: { world: Camera }) {
  return (
    <Hud renderPriority={1}>
      <PerspectiveCamera makeDefault fov={50} near={0.01} far={5} position={[0, 0, 0]} />
      <Sidearm world={world} />
    </Hud>
  );
}
