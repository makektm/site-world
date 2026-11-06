// Who is in the building: every agent session as a drone at the service it is
// changing, walking the aisles to the next one, stopped with a badge when it
// waits on something; and the three people, standing in the room they are in.
//
// Agents carry their launcher's colour on their tag edge, so "whose agents
// are these" reads at a glance; a key floats over any session holding a secret.
//
// Every figure is a Selectable. The figures move, and a Selectable's box is
// measured from what it wraps — an agent's beam to its pylon would stretch
// the brackets across the room — so each one carries an invisible hit box
// that rides the body instead, and that box is what gets picked.
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Object3D } from "three";
import {
  AGENT_WALK_SPEED, AgentFigure, KeyBadge, PresenceMarker, Selectable, pathLength, useCrowdLayout,
  type AgentBadge, type PathPoint, type Point3,
} from "site-world";
import type { AgentState, HumanState, Room } from "./factory/agents";
import { TICK_SECONDS } from "./factory/agents";
import { grantsFor } from "./factory/infra";
import { PLAN } from "./plan";
import { roomSpot, routeBetween, workSpot } from "./routes";
import { useLod } from "./useLod";
import { SELECTION, registerBody } from "./worldState";

/** Each person's colour: their marker, and the tag edge of every agent they launched. */
export const PERSON_COLOR: Record<string, string> = {
  "@maria": "#ffb86b",
  "@jonas": "#7fe0c4",
  "@priya": "#f78fb3",
};

// A walk lasts two ticks of data; the figure must arrive before the next
// state lands, or it would cut the last corner straight through a wall.
const WALK_SECONDS = 2 * TICK_SECONDS * 0.85;
const HUMAN_SPEED = 2.2; // m/s: brisker than an agent, and only between rooms

/** A blocked agent waiting on a person asks; one waiting on a machine (CI, a grant) waits. */
export function badgeFor(blockedOn: string | null): AgentBadge | null {
  if (!blockedOn) return null;
  return /@\w+/.test(blockedOn) && !/grant/i.test(blockedOn) ? "?" : "hourglass";
}

function sublabelOf(a: AgentState): string {
  if (a.paused) return "paused from on-call";
  switch (a.state) {
    case "working":
      return `on ${a.service}`;
    case "walking":
      return `→ ${a.to}`;
    case "blocked":
      return a.blockedOn ?? "blocked";
    case "done":
      return "PR opened";
    default:
      return "idle";
  }
}

/** Keeps a group on another object's position: a key badge riding a moving drone. */
function Follow({ target, children }: { target: RefObject<Object3D | null>; children: ReactNode }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    const t = target.current;
    if (t && group.current) group.current.position.copy(t.position);
  });
  return <group ref={group}>{children}</group>;
}

/** The pickable part of a moving figure: a box nobody sees, riding its body. */
function Pick({ target, kind, id, size, mode, reduce, color }: {
  target: RefObject<Object3D | null>;
  kind: string;
  id: string;
  size: Point3;
  mode: "orbit" | "walk";
  reduce: boolean;
  color?: string;
}) {
  const center: Point3 = [0, size[1] / 2, 0];
  useEffect(() => {
    const body = target.current;
    return body ? registerBody(`${kind}:${id}`, body) : undefined;
  }, [target, kind, id]);
  return (
    <Follow target={target}>
      <Selectable store={SELECTION} kind={kind} id={id} mode={mode} reduce={reduce} color={color} bounds={{ center, size }} padding={0.05}>
        <mesh position={center}>
          <boxGeometry args={[size[0], size[1], size[2]]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      </Selectable>
    </Follow>
  );
}

const AGENT_BOX: Point3 = [0.9, 1.5, 0.9];
const PERSON_BOX: Point3 = [0.8, 1.9, 0.8];

function Agent({ agent, spot, lift, showKeys, selected, mode, reduce }: {
  agent: AgentState;
  spot: PathPoint;
  lift: number;
  showKeys: boolean;
  selected: boolean;
  mode: "orbit" | "walk";
  reduce: boolean;
}) {
  const body = useRef<Group>(null);
  const here = PLAN.slotByName[agent.service]!;
  const lod = useLod(PLAN.roomById[here.room]!.rect);
  const walking = agent.state === "walking" && agent.to !== null && PLAN.slotByName[agent.to] !== undefined;
  const dest = walking ? PLAN.slotByName[agent.to!]! : here;
  const path = useMemo(
    () => (walking ? routeBetween(PLAN, PLAN.doors, workSpot(here), here.room, workSpot(dest), dest.room) : undefined),
    [walking, here, dest],
  );
  const speed = path ? Math.max(AGENT_WALK_SPEED, pathLength(path) / WALK_SECONDS) : AGENT_WALK_SPEED;
  const keys = showKeys ? grantsFor(agent.id) : [];
  const blocked = agent.state === "blocked";
  // From the orbit home only the stuck ones speak up; close in, everyone does.
  const hideLabel = lod === "campus" || (lod === "room" && !blocked && !selected);
  return (
    <>
      <AgentFigure
        label={agent.name}
        sublabel={sublabelOf(agent)}
        state={agent.state}
        position={spot}
        path={path}
        speed={speed}
        target={walking ? undefined : [here.pos[0], 1.3, here.pos[1]]}
        color={PERSON_COLOR[agent.launchedBy]}
        badge={badgeFor(agent.blockedOn)}
        trail={!reduce && lod !== "campus"}
        selected={selected}
        hideLabel={hideLabel}
        labelLift={lift}
        bodyRef={body}
        reduce={reduce}
      />
      <Pick target={body} kind="agent" id={agent.id} size={AGENT_BOX} mode={mode} reduce={reduce} color={PERSON_COLOR[agent.launchedBy]} />
      {keys.length > 0 && (
        <Follow target={body}>
          {/* At the drone's side, below its tag: the key's own plate only when selected, or the two print over each other. */}
          <KeyBadge
            position={[0.42, 0.9, 0]}
            size={0.17}
            label={selected ? keys.map((k) => k.key).join(" · ") : undefined}
            reduce={reduce}
          />
        </Follow>
      )}
    </>
  );
}

const roomOf = (room: Room): string => (room === "oncall" ? "edge" : room);

/** Feeds a glide target one waypoint at a time, so a person changing rooms
 * goes round by the doors instead of through the walls. */
function useWaypoints(points: readonly PathPoint[], speed: number, reduce: boolean): PathPoint {
  const [i, setI] = useState(points.length - 1);
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (reduce || points.length < 2) {
      setI(points.length - 1);
      return;
    }
    setI(1);
    let k = 1;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (k >= points.length - 1) return;
      const [a, b] = [points[k]!, points[k + 1]!];
      timer = setTimeout(() => {
        k += 1;
        setI(k);
        next();
      }, (Math.hypot(b[0] - a[0], b[1] - a[1]) / speed) * 1000);
    };
    const [a, b] = [points[0]!, points[1]!];
    timer = setTimeout(next, (Math.hypot(b[0] - a[0], b[1] - a[1]) / speed) * 1000);
    return () => clearTimeout(timer);
    // `key` stands for the points' values: a new array of the same points must not restart the walk.
  }, [key, speed, reduce]);
  return points[Math.min(i, points.length - 1)] ?? points[points.length - 1]!;
}

