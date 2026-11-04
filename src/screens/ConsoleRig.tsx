// The console screen-projection + camera-approach subsystem for the
// viewport.
//
// A machine's console powers on when you ask for it: walk up to a machine and
// press E, or click one in orbit and the camera flies you there. The
// console is a green-phosphor screen on a mast in front of the machine — a
// 3D bezel, a halo and a pool of light standing in for bloom, around a DOM
// screen (the host's console). Green means a machine's screen is on; everything
// else stays the cream drawing. Only the powered console mounts DOM; every
// other machine shows a standby cursor.
//
// The screen is an ordinary DOM overlay beside the canvas, warped every
// frame onto the four corners the WebGL camera projects for it — a
// homography, as one pixel-space matrix3d (screenWarp.ts). Not drei's
// <Html transform>: that maps one world unit to one CSS pixel, so its
// matrix3d chain carries translations of a pixel or two, and at the ~290x
// magnification a walked-up console needs, Chrome's sub-pixel snapping of
// them landed the screen 128px below its own bezel, measured on Chrome 148
// and 152 alike. Living in the page's own React tree also gives the screen
// the app's QueryClient and router, which drei's separate root would not.
//
// A DOM screen, not a texture: text stays crisp and selectable, and the
// input takes real keys, in every browser. three's HTMLTexture (r184, in
// the pinned 0.186) would let the screen be lit and occluded as part of the
// render, but it rides Chrome's HTML-in-Canvas origin trial and uploads
// NOTHING where that API is missing — a blank screen, no error. The seam
// for it is ConsoleRig: a plane whose map is `new HTMLTexture(el)`,
// feature-detected on `'texElementImage2D' in gl` (WebGL) or
// `device.queue.copyElementImageToTexture` (WebGPU), with this overlay kept
// as the fallback so no browser ever gets the blank one.

import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { AdditiveBlending, DoubleSide, Spherical, Vector3 } from "three";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import { useScreenWarp } from "./screenWarp";
import { registerCameraBasis, registerOrbitNudge } from "../core/hotkeys";
import {
  CAMERA_PRIORITY,
  easeInOut,
  FLY_MS,
  getGlowTexture,
  HOME_POS,
  HOME_TARGET,
  ORBIT_STEP,
  PAPER,
  PHOS,
  PHOS_HI,
  SCREEN_H,
  SCREEN_W,
  SCREEN_Y,
} from "../core/engine";

export type Anchor = { id: string; dirX: number; dirZ: number };

interface OrbitLike {
  target: Vector3;
  enabled: boolean;
  update: () => void;
}

/** Keyboard orbit: j left, ; right, k up, l down. Hold repeats. */
export function OrbitNudge() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null;

  useEffect(() => {
    const offset = new Vector3();
    const spherical = new Spherical();
    const forward = new Vector3();
    const unNudge = registerOrbitNudge((azim, polar) => {
      if (!controls) return;
      offset.subVectors(camera.position, controls.target);
      spherical.setFromVector3(offset);
      spherical.theta += azim * ORBIT_STEP;
      spherical.phi = Math.min(Math.PI / 2 - 0.04, Math.max(0.08, spherical.phi + polar * ORBIT_STEP));
      offset.setFromSpherical(spherical);
      camera.position.copy(controls.target).add(offset);
      camera.lookAt(controls.target);
      controls.update();
    });
    const unBasis = registerCameraBasis(() => {
      camera.getWorldDirection(forward);
      const flen = Math.hypot(forward.x, forward.z) || 1;
      const fx = forward.x / flen;
      const fz = forward.z / flen;
      return { fx, fz, rx: -fz, rz: fx };
    });
    return () => {
      unNudge();
      unBasis();
    };
  }, [camera, controls]);

  return null;
}

/** Where FlyRig returns the camera to when its goal clears. */
export interface FlyHome {
  pos: readonly [number, number, number];
  target: readonly [number, number, number];
}

const DEFAULT_HOME: FlyHome = { pos: HOME_POS, target: HOME_TARGET };

/** Orbit mode's camera move: onto a console when one powers on, and `home`
 * again when it powers off (the engine's HOME_POS/HOME_TARGET if not given).
 * Under reduced motion it cuts instead. */
export function FlyRig({
  goal, reduce, home = DEFAULT_HOME,
}: {
  goal: { pos: Vector3; target: Vector3 } | null;
  reduce: boolean;
  home?: FlyHome;
}) {
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null;
  const camera = useThree((s) => s.camera);
  const flight = useRef<{ fromPos: Vector3; fromTarget: Vector3; toPos: Vector3; toTarget: Vector3; t0: number } | null>(null);
  const first = useRef(true);
  // Read when a goal clears, not a dependency: a host passing an inline
  // literal must not restart a flight on every render.
  const homeRef = useRef(home);
  homeRef.current = home;

  useEffect(() => {
    if (!controls) return;
    if (first.current) {
      first.current = false;
      if (!goal) return; // mounted at home: nothing to fly
    }
    const toPos = goal ? goal.pos.clone() : new Vector3(...homeRef.current.pos);
    const toTarget = goal ? goal.target.clone() : new Vector3(...homeRef.current.target);
    if (reduce) {
      camera.position.copy(toPos);
      controls.target.copy(toTarget);
      controls.update();
      flight.current = null;
      return;
    }
    flight.current = {
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPos,
      toTarget,
      t0: performance.now(),
    };
    controls.enabled = false;
  }, [goal, controls, camera, reduce]);

  useFrame(() => {
    const f = flight.current;
    if (!f || !controls) return;
    const t = Math.min(1, Math.max(0, (performance.now() - f.t0) / FLY_MS));
    const k = easeInOut(t);
    camera.position.lerpVectors(f.fromPos, f.toPos, k);
    controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
    controls.update();
    if (t >= 1) {
      flight.current = null;
      controls.enabled = true;
    }
  }, CAMERA_PRIORITY);
  return null;
}

