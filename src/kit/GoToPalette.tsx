// "/" or Ctrl+K: type a name, Enter, and the camera flies there. The palette
// only searches and reports the pick; the host turns it into a goal (goalFor)
// for SiteWorld's `hostGoal`, and may also select the target.
//
// It is role="dialog" on purpose: while it is open the viewport's own keys
// (walk, E, the layer digits) stand down — see core/keys.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import "./kit.css";
import { isChromeOpen, isTypingTarget } from "../core/keys";
import { fuzzySearch } from "./fuzzy";
import type { Point3 } from "./goal";
import { useKeydown } from "./useKeydown";

/** Somewhere the palette can go. */
export interface GoToTarget {
  id: string;
  label: string;
  /** "service", "room", "agent", "queue" — shown, and searched. */
  kind: string;
  /** World point to look at. */
  pos: Point3;
  /** Right-aligned extra (owner, health). */
  detail?: ReactNode;
  /** Extra words that should find it (team, aliases). */
  keywords?: readonly string[];
}

export interface GoToPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: readonly GoToTarget[];
  /** The pick. The palette closes itself afterwards. */
  onGo: (target: GoToTarget) => void;
  /** "/" and Ctrl/Cmd+K open it, from a window keydown listener that calls
   * preventDefault on them (unless focus is in a text field). Default true;
   * pass false if the host already uses either key and opens it itself. */
  hotkeys?: boolean;
  placeholder?: string;
  limit?: number;
  className?: string;
  style?: CSSProperties;
}

function isCtrlK(event: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; code: string }): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.code === "KeyK";
}

/** A fuzzy go-to search over host targets; Enter calls `onGo`. Unless
 * `hotkeys={false}`, it claims "/" and Ctrl/Cmd+K window-wide while mounted. */
export function GoToPalette({
  open, onOpenChange, targets, onGo, hotkeys = true, placeholder = "go to…", limit = 12, className, style,
}: GoToPaletteProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => fuzzySearch(targets, query, limit), [targets, query, limit]);
  const at = Math.min(cursor, Math.max(0, results.length - 1));

  useKeydown((event) => {
    // While open, keys land in the dialog's own onKeyDown, which stops them
    // before they reach the window (Ctrl/Cmd+K to close is handled there).
    if (open) return;
    const ctrlK = isCtrlK(event);
    const slash = event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (!ctrlK && !slash) return;
    if (isTypingTarget(event.target) || isChromeOpen()) return;
    event.preventDefault();
    setQuery("");
    setCursor(0);
    onOpenChange(true);
  }, hotkeys);

  // Opening hands the keyboard to the input and the mouse back to the person:
  // a walker's locked pointer could not reach the list.
  useEffect(() => {
    if (!open) return;
    if (document.pointerLockElement) document.exitPointerLock?.();
    input.current?.focus();
  }, [open]);

  if (!open) return null;
  const close = () => onOpenChange(false);
  const go = (t: GoToTarget | undefined) => {
    if (!t) return;
    close();
    onGo(t);
  };
  return (
    <div
      className={`sw-kit sw-kit-card sw-goto${className ? ` ${className}` : ""}`}
      style={style}
      role="dialog"
      aria-label="Go to"
      onKeyDown={(e) => {
        // Kept from the world's window listeners (walk, E, layer digits).
        e.stopPropagation();
        if (e.key === "Escape" || isCtrlK(e)) {
          e.preventDefault();
          close();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setCursor(Math.min(results.length - 1, at + 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setCursor(Math.max(0, at - 1));
        } else if (e.key === "Enter") {
          e.preventDefault();
          go(results[at]);
        }
      }}
    >
      <input
        ref={input}
        type="text"
        value={query}
        placeholder={placeholder}
        aria-label="Search"
        aria-controls="sw-goto-list"
        aria-activedescendant={results[at] ? `sw-goto-${results[at].id}` : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setCursor(0);
        }}
        onBlur={(e) => {
          // Clicking a result blurs the input first; only a click elsewhere closes.
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null)) close();
        }}
      />
      {results.length === 0 ? (
        <div className="sw-goto-empty">nothing matches “{query}”</div>
      ) : (
        <ul id="sw-goto-list" role="listbox">
          {results.map((t, i) => (
            <li
              key={t.id}
              id={`sw-goto-${t.id}`}
              role="option"
              aria-selected={i === at}
              tabIndex={-1}
              onMouseEnter={() => setCursor(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(t)}
            >
              <span className="sw-goto-kind">{t.kind}</span>
              <span>{t.label}</span>
              {t.detail != null && <span className="sw-goto-detail">{t.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
