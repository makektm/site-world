// The walk-mode physics system: the Octree colliders (invisible proxies for
// walls, machine columns and plinths) and the capsule-based movement rig that
// walks the camera against them. WalkRig
// renders WalkColliders internally as part of one physics system.
import { useEffect, useMemo, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { PointerLockControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { damp } from "maath/easing";
import { Euler, Vector3 } from "three";
import type { Group } from "three";
// The community-standard walk-collision pair — an official three.js addon,
// not a new dependency (three/addons/* is an exports alias for
// examples/jsm/* in the installed 0.186 package).
import { Octree } from "three/addons/math/Octree.js";
import { Capsule } from "three/addons/math/Capsule.js";
import { isChromeOpen, isTypingTarget } from "../core/keys";
import { registerOrbitNudge } from "../core/hotkeys";
import { CROUCH_EASE_S, CROUCH_SPEED, eyeTarget, hasHeadroom, hasLegRoom, isCrouched, setStance, WALK_SPEED } from "./walkStance";
import {
  CAMERA_PRIORITY,
  COLLISION_ITERATIONS,
  COYOTE_MS,
  EYE,
  GRAVITY,
  JUMP_BUFFER_MS,
  JUMP_IMPULSE,
  KILL_PLANE_Y,
  ORBIT_STEP,
  PLAYER_RADIUS,
} from "../core/engine";
import { DoorColliders } from "../doors/Doors";
import type { DoorsOpen, SiteDoor } from "../doors/door";

/** A round solid the walker cannot enter (a machine column, say). */
export interface RoundSolid {
  id: string;
  x: number;
  z: number;
  radius: number;
}

/** The static walk-mode proxies: `cylinders` and whatever solids the world and
 * its rooms hand in. Their Octree is rebuilt only when these change. */
export function WalkColliders({
  cylinders, colliderRef, children,
}: {
  cylinders: readonly RoundSolid[];
  colliderRef: RefObject<Group | null>;
  children?: ReactNode;
}) {
  return (
    <group ref={colliderRef} visible={false}>
      {children}
      {cylinders.map(({ id, x, z, radius }) => (
        <mesh key={id} position={[x, 1.5, z]}>
          <cylinderGeometry args={[radius, radius, 3, 12]} />
        </mesh>
      ))}
    </group>
  );
}

/** A host's request to put the walker somewhere: stand at `at` ([x, z]) and
 * face `lookAt`. `seq` identifies the request — a new number replants again,
 * the same number does nothing, so a host can keep the object in state. */
export interface WalkTo {
  at: readonly [number, number];
  lookAt: readonly [number, number, number];
  seq: number;
}

export function WalkRig({
  enabled, cylinders, doors, doorsOpen, solids,
  checkpoint, walkTo = null,
}: {
  enabled: boolean;
  cylinders: readonly RoundSolid[];
  /** The doors, and which are open — a closed one is a wall. */
  doors: readonly SiteDoor[];
  doorsOpen: DoorsOpen;
  /** The world's and the rooms' static solids, rendered into the walk octree. */
  solids?: ReactNode;
  /** The nearest safe [x, z] a fall should return the walker to — updated
   * by whichever proximity trigger owns a given hazard (e.g. a
   * room's checkpoint trigger). Not hazard-specific: any hazard sets this the same
   * way, and it defaults to wherever walk mode was entered until one is
   * ever set. */
  checkpoint?: [number, number] | null;
  /** Replant the walker (a go-to while walking). Applied when `seq` changes,
   * and on entering walk mode while one is held. */
  walkTo?: WalkTo | null;
}) {
  const keys = useRef<Record<string, boolean>>({});
  const verticalVelocity = useRef(0);
  // Whether the capsule's last collision resolve found a hit facing up —
  // gates whether gravity is free-falling or resting. No longer what a
  // jump gates on directly — see jumpBufferedUntil/groundedUntil below.
  const playerOnFloor = useRef(false);
  // Jump buffering + coyote time (the engine constants' comments
  // have the full reasoning): a Space press just records "jump wanted until this
  // timestamp"; the frame loop fires it the moment groundedUntil says
  // landing is still fresh enough, however many frames apart those two
  // events actually land on.
  const jumpBufferedUntil = useRef(0);
  const groundedUntil = useRef(0);
  // Generic fall-and-respawn target — reset to wherever walk mode was
  // entered, and moved forward by `checkpoint` when a hazard's own
  // proximity trigger says a nearer safe point was reached.
  const respawnPos = useRef(new Vector3());
  const colliderGroup = useRef<Group>(null);
  const octree = useMemo(() => new Octree(), []);
  const doorColliderGroup = useRef<Group>(null);
  const doorOctree = useMemo(() => new Octree(), []);
  const capsule = useMemo(
    () => new Capsule(new Vector3(0, PLAYER_RADIUS, 0), new Vector3(0, EYE, 0), PLAYER_RADIUS),
    [],
  );
  // Eye height now, eased between EYE and CROUCH_EYE (walkStance.ts) — an
  // object so maath's `damp` can write it — and scratch space for the room
  // queries (above the head on the ground, below the feet in the air), made
  // once so a frame allocates nothing.
  const stance = useRef({ eye: EYE });
  const probe = useMemo(() => new Capsule(new Vector3(), new Vector3(), PLAYER_RADIUS), []);
  const roomAbove = useMemo(() => () => hasHeadroom(octree, capsule, probe), [octree, capsule, probe]);
  const roomBelow = useMemo(() => () => hasLegRoom(octree, capsule, probe), [octree, capsule, probe]);
  const forward = useMemo(() => new Vector3(), []);
  const right = useMemo(() => new Vector3(), []);
  const moveDelta = useMemo(() => new Vector3(), []);
  const { camera } = useThree();
  useEffect(() => {
    if (!enabled) return;
    const euler = new Euler(0, 0, 0, "YXZ");
    return registerOrbitNudge((azim, polar) => {
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= azim * ORBIT_STEP;
      euler.x -= polar * ORBIT_STEP;
      euler.x = Math.max(-Math.PI / 2 + 0.08, Math.min(Math.PI / 2 - 0.08, euler.x));
      camera.quaternion.setFromEuler(euler);
    });
  }, [enabled, camera]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      // A person typing — into a console, a search box, the palette — is
      // not walking.
      if (isTypingTarget(event.target) || isChromeOpen()) return;
      keys.current[event.code] = true;
      if (
        enabled &&
        (event.code === "KeyW" || event.code === "KeyA" || event.code === "KeyS" || event.code === "KeyD" || event.code === "Space")
      ) {
        event.preventDefault();
      }
      if (enabled && event.code === "Space" && !event.repeat) {
        jumpBufferedUntil.current = performance.now() + JUMP_BUFFER_MS;
      }
    };
    const up = (event: KeyboardEvent) => {
      keys.current[event.code] = false;
    };
    // Focus moving into a text field drops every held key, so a W held
    // while the console took focus cannot keep walking on its own.
    const focusIn = (event: FocusEvent) => {
      if (isTypingTarget(event.target)) keys.current = {};
    };
    const blur = () => {
      keys.current = {};
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("focusin", focusIn);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("focusin", focusIn);
      window.removeEventListener("blur", blur);
    };
  }, [enabled]);

  // The collider group only exists while walking (mounted below), so the
  // Octree is rebuilt whenever it (re)mounts or the roster reshapes it.
  useEffect(() => {
    if (!enabled) return;
    const group = colliderGroup.current;
    if (!group) return;
    octree.clear();
    octree.fromGraphNode(group);
  }, [enabled, cylinders, solids, octree]);

  // The doors' own Octree, rebuilt only on an open/closed transition — see
  // DoorColliders' own comment for why this stays a second, tiny tree
  // rather than joining the one above.
  useEffect(() => {
    if (!enabled) return;
    const group = doorColliderGroup.current;
    if (!group) return;
    doorOctree.clear();
    doorOctree.fromGraphNode(group);
  }, [enabled, doorsOpen, doorOctree]);

  // Entering walk mode replants the capsule under wherever CameraRig just
  // put the camera, so the first frame doesn't fall from where a previous
  // walk session left it.
  useEffect(() => {
    if (!enabled) return;
    capsule.start.set(camera.position.x, PLAYER_RADIUS, camera.position.z);
    capsule.end.set(camera.position.x, EYE, camera.position.z);
    stance.current.eye = EYE;
    verticalVelocity.current = 0;
    playerOnFloor.current = false;
    jumpBufferedUntil.current = 0;
    groundedUntil.current = 0;
    respawnPos.current.set(camera.position.x, PLAYER_RADIUS, camera.position.z);
  }, [enabled, camera, capsule]);

  // A host's go-to: same replant as entering walk mode, at the requested
  // spot. Declared after the entry replant so that, on the same commit, it
  // wins over walkStart. The respawn point moves with it — a fall right after
  // a go-to returns the walker to where they were put, not to walkStart.
  const walkToSeq = walkTo?.seq;
  useEffect(() => {
    if (!enabled || !walkTo) return;
    const [x, z] = walkTo.at;
    camera.position.set(x, EYE, z);
    camera.lookAt(walkTo.lookAt[0], walkTo.lookAt[1], walkTo.lookAt[2]);
    capsule.start.set(x, PLAYER_RADIUS, z);
    capsule.end.set(x, EYE, z);
    stance.current.eye = EYE;
    verticalVelocity.current = 0;
    playerOnFloor.current = false;
    jumpBufferedUntil.current = 0;
    groundedUntil.current = 0;
    respawnPos.current.set(x, PLAYER_RADIUS, z);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `walkToSeq` stands for the request
  }, [enabled, walkToSeq, camera, capsule]);

  // A nearer checkpoint moves the respawn target forward; it never moves
  // backward on its own (leaving the area a checkpoint covers should not
  // un-set it — that would send a walker further back than the ground
  // they've already covered).
  useEffect(() => {
    // Re-applied on re-entering walk mode (`enabled`): the replant above resets
    // the respawn point to the entry position, which a held checkpoint overrides.
    if (!enabled || !checkpoint) return;
    respawnPos.current.set(checkpoint[0], PLAYER_RADIUS, checkpoint[1]);
  }, [enabled, checkpoint]);

  useFrame((_, dtRaw) => {
    if (!enabled) return;
    const dt = Math.min(dtRaw, 0.1);

    // Horizontal-only basis: looking up or down while walking must not add
    // a vertical component gravity then has to fight.
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.set(-forward.z, 0, forward.x);

    // Left Shift crouches. On the ground the feet stay put and the head eases
    // down (or back up, where there is room); in the air the head stays put
    // and the legs are drawn up, so the view does not dip mid-jump. Coyote
    // time counts as ground, and a jump clears it, so the pivot flips at
    // take-off and not a frame early.
    const held = Boolean(keys.current.ShiftLeft);
    const grounded = performance.now() < groundedUntil.current;
    damp(stance.current, "eye", eyeTarget(held, stance.current.eye, grounded ? roomAbove : roomBelow), CROUCH_EASE_S, dt);
    setStance(capsule, stance.current.eye, grounded);

    const speed = (isCrouched(held, stance.current.eye) ? CROUCH_SPEED : WALK_SPEED) * dt;
    moveDelta.set(0, 0, 0);
    if (keys.current.KeyW) moveDelta.addScaledVector(forward, speed);
    if (keys.current.KeyS) moveDelta.addScaledVector(forward, -speed);
    if (keys.current.KeyA) moveDelta.addScaledVector(right, -speed);
    if (keys.current.KeyD) moveDelta.addScaledVector(right, speed);

    if (!playerOnFloor.current) verticalVelocity.current -= GRAVITY * dt;
    else if (verticalVelocity.current < 0) verticalVelocity.current = 0;
    moveDelta.y += verticalVelocity.current * dt;

    capsule.translate(moveDelta);

    // A single push-out is not always enough against a corner, where
    // resolving one wall's penetration can reveal another's.
    let onFloor = false;
    for (let i = 0; i < COLLISION_ITERATIONS; i += 1) {
      const hit = octree.capsuleIntersect(capsule) ?? doorOctree.capsuleIntersect(capsule);
      if (!hit) break;
      if (hit.normal.y > 0) onFloor = true;
      capsule.translate(hit.normal.multiplyScalar(hit.depth));
    }
    playerOnFloor.current = onFloor;

    const now = performance.now();
    if (onFloor) groundedUntil.current = now + COYOTE_MS;
    if (now < jumpBufferedUntil.current && now < groundedUntil.current) {
      verticalVelocity.current = JUMP_IMPULSE;
      jumpBufferedUntil.current = 0;
      groundedUntil.current = 0;
    }

    camera.position.set(capsule.end.x, capsule.end.y, capsule.end.z);

    // Fell through a hazard with no floor under it (a floor gap, or any
    // future one) rather than off the world by accident — a real wall ring
    // surrounds every room, so the only way down here is through a gap
    // deliberately left open. Put back at the last safe point instead of
    // free-falling forever.
    if (capsule.end.y < KILL_PLANE_Y) {
      capsule.start.set(respawnPos.current.x, PLAYER_RADIUS, respawnPos.current.z);
      capsule.end.set(respawnPos.current.x, stance.current.eye, respawnPos.current.z);
      verticalVelocity.current = 0;
      camera.position.set(capsule.end.x, capsule.end.y, capsule.end.z);
    }
  }, CAMERA_PRIORITY);

  if (!enabled) return null;
  return (
    <>
      <WalkColliders cylinders={cylinders} colliderRef={colliderGroup}>{solids}</WalkColliders>
      <DoorColliders doors={doors} doorsOpen={doorsOpen} colliderRef={doorColliderGroup} />
      <PointerLockControls selector=".sw-canvas-wrap" pointerSpeed={0.55} />
    </>
  );
}