/** The powered console: a mast, a phosphor bezel, a halo and a floor pool,
 * with the DOM screen warped onto the bezel every frame. It opens like a
 * CRT — a bright line that grows to a picture — and closes back to the line
 * before it unmounts. Its frame runs after the camera rigs (priority 0
 * against their -2), so the screen is placed for the camera this frame
 * draws with, not the last one. */
export function ConsoleRig({
  px, pz, offset, anchor, mode, powered, reduce, screen, onPoweredOff,
}: {
  /** Where on the floor the console stands, and how far proud of it the
   * screen is held. Given rather than derived from a host, because the
   * room consoles are the same rig on a plinth that is not a
   * machine. */
  px: number;
  pz: number;
  offset: number;
  anchor: Anchor | null;
  mode: "orbit" | "walk";
  powered: boolean;
  reduce: boolean;
  screen: RefObject<HTMLDivElement | null>;
  onPoweredOff: () => void;
}) {
  const group = useRef<Group>(null);
  const halo = useRef<Mesh>(null);
  const pool = useRef<Mesh>(null);
  const power = useRef(reduce ? 1 : 0);
  const yaw = useRef<number | null>(null);
  const reported = useRef(false);
  const { warp } = useScreenWarp(screen);

  const bezel = useMemo(() => {
    const hw = SCREEN_W / 2 + 0.05;
    const hh = SCREEN_H / 2 + 0.05;
    const c = 0.16;
    const corners: [number, number, number][][] = [
      [[-hw, hh - c, 0], [-hw, hh, 0], [-hw + c, hh, 0]],
      [[hw - c, hh, 0], [hw, hh, 0], [hw, hh - c, 0]],
      [[hw, -hh + c, 0], [hw, -hh, 0], [hw - c, -hh, 0]],
      [[-hw + c, -hh, 0], [-hw, -hh, 0], [-hw, -hh + c, 0]],
    ];
    const frame: [number, number, number][] = [[-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0], [-hw, -hh, 0]];
    return { corners, frame };
  }, []);

  useFrame(({ camera }, dt) => {
    const g = group.current;
    if (!g) return;
    // Which way the screen faces: the walker, live; or the direction the
    // orbit click came from, fixed, so the screen holds still under a
    // flying camera.
    let dx = anchor?.dirX ?? 0;
    let dz = anchor?.dirZ ?? 1;
    if (mode === "walk") {
      dx = camera.position.x - px;
      dz = camera.position.z - pz;
    }
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const want = Math.atan2(dx, dz);
    if (yaw.current === null || reduce || mode === "orbit") {
      yaw.current = want;
    } else {
      let d = want - yaw.current;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw.current += d * Math.min(1, dt * 5);
    }
    const ya = yaw.current;
    g.rotation.set(0, ya, 0);
    g.position.set(px + Math.sin(ya) * offset, SCREEN_Y, pz + Math.cos(ya) * offset);

    const target = powered ? 1 : 0;
    if (reduce) power.current = target;
    else power.current += (target - power.current) * Math.min(1, dt * (powered ? 7 : 11));
    const p = power.current;
    // CRT: height leads, width follows a little behind.
    const sy = Math.max(0.004, Math.min(1, p * 1.15) ** 2);
    const sx = 0.82 + 0.18 * Math.min(1, p * 1.4);
    g.scale.set(sx, sy, 1);
    const hm = halo.current?.material as MeshBasicMaterial | undefined;
    if (hm) hm.opacity = 0.5 * p;
    const pm = pool.current?.material as MeshBasicMaterial | undefined;
    if (pm) pm.opacity = 0.3 * p;

    // Warp the DOM screen onto the corners this camera sees.
    warp(g, camera);

    if (!powered && p < 0.02 && !reported.current) {
      reported.current = true;
      onPoweredOff();
    }
    if (powered) reported.current = false;
  });

  useEffect(() => () => {
    // Unmounted: the overlay must not keep showing the last warp it had.
    if (screen.current) screen.current.style.visibility = "hidden";
  }, [screen]);

  return (
    <group ref={group}>
      {/* halo behind the glass */}
      <mesh ref={halo} position={[0, 0, -0.06]}>
        <planeGeometry args={[SCREEN_W * 1.9, SCREEN_H * 2.1]} />
        <meshBasicMaterial
          map={getGlowTexture()}
          color={PHOS}
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
        />
      </mesh>
      {/* mast to the floor, and a pool of light where it stands */}
      <Line points={[[0, -SCREEN_H / 2 - 0.05, -0.02], [0, -SCREEN_Y, -0.02]]} color={PAPER} lineWidth={1.1} transparent opacity={0.6} />
      <Line points={[[-0.18, -SCREEN_Y + 0.004, -0.02], [0.18, -SCREEN_Y + 0.004, -0.02]]} color={PAPER} lineWidth={1.1} transparent opacity={0.6} />
      <mesh ref={pool} position={[0, -SCREEN_Y + 0.006, 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.6, 2.6]} />
        <meshBasicMaterial
          map={getGlowTexture()}
          color={PHOS}
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      {/* bezel: a faint frame, and corner brackets like the viewport's own */}
      <Line points={bezel.frame} color={PHOS} lineWidth={1} transparent opacity={0.35} />
      {bezel.corners.map((pts, i) => (
        <Line key={i} points={pts} color={PHOS_HI} lineWidth={2} transparent opacity={0.95} />
      ))}
    </group>
  );
}
