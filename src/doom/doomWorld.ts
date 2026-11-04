// The demon game's whole mutable state and the one function that advances
// it a frame. Plain TypeScript over plain numbers — the camera arrives as an
// `Aim` of scalars, sounds leave through a `DoomFx` callback — so the whole
// game is testable without a canvas (doomWorld.test.ts drives it frame by
// frame) and nothing here knows three.js exists.
//
// Rounds, sparks, rings, pickups and the marks rounds and deaths leave
// behind live in fixed pools allocated once in createWorld: a slot is
// switched on and off, never created per frame, and the r3f side draws each
// pool with one drei <Instances> (or a fixed set of slot components) that
// only ever reads these slots. Demons are the one
// list that grows and shrinks, and only on a summoning or a removal — the
// `rosterDirty` flag is how React learns it has to re-render that list; it
// never re-renders for a demon moving.
//
// Demons move on SITE's floor plan (doomNav.ts) — the main room, the
// Undercroft tunnel and the arena at its end — and know only what they can
// see, smell or hear of the walker (doomHunt.ts).
import type { NavZone } from "../core/engine";
import { cellAt, floorY, locate, routeToward, zoneOf, type Nav, type Point } from "./doomNav";
import { awaken, sameLevel, sense, type Quarry } from "./doomHunt";
import {
  COMBO_WINDOW,
  DEATH_TIME,
  ENEMY_SPECS,
  PICKUP_AMMO,
  PICKUP_HEAL,
  PLAYER_MAX_HP,
  SIDEARM,
  SLAM_DAMAGE,
  SLAM_RADIUS,
  SLAM_WINDUP,
  SPAWN_TIME,
  WAVE_CLEAR_HEAL,
  addReserve,
  comboMultiplier,
  damagePlayer,
  healPlayer,
  hitEnemy,
  isAlive,
  isBossWave,
  makeEnemy,
  newAmmo,
  newDirector,
  pickRift,
  segmentHitsWalls,
  segmentHitsSphere,
  startReload,
  steerEnemy,
  summon,
  tickAmmo,
  tickDirector,
  tryBite,
  tryFire,
  updateSlam,
  type Ammo,
  type Director,
  type Enemy,
  type FaceNormal,
  type Player,
  type WallBox,
} from "./doomRules";

export interface Bullet {
  active: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
}

export interface Spark {
  active: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  maxLife: number;
  /** 0xRRGGBB — the r3f side sets an instance colour from it, no parsing. */
  color: number;
  size: number;
}

export type RingKind = "death" | "slam" | "rift" | "windup";

/** A flat ring on the floor — a death's shockwave, a slam's blast radius, a
 * summoning circle, a brute's wind-up warning. */
export interface Ring {
  active: boolean;
  kind: RingKind;
  x: number; y: number; z: number;
  bornAt: number;
  duration: number;
  radius: number;
  color: number;
}

export type PickupKind = "health" | "ammo";

export interface Pickup {
  active: boolean;
  kind: PickupKind;
  x: number; y: number; z: number;
  bornAt: number;
}

/** A mark left on a surface: a round's hole in a wall or scorch on the
 * floor, or a slain demon's ichor. Flat against the surface whose normal is
 * (nx, ny, nz); `stamp` changes each time the slot is reused, so the r3f
 * side re-places a mark once rather than every frame. */
export interface Mark {
  active: boolean;
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  bornAt: number;
  size: number;
  spin: number;
  stamp: number;
}

export interface DoomConfig {
  /** The floor plan demons move on. */
  nav: Nav;
  /** Boxes a round stops against. */
  walls: readonly WallBox[];
  ceiling: number;
  /** Summoning points, [x, z], by the zone they stand in. A wave rises in
   * the walker's own zone — in the tunnel, from both ends of it. */
  rifts: Readonly<Record<"main" | "undercroft", readonly (readonly [number, number])[]>>;
  /** Eye height over the feet: where the walker's feet are is the camera's
   * height less this, for what can reach them. */
  eye: number;
}

/** The camera, as numbers: the eye, the unit look direction, and the
 * muzzle's world position (the viewmodel's barrel tip, roughly) that a
 * round leaves from. */
