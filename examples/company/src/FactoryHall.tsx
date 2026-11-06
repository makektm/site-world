// The factory hall: the work line from ticket to deploy, with the pipeline's
// items as crates on it. The REVIEW pile is the story — agents open PRs faster
// than three people can read them — so the line is sized to let that pile
// grow tall rather than spill. When a deploy train leaves, each crate flies
// off the line's end and on, over the roofs, to the pylon of the service it
// changes, which flashes and shows its new version.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, type Group, type Mesh, type MeshBasicMaterial, type Sprite, type SpriteMaterial } from "three";
import {
  INK, InfraLabel, NameTag, OK, PAPER_DIM, WARN, WorkLine, getGlowTexture, polylineLength, sampleLine,
  type FloorPoint, type SelectionRef, type WallSegment,
} from "site-world";
import type { DeployEvent, PipelineState } from "./factory/pipeline";
import { HALL } from "./plan";
import { STATIONS, workLineItems } from "./workItems";

// An upside-down U opening toward the hall's door: out along the west leg,
// across the back, home down the east leg. On the two legs the station boards
// face the door and the yard, so most of the line reads from where people
// look at it; a straight belt across the hall would show them all edge-on.
const LEG_X = 7;
const NEAR_Z = HALL.rect.maxZ - 1.8;
const FAR_Z = HALL.rect.minZ + 2.2;
export const BELT: readonly FloorPoint[] = [[-LEG_X, NEAR_Z], [-LEG_X, FAR_Z], [LEG_X, FAR_Z], [LEG_X, NEAR_Z]];
const BELT_W = 1.1;
/** Where shipped crates leave the line, over the hall's front wall; flights to the pylons start here. */
export const LAUNCH: readonly [number, number, number] = [LEG_X, 4.6, HALL.rect.maxZ - 0.9];
// Inside the U beside CI: rejects are what CI sends back.
const REJECT_AT: FloorPoint = [0, FAR_Z + 1.9];

// Stage positions along the belt (0..1), not evenly spaced: REVIEW gets a long
// run upstream of it for its pile, and only CI sits on the cross piece.
const AT: Record<string, number> = { ticket: 0.05, agent: 0.15, pr: 0.24, ci: 0.5, review: 0.86, deploy: 0.97 };
const LINE_STATIONS = STATIONS.map((s) => ({ ...s, at: AT[s.id] }));

/** Where each station's gate stands on the floor, by stage id: for a camera to frame one. */
export const STATION_AT: Readonly<Record<string, readonly [number, number]>> = Object.fromEntries(
  LINE_STATIONS.map((s) => {
    const p = sampleLine(BELT, (s.at ?? 0) * polylineLength(BELT));
    return [s.id, [p.x, p.z] as const];
  }),
);

/** What walkers bump into in the hall: each run of belt with its gates, and the reject bin. */
export const HALL_SOLIDS: WallSegment[] = [
  ...BELT.slice(1).map(([bx, bz], i): WallSegment => {
    const [ax, az] = BELT[i]!;
    const w = BELT_W + 0.5;
    return { pos: [(ax + bx) / 2, 0.6, (az + bz) / 2], size: [Math.abs(bx - ax) + w, 1.2, Math.abs(bz - az) + w] };
  }),
  { pos: [REJECT_AT[0], 0.4, REJECT_AT[1]], size: [1.5, 0.8, 1.5] },
];

const FLY_DELAY = 1.1; // s: WorkLine's own crate flight to LAUNCH
const FLY_S = 1.7;
const FLASH_S = 1.1;
const TAG_S = 3.2;

interface Flight {
  key: string;
  deploy: DeployEvent;
}

