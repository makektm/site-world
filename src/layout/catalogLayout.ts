// A building planned from a service catalog instead of placed by hand. A
// hand-placed floor plan (walls, doors, pylon spots typed in as numbers) is
// fine for ten services and breaks at a hundred: every new service means
// re-measuring a room. Here the host hands over its domains and services and
// gets back everything SiteWorld and its rooms take as data — walls with door
// gaps, doors, door banners, bounds, one room per domain and one slot per
// service — always the same plan for the same catalog.
//
// Each room is a cross of aisles (one along x through its middle, one along z
// through the middle of every grid column it spans) with services in the
// quadrants between. Every doorway sits on an aisle line, so a door always
// opens onto a clear walkway and never onto a pylon.
import { COLLIDER_WALL_T, DOOR_H, EYE, PANEL_STANDOFF, WALL, type DoorSignSpec, type WallSegment } from "../core/engine";
import type { SiteDoor } from "../doors/door";
import type { SiteCamera } from "../world/SiteWorld";

/** A domain: one room in the plan. */
export interface CatalogDomain {
  id: string;
  label: string;
  /** One line under the label on door banners. */
  sub?: string;
}

/** A service: one slot in its domain's room. Hosts extend this with their own fields; they come back on the slot. */
export interface CatalogService {
  name: string;
  domain: string;
}

/** What `layoutCatalog` plans from. Domain order is kept (it is the host's reading order); services are ordered by name. */
export interface Catalog<S extends CatalogService = CatalogService> {
  domains: readonly CatalogDomain[];
  services: readonly S[];
}

/** An axis-aligned floor rectangle, the same shape as a host's BOUNDS (and GridFloor / FloorSolid props). */
export interface FloorRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A named area the host reserves beside the buildings (a factory hall, a loading dock): placed, never walled. */
export interface WingSpec {
  id: string;
  label?: string;
  /** Which face of the campus it sits against; wings on the same side stack outward in the order given. */
  side: "north" | "south" | "east" | "west";
  /** Length along that face. */
  width: number;
  /** How far it reaches out from that face. */
  depth: number;
  /** Clear ground between it and whatever it stacks on (default 4). */
  gap?: number;
}

/** Tuning for `layoutCatalog`; every field has a default. */
export interface CatalogLayoutOptions {
  /** Centre-to-centre spacing of service slots (default 2.4). */
  slotPitch?: number;
  /** Width of every aisle; never narrower than a doorway (default 2.4). */
  aisle?: number;
  /** Clear floor between a wall's centre-line and the slot grid (default 1). */
  margin?: number;
  /** No room is narrower or shallower than this (default 8). */
  minRoom?: number;
  /** Half the width of each doorway's gap (default 1.2, as examples/company). */
  doorHalfWidth?: number;
  /** More domains than this split into several buildings in a row: the campus mode (default 9). */
  maxDomainsPerBuilding?: number;
  /** Ground between buildings in campus mode (default 8). */
  buildingGap?: number;
  /** Spare slots per room as a fraction of its services (default 0), so a few new services do not resize the plan. */
  headroom?: number;
  /** An outside door in each building's south wall (default: on in campus mode, off for one building). */
  entrances?: boolean;
  /** Which door look a doorway between rooms `a` and `b` gets (default "slide"); `b` may be OUTSIDE. */
  doorKind?: (a: string, b: string) => SiteDoor["kind"];
  /** What the inside banner over an entrance reads (default "OUTSIDE"). */
  outsideLabel?: string;
  wings?: readonly WingSpec[];
}

/** One domain's room. */
export interface LayoutRoom {
  id: string;
  label: string;
  sub: string;
  /** Index into `plan.buildings`. */
  building: number;
  /** Wall centre-line to wall centre-line. */
  rect: FloorRect;
  center: readonly [number, number];
  /** The z of the aisle running along x, which every doorway in this room's x-facing walls opens onto. */
  aisleZ: number;
  /** The x of each aisle running along z, which every doorway in its z-facing walls opens onto. */
  aisleXs: readonly number[];
  /** Slots the room has; at least its service count. */
  capacity: number;
  /** Its services' names, in slot order. */
  services: readonly string[];
}