export interface Aim {
  ex: number; ey: number; ez: number;
  fx: number; fy: number; fz: number;
  mx: number; my: number; mz: number;
}

export type SoundName =
  | "shot" | "dry" | "reload" | "reloaded" | "hit" | "kill" | "hurt" | "death"
  | "wave" | "clear" | "spawn" | "windup" | "slam" | "pickup" | "summon";

export interface DoomFx {
  sound(name: SoundName): void;
}

export const NO_FX: DoomFx = { sound: () => {} };

export const MAX_BULLETS = 40;
export const MAX_SPARKS = 220;
export const MAX_RINGS = 12;
export const MAX_PICKUPS = 6;
export const MAX_ENEMIES = 24;
export const MAX_MARKS = 96;
export const MAX_SPLATS = 32;
// A hole or scorch lasts this long, fading over its last MARK_FADE; the
// ring buffer recycles the oldest first long before that in a real fight.
export const MARK_LIFE = 45;
export const MARK_FADE = 10;
export const SPLAT_LIFE = 30;
export const SPLAT_FADE = 8;
// A shot is heard for this long after it rings out — longer than the
// demons' sense cadence, so none of them misses it between two looks.
const NOISE_TIME = 0.25;

const PICKUP_REACH = 1.1;
const PICKUP_LIFE = 18;
// When the magazine and the reserve are both dry, a fresh magazine's worth
// turns up after this long — running out should hurt, never soft-lock a
// fight with demons still standing.
const DRY_RESCUE = 2.5;
// Far enough that a demon never materialises in the player's face.
const RIFT_MIN_DIST = 6;
// A round's hole, across; a scorch on the floor is larger.
const HOLE_SIZE = 0.22;
const AIM_FAR = 30;

export const CRIT_HEX = 0xff6877;
export const PAPER_HEX = 0xece7da;
export const WARN_HEX = 0xe7a53d;
export const PHOS_HEX = 0x58e892;

export interface DoomWorld {
  config: DoomConfig;
  /** Game time in seconds: the sum of clamped frame deltas, so a
   * backgrounded tab doesn't fast-forward a fight. */
  time: number;
  director: Director;
  player: Player;
  ammo: Ammo;
  enemies: Enemy[];
  bullets: Bullet[];
  sparks: Spark[];
  rings: Ring[];
  pickups: Pickup[];
  marks: Mark[];
  splats: Mark[];
  nextId: number;
  kills: number;
  score: number;
  best: number;
  combo: number;
  comboUntil: number;
  /** The mouse button is down (and the pointer locked). */
  trigger: boolean;
  lastShotAt: number;
  dryAt: number;
  /** Counters the HUD keys its one-shot animations on. */
  hitSeq: number;
  killSeq: number;
  hurtSeq: number;
  reloadSeq: number;
  banner: string;
  bannerSeq: number;
  hudVisible: boolean;
  /** Something the HUD shows changed this frame. */
  hudDirty: boolean;
  /** A demon was summoned or removed this frame. */
  rosterDirty: boolean;
  sparkCursor: number;
  ringCursor: number;
  markCursor: number;
  splatCursor: number;
  markStamp: number;
  /** A shot rang out: every demon within earshot hears it until then. */
  noiseUntil: number;
  /** Scratch the frame step writes into instead of allocating. */
  quarry: Quarry;
  route: Point;
  face: FaceNormal;
  riftSets: Readonly<Record<NavZone, readonly (readonly [number, number])[]>>;
  rand: () => number;
}

