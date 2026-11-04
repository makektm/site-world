// SITE's demon game, as one mountable rig. A switch on the main room's
// south wall (press E at it) is a toggle, not a one-shot summon: pulled
// idle it starts wave one; pulled mid-fight it stands the field down
// instead — every live demon clears, and nothing resumes until the switch
// is pulled again — a walker who came here to work should not have to
// finish a fight first. Started, waves hunt the walker through the main
// room, down the Undercroft tunnel off its west wall and into the arena at
// the tunnel's end — wherever the walker runs, a wave rises there, and the
// demons find their way through the tunnel after them. Out of sight and
// quiet, the walker can shake them for a while; a shot gives them away.
// The sidearm fires real rounds — visible tracers, travelling, stopped by
// walls and cover, leaving holes where they strike — on a click, holds
// twelve, and reloads on R; the demons bite, the walker can die, and a
// click or E rises again at wave one. A HUD (doom/DoomHud.tsx, a DOM
// sibling of the canvas) shows health, rounds, wave and score; it starts
// hidden on every visit to walk mode, 4 toggles it, and it takes the gun off
// screen with it.
//
// Mechanics only, on purpose: no backend, no GitHub issues behind the
// demons. Wiring real "bugs" in later only needs the director to take a
// roster instead of doomRules.ts's waveRoster().
//
// The pieces, each in doom/: doomRules.ts (tuning and the pure per-frame
// rules), doomNav.ts (the floor plan demons move on: cells, portals, walls),
// doomHunt.ts (what a demon knows of the walker), doomWorld.ts (the whole
// mutable game and its frame step, plain TypeScript, tested without a
// canvas), the host's layout (as the game reads it), doomStore.ts
// (the one live world and React's two narrow views of it), doomAudio.ts
// (synthesised sound), DemonSwitch.tsx, Demon.tsx + DemonBodies.tsx,
// DoomEffects.tsx (rounds, sparks, rings, pickups), DoomMarks.tsx (holes,
// scorches and ichor), DoomViewmodel.tsx (the gun, in its own drei <Hud>),
// DoomHud.tsx. This file only wires input and the frame step.
//
// Input: separate `window` listeners rather than extending WalkRig's — the
// existing PointProximity pattern already proves several
// independent listeners coexist safely (the browser dispatches one keydown
// to every listener, there is no race), and it keeps a scene-specific
// mechanic out of the generic movement/collision file. The trigger only
// counts while the pointer is locked: the very click that requests pointer
// lock fires before the lock lands (it's asynchronous in every browser), so
// without that guard the click that locks the cursor would also fire a
// round. R is also held to a locked pointer: unlocked, a bare `r` can be
// the second key of the global `g r` chord (Hotkeys.tsx), and must not
// reload the gun on its way to another page. 4 is bound nowhere else.
import { useCallback, useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { isChromeOpen, isTypingTarget } from "../core/keys";
import { CAMERA_PRIORITY } from "../core/engine";
import { Demon } from "./Demon";
import { DemonSwitchProp, SwitchInteract, type SwitchAt } from "./DemonSwitch";
import { DoomEffects } from "./DoomEffects";
import { DoomMarks } from "./DoomMarks";
import { DoomViewmodel } from "./DoomViewmodel";
import { doomAudio, wakeAudio } from "./doomAudio";
import { doom, publish, useDoomHud, useDoomRoster } from "./doomStore";
import {
  pullSwitch, requestReload, resetWorld, respawn, stepWorld, toggleHud, type Aim,
} from "./doomWorld";

// The world steps after the camera has moved for this frame (WalkRig runs
// at CAMERA_PRIORITY) and before DoomEffects copies the pools out at
// POOL_DRAW_PRIORITY (-1): a round drawn this frame is where it is this
// frame.
const SIM_PRIORITY = CAMERA_PRIORITY + 0.5;

// Where a round leaves from, relative to the eye: forward, right, down.
// Roughly the viewmodel's muzzle — rounds converge on the crosshair's aim
// point anyway (doomWorld.ts's fireRound), so this only sets where the
// tracer is first seen.
const MUZZLE_FWD = 0.55;
const MUZZLE_RIGHT = 0.17;
const MUZZLE_DOWN = 0.14;

/** Input: the trigger, R, 4, and E-or-click to rise again. */
function DoomInput({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const locked = () => document.pointerLockElement != null;
    const mouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || !locked()) return;
      wakeAudio();
      if (doom.director.phase === "dead") {
        respawn(doom, doomAudio);
        return;
      }
      doom.trigger = true;
    };
    const release = () => {
      doom.trigger = false;
    };
    const mouseUp = (event: MouseEvent) => {
      if (event.button === 0) release();
    };
    const lockChange = () => {
      if (!locked()) release();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || isChromeOpen() || event.repeat) return;
      if (event.code === "Digit4") {
        toggleHud(doom);
        return;
      }
      if (event.code === "KeyR" && locked() && !event.ctrlKey && !event.metaKey) {
        wakeAudio();
        requestReload(doom, doomAudio);
        return;
      }
      if (event.code === "KeyE" && doom.director.phase === "dead") {
        wakeAudio();
        respawn(doom, doomAudio);
      }
    };
    window.addEventListener("mousedown", mouseDown);
    window.addEventListener("mouseup", mouseUp);
    window.addEventListener("blur", release);
    document.addEventListener("pointerlockchange", lockChange);
    window.addEventListener("keydown", keyDown);
    return () => {
      window.removeEventListener("mousedown", mouseDown);
      window.removeEventListener("mouseup", mouseUp);
      window.removeEventListener("blur", release);
      document.removeEventListener("pointerlockchange", lockChange);
      window.removeEventListener("keydown", keyDown);
      release();
    };
  }, [enabled]);
  return null;
}

