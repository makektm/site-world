// Crouching in walk mode: while Left Shift is held the head drops on the
// ground and the legs are drawn up in the air, and the walker stands back up
// only where there is room. The room queries run against a real three.js
// Octree, because its miss is `false` rather than null — a fallback written
// with `??` never reaches its second operand (WalkPhysics.tsx's door check is
// bitten by that).
import { BoxGeometry, Group, Mesh, Vector3 } from "three";
import { Capsule } from "three/addons/math/Capsule.js";
import { Octree } from "three/addons/math/Octree.js";
import { describe, expect, it, vi } from "vitest";
import { EYE, PLAYER_RADIUS } from "../core/engine";
import { CROUCH_EYE, CROUCH_SPEED, eyeTarget, hasHeadroom, hasLegRoom, isCrouched, setStance, WALK_SPEED } from "./walkStance";


/** An Octree of boxes: [centre x, y, z, width, height, depth]. */
function octreeOf(...boxes: readonly (readonly [number, number, number, number, number, number])[]): Octree {
  const group = new Group();
  for (const [x, y, z, w, h, d] of boxes) {
    const mesh = new Mesh(new BoxGeometry(w, h, d));
    mesh.position.set(x, y, z);
    group.add(mesh);
  }
  group.updateMatrixWorld(true);
  const octree = new Octree();
  octree.fromGraphNode(group);
  return octree;
}

/** A walker standing on the floor at the origin, eyes at height `eye`. */
function walkerAt(eye: number): Capsule {
  return new Capsule(new Vector3(0, PLAYER_RADIUS, 0), new Vector3(0, eye, 0), PLAYER_RADIUS);
}
const probe = () => new Capsule(new Vector3(), new Vector3(), PLAYER_RADIUS);

describe("head-room above a crouched walker", () => {
  const crouched = () => walkerAt(CROUCH_EYE);

  it("is there with nothing overhead", () => {
    expect(hasHeadroom(octreeOf(), crouched(), probe())).toBe(true);
  });

  it("is there under a ceiling high enough to stand under", () => {
    const ceiling = octreeOf([0, 2.6, 0, 6, 0.2, 6]); // underside at 2.5m
    expect(hasHeadroom(ceiling, crouched(), probe())).toBe(true);
  });

  it("is not there under a ceiling a crouch fits beneath but a stand does not", () => {
    // Underside at 1.6m: over the crouched crown (1.35m), under the standing one (1.97m).
    const ceiling = octreeOf([0, 1.7, 0, 6, 0.2, 6]);
    expect(hasHeadroom(ceiling, crouched(), probe())).toBe(false);
  });

  it("is not lost to a wall alongside", () => {
    // A face 0.05m inside the capsule's side: a sideways push, not a ceiling.
    const wall = octreeOf([0.4, 1, 0, 0.2, 4, 6]);
    expect(hasHeadroom(wall, crouched(), probe())).toBe(true);
  });
});

/** A walker in the air, feet (the bottom sphere's centre) at `feetY`, at eye height `eye`. */
function airborneAt(feetY: number, eye: number): Capsule {
  return new Capsule(new Vector3(0, feetY, 0), new Vector3(0, feetY + eye - PLAYER_RADIUS, 0), PLAYER_RADIUS);
}

describe("how the capsule's length is set", () => {
  it("on the ground, keeps the feet and moves the head", () => {
    const walker = walkerAt(EYE);
    setStance(walker, CROUCH_EYE, true);
    expect(walker.start.y).toBe(PLAYER_RADIUS);
    expect(walker.end.y).toBeCloseTo(CROUCH_EYE, 10);
  });

  it("in the air, keeps the head and draws the feet up", () => {
    const walker = airborneAt(3, EYE);
    const head = walker.end.y;
    setStance(walker, CROUCH_EYE, false);
    expect(walker.end.y).toBe(head);
    expect(walker.start.y).toBeCloseTo(3 + (EYE - CROUCH_EYE), 10);
  });

  it("in the air, holds the view at the same height whatever the stance on the way", () => {
    const walker = airborneAt(3, EYE);
    const head = walker.end.y;
    for (const eye of [1.5, CROUCH_EYE, 1.3, EYE]) {
      setStance(walker, eye, false);
      expect(walker.end.y).toBe(head);
    }
  });

  it("in the air, lets the legs back down to where they were", () => {
    const walker = airborneAt(3, EYE);
    setStance(walker, CROUCH_EYE, false);
    setStance(walker, EYE, false);
    expect(walker.start.y).toBeCloseTo(3, 10);
  });
});

describe("leg room below a tucked walker", () => {
  // Feet at 2.0m, tucked: full-length legs would reach down to a foot sole at 1.03m.
  const tucked = () => airborneAt(2, CROUCH_EYE);

  it("is there over open air", () => {
    expect(hasLegRoom(octreeOf(), tucked(), probe())).toBe(true);
  });

  it("is there over a floor further down than the legs reach", () => {
    const floor = octreeOf([0, 0.4, 0, 6, 0.2, 6]); // top at 0.5m
    expect(hasLegRoom(floor, tucked(), probe())).toBe(true);
  });

  it("is not there over a ledge the legs would run into", () => {
    const ledge = octreeOf([0, 1.1, 0, 6, 0.2, 6]); // top at 1.2m: inside the 1.03m reach
    expect(hasLegRoom(ledge, tucked(), probe())).toBe(false);
  });

  it("is not lost to a wall alongside", () => {
    // A face 0.05m inside the legs' side: a sideways push, not a floor.
    const wall = octreeOf([0.4, 1.5, 0, 0.2, 4, 6]);
    expect(hasLegRoom(wall, tucked(), probe())).toBe(true);
  });
});

describe("the eye height asked for", () => {
  const room = vi.fn(() => true);
  const noRoom = vi.fn(() => false);

  it("is the crouch height while Shift is held, without asking about head-room", () => {
    room.mockClear();
    expect(eyeTarget(true, EYE, room)).toBe(CROUCH_EYE);
    expect(eyeTarget(true, CROUCH_EYE, room)).toBe(CROUCH_EYE);
    expect(room).not.toHaveBeenCalled();
  });

  it("is full height once let go, with head-room", () => {
    expect(eyeTarget(false, CROUCH_EYE, room)).toBe(EYE);
  });

  it("stays where it is, low, under a ceiling", () => {
    expect(eyeTarget(false, CROUCH_EYE, noRoom)).toBe(CROUCH_EYE);
    expect(eyeTarget(false, 1.3, noRoom)).toBe(1.3);
  });

  it("is full height for a walker already standing, without asking", () => {
    noRoom.mockClear();
    expect(eyeTarget(false, EYE, noRoom)).toBe(EYE);
    expect(noRoom).not.toHaveBeenCalled();
  });
});

describe("how fast a walker moves", () => {
  it("is slower crouched, from the moment Shift is down until fully standing", () => {
    expect(CROUCH_SPEED).toBeLessThan(WALK_SPEED);
    expect(isCrouched(true, EYE)).toBe(true);
    expect(isCrouched(false, CROUCH_EYE)).toBe(true);
    expect(isCrouched(false, 1.4)).toBe(true);
    expect(isCrouched(false, EYE)).toBe(false);
  });
});