export function createWorld(config: DoomConfig, rand: () => number = Math.random): DoomWorld {
  const bullets: Bullet[] = [];
  for (let i = 0; i < MAX_BULLETS; i += 1) {
    bullets.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
  }
  const sparks: Spark[] = [];
  for (let i = 0; i < MAX_SPARKS; i += 1) {
    sparks.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, color: CRIT_HEX, size: 1 });
  }
  const rings: Ring[] = [];
  for (let i = 0; i < MAX_RINGS; i += 1) {
    rings.push({ active: false, kind: "death", x: 0, y: 0, z: 0, bornAt: 0, duration: 1, radius: 1, color: CRIT_HEX });
  }
  const pickups: Pickup[] = [];
  for (let i = 0; i < MAX_PICKUPS; i += 1) {
    pickups.push({ active: false, kind: "health", x: 0, y: 0, z: 0, bornAt: 0 });
  }
  const mark = (): Mark => ({ active: false, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, bornAt: 0, size: 1, spin: 0, stamp: 0 });
  const marks = Array.from({ length: MAX_MARKS }, mark);
  const splats = Array.from({ length: MAX_SPLATS }, mark);
  const { main, undercroft } = config.rifts;
  const all = [...main, ...undercroft];
  const riftSets: Record<NavZone, readonly (readonly [number, number])[]> = {
    main: main.length > 0 ? main : all,
    undercroft: undercroft.length > 0 ? undercroft : all,
    tunnel: all,
  };
  return {
    config, time: 0,
    director: newDirector(),
    player: { hp: PLAYER_MAX_HP, hurtAt: -Infinity },
    ammo: newAmmo(),
    enemies: [], bullets, sparks, rings, pickups, marks, splats,
    nextId: 1, kills: 0, score: 0, best: 0, combo: 0, comboUntil: -1,
    trigger: false, lastShotAt: -Infinity, dryAt: -1,
    hitSeq: 0, killSeq: 0, hurtSeq: 0, reloadSeq: 0, banner: "", bannerSeq: 0,
    hudVisible: false, hudDirty: true, rosterDirty: false,
    sparkCursor: 0, ringCursor: 0, markCursor: 0, splatCursor: 0, markStamp: 0,
    noiseUntil: -1,
    quarry: { x: 0, z: 0, cell: 0, heard: false },
    route: { x: 0, z: 0 },
    face: { x: 0, y: 1, z: 0 },
    riftSets,
    rand,
  };
}

function setBanner(w: DoomWorld, text: string): void {
  w.banner = text;
  w.bannerSeq += 1;
  w.hudDirty = true;
}

function clearField(w: DoomWorld): void {
  if (w.enemies.length > 0) w.rosterDirty = true;
  w.enemies.length = 0;
  for (const b of w.bullets) b.active = false;
  for (const p of w.pickups) p.active = false;
  for (const r of w.rings) r.active = false;
}

function resetRun(w: DoomWorld): void {
  w.player.hp = PLAYER_MAX_HP;
  w.player.hurtAt = -Infinity;
  const fresh = newAmmo();
  w.ammo.mag = fresh.mag;
  w.ammo.reserve = fresh.reserve;
  w.ammo.reloadEndsAt = -1;
  w.ammo.nextShotAt = 0;
  w.kills = 0;
  w.score = 0;
  w.combo = 0;
  w.comboUntil = -1;
  w.dryAt = -1;
  w.trigger = false;
}

/** Back to nothing: leaving walk mode ends whatever game was running. */
export function resetWorld(w: DoomWorld): void {
  clearField(w);
  // The marks outlast a death — the walls remember the last fight — but not
  // leaving walk mode.
  for (const m of w.marks) m.active = false;
  for (const m of w.splats) m.active = false;
  resetRun(w);
  w.director.phase = "idle";
  w.director.wave = 0;
  w.director.queue.length = 0;
  w.banner = "";
  // The HUD remounts on the next walk; zeroed counters keep it from
  // replaying the last session's flashes and markers as it does.
  w.hitSeq = 0;
  w.killSeq = 0;
  w.hurtSeq = 0;
  w.bannerSeq = 0;
  // Every visit starts with the HUD (and the gun drawn with it) hidden; 4
  // brings it up for that visit only.
  w.hudVisible = false;
  w.hudDirty = true;
}

/** The wall switch. Starts a game from idle, cuts an intermission short,
 * stands a fight down early — a toggle, not a one-shot summon — and does
 * nothing while dead (respawn is its own action).
 *
 * Standing down does NOT call `resetRun`: the player did not lose, they
 * asked for the field back, so health, ammo, score and kills all carry
 * over to the next pull. Only starting fresh FROM idle resets a run — the
 * same rule idle already followed before this phase existed. */
