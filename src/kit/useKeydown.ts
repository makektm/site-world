// One window keydown subscription per kit component, with the handler read
// through a ref: a host passing an inline callback must not re-subscribe on
// every render, and a key pressed while a re-render is in flight must not be
// dropped by the gap between removing and adding a listener.
import { useEffect, useRef } from "react";

/** Calls `handler` for every window keydown while `enabled`. */
export function useKeydown(handler: (event: KeyboardEvent) => void, enabled = true): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => ref.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/** True for a key with Ctrl, Alt or Meta held — the browser's or the OS's,
 * not the world's. Shift is left out: it is a modifier the kit uses. */
export function hasCommandModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.altKey || event.metaKey;
}
