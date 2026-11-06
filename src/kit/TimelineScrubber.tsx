// The timeline bar: play/pause, a range over the window, event markers (deploys,
// incidents, agent merges) with tooltips, a speed menu and a LIVE button.
// State lives in `useTimeline`; this is its face.
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import "./kit.css";
import type { InspectTone } from "./InspectPanel";
import type { TimelineApi } from "./timeline";

/** Something that happened at `t` (epoch ms), drawn as a dot on the track. */
export interface TimelineEvent {
  id: string;
  t: number;
  label: ReactNode;
  tone?: InspectTone;
}

/** A playback rate (history ms per real ms) and what to call it. */
export interface TimelineSpeed {
  value: number;
  label: string;
}

/** Real time up to an hour of history a second: factory history is hours to
 * days long, and 1x alone would never get anywhere. */
export const DEFAULT_SPEEDS: readonly TimelineSpeed[] = [
  { value: 1, label: "1x" },
  { value: 60, label: "1m/s" },
  { value: 600, label: "10m/s" },
  { value: 3600, label: "1h/s" },
];

function clock(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export interface TimelineScrubberProps {
  timeline: TimelineApi;
  events?: readonly TimelineEvent[];
  speeds?: readonly TimelineSpeed[];
  /** How the playhead and tooltips print a time. Default local HH:MM:SS. */
  format?: (t: number) => string;
  /** A marker was clicked (after the playhead seeks to it). */
  onEvent?: (event: TimelineEvent) => void;
  className?: string;
  style?: CSSProperties;
}

/** DOM scrubber for `useTimeline`: range, play/pause, speed, LIVE, event markers. */
export function TimelineScrubber({
  timeline: tl, events = [], speeds = DEFAULT_SPEEDS, format = clock, onEvent, className, style,
}: TimelineScrubberProps) {
  const [tip, setTip] = useState<string | null>(null);
  const span = tl.end - tl.start;
  const frac = (t: number) => (span > 0 ? (t - tl.start) / span : 1);
  const shown = events.filter((e) => e.t >= tl.start && e.t <= tl.end);
  const tipEvent = tip ? shown.find((e) => e.id === tip) : undefined;
  // The range runs in ms from `start`, stepped at ~1/2000 of the window: a
  // 1ms step over a day-long window makes a slider the keyboard cannot move.
  const step = Math.max(1, Math.round(span / 2000));

  return (
    <div className={`sw-kit sw-kit-card sw-timeline${className ? ` ${className}` : ""}`} style={style} role="group" aria-label="Timeline">
      <button type="button" onClick={tl.toggle} aria-label={tl.playing ? "Pause" : "Play"} title={tl.playing ? "pause" : "play"}>
        {tl.playing ? "❚❚" : "▶"}
      </button>
      <div className="sw-timeline-track">
        <input
          type="range"
          min={0}
          max={Math.max(span, 0)}
          step={step}
          value={tl.t - tl.start}
          aria-label="Playhead"
          aria-valuetext={tl.live ? "live" : format(tl.t)}
          onChange={(e) => tl.seek(tl.start + Number(e.target.value))}
        />
        <div className="sw-timeline-marks">
          {shown.map((e) => (
            <button
              key={e.id}
              type="button"
              className={`sw-timeline-mark sw-kit-tone-${e.tone ?? "info"}`}
              style={{ left: `${frac(e.t) * 100}%` }}
              aria-label={typeof e.label === "string" ? `${e.label} at ${format(e.t)}` : format(e.t)}
              onMouseEnter={() => setTip(e.id)}
              onMouseLeave={() => setTip((cur) => (cur === e.id ? null : cur))}
              onFocus={() => setTip(e.id)}
              onBlur={() => setTip((cur) => (cur === e.id ? null : cur))}
              onClick={() => {
                tl.seek(e.t);
                onEvent?.(e);
              }}
            />
          ))}
        </div>
        {tipEvent && (
          <div className="sw-kit-card sw-timeline-tip" style={{ left: `${frac(tipEvent.t) * 100}%` }} role="tooltip">
            <span className="sw-kit-tone-dim">{format(tipEvent.t)}</span> {tipEvent.label}
          </div>
        )}
      </div>
      <span className="sw-timeline-time">{tl.live ? "now" : format(tl.t)}</span>
      <select aria-label="Speed" value={tl.speed} onChange={(e) => tl.setSpeed(Number(e.target.value))}>
        {speeds.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
        {!speeds.some((s) => s.value === tl.speed) && <option value={tl.speed}>{tl.speed}x</option>}
      </select>
      <button type="button" className="sw-timeline-live" aria-pressed={tl.live} onClick={tl.goLive} title="follow the newest moment">
        LIVE
      </button>
    </div>
  );
}
