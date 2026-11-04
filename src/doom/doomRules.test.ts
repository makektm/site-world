import { describe, expect, it } from "vitest";
import {
  BRUTE_ENRAGE_SPEED,
  ENEMY_SPECS,
  FIRST_INTERMISSION,
  HURT_GRACE,
  INTERMISSION,
  PLAYER_MAX_HP,
  SIDEARM,
  SLAM_COOLDOWN,
  SLAM_WINDUP,
  SPAWN_TIME,
  addReserve,
  comboMultiplier,
  damagePlayer,
  healPlayer,
  hitEnemy,
  isBossWave,
  makeEnemy,
  newAmmo,
  newDirector,
  pickRift,
  segmentHitsSphere,
  segmentHitsWalls,
  startReload,
  steerEnemy,
  summon,
  tickAmmo,
  tickDirector,
  tryBite,
  tryFire,
  updateSlam,
  waveRoster,
  type FaceNormal,
  type Player,
} from "./doomRules";
import { roomNav } from "./testNav";

// The room's shape: one cell, walled on its four sides at ±8.
const ROOM = roomNav(-8, 8, -8, 8);

/** Run steering for `seconds` at 60fps, the player fixed at (px, pz). */
function run(e: ReturnType<typeof makeEnemy>, px: number, pz: number, seconds: number, others = [e], start = SPAWN_TIME) {
  const dt = 1 / 60;
  let t = start;
  for (let i = 0; i < seconds * 60; i += 1) {
    t += dt;
    for (const o of others) steerEnemy(o, px, pz, true, others, t, dt, ROOM);
  }
  return t;
}

describe("steering", () => {
  it("closes on the player and stops at arm's reach instead of walking through", () => {
    const e = makeEnemy(1, "imp", -6, 0, 0, 0);
    run(e, 4, 0, 10);
    const dist = Math.hypot(4 - e.x, 0 - e.z);
    expect(dist).toBeLessThan(ENEMY_SPECS.imp.radius + 0.9);
    expect(dist).toBeGreaterThan(ENEMY_SPECS.imp.radius * 0.8);
  });

  it("does not move while it is still being summoned", () => {
    const e = makeEnemy(1, "imp", -6, 0, 0, 0);
    steerEnemy(e, 4, 0, true, [e], SPAWN_TIME / 2, 1 / 60, ROOM);
    expect(e.x).toBe(-6);
  });

  it("faces the player", () => {
    const e = makeEnemy(1, "wraith", 0, 0, 0, 0);
    steerEnemy(e, 5, 0, true, [e], SPAWN_TIME + 0.1, 1 / 60, ROOM);
    expect(e.heading).toBeCloseTo(Math.PI / 2);
  });

  it("flanks: the same chase from different phases takes different paths", () => {
    const a = makeEnemy(1, "wraith", -6, 0, 0, 0);
    const b = makeEnemy(2, "wraith", -6, 0, 0, Math.PI);
    run(a, 6, 0, 0.8, [a]);
    run(b, 6, 0, 0.8, [b]);
    expect(Math.sign(a.z)).not.toBe(Math.sign(b.z));
  });

  it("lunges when close: speed jumps above cruise for the lunge", () => {
    const e = makeEnemy(1, "imp", 0, 0, 0, 0);
    const t0 = SPAWN_TIME + 1;
    steerEnemy(e, 2.5, 0, true, [e], t0, 1 / 60, ROOM);
    expect(e.lungeUntil).toBeGreaterThan(t0);
    // Before the next lunge is ready it can't lunge again.
    expect(e.lungeReadyAt).toBeCloseTo(t0 + ENEMY_SPECS.imp.lungeCooldown);
  });

  it("separates a stacked pack instead of collapsing onto one spot", () => {
    const pack = [1, 2, 3, 4].map((id) => makeEnemy(id, "imp", 0, 0, 0, 0));
    run(pack[0]!, 20, 20, 0.001, pack); // one frame
    run(pack[0]!, 7, 7, 2, pack);
    for (let i = 0; i < pack.length; i += 1) {
      for (let j = i + 1; j < pack.length; j += 1) {
        const d = Math.hypot(pack[i]!.x - pack[j]!.x, pack[i]!.z - pack[j]!.z);
        expect(d).toBeGreaterThan(0.3);
      }
    }
  });

  it("stays inside the room even when the player is outside it: the wall stops it", () => {
    const e = makeEnemy(1, "imp", 6, 0, 0, 0);
    run(e, 30, 0, 10);
    // The wall's face is 0.1 in from its line at x=8.
    expect(e.x).toBeLessThanOrEqual(8 - 0.1 - ENEMY_SPECS.imp.radius + 1e-9);
    expect(e.x).toBeGreaterThan(8 - 0.1 - ENEMY_SPECS.imp.radius - 0.05);
  });

  it("a lunge or a hard shove cannot carry it through a wall in one frame", () => {
    const e = makeEnemy(1, "wraith", 7, 0, 0, 0);
    e.kx = 400;
    steerEnemy(e, 30, 0, true, [e], SPAWN_TIME + 1, 1 / 20, ROOM);
    expect(e.x).toBeLessThan(8);
  });

  it("off the walker's trail it neither lunges nor stops short: a waypoint is not a victim", () => {
    const e = makeEnemy(1, "imp", 0, 0, 0, 0);
    const t0 = SPAWN_TIME + 1;
    steerEnemy(e, 0.5, 0, false, [e], t0, 1 / 60, ROOM);
    expect(e.lungeUntil).toBeLessThan(t0);
    expect(e.vx).toBeGreaterThan(0);
  });

  it("a brute below half health moves faster", () => {
    const calm = makeEnemy(1, "brute", -6, 0, 0, 0);
    const angry = makeEnemy(2, "brute", -6, 3, 0, 0);
    angry.hp = 1;
    // Far from the player and each other: no slam, no separation.
    run(calm, 7, -7, 1, [calm]);
    run(angry, 7, -4, 1, [angry]);
    const moved = (e: typeof calm, x0: number, z0: number) => Math.hypot(e.x - x0, e.z - z0);
    expect(moved(angry, -6, 3) / moved(calm, -6, 0)).toBeGreaterThan(BRUTE_ENRAGE_SPEED * 0.8);
  });

  it("knockback shoves it back along the round's path, then decays", () => {
    const e = makeEnemy(1, "imp", 0, 0, 0, 0);
    hitEnemy(e, 1, 1, 0, SPAWN_TIME + 1);
    const t = SPAWN_TIME + 1;
    steerEnemy(e, -5, 0, true, [e], t, 1 / 60, ROOM);
    expect(e.x).toBeGreaterThan(0);
    const kx = e.kx;
    steerEnemy(e, -5, 0, true, [e], t + 1 / 60, 1 / 60, ROOM);
    expect(e.kx).toBeLessThan(kx);
  });
});

