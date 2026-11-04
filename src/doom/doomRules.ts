// The demon game's rules as plain numbers: the three enemy kinds and the
// sidearm's tuning, and the small pure functions every frame is built from —
// steering, a swept bullet test, the magazine's state machine, damage, and
// which demons a wave brings. No three.js, no React: doomWorld.ts composes
// these into a frame step, and doomRules.test.ts holds them to their
// numbers without a canvas.
//
// Every function here that runs per frame mutates the object it is handed
// and returns a primitive, never a fresh object — the frame loop calls them
// for every demon and every round in flight, and an allocation per call
// would be garbage the collector has to sweep mid-fight.

import type { Awareness } from "./doomHunt";
import { moveBody, slide, type Nav, type Point } from "./doomNav";

export type EnemyKind = "imp" | "wraith" | "brute";

export interface EnemySpec {
  hp: number;
  /** Cruise speed, m/s. */
  speed: number;
  /** Footprint on the floor — separation and contact both read it. */
  radius: number;
  /** Height of the body's centre, where a round has to land. */
  height: number;
  /** The sphere a round is tested against; a touch more generous than the
   * drawn body so a shot that grazes a horn still counts. */
  hitRadius: number;
  /** One bite's damage, and how often the same demon may bite again. */
  bite: number;
  biteCooldown: number;
  /** Flanking: the heading swings this many radians either side of
   * straight-at-the-player, at this rate — so a pack arrives from several
   * angles instead of in a queue. */
  wobbleAmp: number;
  wobbleFreq: number;
  /** A burst of speed when close — the moment that makes a demon dangerous
   * rather than just a moving target. lungeRange 0 means it never lunges. */
  lungeRange: number;
  lungeSpeed: number;
  lungeTime: number;
  lungeCooldown: number;
  /** How far one round shoves it back; a brute barely notices. */
  knockback: number;
  score: number;
  /** Chance of dropping a pickup on death. */
  dropChance: number;
}

export const ENEMY_SPECS: Readonly<Record<EnemyKind, EnemySpec>> = {
  // The rank and file: three rounds, a short lunge, flanks moderately.
  imp: {
    hp: 3, speed: 2.4, radius: 0.42, height: 0.95, hitRadius: 0.55,
    bite: 9, biteCooldown: 0.9,
    wobbleAmp: 0.75, wobbleFreq: 1.3,
    lungeRange: 3.2, lungeSpeed: 6.8, lungeTime: 0.32, lungeCooldown: 2.4,
    knockback: 3.2, score: 100, dropChance: 0.14,
  },
  // Fast, fragile, erratic: the one to track while the imps close in.
  wraith: {
    hp: 2, speed: 3.9, radius: 0.34, height: 1.35, hitRadius: 0.45,
    bite: 6, biteCooldown: 0.7,
    wobbleAmp: 1.15, wobbleFreq: 2.6,
    lungeRange: 0, lungeSpeed: 0, lungeTime: 0, lungeCooldown: 0,
    knockback: 4.5, score: 150, dropChance: 0.1,
  },
  // The boss of every fourth wave: slow, soaks a magazine and a half, and
  // telegraphs a ground slam (see updateSlam) the player can back out of.
  brute: {
    hp: 28, speed: 1.55, radius: 0.85, height: 1.45, hitRadius: 1.0,
    bite: 18, biteCooldown: 1.3,
    wobbleAmp: 0.25, wobbleFreq: 0.6,
    lungeRange: 0, lungeSpeed: 0, lungeTime: 0, lungeCooldown: 0,
    knockback: 0.5, score: 1000, dropChance: 1,
  },
};

// The brute's slam: it plants itself when the player is this close, winds
// up for SLAM_WINDUP (the arms rise — the tell), then hits everything inside
// SLAM_RADIUS. Radius is wider than trigger range so standing still is never
// safe; backing off during the wind-up is.
export const SLAM_TRIGGER = 3.0;
export const SLAM_WINDUP = 0.75;
export const SLAM_RADIUS = 3.6;
export const SLAM_DAMAGE = 28;
export const SLAM_COOLDOWN = 3.2;
// Below half health a brute speeds up — the fight changes shape near the end.
export const BRUTE_ENRAGE_SPEED = 1.6;

export interface WeaponSpec {
  magSize: number;
  /** Rounds carried beyond the magazine, at most. */
  reserveMax: number;
  /** Seconds between rounds with the trigger held. */
  fireInterval: number;
  reloadTime: number;
  /** A visible round, not a hitscan: fast enough to feel instant at room
   * range, slow enough to watch the tracer. */
  bulletSpeed: number;
  bulletLife: number;
  damage: number;
  /** Radians of random cone around the aim line. */
  spread: number;
}

