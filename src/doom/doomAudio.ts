// The demon game's sound: every effect synthesised with WebAudio from an
// oscillator or a burst of noise — no asset files to ship, nothing fetched
// from anywhere. Kept deliberately quiet (MASTER), since SITE is a viewport
// inside a host application first.
//
// The AudioContext is created by wakeAudio() from the first click or key
// press, so autoplay policy lets it start; the frame loop only ever plays
// into a context that already exists. Anything that fails (no WebAudio, a
// suspended context) is silently skipped: sound is a garnish, never
// something the game waits on.
import type { DoomFx, SoundName } from "./doomWorld";

const MASTER = 0.09;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor = window.AudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = MASTER;
    master.connect(ctx.destination);
    // Half a second of white noise, reused by every noisy effect.
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
  return ctx;
}

/** A pitched blip: `type` oscillator sliding from f0 to f1 over `dur`, with
 * a fast attack and an exponential tail. */
function tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0): void {
  const a = ctx;
  if (!a || !master || a.state !== "running") return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Filtered noise: a crack, a thud, a hiss, depending on the filter. */
function hiss(freq: number, q: number, dur: number, gain: number, filter: BiquadFilterType = "bandpass", delay = 0): void {
  const a = ctx;
  if (!a || !master || !noise || a.state !== "running") return;
  const t = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noise;
  const f = a.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const SOUNDS: Record<SoundName, () => void> = {
  shot: () => {
    hiss(2400, 0.8, 0.09, 0.9);
    tone("square", 520, 90, 0.08, 0.35);
  },
  dry: () => tone("square", 1800, 1600, 0.025, 0.25),
  reload: () => {
    tone("square", 900, 700, 0.03, 0.2);
    hiss(3000, 3, 0.05, 0.3, "bandpass", 0.12);
  },
  reloaded: () => {
    tone("square", 700, 1100, 0.04, 0.25);
    tone("square", 1100, 1400, 0.03, 0.2, 0.06);
  },
  hit: () => tone("triangle", 1300, 900, 0.05, 0.3),
  kill: () => {
    tone("sawtooth", 420, 50, 0.35, 0.35);
    hiss(700, 1, 0.3, 0.5, "lowpass");
  },
  hurt: () => {
    tone("sine", 160, 60, 0.22, 0.8);
    hiss(400, 1, 0.12, 0.5, "lowpass");
  },
  death: () => {
    tone("sawtooth", 220, 30, 1.4, 0.5);
    tone("sine", 110, 20, 1.6, 0.6, 0.1);
  },
  wave: () => {
    tone("sawtooth", 80, 160, 0.5, 0.35);
    tone("sawtooth", 120, 240, 0.5, 0.25, 0.05);
  },
  clear: () => {
    tone("triangle", 523, 523, 0.14, 0.3);
    tone("triangle", 659, 659, 0.14, 0.3, 0.12);
    tone("triangle", 784, 784, 0.3, 0.3, 0.24);
  },
  spawn: () => tone("sine", 90, 260, 0.5, 0.25),
  windup: () => tone("sawtooth", 60, 190, 0.7, 0.3),
  slam: () => {
    tone("sine", 90, 25, 0.6, 1);
    hiss(300, 0.7, 0.5, 0.9, "lowpass");
  },
  pickup: () => {
    tone("sine", 880, 1320, 0.08, 0.3);
    tone("sine", 1320, 1760, 0.1, 0.25, 0.07);
  },
  summon: () => {
    tone("sawtooth", 55, 110, 0.9, 0.35);
    hiss(200, 1, 0.8, 0.4, "lowpass");
  },
};

/** Called from a real click or key handler: creates the context if needed
 * and resumes it, which a browser only allows inside a user gesture. The
 * sounds themselves fire from the frame loop, outside any gesture. */
export function wakeAudio(): void {
  const a = audio();
  if (a && a.state === "suspended") void a.resume().catch(() => {});
}

export const doomAudio: DoomFx = {
  sound(name) {
    try {
      SOUNDS[name]();
    } catch {
      // A garnish; never let it throw into the frame loop.
    }
  },
};
