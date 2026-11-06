/// <reference path="./three-jsx.d.ts" />
// site-world — a walkable 3D "operations room" for React Three Fiber.
//
// This file is the package's public surface; everything an application (or an
// agent) may import is exported here, grouped by folder. Anything not listed
// is internal. See README.md for the map and docs/ for how the pieces fit.

// The viewport and building blocks
export * from "./world/SiteWorld";
export * from "./world/WorldParts";

// Constants, the room contract, terminals, keys, hotkeys, proximity, canvas textures
export * from "./core/PointProximity";
export * from "./core/engine";
export * from "./core/hotkeys";
export * from "./core/keys";
export * from "./core/room";
export * from "./core/screenSize";
export * from "./core/terminals";
export * from "./core/useCanvasTexture";

// Doors: data, steel and plain doors, walk-up triggers, collision, signs
export * from "./doors/DoorFrame";
export * from "./doors/DoorLeaf";
export * from "./doors/DoorMetal";
export * from "./doors/DoorSign";
export * from "./doors/Doors";
export * from "./doors/PlainDoorLeaf";
export * from "./doors/SlidingDoor";
export * from "./doors/door";
export * from "./doors/doorMetal";
export * from "./doors/doorStyle";

// Walk mode: capsule physics and stance
export * from "./walk/WalkPhysics";
export * from "./walk/walkStance";

// Screens, plinth, console rig, wall tags, prompts, fullscreen
export * from "./screens/ConsoleRig";
export * from "./screens/FullscreenPortal";
export * from "./screens/Plinth";
export * from "./screens/UsePrompt";
export * from "./screens/WallCoordTag";
export * from "./screens/WallScreen";
export * from "./screens/screenWarp";

// Orbit camera
export * from "./camera/orbit";

// The demon mini-game
export * from "./doom/Demon";
export * from "./doom/DemonBodies";
export * from "./doom/DemonSwitch";
export * from "./doom/Doom";
export * from "./doom/DoomEffects";
export * from "./doom/DoomHud";
export * from "./doom/DoomMarks";
export * from "./doom/DoomViewmodel";
export * from "./doom/doomAudio";
export * from "./doom/doomHunt";
export * from "./doom/doomNav";
export * from "./doom/doomRules";
export * from "./doom/doomStore";
export * from "./doom/doomWorld";
export * from "./doom/markArt";
export * from "./doom/simpleWorld";

// Catalog-driven layout: a building (or campus) planned from domains and services, level of detail, room graph
export * from "./layout/catalogLayout";
export * from "./layout/lod";
export * from "./layout/planGraph";

// Kit: agents as visible workers, people presence, crowd and path helpers
export * from "./kit/AgentFigure";
export * from "./kit/AgentTrail";
export * from "./kit/NameTag";
export * from "./kit/PresenceMarker";
export * from "./kit/agentPath";
export * from "./kit/agentState";
export * from "./kit/crowdLayout";

// Factory floor: belts, stations, crates of work, and the line that composes them
export * from "./kit/Conveyor";
export * from "./kit/Crate";
export * from "./kit/Station";
export * from "./kit/WorkLine";
export * from "./kit/workLineLayout";

// Infrastructure and annotation props: tanks, queue pipes, the loading dock,
// meters, floor heat, locks and keys, sticky notes
export * from "./kit/FloorHeat";
export * from "./kit/LoadingDock";
export * from "./kit/Meter";
export * from "./kit/Padlock";
export * from "./kit/QueuePipe";
export * from "./kit/StickyNote";
export * from "./kit/Tank";
export * from "./kit/infraMath";
export * from "./kit/infraPaint";

// Interaction kit: selection, inspector, layers, go-to, follow, tours, timeline, blast radius
export * from "./kit/GoToPalette";
export * from "./kit/InspectPanel";
export * from "./kit/LayerBar";
export * from "./kit/Selectable";
export * from "./kit/TimelineScrubber";
export * from "./kit/TourCaption";
export * from "./kit/blastRadius";
export * from "./kit/fuzzy";
export * from "./kit/goal";
export * from "./kit/layers";
export * from "./kit/selection";
export * from "./kit/timeline";
export * from "./kit/tour";
export * from "./kit/useFollow";
export * from "./kit/useKeydown";
