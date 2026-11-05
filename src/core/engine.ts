// The site-world engine's constants and pure helpers: palette, wall/door/standoff
// units, the player and physics numbers, camera, interaction thresholds, and the
// few small helpers (hashStr, easeInOut, fitText, getGlowTexture) every engine
// module reads. Nothing here names a room or a layout — that is the host's world.
//
// This file is part of the engine (see boundary.test.ts); it imports
// only three.js and screenSize.ts.
import { CanvasTexture, SRGBColorSpace } from "three";
import { CONSOLE_PX_H, CONSOLE_PX_W } from "./screenSize";

export const INK = "#0a0d13";
export const PAPER = "#ece7da";
export const PAPER_DIM = "#b9b3a2";
export const OK = "#49d199";
export const INFO = "#5a9fe0";
export const WARN = "#e7a53d";
export const CRITICAL = "#FF6877";
// The console's phosphor — a material, like console.css's --phos, never a
// status colour.
export const PHOS = "#58e892";
export const PHOS_HI = "#9dffbe";
// Wall fill: opaque, but deliberately dark — near INK, not PAPER — so a
// plain door (a solid PAPER slab, no frame, see PlainDoorLeaf.tsx: "a door has
// to read as an actual barrier") still reads as visually distinct from the
// wall around it. Edges keep the same cream line-drawing accent every other
// solid prop in the room carries.
export const WALL_FILL = "#141a24";

export const WALL = 4.2;
// Size each doorway to exactly the width of the room it leads to. A doorway
// narrower than its room leaves a jamb that a walker snags on with casual WASD
// input and no precision aiming; matching the room's own width removes the
// jamb. One shared gap width cannot do this for rooms of different widths, so
// each doorway takes its own room's width.
// One wall's thickness: the walk-mode collider's, and the visible fill's too —
// the host's wall renderer draws each of a host's wall boxes at exactly this size, on
// the centre-line every coordinate in the room is measured to.
export const COLLIDER_WALL_T = 0.2;
// From that centre-line to the wall's visible face on either side. Anything
// hung on a wall is measured from here, not from the line: a plane on the line
// is inside the opaque box, and hidden.
export const WALL_FACE = COLLIDER_WALL_T / 2;
// How far from the centre-line a flat panel's plane hangs: a hair in front of
// the visible face, so it never z-fights with it. Large boards hang a hair further out, and the halo each carries between it and
// the wall a hair less.
export const PANEL_STANDOFF = WALL_FACE + 0.03;
export const BOARD_STANDOFF = WALL_FACE + 0.04;
export const HALO_STANDOFF = WALL_FACE + 0.01;

/** Where a panel's plane hangs: the wall centre-line point `wall`, moved
 * `standoff` along the normal `rotationY` turns the panel's front face onto
 * (0 faces +z, PI faces -z, ±PI/2 faces ±x). What a WallCoordTag prints is
 * `wall` itself, never this — the number a person quotes stays put if a
 * standoff changes. */
export function hungOnWall(
  wall: readonly [number, number],
  rotationY: number,
  standoff: number = PANEL_STANDOFF,
): [number, number] {
  return [wall[0] + Math.sin(rotationY) * standoff, wall[1] + Math.cos(rotationY) * standoff];
}

// Generic fall-and-respawn threshold — any hazard anywhere in the world that
// wants "fall through and get put back somewhere safe" reads this same
// constant; it is not specific to any one hazard.
export const KILL_PLANE_Y = -3;
// One solid box, in world space. A standing wall runs from y=0 to y=WALL; a
// door header from DOOR_H to WALL. A host's wall boxes and door headers are
// the layout's one home for the solid boxes: the visible walls and the
// walk-mode Octree (WalkPhysics.tsx's WalkColliders) both build from them, so
// what a walker sees is what a walker bumps.
export interface WallSegment {
  pos: readonly [number, number, number];
  size: readonly [number, number, number]; // [width(x), height, depth(z)]
}

// The doorways cut through the hub room's walls. Each is a gap exactly
// as wide as the room behind it (see the note above), and
// DOOR_H high: a door leaf stands on the floor and a header
// fills the gap from there up to WALL.
export interface Doorway {
  /** Middle of the gap, on the wall's centre-line. */
  center: readonly [number, number];
  /** Which way the gap runs along its wall. */
  axis: "x" | "z";
  halfWidth: number;
}

// A door leaf's height, and so the header's underside. The walker is a capsule
// whose crown is EYE + PLAYER_RADIUS = 1.97m, and a jump lifts it by
// JUMP_IMPULSE^2 / (2 * GRAVITY) = 0.63m: 2.60m at the top of the arc, so a
// walker jumping through an open door does not hit their head on the header.
// 0.1m above that; a taller door would leave the header too shallow for the
// room's name.
export const DOOR_H = 2.7;
export const DOOR_HEADER_H = WALL - DOOR_H;

