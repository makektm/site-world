// The building, planned from the factory catalogue rather than typed in by
// hand: layoutCatalog turns six domains and their services into rooms, walls,
// doors, banners and one slot per service. This file only adds what the
// library leaves to the host — the PCI door, where each room's dashboard
// hangs, the walls round the factory hall, and a yard fence.
//
//   north (-z)   FACTORY HALL   (the work line: ticket -> agent -> PR -> CI -> review -> deploy)
//                EDGE      COMMERCE   PAYMENTS
//                PLATFORM  GROWTH     DATA
//   south (+z)   LOADING DOCK   (outside the front door: externals)
import {
  DOOR_H, EYE, WALL, layoutCatalog, type CatalogDomain, type FloorRect, type LayoutRoom, type SiteCamera,
  type SiteDoor, type WallSegment,
} from "site-world";
import { CATALOG, type FactoryDomain } from "./factory/catalog";

const SUB: Record<FactoryDomain, string> = {
  edge: "traffic in · identity",
  commerce: "catalog · search · orders",
  payments: "money · PCI zone",
  platform: "async · flags · notify",
  growth: "profiles · promos · referrals",
  data: "events · features · reports",
};

const DOMAINS: CatalogDomain[] = CATALOG.domains.map((d) => ({ id: d.id, label: d.label.toUpperCase(), sub: SUB[d.id] }));

export const FACTORY_WING = "factory";
export const DOCK_WING = "dock";

const isPci = (a: string, b: string) => a === "payments" || b === "payments";

const RAW = layoutCatalog(
  { domains: DOMAINS, services: CATALOG.services },
  {
    // One building would get no entrance by default; the dock and the hall
    // are outside, so walkers need a way out.
    entrances: true,
    // Into the PCI zone: a heavier, bi-parting door.
    doorKind: (a, b) => (isPci(a, b) ? "biparting" : "slide"),
    wings: [
      { id: FACTORY_WING, label: "FACTORY HALL", side: "north", width: 30, depth: 12 },
      { id: DOCK_WING, label: "LOADING DOCK", side: "south", width: 16, depth: 7 },
    ],
  },
);

const pciDoors = new Set(RAW.doorLinks.filter((l) => isPci(l.a, l.b)).map((l) => l.door));
const DOORS: SiteDoor[] = RAW.doors.map((d) => (pciDoors.has(d.id) ? { ...d, code: "PCI" } : d));

export const BUILDING = RAW.buildingBounds;
export const HALL = RAW.wings.find((w) => w.id === FACTORY_WING)!;
export const DOCK = RAW.wings.find((w) => w.id === DOCK_WING)!;

/** The loading dock's deck, toward the wing's far side: the wing's name is painted on the near side, where walkers arrive. */
export const DOCK_AT: readonly [number, number] = [(DOCK.rect.minX + DOCK.rect.maxX) / 2, DOCK.rect.maxZ - 2.6];
export const DOCK_BAY_W = 1.7;

const T = 0.2;
/** The hall's doorway: wide enough for crates on a pallet, on its south wall facing the building. */
const HALL_GAP = 2.4;
const FENCE_H = 1.1;
const YARD_PAD = 2;

/** All ground walkers can stand on: building, wings and the yard between, plus a margin inside the fence. */
export const YARD: FloorRect = {
  minX: RAW.bounds.minX - YARD_PAD,
  maxX: RAW.bounds.maxX + YARD_PAD,
  minZ: RAW.bounds.minZ - YARD_PAD,
  maxZ: RAW.bounds.maxZ + YARD_PAD,
};

function along(axis: "x" | "z", at: number, a: number, b: number, h = WALL): WallSegment {
  return axis === "x"
    ? { pos: [(a + b) / 2, h / 2, at], size: [b - a, h, T] }
    : { pos: [at, h / 2, (a + b) / 2], size: [T, h, b - a] };
}

