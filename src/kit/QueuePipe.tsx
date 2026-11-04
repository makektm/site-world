// A queue as a glass pipe from producer to consumer. The packets in it are the
// backlog: more of them, crowding and slowing toward the outlet, the more
// work is waiting; how fast they move is the throughput. Past the threshold
// the pipe swells near the outlet and turns the warn colour — a jam you can
// see from across the room, not a number you have to go and read.
import { useMemo, useRef } from "react";
import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { damp } from "maath/easing";
import { AdditiveBlending, DoubleSide, Quaternion, Vector3, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { CRITICAL, INFO, PAPER, PAPER_DIM, WARN, getGlowTexture } from "../core/engine";
import { compactNumber, packetSpeed, packetT, queuePacking } from "./infraMath";
import { InfraLabel } from "./infraPaint";

export interface QueuePipeProps {
  /** Inlet (producer side), world space. */
  from: readonly [number, number, number];
  /** Outlet (consumer side), world space. */
  to: readonly [number, number, number];
  /** Messages waiting. */
  backlog: number;
  /** Messages consumed per second. */
  throughput: number;
  /** Backlog past which the pipe bulges and warns. */
  threshold?: number;
  radius?: number;
  label?: string;
  /** Upper bound on drawn packets; the count grows on a log scale toward it. */
  maxPackets?: number;
  /** Reduced motion: packets hold their places and the bulge does not pulse. */
  reduce?: boolean;
}

const UP = new Vector3(0, 1, 0);

/** A pipe between two points whose packets show a queue's backlog and throughput. */
export function QueuePipe({
  from, to, backlog, throughput, threshold = 100, radius = 0.12, label, maxPackets = 28, reduce = false,
}: QueuePipeProps) {
  const [fx, fy, fz] = from;
  const [tx, ty, tz] = to;
  // The pipe is modelled along local +y from 0 to `length`; one quaternion
  // turns that onto from->to, so the packets need only a y coordinate.
  const { length, quaternion } = useMemo(() => {
    const d = new Vector3(tx - fx, ty - fy, tz - fz);
    const len = d.length();
    const q = new Quaternion();
    if (len > 1e-6) q.setFromUnitVectors(UP, d.divideScalar(len));
    return { length: len, quaternion: q };
  }, [fx, fy, fz, tx, ty, tz]);

  const pack = queuePacking(backlog, threshold, maxPackets);
  const speed = packetSpeed(throughput);
  const color = pack.severe ? CRITICAL : pack.over ? WARN : INFO;
  const packets = useRef<(Group | null)[]>([]);
  const bulge = useRef<Mesh>(null);
  const live = useRef({ phase: 0, bunch: pack.bunch });

  useFrame(({ clock }, dt) => {
    // Phase is integrated, not clock * speed, so a throughput change alters
    // the pace without making every packet jump to a new place.
    if (!reduce) live.current.phase = (live.current.phase + speed * dt) % 1;
    damp(live.current, "bunch", pack.bunch, 0.8, reduce ? 1 : dt);
    for (let i = 0; i < pack.count; i += 1) {
      const p = packets.current[i];
      if (!p) continue;
      p.position.y = packetT(i, pack.count, live.current.phase, live.current.bunch) * length;
    }
    if (bulge.current) {
      const pulse = reduce ? 1 : 1 + Math.sin(clock.elapsedTime * 3) * 0.06;
      bulge.current.scale.set(pulse, 1, pulse);
      (bulge.current.material as MeshBasicMaterial).opacity = pack.over ? 0.22 : 0;
    }
  });

  // The swollen stretch covers the outlet end the jammed packets crowd into.
  const bulgeLen = Math.max(radius * 4, length * (0.2 + pack.bunch * 0.3));
  const packetSize = radius * 0.9;

  return (
    <group>
      <group position={[fx, fy, fz]} quaternion={quaternion}>
        <mesh position={[0, length / 2, 0]} renderOrder={2}>
          <cylinderGeometry args={[radius, radius, length, 16, 1, true]} />
          <meshBasicMaterial color={PAPER} transparent opacity={0.08} side={DoubleSide} depthWrite={false} />
          {/* Past the facets' 22.5° turn, so only the rims draw, not every stave. */}
          <Edges color={PAPER_DIM} threshold={30} />
        </mesh>
        {/* Flanges at both ends, so the pipe reads as plumbing and shows its direction. */}
        {[0, length].map((y, i) => (
          <mesh key={i} position={[0, y, 0]}>
            <cylinderGeometry args={[radius * 1.45, radius * 1.45, 0.06, 16]} />
            <meshBasicMaterial color={i === 1 ? color : PAPER_DIM} toneMapped={false} />
          </mesh>
        ))}
        {pack.over && (
          <mesh ref={bulge} position={[0, length - bulgeLen / 2, 0]}>
            <cylinderGeometry args={[radius * 1.25, radius * 1.6, bulgeLen, 16, 1, true]} />
            <meshBasicMaterial color={color} transparent opacity={0.22} side={DoubleSide} depthWrite={false} toneMapped={false} />
          </mesh>
        )}
        {Array.from({ length: pack.count }, (_, i) => (
          <group key={i} ref={(el) => { packets.current[i] = el; }}>
            <mesh>
              <boxGeometry args={[packetSize, packetSize * 0.7, packetSize]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
            {i % 3 === 0 && (
              <sprite scale={[radius * 4, radius * 4, 1]}>
                <spriteMaterial map={getGlowTexture()} color={color} transparent opacity={0.4} depthWrite={false} blending={AdditiveBlending} />
              </sprite>
            )}
          </group>
        ))}
      </group>
      {label && (
        <InfraLabel
          position={[(fx + tx) / 2, Math.max(fy, ty) + radius + 0.35, (fz + tz) / 2]}
          text={label}
          sub={`${compactNumber(backlog)} waiting · ${compactNumber(throughput)}/s`}
          subColor={pack.over ? color : PAPER_DIM}
          width={1.6}
          height={0.42}
        />
      )}
    </group>
  );
}
