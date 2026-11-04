// One domain's room: a pylon per service, its replicas in orbit round it, its
// name on the floor, and a live dashboard on the wall. Every domain room is
// this factory with different data: the room, its slots and the board's wall
// come from the catalog plan (plan.ts), so a new domain or service is a
// catalogue entry, not a new component or a hand-measured coordinate.
//
// What the shapes mean:
//   pylon height   traffic (rps), on a log scale, easing as it changes
//   beacon colour  the service's health
//   orbiting cubes its replicas, each coloured by its own health; a dead
//                  replica stops orbiting
//   trim           who made it: cream edges for a person's PR, blue for an
//                  agent session (the same blue as an agent's sticky note)
//   dark shaft     an orphan: nothing calls it and it serves no traffic
//   blank plate    nobody owns it but the agent session that made it
import { useEffect, useMemo, useRef } from "react";
import { Edges, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { damp } from "maath/easing";
import { AdditiveBlending, type Group, type Mesh } from "three";
import {
  BOARD_STANDOFF, CRITICAL, INFO, INK, OK, PAPER, PAPER_DIM, WALL_FILL, WARN,
  defineRoom, fitText, getGlowTexture, hungOnWall, orbitAngle, orbitPos, ringPoints, useCanvasTexture, type Lod,
} from "site-world";
import type { LayoutRoom, ServiceSlot } from "site-world";
import type { FactoryService } from "./factory/catalog";
import { HEALTH_LABEL, useFeed, type Health, type ServiceState } from "./liveFeed";
import type { BoardSpot } from "./plan";
import type { PylonLook } from "./sprawlLook";
import { useLod } from "./useLod";

type Slot = ServiceSlot<FactoryService>;

export const HEALTH_COLOR: Record<Health, string> = { ok: OK, warn: WARN, down: CRITICAL };

const PYLON_R = 0.26;
const ORBIT_R = 1.05;
const SPIN = 0.5; // rad/s

/** Shaft and trim by who made the service; an orphan's dust overrides both. */
const SHAFT = { human: WALL_FILL, agent: "#13223a", orphan: "#07090d" } as const;
const TRIM = { human: PAPER, agent: INFO, orphan: "#57544c" } as const;

const DEFAULT_LOOK: PylonLook = { origin: "human", rings: 1, orphan: false, unowned: false, pair: null };

/** rps -> pylon height: 100 rps stands 1.2m, 3000 rps about 3.4m. */
export function pylonHeight(rps: number): number {
  return 1.2 + Math.max(0, Math.log10(Math.max(rps, 1) / 100)) * 1.5;
}

/** A pylon, drawn about its own origin; the caller's group puts it on its slot,
 * turned so the name plate (local +z) faces the aisle. */
function Pylon({ def, state, phase, look, lod }: { def: FactoryService; state: ServiceState; phase: number; look: PylonLook; lod: Lod }) {
  const shaft = useRef<Mesh>(null);
  const top = useRef<Group>(null);
  const cubes = useRef<(Group | null)[]>([]);
  const live = useRef({ h: pylonHeight(state.rps) });
  const ring = useMemo(() => ringPoints([0, 0], ORBIT_R, 0.02, 48), []);
  const want = pylonHeight(state.rps);
  // An orphan's beacon is out: there is no traffic for it to report on.
  const color = look.orphan ? PAPER_DIM : HEALTH_COLOR[state.health];
  const kind = look.orphan ? "orphan" : look.origin;
  // Far away, a pylon is its shaft and beacon; replicas and plate are detail.
  const far = lod === "campus";

  useFrame(({ clock }, dt) => {
    damp(live.current, "h", want, 0.6, dt);
    const h = live.current.h;
    if (shaft.current) {
      shaft.current.scale.y = h;
      shaft.current.position.y = h / 2;
    }
    if (top.current) top.current.position.y = h + 0.2;
    const t = clock.elapsedTime;
    const n = state.replicas.length;
    state.replicas.forEach((r, i) => {
      const g = cubes.current[i];
      if (!g) return;
      // A dead replica drops out of orbit and sits on the floor ring.
      const speed = r === "down" ? 0 : SPIN;
      const [x, z] = orbitPos([0, 0], ORBIT_R, orbitAngle(phase + i / n, r === "down" ? 0 : t, speed));
      const y = r === "down" ? 0.12 : 0.9 + (h - 0.9) * ((i + 0.5) / n);
      g.position.set(x, y, z);
      g.rotation.y = r === "down" ? 0.4 : t * 1.4 + i;
    });
  });

  return (
    <group>
      <mesh ref={shaft} position={[0, 0.5, 0]}>
        <cylinderGeometry args={[PYLON_R * 0.7, PYLON_R, 1, 6]} />
        <meshBasicMaterial color={SHAFT[kind]} />
        <Edges color={TRIM[kind]} />
      </mesh>
      <group ref={top} position={[0, 2, 0]}>
        <mesh>
          <octahedronGeometry args={[0.17, 0]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        <sprite scale={[1.5, 1.5, 1]}>
          <spriteMaterial map={getGlowTexture()} color={color} transparent opacity={look.orphan ? 0.12 : 0.55} depthWrite={false} blending={AdditiveBlending} />
        </sprite>
      </group>
      {!far && (
        <>
          <Line points={ring} color={PAPER_DIM} lineWidth={1} transparent opacity={0.45} dashed dashSize={0.1} gapSize={0.08} />
          {state.replicas.map((r, i) => (
            <group key={i} ref={(el) => { cubes.current[i] = el; }}>
              <mesh>
                <boxGeometry args={[0.18, 0.18, 0.18]} />
                <meshBasicMaterial color={INK} />
                <Edges color={HEALTH_COLOR[r]} />
              </mesh>
              {r !== "ok" && (
                <sprite scale={[0.8, 0.8, 1]}>
                  <spriteMaterial map={getGlowTexture()} color={HEALTH_COLOR[r]} transparent opacity={0.6} depthWrite={false} blending={AdditiveBlending} />
                </sprite>
              )}
            </group>
          ))}
          {look.unowned ? <BlankPlate name={def.name} by={def.createdBy} /> : <NamePlate def={def} state={state} />}
        </>
      )}
    </group>
  );
}

/** The service's name and its numbers, painted on the floor in front of it. */
function NamePlate({ def, state }: { def: FactoryService; state: ServiceState }) {
  const W = 2.3;
  const H = 0.8;
  const { canvas, texture } = useCanvasTexture(Math.round(W * 260), Math.round(H * 260));
  const line = `${state.rps} rps · p99 ${state.p99}ms`;
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const paint = () => {
      if (!alive) return;
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = PAPER;
      ctx.font = "700 62px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.fillText(fitText(ctx, def.name, w - 20), w / 2, h * 0.27);
      ctx.fillStyle = HEALTH_COLOR[state.health];
      ctx.font = "34px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.fillText(line, w / 2, h * 0.6);
      // Who made it and who answers for it: a dot for a person's PR, a diamond for an agent session.
      ctx.fillStyle = def.origin === "agent" ? INFO : PAPER_DIM;
      ctx.font = "28px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.fillText(fitText(ctx, `${def.origin === "agent" ? "◆" : "●"} ${def.createdBy} · ${def.owner}`, w - 20), w / 2, h * 0.86);
      texture.needsUpdate = true;
    };
    paint();
    void document.fonts?.ready.then(paint);
    return () => {
      alive = false;
    };
  }, [canvas, texture, def.name, def.origin, def.createdBy, def.owner, line, state.health]);
  return (
    <mesh position={[0, 0.015, ORBIT_R + 0.64]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[W, H]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/** The plate of a service nobody owns: an empty dashed frame where the name
 * should be, with the name small and dim — present, but unclaimed. */
function BlankPlate({ name, by }: { name: string; by: string }) {
  const W = 2.3;
  const H = 0.8;
  const { canvas, texture } = useCanvasTexture(Math.round(W * 260), Math.round(H * 260));
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const paint = () => {
      if (!alive) return;
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = PAPER_DIM;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 4;
      ctx.setLineDash([18, 12]);
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = WARN;
      ctx.font = "700 40px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.fillText("NO OWNER", w / 2, h * 0.36);
      ctx.fillStyle = PAPER_DIM;
      ctx.font = "28px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.fillText(fitText(ctx, `${name} · left by ${by}`, w - 40), w / 2, h * 0.68);
      texture.needsUpdate = true;
    };
    paint();
    void document.fonts?.ready.then(paint);
    return () => {
      alive = false;
    };
  }, [canvas, texture, name, by]);
  return (
    <mesh position={[0, 0.015, ORBIT_R + 0.64]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[W, H]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

// The dashboard: the domain's services in rows, redrawn on every feed tick.
const BOARD_W = 3.8;
const BOARD_H = 2.1;
const PX = 300;

function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number, title: string, rows: readonly [FactoryService, ServiceState][]) {
  const mono = (px: number, bold = false) => `${bold ? "700 " : ""}${px}px 'IBM Plex Mono', ui-monospace, monospace`;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = PAPER_DIM;
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = PAPER;
  ctx.font = mono(48, true);
  ctx.fillText(title, 44, 84);
  const worst: Health = rows.some(([, s]) => s.health === "down") ? "down" : rows.some(([, s]) => s.health === "warn") ? "warn" : "ok";
  ctx.textAlign = "right";
  ctx.fillStyle = HEALTH_COLOR[worst];
  ctx.font = mono(34, true);
  ctx.fillText(HEALTH_LABEL[worst], w - 44, 82);
  ctx.textAlign = "left";

  const top = 150;
  ctx.font = mono(22);
  ctx.fillStyle = PAPER_DIM;
  const cols = { name: 76, reps: 430, rps: 590, p99: 730, err: 880, spark: 1000 };
  ctx.fillText("SERVICE", cols.name, top - 18);
  ctx.fillText("REPLICAS", cols.reps, top - 18);
  ctx.fillText("RPS", cols.rps, top - 18);
  ctx.fillText("P99", cols.p99, top - 18);
  ctx.fillText("ERR", cols.err, top - 18);
  ctx.fillText("RPS · 36s", cols.spark, top - 18);
  const rowH = Math.min(120, (h - top - 30) / Math.max(rows.length, 1));
  rows.forEach(([def, s], i) => {
    const y = top + i * rowH;
    const mid = y + rowH / 2;
    ctx.fillStyle = i % 2 === 0 ? "rgba(236,231,218,0.05)" : "transparent";
    ctx.fillRect(30, y, w - 60, rowH);
    ctx.fillStyle = HEALTH_COLOR[s.health];
    ctx.beginPath();
    ctx.arc(50, mid, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.font = mono(32, true);
    ctx.fillText(fitText(ctx, def.name, cols.reps - cols.name - 20), cols.name, mid + 11);
    s.replicas.forEach((r, j) => {
      ctx.fillStyle = HEALTH_COLOR[r];
      ctx.fillRect(cols.reps + j * 26, mid - 11, 18, 22);
    });
    ctx.font = mono(30);
    ctx.fillStyle = PAPER;
    ctx.fillText(String(s.rps), cols.rps, mid + 11);
    ctx.fillStyle = s.p99 > def.baseP99 * 2 ? WARN : PAPER;
    ctx.fillText(`${s.p99}ms`, cols.p99, mid + 11);
    ctx.fillStyle = s.errors > 0.02 ? CRITICAL : PAPER;
    ctx.fillText(`${(s.errors * 100).toFixed(1)}%`, cols.err, mid + 11);
    const max = Math.max(...s.history) || 1;
    const bw = (w - 44 - cols.spark) / s.history.length;
    s.history.forEach((v, j) => {
      const bh = Math.max(3, (v / max) * (rowH - 30));
      ctx.fillStyle = s.health === "ok" ? INFO : HEALTH_COLOR[s.health];
      ctx.globalAlpha = 0.35 + 0.65 * (j / s.history.length);
      ctx.fillRect(cols.spark + j * bw, mid + (rowH - 30) / 2 - bh, bw - 3, bh);
    });
    ctx.globalAlpha = 1;
  });
}

function Board({ title, wall, rotationY, rows }: {
  title: string;
  wall: readonly [number, number];
  rotationY: number;
  rows: readonly [FactoryService, ServiceState][];
}) {
  const { canvas, texture } = useCanvasTexture(BOARD_W * PX, BOARD_H * PX);
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const paint = () => {
      if (!alive) return;
      drawBoard(ctx, canvas.width, canvas.height, title, rows);
      texture.needsUpdate = true;
    };
    paint();
    void document.fonts?.ready.then(paint);
    return () => {
      alive = false;
    };
  }, [canvas, texture, title, rows]);
  const [x, z] = hungOnWall(wall, rotationY, BOARD_STANDOFF);
  return (
    <mesh position={[x, 2.25, z]} rotation={[0, rotationY, 0]}>
      <planeGeometry args={[BOARD_W, BOARD_H]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
      <Edges color={PAPER} />
    </mesh>
  );
}

export interface ServiceRoomSpec {
  /** The room from the plan: its id is the domain, its label titles the board. */
  room: LayoutRoom;
  /** The room's service slots, in the plan's order. */
  slots: readonly Slot[];
  /** Where the dashboard hangs. */
  board: BoardSpot;
  /** How each service's pylon shows its origin and sprawl findings, by name. */
  looks: ReadonlyMap<string, PylonLook>;
}

/** Stable per service, so replicas start spread round the ring instead of in step. */
function phaseOf(slot: Slot): number {
  return (slot.pos[0] * 7 + slot.pos[1] * 3 + slot.index * 0.37) % 1;
}

export function serviceRoom({ room, slots, board, looks }: ServiceRoomSpec) {
  return defineRoom({
    id: room.id,
    useModel() {
      const feed = useFeed();
      // A new array only when the feed ticks, so the board repaints once a tick.
      return useMemo(() => slots.map((s) => [s.service, feed[s.name]!] as [FactoryService, ServiceState]), [feed]);
    },
    Scene({ model }) {
      const lod = useLod(room.rect);
      return (
        <>
          {model.map(([def, state], i) => {
            const slot = slots[i]!;
            return (
              <group key={def.name} position={[slot.pos[0], 0, slot.pos[1]]} rotation={[0, slot.facing, 0]}>
                <Pylon def={def} state={state} phase={phaseOf(slot)} look={looks.get(def.name) ?? DEFAULT_LOOK} lod={lod} />
              </group>
            );
          })}
          <Board title={room.label} wall={board.wall} rotationY={board.rotationY} rows={model} />
        </>
      );
    },
    // The pylons are solid; the replicas orbiting them are not.
    Colliders() {
      return (
        <>
          {slots.map((s) => (
            <mesh key={s.name} position={[s.pos[0], 2, s.pos[1]]}>
              <cylinderGeometry args={[PYLON_R + 0.05, PYLON_R + 0.05, 4, 8]} />
            </mesh>
          ))}
        </>
      );
    },
  });
}