function hallWalls(r: FloorRect): WallSegment[] {
  const mid = (r.minX + r.maxX) / 2;
  return [
    along("x", r.minZ, r.minX, r.maxX),
    along("z", r.minX, r.minZ, r.maxZ),
    along("z", r.maxX, r.minZ, r.maxZ),
    along("x", r.maxZ, r.minX, mid - HALL_GAP),
    along("x", r.maxZ, mid + HALL_GAP, r.maxX),
    { pos: [mid, DOOR_H + (WALL - DOOR_H) / 2, r.maxZ], size: [HALL_GAP * 2, WALL - DOOR_H, T] },
  ];
}

// Low, so it reads as the edge of the site rather than another room, and
// keeps walkers off the kill plane.
const FENCE: WallSegment[] = [
  along("x", YARD.minZ, YARD.minX, YARD.maxX, FENCE_H),
  along("x", YARD.maxZ, YARD.minX, YARD.maxX, FENCE_H),
  along("z", YARD.minX, YARD.minZ, YARD.maxZ, FENCE_H),
  along("z", YARD.maxX, YARD.minZ, YARD.maxZ, FENCE_H),
];

export const PLAN = {
  ...RAW,
  doors: DOORS,
  walls: [...RAW.walls, ...hallWalls(HALL.rect), ...FENCE],
};

/** The on-call console stands where EDGE's aisles cross: the room's middle, clear of every slot. */
export const ONCALL_PLINTH: readonly [number, number] = RAW.roomById.edge!.center;

export interface BoardSpot {
  /** A wall centre-line point, and the turn that faces the board into the room. */
  wall: readonly [number, number];
  rotationY: number;
}

const BOARD_HALF = 1.9 + 0.2;

/** Where a room's dashboard hangs: on its outside wall (north for the front
 * row, south for the back), centred on the aisle unless a doorway is there,
 * in which case on the widest stretch of wall beside it. */
export function boardSpot(room: LayoutRoom): BoardSpot {
  const north = room.rect.minZ <= BUILDING.minZ;
  const z = north ? room.rect.minZ : room.rect.maxZ;
  const rotationY = north ? 0 : Math.PI;
  const gaps = DOORS.filter((d) => d.doorway.axis === "x" && Math.abs(d.doorway.center[1] - z) < 1e-6)
    .map((d) => [d.doorway.center[0] - d.doorway.halfWidth, d.doorway.center[0] + d.doorway.halfWidth] as const)
    .filter(([a, b]) => b > room.rect.minX && a < room.rect.maxX);
  const x = room.aisleXs[0] ?? room.center[0];
  if (!gaps.some(([a, b]) => x + BOARD_HALF > a && x - BOARD_HALF < b)) return { wall: [x, z], rotationY };
  // Clear stretches between the room's corners and the doorways.
  const cuts = [room.rect.minX, ...gaps.flat().sort((p, q) => p - q), room.rect.maxX];
  let best: [number, number] = [x, 0];
  for (let i = 0; i + 1 < cuts.length; i += 2) {
    const len = cuts[i + 1]! - cuts[i]!;
    if (len > best[1]) best = [(cuts[i]! + cuts[i + 1]!) / 2, len];
  }
  return { wall: [best[0], z], rotationY };
}

// OrbitControls clamps the orbit to 28m, so home looks down steeply to fit
// the building's width (and a strip of the hall behind it) inside that reach.
const TARGET: [number, number, number] = [0, 0, -1];
const ENTRANCE = DOORS.find((d) => d.code === "OUT")!.doorway.center;

export const CAMERA: SiteCamera = {
  home: [TARGET[0], 25, TARGET[2] + 11.5],
  target: TARGET,
  // Just inside the front door, looking up the aisle through GROWTH to COMMERCE.
  walkStart: [ENTRANCE[0], ENTRANCE[1] - 1.6],
  walkLookAt: [ENTRANCE[0], EYE + 0.3, ENTRANCE[1] - 12],
};
