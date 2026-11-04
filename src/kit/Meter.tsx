// Spend as a physical gauge: token or cloud cost read the way a utility meter
// reads, with the budget as a red line the value runs up against. Two forms —
// a dial for "how close to the limit" at a glance, a bar column for comparing
// several side by side — share one budget rule (infraMath's budgetState).
import { useRef } from "react";
import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { damp } from "maath/easing";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import { CRITICAL, INK, PAPER, PAPER_DIM, WALL_FILL, fitText } from "../core/engine";
import { BUDGET_COLOR, budgetState, compactNumber, dialAngle, unitFill } from "./infraMath";
import { infraFont, useInfraPaint } from "./infraPaint";

export interface MeterProps {
  /** Floor point for a bar; the dial's centre stands `height` above it on a post. */
  position: readonly [number, number, number];
  /** Turn about y; the face looks down local +z. */
  rotationY?: number;
  kind?: "dial" | "bar";
  value: number;
  /** Full scale. Values past it peg at the top. */
  max: number;
  budget?: number;
  label: string;
  /** Appended to the printed value, e.g. "$" is better as `format`; "tok" or "/day" here. */
  unit?: string;
  /** Overrides the printed value entirely, e.g. (v) => `$${v.toFixed(0)}`. */
  format?: (v: number) => string;
  /** Bar column height or dial post height, metres. */
  height?: number;
  /** Reduced motion: the needle/column snaps instead of easing. */
  reduce?: boolean;
}

const PX = 360;

function printed(value: number, unit: string | undefined, format: ((v: number) => string) | undefined): string {
  if (format) return format(value);
  return unit ? `${compactNumber(value)} ${unit}` : compactNumber(value);
}

/** A cost/spend gauge — dial or bar column — with label, value and an optional budget line. */
export function Meter(props: MeterProps) {
  const { position, rotationY = 0 } = props;
  const [x, y, z] = position;
  return (
    <group position={[x, y, z]} rotation={[0, rotationY, 0]}>
      {props.kind === "dial" ? <Dial {...props} /> : <Bar {...props} />}
    </group>
  );
}

const SWEEP = Math.PI * 1.5;

function Dial({ value, max, budget, label, unit, format, height = 1.5, reduce = false }: MeterProps) {
  const R = 0.42;
  const needle = useRef<Group>(null);
  const live = useRef({ a: dialAngle(value, max, SWEEP) });
  const state = budgetState(value, budget);
  const text = printed(value, unit, format);
  const face = useInfraPaint(
    Math.round(R * 2 * PX),
    Math.round(R * 2 * PX),
    (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const r = w / 2 - 8;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = 5;
      ctx.stroke();
      // Canvas angles run clockwise from +x; the dial's zero is at the lower
      // left, `SWEEP` clockwise round the top to the lower right.
      const canvasAngle = (a: number) => -Math.PI / 2 + a;
      const arc = (from: number, to: number, color: string, width: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.82, canvasAngle(from), canvasAngle(to));
        ctx.stroke();
      };
      arc(-SWEEP / 2, SWEEP / 2, PAPER_DIM, 3);
      for (let i = 0; i <= 10; i += 1) {
        const a = canvasAngle(-SWEEP / 2 + (i / 10) * SWEEP);
        const r0 = r * (i % 5 === 0 ? 0.68 : 0.74);
        ctx.strokeStyle = PAPER_DIM;
        ctx.lineWidth = i % 5 === 0 ? 5 : 3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82);
        ctx.stroke();
      }
      if (budget !== undefined && budget > 0 && max > 0) {
        // Everything past the budget is the red zone.
        arc(dialAngle(budget, max, SWEEP), SWEEP / 2, CRITICAL, 12);
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = BUDGET_COLOR[state];
      ctx.font = infraFont(52, true);
      ctx.fillText(fitText(ctx, text, r * 1.2), cx, cy + r * 0.42);
      ctx.fillStyle = PAPER;
      ctx.font = infraFont(28, true);
      ctx.fillText(fitText(ctx, label, r * 1.1), cx, cy + r * 0.72);
      if (budget !== undefined && budget > 0) {
        ctx.fillStyle = PAPER_DIM;
        ctx.font = infraFont(20);
        ctx.fillText(`budget ${printed(budget, unit, format)}`, cx, cy - r * 0.3);
      }
    },
    [text, label, budget, max, state, unit],
  );
  useFrame((_, dt) => {
    const want = dialAngle(value, max, SWEEP);
    if (reduce) live.current.a = want;
    else damp(live.current, "a", want, 0.4, dt);
    // Clockwise on the face is a negative turn about the face's +z.
    if (needle.current) needle.current.rotation.z = -live.current.a;
  });
  return (
    <>
      <mesh position={[0, height / 2, -0.03]}>
        <cylinderGeometry args={[0.03, 0.04, height, 6]} />
        <meshBasicMaterial color={WALL_FILL} />
        <Edges color={PAPER_DIM} />
      </mesh>
      <group position={[0, height + R, 0]}>
        <mesh position={[0, 0, -0.03]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[R + 0.03, R + 0.03, 0.05, 40]} />
          <meshBasicMaterial color={WALL_FILL} />
          <Edges color={PAPER} />
        </mesh>
        <mesh position={[0, 0, 0.001]}>
          <circleGeometry args={[R, 48]} />
          <meshBasicMaterial map={face} toneMapped={false} />
        </mesh>
        <group ref={needle} position={[0, 0, 0.01]}>
          <mesh position={[0, R * 0.36, 0]}>
            <boxGeometry args={[0.018, R * 0.72, 0.01]} />
            <meshBasicMaterial color={BUDGET_COLOR[state]} toneMapped={false} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.02, 12]} />
            <meshBasicMaterial color={PAPER} />
          </mesh>
        </group>
      </group>
    </>
  );
}

