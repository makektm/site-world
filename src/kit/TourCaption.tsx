// The card a guided tour speaks through: where we are, what to look at, and
// next / back / stop. Arrow keys step while a tour runs; Esc stops it.
import type { CSSProperties } from "react";
import "./kit.css";
import { isChromeOpen, isTypingTarget } from "../core/keys";
import type { TourApi } from "./tour";
import { hasCommandModifier, useKeydown } from "./useKeydown";

export interface TourCaptionProps {
  tour: TourApi;
  /** ←/→ step, Esc stops. Default true. */
  hotkeys?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** The DOM caption card for `useTour`; renders nothing when no tour runs. */
export function TourCaption({ tour, hotkeys = true, className, style }: TourCaptionProps) {
  useKeydown((event) => {
    if (hasCommandModifier(event) || isTypingTarget(event.target) || isChromeOpen()) return;
    if (event.key === "ArrowRight") tour.next();
    else if (event.key === "ArrowLeft") tour.prev();
    else if (event.key === "Escape") tour.end();
    else return;
    event.preventDefault();
  }, hotkeys && tour.active);

  if (!tour.active || !tour.stop || tour.index === null) return null;
  const last = tour.index === tour.count - 1;
  return (
    <div className={`sw-kit sw-kit-card sw-tour${className ? ` ${className}` : ""}`} style={style} role="region" aria-label="Tour" aria-live="polite">
      <div className="sw-tour-step">stop {tour.index + 1} / {tour.count}</div>
      {tour.stop.title && <h2 className="sw-tour-title">{tour.stop.title}</h2>}
      <div className="sw-tour-caption">{tour.stop.caption}</div>
      <div className="sw-tour-nav">
        <button type="button" onClick={tour.prev} disabled={tour.index === 0}>← back</button>
        <button type="button" onClick={tour.next}>{last ? "finish" : "next →"}</button>
        <button type="button" className="sw-tour-end" onClick={tour.end} title="Esc">stop</button>
      </div>
    </div>
  );
}
