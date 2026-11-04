// Make anything in the scene pickable. <Selectable> wraps 3D children: in orbit
// the pointer hovers (corner brackets, a pointer cursor) and a click selects
// (brighter brackets and a glow); in walk mode <SelectionCrosshair> does the
// same for whatever is in the middle of the screen within reach, on E or a
// click. Both write one SelectionStore (selection.ts) that the DOM side reads.
//
// The brackets echo the console bezel's (ConsoleRig.tsx): the one "this is
// live" mark in the room, so a selection reads as the same idea.
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ReactNode, RefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  AdditiveBlending, Box3, BufferAttribute, BufferGeometry, LineBasicMaterial, Matrix4, Raycaster, Vector2, Vector3,
} from "three";
import type { Group, Intersection, Mesh, Object3D, Sprite, SpriteMaterial } from "three";
import { INFO, PAPER, PAPER_DIM, getGlowTexture } from "../core/engine";
import { isChromeOpen, isTypingTarget } from "../core/keys";
import { sameRef, type SelectionRef, type SelectionState, type SelectionStore } from "./selection";
import type { Point3 } from "./goal";
import { hasCommandModifier, useKeydown } from "./useKeydown";

// Where a Selectable leaves its identity on its content group, so a crosshair
// ray that hits any mesh inside can climb to it without a registry.
const TAG = "swSelectable";

interface Tag {
  store: SelectionStore;
  ref: SelectionRef;
}

type Status = "none" | "hover" | "selected";

function statusOf(state: SelectionState, ref: SelectionRef): Status {
  if (sameRef(state.selected, ref)) return "selected";
  if (sameRef(state.hovered, ref)) return "hover";
  return "none";
}

// A click that ended a drag was an orbit, not a pick.
const CLICK_SLOP_PX = 5;

export interface SelectableProps {
  store: SelectionStore;
  kind: string;
  id: string;
  children?: ReactNode;
  /** The glow colour while selected. Default INFO. */
  color?: string;
  /** In walk mode the pointer is locked and R3F's pointer is stale, so the
   * pointer handlers stand down; pass the world's mode. Default "orbit". */
  mode?: "orbit" | "walk";
  disabled?: boolean;
  /** Reduced motion: the selected glow holds still. */
  reduce?: boolean;
  /** The box to bracket, in this group's space, instead of measuring the
   * children (whose glows and orbiting parts can make a loose box). */
  bounds?: { center: Point3; size: Point3 };
  /** Metres added round the measured box. Default 0.12. */
  padding?: number;
  onSelect?: (ref: SelectionRef) => void;
}

/** Wraps 3D children so they can be hovered and selected (orbit pointer, or
 * the walk crosshair via <SelectionCrosshair>). */
export function Selectable({
  store, kind, id, children, color = INFO, mode = "orbit", disabled = false, reduce = false, bounds, padding = 0.12,
  onSelect,
}: SelectableProps) {
  const outer = useRef<Group>(null);
  const content = useRef<Group>(null);
  const ref = useMemo<SelectionRef>(() => ({ kind, id }), [kind, id]);
  const status = useSyncExternalStore(
    store.subscribe,
    () => statusOf(store.getState(), ref),
    () => statusOf(store.getState(), ref),
  );
  const gl = useThree((s) => s.gl);
  const cursorSet = useRef(false);

  useEffect(() => {
    const g = content.current;
    if (!g) return;
    if (disabled) {
      delete g.userData[TAG];
      return;
    }
    g.userData[TAG] = { store, ref } satisfies Tag;
    return () => {
      delete g.userData[TAG];
    };
  }, [store, ref, disabled]);

  // Leaving the scene (or being disabled) must not strand a hover, a
  // selection glow's owner, or the pointer cursor.
  useEffect(() => {
    if (!disabled) return;
    store.unhover(ref);
  }, [disabled, store, ref]);
  useEffect(() => () => {
    store.unhover(ref);
    if (cursorSet.current) {
      gl.domElement.style.cursor = "";
      cursorSet.current = false;
    }
  }, [store, ref, gl]);

  const live = !disabled && mode === "orbit";
  const locked = () => typeof document !== "undefined" && document.pointerLockElement != null;
  const setCursor = (on: boolean) => {
    if (on === cursorSet.current) return;
    gl.domElement.style.cursor = on ? "pointer" : "";
    cursorSet.current = on;
  };

  return (
    <group ref={outer}>
      <group
        ref={content}
        onPointerOver={live ? (e: ThreeEvent<PointerEvent>) => {
          if (locked()) return;
          e.stopPropagation();
          store.hover(ref);
          setCursor(true);
        } : undefined}
        onPointerOut={live ? () => {
          store.unhover(ref);
          setCursor(false);
        } : undefined}
        onClick={live ? (e: ThreeEvent<MouseEvent>) => {
          if (locked() || e.delta > CLICK_SLOP_PX) return;
          e.stopPropagation();
          store.select(ref);
          onSelect?.(ref);
        } : undefined}
      >
        {children}
      </group>
      {status !== "none" && !disabled && (
        <Brackets
          outer={outer}
          content={content}
          selected={status === "selected"}
          color={color}
          reduce={reduce}
          bounds={bounds}
          padding={padding}
        />
      )}
    </group>
  );
}