export function pullSwitch(w: DoomWorld, fx: DoomFx = NO_FX): boolean {
  if (w.director.phase === "dead") return false;
  if (w.director.phase === "fighting") {
    clearField(w);
    w.director.phase = "idle";
    w.director.wave = 0;
    w.director.queue.length = 0;
    fx.sound("clear");
    setBanner(w, "STOOD DOWN");
    w.hudDirty = true;
    return true;
  }
  const wasIdle = w.director.phase === "idle";
  if (wasIdle) resetRun(w);
  if (!summon(w.director, w.time)) return false;
  fx.sound("summon");
  if (wasIdle) setBanner(w, "THEY HEARD THAT");
  w.hudDirty = true;
  return true;
}

/** Rise again after dying: full health, fresh magazine, field cleared,
 * wave one counting in. */
export function respawn(w: DoomWorld, fx: DoomFx = NO_FX): boolean {
  if (w.director.phase !== "dead") return false;
  clearField(w);
  resetRun(w);
  summon(w.director, w.time);
  setBanner(w, "AGAIN");
  fx.sound("summon");
  return true;
}

/** R: start a reload if one makes sense. */
export function requestReload(w: DoomWorld, fx: DoomFx = NO_FX): boolean {
  if (w.director.phase === "dead") return false;
  if (!startReload(w.ammo, w.time)) return false;
  w.reloadSeq += 1;
  w.hudDirty = true;
  fx.sound("reload");
  return true;
}

export function toggleHud(w: DoomWorld): void {
  w.hudVisible = !w.hudVisible;
  w.hudDirty = true;
}

/** Demons still to kill this wave: those standing plus those not yet
 * summoned. */
export function demonsLeft(w: DoomWorld): number {
  let alive = 0;
  for (const e of w.enemies) if (isAlive(e)) alive += 1;
  return alive + w.director.queue.length;
}

function burst(
  w: DoomWorld, x: number, y: number, z: number, count: number, speed: number, color: number, size: number, life: number,
): void {
  for (let n = 0; n < count; n += 1) {
    const s = w.sparks[w.sparkCursor]!;
    w.sparkCursor = (w.sparkCursor + 1) % MAX_SPARKS;
    // A random direction on the upper-biased sphere — sparks read better
    // thrown up and falling than sprayed evenly.
    const u = w.rand() * 2 - 1;
    const a = w.rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const v = speed * (0.35 + w.rand() * 0.65);
    s.active = true;
    s.x = x; s.y = y; s.z = z;
    s.vx = r * Math.cos(a) * v;
    s.vy = (Math.abs(u) * 0.8 + 0.4) * v;
    s.vz = r * Math.sin(a) * v;
    s.maxLife = life * (0.6 + w.rand() * 0.4);
    s.life = s.maxLife;
    s.color = color;
    s.size = size * (0.6 + w.rand() * 0.6);
  }
}

function ring(
  w: DoomWorld, kind: RingKind, x: number, y: number, z: number, radius: number, duration: number, color: number,
): void {
  const r = w.rings[w.ringCursor]!;
  w.ringCursor = (w.ringCursor + 1) % MAX_RINGS;
  r.active = true;
  r.kind = kind;
  r.x = x; r.y = y; r.z = z;
  r.bornAt = w.time;
  r.duration = duration;
  r.radius = radius;
  r.color = color;
}

function dropPickup(w: DoomWorld, x: number, y: number, z: number, kind: "health" | "ammo"): void {
  for (const p of w.pickups) {
    if (p.active) continue;
    p.active = true;
    p.kind = kind;
    p.x = x; p.y = y; p.z = z;
    p.bornAt = w.time;
    return;
  }
}

/** Lay a mark into a pool's next slot — the oldest, once the pool is full. */
function leaveMark(
  w: DoomWorld, splat: boolean,
  x: number, y: number, z: number, nx: number, ny: number, nz: number, size: number,
): void {
  const slots = splat ? w.splats : w.marks;
  const i = splat ? w.splatCursor : w.markCursor;
  if (splat) w.splatCursor = (i + 1) % MAX_SPLATS;
  else w.markCursor = (i + 1) % MAX_MARKS;
  const m = slots[i]!;
  m.active = true;
  m.x = x; m.y = y; m.z = z;
  m.nx = nx; m.ny = ny; m.nz = nz;
  m.bornAt = w.time;
  m.size = size * (0.8 + w.rand() * 0.4);
  m.spin = w.rand() * Math.PI * 2;
  w.markStamp += 1;
  m.stamp = w.markStamp;
}

