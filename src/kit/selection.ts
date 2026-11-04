// What a person has picked and what they are pointing at, as a tiny external
// store rather than React state or context: SiteWorld is two React trees (the
// canvas and the DOM beside it) and context does not reliably cross between
// them, so a <Selectable> in the scene and an <InspectPanel> in the overlay
// share one store object the host passes to both.
import { useState, useSyncExternalStore } from "react";

/** One thing in the world a person can pick: what sort it is, and which. */
export interface SelectionRef {
  kind: string;
  id: string;
}

/** The store's whole state. `hovered` is what the pointer (orbit) or the
 * crosshair (walk) is on right now. */
export interface SelectionState {
  selected: SelectionRef | null;
  hovered: SelectionRef | null;
}

/** A selection store: read, write, subscribe. Writes that change nothing do
 * not notify, so a per-frame crosshair can write freely. */
export interface SelectionStore {
  getState(): SelectionState;
  select(ref: SelectionRef | null): void;
  hover(ref: SelectionRef | null): void;
  /** Clears `hovered` only if it is still `ref` — so an object that unmounts
   * or loses the pointer cannot wipe a hover that has moved on. */
  unhover(ref: SelectionRef): void;
  subscribe(listener: () => void): () => void;
}

/** True when both are null or both name the same thing. */
export function sameRef(a: SelectionRef | null | undefined, b: SelectionRef | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.kind === b.kind && a.id === b.id;
}

/** A fresh store, outside React; `useSelectionStore` makes one per component. */
export function createSelectionStore(initial: Partial<SelectionState> = {}): SelectionStore {
  let state: SelectionState = { selected: initial.selected ?? null, hovered: initial.hovered ?? null };
  const listeners = new Set<() => void>();
  const set = (next: SelectionState) => {
    if (sameRef(next.selected, state.selected) && sameRef(next.hovered, state.hovered)) return;
    state = next;
    for (const l of [...listeners]) l();
  };
  return {
    getState: () => state,
    select: (ref) => set({ ...state, selected: ref ? { kind: ref.kind, id: ref.id } : null }),
    hover: (ref) => set({ ...state, hovered: ref ? { kind: ref.kind, id: ref.id } : null }),
    unhover: (ref) => {
      if (sameRef(state.hovered, ref)) set({ ...state, hovered: null });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** One store for the life of the calling component. */
export function useSelectionStore(initial?: Partial<SelectionState>): SelectionStore {
  const [store] = useState(() => createSelectionStore(initial));
  return store;
}

/** What `useSelection` returns: the state, plus the store's writers bound. */
export interface SelectionApi extends SelectionState {
  select: (ref: SelectionRef | null) => void;
  hover: (ref: SelectionRef | null) => void;
  clear: () => void;
  isSelected: (ref: SelectionRef) => boolean;
}

/** Subscribe to a selection store from either React tree. */
export function useSelection(store: SelectionStore): SelectionApi {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return {
    ...state,
    select: store.select,
    hover: store.hover,
    clear: () => store.select(null),
    isSelected: (ref) => sameRef(state.selected, ref),
  };
}

/** The walk-mode "[E] …" text for whatever the crosshair is on, for
 * SiteWorld's `hostPrompt`; null when it is on nothing (or on the thing
 * already selected, which E would not change). */
export function selectionPrompt(
  state: SelectionState,
  label: (ref: SelectionRef) => string = (ref) => ref.id,
  verb = "INSPECT",
): string | null {
  if (!state.hovered || sameRef(state.hovered, state.selected)) return null;
  return `${verb} ${label(state.hovered)}`;
}
