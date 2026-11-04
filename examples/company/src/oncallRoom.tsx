// The on-call console in EDGE: a terminal on a plinth whose screen is real DOM
// (so it could be your incident tool, your runbooks, a shell). Here it lists
// what is wrong right now, then the busiest of the rest — the whole catalogue
// no longer fits on one screen.
//
// It is also a restricted terminal: three macros, and only three, that act on
// the factory — pause one agent, approve the PR that has waited longest, roll
// back the last deploy — each logged with who ran it. Acting from inside the
// world, on the thing you are looking at, without handing anyone a shell.
import {
  CONSOLE_PX_H, CONSOLE_PX_W, ConsoleRig, Plinth, PointProximity, defineRoom, useSelection,
} from "site-world";
import type { AgentState } from "./factory/agents";
import { SERVICES } from "./factory/catalog";
import {
  approveTopReview, pauseAgent, resumeAgent, rollbackLastDeploy, useFactory, type AuditEntry, type FactoryState,
} from "./factory/feed";
import { lastRollbackable, topOfReview } from "./factory/pipeline";
import { tickAge } from "./inspect";
import { HEALTH_LABEL, useFeed } from "./liveFeed";
import { ONCALL_PLINTH } from "./plan";
import { HEALTH_COLOR } from "./serviceRoom";
import { SELECTION, useView } from "./worldState";

const ID = "oncall";
/** As many rows as fit the console's screen above the macros and the log. */
const ROWS = 8;
// Runbook buttons share one line with exit.
const RUNBOOKS = 2;
const LOG_LINES = 2;
const DIM = "#7fa98f";
const OFFSET = 0.64 / 2 + 0.14;

