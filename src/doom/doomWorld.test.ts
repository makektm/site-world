import { describe, expect, it } from "vitest";
import { ENEMY_SPECS, PLAYER_MAX_HP, SIDEARM, SPAWN_TIME, WAVE_CLEAR_HEAL, makeEnemy } from "./doomRules";
import {
  MAX_MARKS, createWorld, hudSnapshot, pullSwitch, requestReload, resetWorld, respawn, stepWorld, toggleHud,
  type Aim, type DoomConfig, type DoomWorld, type SoundName,
} from "./doomWorld";
import { roomNav } from "./testNav";

const CONFIG: DoomConfig = {
  nav: roomNav(-8, 8, -8, 8),
  // One wall across the far east side, to shoot at.
  walls: [{ pos: [9, 2, 0], size: [0.2, 4, 20] }],
  ceiling: 4,
  rifts: { main: [[-7, -7], [7, 7]], undercroft: [] },
  eye: 1.6,
};

/** Standing at the origin, eye height, looking down +x. */
const AIM: Aim = { ex: 0, ey: 1.6, ez: 0, fx: 1, fy: 0, fz: 0, mx: 0.3, my: 1.45, mz: 0.15 };
const DT = 1 / 60;

function world(): DoomWorld {
  // Deterministic: no spread, no drops, first eligible rift.
  return createWorld(CONFIG, () => 0.5);
}

function recorder() {
  const heard: SoundName[] = [];
  return { heard, fx: { sound: (n: SoundName) => heard.push(n) } };
}

function frames(w: DoomWorld, n: number, aim = AIM, fx = recorder().fx) {
  for (let i = 0; i < n; i += 1) stepWorld(w, DT, aim, fx);
}

/** An imp standing still (ready, far enough not to bite) straight down the aim line. */
function impAhead(w: DoomWorld, x = 5): void {
  const e = makeEnemy(99, "imp", x, 0, w.time - SPAWN_TIME - 1, 0);
  e.lungeReadyAt = Infinity;
  w.enemies.push(e);
}

