// Shared key-target tests. Every global key handler in the viewport (walk, E,
// the demon game) asks these rather than restating "is the person typing" and
// "is a dialog already up".

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

let chromeOpen: () => boolean = () => document.querySelector("dialog[open], [role='dialog']") != null;

/** Tell the viewport how to know that the host's own dialog (a command palette,
 * a shortcuts overlay) is up, so walking, E and the game do not steal its keys.
 * The default is any open `<dialog>` or `[role=dialog]`. */
export function setChromeOpenCheck(check: () => boolean): void {
  chromeOpen = check;
}

/** True while a host dialog is up: keys belong to it, not to the world. */
export function isChromeOpen(): boolean {
  return chromeOpen();
}
