// Who calls whom, drawn over the walls: an arc per call from caller to callee,
// with pulses running along it — faster the busier the caller, coloured by
// the callee's health, so a failing dependency glows where it hurts. Plain
// scene content, passed to <SiteWorld> as children.
import { useMemo, useRef } from "react";
import { QuadraticBezierLine } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, QuadraticBezierCurve3, Vector3, type Sprite } from "three";
import { PAPER_DIM, WALL, getGlowTexture } from "site-world";
import { HEALTH_COLOR } from "./serviceRoom";
import { CALLS, byName, type Feed } from "./services";

const ARC_Y = WALL + 0.5;
const PULSES = 3;

function Arc({ from, to, feed }: { from: string; to: string; feed: Feed }) {
  const a = byName.get(from)!;
  const b = byName.get(to)!;
  const curve = useMemo(() => {
    const start = new Vector3(a.at[0], ARC_Y, a.at[1]);
    const end = new Vector3(b.at[0], ARC_Y, b.at[1]);
    const mid = start.clone().lerp(end, 0.5);
    mid.y += start.distanceTo(end) * 0.28;
    return new QuadraticBezierCurve3(start, mid, end);
  }, [a, b]);
  const dots = useRef<(Sprite | null)[]>([]);
  const at = useMemo(() => new Vector3(), []);
  const rps = feed[from]!.rps;
  const color = HEALTH_COLOR[feed[to]!.health];
  // Laps per second along the arc: one every ~3s at 100 rps, faster with load.
  const speed = 0.12 + Math.log10(Math.max(rps, 10)) * 0.06;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed;
    dots.current.forEach((dot, i) => {
      if (!dot) return;
      curve.getPoint((t + i / PULSES) % 1, at);
      dot.position.copy(at);
    });
  });
  return (
    <>
      <QuadraticBezierLine
        start={curve.v0}
        mid={curve.v1}
        end={curve.v2}
        color={PAPER_DIM}
        lineWidth={1}
        transparent
        opacity={0.35}
      />
      {Array.from({ length: PULSES }, (_, i) => (
        <sprite key={i} ref={(el) => { dots.current[i] = el; }} scale={[0.45, 0.45, 1]}>
          <spriteMaterial map={getGlowTexture()} color={color} transparent depthWrite={false} blending={AdditiveBlending} />
        </sprite>
      ))}
    </>
  );
}

export function Traffic({ feed }: { feed: Feed }) {
  return (
    <>
      {CALLS.map(([from, to]) => (
        <Arc key={`${from}>${to}`} from={from} to={to} feed={feed} />
      ))}
    </>
  );
}
