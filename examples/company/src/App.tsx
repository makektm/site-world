// A company with ten microservices, as a building: one room per domain, a
// pylon per service, live dashboards, and the calls between services running
// overhead. See services.ts for the data and what to swap in for real.
import { useMemo, useRef, useState } from "react";
import { FloorSolid, GridFloor, SiteWorld, WallBoxes, WallSolids, type SiteCamera } from "site-world";
import { BOUNDS, DOORS, DOOR_SIGNS, HALF, WALLS } from "./layout";
import { oncallRoom } from "./oncallRoom";
import { serviceRoom } from "./serviceRoom";
import { useFeed } from "./services";
import { Traffic } from "./Traffic";

export const CAMERA: SiteCamera = {
  home: [3, 21, 17],
  target: [0, 0, 0.5],
  walkStart: [1.4, 9.0],
  walkLookAt: [8.5, 1.9, 4.2],
};

// A module constant: rooms' hooks run in this order on every render.
const ROOMS = [
  serviceRoom({ domain: "edge", board: { wall: [-4.5, -HALF], rotationY: 0 } }),
  serviceRoom({ domain: "commerce", board: { wall: [5, -HALF], rotationY: 0 } }),
  serviceRoom({ domain: "payments", board: { wall: [HALF, 5], rotationY: -Math.PI / 2 } }),
  serviceRoom({ domain: "platform", board: { wall: [-HALF, 5], rotationY: Math.PI / 2 } }),
  oncallRoom,
];

export function App() {
  const [mode, setMode] = useState<"orbit" | "walk">("orbit");
  const cameraRef = useRef({ x: CAMERA.home[0], z: CAMERA.home[2] });
  const feed = useFeed();
  const solids = useMemo(
    () => (
      <>
        <FloorSolid {...BOUNDS} />
        <WallSolids walls={WALLS} />
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
          doors={DOORS}
          doorSigns={DOOR_SIGNS}
          solids={solids}
          cameraRef={cameraRef}
          onOpenPage={(to) => console.info("open", to)}
          walkHint="click to lock the cursor · WASD · shift to crouch · E to use · Esc to release"
        >
          <GridFloor {...BOUNDS} />
          <WallBoxes walls={WALLS} />
          <Traffic feed={feed} />
        </SiteWorld>
      </div>
    </>
  );
}
