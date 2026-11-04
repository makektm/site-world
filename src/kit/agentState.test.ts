import { describe, expect, it } from "vitest";
import { CRITICAL, OK } from "../core/engine";
import { AGENT_STATES, AGENT_STATE_COLOR, AGENT_STATE_LABEL, agentBob, agentGlow } from "./agentState";

describe("agentState", () => {
  it("gives every state a colour and a label", () => {
    for (const s of AGENT_STATES) {
      expect(AGENT_STATE_COLOR[s]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(AGENT_STATE_LABEL[s].length).toBeGreaterThan(0);
    }
    expect(AGENT_STATE_COLOR.blocked).toBe(CRITICAL);
    expect(AGENT_STATE_COLOR.done).toBe(OK);
  });

  it("keeps the glow within 0..1 and moving for working and blocked", () => {
    for (const s of AGENT_STATES) {
      for (let t = 0; t < 10; t += 0.13) {
        const g = agentGlow(s, t);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(1);
      }
    }
    expect(agentGlow("working", 0.1)).not.toBeCloseTo(agentGlow("working", 0.3));
    expect(agentGlow("blocked", 0)).not.toBeCloseTo(agentGlow("blocked", 1));
  });

  it("holds still with reduce", () => {
    for (const s of AGENT_STATES) {
      expect(agentGlow(s, 0, true)).toBe(agentGlow(s, 7.3, true));
      expect(agentBob(s, 0, true)).toBe(0);
      expect(agentBob(s, 4.2, true)).toBe(0);
    }
  });

  it("ranks blocked brighter than idle at its peak, so it is the one that draws the eye", () => {
    const peak = Math.max(...Array.from({ length: 100 }, (_, i) => agentGlow("blocked", i * 0.05)));
    expect(peak).toBeGreaterThan(agentGlow("idle", 0) * 2);
  });
});
