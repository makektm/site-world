// Everything in the world that is not a room: the people and agents moving
// through it, the work line, the infrastructure, the audit layers and the
// calls overhead. One component so a host passes the factory's state, which
// layers are on and what is selected, and nothing else.
//
// Selection is the host's: `selected` says what to highlight (an agent, a
// crate, a service for the blast radius) and `onSelect` is called on clicks,
// which only happen when it is set — leave it out in walk mode.
import { useCallback, useMemo } from "react";
import type { LayerState, SelectionRef } from "site-world";
import { Agents } from "./Agents";
import { Blast } from "./Blast";
import { DeployFlights, FactoryHall } from "./FactoryHall";
import type { FactoryState } from "./factory/feed";
import { DEFAULT_LAYERS, layerOn } from "./factoryLayers";
import { Infra } from "./Infra";
import type { Feed } from "./liveFeed";
import { Notes } from "./Notes";
import { PLAN } from "./plan";
import { Security } from "./Security";
import { pylonHeight } from "./serviceRoom";
import { Sprawl } from "./Sprawl";
import type { PylonLook } from "./sprawlLook";
import { Traffic } from "./Traffic";

export interface FactorySceneProps {
  factory: FactoryState;
  feed: Feed;
  /** How each pylon shows sprawl; the same map the rooms were built with. */
  looks: ReadonlyMap<string, PylonLook>;
  /** Layer on/off by id (factoryLayers.ts); missing ids take their default. */
  layers?: LayerState;
  selected?: SelectionRef | null;
  onSelect?: (ref: SelectionRef) => void;
  reduce: boolean;
}

const isPci = (code: string) => code === "PCI";

export function FactoryScene({ factory, feed, looks, layers = DEFAULT_LAYERS, selected = null, onSelect, reduce }: FactorySceneProps) {
  const on = (id: Parameters<typeof layerOn>[1]) => layerOn(layers, id);
  const topOf = useCallback((service: string) => pylonHeight(feed[service]?.rps ?? 0) + 0.2, [feed]);
  const blastAt = on("blast") && selected?.kind === "service" ? selected.id : null;
  const workId = selected?.kind === "work" ? selected.id : undefined;
  const slots = PLAN.slotByName;
  const calls = useMemo(() => factory.calls.filter(([a, b]) => slots[a] && slots[b]), [factory.calls, slots]);
  return (
    <>
      <FactoryHall pipeline={factory.pipeline} selectedId={workId} onSelect={onSelect} reduce={reduce} />
      {on("traffic") && (
        <>
          <Traffic calls={calls} slots={slots} feed={feed} />
          <DeployFlights deploys={factory.deploysNow} slots={slots} topOf={topOf} reduce={reduce} />
        </>
      )}
      <Infra infra={factory.infra} services={factory.services} showInfra={on("infra")} showCost={on("cost")} reduce={reduce} />
      {on("sprawl") && <Sprawl looks={looks} reduce={reduce} />}
      {on("security") && <Security restrictedDoors={isPci} />}
      {on("notes") && <Notes notes={factory.notes} reduce={reduce} />}
      {on("agents") && (
        <Agents agents={factory.agents} humans={factory.humans} showKeys={on("security")} selected={selected} onSelect={onSelect} reduce={reduce} />
      )}
      {blastAt && <Blast service={blastAt} calls={calls} slots={slots} />}
    </>
  );
}
