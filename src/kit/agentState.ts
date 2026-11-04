// What an agent figure's state looks like: its colour, and how bright its
// visor glows at a moment. Pure so the look is decided in one place (a legend
// or a minimap can reuse the colours) and so the pulse shapes are testable.
import { CRITICAL, INFO, OK, PAPER, PAPER_DIM } from "../core/engine";

/** The life of one agent session as the figure shows it. */
export type AgentState = "working" | "walking" | "blocked" | "idle" | "done";

/** Every state, in the order a legend lists them. */
export const AGENT_STATES: readonly AgentState[] = ["working", "walking", "blocked", "idle", "done"];

/** The palette colour each state is drawn in. */
export const AGENT_STATE_COLOR: Record<AgentState, string> = {
  working: INFO,
  walking: PAPER,
  // Red, not WARN: a blocked agent is waiting on a person, and is the one
  // thing in the room someone should walk over to.
  blocked: CRITICAL,
  idle: PAPER_DIM,
  done: OK,
};

/** A short human word for each state, for tags and legends. */
export const AGENT_STATE_LABEL: Record<AgentState, string> = {
  working: "working",
  walking: "on the move",
  blocked: "needs a human",
  idle: "idle",
  done: "done",
};

/** The visor's brightness, 0..1, for `state` at time `t` seconds. With `reduce` it is constant. */
export function agentGlow(state: AgentState, t: number, reduce = false): number {
  switch (state) {
    case "working":
      // A ragged flicker, like keystrokes: two incommensurate rates so it
      // never settles into an obvious beat.
      return reduce ? 0.85 : 0.6 + 0.4 * Math.abs(Math.sin(t * 9) * Math.sin(t * 3.7 + 1));
    case "blocked":
      // Slow: ~3s a breath, the pace of "still waiting" rather than an alarm.
      return reduce ? 0.9 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.1));
    case "walking":
      return 0.8;
    case "idle":
      return 0.3;
    case "done":
      return 0.55;
  }
}

/** How high the figure hovers above its rest height, metres: a bob for idle and walking, nothing with `reduce`. */
export function agentBob(state: AgentState, t: number, reduce = false): number {
  if (reduce) return 0;
  switch (state) {
    case "idle":
      return 0.05 * Math.sin(t * 1.4);
    case "walking":
      return 0.025 * Math.sin(t * 9);
    case "working":
      return 0.012 * Math.sin(t * 2.3);
    case "blocked":
      return 0;
    case "done":
      // Settled: a finished session sits lower, its job over.
      return -0.08;
  }
}