function fireRound(w: DoomWorld, aim: Aim): void {
  // Aim where the crosshair actually points: find the nearest demon along
  // the eye's ray and converge the round (which leaves from the muzzle,
  // below and right of the eye) on that point; otherwise on a point far
  // down the ray. Without this a round from an offset muzzle misses a
  // close demon the crosshair is dead on.
  let aimT = AIM_FAR;
  const farX = aim.ex + aim.fx * AIM_FAR;
  const farY = aim.ey + aim.fy * AIM_FAR;
  const farZ = aim.ez + aim.fz * AIM_FAR;
  for (const e of w.enemies) {
    if (!isAlive(e)) continue;
    const spec = ENEMY_SPECS[e.kind];
    const t = segmentHitsSphere(aim.ex, aim.ey, aim.ez, farX, farY, farZ, e.x, e.y + spec.height, e.z, spec.hitRadius);
    if (t >= 0 && t * AIM_FAR < aimT) aimT = t * AIM_FAR;
  }
  const tx = aim.ex + aim.fx * aimT;
  const ty = aim.ey + aim.fy * aimT;
  const tz = aim.ez + aim.fz * aimT;
  let dx = tx - aim.mx + (w.rand() - 0.5) * 2 * SIDEARM.spread * aimT;
  let dy = ty - aim.my + (w.rand() - 0.5) * 2 * SIDEARM.spread * aimT;
  let dz = tz - aim.mz + (w.rand() - 0.5) * 2 * SIDEARM.spread * aimT;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  for (const b of w.bullets) {
    if (b.active) continue;
    b.active = true;
    b.x = aim.mx; b.y = aim.my; b.z = aim.mz;
    b.vx = dx * SIDEARM.bulletSpeed;
    b.vy = dy * SIDEARM.bulletSpeed;
    b.vz = dz * SIDEARM.bulletSpeed;
    b.life = SIDEARM.bulletLife;
    return;
  }
}

function onKill(w: DoomWorld, e: Enemy, fx: DoomFx): void {
  const spec = ENEMY_SPECS[e.kind];
  w.kills += 1;
  w.combo = w.time <= w.comboUntil ? w.combo + 1 : 1;
  w.comboUntil = w.time + COMBO_WINDOW;
  w.score += spec.score * comboMultiplier(w.combo);
  if (w.score > w.best) w.best = w.score;
  w.killSeq += 1;
  w.hudDirty = true;
  const big = e.kind === "brute";
  burst(w, e.x, e.y + spec.height, e.z, big ? 70 : 26, big ? 9 : 6, CRIT_HEX, big ? 1.6 : 1, big ? 1.4 : 0.9);
  burst(w, e.x, e.y + spec.height, e.z, big ? 20 : 8, big ? 6 : 4, PAPER_HEX, 0.7, 0.6);
  ring(w, "death", e.x, e.y, e.z, big ? 4.5 : 1.8, big ? 0.9 : 0.5, CRIT_HEX);
  // What is left of it, on the floor where it fell.
  leaveMark(w, true, e.x, e.y, e.z, 0, 1, 0, big ? 3.4 : spec.radius * 3.2);
  if (w.rand() < spec.dropChance) {
    const kind = big || w.player.hp < 50 || w.rand() < 0.55 ? "health" : "ammo";
    dropPickup(w, e.x, e.y, e.z, kind);
  }
  fx.sound("kill");
}

