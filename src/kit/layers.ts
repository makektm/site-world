// Layers: each one is a question the building answers ("where is the traffic?",
// "who owns this?", "what breaks if payments fails?"), switched on and off.
// Layers in the same `group` are exclusive — two layers that both tint the
// pylons cannot be read at once, so turning one on turns the other off.
import { useCallback, useMemo, useState } from "react";

/** One layer the host offers. */
export interface LayerDef {
  id: string;
  /** Chip text, short: "traffic", "cost". */
  label: string;
  /** The question it answers, for the chip's tooltip. */
  question?: string;
  /** Exclusive group: at most one layer per group is on. */
  group?: string;
  /** A swatch on the chip (a palette colour). */
  color?: string;
  defaultOn?: boolean;
}

/** Which layers are on, by id. */
export type LayerState = Readonly<Record<string, boolean>>;

/** The starting state: each layer's `defaultOn`, with at most one per group
 * (the first that asks). */
export function initialLayers(defs: readonly LayerDef[]): LayerState {
  let out: Record<string, boolean> = {};
  for (const d of defs) out[d.id] = false;
  for (const d of defs) if (d.defaultOn) out = setLayerOn(defs, out, d.id, true, true) as Record<string, boolean>;
  return out;
}

/** `state` with layer `id` set to `on`. Turning a grouped layer on turns its
 * group's others off. `keepGroup` leaves an already-on group member alone
 * (used for defaults, where the first one wins). */
export function setLayerOn(
  defs: readonly LayerDef[],
  state: LayerState,
  id: string,
  on: boolean,
  keepGroup = false,
): LayerState {
  const def = defs.find((d) => d.id === id);
  if (!def) return state;
  if (!on) return state[id] ? { ...state, [id]: false } : state;
  if (def.group) {
    const others = defs.filter((d) => d.group === def.group && d.id !== id);
    if (keepGroup && others.some((d) => state[d.id])) return state;
    const next: Record<string, boolean> = { ...state, [id]: true };
    for (const o of others) next[o.id] = false;
    return next;
  }
  return state[id] ? state : { ...state, [id]: true };
}

/** `state` with layer `id` flipped. */
export function toggleLayer(defs: readonly LayerDef[], state: LayerState, id: string): LayerState {
  return setLayerOn(defs, state, id, !state[id]);
}

/** `state` with only layer `id` on (or everything off, if it was already the
 * only one). */
export function soloLayer(defs: readonly LayerDef[], state: LayerState, id: string): LayerState {
  const alone = defs.every((d) => (d.id === id ? state[d.id] : !state[d.id]));
  const next: Record<string, boolean> = {};
  for (const d of defs) next[d.id] = !alone && d.id === id;
  return next;
}

/** What `useLayers` returns. */
export interface LayersApi {
  defs: readonly LayerDef[];
  on: LayerState;
  isOn: (id: string) => boolean;
  toggle: (id: string) => void;
  set: (id: string, on: boolean) => void;
  solo: (id: string) => void;
  /** Every layer off. */
  clear: () => void;
}

/** Toggle state for `defs`. Defs may be an inline literal: state is keyed by
 * id, and a layer that disappears is simply never read. */
export function useLayers(defs: readonly LayerDef[]): LayersApi {
  const [on, setOn] = useState<LayerState>(() => initialLayers(defs));
  const defsKey = defs.map((d) => `${d.id}:${d.group ?? ""}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the ids and groups, not the array's identity
  const stable = useMemo(() => defs, [defsKey]);
  const toggle = useCallback((id: string) => setOn((s) => toggleLayer(stable, s, id)), [stable]);
  const set = useCallback((id: string, v: boolean) => setOn((s) => setLayerOn(stable, s, id, v)), [stable]);
  const solo = useCallback((id: string) => setOn((s) => soloLayer(stable, s, id)), [stable]);
  const clear = useCallback(() => setOn({}), []);
  return { defs, on, isOn: (id) => Boolean(on[id]), toggle, set, solo, clear };
}
