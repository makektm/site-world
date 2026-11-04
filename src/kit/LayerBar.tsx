// The layer chips: one toggle per question the building can answer, with
// 1..9 as shortcuts (Shift+digit shows that layer alone). Keys are matched
// on `event.code` so Shift+1 is still Digit1 on every keyboard layout.
//
// The demon game binds Digit4 in walk mode (doom/Doom.tsx); a host that runs
// both should pass `hotkeys={false}` while the game is on.
import type { CSSProperties } from "react";
import "./kit.css";
import { isChromeOpen, isTypingTarget } from "../core/keys";
import type { LayersApi } from "./layers";
import { hasCommandModifier, useKeydown } from "./useKeydown";

export interface LayerBarProps {
  layers: LayersApi;
  /** 1..9 toggle the first nine layers, from a window keydown listener that
   * claims those digits while mounted. Default true; pass false if the host
   * uses the digits itself. */
  hotkeys?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** DOM chips for `useLayers`' state, with keyboard shortcuts 1..9. */
export function LayerBar({ layers, hotkeys = true, className, style }: LayerBarProps) {
  useKeydown((event) => {
    if (event.repeat || hasCommandModifier(event)) return;
    if (isTypingTarget(event.target) || isChromeOpen()) return;
    const m = /^Digit([1-9])$/.exec(event.code);
    if (!m) return;
    const def = layers.defs[Number(m[1]) - 1];
    if (!def) return;
    event.preventDefault();
    if (event.shiftKey) layers.solo(def.id);
    else layers.toggle(def.id);
  }, hotkeys);

  return (
    <div className={`sw-kit sw-layerbar${className ? ` ${className}` : ""}`} style={style} role="toolbar" aria-label="Layers">
      {layers.defs.map((d, i) => (
        <button
          key={d.id}
          type="button"
          aria-pressed={layers.isOn(d.id)}
          title={[d.question, hotkeys && i < 9 ? `key ${i + 1} · shift+${i + 1} alone` : null].filter(Boolean).join(" — ") || undefined}
          onClick={(e) => (e.shiftKey ? layers.solo(d.id) : layers.toggle(d.id))}
        >
          {hotkeys && i < 9 && <span className="sw-layer-key">{i + 1}</span>}
          {d.color && <span className="sw-layer-swatch" style={{ background: d.color }} aria-hidden />}
          {d.label}
        </button>
      ))}
    </div>
  );
}
