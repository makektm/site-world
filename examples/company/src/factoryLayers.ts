// The world's layers: what each one draws, and whether it is on at first.
// The scene takes a plain on/off record, so a LayerBar (useLayers(LAYERS))
// or a fixed set both drive it. The order is the LayerBar's, and so the
// digit keys': nine layers, one per key.
import { CRITICAL, INFO, OK, PAPER, PAPER_DIM, WARN, initialLayers, type LayerDef, type LayerState } from "site-world";

export const LAYERS: readonly LayerDef[] = [
  { id: "traffic", label: "traffic", question: "Who calls whom, and what ships where?", color: PAPER, defaultOn: true },
  { id: "agents", label: "agents", question: "Who is changing what, and who is stuck?", color: INFO, defaultOn: true },
  { id: "pipeline", label: "pipeline", question: "How does work flow from ticket to deploy, and where does it pile up?", color: OK, defaultOn: true },
  // Off at first: a heat map over the whole floor is a question, not a backdrop.
  { id: "cost", label: "cost", question: "Where does the money and the token budget go?", color: WARN },
  { id: "ownership", label: "ownership", question: "Who made each service, who owns it, and what is orphaned or duplicated?", color: "#b48cff", defaultOn: true },
  { id: "age", label: "age", question: "How old is each service? One ring per 120 days.", color: PAPER_DIM, defaultOn: true },
  { id: "blast", label: "blast radius", question: "If the selected service fails, who breaks?", color: CRITICAL, defaultOn: true },
  { id: "notes", label: "notes", question: "What have people and agents written down?", color: PAPER_DIM, defaultOn: true },
  { id: "infra", label: "infra", question: "What do services lean on — databases, queues, third parties — and who holds keys?", color: OK, defaultOn: true },
];

export type LayerId = "traffic" | "agents" | "pipeline" | "cost" | "ownership" | "age" | "blast" | "notes" | "infra";

export const DEFAULT_LAYERS: LayerState = initialLayers(LAYERS);

export function layerOn(state: LayerState, id: LayerId): boolean {
  return state[id] ?? DEFAULT_LAYERS[id] ?? false;
}
