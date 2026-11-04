// Every walk-up terminal in SITE, behind ONE slot. A terminal is powered, rigged
// (the rig outlives "on" so a screen collapses to its line before it unmounts),
// near (a walker is in range), and focused; only one terminal is powered at a
// time, because there is one `activeId`. That is the whole of the exclusion
// rule: no terminal names another, so adding a terminal adds no wiring.
// (This replaces useConsoleRoom's `closedBy` pairs, which every new room had
// to extend by hand.)
//
// WALKING UP NEVER POWERS A TERMINAL ON. Proximity only tracks `near`; an
// explicit E (walking) or a click on the plinth (orbit) powers the screen, and
// walking out of range powers it off. A screen that lights up unbidden takes
// the keyboard from a walker who was only passing, and on a login screen it would
// put a password field in front of someone who never chose to open it.
//
// Nothing here touches three.js or the DOM beyond the keyboard.
import { createRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Anchor } from "../screens/ConsoleRig";
import { isChromeOpen, isTypingTarget } from "./keys";

export interface TerminalDef {
  id: string;
  /** Where the orbit fly-in faces from: the plinth, or a point on the floor
   * in front of a wall screen. */
  stand: readonly [number, number];
  /** Orbit only: fly the camera in against the screen, this far out from
   * `stand`. Absent: the terminal powers on without moving the camera. */
  flyOffset?: number;
}

export interface TerminalState {
  /** The screen is powered — showing its content and taking keys. */
  on: boolean;
  /** The RIG exists. */
  rig: boolean;
  /** A walker is in range — for the "[E]" prompt. */
  near: boolean;
  focus: number;
  anchor: Anchor | null;
  screenRef: RefObject<HTMLDivElement | null>;
  onNear: (near: boolean) => void;
  /** The screen's own exit (esc): powers off and drops focus. */
  onExit: () => void;
  onActivate: () => void;
  setRig: (on: boolean) => void;
}

export interface Terminals {
  get: (id: string) => TerminalState;
  /** Some terminal is powered. */
  anyOn: boolean;
  /** The powered terminal's definition and fly-in anchor, or null. */
  active: { def: TerminalDef; anchor: Anchor | null } | null;
}

type Mode = "orbit" | "walk";

export function useTerminals(
  defs: readonly TerminalDef[],
  { mode, consoleId, cameraRef, onConsoleExit }: {
    mode: Mode;
    /** A host console powering on closes the active terminal — two fly-ins
     * must never target the camera at once. */
    consoleId: string | null;
    cameraRef: { current: { x: number; z: number } };
    onConsoleExit: () => void;
  },
): Terminals {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focus, setFocus] = useState(0);
  const [rigs, setRigs] = useState<Readonly<Record<string, boolean>>>({});
  const [nears, setNears] = useState<Readonly<Record<string, boolean>>>({});
  const [anchors, setAnchors] = useState<Readonly<Record<string, Anchor | null>>>({});
  const screenRefs = useRef<Record<string, RefObject<HTMLDivElement | null>>>({});
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const nearsRef = useRef(nears);
  nearsRef.current = nears;
  const defsRef = useRef(defs);
  defsRef.current = defs;

  const power = useCallback((id: string) => {
    setActiveId(id);
    setRigs((r) => (r[id] ? r : { ...r, [id]: true }));
    setFocus((n) => n + 1);
  }, []);
  const closeAll = useCallback(() => {
    setActiveId(null);
    setFocus(0);
  }, []);

  // A mode change puts every terminal back to standby, in BOTH directions:
  // the proximity watcher reports only CHANGES, so a walker who arrives far
  // from a plinth would otherwise inherit a screen an orbit click left powered.
  useEffect(() => {
    closeAll();
    setNears({});
  }, [mode, closeAll]);

  useEffect(() => {
    if (consoleId) closeAll();
  }, [consoleId, closeAll]);

  // Walking: E at a terminal powers it and hands it the keyboard.
  useEffect(() => {
    if (mode !== "walk") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "KeyE" || event.repeat) return;
      const id = defsRef.current.find((d) => nearsRef.current[d.id])?.id;
      if (!id) return;
      if (isTypingTarget(event.target) || isChromeOpen()) return;
      event.preventDefault();
      power(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, power]);

  const actions = useMemo(() => {
    const out: Record<string, Pick<TerminalState, "onNear" | "onExit" | "onActivate" | "setRig">> = {};
    for (const def of defs) {
      const close = () => {
        if (activeRef.current === def.id) closeAll();
      };
      out[def.id] = {
        onNear: (isNear) => {
          setNears((n) => (n[def.id] === isNear ? n : { ...n, [def.id]: isNear }));
          if (!isNear) close();
        },
        onExit: () => {
          const el = document.activeElement;
          if (el instanceof HTMLElement) el.blur();
          close();
        },
        // Orbit: a click on the plinth powers it, faces the screen back along
        // the line the click came from, and (flyOffset) flies the camera in. A
        // host console left on is closed first.
        onActivate: () => {
          onConsoleExit();
          const dx = cameraRef.current.x - def.stand[0];
          const dz = cameraRef.current.z - def.stand[1];
          const len = Math.hypot(dx, dz) || 1;
          setAnchors((a) => ({ ...a, [def.id]: { id: def.id, dirX: dx / len, dirZ: dz / len } }));
          power(def.id);
        },
        setRig: (on) => setRigs((r) => (r[def.id] === on ? r : { ...r, [def.id]: on })),
      };
    }
    return out;
  }, [defs, closeAll, power, onConsoleExit, cameraRef]);

  const get = useCallback((id: string): TerminalState => {
    const a = actions[id];
    if (!a) throw new Error(`no terminal "${id}" — add it to a room's terminals`);
    const screenRef = (screenRefs.current[id] ??= createRef<HTMLDivElement>());
    return {
      on: activeId === id,
      rig: rigs[id] ?? false,
      near: nears[id] ?? false,
      focus,
      anchor: anchors[id] ?? null,
      screenRef,
      ...a,
    };
  }, [actions, activeId, rigs, nears, focus, anchors]);

  const activeDef = activeId ? defs.find((d) => d.id === activeId) : undefined;
  const activeAnchor = activeDef ? anchors[activeDef.id] ?? null : null;
  // Stable while nothing about the powered terminal changed, so a fly-in keyed
  // on it is not restarted by unrelated re-renders.
  const active = useMemo(
    () => (activeDef ? { def: activeDef, anchor: activeAnchor } : null),
    [activeDef, activeAnchor],
  );
  return { get, anyOn: activeId !== null, active };
}