/** Where one service stands. */
export interface ServiceSlot<S extends CatalogService = CatalogService> {
  name: string;
  /** The room it is in: its domain, or UNASSIGNED_DOMAIN. */
  room: string;
  service: S;
  pos: readonly [number, number];
  /** Turns a front face (+z at 0, as hungOnWall) toward the nearest aisle, where walkers are. */
  facing: number;
  /** Its order in the room, nearest the aisle crossing first. */
  index: number;
}

/** Which two rooms a door joins: `a` on its -x/-z side, `b` on its +x/+z side (OUTSIDE for an entrance). */
export interface DoorLink {
  door: string;
  a: string;
  b: string;
}

export interface LayoutBuilding {
  index: number;
  rect: FloorRect;
  rooms: readonly string[];
}

export interface LayoutWing {
  id: string;
  label: string;
  side: WingSpec["side"];
  rect: FloorRect;
}

/** Everything `layoutCatalog` returns: pass walls/doors/doorSigns/camera to SiteWorld, bounds to the floor. */
export interface CatalogPlan<S extends CatalogService = CatalogService> {
  /** "campus" once domains spill over one building. */
  mode: "building" | "campus";
  /** Buildings and wings together. */
  bounds: FloorRect;
  /** Buildings only: what the floor and grid under the walls cover. */
  buildingBounds: FloorRect;
  buildings: readonly LayoutBuilding[];
  rooms: readonly LayoutRoom[];
  roomById: Readonly<Record<string, LayoutRoom>>;
  slots: readonly ServiceSlot<S>[];
  slotByName: Readonly<Record<string, ServiceSlot<S>>>;
  walls: readonly WallSegment[];
  doors: readonly SiteDoor[];
  doorSigns: readonly DoorSignSpec[];
  doorLinks: readonly DoorLink[];
  wings: readonly LayoutWing[];
  /** A starting view that frames the whole plan, and a walk start at the first room's aisle crossing. */
  camera: SiteCamera;
  /** What was dropped or reassigned (duplicate names, unknown domains, bad wings); the plan is still whole. */
  warnings: readonly string[];
}

/** The room id on the far side of an entrance. */
export const OUTSIDE = "outside";
/** The room services whose domain is not in the catalog end up in. */
export const UNASSIGNED_DOMAIN = "__unassigned";

const DEFAULTS = {
  slotPitch: 2.4,
  aisle: 2.4,
  margin: 1,
  minRoom: 8,
  doorHalfWidth: 1.2,
  maxDomainsPerBuilding: 9,
  buildingGap: 8,
  headroom: 0,
  outsideLabel: "OUTSIDE",
};

