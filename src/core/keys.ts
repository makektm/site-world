// Shared key-target tests. Every global handler in this app asks these
// rather than restating "is the person typing" and "is a chrome dialog
// already up" — the palette, the shortcuts overlay, SITE walk, and the
// SITE console-Esc handler.

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

/** Command palette or the shortcuts overlay. A second overlay must not
 * steal keys from one that is already up, and SITE must not walk through
 * either. */
export function isChromeOpen(): boolean {
  return document.querySelector(".cmdk-dialog, .kbd-dialog") != null;
}

/** Visible search field on the current page, if any. `/` focuses that
 * instead of opening the palette — a page list view (or any panel that
 * uses `type="search"`) already owns that key as "filter this list". */
export function pageSearchField(): HTMLInputElement | null {
  const nodes = document.querySelectorAll<HTMLInputElement>(
    "input[type='search']:not([disabled])",
  );
  for (const node of nodes) {
    if (node.offsetParent === null) continue;
    return node;
  }
  return null;
}