function Bar({ value, max, budget, label, unit, format, height = 2, reduce = false }: MeterProps) {
  const W = 0.36;
  const column = useRef<Mesh>(null);
  const want = max > 0 ? unitFill(value / max) : 0;
  const live = useRef({ f: want });
  const state = budgetState(value, budget);
  const color = BUDGET_COLOR[state];
  const text = printed(value, unit, format);
  const budgetY = budget !== undefined && budget > 0 && max > 0 ? unitFill(budget / max) * height : null;
  const plate = useInfraPaint(
    Math.round(1.1 * PX),
    Math.round(0.42 * PX),
    (ctx, w, h) => {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.font = infraFont(54, true);
      ctx.fillText(fitText(ctx, text, w - 16), w / 2, h * 0.33);
      ctx.fillStyle = PAPER;
      ctx.font = infraFont(32, true);
      ctx.fillText(fitText(ctx, label, w - 16), w / 2, h * 0.75);
    },
    [text, label, color],
  );
  useFrame((_, dt) => {
    if (reduce) live.current.f = want;
    else damp(live.current, "f", want, 0.5, dt);
    const h = Math.max(0.005, live.current.f * height);
    if (column.current) {
      column.current.scale.y = h;
      column.current.position.y = h / 2;
      (column.current.material as MeshBasicMaterial).color.set(color);
    }
  });
  return (
    <>
      {/* The empty column: what full scale looks like, so the fill has something to be a fraction of. */}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[W, height, W]} />
        <meshBasicMaterial color={PAPER} transparent opacity={0.05} depthWrite={false} />
        <Edges color={PAPER_DIM} />
      </mesh>
      <mesh ref={column} position={[0, 0.5, 0]}>
        <boxGeometry args={[W * 0.8, 1, W * 0.8]} />
        <meshBasicMaterial color={color} transparent opacity={0.75} toneMapped={false} />
      </mesh>
      {budgetY !== null && (
        <mesh position={[0, budgetY, 0]}>
          <boxGeometry args={[W * 1.5, 0.025, W * 1.5]} />
          <meshBasicMaterial color={CRITICAL} toneMapped={false} />
        </mesh>
      )}
      <mesh position={[0, height + 0.3, 0]}>
        <planeGeometry args={[1.1, 0.42]} />
        <meshBasicMaterial map={plate} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </>
  );
}