// Millimetres: enough for any floor plan, and it keeps float dust (5.000000001)
// out of keys, React identities and test snapshots.
const mm = (v: number) => Math.round(v * 1000) / 1000 + 0;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Plans a building (or a campus of them) from a catalog: deterministic, overlap-free, every room reachable by doors. */
export function layoutCatalog<S extends CatalogService>(
  catalog: Catalog<S>,
  opts: CatalogLayoutOptions = {},
): CatalogPlan<S> {
  const p = opts.slotPitch ?? DEFAULTS.slotPitch;
  const h = opts.doorHalfWidth ?? DEFAULTS.doorHalfWidth;
  // A doorway wider than its aisle would open half onto a pylon.
  const aisle = Math.max(opts.aisle ?? DEFAULTS.aisle, 2 * h);
  const m = opts.margin ?? DEFAULTS.margin;
  // A room must fit a doorway plus its frame posts between each corner and the
  // aisle; below that a gap would cut into the wall it meets.
  const minRoom = Math.max(opts.minRoom ?? DEFAULTS.minRoom, 2 * (h + 0.6) + COLLIDER_WALL_T);
  const maxPer = Math.max(1, Math.floor(opts.maxDomainsPerBuilding ?? DEFAULTS.maxDomainsPerBuilding));
  const gap = opts.buildingGap ?? DEFAULTS.buildingGap;
  const headroom = Math.max(0, opts.headroom ?? DEFAULTS.headroom);
  const doorKind = opts.doorKind ?? (() => "slide" as const);
  const warnings: string[] = [];

  // Domains in the host's order, first wins on a repeated id.
  const domains: CatalogDomain[] = [];
  const known = new Set<string>();
  for (const d of catalog.domains) {
    if (known.has(d.id)) {
      warnings.push(`duplicate domain "${d.id}" ignored`);
      continue;
    }
    known.add(d.id);
    domains.push(d);
  }

  // Services by name, so a catalog listed in any order plans the same; first
  // (by name, then domain) wins on a repeated name.
  const byRoom = new Map<string, S[]>(domains.map((d) => [d.id, []]));
  const taken = new Set<string>();
  const strays = new Set<string>();
  const sorted = [...catalog.services].sort((a, b) => cmp(a.name, b.name) || cmp(a.domain, b.domain));
  for (const s of sorted) {
    if (taken.has(s.name)) {
      warnings.push(`duplicate service "${s.name}" ignored`);
      continue;
    }
    taken.add(s.name);
    let list = byRoom.get(s.domain);
    if (!list) {
      if (!byRoom.has(UNASSIGNED_DOMAIN)) {
        domains.push({ id: UNASSIGNED_DOMAIN, label: "UNASSIGNED", sub: "no known domain" });
        byRoom.set(UNASSIGNED_DOMAIN, []);
      }
      if (!strays.has(s.domain)) warnings.push(`unknown domain "${s.domain}": its services are UNASSIGNED`);
      strays.add(s.domain);
      list = byRoom.get(UNASSIGNED_DOMAIN)!;
    }
    list.push(s);
  }

  /** The smallest room whose four quadrants hold k services. */
  const need = (k: number): [number, number] => {
    const perQuadrant = Math.max(1, Math.ceil(Math.ceil(k * (1 + headroom)) / 4));
    const qx = Math.ceil(Math.sqrt(perQuadrant));
    const qz = Math.ceil(perQuadrant / qx);
    return [Math.max(minRoom, mm(2 * m + aisle + 2 * qx * p)), Math.max(minRoom, mm(2 * m + aisle + 2 * qz * p))];
  };

  // Even split across buildings: 10 domains make 5 + 5, not 9 + 1.
  const nB = domains.length === 0 ? 0 : Math.ceil(domains.length / maxPer);
  const per = nB === 0 ? 0 : Math.ceil(domains.length / nB);
  const chunks = Array.from({ length: nB }, (_, i) => domains.slice(i * per, (i + 1) * per)).filter((c) => c.length);

  interface Cell {
    d: CatalogDomain;
    row: number;
    c0: number;
    c1: number;
  }
  const grids = chunks.map((chunk) => {
    const cols = Math.ceil(Math.sqrt(chunk.length));
    const rows = Math.ceil(chunk.length / cols);
    // The last room stretches over any columns its row leaves empty, so a
    // building is always a full rectangle with no dead corner.
    const cells: Cell[] = chunk.map((d, i) => ({
      d,
      row: Math.floor(i / cols),
      c0: i % cols,
      c1: i === chunk.length - 1 ? cols - 1 : i % cols,
    }));
    const W = Array.from({ length: cols }, () => minRoom);
    const D = Array.from({ length: rows }, () => minRoom);
    for (const c of cells) {
      const [w, dd] = need(byRoom.get(c.d.id)!.length);
      W[c.c0] = Math.max(W[c.c0]!, w);
      D[c.row] = Math.max(D[c.row]!, dd);
    }
    const width = mm(W.reduce((a, b) => a + b, 0));
    const depth = mm(D.reduce((a, b) => a + b, 0));
    return { cols, rows, cells, W, D, width, depth };
  });

  const total = grids.reduce((a, g) => a + g.width, 0) + gap * Math.max(0, grids.length - 1);
  const entrances = opts.entrances ?? grids.length > 1;

  const buildings: LayoutBuilding[] = [];
  const rooms: LayoutRoom[] = [];
  const walls: WallSegment[] = [];
  const doors: SiteDoor[] = [];
  const doorSigns: DoorSignSpec[] = [];
  const doorLinks: DoorLink[] = [];
  const labelOf = new Map<string, { label: string; sub: string }>();
  const Y = WALL / 2;
  const T = COLLIDER_WALL_T;
  const HY = DOOR_H + (WALL - DOOR_H) / 2;

  /** A wall run along x (at z) or along z (at x) from `a` to `b`, with a
   * doorway gap and its header at each of `gaps`. */
  const run = (axis: "x" | "z", at: number, a: number, b: number, gaps: readonly number[] = []) => {
    const piece = (s: number, e: number): WallSegment =>
      axis === "x"
        ? { pos: [mm((s + e) / 2), Y, mm(at)], size: [mm(e - s), WALL, T] }
        : { pos: [mm(at), Y, mm((s + e) / 2)], size: [T, WALL, mm(e - s)] };
    let from = a;
    for (const g of [...gaps].sort((x, y) => x - y)) {
      if (g - h - from > 1e-6) walls.push(piece(from, g - h));
      walls.push(
        axis === "x"
          ? { pos: [mm(g), HY, mm(at)], size: [2 * h, WALL - DOOR_H, T] }
          : { pos: [mm(at), HY, mm(g)], size: [T, WALL - DOOR_H, 2 * h] },
      );
      from = g + h;
    }
    if (b - from > 1e-6) walls.push(piece(from, b));
  };

  const doorIds = new Set<string>();
  /** A door between `a` (-x/-z side) and `b` (+x/+z side), with a banner on
   * each face of its header naming the room behind it. */
  const addDoor = (a: string, b: string, center: [number, number], axis: "x" | "z") => {
    let id = `${a}-${b}`;
    for (let n = 2; doorIds.has(id); n++) id = `${a}-${b}-${n}`;
    doorIds.add(id);
    const la = labelOf.get(a)!;
    const lb = labelOf.get(b)!;
    const code = b === OUTSIDE ? "OUT" : `${la.label.charAt(0)}-${lb.label.charAt(0)}`.toUpperCase();
    const door: SiteDoor = {
      id,
      code,
      doorway: { center: [mm(center[0]), mm(center[1])], axis, halfWidth: h },
      kind: doorKind(a, b),
    };
    doors.push(door);
    doorLinks.push({ door: id, a, b });
    // A gap along z separates rooms to its -x and +x; the banner facing -x is
    // read from room a, so it names b.
    const sides: [{ label: string; sub: string }, number][] =
      axis === "z" ? [[lb, -Math.PI / 2], [la, Math.PI / 2]] : [[lb, Math.PI], [la, 0]];
    for (const [behind, rotationY] of sides) {
      doorSigns.push({
        label: behind.label,
        sub: behind.sub,
        panelId: `D${doorSigns.length + 1}`,
        wall: door.doorway.center,
        pos: [
          mm(center[0] + Math.sin(rotationY) * PANEL_STANDOFF),
          HY,
          mm(center[1] + Math.cos(rotationY) * PANEL_STANDOFF),
        ],
        rotationY,
        width: 2 * h,
        height: 1.0,
      });
    }
  };
  labelOf.set(OUTSIDE, { label: opts.outsideLabel ?? DEFAULTS.outsideLabel, sub: "" });
  for (const d of domains) labelOf.set(d.id, { label: d.label, sub: d.sub ?? "" });

  const slots: ServiceSlot<S>[] = [];
  let ox = -total / 2;
  grids.forEach((g, bi) => {
    const oz = -g.depth / 2;
    const X = [ox];
    for (const w of g.W) X.push(X[X.length - 1]! + w);
    const Z = [oz];
    for (const d of g.D) Z.push(Z[Z.length - 1]! + d);
    const colMid = (c: number) => (X[c]! + X[c + 1]!) / 2;
    const rect: FloorRect = { minX: mm(ox), maxX: mm(ox + g.width), minZ: mm(oz), maxZ: mm(oz + g.depth) };
    buildings.push({ index: bi, rect, rooms: g.cells.map((c) => c.d.id) });

    const at = (row: number, col: number) => g.cells.find((c) => c.row === row && c.c0 <= col && col <= c.c1)!;

    for (const c of g.cells) {
      const r: FloorRect = { minX: mm(X[c.c0]!), maxX: mm(X[c.c1 + 1]!), minZ: mm(Z[c.row]!), maxZ: mm(Z[c.row + 1]!) };
      const aisleZ = mm((r.minZ + r.maxZ) / 2);
      const aisleXs: number[] = [];
      for (let col = c.c0; col <= c.c1; col++) aisleXs.push(mm(colMid(col)));
      const spots = slotGrid(r, aisleZ, aisleXs, aisle, m, p);
      const services = byRoom.get(c.d.id)!;
      // `need` sized this room for its services; running out means the sizing
      // and the grid disagree, a bug to fail loudly on rather than overlap.
      if (spots.length < services.length) throw new Error(`layoutCatalog: room "${c.d.id}" is short of slots`);
      services.forEach((s, index) => {
        const spot = spots[index]!;
        slots.push({ name: s.name, room: c.d.id, service: s, pos: spot.pos, facing: spot.facing, index });
      });
      rooms.push({
        id: c.d.id,
        label: c.d.label,
        sub: c.d.sub ?? "",
        building: bi,
        rect: r,
        center: [mm((r.minX + r.maxX) / 2), aisleZ],
        aisleZ,
        aisleXs,
        capacity: spots.length,
        services: services.map((s) => s.name),
      });
    }

    // The shell; an entrance in the south wall opens onto a middle column.
    const entryCol = Math.floor(g.cols / 2);
    run("x", rect.minZ, rect.minX, rect.maxX);
    run("x", rect.maxZ, rect.minX, rect.maxX, entrances ? [colMid(entryCol)] : []);
    run("z", rect.minX, rect.minZ, rect.maxZ);
    run("z", rect.maxX, rect.minZ, rect.maxZ);
    // Between neighbours in a row: one door on the row's x-aisle.
    for (let row = 0; row < g.rows; row++) {
      const inRow = g.cells.filter((c) => c.row === row);
      for (let i = 0; i + 1 < inRow.length; i++) {
        const x = X[inRow[i]!.c1 + 1]!;
        const zMid = (Z[row]! + Z[row + 1]!) / 2;
        run("z", x, Z[row]!, Z[row + 1]!, [zMid]);
        addDoor(inRow[i]!.d.id, inRow[i + 1]!.d.id, [x, zMid], "z");
      }
    }
    // Between rows: one door per column, on that column's z-aisle.
    for (let row = 0; row + 1 < g.rows; row++) {
      const z = Z[row + 1]!;
      const mids = Array.from({ length: g.cols }, (_, col) => colMid(col));
      run("x", z, rect.minX, rect.maxX, mids);
      mids.forEach((x, col) => addDoor(at(row, col).d.id, at(row + 1, col).d.id, [x, z], "x"));
    }
    if (entrances) addDoor(at(g.rows - 1, entryCol).d.id, OUTSIDE, [colMid(entryCol), rect.maxZ], "x");

    ox += g.width + gap;
  });

  const buildingBounds: FloorRect = buildings.length
    ? {
        minX: Math.min(...buildings.map((b) => b.rect.minX)),
        maxX: Math.max(...buildings.map((b) => b.rect.maxX)),
        minZ: Math.min(...buildings.map((b) => b.rect.minZ)),
        maxZ: Math.max(...buildings.map((b) => b.rect.maxZ)),
      }
    : { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };

  const wings = placeWings(opts.wings ?? [], buildingBounds, warnings);
  const bounds: FloorRect = {
    minX: Math.min(buildingBounds.minX, ...wings.map((w) => w.rect.minX)),
    maxX: Math.max(buildingBounds.maxX, ...wings.map((w) => w.rect.maxX)),
    minZ: Math.min(buildingBounds.minZ, ...wings.map((w) => w.rect.minZ)),
    maxZ: Math.max(buildingBounds.maxZ, ...wings.map((w) => w.rect.maxZ)),
  };

  return {
    mode: buildings.length > 1 ? "campus" : "building",
    bounds,
    buildingBounds,
    buildings,
    rooms,
    roomById: Object.fromEntries(rooms.map((r) => [r.id, r])),
    slots,
    slotByName: Object.fromEntries(slots.map((s) => [s.name, s])),
    walls,
    doors,
    doorSigns,
    doorLinks,
    wings,
    camera: frameCamera(bounds, rooms[0]),
    warnings,
  };
}

