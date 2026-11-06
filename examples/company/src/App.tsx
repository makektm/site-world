// A company's software factory, as a building: one room per domain laid out
// from the service catalogue, a pylon per service, live dashboards, the calls
// between services running overhead, a hall for the work line and a dock for
// what the company buys in. See factory/ for the data, plan.ts for how it
// becomes a floor plan, and FactoryScene.tsx for everything that moves
// through it (agents, people, work, deploys) and the audit layers over it.
//
// This file is the host's half of the interactions: what is selected and the
// panel about it, which layers are on, where the camera is asked to go (go-to,
// follow, the tour), and which moment the timeline shows. Keys: / or Ctrl+K
// to go to, 1-9 for layers (Shift solos), arrows and Esc in a tour; in walk
// mode E inspects what the crosshair is on unless the terminal is in reach.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FloorSolid, GoToPalette, GridFloor, InspectPanel, LayerBar, PointProximity, SelectionCrosshair, SiteWorld, TimelineScrubber,
  TourCaption, WallBoxes, WallSolids, goalFor, selectionPrompt, useFollow, useLayers, useSelection, useTimeline, useTour,
  type CameraGoal, type GoToTarget, type GoalOptions, type InspectAction, type Point3, type SelectionRef, type TimelineEvent,
  type TimelineSpeed,
} from "site-world";
import { CALLS, SERVICES } from "./factory/catalog";
import { replayTick, useFactory, useFactoryAt } from "./factory/feed";
import { HISTORY, HISTORY_DAYS } from "./factory/history";
import { DATABASES } from "./factory/infra";
import { sprawlReport } from "./factory/sprawl";
import { HALL_SOLIDS, STATION_AT } from "./FactoryHall";
import { LAYERS } from "./factoryLayers";
import { FactoryScene } from "./FactoryScene";
import { infraSolids } from "./Infra";
import { inspectFor, workIdOf, type InspectSource } from "./inspect";
import { useFeed } from "./liveFeed";
import { oncallRoom } from "./oncallRoom";
import { CAMERA, ONCALL_PLINTH, PLAN, YARD, boardSpot } from "./plan";
import { serviceRoom } from "./serviceRoom";
import { looksAt, pylonLooks } from "./sprawlLook";
import { FOLLOW, goToTargets, pickStuckAgent, splitTargetId } from "./targets";
import { AGENT_STOP, CHECKOUT_TOUR, TOUR_TITLE } from "./tour";
import { Wings } from "./Wings";
import { SELECTION, bodyPoint, setView, type Replay } from "./worldState";

// The catalogue's sprawl, as each pylon shows it. Static: it changes when the
// catalogue does, not per tick.
const LOOKS = pylonLooks(SERVICES, sprawlReport(SERVICES, CALLS));

// A module constant: rooms' hooks run in this order on every render.
const ROOMS = [
  ...PLAN.rooms.map((room) =>
    serviceRoom({ room, slots: room.services.map((name) => PLAN.slotByName[name]!), board: boardSpot(room), looks: LOOKS }),
  ),
  oncallRoom,
];

const EXTRA_SOLIDS = [...HALL_SOLIDS, ...infraSolids(DATABASES)];

// The timeline is the factory's history: HISTORY_DAYS of it, ending now.
const DAY_MS = 86_400_000;
const END = Date.now();
const START = END - HISTORY_DAYS * DAY_MS;
const SPEEDS: readonly TimelineSpeed[] = [
  { value: 3_600, label: "1h/s" },
  { value: 86_400, label: "1d/s" },
  { value: 7 * 86_400, label: "1w/s" },
];
// Deploys and sessions are thousands a season; the markers worth a glance are
// the services appearing and the incidents.
const EVENTS: TimelineEvent[] = HISTORY.filter((e) => e.kind === "service-created" || e.kind === "incident").map((e, i) => ({
  id: `${e.kind}:${e.service ?? i}:${e.t}`,
  t: START + e.t * DAY_MS,
  label: e.text,
  tone: e.kind === "incident" ? "critical" : "info",
}));
const eventService = (id: string) => id.split(":")[1];

function formatWhen(t: number): string {
  const ago = (END - t) / DAY_MS;
  return ago < 0.01 ? "now" : `${ago.toFixed(ago < 10 ? 1 : 0)} days ago`;
}

// How close the camera comes, by what it is looking at.
const FRAME: Record<string, GoalOptions> = {
  room: { distance: 14, elevation: 0.95 },
  service: { distance: 8, lift: 0.4 },
  db: { distance: 6 },
  external: { distance: 7 },
  agent: { distance: 6 },
  person: { distance: 6 },
  work: { distance: 7 },
  stage: { distance: 9 },
};

const PANEL_ACCENT: Record<string, string> = {
  ok: "var(--sw-kit-ok)",
  info: "var(--sw-kit-info)",
  warn: "var(--sw-kit-warn)",
  critical: "var(--sw-kit-critical)",
  dim: "var(--sw-kit-dim)",
};

