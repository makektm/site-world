// One domain's room: a pylon per service, its replicas in orbit round it, its
// name on the floor, and a live dashboard on the wall. Every domain room is
// this factory with different data — adding a fifth domain is a list entry,
// not a new component.
//
// What the shapes mean:
//   pylon height   traffic (rps), on a log scale, easing as it changes
//   beacon colour  the service's health
//   orbiting cubes its replicas, each coloured by its own health; a dead
//                  replica stops orbiting
import { useEffect, useMemo, useRef } from "react";
import { Edges, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { damp } from "maath/easing";
import { AdditiveBlending, type Group, type Mesh } from "three";
import {
  BOARD_STANDOFF, CRITICAL, INFO, INK, OK, PAPER, PAPER_DIM, WALL_FILL, WARN,
  defineRoom, fitText, getGlowTexture, hungOnWall, orbitAngle, orbitPos, ringPoints, useCanvasTexture,
} from "site-world";
import { ROOMS } from "./layout";
import { HEALTH_LABEL, SERVICES, useFeed, type Domain, type Health, type ServiceDef, type ServiceState } from "./services";

export const HEALTH_COLOR: Record<Health, string> = { ok: OK, warn: WARN, down: CRITICAL };

const PYLON_R = 0.26;
const ORBIT_R = 1.05;
const SPIN = 0.5; // rad/s

/** rps -> pylon height: 100 rps stands 1.2m, 3000 rps about 3.4m. */
export function pylonHeight(rps: number): number {
  return 1.2 + Math.max(0, Math.log10(Math.max(rps, 1) / 100)) * 1.5;
}

function Pylon({ def, state }: { def: ServiceDef; state: ServiceState }) {
  const shaft = useRef<Mesh>(null);
  const top = useRef<Group>(null);
  const cubes = useRef<(Group | null)[]>([]);
  const live = useRef({ h: pylonHeight(state.rps) });
  const phase = useMemo(() => (def.at[0] * 7 + def.at[1] * 3) % 1, [def.at]);
  const ring = useMemo(() => ringPoints(def.at as [number, number], ORBIT_R, 0.02, 48), [def.at]);
  const want = pylonHeight(state.rps);
  const color = HEALTH_COLOR[state.health];

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
      const [x, z] = orbitPos(def.at as [number, number], ORBIT_R, orbitAngle(phase + i / n, r === "down" ? 0 : t, speed));
      const y = r === "down" ? 0.12 : 0.9 + (h - 0.9) * ((i + 0.5) / n);
      g.position.set(x, y, z);
      g.rotation.y = r === "down" ? 0.4 : t * 1.4 + i;
    });
  });

  return (
    <group>
      <mesh ref={shaft} position={[def.at[0], 0.5, def.at[1]]}>
        <cylinderGeometry args={[PYLON_R * 0.7, PYLON_R, 1, 6]} />
        <meshBasicMaterial color={WALL_FILL} />
        <Edges color={PAPER} />
      </mesh>
      <group ref={top} position={[def.at[0], 2, def.at[1]]}>
        <mesh>
          <octahedronGeometry args={[0.17, 0]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        <sprite scale={[1.5, 1.5, 1]}>
          <spriteMaterial map={getGlowTexture()} color={color} transparent opacity={0.55} depthWrite={false} blending={AdditiveBlending} />
        </sprite>
      </group>
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
      <NamePlate def={def} state={state} />
    </group>
  );
}

/** The service's name and its numbers, painted on the floor in front of it. */
function NamePlate({ def, state }: { def: ServiceDef; state: ServiceState }) {
  const W = 2.3;
  const H = 0.62;
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
      ctx.fillText(fitText(ctx, def.name, w - 20), w / 2, h * 0.34);
      ctx.fillStyle = HEALTH_COLOR[state.health];
      ctx.font = "34px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.fillText(line, w / 2, h * 0.76);
      texture.needsUpdate = true;
    };
    paint();
    void document.fonts?.ready.then(paint);
    return () => {
      alive = false;
    };
  }, [canvas, texture, def.name, line, state.health]);
  return (
    <mesh position={[def.at[0], 0.015, def.at[1] + ORBIT_R + 0.55]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[W, H]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

// The dashboard: the domain's services in rows, redrawn on every feed tick.
const BOARD_W = 3.8;
const BOARD_H = 2.1;
const PX = 300;

function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number, title: string, rows: readonly [ServiceDef, ServiceState][]) {
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
  rows: readonly [ServiceDef, ServiceState][];
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
  domain: Domain;
  /** Where the dashboard hangs: a wall centre-line point and the turn that
   * faces it into the room (0 faces +z, PI -z, PI/2 +x, -PI/2 -x). */
  board: { wall: readonly [number, number]; rotationY: number };
}

export function serviceRoom({ domain, board }: ServiceRoomSpec) {
  const defs = SERVICES.filter((s) => s.domain === domain);
  const info = ROOMS[domain];
  return defineRoom({
    id: domain,
    useModel() {
      const feed = useFeed();
      // A new array only when the feed ticks, so the board repaints once a tick.
      return useMemo(() => defs.map((d) => [d, feed[d.name]!] as [ServiceDef, ServiceState]), [feed]);
    },
    Scene({ model }) {
      return (
        <>
          {model.map(([def, state]) => <Pylon key={def.name} def={def} state={state} />)}
          <Board title={info.name} wall={board.wall} rotationY={board.rotationY} rows={model} />
        </>
      );
    },
    // The pylons are solid; the replicas orbiting them are not.
    Colliders() {
      return (
        <>
          {defs.map((d) => (
            <mesh key={d.name} position={[d.at[0], 2, d.at[1]]}>
              <cylinderGeometry args={[PYLON_R + 0.05, PYLON_R + 0.05, 4, 8]} />
            </mesh>
          ))}
        </>
      );
    },
  });
}
