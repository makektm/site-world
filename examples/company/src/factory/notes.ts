// Sticky notes left in the world, by people and by agents.
//
// A note is pinned to a service (it floats by that pylon) or to a wall of the
// room that holds the service; the host resolves either to a position with its
// own layout, so notes survive the building being re-laid out as it grows.
export type NoteWall = "north" | "south" | "east" | "west";

export interface StickyNote {
  id: string;
  author: { kind: "human" | "agent"; name: string };
  text: string;
  service: string;
  /** Set to pin it on that wall of the service's room instead of beside the pylon. */
  wall?: NoteWall;
  /** Days ago it was written. */
  writtenDaysAgo: number;
  tone: "info" | "warn";
}

export const NOTES: readonly StickyNote[] = [
  { id: "n1", author: { kind: "human", name: "@maria" }, text: "notify-svc duplicates notifications. Merge before anyone builds on it.", service: "notify-svc", writtenDaysAgo: 31, tone: "warn" },
  { id: "n2", author: { kind: "agent", name: "agent-a19" }, text: "invoice-generator is the v2 of invoice-gen; cutover pending review.", service: "invoice-generator", writtenDaysAgo: 2, tone: "info" },
  { id: "n3", author: { kind: "human", name: "@jonas" }, text: "Who owns report-builder? Nothing calls it and it burns ~$90/day, half of it tokens.", service: "report-builder", wall: "north", writtenDaysAgo: 1, tone: "warn" },
  { id: "n4", author: { kind: "human", name: "@priya" }, text: "Do not let agents touch payments config during the incident.", service: "payments", wall: "east", writtenDaysAgo: 0, tone: "warn" },
  { id: "n5", author: { kind: "agent", name: "agent-2c8" }, text: "events table at 86%: partition PR is waiting for approval.", service: "event-ingest", writtenDaysAgo: 0, tone: "info" },
  { id: "n6", author: { kind: "human", name: "@maria" }, text: "Review queue is the bottleneck. Small PRs please.", service: "api-gateway", wall: "south", writtenDaysAgo: 5, tone: "info" },
];

export function notesFor(service: string): StickyNote[] {
  return NOTES.filter((n) => n.service === service);
}
