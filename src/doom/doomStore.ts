// The one live demon game, and the two narrow doors React reads it through.
//
// A module-level singleton the way the hotkey registry is: only one
// SITE is ever mounted, and the game has two readers on opposite sides of
// the canvas boundary — DoomRig inside the r3f tree, DoomHud as a DOM
// sibling of the canvas — that would otherwise need a context threaded
// through the host for no gain.
//
// The frame loop mutates `doom` directly and never touches React. After
// each frame it calls `publish()`, which only does work when the world
// flagged a change: the HUD gets a fresh snapshot when a number it shows
// moved (a shot, a hit, a wave), and the demon list re-renders only when a
// demon was summoned or removed. `useSyncExternalStore` is the whole of
// the React side.
import { useSyncExternalStore } from "react";
import { createWorld, hudSnapshot, type DoomConfig, type DoomWorld, type HudSnapshot } from "./doomWorld";
import type { Enemy } from "./doomRules";


type Listener = () => void;

function channel<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      for (const l of listeners) l();
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

// The one live game. Its world — where demons walk, what stops a round, where
// they rise — is the host's, handed in once by configureDoom before anything
// renders (see configureDoom). `let` so importers see the live value.
export let doom!: DoomWorld;
let hud!: ReturnType<typeof channel<HudSnapshot>>;
let roster!: ReturnType<typeof channel<readonly Enemy[]>>;
let savedBest = 0;
const BEST_KEY = "site.doom.best";

/** Builds the game on the host's world. Call once, at module load, before the
 * first render of DoomRig/DoomHud. */
export function configureDoom(config: DoomConfig): void {
  doom = createWorld(config);
  // Best score is a per-viewer convenience, so localStorage — wrapped, since a
  // private window or blocked storage throws, and the game must run anyway.
  try {
    const stored = Number(window.localStorage.getItem(BEST_KEY) ?? 0);
    if (Number.isFinite(stored) && stored > 0) doom.best = stored;
  } catch {
    // No storage: best starts at zero this session.
  }
  savedBest = doom.best;
  hud = channel<HudSnapshot>(hudSnapshot(doom));
  roster = channel<readonly Enemy[]>([]);
}

/** Push whatever the last frame changed out to React. Cheap when nothing
 * did: two flag reads. */
export function publish(): void {
  if (doom.rosterDirty) {
    doom.rosterDirty = false;
    roster.set(doom.enemies.slice());
  }
  if (doom.hudDirty) {
    doom.hudDirty = false;
    hud.set(hudSnapshot(doom));
    if (doom.best > savedBest) {
      savedBest = doom.best;
      try {
        window.localStorage.setItem(BEST_KEY, String(savedBest));
      } catch {
        // Unsaved best is fine.
      }
    }
  }
}

// Stable functions over the live channel, so React does not resubscribe per render.
const subscribeHud = (l: Listener) => hud.subscribe(l);
const getHud = () => hud.get();
const subscribeRoster = (l: Listener) => roster.subscribe(l);
const getRoster = () => roster.get();

export function useDoomHud(): HudSnapshot {
  return useSyncExternalStore(subscribeHud, getHud);
}

/** The demons currently on the field, as a list that changes identity
 * only when one arrives or is removed. */
export function useDoomRoster(): readonly Enemy[] {
  return useSyncExternalStore(subscribeRoster, getRoster);
}