/** One shipped crate's trip from the line to its pylon, then the flash there. */
function DeployFlight({ deploy, to, top, reduce, onDone }: {
  deploy: DeployEvent;
  to: readonly [number, number];
  top: number;
  reduce: boolean;
  onDone: () => void;
}) {
  const head = useRef<Sprite>(null);
  const tails = useRef<(Sprite | null)[]>([]);
  const ring = useRef<Mesh>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const burst = useRef<Sprite>(null);
  const burstMat = useRef<SpriteMaterial>(null);
  const tag = useRef<Group>(null);
  const t0 = useRef<number | null>(null);
  const done = useRef(false);
  const [sx, sy, sz] = LAUNCH;
  const [ex, ez] = to;
  const ey = top;
  // Higher for longer trips, and always well over the walls between.
  const peak = Math.max(sy, ey) + 2 + Math.hypot(ex - sx, ez - sz) * 0.12;
  // Written straight into the sprite: a fresh array per sprite per frame is
  // garbage for every flight in the air.
  const atInto = (k: number, out: { set: (x: number, y: number, z: number) => unknown }) => {
    const a = (1 - k) * (1 - k);
    const b = 2 * (1 - k) * k;
    const c = k * k;
    out.set(a * sx + b * ((sx + ex) / 2) + c * ex, a * sy + b * peak + c * ey, a * sz + b * ((sz + ez) / 2) + c * ez);
  };
  useFrame(({ clock }) => {
    t0.current ??= clock.elapsedTime;
    const t = clock.elapsedTime - t0.current;
    // Reduced motion: no flight, just the pylon's ring and tag, held still.
    const fly = reduce ? -1 : (t - FLY_DELAY) / FLY_S;
    const flash = reduce ? 0.5 : (t - FLY_DELAY - FLY_S) / FLASH_S;
    if (head.current) {
      head.current.visible = fly >= 0 && fly < 1;
      if (head.current.visible) atInto(fly, head.current.position);
    }
    tails.current.forEach((s, i) => {
      if (!s) return;
      const k = fly - (i + 1) * 0.035;
      s.visible = k >= 0 && fly < 1;
      if (s.visible) atInto(k, s.position);
    });
    const showFlash = flash >= 0 && flash < 1;
    if (ring.current && ringMat.current) {
      ring.current.visible = showFlash;
      ring.current.scale.setScalar(reduce ? 1.4 : 0.4 + flash * 1.6);
      ringMat.current.opacity = reduce ? 0.8 : 0.9 * (1 - flash);
    }
    if (burst.current && burstMat.current) {
      burst.current.visible = showFlash && !reduce;
      burst.current.scale.setScalar(1 + flash * 3);
      burstMat.current.opacity = 1 - flash;
    }
    const tagT = t - FLY_DELAY - FLY_S;
    if (tag.current) tag.current.visible = reduce || (tagT >= 0 && tagT < TAG_S);
    const end = reduce ? FLASH_S + TAG_S : FLY_DELAY + FLY_S + Math.max(FLASH_S, TAG_S);
    if (t > end && !done.current) {
      done.current = true;
      onDone();
    }
  });
  return (
    <>
      <sprite ref={head} visible={false} scale={[0.75, 0.75, 1]}>
        <spriteMaterial map={getGlowTexture()} color={OK} transparent depthWrite={false} blending={AdditiveBlending} />
      </sprite>
      {[0, 1, 2, 3].map((i) => (
        <sprite key={i} ref={(el) => { tails.current[i] = el; }} visible={false} scale={[0.5 - i * 0.09, 0.5 - i * 0.09, 1]}>
          <spriteMaterial map={getGlowTexture()} color={OK} transparent opacity={0.6 - i * 0.12} depthWrite={false} blending={AdditiveBlending} />
        </sprite>
      ))}
      <mesh ref={ring} visible={false} position={[ex, 0.03, ez]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.92, 1, 48]} />
        <meshBasicMaterial ref={ringMat} color={OK} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <sprite ref={burst} visible={false} position={[ex, ey, ez]}>
        <spriteMaterial ref={burstMat} map={getGlowTexture()} color={OK} transparent depthWrite={false} blending={AdditiveBlending} />
      </sprite>
      <group ref={tag} visible={false}>
        <NameTag text={`v${deploy.version}`} sub={deploy.rollbackOf ? `${deploy.id}` : `${deploy.id} shipped`} accent={deploy.rollbackOf ? WARN : OK} position={[ex, ey + 0.5, ez]} height={0.26} />
      </group>
    </>
  );
}

