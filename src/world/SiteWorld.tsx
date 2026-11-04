// <SiteWorld> — the whole viewport: a canvas with an orbit or walk camera, the
// doors, the rooms, the terminals, and the DOM layer their screens live in.
// It is the one component a host renders; everything it needs from the host is
// data and children:
//
//   rooms     SiteRoom modules (core/room.ts) — each draws itself, owns its
//             terminals, and may add solids to the walk octree.
//   doors     SiteDoor list (doors/door.ts).
//   children  The scene itself — floor, walls, props — drawn inside the canvas.
//   solids    Static walk solids (the floor and walls, as invisible boxes).
//   overlay   DOM beside the canvas, e.g. a host's own console screen.
//
// Nothing here names a room, a layout or a data source.
import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Canvas, useFrame, useThree, type GLProps } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Vector3, WebGLRenderer } from "three";
import "../styles.css";
import { DoorSigns } from "../doors/DoorSign";
import { DoorLighting } from "../doors/DoorMetal";
import { SiteDoorLeaves, SiteDoorTriggers, useDoorsOpen } from "../doors/Doors";
import type { SiteDoor } from "../doors/door";
import { DoomRig } from "../doom/Doom";
import { DoomHud } from "../doom/DoomHud";
import type { SwitchAt } from "../doom/DemonSwitch";
import { FlyRig, OrbitNudge } from "../screens/ConsoleRig";
import { UsePrompt } from "../screens/UsePrompt";
import { WalkRig, type RoundSolid } from "../walk/WalkPhysics";
import { EYE, INK, SCREEN_Y, VIEW_DIST, type DoorSignSpec } from "../core/engine";
import { useRoomModels, type RoomEnv, type SiteRoom } from "../core/room";
import { useTerminals } from "../core/terminals";

export interface SiteCamera {
  /** Orbit: where the camera starts, and what it looks at and orbits. */
  home: readonly [number, number, number];
  target: readonly [number, number, number];
  /** Walk: where the walker is put on entering walk mode, and what they face. */
  walkStart: readonly [number, number];
  walkLookAt: readonly [number, number, number];
}

export interface SiteWorldProps {
  mode: "orbit" | "walk";
  reduce: boolean;
  camera: SiteCamera;
  rooms: readonly SiteRoom[];
  doors?: readonly SiteDoor[];
  doorSigns?: readonly DoorSignSpec[];
  /** Static walk solids and round solids (columns); rooms add their own. */
  solids?: ReactNode;
  cylinders?: readonly RoundSolid[];
  /** The nearest safe [x, z] a fall returns the walker to. */
  checkpoint?: [number, number] | null;
  /** The demon game, if the world has it: where its switch hangs. */
  doomSwitchAt?: SwitchAt;
  /** Open a page of the host application from a terminal. */
  onOpenPage: RoomEnv["onOpenPage"];
  /** The host's camera floor position is written here every frame, so its own
   * DOM-side code (fly-ins, anchors) can read it without re-rendering. */
  cameraRef: RefObject<{ x: number; z: number }>;
  /** A host-owned console (not a room terminal) is powered: terminals close. */
  consoleId?: string | null;
  onConsoleExit?: () => void;
  /** An orbit fly-in the host wants (a machine console), alongside the
   * terminals' own. */
  hostGoal?: { pos: Vector3; target: Vector3 } | null;
  /** The host's own "[E]" prompt, shown after the demon switch's and before
   * the rooms'. */
  hostPrompt?: string | null;
  /** One line of help shown over the viewport while walking. */
  walkHint?: ReactNode;
  /** Drawn inside the canvas. */
  children?: ReactNode;
  /** DOM in the screen layer, beside the rooms' own overlays. */
  overlay?: ReactNode;
  background?: string;
}

function CameraRig({ mode, camera: cfg }: { mode: "orbit" | "walk"; camera: SiteCamera }) {
  const { camera } = useThree();
  useEffect(() => {
    if (mode === "walk") {
      camera.position.set(cfg.walkStart[0], EYE, cfg.walkStart[1]);
      camera.lookAt(...cfg.walkLookAt);
    } else {
      camera.position.set(...cfg.home);
      camera.lookAt(...cfg.target);
    }
  }, [mode, camera, cfg]);
  return null;
}

/** Keeps the camera's floor position where the DOM side can read it, without
 * re-rendering anything per frame. */
function CameraTracker({ into }: { into: RefObject<{ x: number; z: number }> }) {
  useFrame(({ camera }) => {
    into.current.x = camera.position.x;
    into.current.z = camera.position.z;
  });
  return null;
}

const NONE: readonly never[] = [];

