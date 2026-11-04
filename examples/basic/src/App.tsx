import { useMemo, useRef, useState } from "react";
import {
  FloorSolid, GridFloor, SiteWorld, WallBoxes, WallSolids, configureDoom, roomDoomConfig, type SiteCamera,
} from "site-world";
import { BOUNDS, DOORS, WALLS } from "./layout";
import { clusterRoom } from "./clusterRoom";
import { notesRoom } from "./notesRoom";

// The demon game is optional: hand it the floor and the walls and it runs.
configureDoom(roomDoomConfig({ minX: -6, maxX: 6, minZ: -6, maxZ: 6 }, WALLS.slice(0, 5)));

const CAMERA: SiteCamera = {
  home: [1.5, 14, 9.5],
  target: [0, 0, -0.6],
  walkStart: [0, 4],
  walkLookAt: [0, 1.5, -2],
};
const ROOMS = [notesRoom, clusterRoom];

export function App() {
  const [mode, setMode] = useState<"orbit" | "walk">("orbit");
  const cameraRef = useRef({ x: 9, z: 12 });
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
          solids={solids}
          doomSwitchAt={{ x: 3, y: 1.4, wallZ: -6, facing: 1 }}
          cameraRef={cameraRef}
          onOpenPage={() => {}}
          walkHint="click to lock the cursor · WASD · shift to crouch · E to use · Esc to release"
        >
          <GridFloor {...BOUNDS} />
          <WallBoxes walls={WALLS} />
        </SiteWorld>
      </div>
    </>
  );
}