describe("contact and the slam", () => {
  it("bites in reach, then waits out its cooldown", () => {
    const e = makeEnemy(1, "imp", 0, 0, 0, 0);
    const t = SPAWN_TIME + 1;
    expect(tryBite(e, 0.5, t)).toBe(true);
    expect(tryBite(e, 0.5, t + 0.1)).toBe(false);
    expect(tryBite(e, 0.5, t + ENEMY_SPECS.imp.biteCooldown + 1e-9)).toBe(true);
  });

  it("does not bite out of reach, while summoning, or dead", () => {
    const e = makeEnemy(1, "imp", 0, 0, 0, 0);
    expect(tryBite(e, 3, SPAWN_TIME + 1)).toBe(false);
    expect(tryBite(e, 0.5, SPAWN_TIME / 2)).toBe(false);
    e.diedAt = 1;
    expect(tryBite(e, 0.5, SPAWN_TIME + 5)).toBe(false);
  });

  it("the brute winds up, holds still, then slams, then cools down", () => {
    const e = makeEnemy(1, "brute", 0, 0, 0, 0);
    const t = e.slamReadyAt + 0.1;
    expect(updateSlam(e, 2, t)).toBe("windup");
    const x = e.x;
    steerEnemy(e, 2, 0, true, [e], t + 0.1, 1 / 60, ROOM);
    expect(Math.abs(e.x - x)).toBeLessThan(0.02);
    expect(updateSlam(e, 2, t + SLAM_WINDUP / 2)).toBe("none");
    expect(updateSlam(e, 2, t + SLAM_WINDUP)).toBe("slam");
    expect(updateSlam(e, 2, t + SLAM_WINDUP + 0.1)).toBe("none");
    expect(e.slamReadyAt).toBeCloseTo(t + SLAM_WINDUP + SLAM_COOLDOWN);
  });

  it("only brutes slam", () => {
    const e = makeEnemy(1, "imp", 0, 0, 0, 0);
    expect(updateSlam(e, 1, 100)).toBe("none");
  });
});

