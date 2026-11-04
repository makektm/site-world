// A room is one module. This one is a notes terminal: a plinth in the main room
// that powers a screen, and a screen that shows a list. It owns its data
// (useModel), its 3D (Scene), its DOM (Overlay), its walk solids (Colliders)
// and the "[E]" prompt. Copy it to make your own.
import { useState } from "react";
import {
  CONSOLE_PX_H, CONSOLE_PX_W, ConsoleRig, PointProximity, Plinth, defineRoom,
} from "site-world";

const ID = "notes";
const PLINTH: readonly [number, number] = [-3, -2.5];
const OFFSET = 0.64 / 2 + 0.14; // the screen stands this far in front of the plinth

export const notesRoom = defineRoom({
  id: ID,
  // One terminal. `stand` is where the orbit fly-in faces from.
  terminals: [{ id: ID, stand: PLINTH, flyOffset: OFFSET }],

  // Runs in the DOM tree: fetch, derive, subscribe. Return whatever Scene and
  // Overlay need.
  useModel() {
    const [notes] = useState(["Walk up to a plinth and press E.", "Doors open as you approach.", "Press the red switch to wake the demons."]);
    return { notes };
  },

  // Runs inside the canvas.
  Scene({ env }) {
    const term = env.terminals.get(ID);
    const walking = env.mode === "walk";
    return (
      <>
        <Plinth at={PLINTH} onActivate={walking ? undefined : term.onActivate} />
        <PointProximity enabled={walking} point={PLINTH} onNear={term.onNear} />
        {term.rig && (
          <ConsoleRig
            px={PLINTH[0]}
            pz={PLINTH[1]}
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

  // Runs in the DOM, beside the canvas. The div is the screen; the rig warps it
  // onto the 3D glass every frame, so it must be CONSOLE_PX_W x CONSOLE_PX_H.
  Overlay({ model, env }) {
    const term = env.terminals.get(ID);
    return (
      <div className="sw-screen" ref={term.screenRef} style={{ visibility: "hidden" }}>
        {term.rig && (
          <div
            style={{
              width: CONSOLE_PX_W, height: CONSOLE_PX_H, boxSizing: "border-box", padding: 32,
              background: "#04120a", color: "#58e892", fontFamily: "ui-monospace, monospace", fontSize: 26,
            }}
          >
            <div style={{ marginBottom: 20, color: "#9dffbe" }}>NOTES</div>
            {model.notes.map((n) => <div key={n} style={{ marginBottom: 12 }}>› {n}</div>)}
            <button onClick={term.onExit} style={{ marginTop: 24, font: "inherit", background: "none", color: "inherit", border: "1px solid", padding: "4px 14px" }}>
              exit
            </button>
          </div>
        )}
      </div>
    );
  },

  // Solid, so nobody walks through the plinth.
  Colliders: () => (
    <mesh position={[PLINTH[0], 0.525, PLINTH[1]]}>
      <boxGeometry args={[0.64, 1.05, 0.64]} />
    </mesh>
  ),

  prompt: (_model, env) => {
    const term = env.terminals.get(ID);
    return term.near && !term.on ? "NOTES" : null;
  },
});