describe("shooting", () => {
  it("a held trigger fires visible rounds that travel, spend the magazine, and stop at a wall", () => {
    const w = world();
    w.trigger = true;
    frames(w, 1);
    const live = () => w.bullets.filter((b) => b.active);
    expect(live()).toHaveLength(1);
    expect(w.ammo.mag).toBe(SIDEARM.magSize - 1);
    const x0 = live()[0]!.x;
    w.trigger = false;
    frames(w, 1);
    expect(live()[0]!.x).toBeGreaterThan(x0);
    // A 9m wall at 62m/s: gone within a handful of frames, not flying on.
    frames(w, 12);
    expect(live()).toHaveLength(0);
  });

  it("rounds kill a demon in its hit points' worth of hits, with knockback and a score", () => {
    const w = world();
    impAhead(w);
    const { heard, fx } = recorder();
    // Look down at its body: an imp stands shorter than the eye.
    const drop = 1.6 - ENEMY_SPECS.imp.height;
    const len = Math.hypot(5, drop);
    const down: Aim = { ...AIM, fx: 5 / len, fy: -drop / len };
    w.trigger = true;
    for (let i = 0; i < 120 && w.kills === 0; i += 1) stepWorld(w, DT, down, fx);
    w.trigger = false;
    expect(w.kills).toBe(1);
    expect(w.score).toBe(ENEMY_SPECS.imp.score);
    expect(heard.filter((s) => s === "hit")).toHaveLength(ENEMY_SPECS.imp.hp - 1);
    expect(heard).toContain("kill");
    // The body lingers for its death animation, then leaves the list.
    expect(w.enemies).toHaveLength(1);
    frames(w, 60);
    expect(w.enemies).toHaveLength(0);
    expect(w.rosterDirty).toBe(true);
    // And a splat of it on the floor where it fell.
    const splats = w.splats.filter((m) => m.active);
    expect(splats).toHaveLength(1);
    expect(splats[0]!.ny).toBe(1);
    expect(splats[0]!.x).toBeGreaterThan(4);
  });

  it("a muzzle poked through a wall the walker is pressed against does not shoot through it", () => {
    const w = world();
    // The wall's near face is at x=8.9; the eye stands a capsule radius off
    // it, so the muzzle (0.55 ahead) is already past the far face at 9.1.
    const ex = 8.9 - 0.35;
    const pressed: Aim = { ex, ey: 1.6, ez: 0, fx: 1, fy: 0, fz: 0, mx: ex + 0.58, my: 1.45, mz: 0.15 };
    const e = makeEnemy(99, "imp", 10, 0, w.time - SPAWN_TIME - 1, 0);
    e.lungeReadyAt = Infinity;
    w.enemies.push(e);
    const hp = e.hp;
    w.trigger = true;
    frames(w, 1, pressed);
    w.trigger = false;
    frames(w, 10, pressed);
    expect(e.hp).toBe(hp);
    expect(w.bullets.filter((b) => b.active)).toHaveLength(0);
    expect(w.marks.filter((m) => m.active)).toHaveLength(1);
  });

  it("a round that hits a wall leaves a hole flat on the face it struck", () => {
    const w = world();
    w.trigger = true;
    frames(w, 1);
    w.trigger = false;
    frames(w, 12);
    const holes = w.marks.filter((m) => m.active);
    expect(holes).toHaveLength(1);
    // The wall's west face is at x=8.9, facing back down the aim.
    expect(holes[0]!.x).toBeCloseTo(8.9, 5);
    expect([holes[0]!.nx, holes[0]!.ny, holes[0]!.nz]).toEqual([-1, 0, 0]);
  });

  it("a round into the floor scorches it, and old marks give way to new ones", () => {
    const w = world();
    const down: Aim = { ...AIM, fx: 0.6, fy: -0.8, fz: 0 };
    w.ammo.reserve = 1000;
    w.trigger = true;
    frames(w, 60 * 30, down);
    // More rounds than the pool holds went into the floor: the pool is
    // full, every mark a scorch lying flat, the oldest overwritten.
    const live = w.marks.filter((m) => m.active);
    expect(live).toHaveLength(MAX_MARKS);
    for (const m of live) expect([m.y, m.ny]).toEqual([0, 1]);
    expect(Math.min(...live.map((m) => m.bornAt))).toBeGreaterThan(1);
  });

  it("emptying the magazine starts a reload by itself, and R does nothing when full", () => {
    const w = world();
    expect(requestReload(w)).toBe(false);
    w.trigger = true;
    frames(w, Math.ceil((SIDEARM.magSize * SIDEARM.fireInterval) / DT) + 2);
    expect(w.ammo.mag).toBe(0);
    expect(w.ammo.reloadEndsAt).toBeGreaterThan(0);
    w.trigger = false;
    frames(w, Math.ceil(SIDEARM.reloadTime / DT) + 1);
    expect(w.ammo.mag).toBe(SIDEARM.magSize);
  });

  it("a dry magazine with nothing in reserve clicks and, after a while, finds a spare cell", () => {
    const w = world();
    w.ammo.mag = 0;
    w.ammo.reserve = 0;
    const { heard, fx } = recorder();
    w.trigger = true;
    stepWorld(w, DT, AIM, fx);
    expect(heard).toContain("dry");
    w.trigger = false;
    frames(w, 200);
    expect(w.ammo.reserve).toBe(SIDEARM.magSize);
  });
});