/** Slot centres inside `r`, clear of the margin and every aisle band, nearest
 * the aisle crossing first so a part-filled room fills from where walkers are. */
function slotGrid(r: FloorRect, aisleZ: number, aisleXs: readonly number[], aisle: number, m: number, p: number) {
  const along = (lo: number, hi: number, cuts: readonly number[]) => {
    const out: number[] = [];
    let from = lo;
    const spans: [number, number][] = [];
    for (const c of cuts) {
      spans.push([from, c - aisle / 2]);
      from = c + aisle / 2;
    }
    spans.push([from, hi]);
    for (const [s, e] of spans) {
      const n = Math.floor((e - s) / p + 1e-9);
      if (n <= 0) continue;
      // Centred in its span, so the clear floor is shared by both ends.
      const start = s + (e - s - n * p) / 2 + p / 2;
      for (let i = 0; i < n; i++) out.push(mm(start + i * p));
    }
    return out;
  };
  const xs = along(r.minX + m, r.maxX - m, aisleXs);
  const zs = along(r.minZ + m, r.maxZ - m, [aisleZ]);
  const spots: { pos: readonly [number, number]; facing: number; key: number }[] = [];
  for (const z of zs) {
    for (const x of xs) {
      const dz = z - aisleZ;
      const ax = aisleXs.reduce((best, a) => (Math.abs(x - a) < Math.abs(x - best) ? a : best), aisleXs[0]!);
      const dx = x - ax;
      // 0 faces +z; a slot north of the x-aisle (dz < 0) looks south onto it.
      const facing = Math.abs(dz) <= Math.abs(dx) ? (dz < 0 ? 0 : Math.PI) : dx < 0 ? Math.PI / 2 : -Math.PI / 2;
      spots.push({ pos: [x, z], facing, key: mm(Math.abs(dz) + Math.abs(dx)) });
    }
  }
  // Stable sort: ties keep row-major order.
  return spots.sort((a, b) => a.key - b.key);
}