const noRaycast = () => {};

/** The world-space box of `root`'s visible geometry, ignoring sprites (glow
 * halos are much larger than what they light). */
function measure(root: Object3D, into: Box3, scratch: Box3): Box3 {
  into.makeEmpty();
  root.updateWorldMatrix(true, true);
  root.traverseVisible((o) => {
    const geo = (o as Mesh).geometry as BufferGeometry | undefined;
    if (!geo || (o as Sprite).isSprite) return;
    if (!geo.boundingBox) geo.computeBoundingBox();
    if (!geo.boundingBox) return;
    scratch.copy(geo.boundingBox).applyMatrix4(o.matrixWorld);
    if (!scratch.isEmpty()) into.union(scratch);
  });
  return into;
}

// 8 corners x 3 arms x 2 ends x xyz.
const BRACKET_FLOATS = 8 * 3 * 2 * 3;

function writeBrackets(arr: Float32Array, min: Vector3, max: Vector3): void {
  const sx = max.x - min.x;
  const sy = max.y - min.y;
  const sz = max.z - min.z;
  const ax = Math.min(0.45, sx * 0.28);
  const ay = Math.min(0.45, sy * 0.28);
  const az = Math.min(0.45, sz * 0.28);
  let i = 0;
  const seg = (x: number, y: number, z: number, x2: number, y2: number, z2: number) => {
    arr[i++] = x; arr[i++] = y; arr[i++] = z;
    arr[i++] = x2; arr[i++] = y2; arr[i++] = z2;
  };
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        const dx = x === min.x ? ax : -ax;
        const dy = y === min.y ? ay : -ay;
        const dz = z === min.z ? az : -az;
        seg(x, y, z, x + dx, y, z);
        seg(x, y, z, x, y + dy, z);
        seg(x, y, z, x, y, z + dz);
      }
    }
  }
}

function Brackets({
  outer, content, selected, color, reduce, bounds, padding,
}: {
  outer: RefObject<Group | null>;
  content: RefObject<Group | null>;
  selected: boolean;
  color: string;
  reduce: boolean;
  bounds?: { center: Point3; size: Point3 };
  padding: number;
}) {
  const glow = useRef<Sprite>(null);
  const { geometry, material } = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(BRACKET_FLOATS), 3));
    // Drawn over walls: a selected thing behind one is still where it is.
    const m = new LineBasicMaterial({ color: PAPER, transparent: true, depthTest: false, depthWrite: false });
    return { geometry: g, material: m };
  }, []);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  const scratch = useMemo(
    () => ({ box: new Box3(), tmp: new Box3(), inv: new Matrix4(), last: new Box3(), center: new Vector3(), size: new Vector3() }),
    [],
  );

  useEffect(() => {
    material.color.set(selected ? PAPER : PAPER_DIM);
    material.opacity = selected ? 0.95 : 0.7;
  }, [material, selected]);

  useFrame(({ clock }) => {
    const o = outer.current;
    const c = content.current;
    if (!o || !c) return;
    const { box, tmp, inv, last, center, size } = scratch;
    if (bounds) {
      center.set(...bounds.center);
      size.set(...bounds.size);
      box.setFromCenterAndSize(center, size);
    } else {
      measure(c, box, tmp);
      if (box.isEmpty()) return;
      // Into the outer group's space, where the brackets are drawn.
      inv.copy(o.matrixWorld).invert();
      box.applyMatrix4(inv);
    }
    box.expandByScalar(padding);
    // Children that ease (a pylon growing) move the box a little each frame;
    // rewrite the buffer only when it has really moved.
    const moved = last.isEmpty()
      || box.min.distanceToSquared(last.min) > 1e-4
      || box.max.distanceToSquared(last.max) > 1e-4;
    if (moved) {
      last.copy(box);
      const attr = geometry.getAttribute("position") as BufferAttribute;
      writeBrackets(attr.array as Float32Array, box.min, box.max);
      attr.needsUpdate = true;
      geometry.computeBoundingSphere();
    }
    const s = glow.current;
    if (s) {
      last.getCenter(center);
      last.getSize(size);
      s.position.copy(center);
      const r = Math.max(size.x, size.y, size.z) * 1.35;
      s.scale.set(r, r, 1);
      const m = s.material as SpriteMaterial;
      m.opacity = reduce ? 0.32 : 0.26 + 0.1 * Math.sin(clock.elapsedTime * 2.4);
    }
  });

  return (
    <>
      <lineSegments geometry={geometry} material={material} renderOrder={10} raycast={noRaycast} frustumCulled={false} />
      {selected && (
        <sprite ref={glow} raycast={noRaycast} renderOrder={9}>
          <spriteMaterial map={getGlowTexture()} color={color} transparent opacity={0.3} depthWrite={false} blending={AdditiveBlending} />
        </sprite>
      )}
    </>
  );
}

