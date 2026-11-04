// A room with no terminal: a cluster drawn as a pylon with its services in
// orbit around it, and a read-only dashboard hung on the north wall. The data
// is fake and fixed; a real host would feed both from useModel.
import { useEffect, useMemo, useRef } from "react";
import { Edges, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, type Group } from "three";
import {
  BOARD_STANDOFF, CRITICAL, INFO, INK, OK, PAPER, PAPER_DIM, PHOS, WALL_FILL, WARN,
  DEFAULT_ORBIT_SPEED, defineRoom, getGlowTexture, hungOnWall, orbitAngle, orbitPos, ringPoints, useCanvasTexture,
} from "site-world";
import { HALF } from "./layout";

const PYLON: [number, number] = [2.6, 1.2];
const PYLON_R = 0.28;
const PYLON_H = 3.4;

type Status = "ok" | "warn" | "down";
interface Service { name: string; status: Status; rps: number; p99: number; load: readonly number[] }

const COLOR: Record<Status, string> = { ok: OK, warn: WARN, down: CRITICAL };

const SERVICES: readonly Service[] = [
  { name: "api-gateway", status: "ok", rps: 1840, p99: 42, load: [5, 6, 6, 7, 8, 7, 9, 8, 9, 10, 9, 11] },
  { name: "auth", status: "ok", rps: 620, p99: 18, load: [4, 4, 5, 5, 4, 5, 6, 5, 5, 6, 6, 5] },
  { name: "billing", status: "warn", rps: 95, p99: 310, load: [3, 3, 4, 6, 8, 7, 9, 11, 10, 12, 11, 12] },
  { name: "search", status: "ok", rps: 1310, p99: 64, load: [8, 9, 8, 9, 10, 9, 10, 11, 10, 9, 10, 11] },
  { name: "ingest-worker", status: "down", rps: 0, p99: 0, load: [7, 8, 7, 8, 6, 5, 3, 1, 0, 0, 0, 0] },
  { name: "notifier", status: "ok", rps: 210, p99: 27, load: [2, 3, 2, 3, 3, 4, 3, 3, 4, 3, 4, 4] },
];

// Each service rides its own ring: a radius, a height and a speed of its own.
const ORBITS = SERVICES.map((s, i) => ({
  ...s,
  radius: 0.9 + (i % 3) * 0.35,
  y: 1.1 + i * 0.32,
  speed: DEFAULT_ORBIT_SPEED * (i % 2 === 0 ? 2.2 : -1.6),
  phase: i / SERVICES.length,
}));

function Pylon() {
  return (
    <group position={[PYLON[0], 0, PYLON[1]]}>
      <mesh position={[0, PYLON_H / 2, 0]}>
        <cylinderGeometry args={[PYLON_R * 0.7, PYLON_R, PYLON_H, 6]} />
        <meshBasicMaterial color={WALL_FILL} />
        <Edges color={PAPER} />
      </mesh>
      {/* the beacon on top, and a glow so it reads as live */}
      <mesh position={[0, PYLON_H + 0.18, 0]}>
        <octahedronGeometry args={[0.18, 0]} />
        <meshBasicMaterial color={PHOS} toneMapped={false} />
      </mesh>
      <sprite position={[0, PYLON_H + 0.18, 0]} scale={[1.6, 1.6, 1]}>
        <spriteMaterial map={getGlowTexture()} color={PHOS} transparent opacity={0.6} depthWrite={false} blending={AdditiveBlending} />
      </sprite>
      {/* a footing ring on the floor */}
      <Line points={ringPoints([0, 0], PYLON_R * 2.2, 0.01, 6)} color={PAPER} lineWidth={1} transparent opacity={0.7} />
    </group>
  );
}

function Orbiters() {
  const bodies = useRef<(Group | null)[]>([]);
  const rings = useMemo(() => ORBITS.map((o) => ringPoints(PYLON, o.radius, o.y)), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    ORBITS.forEach((o, i) => {
      const body = bodies.current[i];
      if (!body) return;
      const [x, z] = orbitPos(PYLON, o.radius, orbitAngle(o.phase, t, o.status === "down" ? 0 : o.speed));
      body.position.set(x, o.y, z);
      body.rotation.y = t * 1.5 + i;
    });
  });
  return (
    <>
      {ORBITS.map((o, i) => (
        <group key={o.name}>
          <Line points={rings[i]!} color={COLOR[o.status]} lineWidth={1} transparent opacity={0.28} dashed dashSize={0.12} gapSize={0.08} />
          <group ref={(el) => { bodies.current[i] = el; }}>
            <mesh>
              <boxGeometry args={[0.2, 0.2, 0.2]} />
              <meshBasicMaterial color={INK} />
              <Edges color={COLOR[o.status]} />
            </mesh>
            <sprite scale={[0.7, 0.7, 1]}>
              <spriteMaterial map={getGlowTexture()} color={COLOR[o.status]} transparent opacity={0.45} depthWrite={false} blending={AdditiveBlending} />
            </sprite>
          </group>
        </group>
      ))}
    </>
  );
}

