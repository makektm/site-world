// Where the building meets the outside world: a raised platform outside the
// walls with one bay per external dependency (a payment provider, an LLM API,
// an identity provider). Each bay is a stack of crates — goods the company
// does not make itself — with a terminal block showing latency and error
// rate, and a status light. Putting them outside the building says what the
// pylons inside cannot: these are not ours to fix, only to watch.
import { useRef } from "react";
import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, type Sprite } from "three";
import { CRITICAL, INK, PAPER, PAPER_DIM, WALL_FILL, WARN, fitText, getGlowTexture, hashStr } from "../core/engine";
import { INFRA_HEALTH_COLOR, bayOffsets, bayRowWidth, type InfraHealth } from "./infraMath";
import { InfraLabel, infraFont, useInfraPaint } from "./infraPaint";

export interface DockBay {
  /** Stable key; also seeds the crate stack's shape so a bay looks the same every visit. */
  id: string;
  /** Provider name, e.g. "Stripe". */
  label: string;
  /** What it is for, e.g. "payments". */
  kind?: string;
  status: InfraHealth;
  latencyMs?: number;
  /** 0..1 */
  errorRate?: number;
}

export interface LoadingDockProps {
  /** Centre of the platform's footprint on the floor. */
  position: readonly [number, number, number];
  /** Turn about y; the bays face local +z (0 faces +z, PI faces -z). */
  rotationY?: number;
  title?: string;
  bays: readonly DockBay[];
  bayWidth?: number;
  /** Reduced motion: a down bay's light holds steady instead of blinking. */
  reduce?: boolean;
}

const DECK_H = 0.35;
const DECK_D = 2.4;
/** Metres between bays. Exported so a host laying pick boxes, colliders or
 * camera targets over the bays uses the spacing that is drawn. */
export const DOCK_BAY_GAP = 0.25;
// Error rate above which the badge's figure turns critical, matching the
// company example's dashboard threshold.
const ERR_HOT = 0.02;

