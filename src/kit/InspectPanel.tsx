// The side panel that answers "what is this?" for whatever is selected. The
// host decides what to say (fields, sections, actions); the panel only lays
// it out. Pass it as SiteWorld's `overlay` (or anywhere in the DOM).
//
// It is an <aside>, deliberately not role="dialog": the viewport treats any
// open dialog as "keys belong to the chrome" (core/keys.ts), and a panel
// left open must not stop a person walking.
import { useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import "./kit.css";
import { isChromeOpen, isTypingTarget } from "../core/keys";
import { hasCommandModifier, useKeydown } from "./useKeydown";

/** How a value reads: the palette's status colours, or dimmed. */
export type InspectTone = "ok" | "info" | "warn" | "critical" | "dim";

/** One label/value row. */
export interface InspectField {
  label: string;
  value: ReactNode;
  tone?: InspectTone;
}

/** A titled block: rows, free content, or both (rows first). */
export interface InspectSection {
  title: string;
  fields?: readonly InspectField[];
  body?: ReactNode;
}

/** A button along the panel's foot ("open runbook", "page owner"). */
export interface InspectAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface InspectPanelProps {
  /** Shown while true; render nothing otherwise (no selection). */
  open: boolean;
  title: ReactNode;
  /** Small caps above the title: "service", "agent", "queue". */
  kind?: ReactNode;
  subtitle?: ReactNode;
  /** A colour for the kind line and the panel's left rule (health, origin). */
  accent?: string;
  fields?: readonly InspectField[];
  sections?: readonly InspectSection[];
  actions?: readonly InspectAction[];
  /** Anything else, after the sections. */
  children?: ReactNode;
  onClose: () => void;
  /** Esc closes it. Default true. */
  closeOnEscape?: boolean;
  className?: string;
  style?: CSSProperties;
}

function Fields({ fields }: { fields: readonly InspectField[] }) {
  return (
    <dl className="sw-inspect-fields">
      {fields.map((f, i) => (
        <div key={`${f.label}-${i}`} style={{ display: "contents" }}>
          <dt>{f.label}</dt>
          <dd className={f.tone ? `sw-kit-tone-${f.tone}` : undefined}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A DOM side panel for the current selection, with a close button and Esc. */
export function InspectPanel({
  open, title, kind, subtitle, accent, fields, sections, actions, children, onClose,
  closeOnEscape = true, className, style,
}: InspectPanelProps) {
  const self = useRef<HTMLElement>(null);
  useKeydown((event) => {
    if (event.key !== "Escape" || hasCommandModifier(event)) return;
    // A palette or dialog on top owns Esc; so does a field outside the panel
    // (a terminal's own input closes its terminal).
    if (isChromeOpen()) return;
    const inside = event.target instanceof Node && Boolean(self.current?.contains(event.target));
    if (isTypingTarget(event.target) && !inside) return;
    onClose();
  }, open && closeOnEscape);

  if (!open) return null;
  return (
    <aside
      ref={self}
      className={`sw-kit sw-kit-card sw-inspect${className ? ` ${className}` : ""}`}
      style={{ ...(accent ? { boxShadow: `inset 3px 0 0 ${accent}` } : null), ...style }}
      aria-label="Inspector"
    >
      <header className="sw-inspect-head">
        <div style={{ minWidth: 0 }}>
          {kind && <div className="sw-inspect-kind" style={accent ? { color: accent } : undefined}>{kind}</div>}
          <h2 className="sw-inspect-title">{title}</h2>
          {subtitle && <p className="sw-inspect-sub">{subtitle}</p>}
        </div>
        <button type="button" className="sw-inspect-close" onClick={onClose} aria-label="Close inspector" title="Close (Esc)">
          ×
        </button>
      </header>
      <div className="sw-inspect-body">
        {fields && fields.length > 0 && <div className="sw-inspect-section"><Fields fields={fields} /></div>}
        {sections?.map((s, i) => (
          <section key={`${s.title}-${i}`} className="sw-inspect-section">
            <h3>{s.title}</h3>
            {s.fields && s.fields.length > 0 && <Fields fields={s.fields} />}
            {s.body}
          </section>
        ))}
        {children}
      </div>
      {actions && actions.length > 0 && (
        <footer className="sw-inspect-actions">
          {actions.map((a) => (
            <button key={a.label} type="button" onClick={a.onClick} disabled={a.disabled}>{a.label}</button>
          ))}
        </footer>
      )}
    </aside>
  );
}
