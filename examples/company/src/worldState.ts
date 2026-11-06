// State the world's two React trees share. SiteWorld renders the canvas and
// the DOM as separate trees, and the rooms are module constants built once,
// so what a room needs from the host at render time (which layers are on,
// whether the timeline is replaying, what is selected) lives in small
// module stores both sides subscribe to, instead of in props or context.
import { useSyncExternalStore } from "react";
import type { Object3D } from "three";
import { createSelectionStore, type LayerState, type Point3 } from "site-world";
import { DEFAULT_LAYERS } from "./factoryLayers";
import type { PylonLook } from "./sprawlLook";

/** What is selected and hovered, anywhere in the world. */
export const SELECTION = createSelectionStore();

/** The timeline is showing a past moment. */
export interface Replay {
  /** Days since the timeline began. */
  t: number;
  /** The per-tick clock the metrics use at that moment. */
  tick: number;
  /** Services that existed then; the rest are drawn as ghosts. */
  present: ReadonlySet<string>;
  /** Pylon looks as they were then (younger, other findings). */
  looks: ReadonlyMap<string, PylonLook>;
}

export interface WorldView {
  layers: LayerState;
  replay: Replay | null;
}

let view: WorldView = { layers: DEFAULT_LAYERS, replay: null };
const listeners = new Set<() => void>();

export function setView(patch: Partial<WorldView>): void {
  const next = { ...view, ...patch };
  if (next.layers === view.layers && next.replay === view.replay) return;
  view = next;
  for (const l of listeners) l();
}

export function getView(): WorldView {
  return view;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useView(): WorldView {
  return useSyncExternalStore(subscribe, getView, getView);
}

// Where each moving figure is, by "kind:id", for a follow camera on the DOM
// side. Registered by the figure's own component with its body object, read
// on a timer: positions change every frame, so they are never React state.
const bodies = new Map<string, Object3D>();

export function registerBody(key: string, body: Object3D): () => void {
  bodies.set(key, body);
  return () => {
    if (bodies.get(key) === body) bodies.delete(key);
  };
}

export function bodyPoint(key: string, lift = 0.6): Point3 | null {
  const b = bodies.get(key);
  if (!b) return null;
  const p = b.getWorldPosition(b.position.clone());
  return [p.x, p.y + lift, p.z];
}