// The dashboard: a canvas drawn once, hung on the north wall's inner face.
const BOARD_W = 3.6;
const BOARD_H = 2.0;
const BOARD_WALL: [number, number] = [-1.4, -HALF];
const PX = 300; // texels per metre

function drawDashboard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const mono = (px: number, bold = false) => `${bold ? "700 " : ""}${px}px 'IBM Plex Mono', ui-monospace, monospace`;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = PAPER_DIM;
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PAPER;
  ctx.font = mono(44, true);
  ctx.fillText("CLUSTER EU-1", 48, 82);
  const up = SERVICES.filter((s) => s.status !== "down").length;
  ctx.font = mono(30);
  ctx.fillStyle = PAPER_DIM;
  ctx.textAlign = "right";
  ctx.fillText(`${up}/${SERVICES.length} up · ${SERVICES.reduce((n, s) => n + s.rps, 0)} rps`, w - 48, 80);
  ctx.textAlign = "left";

  // Column heads
  const top = 150;
  const rowH = (h - top - 40) / SERVICES.length;
  ctx.font = mono(22);
  ctx.fillStyle = PAPER_DIM;
  ctx.fillText("SERVICE", 90, top - 16);
  ctx.fillText("RPS", 470, top - 16);
  ctx.fillText("P99", 620, top - 16);
  ctx.fillText("LOAD · 1H", 780, top - 16);

  SERVICES.forEach((s, i) => {
    const y = top + i * rowH;
    const mid = y + rowH / 2;
    ctx.fillStyle = i % 2 === 0 ? "rgba(236,231,218,0.04)" : "transparent";
    ctx.fillRect(30, y, w - 60, rowH);
    ctx.fillStyle = COLOR[s.status];
    ctx.beginPath();
    ctx.arc(60, mid, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = mono(30, true);
    ctx.fillStyle = PAPER;
    ctx.fillText(s.name, 90, mid + 10);
    ctx.font = mono(30);
    ctx.fillText(s.status === "down" ? "—" : String(s.rps), 470, mid + 10);
    ctx.fillStyle = s.p99 > 200 ? WARN : PAPER;
    ctx.fillText(s.status === "down" ? "—" : `${s.p99}ms`, 620, mid + 10);
    // A bar sparkline of the last hour.
    const bw = 22;
    const max = 12;
    s.load.forEach((v, j) => {
      const bh = Math.max(3, (v / max) * (rowH - 24));
      ctx.fillStyle = s.status === "ok" ? INFO : COLOR[s.status];
      ctx.globalAlpha = 0.45 + 0.55 * (j / s.load.length);
      ctx.fillRect(780 + j * (bw + 6), mid + (rowH - 24) / 2 - bh, bw, bh);
    });
    ctx.globalAlpha = 1;
  });
}

function Dashboard() {
  const { canvas, texture } = useCanvasTexture(BOARD_W * PX, BOARD_H * PX);
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const paint = () => {
      if (!alive) return;
      drawDashboard(ctx, canvas.width, canvas.height);
      texture.needsUpdate = true;
    };
    paint();
    // Again once webfonts land: a canvas never redraws on its own.
    void document.fonts?.ready.then(paint);
    return () => {
      alive = false;
    };
  }, [canvas, texture]);
  const [x, z] = hungOnWall(BOARD_WALL, 0, BOARD_STANDOFF);
  return (
    <mesh position={[x, 2.15, z]}>
      <planeGeometry args={[BOARD_W, BOARD_H]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
      <Edges color={PAPER} />
    </mesh>
  );
}

export const clusterRoom = defineRoom({
  id: "cluster",
  useModel: () => null,
  Scene() {
    return (
      <>
        <Pylon />
        <Orbiters />
        <Dashboard />
      </>
    );
  },
  // The pylon is solid; the orbiting services are not.
  Colliders() {
    return (
      <mesh position={[PYLON[0], PYLON_H / 2, PYLON[1]]}>
        <cylinderGeometry args={[PYLON_R + 0.05, PYLON_R + 0.05, PYLON_H, 8]} />
      </mesh>
    );
  },
});