function placeWings(specs: readonly WingSpec[], b: FloorRect, warnings: string[]): LayoutWing[] {
  const cursor = { north: b.minZ, south: b.maxZ, west: b.minX, east: b.maxX };
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const out: LayoutWing[] = [];
  const ids = new Set<string>();
  for (const w of specs) {
    if (!(w.width > 0 && w.depth > 0) || ids.has(w.id)) {
      warnings.push(`wing "${w.id}" ignored: ${ids.has(w.id) ? "duplicate id" : "needs a positive width and depth"}`);
      continue;
    }
    ids.add(w.id);
    const g = w.gap ?? 4;
    let rect: FloorRect;
    if (w.side === "east" || w.side === "west") {
      const x0 = w.side === "east" ? cursor.east + g : cursor.west - g - w.depth;
      rect = { minX: x0, maxX: x0 + w.depth, minZ: cz - w.width / 2, maxZ: cz + w.width / 2 };
      if (w.side === "east") cursor.east = rect.maxX;
      else cursor.west = rect.minX;
    } else {
      const z0 = w.side === "south" ? cursor.south + g : cursor.north - g - w.depth;
      rect = { minX: cx - w.width / 2, maxX: cx + w.width / 2, minZ: z0, maxZ: z0 + w.depth };
      if (w.side === "south") cursor.south = rect.maxZ;
      else cursor.north = rect.minZ;
    }
    out.push({
      id: w.id,
      label: w.label ?? w.id.toUpperCase(),
      side: w.side,
      rect: { minX: mm(rect.minX), maxX: mm(rect.maxX), minZ: mm(rect.minZ), maxZ: mm(rect.maxZ) },
    });
  }
  return out;
}

/** The orbit start examples/company uses for its 20m building, scaled to
 * the plan's larger side, so any plan opens framed the same way. */
function frameCamera(b: FloorRect, first: LayoutRoom | undefined): SiteCamera {
  const cx = mm((b.minX + b.maxX) / 2);
  const cz = mm((b.minZ + b.maxZ) / 2);
  const e = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, 20);
  const start: [number, number] = first ? [first.center[0], first.center[1]] : [cx, cz];
  return {
    home: [mm(cx + 0.575 * e), mm(0.42 * e), mm(cz + 0.575 * e)],
    target: [cx, 0.9, cz],
    walkStart: start,
    walkLookAt: [mm(start[0] + 4), EYE, start[1]],
  };
}