describe("the fight", () => {
  it("the switch counts in wave one and summons demons away from the player", () => {
    const w = world();
    expect(pullSwitch(w)).toBe(true);
    expect(w.director.phase).toBe("intermission");
    frames(w, 60 * 4);
    expect(w.director.phase).toBe("fighting");
    expect(w.enemies.length).toBeGreaterThan(0);
    for (const e of w.enemies) expect(Math.hypot(e.x, e.z)).toBeGreaterThan(4);
  });

  it("the switch stands a fight down early — the field clears, but nothing about the run is lost", () => {
    const w = world();
    pullSwitch(w);
    frames(w, 60 * 4);
    expect(w.director.phase).toBe("fighting");
    expect(w.enemies.length).toBeGreaterThan(0);
    // Score and health belong to the player, not to the fight they were
    // pulled out of — a walker asking for the field back is not the same
    // as losing.
    w.score = 40;
    w.kills = 3;
    w.player.hp = 61;
    const { heard, fx } = recorder();
    expect(pullSwitch(w, fx)).toBe(true);
    expect(w.director.phase).toBe("idle");
    expect(w.director.wave).toBe(0);
    expect(w.enemies).toHaveLength(0);
    expect(heard).toContain("clear");
    expect(w.score).toBe(40);
    expect(w.kills).toBe(3);
    expect(w.player.hp).toBe(61);
    // Idle again: nothing auto-resumes on its own.
    frames(w, 60 * 10);
    expect(w.director.phase).toBe("idle");
    // Pulling it again starts a fresh run, exactly as it would from any
    // other idle state — the reset happens NOW, not on the way out.
    expect(pullSwitch(w)).toBe(true);
    expect(w.player.hp).toBe(PLAYER_MAX_HP);
    expect(w.score).toBe(0);
  });

  it("demons chase the player and bite; the player can die, and respawn clears the field", () => {
    const w = world();
    pullSwitch(w);
    const { heard, fx } = recorder();
    // Stand still and let wave one arrive.
    for (let i = 0; i < 60 * 60 && w.director.phase !== "dead"; i += 1) stepWorld(w, DT, AIM, fx);
    expect(w.director.phase).toBe("dead");
    expect(w.player.hp).toBe(0);
    expect(heard).toContain("hurt");
    expect(heard).toContain("death");
    expect(hudSnapshot(w).banner).toBe("YOU DIED");
    // Dead: the trigger does nothing.
    const mag = w.ammo.mag;
    w.trigger = true;
    frames(w, 10);
    expect(w.ammo.mag).toBe(mag);
    expect(respawn(w)).toBe(true);
    expect(w.player.hp).toBe(PLAYER_MAX_HP);
    expect(w.enemies).toHaveLength(0);
    expect(w.director.phase).toBe("intermission");
    expect(w.director.wave).toBe(1);
  });

  it("clearing a wave heals, resupplies, and queues a bigger one", () => {
    const w = world();
    pullSwitch(w);
    w.player.hp = 50;
    w.ammo.reserve = 0;
    // Kill each demon the moment it's summoned.
    for (let i = 0; i < 60 * 20 && w.director.wave === 1; i += 1) {
      for (const e of w.enemies) if (e.diedAt < 0) e.diedAt = w.time;
      frames(w, 1);
    }
    expect(w.director.wave).toBe(2);
    expect(w.player.hp).toBe(50 + WAVE_CLEAR_HEAL);
    expect(w.ammo.reserve).toBe(SIDEARM.reserveMax);
  });

  it("leaving walk mode resets everything to idle, the marks on the walls too", () => {
    const w = world();
    pullSwitch(w);
    w.trigger = true;
    frames(w, 60 * 4);
    expect(w.marks.some((m) => m.active)).toBe(true);
    w.sparks[0]!.active = true; // one still in flight as the walker leaves
    resetWorld(w);
    expect(w.sparks.every((s) => !s.active)).toBe(true);
    expect(w.director.phase).toBe("idle");
    expect(w.enemies).toHaveLength(0);
    expect(w.bullets.every((b) => !b.active)).toBe(true);
    expect(w.marks.every((m) => !m.active)).toBe(true);
  });

  it("dying clears the field but not the marks: the walls remember the last fight", () => {
    const w = world();
    w.trigger = true;
    frames(w, 20);
    w.trigger = false;
    frames(w, 20);
    const holes = w.marks.filter((m) => m.active).length;
    expect(holes).toBeGreaterThan(0);
    w.director.phase = "dead";
    respawn(w);
    expect(w.marks.filter((m) => m.active)).toHaveLength(holes);
  });
});

describe("the HUD feed", () => {
  it("flags a change only when something it shows moved", () => {
    const w = world();
    w.hudDirty = false;
    frames(w, 5);
    expect(w.hudDirty).toBe(false);
    w.trigger = true;
    frames(w, 1);
    expect(w.hudDirty).toBe(true);
    expect(hudSnapshot(w).mag).toBe(SIDEARM.magSize - 1);
  });
});

describe("the HUD", () => {
  it("starts hidden, 4 shows it, and leaving walk mode hides it again", () => {
    const w = world();
    expect(hudSnapshot(w).visible).toBe(false);
    toggleHud(w);
    expect(hudSnapshot(w).visible).toBe(true);
    resetWorld(w);
    expect(hudSnapshot(w).visible).toBe(false);
  });
});