export const oncallRoom = defineRoom({
  id: ID,
  terminals: [{ id: ID, stand: ONCALL_PLINTH, flyOffset: OFFSET }],
  useModel: () => ({ feed: useFeed(), factory: useFactory() }),
  Scene({ env }) {
    const term = env.terminals.get(ID);
    const walking = env.mode === "walk";
    return (
      <>
        <Plinth at={ONCALL_PLINTH} onActivate={walking ? undefined : term.onActivate} />
        <PointProximity enabled={walking} point={ONCALL_PLINTH} onNear={term.onNear} />
        {term.rig && (
          <ConsoleRig
            px={ONCALL_PLINTH[0]}
            pz={ONCALL_PLINTH[1]}
            offset={OFFSET}
            anchor={term.anchor}
            mode={env.mode}
            powered={term.on}
            reduce={env.reduce}
            screen={term.screenRef}
            onPoweredOff={() => term.setRig(false)}
          />
        )}
      </>
    );
  },
  Overlay({ model: { feed, factory }, env }) {
    const term = env.terminals.get(ID);
    const { selected } = useSelection(SELECTION);
    const { replay } = useView();
    const incidents = SERVICES.filter((s) => feed[s.name]!.health !== "ok");
    const calm = SERVICES.filter((s) => feed[s.name]!.health === "ok").sort((a, b) => feed[b.name]!.rps - feed[a.name]!.rps);
    const rows = [...incidents, ...calm].slice(0, ROWS);
    const hidden = SERVICES.length - rows.length;
    const cell = { padding: "2px 10px" } as const;
    return (
      <div className="sw-screen" ref={term.screenRef} style={{ visibility: "hidden" }}>
        {term.rig && (
          <div
            style={{
              width: CONSOLE_PX_W, height: CONSOLE_PX_H, boxSizing: "border-box", padding: "26px 30px",
              background: "#04120a", color: "#58e892", fontFamily: "ui-monospace, monospace", fontSize: 19,
              display: "flex", flexDirection: "column", gap: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", color: "#9dffbe", fontSize: 24 }}>
              <span>ON-CALL · {SERVICES.length} SERVICES</span>
              <span style={{ color: incidents.length ? HEALTH_COLOR.warn : HEALTH_COLOR.ok }}>
                {incidents.length ? `${incidents.length} NEED ATTENTION` : "ALL CLEAR"}
              </span>
            </div>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                {rows.map((s) => {
                  const st = feed[s.name]!;
                  return (
                    <tr key={s.name} style={{ borderBottom: "1px solid #0e3a22" }}>
                      <td style={cell}>{s.name}</td>
                      <td style={{ ...cell, color: DIM }}>{s.domain}</td>
                      <td style={{ ...cell, textAlign: "right" }}>{st.rps} rps</td>
                      <td style={{ ...cell, textAlign: "right" }}>{st.p99}ms</td>
                      <td style={{ ...cell, color: HEALTH_COLOR[st.health] }}>{HEALTH_LABEL[st.health]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {hidden > 0 && <div style={{ color: DIM }}>… {hidden} more, all OK</div>}
            <Macros factory={factory} selectedAgent={selected?.kind === "agent" ? selected.id : null} replaying={replay !== null} />
            <div style={{ display: "flex", gap: 12, marginTop: "auto" }}>
              {incidents.slice(0, RUNBOOKS).map((s) => (
                <button
                  key={s.name}
                  onClick={() => env.onOpenPage(`/runbooks/${s.name}`)}
                  style={{ font: "inherit", background: "none", color: HEALTH_COLOR[feed[s.name]!.health], border: "1px solid", padding: "4px 12px", cursor: "pointer" }}
                >
                  runbook: {s.name}
                </button>
              ))}
              <button
                onClick={term.onExit}
                style={{ font: "inherit", background: "none", color: "inherit", border: "1px solid", padding: "4px 12px", marginLeft: "auto", cursor: "pointer" }}
              >
                exit
              </button>
            </div>
          </div>
        )}
      </div>
    );
  },
  Colliders: () => (
    <mesh position={[ONCALL_PLINTH[0], 0.525, ONCALL_PLINTH[1]]}>
      <boxGeometry args={[0.64, 1.05, 0.64]} />
    </mesh>
  ),
  prompt: (_feed, env) => {
    const term = env.terminals.get(ID);
    return term.near && !term.on ? "ON-CALL" : null;
  },
});

const button = (color: string, disabled: boolean) => ({
  font: "inherit",
  background: "none",
  color: disabled ? "#2f5a42" : color,
  border: "1px solid",
  padding: "4px 10px",
  cursor: disabled ? "default" : "pointer",
  whiteSpace: "nowrap" as const,
  overflow: "hidden",
  textOverflow: "ellipsis",
  flex: "1 1 0",
  minWidth: 0,
});

/** Who the macros run as: whoever is on call, or the rota's alias. */
function onCall(f: FactoryState): string {
  return f.humans.find((h) => h.room === "oncall")?.handle ?? "@on-call";
}

/** The agent "pause" acts on: the selected one, else the one burning the most tokens right now. */
function pauseTarget(f: FactoryState, selected: string | null): AgentState | null {
  const sel = selected ? f.agents.find((a) => a.id === selected) : undefined;
  if (sel) return sel;
  return [...f.agents].filter((a) => a.state === "working" && !a.paused).sort((a, b) => b.tokens - a.tokens)[0] ?? null;
}

function logLine(e: AuditEntry): string {
  const what = { pause: "paused", resume: "resumed", approve: "approved", rollback: "rolled back" }[e.action];
  return `${e.who} ${what} ${e.target}`;
}

function Macros({ factory, selectedAgent, replaying }: { factory: FactoryState; selectedAgent: string | null; replaying: boolean }) {
  const who = onCall(factory);
  const agent = pauseTarget(factory, selectedAgent);
  const top = topOfReview(factory.pipeline);
  const last = lastRollbackable(factory.pipeline);
  const log = factory.audit.slice(-LOG_LINES).reverse();
  // A replayed screen shows the past; the macros only ever act on now.
  const off = replaying;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #0e3a22", paddingTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", color: DIM, fontSize: 16 }}>
        <span>RESTRICTED · 3 MACROS · AS {who}</span>
        <span>{off ? "REPLAY: LIVE ONLY" : "EVERY RUN IS LOGGED"}</span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {agent?.paused ? (
          <button disabled={off} onClick={() => resumeAgent(agent.id, who)} style={button("#9dffbe", off)}>resume {agent.name}</button>
        ) : (
          <button disabled={off || !agent} onClick={() => agent && pauseAgent(agent.id, who)} style={button(HEALTH_COLOR.warn, off || !agent)}>
            pause {agent?.name ?? "agent"}
          </button>
        )}
        <button disabled={off || !top} onClick={() => approveTopReview(who)} style={button("#9dffbe", off || !top)}>
          {top ? `approve ${top.id} · ${tickAge(top.stageAge)}` : "review empty"}
        </button>
        <button disabled={off || !last} onClick={() => rollbackLastDeploy(who)} style={button(HEALTH_COLOR.down, off || !last)}>
          {last ? `roll back ${last.service} v${last.version}` : "nothing to roll back"}
        </button>
      </div>
      <div style={{ color: DIM, fontSize: 16, minHeight: LOG_LINES * 20 }}>
        {log.length ? log.map((e, i) => <div key={`${e.tick}-${i}`}>› {logLine(e)}</div>) : <div>› no macros run this shift</div>}
      </div>
    </div>
  );
}
