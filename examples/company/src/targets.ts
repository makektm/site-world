// What the go-to palette can fly to, and where each thing is: services at
// their pylons, rooms and wings at their middles, agents and people where
// they stand now, databases at their tanks, third parties at their dock bay.
// Pure, from the plan and a factory state.
import { bayOffsets, type GoToTarget, type Point3 } from "site-world";
import type { AgentState, HumanState } from "./factory/agents";
import type { FactoryService } from "./factory/catalog";
import type { InfraState } from "./factory/infra";
import { DOCK_AT, DOCK_BAY_W, PLAN } from "./plan";
import { TANK_HEIGHT, tankSpot } from "./placement";
import { roomSpot, workSpot } from "./routes";

export interface TargetSource {
  services: readonly FactoryService[];
  agents: readonly AgentState[];
  humans: readonly HumanState[];
  infra: Pick<InfraState, "databases" | "externals">;
}

/** A palette entry that follows an agent rather than flying to it once. */
export const FOLLOW = "follow";

const at = ([x, z]: readonly [number, number], y: number): Point3 => [x, y, z];

/** Where a third party's bay stands: the dock is turned to face the building, so its bays run right to left. */
export function bayPoint(index: number, count: number): Point3 {
  const xs = bayOffsets(count, DOCK_BAY_W);
  return [DOCK_AT[0] - xs[index]!, 1.2, DOCK_AT[1]];
}

export function goToTargets(src: TargetSource): GoToTarget[] {
  const out: GoToTarget[] = [];
  for (const s of src.services) {
    const slot = PLAN.slotByName[s.name];
    if (!slot) continue;
    out.push({ id: `service:${s.name}`, label: s.name, kind: "service", pos: at(slot.pos, 1.4), detail: s.domain, keywords: [s.domain, s.owner] });
  }
  for (const r of PLAN.rooms) {
    out.push({ id: `room:${r.id}`, label: r.label, kind: "room", pos: at(r.center, 0), detail: `${r.services.length} services`, keywords: [r.id, r.sub] });
  }
  for (const w of PLAN.wings) {
    const c: [number, number] = [(w.rect.minX + w.rect.maxX) / 2, (w.rect.minZ + w.rect.maxZ) / 2];
    out.push({ id: `room:${w.id}`, label: w.label, kind: "room", pos: at(c, 0), detail: "wing", keywords: [w.id] });
  }
  for (const a of src.agents) {
    const slot = PLAN.slotByName[a.service];
    if (!slot) continue;
    const pos = at(workSpot(slot), 1.0);
    const detail = a.paused ? "paused" : a.blockedOn ? `blocked: ${a.blockedOn}` : `${a.state} · ${a.service}`;
    out.push({ id: `agent:${a.id}`, label: a.name, kind: "agent", pos, detail, keywords: [a.launchedBy, a.task, a.service] });
    out.push({ id: `${FOLLOW}:${a.id}`, label: `follow ${a.name}`, kind: FOLLOW, pos, detail: "keep the camera on it", keywords: [a.launchedBy] });
  }
  for (const h of src.humans) {
    const room = PLAN.roomById[h.room === "oncall" ? "edge" : h.room];
    if (!room) continue;
    out.push({ id: `person:${h.id}`, label: h.name, kind: "person", pos: at(roomSpot(room), 1.2), detail: `${h.handle} · ${h.role}`, keywords: [h.handle] });
  }
  for (const d of src.infra.databases) {
    const slot = PLAN.slotByName[d.owner];
    if (!slot) continue;
    out.push({ id: `db:${d.name}`, label: d.name, kind: "db", pos: at(tankSpot(slot), TANK_HEIGHT / 2), detail: `${d.kind} · ${d.owner}`, keywords: [d.owner, d.kind] });
  }
  src.infra.externals.forEach((e, i) => {
    out.push({ id: `external:${e.name}`, label: e.name, kind: "external", pos: bayPoint(i, src.infra.externals.length), detail: `third party · ${e.kind}`, keywords: [e.kind, ...e.usedBy] });
  });
  return out;
}

/** "kind:id" back into its parts; the id may itself hold colons. */
export function splitTargetId(id: string): { kind: string; id: string } {
  const k = id.indexOf(":");
  return { kind: id.slice(0, k), id: id.slice(k + 1) };
}

/**
 * The agent a "why is it slow" tour ends on: one stuck right now, preferring
 * one stuck on a person over one stuck on a machine, and one whose work
 * touches the checkout path. Falls back to the checkout fixer.
 */
export function pickStuckAgent(agents: readonly AgentState[], path: readonly string[] = ["orders", "payments"]): string {
  const touches = (a: AgentState) => a.route.some((s) => path.includes(s));
  const score = (a: AgentState) => (a.state === "blocked" ? 4 : 0) + (a.blockedOn?.includes("@") ? 2 : 0) + (touches(a) ? 1 : 0);
  const best = [...agents].filter((a) => !a.paused).sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0];
  return best && score(best) >= 4 ? best.id : "agent-e02";
}
