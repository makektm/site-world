// The demon game's HUD: a DOM overlay over the SITE canvas, a sibling of it
// the way the walk hint and the "[E] USE" prompt are, mounted by
// the host only in walk mode. 4 hides and shows it; the death
// screen shows either way, since it is how the player gets back up.
//
// It reads the game through useDoomHud(), which only changes when a number
// on it does (doomStore.ts) — never per frame. Everything that moves on its
// own (the reload bar filling, a hit marker fading, the red flash when
// bitten, a wave banner) is a CSS animation restarted by remounting its
// element on a new `key` taken from one of the snapshot's counters, so
// React renders once per event and the browser animates the rest.
import type { CSSProperties } from "react";
import "./doomHud.css";
import { useDoomHud } from "./doomStore";
import type { HudSnapshot } from "./doomWorld";

const HP_SEGMENTS = 20;

function Health({ s }: { s: HudSnapshot }) {
  const lit = Math.ceil((s.hp / s.maxHp) * HP_SEGMENTS);
  const low = s.hp <= 30;
  return (
    <div className={`dhud-panel dhud-health${low ? " dhud-health--low" : ""}`}>
      <div className="dhud-label">HP</div>
      <div className="dhud-big">{s.hp}</div>
      <div className="dhud-segs" aria-hidden>
        {Array.from({ length: HP_SEGMENTS }, (_, i) => (
          <span key={i} className={i < lit ? "dhud-seg dhud-seg--on" : "dhud-seg"} />
        ))}
      </div>
    </div>
  );
}

function Ammo({ s }: { s: HudSnapshot }) {
  const empty = s.mag === 0;
  const low = !empty && s.mag <= 3;
  return (
    <div className={`dhud-panel dhud-ammo${low ? " dhud-ammo--low" : ""}${empty ? " dhud-ammo--empty" : ""}`}>
      <div className="dhud-pips" aria-hidden>
        {Array.from({ length: s.magSize }, (_, i) => (
          <span key={i} className={i < s.mag ? "dhud-pip dhud-pip--on" : "dhud-pip"} />
        ))}
      </div>
      <div className="dhud-ammo-row">
        <span className="dhud-big">{s.mag}</span>
        <span className="dhud-reserve">/ {s.reserve}</span>
      </div>
      {s.reloading ? (
        <div className="dhud-reload">
          <span className="dhud-reload-label">RELOADING</span>
          <span className="dhud-reload-track">
            <span
              key={s.reloadSeq}
              className="dhud-reload-fill"
              style={{ "--dhud-reload-ms": `${s.reloadMs}ms` } as CSSProperties}
            />
          </span>
        </div>
      ) : empty || low ? (
        <div className="dhud-hint-key">{s.reserve > 0 ? "R · RELOAD" : "NO ROUNDS"}</div>
      ) : null}
      <div className="dhud-controls">click fire · hold auto · R reload · 4 HUD</div>
    </div>
  );
}

function Status({ s }: { s: HudSnapshot }) {
  if (s.phase === "idle") {
    return (
      <div className="dhud-status">
        <div className="dhud-status-sub">the red switch on the south wall wakes them</div>
      </div>
    );
  }
  return (
    <div className="dhud-status">
      <div className="dhud-wave">WAVE {s.wave}</div>
      <div className="dhud-status-sub">
        {s.phase === "intermission" ? "they are coming" : `${s.left} left`}
      </div>
    </div>
  );
}

function Score({ s }: { s: HudSnapshot }) {
  return (
    <div className="dhud-panel dhud-score">
      <div className="dhud-score-row">
        <span className="dhud-label">SCORE</span>
        <span className="dhud-num">{s.score.toLocaleString("en-US")}</span>
      </div>
      <div className="dhud-score-row">
        <span className="dhud-label">KILLS</span>
        <span className="dhud-num">{s.kills}</span>
      </div>
      <div className="dhud-score-row dhud-score-row--dim">
        <span className="dhud-label">BEST</span>
        <span className="dhud-num">{s.best.toLocaleString("en-US")}</span>
      </div>
      {s.combo > 1 && (
        <div key={s.killSeq} className="dhud-combo">×{s.combo}</div>
      )}
    </div>
  );
}

/** Hit and kill markers round the crosshair the host already
 * draws: four ticks for a hit, a bigger red X for a kill. */
function Markers({ s }: { s: HudSnapshot }) {
  return (
    <>
      {s.hitSeq > 0 && <div key={`h${s.hitSeq}`} className="dhud-marker dhud-marker--hit" aria-hidden />}
      {s.killSeq > 0 && <div key={`k${s.killSeq}`} className="dhud-marker dhud-marker--kill" aria-hidden />}
    </>
  );
}

function Death({ s }: { s: HudSnapshot }) {
  return (
    <div className="dhud-death" role="alert">
      <div className="dhud-death-title">you died</div>
      <div className="dhud-death-line">
        wave {s.wave} · {s.kills} {s.kills === 1 ? "kill" : "kills"} · {s.score.toLocaleString("en-US")}
        {s.score > 0 && s.score >= s.best ? " · new best" : ""}
      </div>
      <div className="dhud-death-cta">click or E to rise again</div>
    </div>
  );
}

export function DoomHud() {
  const s = useDoomHud();
  const dead = s.phase === "dead";
  return (
    <div className="dhud" aria-live="off">
      {s.hurtSeq > 0 && <div key={s.hurtSeq} className="dhud-hurt" aria-hidden />}
      {s.visible && s.hp > 0 && s.hp <= 30 && <div className="dhud-lowhp" aria-hidden />}
      {s.visible && !dead && (
        <>
          <Status s={s} />
          <Score s={s} />
          <Health s={s} />
          <Ammo s={s} />
          <Markers s={s} />
          {s.bannerSeq > 0 && s.banner && (
            <div key={s.bannerSeq} className="dhud-banner">{s.banner}</div>
          )}
        </>
      )}
      {!s.visible && !dead && <div className="dhud-off">4 · HUD</div>}
      {dead && <Death s={s} />}
    </div>
  );
}