describe("hits", () => {
  it("a round through the middle of a sphere hits at its near surface", () => {
    const t = segmentHitsSphere(0, 1, 0, 10, 1, 0, 5, 1, 0, 0.5);
    expect(t).toBeCloseTo(0.45);
  });

  it("a round that passes wide, or stops short, misses", () => {
    expect(segmentHitsSphere(0, 1, 0, 10, 1, 0, 5, 1, 1, 0.5)).toBe(-1);
    expect(segmentHitsSphere(0, 1, 0, 3, 1, 0, 5, 1, 0, 0.5)).toBe(-1);
  });

  it("a fast round cannot tunnel: a segment longer than the sphere still hits", () => {
    expect(segmentHitsSphere(-50, 0, 0, 50, 0, 0, 0, 0, 0, 0.1)).toBeGreaterThan(0);
  });

  it("a round crossing a thin wall between frames is stopped by it", () => {
    const wall = { pos: [5, 2, 0] as const, size: [0.2, 4, 10] as const };
    const t = segmentHitsWalls(4.5, 1.5, 0, 5.5, 1.5, 0, [wall]);
    expect(t).toBeCloseTo(0.4);
    // Over the wall's top: no hit.
    expect(segmentHitsWalls(4.5, 4.5, 0, 5.5, 4.5, 0, [wall])).toBe(-1);
    // Parallel and beside it: no hit.
    expect(segmentHitsWalls(0, 1, 6, 10, 1, 6, [wall])).toBe(-1);
  });

  it("reports the face a round entered by, for the hole it leaves", () => {
    const wall = { pos: [5, 2, 0] as const, size: [0.2, 4, 10] as const };
    const floor = { pos: [0, -0.5, 0] as const, size: [20, 1, 20] as const };
    const n: FaceNormal = { x: 0, y: 0, z: 0 };
    segmentHitsWalls(4.5, 1.5, 0, 5.5, 1.5, 0, [wall], n);
    expect(n).toEqual({ x: -1, y: 0, z: 0 });
    segmentHitsWalls(6, 1.5, 0, 4.8, 1.2, 0, [wall], n);
    expect(n).toEqual({ x: 1, y: 0, z: 0 });
    // Down onto a floor: its top face, whichever box is listed first.
    segmentHitsWalls(2, 1, 0, 4, -1, 0, [wall, floor], n);
    expect(n).toEqual({ x: 0, y: 1, z: 0 });
    // Aimed down past the wall's foot, it meets the wall first.
    segmentHitsWalls(4, 1, 0, 6, -1, 0, [floor, wall], n);
    expect(n).toEqual({ x: -1, y: 0, z: 0 });
  });

  it("damage flashes, knocks back, and kills at zero", () => {
    const e = makeEnemy(1, "imp", 0, 0, 0, 0);
    expect(hitEnemy(e, 1, 0, 1, 2)).toBe(false);
    expect(e.hitAt).toBe(2);
    expect(e.kz).toBeGreaterThan(0);
    expect(hitEnemy(e, 1, 0, 1, 2.1)).toBe(false);
    expect(hitEnemy(e, 1, 0, 1, 2.2)).toBe(true);
    expect(e.diedAt).toBe(2.2);
    // Already dead: another round doesn't kill it twice.
    expect(hitEnemy(e, 1, 0, 1, 2.3)).toBe(false);
  });

  it("later waves bring tougher demons", () => {
    expect(makeEnemy(1, "imp", 0, 0, 0, 0, 6).maxHp).toBeGreaterThan(ENEMY_SPECS.imp.hp);
  });
});

describe("the magazine", () => {
  it("fires at the trigger interval, not faster", () => {
    const a = newAmmo();
    expect(tryFire(a, 0)).toBe("fired");
    expect(tryFire(a, SIDEARM.fireInterval / 2)).toBe("cooldown");
    expect(tryFire(a, SIDEARM.fireInterval)).toBe("fired");
    expect(a.mag).toBe(SIDEARM.magSize - 2);
  });

  it("clicks dry when empty and never goes negative", () => {
    const a = newAmmo();
    a.mag = 0;
    expect(tryFire(a, 1)).toBe("empty");
    expect(a.mag).toBe(0);
  });

  it("reloads from the reserve after the reload time", () => {
    const a = newAmmo();
    a.mag = 2;
    a.reserve = 30;
    expect(startReload(a, 1)).toBe(true);
    expect(tryFire(a, 1.1)).toBe("reloading");
    expect(tickAmmo(a, 1 + SIDEARM.reloadTime / 2)).toBe(false);
    expect(tickAmmo(a, 1 + SIDEARM.reloadTime)).toBe(true);
    expect(a.mag).toBe(SIDEARM.magSize);
    expect(a.reserve).toBe(30 - (SIDEARM.magSize - 2));
  });

  it("a short reserve fills the magazine only as far as it goes", () => {
    const a = newAmmo();
    a.mag = 0;
    a.reserve = 5;
    startReload(a, 0);
    tickAmmo(a, SIDEARM.reloadTime);
    expect(a.mag).toBe(5);
    expect(a.reserve).toBe(0);
  });

  it("refuses a reload that can't help", () => {
    const full = newAmmo();
    expect(startReload(full, 0)).toBe(false);
    const dry = newAmmo();
    dry.mag = 3;
    dry.reserve = 0;
    expect(startReload(dry, 0)).toBe(false);
    const busy = newAmmo();
    busy.mag = 3;
    startReload(busy, 0);
    expect(startReload(busy, 0.1)).toBe(false);
  });

  it("the reserve caps at its maximum", () => {
    const a = newAmmo();
    addReserve(a, 10_000);
    expect(a.reserve).toBe(SIDEARM.reserveMax);
  });
});