export interface DeployFlightsProps {
  /** Deploys that shipped this tick (the feed's deploysNow): each starts one flight. */
  deploys: readonly DeployEvent[];
  /** Where each service's pylon stands, by name. */
  slots: Readonly<Record<string, { pos: readonly [number, number] }>>;
  /** Height of a service's beacon, where its flight lands. */
  topOf: (service: string) => number;
  reduce: boolean;
}

export function DeployFlights({ deploys, slots, topOf, reduce }: DeployFlightsProps) {
  const [flights, setFlights] = useState<Flight[]>([]);
  // Flights outlive the tick that started them, so they are kept here, not
  // derived from the feed (which only lists this tick's deploys).
  useEffect(() => {
    if (deploys.length === 0) return;
    // One flight per service per train: two PRs to one service ship as one
    // version bump, and two tags on one pylon would print over each other.
    const last = new Map(deploys.filter((d) => slots[d.service]).map((d) => [d.service, d]));
    setFlights((f) => [...f, ...[...last.values()].map((d) => ({ key: `${d.id}@${d.tick}`, deploy: d }))]);
  }, [deploys, slots]);
  return (
    <>
      {flights.map((f) => (
        <DeployFlight
          key={f.key}
          deploy={f.deploy}
          to={slots[f.deploy.service]!.pos}
          top={topOf(f.deploy.service)}
          reduce={reduce}
          onDone={() => setFlights((all) => all.filter((x) => x.key !== f.key))}
        />
      ))}
    </>
  );
}

function fmtAge(ticks: number): string {
  const min = Math.round((ticks * 1.5) / 60);
  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

export interface FactoryHallProps {
  pipeline: PipelineState;
  /** The pipeline layer: crates on the line and the scoreboard's numbers. */
  showItems: boolean;
  /** Replaying a past day: the line was not recorded then, so it stands empty under this caption. */
  replayCaption?: string;
  selectedId?: string;
  /** Orbit mode only: crates are clickable when this is set. */
  onSelect?: (ref: SelectionRef) => void;
  reduce: boolean;
}

const NO_ITEMS: readonly [] = [];

export function FactoryHall({ pipeline, showItems, replayCaption, selectedId, onSelect, reduce }: FactoryHallProps) {
  const live = useMemo(() => workLineItems(pipeline), [pipeline]);
  const items = showItems && !replayCaption ? live : NO_ITEMS;
  const review = pipeline.items.filter((i) => i.stage === "review");
  const oldest = review.reduce((n, i) => Math.max(n, i.stageAge), 0);
  const { minX, maxX, minZ } = HALL.rect;
  return (
    <>
      <WorkLine
        path={BELT}
        stations={LINE_STATIONS}
        items={items}
        width={BELT_W}
        crateSize={0.42}
        cols={2}
        pileRows={5}
        deployTarget={LAUNCH}
        rejectAt={REJECT_AT}
        selectedId={selectedId}
        onSelect={onSelect ? (id) => onSelect({ kind: "work", id }) : undefined}
        onSelectStation={onSelect ? (id) => onSelect({ kind: "stage", id }) : undefined}
        reduce={reduce}
      />
      {/* The hall's scoreboard, on its back wall where anyone coming through the door faces it. */}
      <InfraLabel
        position={[(minX + maxX) / 2, 3.1, minZ + 0.14]}
        billboard={false}
        plate
        width={7.2}
        height={1.3}
        text={replayCaption ? "REPLAY" : `SHIPPED ${pipeline.shipped} · REWORKED ${pipeline.rejected}`}
        sub={replayCaption ?? `${review.length} in review · oldest ${fmtAge(oldest)}`}
        subColor={!replayCaption && review.length >= 16 ? WARN : PAPER_DIM}
      />
      {/* A dark apron under each run so the crates read against the grid. */}
      {HALL_SOLIDS.slice(0, BELT.length - 1).map((b, i) => (
        <mesh key={i} position={[b.pos[0], 0.006, b.pos[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[b.size[0] + 1.6, b.size[2] + 1.6]} />
          <meshBasicMaterial color={INK} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}