function stepBullets(w: DoomWorld, dt: number, fx: DoomFx): void {
  const { walls, ceiling } = w.config;
  for (const b of w.bullets) {
    if (!b.active) continue;
    const nx = b.x + b.vx * dt;
    const ny = b.y + b.vy * dt;
    const nz = b.z + b.vz * dt;
    // A wall between the muzzle and a demon stops the round first.
    const wallT = segmentHitsWalls(b.x, b.y, b.z, nx, ny, nz, walls, w.face);
    let hit: Enemy | null = null;
    let hitT = wallT >= 0 ? wallT : 2;
    for (const e of w.enemies) {
      if (!isAlive(e)) continue;
      const spec = ENEMY_SPECS[e.kind];
      const t = segmentHitsSphere(b.x, b.y, b.z, nx, ny, nz, e.x, e.y + spec.height, e.z, spec.hitRadius);
      if (t >= 0 && t < hitT) { hitT = t; hit = e; }
    }
    if (wallT >= 0 && !hit) {
      b.active = false;
      const hx = b.x + (nx - b.x) * wallT;
      const hy = b.y + (ny - b.y) * wallT;
      const hz = b.z + (nz - b.z) * wallT;
      burst(w, hx, hy, hz, 5, 3, WARN_HEX, 0.5, 0.3);
      const f = w.face;
      leaveMark(w, false, hx, hy, hz, f.x, f.y, f.z, f.y > 0.5 ? HOLE_SIZE * 1.6 : HOLE_SIZE);
      continue;
    }
    if (hit) {
      const hx = b.x + (nx - b.x) * hitT;
      const hy = b.y + (ny - b.y) * hitT;
      const hz = b.z + (nz - b.z) * hitT;
      const flat = Math.hypot(b.vx, b.vz) || 1;
      b.active = false;
      w.hitSeq += 1;
      w.hudDirty = true;
      burst(w, hx, hy, hz, 7, 4, CRIT_HEX, 0.7, 0.35);
      if (hitEnemy(hit, SIDEARM.damage, b.vx / flat, b.vz / flat, w.time)) onKill(w, hit, fx);
      else fx.sound("hit");
      continue;
    }
    b.x = nx; b.y = ny; b.z = nz;
    b.life -= dt;
    if (ny <= 0.02 || ny >= ceiling) {
      b.active = false;
      burst(w, nx, Math.max(0.05, Math.min(ceiling, ny)), nz, 5, 3, WARN_HEX, 0.5, 0.3);
      // A scorch where it struck the floor; the ceiling is open sky in the
      // drawing, so a round lost up there leaves nothing to see.
      if (ny <= 0.02) leaveMark(w, false, nx, 0, nz, 0, 1, 0, HOLE_SIZE * 1.6);
      continue;
    }
    if (b.life <= 0) b.active = false;
  }
}

function spawnDemon(w: DoomWorld, fx: DoomFx, px: number, pz: number): void {
  if (w.enemies.length >= MAX_ENEMIES) {
    // Full house: put the kind back at the front and try again next gap.
    w.director.queue.unshift(w.director.spawnKind);
    return;
  }
  const nav = w.config.nav;
  const rifts = w.riftSets[zoneOf(nav, w.quarry.cell)];
  const i = pickRift(rifts, px, pz, RIFT_MIN_DIST, w.rand());
  const [rx, rz] = rifts[i]!;
  // A little scatter so two demons from one rift don't share a spot — kept
  // on the rift's own cell, so the scatter never lands one off a ledge.
  const cell = cellAt(nav, rx, rz);
  let x = rx + (w.rand() - 0.5) * 0.8;
  let z = rz + (w.rand() - 0.5) * 0.8;
  if (cellAt(nav, x, z) !== cell) { x = rx; z = rz; }
  const e = makeEnemy(w.nextId, w.director.spawnKind, x, z, w.time, w.rand() * Math.PI * 2, w.director.wave);
  e.cell = cell;
  e.y = floorY(nav, cell, x, z);
  // It rises knowing where the walker is — "they heard that" — and its
  // memory of it starts when the summoning ends.
  awaken(e, w.quarry, w.time + SPAWN_TIME);
  w.nextId += 1;
  w.enemies.push(e);
  w.rosterDirty = true;
  w.hudDirty = true;
  ring(w, "rift", x, e.y, z, ENEMY_SPECS[e.kind].radius * 2.2, SPAWN_TIME, CRIT_HEX);
  fx.sound("spawn");
}

function stepDirector(w: DoomWorld, fx: DoomFx, px: number, pz: number): void {
  let alive = 0;
  for (const e of w.enemies) if (isAlive(e)) alive += 1;
  const d = w.director;
  switch (tickDirector(d, w.time, alive)) {
    case "wave-start":
      setBanner(w, isBossWave(d.wave) ? `WAVE ${d.wave} · A BRUTE WALKS` : `WAVE ${d.wave}`);
      fx.sound("wave");
      break;
    case "spawn":
      spawnDemon(w, fx, px, pz);
      break;
    case "wave-clear":
      healPlayer(w.player, WAVE_CLEAR_HEAL);
      addReserve(w.ammo, SIDEARM.reserveMax);
      setBanner(w, `WAVE ${d.wave - 1} CLEARED · +${WAVE_CLEAR_HEAL} HP · RESUPPLIED`);
      fx.sound("clear");
      break;
    case "none":
      break;
  }
}