export const SIDEARM: Readonly<WeaponSpec> = {
  magSize: 12,
  reserveMax: 96,
  fireInterval: 0.14,
  reloadTime: 1.1,
  bulletSpeed: 62,
  bulletLife: 0.55,
  damage: 1,
  spread: 0.012,
};

export const PLAYER_MAX_HP = 100;
// Clearing a wave heals this much and refills the reserve — the reward that
// makes the next, bigger wave feel fair.
export const WAVE_CLEAR_HEAL = 25;
export const PICKUP_HEAL = 20;
export const PICKUP_AMMO = 24;
// A demon materialises for this long (a summoning ring, no movement, no
// bite) so nothing spawns and hits in the same instant.
export const SPAWN_TIME = 0.9;
export const DEATH_TIME = 0.5;
// Kills inside this window of each other chain into a score multiplier.
export const COMBO_WINDOW = 2.6;
export const COMBO_MAX = 5;

// ---------------------------------------------------------------- enemies

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  z: number;
  /** Steered velocity, and a separate knockback that decays on its own —
   * kept apart so a hit shoves without being steered straight back out. */
  vx: number;
  vz: number;
  kx: number;
  kz: number;
  hp: number;
  maxHp: number;
  /** Wave scaling: this demon's speed relative to its kind's spec. */
  speedScale: number;
  spawnedAt: number;
  /** When the summoning ends and it may move and bite. */
  readyAt: number;
  lungeUntil: number;
  lungeReadyAt: number;
  lastBiteAt: number;
  /** Last time a round landed — drives the white hit flash. */
  hitAt: number;
  /** -1 while alive. */
  diedAt: number;
  /** Brute only: -1 when not winding up. */
  windupUntil: number;
  slamReadyAt: number;
  /** Radians about y, toward where it is going — atan2(dx, dz). */
  heading: number;
  /** Per-demon offset so a pack's wobble and bob don't march in step. */
  phase: number;
  /** Floor height under it (the gallery, the ramp), and its cell on the
   * floor plan (doomNav.ts), -1 until placed. */
  y: number;
  cell: number;
  /** What it knows of the walker, and where that sends it (doomHunt.ts). */
  aware: Awareness;
  seenAt: number;
  lastX: number;
  lastZ: number;
  lastCell: number;
  senseAt: number;
  searchSince: number;
  wanderSince: number;
  wanderAt: number;
  goalX: number;
  goalZ: number;
  goalCell: number;
  /** Speed multiplier from its awareness and where it stands. */
  pace: number;
}

export function makeEnemy(
  id: number, kind: EnemyKind, x: number, z: number, now: number, phase: number, wave = 1,
): Enemy {
  const spec = ENEMY_SPECS[kind];
  const hp = Math.round(spec.hp * waveHpScale(wave));
  return {
    id, kind, x, z, vx: 0, vz: 0, kx: 0, kz: 0,
    hp, maxHp: hp, speedScale: waveSpeedScale(wave),
    spawnedAt: now, readyAt: now + SPAWN_TIME,
    lungeUntil: -1, lungeReadyAt: now + SPAWN_TIME + 0.6,
    lastBiteAt: -Infinity, hitAt: -Infinity, diedAt: -1,
    windupUntil: -1, slamReadyAt: now + SPAWN_TIME + 1.5,
    heading: 0, phase,
    y: 0, cell: -1,
    aware: "hunt", seenAt: now, lastX: x, lastZ: z, lastCell: -1,
    senseAt: now, searchSince: now, wanderSince: now, wanderAt: now,
    goalX: x, goalZ: z, goalCell: -1, pace: 1,
  };
}

export function isAlive(e: Enemy): boolean {
  return e.diedAt < 0;
}

const ACCEL = 7;
const KNOCKBACK_DECAY = 7;
const SEPARATION_GAIN = 1.6;
// Off the walker's trail — heading for a waypoint — the flanking swing is
// mostly held back: in a 2.4m corridor a full swing only steers into walls.
const ROUTE_WOBBLE = 0.3;

const heading: Point = { x: 0, z: 0 };

