// What the services lean on, placed by the plan: each database as a tank
// behind the service that owns its schema, each queue as a pipe under the
// ceiling from producer to consumer, the third parties at the loading dock
// outside the front door, and per domain a spend meter beside its dashboard.
// The cost layer adds a heat map of spend across the floor.
import { useMemo } from "react";
import {
  WALL, FloorHeat, LoadingDock, Meter, QueuePipe, Tank, bayRowWidth, compactNumber,
  type DockBay, type HeatPoint, type WallSegment,
} from "site-world";
import type { FactoryDomain, FactoryService } from "./factory/catalog";
import { EXTERNALS, type InfraState } from "./factory/infra";
import { BUILDING, DOCK, PLAN, boardSpot } from "./plan";
import { TANK_HEIGHT, TANK_RADIUS, domainSpend, meterSpots, tankSpot } from "./placement";
import { rectAround, useLod } from "./useLod";

// Just over the walls (WALL 4.2), a rack of pipes across the roofs: a straight
// pipe lower down would cut through walls and door headers at odd angles.
// The traffic arcs start higher still, so the two read as different things.
const PIPE_Y = WALL + 0.25;
/** Pipes stop short of the pylons so a busy service's beacon is not skewered. */
const PIPE_INSET = 0.7;

/** Daily budgets, USD and tokens, per domain: what the meters measure against. */
export const BUDGET: Record<FactoryDomain, { usd: number; tokens: number }> = {
  edge: { usd: 400, tokens: 2e6 },
  commerce: { usd: 350, tokens: 2e6 },
  payments: { usd: 300, tokens: 10e6 },
  platform: { usd: 400, tokens: 2e6 },
  growth: { usd: 250, tokens: 2e6 },
  data: { usd: 360, tokens: 10e6 },
};

// Toward the wing's far side: the wing's name is painted on the near side, where walkers arrive.
const DOCK_AT: readonly [number, number] = [(DOCK.rect.minX + DOCK.rect.maxX) / 2, DOCK.rect.maxZ - 2.6];
const DOCK_BAY_W = 1.7;

/** What walkers bump into outside: the dock's deck. Tanks are added per database. */
export function infraSolids(databases: readonly { owner: string }[]): WallSegment[] {
  const deck: WallSegment = {
    pos: [DOCK_AT[0], 0.5, DOCK_AT[1]],
    size: [bayRowWidth(EXTERNALS.length, DOCK_BAY_W) + 0.6, 1, 2.4],
  };
  const tanks = databases.flatMap((db): WallSegment[] => {
    const slot = PLAN.slotByName[db.owner];
    if (!slot) return [];
    const [x, z] = tankSpot(slot);
    const d = TANK_RADIUS * 2.1;
    return [{ pos: [x, TANK_HEIGHT / 2, z], size: [d, TANK_HEIGHT, d] }];
  });
  return [deck, ...tanks];
}

function DbTank({ db, reduce }: { db: InfraState["databases"][number]; reduce: boolean }) {
  const slot = PLAN.slotByName[db.owner]!;
  const [x, z] = tankSpot(slot);
  const lod = useLod(rectAround([x, z]));
  if (lod === "campus") return null;
  return (
    <Tank
      position={[x, 0, z]}
      fill={db.fill}
      health={db.status}
      radius={TANK_RADIUS}
      height={TANK_HEIGHT}
      // The data's growth is per tick; the ripple only needs its direction and a visible size.
      growth={db.growth * 40}
      label={lod === "detail" ? db.name : undefined}
      sub={`${db.kind} · ${Math.round(db.fill * 100)}% full`}
      reduce={reduce}
    />
  );
}