describe("the player", () => {
  it("takes damage, flinches through a short grace, and dies at zero", () => {
    const p: Player = { hp: PLAYER_MAX_HP, hurtAt: -Infinity };
    expect(damagePlayer(p, 40, 1)).toBe(false);
    expect(p.hp).toBe(60);
    // Two bites on one frame are one bad moment.
    expect(damagePlayer(p, 40, 1 + HURT_GRACE / 2)).toBe(false);
    expect(p.hp).toBe(60);
    expect(damagePlayer(p, 80, 2)).toBe(true);
    expect(p.hp).toBe(0);
    // The dead aren't healed, or killed again.
    healPlayer(p, 50);
    expect(p.hp).toBe(0);
    expect(damagePlayer(p, 10, 3)).toBe(false);
  });

  it("healing caps at full", () => {
    const p: Player = { hp: 90, hurtAt: -Infinity };
    healPlayer(p, 50);
    expect(p.hp).toBe(PLAYER_MAX_HP);
  });
});

describe("waves", () => {
  it("grow, bring wraiths from wave two, and a brute every fourth", () => {
    const count = (n: number, k: string) => waveRoster(n).filter((x) => x === k).length;
    expect(count(1, "imp")).toBe(4);
    expect(count(1, "wraith")).toBe(0);
    expect(count(2, "wraith")).toBe(1);
    expect(waveRoster(3).length).toBeGreaterThan(waveRoster(2).length);
    expect(isBossWave(4)).toBe(true);
    expect(count(4, "brute")).toBe(1);
    expect(count(8, "brute")).toBe(2);
    expect(count(5, "brute")).toBe(0);
    // The brute arrives last, into a room already busy.
    expect(waveRoster(4).at(-1)).toBe("brute");
  });

  it("combo multiplier climbs with the chain and caps", () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(3)).toBe(3);
    expect(comboMultiplier(50)).toBe(5);
  });

  it("summons away from the player", () => {
    const rifts = [[0, 0], [7, 7], [-7, -7]] as const;
    for (const r of [0, 0.4, 0.99]) {
      expect(pickRift(rifts, 0.5, 0.5, 6, r)).not.toBe(0);
    }
    // Nowhere far enough: the farthest.
    expect(pickRift([[0, 0], [2, 0]], 0, 0, 6, 0.5)).toBe(1);
  });
});

describe("the director", () => {
  it("runs idle → count-in → spawns the roster one gap apart → clears → next wave", () => {
    const d = newDirector();
    expect(tickDirector(d, 0, 0)).toBe("none");
    expect(summon(d, 0)).toBe(true);
    expect(d.phase).toBe("intermission");
    expect(tickDirector(d, FIRST_INTERMISSION / 2, 0)).toBe("none");
    expect(tickDirector(d, FIRST_INTERMISSION, 0)).toBe("wave-start");
    const roster = waveRoster(1);
    let t = FIRST_INTERMISSION;
    let spawned = 0;
    for (let i = 0; i < 400 && spawned < roster.length; i += 1) {
      t += 0.05;
      if (tickDirector(d, t, spawned) === "spawn") spawned += 1;
    }
    expect(spawned).toBe(roster.length);
    // Demons still standing: no clear.
    expect(tickDirector(d, t + 1, 2)).toBe("none");
    expect(tickDirector(d, t + 2, 0)).toBe("wave-clear");
    expect(d.wave).toBe(2);
    expect(d.phase).toBe("intermission");
    expect(tickDirector(d, t + 2 + INTERMISSION, 0)).toBe("wave-start");
  });

  it("the switch skips an intermission but does nothing mid-fight", () => {
    const d = newDirector();
    summon(d, 0);
    expect(summon(d, 0.5)).toBe(true);
    expect(tickDirector(d, 0.5, 0)).toBe("wave-start");
    expect(summon(d, 0.6)).toBe(false);
  });
});