/** One demon's steering for one frame, toward (tx, tz): the walker when
 * `direct`, otherwise the next waypoint on its route (doomNav.ts). A
 * flanking swing that fades as it closes (so it commits to the attack
 * instead of circling), a lunge when the walker is close, bent round
 * whatever wall or cover lies just ahead, pushed off its neighbours so a
 * pack doesn't collapse into one sprite, stopped at arm's reach of the
 * walker, and moved on the floor plan — never through a wall, never off a
 * ledge. `pace` scales its speed (a wandering demon ambles). Mutates `e`;
 * allocates nothing. */
export function steerEnemy(
  e: Enemy, tx: number, tz: number, direct: boolean, others: readonly Enemy[], now: number, dt: number, nav: Nav,
  pace = 1,
): void {
  if (!isAlive(e) || now < e.readyAt) return;
  const spec = ENEMY_SPECS[e.kind];
  const dx = tx - e.x;
  const dz = tz - e.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 1e-4) e.heading = Math.atan2(dx, dz);

  let speed = spec.speed * e.speedScale * pace;
  if (e.kind === "brute") {
    if (e.hp * 2 < e.maxHp) speed *= BRUTE_ENRAGE_SPEED;
    if (e.windupUntil >= 0) speed = 0;
  }
  if (direct && spec.lungeRange > 0 && dist < spec.lungeRange && now >= e.lungeReadyAt) {
    e.lungeUntil = now + spec.lungeTime;
    e.lungeReadyAt = now + spec.lungeCooldown;
  }
  if (now < e.lungeUntil) speed = spec.lungeSpeed * e.speedScale;

  // Heading toward the target, rotated by the flanking swing, then bent
  // round whatever is in the way.
  let dirX = 0;
  let dirZ = 0;
  if (dist > 1e-4) {
    const amp = spec.wobbleAmp * (direct ? 1 : ROUTE_WOBBLE);
    const swing = Math.sin(now * spec.wobbleFreq + e.phase) * amp * Math.min(1, dist / 5);
    const c = Math.cos(swing);
    const s = Math.sin(swing);
    const ux = dx / dist;
    const uz = dz / dist;
    slide(nav, e.x, e.z, spec.radius, ux * c - uz * s, ux * s + uz * c, e.id % 2 === 0 ? 1 : -1, heading);
    dirX = heading.x;
    dirZ = heading.z;
  }

  // Stop at arm's reach rather than walking through the walker.
  const reach = spec.radius + CONTACT_PAD;
  if (direct && dist < reach) speed = 0;

  let sepX = 0;
  let sepZ = 0;
  for (let i = 0; i < others.length; i += 1) {
    const o = others[i]!;
    if (o === e || !isAlive(o)) continue;
    const ox = e.x - o.x;
    const oz = e.z - o.z;
    const d = Math.hypot(ox, oz);
    const range = (spec.radius + ENEMY_SPECS[o.kind].radius) * 1.25;
    if (d >= range) continue;
    if (d < 1e-4) {
      // Exactly stacked (two spawns on one rift): split them by id so the
      // push has a direction at all.
      sepX += e.id > o.id ? 1 : -1;
      continue;
    }
    const w = 1 - d / range;
    sepX += (ox / d) * w;
    sepZ += (oz / d) * w;
  }

  const wantX = dirX * speed + sepX * SEPARATION_GAIN * spec.speed;
  const wantZ = dirZ * speed + sepZ * SEPARATION_GAIN * spec.speed;
  const blend = Math.min(1, ACCEL * dt);
  e.vx += (wantX - e.vx) * blend;
  e.vz += (wantZ - e.vz) * blend;

  moveBody(nav, e, (e.vx + e.kx) * dt, (e.vz + e.kz) * dt, spec.radius);
  const decay = Math.exp(-KNOCKBACK_DECAY * dt);
  e.kx *= decay;
  e.kz *= decay;
}

// A bite lands a little past the demon's own radius: the player's capsule
// has a radius too, and arm's reach should read as touching.
export const CONTACT_PAD = 0.55;

/** True, and the bite's cooldown restarted, when this demon is close enough
 * to bite and allowed to again. */
export function tryBite(e: Enemy, dist: number, now: number): boolean {
  if (!isAlive(e) || now < e.readyAt) return false;
  const spec = ENEMY_SPECS[e.kind];
  if (dist > spec.radius + CONTACT_PAD + 0.1) return false;
  if (now - e.lastBiteAt < spec.biteCooldown) return false;
  e.lastBiteAt = now;
  return true;
}

export type SlamStep = "none" | "windup" | "slam";

