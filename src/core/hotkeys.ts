// SITE registers the actions a host's global hotkey listener fires at it.
// Only one SITE view is mounted at a time, so a single slot is the whole of
// the registry. A host asks for focus from a page that does not show SITE by
// setting a pending focus (requestFocusView) and navigating to the page that
// does; the SITE view consumes it on mount (consumeFocusView).

export type SiteHotkeys = {
  toggleFocus: () => void;
  orbit: () => void;
  walk: () => void;
  /** azim: -1 left / +1 right. polar: -1 up / +1 down. Orbit and walk. */
  nudgeOrbit: (azim: number, polar: number) => void;
  /** Focused orbit only. dx -1/1 is A/D, dy -1/1 is W/S. True if it moved. */
  cycleObjects: (dx: number, dy: number) => boolean;
};

let current: SiteHotkeys | null = null;
let pendingFocus = false;
let orbitNudge: ((azim: number, polar: number) => void) | null = null;
let cameraBasis: (() => { fx: number; fz: number; rx: number; rz: number } | null) | null = null;

export function registerSiteHotkeys(next: SiteHotkeys): () => void {
  current = next;
  return () => {
    if (current === next) current = null;
  };
}

export function siteHotkeys(): SiteHotkeys | null {
  return current;
}

export function requestFocusView(): void {
  pendingFocus = true;
}

export function consumeFocusView(): boolean {
  const v = pendingFocus;
  pendingFocus = false;
  return v;
}

export function registerOrbitNudge(fn: (azim: number, polar: number) => void): () => void {
  orbitNudge = fn;
  return () => {
    if (orbitNudge === fn) orbitNudge = null;
  };
}

export function nudgeOrbit(azim: number, polar: number): void {
  orbitNudge?.(azim, polar);
}

export function registerCameraBasis(
  fn: () => { fx: number; fz: number; rx: number; rz: number } | null,
): () => void {
  cameraBasis = fn;
  return () => {
    if (cameraBasis === fn) cameraBasis = null;
  };
}

export function orbitCameraBasis(): { fx: number; fz: number; rx: number; rz: number } {
  return cameraBasis?.() ?? { fx: 0, fz: -1, rx: 1, rz: 0 };
}