function stepEnemies(w: DoomWorld, dt: number, fx: DoomFx, px: number, pz: number, feetY: number): void {
  const playerUp = w.director.phase !== "dead";
  const nav = w.config.nav;
  const q = w.quarry;
  const pt = w.route;
  for (let i = w.enemies.length - 1; i >= 0; i -= 1) {
    const e = w.enemies[i]!;
    if (!isAlive(e)) {
      if (w.time - e.diedAt >= DEATH_TIME) {
        w.enemies.splice(i, 1);
        w.rosterDirty = true;
      }
      continue;
    }
    if (!playerUp) continue;
    if (w.time >= e.readyAt) {
      sense(e, nav, q, w.time, w.rand);
      const direct = routeToward(nav, e.cell, e.x, e.z, e.goalCell, e.goalX, e.goalZ, pt) && e.aware === "hunt";
      steerEnemy(e, pt.x, pt.z, direct, w.enemies, w.time, dt, nav, e.pace);
      e.y = floorY(nav, e.cell, e.x, e.z);
    }
    // Reach is on the floor plan and in height: nothing bites or slams
    // across the gallery's edge.
    const dist = sameLevel(e, feetY) ? Math.hypot(px - e.x, pz - e.z) : Infinity;
    if (tryBite(e, dist, w.time)) hurt(w, ENEMY_SPECS[e.kind].bite, fx);
    const slam = updateSlam(e, dist, w.time);
    if (slam === "windup") {
      ring(w, "windup", e.x, e.y, e.z, 3.6, SLAM_WINDUP, WARN_HEX);
      fx.sound("windup");
    } else if (slam === "slam") {
      ring(w, "slam", e.x, e.y, e.z, SLAM_RADIUS, 0.6, CRIT_HEX);
      burst(w, e.x, e.y + 0.1, e.z, 30, 7, WARN_HEX, 1, 0.7);
      leaveMark(w, false, e.x, e.y, e.z, 0, 1, 0, SLAM_RADIUS * 0.9);
      fx.sound("slam");
      if (sameLevel(e, feetY) && Math.hypot(px - e.x, pz - e.z) < SLAM_RADIUS) hurt(w, SLAM_DAMAGE, fx);
    }
  }
}

function hurt(w: DoomWorld, amount: number, fx: DoomFx): void {
  const before = w.player.hp;
  const died = damagePlayer(w.player, amount, w.time);
  if (w.player.hp === before) return;
  w.hurtSeq += 1;
  w.hudDirty = true;
  if (died) {
    w.director.phase = "dead";
    w.trigger = false;
    setBanner(w, "YOU DIED");
    fx.sound("death");
  } else {
    fx.sound("hurt");
  }
}

function stepPickups(w: DoomWorld, fx: DoomFx, px: number, pz: number): void {
  for (const p of w.pickups) {
    if (!p.active) continue;
    if (w.time - p.bornAt > PICKUP_LIFE) { p.active = false; continue; }
    if (w.director.phase === "dead") continue;
    if (Math.hypot(px - p.x, pz - p.z) > PICKUP_REACH) continue;
    p.active = false;
    if (p.kind === "health") healPlayer(w.player, PICKUP_HEAL);
    else addReserve(w.ammo, PICKUP_AMMO);
    burst(w, p.x, 0.8, p.z, 14, 3, PHOS_HEX, 0.6, 0.5);
    w.hudDirty = true;
    fx.sound("pickup");
  }
}