/** Steps the world once a frame from the camera's pose, then pushes
 * whatever changed out to React. */
function DoomStep({ enabled }: { enabled: boolean }) {
  const scratch = useMemo(() => {
    const aim: Aim = { ex: 0, ey: 0, ez: 0, fx: 0, fy: 0, fz: -1, mx: 0, my: 0, mz: 0 };
    return { fwd: new Vector3(), right: new Vector3(), up: new Vector3(), aim };
  }, []);
  useFrame(({ camera }, dtRaw) => {
    if (!enabled) return;
    const { fwd, right, up, aim } = scratch;
    // getWorldDirection refreshes the camera's matrixWorld first, so the
    // two columns read below are this frame's, not last render's.
    camera.getWorldDirection(fwd);
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    const p = camera.position;
    aim.ex = p.x; aim.ey = p.y; aim.ez = p.z;
    aim.fx = fwd.x; aim.fy = fwd.y; aim.fz = fwd.z;
    aim.mx = p.x + fwd.x * MUZZLE_FWD + right.x * MUZZLE_RIGHT - up.x * MUZZLE_DOWN;
    aim.my = p.y + fwd.y * MUZZLE_FWD + right.y * MUZZLE_RIGHT - up.y * MUZZLE_DOWN;
    aim.mz = p.z + fwd.z * MUZZLE_FWD + right.z * MUZZLE_RIGHT - up.z * MUZZLE_DOWN;
    stepWorld(doom, Math.min(dtRaw, 0.05), aim, doomAudio);
    publish();
  }, SIM_PRIORITY);

  // Leaving walk mode ends the game: nothing hunts an orbiting camera.
  useEffect(() => {
    if (enabled) return;
    resetWorld(doom);
    publish();
  }, [enabled]);
  return null;
}

function Demons() {
  const roster = useDoomRoster();
  return (
    <>
      {roster.map((e) => <Demon key={e.id} enemy={e} />)}
    </>
  );
}

/** Composes the switch, the game's frame step and input, the demons, the
 * pools, the marks and the gun into one mountable rig — the host renders
 * one `<DoomRig>` the way it renders one `<WalkRig>`. `onNear` is the only
 * thing that crosses back out to a parent, for the "[E] USE" DOM prompt;
 * the HUD reads the game straight from doomStore.ts. */
export function DoomRig({
  enabled, onNear, switchAt,
}: {
  enabled: boolean;
  onNear: (near: boolean) => void;
  /** Where the world hangs the switch that starts the game. */
  switchAt: SwitchAt;
}) {
  const { camera } = useThree();
  const hud = useDoomHud();
  const summon = useCallback(() => {
    wakeAudio();
    pullSwitch(doom, doomAudio);
  }, []);
  return (
    <>
      <DemonSwitchProp at={switchAt} />
      <SwitchInteract at={switchAt} enabled={enabled} onNear={onNear} onActivate={summon} />
      <DoomStep enabled={enabled} />
      <DoomInput enabled={enabled} />
      {enabled && <Demons />}
      {enabled && <DoomEffects />}
      {enabled && <DoomMarks />}
      {/* 4 (toggleHud) puts the gun away with the HUD — a walker asking the
          screen back to itself for a moment should not still be carrying a
          weapon across it. */}
      {enabled && hud.visible && <DoomViewmodel world={camera} />}
    </>
  );
}
