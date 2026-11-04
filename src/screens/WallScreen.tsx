// An interactive screen hung on a wall: a DOM overlay (the room's panel)
// warped onto a fixed quad on the wall face every frame, with a drawn standby
// plate where it hangs while nobody is using it.
//
// WHICH ROUTE, and why it is ConsoleRig's rather than a texture or drei's
// <Html transform>: html-on-3d-surfaces needs real inputs here (a text field,
// a password, a list), and the only route that gives real DOM in every
// browser at a legible size is the projected-corner overlay — screenWarp.ts.
// Its cost is that DOM cannot be hidden behind scene objects, so like the
// machine consoles the panel is on screen only while it is powered, and what
// hangs on the wall the rest of the time is the standby plate, an ordinary
// lit-and-occluded CanvasTexture, which is also what a walker or an orbit
// click aims at.
//
// There is no mast, no yaw to follow and no CRT collapse: a wall screen does
// not turn to face anyone, and powers on and off at once.

import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, DoubleSide } from "three";
import type { Group } from "three";
import { CONSOLE_PX_H, CONSOLE_PX_W } from "../core/screenSize";
import { useScreenWarp } from "./screenWarp";
import {
  getGlowTexture,
  HALO_STANDOFF,
  hungOnWall,
  INK,
  PANEL_STANDOFF,
  PAPER_DIM,
  PHOS,
  PHOS_HI,
  SCREEN_H,
  SCREEN_W,
  SCREEN_Y,
} from "../core/engine";
import { useCanvasTexture } from "../core/useCanvasTexture";
import { WallCoordTag } from "./WallCoordTag";

function drawStandby(ctx: CanvasRenderingContext2D, title: string, caption: string, hint: string): void {
  const w = CONSOLE_PX_W;
  const h = CONSOLE_PX_H;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = PHOS;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 4;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PHOS_HI;
  ctx.font = "700 76px 'IBM Plex Mono', monospace";
  ctx.fillText(title, w / 2, h / 2 - 20);
  ctx.fillStyle = PAPER_DIM;
  ctx.font = "30px 'IBM Plex Mono', monospace";
  ctx.fillText(caption, w / 2, h / 2 + 40);
  ctx.fillStyle = PHOS;
  ctx.font = "700 30px 'IBM Plex Mono', monospace";
  ctx.fillText(hint, w / 2, h - 70);
}

export interface WallScreenProps {
  /** The wall's centre-line point the screen hangs at, and the turn that
   * puts its face into the room (rotationY: 0 faces +z, PI faces -z). */
  wall: readonly [number, number];
  rotationY: number;
  /** The panel's short id (assigned by the host), printed in its corner. */
  panelId: string;
  /** The standby plate's three lines. */
  title: string;
  caption: string;
  hint: string;
  /** The DOM screen is on: warped onto this quad, taking keys. */
  powered: boolean;
  /** The element the room mounts its panel in. */
  screen: RefObject<HTMLDivElement | null>;
  /** The screen has gone dark and its DOM may unmount. */
  onPoweredOff: () => void;
  /** A click on the plate (orbit mode) asks for the panel. */
  onActivate?: () => void;
}

export function WallScreen({
  wall, rotationY, panelId, title, caption, hint, powered, screen, onPoweredOff, onActivate,
}: WallScreenProps) {
  const group = useRef<Group>(null);
  const reported = useRef(false);
  const { warp, hide } = useScreenWarp(screen);
  const { canvas, texture } = useCanvasTexture(CONSOLE_PX_W, CONSOLE_PX_H);
  const [x, z] = hungOnWall(wall, rotationY, PANEL_STANDOFF);

  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const paint = () => {
      if (!alive) return;
      drawStandby(ctx, title, caption, hint);
      texture.needsUpdate = true;
    };
    paint();
    // Again once the webfont has arrived: a canvas asked for 'IBM Plex Mono'
    // before it loads silently draws the fallback and never corrects itself.
    void document.fonts?.ready.then(paint);
    return () => {
      alive = false;
    };
  }, [canvas, texture, title, caption, hint]);

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

  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    if (!powered) {
      if (!reported.current) {
        reported.current = true;
        hide();
        onPoweredOff();
      }
      return;
    }
    reported.current = false;
    warp(g, camera);
  });

  return (
    <group ref={group} position={[x, SCREEN_Y, z]} rotation={[0, rotationY, 0]}>
      <mesh
        onClick={
          onActivate
            ? (event) => {
                event.stopPropagation();
                onActivate();
              }
            : undefined
        }
        onPointerOver={() => {
          if (onActivate) document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
        }}
      >
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        <meshBasicMaterial map={texture} side={DoubleSide} toneMapped={false} />
      </mesh>
      {/* The halo hangs a hair in front of the wall face, or the opaque wall
          would swallow it; brighter while the screen is on. */}
      <mesh position={[0, 0, HALO_STANDOFF - PANEL_STANDOFF]}>
        <planeGeometry args={[SCREEN_W * 1.6, SCREEN_H * 1.8]} />
        <meshBasicMaterial
          map={getGlowTexture()}
          color={PHOS}
          transparent
          opacity={powered ? 0.45 : 0.16}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
        />
      </mesh>
      <Line points={bezel.frame} color={PHOS} lineWidth={1} transparent opacity={0.35} />
      {bezel.corners.map((pts, i) => (
        <Line key={i} points={pts} color={PHOS_HI} lineWidth={2} transparent opacity={0.95} />
      ))}
      <WallCoordTag id={panelId} x={wall[0]} z={wall[1]} panelW={SCREEN_W + 0.1} panelH={SCREEN_H + 0.1} />
    </group>
  );
}