// The steel frame around a doorway (DoorFrame.tsx) stands a jamb post this
// wide outside each side of the gap, 0.09m proud of the wall on both faces —
// so a door's frame reaches halfWidth + DOOR_POST_W from its centre, and
// anything hung on the wall beside a door starts past that, not at halfWidth.
export const DOOR_POST_W = 0.3;
// Each room's name hangs on its header, on the hub room's own side — the hub
// every walker passes through before choosing a door — as a banner about the
// gap's width, centred in the header. A room with no door carries none. `rotationY` puts the banner's face toward
// the hub room, the same convention wall panels and plaques use on
// their own walls (rotationY=0 faces +z, Math.PI faces -z, ±PI/2 faces ±x).
export interface DoorSignSpec {
  label: string;
  sub: string;
  panelId: string;
  /** The wall centre-line point the banner hangs at, the doorway's middle:
   * what its coord tag prints. */
  wall: readonly [number, number];
  /** Where its plane is, PANEL_STANDOFF in front of `wall`. */
  pos: readonly [number, number, number];
  rotationY: number;
  width: number;
  height: number;
}

export const HOME_POS: [number, number, number] = [11.5, 8.4, 11.5];
export const HOME_TARGET: [number, number, number] = [0, 0.9, 0];
export const EYE = 1.62;
export const PLAYER_RADIUS = 0.35;
export const GRAVITY = 14;
export const JUMP_IMPULSE = 4.2;
// A single push-out along a hit's normal is not always enough to clear a
// corner, where resolving one wall's penetration can reveal another's — the
// standard Octree/Capsule pattern resolves in a short loop, not once.
export const COLLISION_ITERATIONS = 4;
// Jump buffering + coyote time: a Space press just remembers "jump wanted"
// for JUMP_BUFFER_MS instead of firing only if the exact frame it landed on
// already reads playerOnFloor === true, and a landing stays "good enough to
// jump from" for COYOTE_MS after it's no longer literally true — the fixed
// COLLISION_ITERATIONS loop above doesn't always confirm a floor hit on the
// very same frame it also resolves a wall push-out (e.g. walking into a
// doorway edge), so gating a jump on that one frame's exact reading drops
// presses with no retry until release+re-press. Values lean toward the
// tighter, action-platformer end of standard game-dev ranges (coyote
// ~70-140ms, buffer ~100-150ms) since the world may include precision jumps,
// not the most forgiving casual-mobile end.
export const JUMP_BUFFER_MS = 130;
export const COYOTE_MS = 100;

// The console screen in world units; its height keeps the DOM's aspect.
export const SCREEN_W = 1.92;
export const SCREEN_H = (SCREEN_W * CONSOLE_PX_H) / CONSOLE_PX_W;
export const SCREEN_Y = 1.5;
// How far from the console the orbit fly-in parks the camera: near enough
// that the screen fills most of the viewport's height at the 40° lens.
export const VIEW_DIST = 2.15;

// Walk-up: power on when this close to a machine and roughly facing it; power
// off once past the wider ring or turned well away. The gap between the two
// is the hysteresis that stops a console flickering at the boundary.
export const ENTER_DIST = 3.4;
export const EXIT_DIST = 4.3;
export const ENTER_FACING = 0.6;
export const EXIT_FACING = 0.12;

export const FLY_MS = 1150;

// Frame order: the camera moves first (walk keys, the fly-in — drei's
// OrbitControls updates at -1), then everything placed against it at 0.
// Negative, because a positive priority would switch off R3F's own render.
export const CAMERA_PRIORITY = -2;
export const ORBIT_STEP = 0.14;

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Shrinks `text` to an ellipsis-terminated fit within `max` px, measured
 * against `ctx`'s current font. Shared by every canvas-drawn panel that
 * lists rows of unpredictable length. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut}…`;
}

// One soft radial falloff, drawn once and shared by every halo and floor
// pool — a stand-in for bloom that costs one texture and no post pass.
let glowTexture: CanvasTexture | null = null;
export function getGlowTexture(): CanvasTexture {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.42)");
    g.addColorStop(0.7, "rgba(255,255,255,0.1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  glowTexture = new CanvasTexture(canvas);
  glowTexture.colorSpace = SRGBColorSpace;
  return glowTexture;
}

export interface WallRun {
  id: string;
  /** Midpoint of the run on the wall's own centre-line — the line outline()
   * draws, not the visible face. */
  x: number;
  z: number;
  /** Corner to corner along that line. */
  length: number;
  /** Rotation about y that turns a plane's front face into the room the run
   * bounds. Its local +x is then the right hand of someone standing in the
   * room facing the wall. */
  ry: number;
  /** How far the visible face stops short of the run's right-hand end: half
   * a wall's thickness where another wall turns into the room, nothing at a
   * doorway flank. */
  rightInset: number;
}

// A walkable-floor graph the demon game steers over (doom/doomNav.ts). Zones
// are named areas of the floor plan (main, a corridor, an arena).
export type NavZone = "main" | "tunnel" | "undercroft";

/** One walkable floor rectangle. Cells never overlap: a body is in exactly
 * one, and moves to another only across a NAV_LINKS edge. */
export interface NavCellSpec {
  id: string;
  zone: NavZone;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Floor height; a ramp rises `rise` along z from `footZ` to `topZ`. */
  y: number;
  ramp?: { footZ: number; topZ: number; rise: number };
}
