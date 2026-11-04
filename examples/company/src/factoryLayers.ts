// The world's layers: what each one draws, and whether it is on at first.
// The scene takes a plain on/off record, so a LayerBar (useLayers(LAYERS))
// or a fixed set both drive it.
import { CRITICAL, INFO, OK, PAPER, PAPER_DIM, WARN, initialLayers, type LayerDef, type LayerState } from "site-world";

export const LAYERS: readonly LayerDef[] = [
  { id: "agents", label: "agents", question: "Who is changing what, and who is stuck?", color: INFO, defaultOn: true },
  { id: "traffic", label: "traffic", question: "Who calls whom, and what ships where?", color: PAPER, defaultOn: true },
  { id: "infra", label: "infra", question: "What do services lean on: databases, queues, third parties?", color: OK, defaultOn: true },
  { id: "sprawl", label: "sprawl", question: "What is old, duplicated, dead or unowned?", color: "#b48cff", defaultOn: true },
  { id: "security", label: "secrets", question: "What is restricted, and who holds keys?", color: WARN, defaultOn: true },
  { id: "notes", label: "notes", question: "What have people and agents written down?", color: PAPER_DIM, defaultOn: true },
  // Off at first: a heat map over the whole floor is a question, not a backdrop.
  { id: "cost", label: "cost", question: "Where does the money and the token budget go?", color: WARN },
  { id: "blast", label: "blast radius", question: "If the selected service fails, who breaks?", color: CRITICAL, defaultOn: true },
];

export type LayerId = "agents" | "traffic" | "infra" | "sprawl" | "security" | "notes" | "cost" | "blast";

export const DEFAULT_LAYERS: LayerState = initialLayers(LAYERS);

export function layerOn(state: LayerState, id: LayerId): boolean {
  return state[id] ?? DEFAULT_LAYERS[id] ?? false;
}
