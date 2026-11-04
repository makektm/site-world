// What a site-world room is. One room is one module that exports a SiteRoom and is
// listed once in the host's room list; the orchestrator (SiteWorld) knows no
// room by name. Adding a room is a file and a list entry; removing one is the
// reverse.
//
// A room is four things, because site-world is two React trees — the three.js canvas
// and the DOM beside it — that cannot share hooks:
//   useModel  runs in the orchestrator (DOM tree): feeds, derived state.
//   Scene     draws inside the canvas, from the model.
//   Overlay   draws DOM beside the canvas (the terminal screens), from the model.
//   Colliders invisible solids for the walk-mode octree (a plinth).
// plus the terminals it owns, which the orchestrator powers through one slot
// (terminals.ts).
import type { ReactNode } from "react";
import type { TerminalDef, Terminals } from "./terminals";

/** What every room receives: the mode, `reduce`, the terminal slot, and `onOpenPage`. */
export interface RoomEnv {
  mode: "orbit" | "walk";
  reduce: boolean;
  terminals: Terminals;
  /** Open a page of the 2D application from a terminal. A method, not a
   * property, so the host's narrower page type (a union of route literals)
   * is accepted: the engine names no route. */
  onOpenPage(to: string): void;
}

/** One room: its data (`useModel`), 3D (`Scene`), DOM screen (`Overlay`), walk solids and prompt. */
export interface SiteRoom<M = unknown> {
  id: string;
  terminals?: readonly TerminalDef[];
  useModel: (env: RoomEnv) => M;
  Scene: (props: { model: M; env: RoomEnv }) => ReactNode;
  Overlay?: (props: { model: M; env: RoomEnv }) => ReactNode;
  Colliders?: () => ReactNode;
  /** The walker's "[E]" prompt while facing one of this room's terminals. */
  prompt?: (model: M, env: RoomEnv) => string | null;
}

/** Types a room's model once, then forgets it so rooms of different models
 * share one list. */
export function defineRoom<M>(room: SiteRoom<M>): SiteRoom<any> {
  return room as SiteRoom;
}

/** Each room's model, in list order. The list is a module constant, so the
 * hooks run in the same order on every render — the rule a loop of hooks
 * must keep. Do not call this with a list that changes. */
export function useRoomModels(rooms: readonly SiteRoom[], env: RoomEnv): unknown[] {
  return rooms.map((room) => room.useModel(env));
}