/** The brute's telegraphed ground slam. "windup" on the frame it plants
 * itself, "slam" on the frame it lands — the caller then checks whether
 * the player is still inside SLAM_RADIUS. */
export function updateSlam(e: Enemy, dist: number, now: number): SlamStep {
  if (e.kind !== "brute" || !isAlive(e) || now < e.readyAt) return "none";
  if (e.windupUntil >= 0) {
    if (now < e.windupUntil) return "none";
    e.windupUntil = -1;
    e.slamReadyAt = now + SLAM_COOLDOWN;
    return "slam";
  }
  if (dist < SLAM_TRIGGER && now >= e.slamReadyAt) {
    e.windupUntil = now + SLAM_WINDUP;
    return "windup";
  }
  return "none";
}

/** One round landing. (dirX, dirZ) is the round's travel on the floor
 * plane, unit length; the demon is shoved along it. True when this round
 * killed it. */
export function hitEnemy(e: Enemy, damage: number, dirX: number, dirZ: number, now: number): boolean {
  if (!isAlive(e)) return false;
  const spec = ENEMY_SPECS[e.kind];
  e.hp -= damage;
  e.hitAt = now;
  e.kx += dirX * spec.knockback;
  e.kz += dirZ * spec.knockback;
  // A hit cancels a lunge in progress — shooting a charging imp should buy
  // the player something.
  e.lungeUntil = -1;
  if (e.hp <= 0) {
    e.hp = 0;
    e.diedAt = now;
    e.windupUntil = -1;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- rounds

/** Where along the segment a→b it first enters the sphere at c of radius
 * r, as a fraction 0..1, or -1 if it never does. A swept test, not a point
 * test: a round moves over a metre a frame, further than a demon is wide,
 * so checking only where it ends up would let it tunnel straight through. */
export function segmentHitsSphere(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number, r: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const fx = ax - cx;
  const fy = ay - cy;
  const fz = az - cz;
  const a = dx * dx + dy * dy + dz * dz;
  const c = fx * fx + fy * fy + fz * fz - r * r;
  if (c <= 0) return 0; // starts inside
  if (a < 1e-12) return -1;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

/** A wall box, centre and full size — the same shape as the host's wall and door-header
 * boxes, which describe every wall. */
export interface WallBox {
  pos: readonly [number, number, number];
  size: readonly [number, number, number];
}

/** The face a segment entered a box through, as a unit normal. */
export interface FaceNormal {
  x: number;
  y: number;
  z: number;
}

/** Where along a→b it first enters any of `walls`, as a fraction 0..1, or
 * -1. Swept for the same reason segmentHitsSphere is: a wall is 0.2m thick
 * and a round covers a metre a frame, so an endpoint test would let most
 * rounds pass clean through. The slab method, one box at a time. With
 * `normal`, the face it entered the nearest box through is written there —
 * what a bullet hole is laid flat against. */
export function segmentHitsWalls(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, walls: readonly WallBox[],
  normal?: FaceNormal,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  let best = -1;
  // 0/1/2 for x/y/z: the slab the segment entered the nearest box by last,
  // which is the face it came in through; -1 when it started inside.
  let bestAxis = -1;
  for (let i = 0; i < walls.length; i += 1) {
    const w = walls[i]!;
    let t0 = 0;
    let t1 = 1;
    let enter = -1;
    // x slab
    let lo = w.pos[0] - w.size[0] / 2;
    let hi = w.pos[0] + w.size[0] / 2;
    if (Math.abs(dx) < 1e-12) {
      if (ax < lo || ax > hi) continue;
    } else {
      let ta = (lo - ax) / dx;
      let tb = (hi - ax) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) { t0 = ta; enter = 0; }
      t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    // y slab
    lo = w.pos[1] - w.size[1] / 2;
    hi = w.pos[1] + w.size[1] / 2;
    if (Math.abs(dy) < 1e-12) {
      if (ay < lo || ay > hi) continue;
    } else {
      let ta = (lo - ay) / dy;
      let tb = (hi - ay) / dy;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) { t0 = ta; enter = 1; }
      t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    // z slab
    lo = w.pos[2] - w.size[2] / 2;
    hi = w.pos[2] + w.size[2] / 2;
    if (Math.abs(dz) < 1e-12) {
      if (az < lo || az > hi) continue;
    } else {
      let ta = (lo - az) / dz;
      let tb = (hi - az) / dz;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) { t0 = ta; enter = 2; }
      t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (best < 0 || t0 < best) {
      best = t0;
      bestAxis = enter;
    }
  }
  if (normal && best >= 0) {
    // Starting inside a box there is no entry face: the one facing back
    // along the segment's longest axis stands in for it.
    let axis = bestAxis;
    if (axis < 0) {
      const mx = Math.abs(dx);
      const my = Math.abs(dy);
      const mz = Math.abs(dz);
      axis = mx >= my && mx >= mz ? 0 : my >= mz ? 1 : 2;
    }
    const along = axis === 0 ? dx : axis === 1 ? dy : dz;
    const sign = along > 0 ? -1 : 1;
    normal.x = axis === 0 ? sign : 0;
    normal.y = axis === 1 ? sign : 0;
    normal.z = axis === 2 ? sign : 0;
  }
  return best;
}

// ---------------------------------------------------------------- the magazine

export interface Ammo {
  mag: number;
  reserve: number;
  /** -1 when not reloading. */
  reloadEndsAt: number;
  nextShotAt: number;
}

export type FireResult = "fired" | "cooldown" | "reloading" | "empty";

export function newAmmo(w: WeaponSpec = SIDEARM): Ammo {
  return { mag: w.magSize, reserve: Math.floor(w.reserveMax / 2), reloadEndsAt: -1, nextShotAt: 0 };
}

/** One pull of the trigger. Firing spends a round and starts the cooldown;
 * an empty magazine answers "empty" (the dry click) and never fires. */
export function tryFire(a: Ammo, now: number, w: WeaponSpec = SIDEARM): FireResult {
  if (a.reloadEndsAt >= 0) return "reloading";
  if (now < a.nextShotAt) return "cooldown";
  if (a.mag <= 0) {
    // One dry click per trigger interval, not one per frame held.
    a.nextShotAt = now + w.fireInterval * 2;
    return "empty";
  }
  a.mag -= 1;
  a.nextShotAt = now + w.fireInterval;
  return "fired";
}

/** Start a reload: refused with a full magazine, nothing in reserve, or one
 * already running. */
export function startReload(a: Ammo, now: number, w: WeaponSpec = SIDEARM): boolean {
  if (a.reloadEndsAt >= 0 || a.mag >= w.magSize || a.reserve <= 0) return false;
  a.reloadEndsAt = now + w.reloadTime;
  return true;
}

/** Finish a reload whose time is up: the magazine fills from the reserve,
 * as far as the reserve goes. True on the frame it completes. */
export function tickAmmo(a: Ammo, now: number, w: WeaponSpec = SIDEARM): boolean {
  if (a.reloadEndsAt < 0 || now < a.reloadEndsAt) return false;
  const take = Math.min(w.magSize - a.mag, a.reserve);
  a.mag += take;
  a.reserve -= take;
  a.reloadEndsAt = -1;
  return true;
}

export function addReserve(a: Ammo, rounds: number, w: WeaponSpec = SIDEARM): void {
  a.reserve = Math.min(w.reserveMax, a.reserve + rounds);
}

// ---------------------------------------------------------------- the player

export interface Player {
  hp: number;
  /** Last time damage landed — the HUD's red flash, and the grace below. */
  hurtAt: number;
}

// Two demons biting on the same frame is one bad moment, not a double
// hit: damage inside this window after the last is dropped.
export const HURT_GRACE = 0.18;

/** Apply damage; true when this blow killed the player. */
export function damagePlayer(p: Player, amount: number, now: number): boolean {
  if (p.hp <= 0) return false;
  if (now - p.hurtAt < HURT_GRACE) return false;
  p.hp = Math.max(0, p.hp - amount);
  p.hurtAt = now;
  return p.hp === 0;
}

export function healPlayer(p: Player, amount: number): void {
  if (p.hp <= 0) return;
  p.hp = Math.min(PLAYER_MAX_HP, p.hp + amount);
}

// ---------------------------------------------------------------- waves

export function isBossWave(wave: number): boolean {
  return wave > 0 && wave % 4 === 0;
}

/** The demons wave `n` brings, in summoning order. Grows by one imp a wave
 * and adds wraiths from wave two; every fourth wave is a boss wave — fewer
 * rank and file, a brute (two from wave eight) summoned last so it arrives
 * into a room that's already busy. */
export function waveRoster(n: number): EnemyKind[] {
  const out: EnemyKind[] = [];
  if (isBossWave(n)) {
    const imps = Math.min(8, 2 + Math.floor(n / 2));
    const wraiths = Math.min(6, Math.floor(n / 2));
    for (let i = 0; i < imps; i += 1) out.push("imp");
    for (let i = 0; i < wraiths; i += 1) out.push("wraith");
    for (let i = 0; i < n / 4; i += 1) out.push("brute");
    return out;
  }
  const imps = Math.min(12, 3 + n);
  const wraiths = Math.min(8, Math.max(0, n - 1));
  // Interleaved, so wraiths arrive through the wave instead of all at the end.
  let wi = 0;
  for (let i = 0; i < imps; i += 1) {
    out.push("imp");
    if (wi < wraiths && i % 2 === 1) { out.push("wraith"); wi += 1; }
  }
  while (wi < wraiths) { out.push("wraith"); wi += 1; }
  return out;
}

export function waveHpScale(wave: number): number {
  return 1 + 0.12 * Math.max(0, wave - 1);
}

export function waveSpeedScale(wave: number): number {
  return Math.min(1.35, 1 + 0.04 * Math.max(0, wave - 1));
}

export function comboMultiplier(chain: number): number {
  return Math.max(1, Math.min(COMBO_MAX, chain));
}

/** A summoning point for the next demon: one of `rifts`, at least
 * `minDist` from the player so nothing materialises in their face, chosen
 * with `rand` (0..1) among those far enough; the farthest rift when none
 * is. Returns the rift's index. */
export function pickRift(
  rifts: readonly (readonly [number, number])[], px: number, pz: number, minDist: number, rand: number,
): number {
  let far = 0;
  let farD = -1;
  let eligible = 0;
  for (let i = 0; i < rifts.length; i += 1) {
    const [x, z] = rifts[i]!;
    const d = Math.hypot(x - px, z - pz);
    if (d >= minDist) eligible += 1;
    if (d > farD) { farD = d; far = i; }
  }
  if (eligible === 0) return far;
  let pick = Math.min(eligible - 1, Math.floor(rand * eligible));
  for (let i = 0; i < rifts.length; i += 1) {
    const [x, z] = rifts[i]!;
    if (Math.hypot(x - px, z - pz) < minDist) continue;
    if (pick === 0) return i;
    pick -= 1;
  }
  return far;
}

// ---------------------------------------------------------------- the director

export type Phase = "idle" | "intermission" | "fighting" | "dead";

export interface Director {
  phase: Phase;
  wave: number;
  /** Kinds still to be summoned this wave, front first. */
  queue: EnemyKind[];
  nextSpawnAt: number;
  /** When the intermission ends. */
  phaseEndsAt: number;
  /** Set on a "spawn" step: which kind to summon. */
  spawnKind: EnemyKind;
}

export const INTERMISSION = 3.5;
export const FIRST_INTERMISSION = 2.2;
export const SPAWN_GAP = 0.55;

export type DirectorStep = "none" | "wave-start" | "spawn" | "wave-clear";

export function newDirector(): Director {
  return { phase: "idle", wave: 0, queue: [], nextSpawnAt: 0, phaseEndsAt: 0, spawnKind: "imp" };
}

/** Pulling the switch: from idle (or after a death) a new game starts at
 * wave one after a short count-in; during an intermission it skips the
 * wait. Mid-fight it does nothing. */
export function summon(d: Director, now: number): boolean {
  if (d.phase === "idle" || d.phase === "dead") {
    d.phase = "intermission";
    d.wave = 1;
    d.queue.length = 0;
    d.phaseEndsAt = now + FIRST_INTERMISSION;
    return true;
  }
  if (d.phase === "intermission") {
    d.phaseEndsAt = now;
    return true;
  }
  return false;
}

/** Advance the director one frame. `alive` counts demons still standing
 * (dying ones excluded). At most one thing happens per call — the caller
 * runs it every frame, so a wave's summoning plays out over SPAWN_GAPs. */
export function tickDirector(d: Director, now: number, alive: number): DirectorStep {
  if (d.phase === "intermission") {
    if (now < d.phaseEndsAt) return "none";
    d.phase = "fighting";
    d.queue = waveRoster(d.wave);
    d.nextSpawnAt = now + 0.3;
    return "wave-start";
  }
  if (d.phase !== "fighting") return "none";
  if (d.queue.length > 0) {
    if (now < d.nextSpawnAt) return "none";
    d.spawnKind = d.queue.shift()!;
    d.nextSpawnAt = now + SPAWN_GAP;
    return "spawn";
  }
  if (alive === 0) {
    d.wave += 1;
    d.phase = "intermission";
    d.phaseEndsAt = now + INTERMISSION;
    return "wave-clear";
  }
  return "none";
}
