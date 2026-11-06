// The factory's pipeline as crates on the work line. The pipeline keeps its
// own vocabulary (stage + ok/failing/waiting); the line wants a station index
// and a crate status, and it only animates what it is shown changing — so a
// shipped item has to stay on the list, marked deployed, for the tick it
// ships, or it would just vanish from the belt instead of flying off.
import type { WorkItem as Crate, WorkStation, WorkStatus } from "site-world";
import { STAGES, type PipelineState, type WorkItem } from "./factory/pipeline";

export const STATIONS: readonly WorkStation[] = [
  { id: "ticket", label: "TICKET" },
  { id: "agent", label: "AGENT", sub: "8 sessions" },
  { id: "pr", label: "PR" },
  { id: "ci", label: "CI" },
  // Three people review everything: the pile here is the point of the room.
  { id: "review", label: "REVIEW", sub: "3 humans", warnAt: 8, critAt: 16 },
  { id: "deploy", label: "DEPLOY", sub: "train every 15s" },
];

function statusOf(item: WorkItem): WorkStatus {
  switch (item.stage) {
    case "ticket":
      return "queued";
    case "ci":
      return item.status === "failing" ? "failing" : "working";
    case "review":
      return "waiting-review";
    case "deploy":
      return "merged";
    default:
      return "working";
  }
}

/** "PR #1412" -> "#1412": the lid has room for a number, not a sentence. */
export function crateLabel(id: string): string {
  const n = /#\d+/.exec(id);
  return n ? n[0] : id;
}

/** One reject crate per time CI sent an item back, while that item is still in
 * flight: the bin holds the rework now going round again, not all history. */
export function rejectId(id: string, k: number): string {
  return `${id} ✕${k}`;
}

/**
 * The crates for a pipeline state, oldest first — the line piles items in
 * array order, so the oldest review waits nearest the gate, which is also the
 * order people review in.
 *
 * `shipTicks`: how many ticks a deployed item stays listed (as "deployed"),
 * long enough for the line to see the change and fly it off.
 */
export function workLineItems(p: PipelineState, shipTicks = 2): Crate[] {
  const live = [...p.items].sort((a, b) => b.age - a.age || a.id.localeCompare(b.id));
  const out: Crate[] = live.map((item) => ({
    id: item.id,
    stage: STAGES.indexOf(item.stage),
    status: statusOf(item),
    label: crateLabel(item.id),
  }));
  for (const item of live) {
    for (let k = 1; k <= item.rejections; k += 1) {
      out.push({ id: rejectId(item.id, k), stage: STAGES.indexOf("ci"), status: "failed", label: crateLabel(item.id) });
    }
  }
  for (const d of p.deploys) {
    if (p.tick - d.tick < shipTicks) {
      out.push({ id: d.id, stage: STAGES.indexOf("deploy"), status: "deployed", label: crateLabel(d.id) });
    }
  }
  return out;
}
