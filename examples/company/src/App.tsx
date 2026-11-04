// A company's software factory, as a building: one room per domain laid out
// from the service catalogue, a pylon per service, live dashboards, the calls
// between services running overhead, a hall for the work line and a dock for
// what the company buys in. See factory/ for the data, plan.ts for how it
// becomes a floor plan, and FactoryScene.tsx for everything that moves
// through it (agents, people, work, deploys) and the audit layers over it.
import { useMemo, useRef, useState } from "react";
import { FloorSolid, GridFloor, SiteWorld, WallBoxes, WallSolids } from "site-world";
import { CALLS, SERVICES } from "./factory/catalog";
import { useFactory } from "./factory/feed";
import { DATABASES } from "./factory/infra";
import { sprawlReport } from "./factory/sprawl";
import { HALL_SOLIDS } from "./FactoryHall";
import { FactoryScene } from "./FactoryScene";
import { infraSolids } from "./Infra";
import { useFeed } from "./liveFeed";
import { oncallRoom } from "./oncallRoom";
import { CAMERA, PLAN, YARD, boardSpot } from "./plan";
import { serviceRoom } from "./serviceRoom";
import { pylonLooks } from "./sprawlLook";
import { Wings } from "./Wings";

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

export function App() {
  const [mode, setMode] = useState<"orbit" | "walk">("orbit");
  const cameraRef = useRef({ x: CAMERA.home[0], z: CAMERA.home[2] });
  const feed = useFeed();
  const factory = useFactory();
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
          <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>{m}</button>
        ))}
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
          onOpenPage={(to) => console.info("open", to)}
          walkHint="click to lock the cursor · WASD · shift to crouch · E to use · Esc to release"
        >
          <GridFloor {...YARD} />
          <WallBoxes walls={PLAN.walls} />
          <Wings wings={PLAN.wings} />
          <FactoryScene factory={factory} feed={feed} looks={LOOKS} reduce={false} />
        </SiteWorld>
      </div>
    </>
  );
}