function stepWeapon(w: DoomWorld, aim: Aim, fx: DoomFx): void {
  const a = w.ammo;
  if (tickAmmo(a, w.time)) {
    w.hudDirty = true;
    fx.sound("reloaded");
  }
  if (a.mag === 0 && a.reserve === 0 && a.reloadEndsAt < 0) {
    if (w.dryAt < 0) w.dryAt = w.time;
    else if (w.time - w.dryAt >= DRY_RESCUE) {
      a.reserve = SIDEARM.magSize;
      w.dryAt = -1;
      setBanner(w, "SPARE CELL FOUND");
    }
  } else {
    w.dryAt = -1;
  }
  if (!w.trigger || w.director.phase === "dead") return;
  switch (tryFire(a, w.time)) {
    case "fired":
      fireRound(w, aim);
      w.lastShotAt = w.time;
      w.noiseUntil = w.time + NOISE_TIME;
      w.hudDirty = true;
      fx.sound("shot");
      // Last round out: start the reload without waiting for a dry click.
      if (a.mag === 0) requestReload(w, fx);
      break;
    case "empty":
      fx.sound("dry");
      if (!requestReload(w, fx) && a.reserve === 0) setBanner(w, "OUT OF ROUNDS");
      break;
    case "cooldown":
    case "reloading":
      break;
  }
}

function stepFx(w: DoomWorld, dt: number): void {
  for (const s of w.sparks) {
    if (!s.active) continue;
    s.life -= dt;
    if (s.life <= 0) { s.active = false; continue; }
    s.vy -= 9 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    if (s.y < 0.02) {
      s.y = 0.02;
      s.vy *= -0.35;
      s.vx *= 0.6;
      s.vz *= 0.6;
    }
  }
  for (const r of w.rings) {
    if (r.active && w.time - r.bornAt >= r.duration) r.active = false;
  }
  for (const m of w.marks) {
    if (m.active && w.time - m.bornAt >= MARK_LIFE) m.active = false;
  }
  for (const m of w.splats) {
    if (m.active && w.time - m.bornAt >= SPLAT_LIFE) m.active = false;
  }
}

/** Advance the game one frame. `dt` is clamped by the caller. */
export function stepWorld(w: DoomWorld, dt: number, aim: Aim, fx: DoomFx = NO_FX): void {
  w.time += dt;
  const px = aim.ex;
  const pz = aim.ez;
  const q = w.quarry;
  q.cell = locate(w.config.nav, px, pz, q);
  q.heard = w.time < w.noiseUntil;
  // The sidearm works whenever the player is standing — plinking at the
  // walls before pulling the switch is half the fun of finding it.
  if (w.director.phase !== "dead") stepWeapon(w, aim, fx);
  if (w.director.phase === "intermission" || w.director.phase === "fighting") stepDirector(w, fx, px, pz);
  stepBullets(w, dt, fx);
  stepEnemies(w, dt, fx, px, pz, aim.ey - w.config.eye);
  stepPickups(w, fx, px, pz);
  if (w.combo > 0 && w.time > w.comboUntil) {
    w.combo = 0;
    w.hudDirty = true;
  }
  stepFx(w, dt);
}

/** Everything the DOM HUD draws, as one immutable value — built only on a
 * frame where `hudDirty` was set, never every frame. */
export interface HudSnapshot {
  phase: Director["phase"];
  wave: number;
  hp: number;
  maxHp: number;
  mag: number;
  magSize: number;
  reserve: number;
  reloading: boolean;
  reloadMs: number;
  reloadSeq: number;
  kills: number;
  score: number;
  best: number;
  combo: number;
  left: number;
  hitSeq: number;
  killSeq: number;
  hurtSeq: number;
  banner: string;
  bannerSeq: number;
  visible: boolean;
}

export function hudSnapshot(w: DoomWorld): HudSnapshot {
  return {
    phase: w.director.phase,
    wave: w.director.wave,
    hp: w.player.hp,
    maxHp: PLAYER_MAX_HP,
    mag: w.ammo.mag,
    magSize: SIDEARM.magSize,
    reserve: w.ammo.reserve,
    reloading: w.ammo.reloadEndsAt >= 0,
    reloadMs: SIDEARM.reloadTime * 1000,
    reloadSeq: w.reloadSeq,
    kills: w.kills,
    score: w.score,
    best: w.best,
    combo: w.combo,
    left: demonsLeft(w),
    hitSeq: w.hitSeq,
    killSeq: w.killSeq,
    hurtSeq: w.hurtSeq,
    banner: w.banner,
    bannerSeq: w.bannerSeq,
    visible: w.hudVisible,
  };
}
