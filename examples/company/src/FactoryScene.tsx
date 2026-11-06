// Everything in the world that is not a room: the people and agents moving
// through it, the work line, the infrastructure, the audit layers and the
// calls overhead. One component so a host passes the factory's state (live,
// or a replayed moment), which layers are on, and the world's mode.
//
// Selection is the shared SELECTION store (worldState.ts): figures, tanks and
// dock bays are Selectables, crates report clicks to it, and what is selected
// drives the blast radius and the floor rings.
import { useCallback, useMemo } from "react";
import { useSelection, type LayerState } from "site-world";
import { Agents } from "./Agents";
import { Blast } from "./Blast";
import { DeployFlights, FactoryHall } from "./FactoryHall";
import type { FactoryReplay, FactoryState } from "./factory/feed";
import { HISTORY_DAYS } from "./factory/history";
import { DEFAULT_LAYERS, layerOn, type LayerId } from "./factoryLayers";
import { Infra } from "./Infra";
import type { Feed } from "./liveFeed";
import { Notes } from "./Notes";
import { PLAN } from "./plan";
import { Security } from "./Security";
import { pylonHeight } from "./serviceRoom";
import { Sprawl } from "./Sprawl";
import type { PylonLook } from "./sprawlLook";
import { Traffic } from "./Traffic";
import { SELECTION } from "./worldState";

export interface FactorySceneProps {
  factory: FactoryState;
  /** A past moment from the timeline, or null for live. */
  replay?: FactoryReplay | null;
  feed: Feed;
  /** How each pylon shows sprawl, at the moment shown. */
  looks: ReadonlyMap<string, PylonLook>;
  /** Layer on/off by id (factoryLayers.ts); missing ids take their default. */
  layers?: LayerState;
  mode: "orbit" | "walk";
  reduce: boolean;
}

const isPci = (code: string) => code === "PCI";
const NOBODY: readonly [] = [];

export function FactoryScene({ factory, replay = null, feed, looks, layers = DEFAULT_LAYERS, mode, reduce }: FactorySceneProps) {
  const on = (id: LayerId) => layerOn(layers, id);
  const { selected } = useSelection(SELECTION);
  const topOf = useCallback((service: string) => pylonHeight(feed[service]?.rps ?? 0) + 0.2, [feed]);
  const blastAt = on("blast") && selected?.kind === "service" ? selected.id : null;
  const workId = selected?.kind === "work" ? selected.id : undefined;
  const slots = PLAN.slotByName;
  const source = replay ?? factory;
  const calls = useMemo(() => source.calls.filter(([a, b]) => slots[a] && slots[b]), [source.calls, slots]);
  // A replay keeps only what existed: tanks and pipes of services not built yet, and notes not yet written, are left out.
  const infra = useMemo(() => {
    if (!replay) return factory.infra;
    const has = new Set(replay.services.map((s) => s.name));
    return {
      ...replay.infra,
      databases: replay.infra.databases.filter((d) => has.has(d.owner)),
      queues: replay.infra.queues.filter((q) => has.has(q.from) && has.has(q.to)),
    };
  }, [replay, factory.infra]);
  const notes = useMemo(() => {
    if (!replay) return factory.notes;
    const has = new Set(replay.services.map((s) => s.name));
    const ago = HISTORY_DAYS - replay.t;
    return factory.notes.filter((n) => has.has(n.service) && n.writtenDaysAgo >= ago);
  }, [replay, factory.notes]);
  const select = mode === "orbit" ? SELECTION.select : undefined;
  return (
    <>
      <FactoryHall
        pipeline={factory.pipeline}
        showItems={on("pipeline")}
        replayCaption={replay ? `day ${Math.floor(replay.t)} of ${HISTORY_DAYS} · the line is live only` : undefined}
        selectedId={workId}
        onSelect={select}
        reduce={reduce}
      />
      {on("traffic") && <Traffic calls={calls} slots={slots} feed={feed} />}
      {on("pipeline") && !replay && <DeployFlights deploys={factory.deploysNow} slots={slots} topOf={topOf} reduce={reduce} />}
      <Infra infra={infra} services={source.services} showInfra={on("infra")} showCost={on("cost")} mode={mode} reduce={reduce} />
      <Sprawl looks={looks} showAge={on("age")} showFindings={on("ownership")} reduce={reduce} />
      {on("infra") && <Security restrictedDoors={isPci} />}
      {on("notes") && <Notes notes={notes} reduce={reduce} />}
      {on("agents") && (
        <Agents
          agents={source.agents}
          // People are not in the history; a replay shows the agents' day only.
          humans={replay ? NOBODY : factory.humans}
          showKeys={on("infra")}
          selected={selected}
          mode={mode}
          reduce={reduce}
        />
      )}
      {blastAt && slots[blastAt] && <Blast service={blastAt} calls={calls} slots={slots} />}
    </>
  );
}