export function SiteWorld({
  mode, reduce, camera, rooms, doors = NONE, doorSigns, solids, cylinders = NONE, checkpoint, doomSwitchAt,
  onOpenPage, cameraRef, consoleId = null, onConsoleExit, hostGoal = null, hostPrompt = null, walkHint,
  children, overlay, background = INK,
}: SiteWorldProps) {
  const [doorsOpen, setDoorOpen] = useDoorsOpen(doors);
  const [nearDemonSwitch, setNearDemonSwitch] = useState(false);

  const terminalDefs = useMemo(() => rooms.flatMap((r) => r.terminals ?? []), [rooms]);
  const exit = onConsoleExit ?? noop;
  const terminals = useTerminals(terminalDefs, { mode, consoleId, cameraRef, onConsoleExit: exit });
  const env: RoomEnv = { mode, reduce, terminals, onOpenPage };
  const models = useRoomModels(rooms, env);
  const prompt = rooms.reduce<string | null>((found, room, i) => found ?? room.prompt?.(models[i], env) ?? null, null);

  // Rooms' own solids, plus the host's: one static octree, rebuilt when they change.
  const allSolids = useMemo(
    () => [<Fragment key="host">{solids}</Fragment>, ...rooms.map((room) => room.Colliders && <room.Colliders key={room.id} />)],
    [solids, rooms],
  );

  const makeRenderer: GLProps = useMemo(
    () => ({ canvas }) => {
      const renderer = new WebGLRenderer({
        canvas: canvas as HTMLCanvasElement,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      renderer.setClearColor(background, 1);
      return renderer;
    },
    [background],
  );

  // The powered terminal's fly-in, for terminals that ask for one (flyOffset).
  const terminalGoal = useMemo(() => {
    const active = terminals.active;
    if (mode !== "orbit" || !active?.def.flyOffset || !active.anchor || consoleId) return null;
    const [x, z] = active.def.stand;
    const { dirX, dirZ } = active.anchor;
    const center = new Vector3(x + dirX * active.def.flyOffset, SCREEN_Y, z + dirZ * active.def.flyOffset);
    const pos = center.clone().add(new Vector3(dirX * VIEW_DIST, 0.12, dirZ * VIEW_DIST));
    return { pos, target: center };
  }, [mode, terminals.active, consoleId]);

  return (
    <>
      <div className="sw-canvas-wrap">
        <Canvas
          flat
          linear
          dpr={[1, 1.6]}
          camera={{ position: [...camera.home], fov: 40, near: 0.08, far: 90 }}
          gl={makeRenderer}
        >
          <CameraTracker into={cameraRef} />
          <CameraRig mode={mode} camera={camera} />
          {doors.length > 0 && <DoorLighting />}
          {doorSigns && <DoorSigns signs={doorSigns} />}
          <SiteDoorLeaves doors={doors} open={doorsOpen} />
          {children}
          {rooms.map((room, i) => (
            <room.Scene key={room.id} model={models[i]} env={env} />
          ))}
          {doomSwitchAt && <DoomRig enabled={mode === "walk"} onNear={setNearDemonSwitch} switchAt={doomSwitchAt} />}
          <SiteDoorTriggers doors={doors} enabled={mode === "walk"} setOpen={setDoorOpen} />
          {mode === "orbit" && (
            <OrbitControls
              makeDefault
              enableDamping={!reduce}
              dampingFactor={0.08}
              minDistance={consoleId ? 1.2 : 4}
              maxDistance={28}
              maxPolarAngle={Math.PI / 2 - 0.04}
              target={[...camera.target]}
            />
          )}
          {mode === "orbit" && <OrbitNudge />}
          {mode === "orbit" && <FlyRig goal={hostGoal} reduce={reduce} />}
          {mode === "orbit" && <FlyRig goal={terminalGoal} reduce={reduce} />}
          <WalkRig
            enabled={mode === "walk"}
            cylinders={cylinders}
            doors={doors}
            doorsOpen={doorsOpen}
            solids={allSolids}
            checkpoint={checkpoint}
          />
        </Canvas>
        {mode === "walk" && (
          <>
            {walkHint && <p className="sw-walk-hint">{walkHint}</p>}
            <Crosshair />
            {nearDemonSwitch ? <UsePrompt /> : hostPrompt ? <UsePrompt label={hostPrompt} /> : prompt ? <UsePrompt label={prompt} /> : null}
            {doomSwitchAt && <DoomHud />}
          </>
        )}
      </div>
      {/* The DOM screens: siblings of the canvas, so a click on the glass never
          reaches the walk rig's pointer lock or the orbit controls, and a
          screen keeps its host's React context. Each rig writes a transform to
          its own element every frame. */}
      <div className="sw-screen-layer">
        {overlay}
        {rooms.map((room, i) => room.Overlay && <room.Overlay key={room.id} model={models[i]} env={env} />)}
      </div>
    </>
  );
}

const noop = () => {};

function Crosshair() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute", left: "50%", top: "50%", width: 14, height: 14, marginLeft: -7, marginTop: -7,
        pointerEvents: "none",
      }}
    >
      <div style={{ position: "absolute", left: 6, top: 0, width: 2, height: 14, background: "#ece7da", opacity: 0.65 }} />
      <div style={{ position: "absolute", top: 6, left: 0, height: 2, width: 14, background: "#ece7da", opacity: 0.65 }} />
    </div>
  );
}
