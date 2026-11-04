// Camera hooks a host drives from its own keys. The orbit and walk rigs register
// what they can do (nudge the orbit camera, report which way is up-screen) and
// the host calls them; neither side imports the other.
let orbitNudge: ((azim: number, polar: number) => void) | null = null;
let cameraBasis: (() => { fx: number; fz: number; rx: number; rz: number } | null) | null = null;

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