function Person({ human, spot, selected, mode, reduce }: {
  human: HumanState;
  spot: PathPoint;
  selected: boolean;
  mode: "orbit" | "walk";
  reduce: boolean;
}) {
  const body = useRef<Group>(null);
  const room = roomOf(human.room);
  // Where they last stood, updated after commit so a render that runs twice
  // reads the same starting point both times.
  const last = useRef<{ room: string; spot: PathPoint }>({ room, spot });
  const route = useMemo(() => {
    const from = last.current;
    return from.room === room ? [spot] : routeBetween(PLAN, PLAN.doors, from.spot, from.room, spot, room);
  }, [room, spot]);
  useEffect(() => {
    last.current = { room, spot };
  }, [room, spot]);
  const at = useWaypoints(route, HUMAN_SPEED, reduce);
  const lod = useLod(PLAN.roomById[room]!.rect);
  const color = PERSON_COLOR[human.handle] ?? "#ffffff";
  return (
    <>
      <PresenceMarker
        name={human.name}
        sub={human.room === "oncall" ? `${human.handle} · on call` : human.handle}
        color={color}
        position={at}
        selected={selected}
        hideLabel={lod === "campus"}
        bodyRef={body}
        reduce={reduce}
      />
      <Pick target={body} kind="person" id={human.id} size={PERSON_BOX} mode={mode} reduce={reduce} color={color} />
    </>
  );
}

export interface AgentsProps {
  agents: readonly AgentState[];
  humans: readonly HumanState[];
  /** Keys over agents that hold secrets (the secrets layer). */
  showKeys: boolean;
  /** What is selected, to ring it on the floor (the brackets are the Selectable's). */
  selected?: { kind: string; id: string } | null;
  mode: "orbit" | "walk";
  reduce: boolean;
}

export function Agents({ agents, humans, showKeys, selected, mode, reduce }: AgentsProps) {
  // A replayed day can name a service the plan does not have; skip, do not crash.
  const present = agents.filter((a) => PLAN.slotByName[a.service]);
  const spots = useCrowdLayout(
    present.map((a) => ({ id: a.id, at: workSpot(PLAN.slotByName[a.service]!) })),
    { spacing: 0.9 },
  );
  const people = useCrowdLayout(humans.map((h) => ({ id: h.id, at: roomSpot(PLAN.roomById[roomOf(h.room)]!) })), { spacing: 1.1 });
  // Tags of figures sharing a spot step up so they do not print over each other.
  const lifts = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const a of present) {
    const k = a.service;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    lifts.set(a.id, 0.32 * (n % 3));
  }
  const isSel = (kind: string, id: string) => selected?.kind === kind && selected.id === id;
  return (
    <>
      {present.map((a) => (
        <Agent
          key={a.id}
          agent={a}
          spot={spots.get(a.id)!}
          lift={lifts.get(a.id) ?? 0}
          showKeys={showKeys}
          selected={isSel("agent", a.id)}
          mode={mode}
          reduce={reduce}
        />
      ))}
      {humans.map((h) => (
        <Person key={h.id} human={h} spot={people.get(h.id)!} selected={isSel("person", h.id)} mode={mode} reduce={reduce} />
      ))}
    </>
  );
}
