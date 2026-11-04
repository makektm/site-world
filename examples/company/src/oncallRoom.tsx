// The on-call console in EDGE: a terminal on a plinth whose screen is real DOM
// (so it could be your incident tool, your runbooks, a shell). Here it lists
// every service and what is wrong right now.
import {
  CONSOLE_PX_H, CONSOLE_PX_W, ConsoleRig, Plinth, PointProximity, defineRoom,
} from "site-world";
import { HEALTH_COLOR } from "./serviceRoom";
import { HEALTH_LABEL, SERVICES, useFeed } from "./services";

const ID = "oncall";
export const ONCALL_PLINTH: readonly [number, number] = [-2.2, -8];
const OFFSET = 0.64 / 2 + 0.14;

export const oncallRoom = defineRoom({
  id: ID,
  terminals: [{ id: ID, stand: ONCALL_PLINTH, flyOffset: OFFSET }],
  useModel: () => useFeed(),
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
  Overlay({ model: feed, env }) {
    const term = env.terminals.get(ID);
    const incidents = SERVICES.filter((s) => feed[s.name]!.health !== "ok");
    const cell = { padding: "5px 10px" } as const;
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
              <span>ON-CALL · 10 SERVICES</span>
              <span style={{ color: incidents.length ? HEALTH_COLOR.warn : HEALTH_COLOR.ok }}>
                {incidents.length ? `${incidents.length} NEED ATTENTION` : "ALL CLEAR"}
              </span>
            </div>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                {SERVICES.map((s) => {
                  const st = feed[s.name]!;
                  return (
                    <tr key={s.name} style={{ borderBottom: "1px solid #0e3a22" }}>
                      <td style={cell}>{s.name}</td>
                      <td style={{ ...cell, color: "#7fa98f" }}>{s.domain}</td>
                      <td style={{ ...cell, textAlign: "right" }}>{st.rps} rps</td>
                      <td style={{ ...cell, textAlign: "right" }}>{st.p99}ms</td>
                      <td style={{ ...cell, color: HEALTH_COLOR[st.health] }}>{HEALTH_LABEL[st.health]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 12, marginTop: "auto" }}>
              {incidents.map((s) => (
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