// What a crosshair ray should look through: light and line-work are not
// things, and neither is anything hidden (the walk colliders are invisible
// meshes that stand around every pylon).
function skipForRay(o: Object3D): boolean {
  const any = o as Object3D & { isSprite?: boolean; isLine?: boolean; isPoints?: boolean; isLineSegments2?: boolean };
  return Boolean(any.isSprite || any.isLine || any.isPoints || any.isLineSegments2);
}

function castVisible(o: Object3D, ray: Raycaster, hits: Intersection[]): void {
  if (!o.visible) return;
  if (!skipForRay(o) && o.layers.test(ray.layers)) o.raycast(ray, hits);
  for (const child of o.children) castVisible(child, ray, hits);
}

function tagOf(o: Object3D | null, store: SelectionStore): SelectionRef | null {
  for (let p = o; p; p = p.parent) {
    const tag = p.userData[TAG] as Tag | undefined;
    if (tag && tag.store === store) return tag.ref;
  }
  return null;
}

export interface SelectionCrosshairProps {
  store: SelectionStore;
  /** True in walk mode. */
  enabled: boolean;
  /** How far the crosshair reaches, metres. Default 6: across a room, not
   * through the building. */
  reach?: number;
  /** E selects what the crosshair is on. Default true. */
  useKey?: boolean;
  /** A left click while the pointer is locked selects too. Default true;
   * off while a game wants the trigger. */
  clickToSelect?: boolean;
  /** Cast every this many frames. Default 3 (20Hz at 60fps): a crosshair
   * prompt does not need more, and the whole scene is cast against. */
  everyFrames?: number;
  onSelect?: (ref: SelectionRef) => void;
}

/** Walk-mode picking: hovers the nearest <Selectable> under the screen centre
 * within `reach` (walls in front of it block the ray), and selects it on E or
 * a locked-pointer click. Mount once inside SiteWorld's children; show
 * `selectionPrompt(state)` as SiteWorld's `hostPrompt`. */
export function SelectionCrosshair({
  store, enabled, reach = 6, useKey = true, clickToSelect = true, everyFrames = 3, onSelect,
}: SelectionCrosshairProps) {
  const scene = useThree((s) => s.scene);
  const current = useRef<SelectionRef | null>(null);
  const frame = useRef(0);
  const work = useMemo(() => ({ ray: new Raycaster(), centre: new Vector2(0, 0), hits: [] as Intersection[] }), []);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const release = () => {
    if (current.current) store.unhover(current.current);
    current.current = null;
  };
  // Leaving walk mode (or unmounting) drops the crosshair's hover with it.
  useEffect(() => {
    if (!enabled) {
      release();
      return;
    }
    return release;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- release reads refs only
  }, [enabled, store]);

  useFrame(({ camera }) => {
    if (!enabled) return;
    frame.current = (frame.current + 1) % Math.max(1, everyFrames);
    if (frame.current !== 0) return;
    const { ray, centre, hits } = work;
    ray.setFromCamera(centre, camera);
    ray.far = reach;
    hits.length = 0;
    castVisible(scene, ray, hits);
    hits.sort((a, b) => a.distance - b.distance);
    const next = hits.length ? tagOf(hits[0]!.object, store) : null;
    if (sameRef(next, current.current)) return;
    if (current.current) store.unhover(current.current);
    current.current = next;
    if (next) store.hover(next);
  });

  const pick = () => {
    const ref = current.current;
    if (!ref) return false;
    store.select(ref);
    onSelectRef.current?.(ref);
    return true;
  };

  useKeydown((event) => {
    if (event.code !== "KeyE" || event.repeat || hasCommandModifier(event)) return;
    if (isTypingTarget(event.target) || isChromeOpen()) return;
    pick();
  }, enabled && useKey);

  useEffect(() => {
    if (!enabled || !clickToSelect) return;
    const down = (event: MouseEvent) => {
      if (event.button !== 0 || document.pointerLockElement == null) return;
      pick();
    };
    window.addEventListener("mousedown", down);
    return () => window.removeEventListener("mousedown", down);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pick reads refs only
  }, [enabled, clickToSelect, store]);

  return null;
}