/** One terminal block's screen: name, kind, latency and error rate. */
function BayScreen({ bay }: { bay: DockBay }) {
  const W = 0.9;
  const H = 0.6;
  const latency = bay.latencyMs === undefined ? "–" : `${Math.round(bay.latencyMs)}ms`;
  const err = bay.errorRate === undefined ? "–" : `${(bay.errorRate * 100).toFixed(1)}%`;
  const texture = useInfraPaint(
    Math.round(W * 400),
    Math.round(H * 400),
    (ctx, w, h) => {
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = INFRA_HEALTH_COLOR[bay.status];
      ctx.lineWidth = 6;
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = PAPER;
      ctx.font = infraFont(44, true);
      ctx.fillText(fitText(ctx, bay.label, w - 40), 20, 62);
      ctx.fillStyle = PAPER_DIM;
      ctx.font = infraFont(24);
      if (bay.kind) ctx.fillText(fitText(ctx, bay.kind, w - 40), 20, 98);
      ctx.font = infraFont(22);
      ctx.fillText("LATENCY", 20, 150);
      ctx.fillText("ERR", w / 2 + 10, 150);
      ctx.font = infraFont(40, true);
      ctx.fillStyle = bay.status === "ok" ? PAPER : INFRA_HEALTH_COLOR[bay.status];
      ctx.fillText(latency, 20, 200);
      ctx.fillStyle = (bay.errorRate ?? 0) > ERR_HOT ? CRITICAL : PAPER;
      ctx.fillText(err, w / 2 + 10, 200);
    },
    [bay.label, bay.kind, bay.status, latency, err],
  );
  return (
    <mesh>
      <planeGeometry args={[W, H]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function Bay({ bay, x, width, reduce }: { bay: DockBay; x: number; width: number; reduce: boolean }) {
  const glow = useRef<Sprite>(null);
  const color = INFRA_HEALTH_COLOR[bay.status];
  // Two or three crates, sized and turned from the id: varied, but stable.
  const seed = hashStr(bay.id);
  const crates = 2 + (seed % 2);
  useFrame(({ clock }) => {
    if (!glow.current) return;
    // A down dependency blinks; a warn one breathes; ok stays put.
    const t = clock.elapsedTime;
    const k = reduce || bay.status === "ok" ? 1 : bay.status === "down" ? (Math.sin(t * 6) > 0 ? 1 : 0.25) : 0.75 + Math.sin(t * 2) * 0.25;
    glow.current.material.opacity = 0.7 * k;
  });
  const crateW = Math.min(0.55, width * 0.32);
  return (
    <group position={[x, DECK_H, 0]}>
      {/* Bay floor marking */}
      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, DECK_D * 0.85]} />
        <meshBasicMaterial color={color} transparent opacity={0.06} depthWrite={false} toneMapped={false} />
        <Edges color={PAPER_DIM} />
      </mesh>
      {/* Crate stack, back left */}
      {Array.from({ length: crates }, (_, i) => {
        const s = crateW * (1 - i * 0.12);
        const turn = (((seed >> (i * 3)) % 7) - 3) * 0.08;
        return (
          <mesh key={i} position={[-width * 0.22, s / 2 + i * crateW * 0.9, -0.45]} rotation={[0, turn, 0]}>
            <boxGeometry args={[s, s * 0.9, s]} />
            <meshBasicMaterial color={WALL_FILL} />
            <Edges color={i === crates - 1 ? color : PAPER} />
          </mesh>
        );
      })}
      {/* Terminal block: a pedestal with the screen tilted up toward a walker. */}
      <mesh position={[width * 0.2, 0.45, 0.15]}>
        <boxGeometry args={[0.5, 0.9, 0.35]} />
        <meshBasicMaterial color={WALL_FILL} />
        <Edges color={PAPER} />
      </mesh>
      <group position={[width * 0.2, 1.15, 0.2]} rotation={[-0.35, 0, 0]}>
        <BayScreen bay={bay} />
      </group>
      {/* Status light on a short mast */}
      <mesh position={[width * 0.42, 0.7, -0.6]}>
        <cylinderGeometry args={[0.02, 0.02, 1.4, 6]} />
        <meshBasicMaterial color={PAPER_DIM} />
      </mesh>
      <group position={[width * 0.42, 1.45, -0.6]}>
        <mesh>
          <sphereGeometry args={[0.09, 16, 12]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        <sprite ref={glow} scale={[0.9, 0.9, 1]}>
          <spriteMaterial map={getGlowTexture()} color={color} transparent opacity={0.7} depthWrite={false} blending={AdditiveBlending} />
        </sprite>
      </group>
    </group>
  );
}

/** A platform of bays for external dependencies, each with crates, a status light and a latency/error badge. */
export function LoadingDock({
  position, rotationY = 0, title = "LOADING DOCK", bays, bayWidth = 1.7, reduce = false,
}: LoadingDockProps) {
  const xs = bayOffsets(bays.length, bayWidth, DOCK_BAY_GAP);
  const deckW = Math.max(bayWidth, bayRowWidth(bays.length, bayWidth, DOCK_BAY_GAP)) + 0.6;
  const worst: InfraHealth = bays.some((b) => b.status === "down") ? "down" : bays.some((b) => b.status === "warn") ? "warn" : "ok";
  const [x, y, z] = position;
  return (
    <group position={[x, y, z]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, DECK_H / 2, 0]}>
        <boxGeometry args={[deckW, DECK_H, DECK_D]} />
        <meshBasicMaterial color={WALL_FILL} />
        <Edges color={PAPER} />
      </mesh>
      {/* Hazard edge on the loading side: why a dock looks like a dock. */}
      <mesh position={[0, DECK_H - 0.04, DECK_D / 2 + 0.002]}>
        <planeGeometry args={[deckW, 0.06]} />
        <meshBasicMaterial color={WARN} toneMapped={false} />
      </mesh>
      {bays.map((b, i) => (
        <Bay key={b.id} bay={b} x={xs[i]!} width={bayWidth} reduce={reduce} />
      ))}
      <InfraLabel
        position={[0, DECK_H / 2 - 0.02, DECK_D / 2 + 0.004]}
        text={title}
        sub={`${bays.length} external · ${worst === "ok" ? "all ok" : worst === "warn" ? "degraded" : "outage"}`}
        subColor={INFRA_HEALTH_COLOR[worst]}
        billboard={false}
        width={Math.min(deckW - 0.2, 2.6)}
        height={0.22}
      />
    </group>
  );
}