function Pipe({ q, reduce }: { q: InfraState["queues"][number]; reduce: boolean }) {
  const a = PLAN.slotByName[q.from]!.pos;
  const b = PLAN.slotByName[q.to]!.pos;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / len;
  const uz = (b[1] - a[1]) / len;
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const lod = useLod(rectAround(mid, len / 2));
  return (
    <QueuePipe
      from={[a[0] + ux * PIPE_INSET, PIPE_Y, a[1] + uz * PIPE_INSET]}
      to={[b[0] - ux * PIPE_INSET, PIPE_Y, b[1] - uz * PIPE_INSET]}
      backlog={q.backlog}
      throughput={q.throughput}
      // infra.ts calls a queue slow at 15 seconds of work waiting; the pipe bulges at the same point.
      threshold={q.throughput * 15}
      radius={0.08}
      label={lod === "detail" ? q.name : undefined}
      reduce={reduce}
    />
  );
}

function DomainMeters({ room, services }: { room: (typeof PLAN.rooms)[number]; services: readonly FactoryService[] }) {
  const lod = useLod(room.rect);
  const board = boardSpot(room);
  const spend = domainSpend(services)[room.id as FactoryDomain] ?? { usdPerDay: 0, tokensPerDay: 0 };
  const budget = BUDGET[room.id as FactoryDomain] ?? { usd: 300, tokens: 2e6 };
  // A domain that spends no tokens gets no token meter: an empty column with a budget line is noise.
  const tokens = spend.tokensPerDay > 0;
  const [usdAt, tokAt] = meterSpots(room, board, PLAN.doors, tokens ? 2 : 1);
  if (lod === "campus" || !usdAt) return null;
  return (
    <>
      <Meter
        position={[usdAt[0], 0, usdAt[1]]}
        rotationY={board.rotationY}
        value={spend.usdPerDay}
        max={budget.usd * 1.5}
        budget={budget.usd}
        label="SPEND/DAY"
        format={(v) => `$${Math.round(v)}`}
        height={1.5}
      />
      {tokAt && (
        <Meter
          position={[tokAt[0], 0, tokAt[1]]}
          rotationY={board.rotationY}
          value={spend.tokensPerDay}
          max={budget.tokens * 1.5}
          budget={budget.tokens}
          label="TOKENS/DAY"
          format={(v) => compactNumber(v)}
          height={1.5}
        />
      )}
    </>
  );
}

export interface InfraProps {
  infra: InfraState;
  services: readonly FactoryService[];
  /** The infra layer: tanks, pipes and the dock. */
  showInfra: boolean;
  /** The cost layer: the floor heat map. */
  showCost: boolean;
  reduce: boolean;
}

export function Infra({ infra, services, showInfra, showCost, reduce }: InfraProps) {
  const bays = useMemo<DockBay[]>(
    () => infra.externals.map((e) => ({ id: e.name, label: e.name, kind: e.kind, status: e.status, latencyMs: e.latencyMs, errorRate: e.errorRate })),
    [infra.externals],
  );
  // FloorHeat rebuilds its canvas when these change identity: only when the catalogue does.
  const heat = useMemo<HeatPoint[]>(
    () =>
      services.flatMap((s) => {
        const slot = PLAN.slotByName[s.name];
        return slot ? [{ x: slot.pos[0], z: slot.pos[1], value: domainSpend([s])[s.domain]!.usdPerDay }] : [];
      }),
    [services],
  );
  return (
    <>
      {showInfra && (
        <>
          {infra.databases.filter((db) => PLAN.slotByName[db.owner]).map((db) => <DbTank key={db.name} db={db} reduce={reduce} />)}
          {infra.queues.filter((q) => PLAN.slotByName[q.from] && PLAN.slotByName[q.to]).map((q) => <Pipe key={q.name} q={q} reduce={reduce} />)}
          <LoadingDock position={[DOCK_AT[0], 0, DOCK_AT[1]]} rotationY={Math.PI} title="EXTERNALS" bays={bays} bayWidth={DOCK_BAY_W} reduce={reduce} />
        </>
      )}
      {PLAN.rooms.map((room) => (
        <DomainMeters key={room.id} room={room} services={services} />
      ))}
      {showCost && <FloorHeat points={heat} bounds={BUILDING} resolution={3} radius={2.2} opacity={0.55} />}
    </>
  );
}