export function App() {
  const [mode, setMode] = useState<"orbit" | "walk">("orbit");
  const cameraRef = useRef({ x: CAMERA.home[0], z: CAMERA.home[2] });
  const factory = useFactory();
  const feed = useFeed();
  const sel = useSelection(SELECTION);

  // Layers, shared with the rooms through the view store.
  const layers = useLayers(LAYERS);
  useEffect(() => setView({ layers: layers.on }), [layers.on]);

  // The timeline: live, or a replayed moment the rooms and the scene both show.
  const tl = useTimeline({ start: START, end: END, speed: 86_400 });
  const day = HISTORY_DAYS - (END - tl.t) / DAY_MS;
  const past = useFactoryAt(tl.live ? HISTORY_DAYS : day);
  const replay = tl.live ? null : past;
  const replayView = useMemo<Replay | null>(
    () =>
      replay && {
        t: replay.t,
        tick: replayTick(replay.t),
        present: new Set(replay.services.map((s) => s.name)),
        looks: looksAt(replay.services, replay.sprawl, HISTORY_DAYS - replay.t),
      },
    [replay],
  );
  useEffect(() => setView({ replay: replayView }), [replayView]);

  // What the panel, the palette and the tour read: now, or the moment replayed.
  const source = useMemo<InspectSource>(
    () =>
      replay
        ? { ...factory, services: replay.services, calls: replay.calls, agents: replay.agents, humans: [], infra: replay.infra, sprawl: replay.sprawl, daysAgo: HISTORY_DAYS - replay.t }
        : factory,
    [factory, replay],
  );
  const targets = useMemo(() => goToTargets(source), [source]);

  // Camera: the tour wins over a follow, which wins over the last go-to;
  // with none of them the camera flies home.
  const [goal, setGoal] = useState<CameraGoal | null>(null);
  const [following, setFollowing] = useState<string | null>(null);
  const cameraFrom = (): Point3 => [cameraRef.current.x, 0, cameraRef.current.z];
  const tour = useTour(CHECKOUT_TOUR, { from: cameraFrom });
  const [tourAgent, setTourAgent] = useState<string | null>(null);
  useEffect(() => {
    const stop = tour.stop;
    if (!stop) {
      setTourAgent(null);
      return;
    }
    if (stop.id === AGENT_STOP) {
      // Chosen when the tour gets here, from who is stuck right now.
      const id = pickStuckAgent(factory.agents);
      setTourAgent(id);
      SELECTION.select({ kind: "agent", id });
      return;
    }
    setTourAgent(null);
    if (stop.select) SELECTION.select(stop.select);
    // Only on arriving at a stop: the factory ticking must not re-pick the agent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.stop]);
  const followKey = tour.active ? (tourAgent ? `agent:${tourAgent}` : null) : following;
  const followGoal = useFollow(() => (followKey ? bodyPoint(followKey) : null), followKey !== null, {
    ...FRAME.agent,
    from: cameraFrom(),
  });
  const hostGoal = tour.goal ?? followGoal ?? goal;

  const orbit = () => {
    if (mode !== "orbit") setMode("orbit");
  };
  const flyTo = useCallback((ref: SelectionRef, pos?: Point3) => {
    const p = pos ?? bodyPoint(`${ref.kind}:${ref.id}`) ?? targets.find((t) => t.id === `${ref.kind}:${ref.id}`)?.pos
      ?? (ref.kind === "work" ? stationPoint(source.pipeline.items.find((i) => i.id === workIdOf(ref.id))?.stage ?? "deploy") : null)
      ?? (ref.kind === "stage" ? stationPoint(ref.id) : null);
    if (!p) return;
    setFollowing(null);
    setGoal(goalFor(p, { from: cameraFrom(), ...FRAME[ref.kind] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, source]);
  const follow = (key: string | null) => {
    orbit();
    tour.end();
    setFollowing(key);
  };

  const onGo = (t: GoToTarget) => {
    const ref = splitTargetId(t.id);
    orbit();
    tour.end();
    if (ref.kind === FOLLOW) {
      setFollowing(`agent:${ref.id}`);
      SELECTION.select({ kind: "agent", id: ref.id });
      return;
    }
    if (ref.kind !== "room") SELECTION.select(ref);
    flyTo(ref, ref.kind === "agent" || ref.kind === "person" ? undefined : t.pos);
  };

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);

  // The panel: the selection, read against the moment shown.
  const view = sel.selected ? inspectFor(sel.selected, source, feed) : null;
  const actions: InspectAction[] = [];
  if (sel.selected && view) {
    const ref = sel.selected;
    const key = `${ref.kind}:${ref.id}`;
    actions.push({ label: "go to", onClick: () => { orbit(); tour.end(); flyTo(ref); } });
    if (ref.kind === "agent" || ref.kind === "person") {
      actions.push(following === key ? { label: "stop following", onClick: () => follow(null) } : { label: "follow", onClick: () => follow(key) });
    }
    if (ref.kind === "service") {
      actions.push({ label: layers.isOn("blast") ? "blast radius: on" : "show blast radius", disabled: layers.isOn("blast"), onClick: () => layers.set("blast", true) });
      actions.push({ label: "runbook", onClick: () => console.info("open", `/runbooks/${ref.id}`) });
    }
  }

  // Walk mode: E is the on-call terminal's when it is in reach, the crosshair's otherwise.
  const [nearPlinth, setNearPlinth] = useState(false);
  const labelOf = (ref: SelectionRef) => (ref.kind === "agent" || ref.kind === "service" || ref.kind === "db" || ref.kind === "external" ? ref.id : ref.kind);
  const hostPrompt = mode === "walk" && !nearPlinth ? selectionPrompt(sel, labelOf) : null;

  const switchMode = (m: "orbit" | "walk") => {
    if (m === "walk") {
      tour.end();
      setFollowing(null);
    }
    setMode(m);
  };

  const solids = useMemo(
    () => (
      <>
        <FloorSolid {...YARD} />
        <WallSolids walls={PLAN.walls} />
        <WallSolids walls={EXTRA_SOLIDS} />
      </>
    ),
    [],
  );
  return (
    <>
      <div className="bar">
        {(["orbit", "walk"] as const).map((m) => (
          <button key={m} aria-pressed={mode === m} onClick={() => switchMode(m)}>{m}</button>
        ))}
        <button onClick={() => setPaletteOpen(true)} title="/ or Ctrl+K">go to…</button>
        <button aria-pressed={layersOpen} onClick={() => setLayersOpen((o) => !o)} title="keys 1–9">layers</button>
        <button
          aria-pressed={tour.active}
          onClick={() => {
            if (tour.active) return tour.end();
            orbit();
            setFollowing(null);
            tour.start();
          }}
        >
          tour: {TOUR_TITLE}
        </button>
        <button
          onClick={() => {
            tour.end();
            setFollowing(null);
            setGoal(null);
          }}
        >
          home
        </button>
      </div>
      <div className="stage">
        <SiteWorld
          mode={mode}
          reduce={false}
          camera={CAMERA}
          rooms={ROOMS}
          doors={PLAN.doors}
          doorSigns={PLAN.doorSigns}
          solids={solids}
          cameraRef={cameraRef}
          hostGoal={hostGoal}
          hostPrompt={hostPrompt}
          onOpenPage={(to) => console.info("open", to)}
          walkHint="click to lock the cursor · WASD · shift to crouch · E to use or inspect · / to go to · 1–9 layers · Esc to release"
          overlay={
            <>
              {/* Folded away until asked for; it stays mounted so keys 1–9 work either way. */}
              <LayerBar layers={layers} style={{ top: 44, display: layersOpen ? undefined : "none" }} />
              <InspectPanel
                open={view !== null}
                title={view?.title ?? ""}
                kind={view?.kind}
                subtitle={view?.subtitle}
                accent={view ? PANEL_ACCENT[view.tone] : undefined}
                fields={view?.fields}
                sections={view?.sections}
                actions={actions}
                onClose={sel.clear}
                // In a tour, Esc ends the tour and leaves its selection up.
                closeOnEscape={!tour.active}
                // Clear of the page's button bar.
                style={{ top: 44 }}
              />
              <GoToPalette open={paletteOpen} onOpenChange={setPaletteOpen} targets={targets} onGo={onGo} placeholder="go to a service, room, agent, database…" />
              <TourCaption tour={tour} />
              {mode === "orbit" && (
                <TimelineScrubber
                  timeline={tl}
                  events={EVENTS}
                  speeds={SPEEDS}
                  format={formatWhen}
                  onEvent={(e) => {
                    const name = eventService(e.id);
                    if (name && PLAN.slotByName[name]) {
                      SELECTION.select({ kind: "service", id: name });
                      flyTo({ kind: "service", id: name });
                    }
                  }}
                />
              )}
            </>
          }
        >
          <GridFloor {...YARD} />
          <WallBoxes walls={PLAN.walls} />
          <Wings wings={PLAN.wings} />
          <FactoryScene
            factory={factory}
            replay={replay}
            feed={feed}
            looks={replayView?.looks ?? LOOKS}
            layers={layers.on}
            mode={mode}
            reduce={false}
          />
          <SelectionCrosshair store={SELECTION} enabled={mode === "walk"} useKey={!nearPlinth} />
          <PointProximity enabled={mode === "walk"} point={ONCALL_PLINTH} onNear={setNearPlinth} />
        </SiteWorld>
      </div>
    </>
  );
}

function stationPoint(id: string): Point3 | null {
  const p = STATION_AT[id];
  return p ? [p[0], 1, p[1]] : null;
}
