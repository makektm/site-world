// How change moves through the factory: a belt with a station per stage, the
// work items on it as crates. Items waiting at a stage heap up in front of its
// station — across the belt, back along it, then upward — so the stage that
// cannot keep up (in an agent-first shop, usually human REVIEW) is the one
// with the mountain in front of it. Advancing items glide along the belt to
// their new pile, failed items slide off into a reject bin, deployed items
// fly off toward a target and flash.
//
// The host owns the data: it passes the items' current stage and status each
// time they change, and this component animates the difference. Nothing here
// keeps history, so a timeline scrubbing backwards just passes older items.
import { useEffect, useMemo, useRef, useState } from "react";
import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { damp, dampAngle } from "maath/easing";
import { AdditiveBlending, Vector3, type Group, type Sprite, type SpriteMaterial } from "three";
import { CRITICAL, INK, OK, PAPER, WALL_FILL, getGlowTexture } from "../core/engine";
import { useCanvasTexture } from "../core/useCanvasTexture";
import { Conveyor } from "./Conveyor";
import { Crate } from "./Crate";
import { Station } from "./Station";
import {
  layoutWorkLine, nearestAlong, offsetAcross, pileSlot, polylineLength, queueStatus, sampleLine,
  type FloorPoint, type Placement, type StationStatus, type WorkItem,
} from "./workLineLayout";

/** One stage of a work line. */
export interface WorkStation {
  id: string;
  /** Painted on the gate, e.g. "REVIEW". */
  label: string;
  /** Second line under the label, e.g. "2 humans". */
  sub?: string;
  /** Position along the belt, 0..1. Default: evenly spaced. */
  at?: number;
  /** Overrides the light the queue length would give. */
  status?: StationStatus;
  /** Queue length that turns the light WARN / CRITICAL (default: the line's). */
  warnAt?: number;
  critAt?: number;
}

export interface WorkLineProps {
  /** Floor points [x, z] of the belt, upstream first. */
  path: readonly FloorPoint[];
  stations: readonly WorkStation[];
  items: readonly WorkItem[];
  /** Belt width, metres. */
  width?: number;
  /** Belt surface height, metres. */
  height?: number;
  /** Belt surface speed, m/s (decorative). */
  speed?: number;
  /** Crate edge length, metres. */
  crateSize?: number;
  /** Crates side by side across the belt in a pile. */
  cols?: number;
  /** Rows a pile takes along the belt before it stacks upward (fewer if the
   * gap to the previous station is shorter). */
  pileRows?: number;
  /** Default queue lengths for a station's WARN and CRITICAL light. */
  warnAt?: number;
  critAt?: number;
  /** Header height of each station's gate, metres. */
  gateHeight?: number;
  /** Where deployed items fly to, [x, y, z]. Default: past the belt's end, overhead. */
  deployTarget?: readonly [number, number, number];
  /** Floor point of the reject bin. Default: beside the belt's middle. */
  rejectAt?: FloorPoint;
  /** Most failed crates shown in the bin; older ones are dropped from view. */
  rejectCap?: number;
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** Called with an item's id on pointer enter and null on leave. */
  onHover?: (id: string | null) => void;
  onSelectStation?: (id: string) => void;
  /** Reduced motion: crates jump to their places, no flights or flashes, belt still. */
  reduce?: boolean;
}

const GATE_DEPTH = 0.3;
const MOVE_S = 0.45;
const FLY_S = 1.1;
const FLASH_S = 0.7;
const BIN_COLS = 3;

interface Pose {
  x: number;
  z: number;
  rotY: number;
}

interface MoverEnv {
  path: readonly FloorPoint[];
  beltTop: number;
  bin: Pose;
  pitch: number;
  layer: number;
  target: Vector3;
  reduce: boolean;
}

/** A belt with stations; work items pile up at their stage, fail into a bin, and fly off when deployed. */
export function WorkLine({
  path, stations, items, width = 1.1, height = 0.35, speed = 0.4, crateSize = 0.34, cols = 2, pileRows = 4,
  warnAt = 4, critAt = 8, gateHeight = 1.6, deployTarget, rejectAt, rejectCap = 18,
  selectedId, onSelect, onHover, onSelectStation, reduce = false,
}: WorkLineProps) {
  const pitch = crateSize * 1.25;
  const layer = crateSize * 1.04;
  const layout = useMemo(
    () => layoutWorkLine({ path, stations, gateDepth: GATE_DEPTH, cols, pitch, layer, maxRows: pileRows }, items),
    [path, stations, items, cols, pitch, layer, pileRows],
  );
  const length = useMemo(() => polylineLength(path), [path]);
  const bin = useMemo<Pose>(() => {
    const mid = sampleLine(path, length / 2);
    if (rejectAt) return { x: rejectAt[0], z: rejectAt[1], rotY: mid.rotY };
    const [x, z] = offsetAcross(mid, -(width / 2 + 0.35 + (BIN_COLS * pitch) / 2));
    return { x, z, rotY: mid.rotY };
  }, [path, length, rejectAt, width, pitch]);
  const target = useMemo(() => {
    if (deployTarget) return new Vector3(deployTarget[0], deployTarget[1], deployTarget[2]);
    const end = sampleLine(path, length + 2.5);
    return new Vector3(end.x, 2.6, end.z);
  }, [deployTarget, path, length]);
  const env: MoverEnv = { path, beltTop: height, bin, pitch, layer, target, reduce };

  // Only the newest rejectCap failures stay in the bin; the rest are hidden so
  // a long-running line does not grow its scene without bound.
  const hiddenRejects = Math.max(0, layout.rejected.length - rejectCap);

  return (
    <group>
      <Conveyor path={path} width={width} height={height} speed={speed} reduce={reduce} />
      {stations.map((s, i) => {
        const p = sampleLine(path, layout.along[i]!);
        const count = layout.counts[i]!;
        return (
          <Station
            key={s.id}
            at={[p.x, p.z]}
            rotationY={p.rotY}
            width={width}
            height={gateHeight}
            label={s.label}
            sub={s.sub}
            count={count}
            status={s.status ?? queueStatus(count, s.warnAt ?? warnAt, s.critAt ?? critAt)}
            onSelect={onSelectStation ? () => onSelectStation(s.id) : undefined}
            reduce={reduce}
          />
        );
      })}
      <RejectBin pose={bin} inner={BIN_COLS * pitch + 0.08} count={layout.rejected.length} />
      {items.map((item) => {
        let place = layout.items.get(item.id);
        if (!place) return null;
        if (place.kind === "reject") place = place.slot < hiddenRejects ? { kind: "deployed" } : { kind: "reject", slot: place.slot - hiddenRejects };
        return (
          <Mover
            key={item.id}
            item={item}
            place={place}
            hiddenInBin={layout.items.get(item.id)?.kind === "reject" && place.kind === "deployed"}
            env={env}
            size={crateSize}
            selected={item.id === selectedId}
            onSelect={onSelect ? () => onSelect(item.id) : undefined}
            onHover={onHover ? (h) => onHover(h ? item.id : null) : undefined}
          />
        );
      })}
    </group>
  );
}

function binSlot(env: MoverEnv, slot: number): Vector3 {
  const s = pileSlot(slot, { cols: BIN_COLS, rows: BIN_COLS, pitch: env.pitch, layer: env.layer });
  const fwd = s.back - (BIN_COLS * env.pitch) / 2;
  const { x, z, rotY } = env.bin;
  return new Vector3(
    x + Math.cos(rotY) * s.side + Math.sin(rotY) * fwd,
    0.04 + s.up,
    z - Math.sin(rotY) * s.side + Math.cos(rotY) * fwd,
  );
}

type Mode = "path" | "world" | "fly" | "gone";

interface MoverState {
  mode: Mode;
  // Belt coordinates, damped in "path" mode so a crate follows the belt.
  along: number;
  side: number;
  up: number;
  rot: number;
  // World position: derived from the above in "path" mode, damped directly in
  // "world" mode, scripted in "fly" mode.
  pos: Vector3;
  from: Vector3;
  t: number;
  flash: number;
}

function Mover({ item, place, hiddenInBin, env, size, selected, onSelect, onHover }: {
  item: WorkItem;
  place: Placement;
  hiddenInBin: boolean;
  env: MoverEnv;
  size: number;
  selected: boolean;
  onSelect?: () => void;
  onHover?: (hovered: boolean) => void;
}) {
  const group = useRef<Group>(null);
  const flash = useRef<Sprite>(null);
  const flashMat = useRef<SpriteMaterial>(null);
  // First placement is where the item already is: a line mounting with work
  // in flight must not animate every crate in from the origin, nor replay
  // the deploys that happened before it was looking.
  const [s] = useState<MoverState>(() => {
    const st: MoverState = {
      mode: "gone", along: 0, side: 0, up: 0, rot: 0, pos: new Vector3(), from: new Vector3(), t: 0, flash: Infinity,
    };
    if (place.kind === "belt" || place.kind === "gate") {
      Object.assign(st, { mode: "path", along: place.along, side: place.side, up: place.up });
      const p = sampleLine(env.path, place.along);
      const [x, z] = offsetAcross(p, place.side);
      st.pos.set(x, env.beltTop + place.up, z);
      st.rot = p.rotY;
    } else if (place.kind === "reject") {
      st.mode = "world";
      st.pos.copy(binSlot(env, place.slot));
      st.rot = env.bin.rotY;
    }
    return st;
  });
  const placeRef = useRef(place);
  placeRef.current = place;
  const envRef = useRef(env);
  envRef.current = env;
  const hiddenRef = useRef(hiddenInBin);
  hiddenRef.current = hiddenInBin;

  // Snap into place when the frame loop is not looking (e.g. first paint).
  useEffect(() => {
    group.current?.position.copy(s.pos);
  }, [s]);

  useFrame((_, rawDt) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(rawDt, 0.1);
    const e = envRef.current;
    const pl = placeRef.current;
    if (pl.kind === "belt" || pl.kind === "gate") {
      if (s.mode !== "path") {
        // Back on the belt (a retried failure, a timeline scrubbed back):
        // pick the belt up from wherever the crate is now, or at its slot if
        // it had left the scene.
        if (s.mode === "world") {
          s.along = nearestAlong(e.path, s.pos.x, s.pos.z);
          s.side = 0;
          s.up = Math.max(0, s.pos.y - e.beltTop);
        } else {
          Object.assign(s, { along: pl.along, side: pl.side, up: pl.up });
        }
        s.mode = "path";
        g.scale.setScalar(1);
      }
      if (e.reduce) {
        Object.assign(s, { along: pl.along, side: pl.side, up: pl.up });
      } else {
        damp(s, "along", pl.along, MOVE_S, dt);
        damp(s, "side", pl.side, MOVE_S * 0.6, dt);
        damp(s, "up", pl.up, MOVE_S * 0.6, dt);
      }
      const p = sampleLine(e.path, s.along);
      const [x, z] = offsetAcross(p, s.side);
      s.pos.set(x, e.beltTop + s.up, z);
      if (e.reduce) s.rot = p.rotY;
      else dampAngle(s, "rot", p.rotY, MOVE_S * 0.6, dt);
    } else if (pl.kind === "reject") {
      if (s.mode === "gone" || s.mode === "fly") {
        s.pos.copy(binSlot(e, pl.slot));
        g.scale.setScalar(1);
      }
      s.mode = "world";
      const want = binSlot(e, pl.slot);
      if (e.reduce) {
        s.pos.copy(want);
      } else {
        // Across faster than down: the crate slides off the belt's edge, then
        // drops into the bin.
        damp(s.pos, "x", want.x, MOVE_S * 0.7, dt);
        damp(s.pos, "z", want.z, MOVE_S * 0.7, dt);
        damp(s.pos, "y", want.y, MOVE_S * 1.4, dt);
      }
      if (e.reduce) s.rot = e.bin.rotY;
      else dampAngle(s, "rot", e.bin.rotY, MOVE_S, dt);
    } else if (s.mode === "path" || s.mode === "world") {
      // Newly deployed. A crate evicted from a full bin just leaves quietly.
      if (e.reduce || hiddenRef.current) {
        s.mode = "gone";
      } else {
        s.mode = "fly";
        s.from.copy(s.pos);
        s.t = 0;
      }
    }

    if (s.mode === "fly") {
      s.t = Math.min(1, s.t + dt / FLY_S);
      const t = s.t;
      // A quadratic arc over a point above the midpoint: up, over, and in.
      const mx = (s.from.x + e.target.x) / 2;
      const mz = (s.from.z + e.target.z) / 2;
      const my = Math.max(s.from.y, e.target.y) + 1.5;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      s.pos.set(a * s.from.x + b * mx + c * e.target.x, a * s.from.y + b * my + c * e.target.y, a * s.from.z + b * mz + c * e.target.z);
      s.rot += dt * 6;
      g.scale.setScalar(1 - 0.75 * t);
      if (t >= 1) {
        s.mode = "gone";
        s.flash = 0;
      }
    }

    g.visible = s.mode !== "gone";
    g.position.copy(s.pos);
    g.rotation.y = s.rot;

    if (flash.current && flashMat.current) {
      if (s.flash < FLASH_S) {
        s.flash += dt;
        const k = Math.min(1, s.flash / FLASH_S);
        flash.current.visible = true;
        flash.current.position.copy(e.target);
        flash.current.scale.setScalar(0.6 + k * 3.4);
        flashMat.current.opacity = 1 - k;
      } else {
        flash.current.visible = false;
      }
    }
  });

  return (
    <>
      <group ref={group}>
        <Crate status={item.status} label={item.label} color={item.color} size={size} selected={selected} onSelect={onSelect} onHover={onHover} />
      </group>
      <sprite ref={flash} visible={false}>
        <spriteMaterial ref={flashMat} map={getGlowTexture()} color={OK} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} />
      </sprite>
    </>
  );
}

/** An open-topped box beside the belt with a REJECT tag and a count. */
function RejectBin({ pose, inner, count }: { pose: Pose; inner: number; count: number }) {
  const wallH = 0.42;
  const t = 0.05;
  const outer = inner + t * 2;
  const { canvas, texture } = useCanvasTexture(256, 96);
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const paint = () => {
      if (!alive) return;
      const { width: w, height: h } = canvas;
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = CRITICAL;
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.textBaseline = "middle";
      ctx.font = "700 40px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = PAPER;
      ctx.fillText("REJECT", 18, h / 2 + 2);
      ctx.textAlign = "right";
      ctx.fillStyle = count > 0 ? CRITICAL : PAPER;
      ctx.fillText(String(count), w - 18, h / 2 + 2);
      texture.needsUpdate = true;
    };
    paint();
    void document.fonts?.ready.then(paint);
    return () => {
      alive = false;
    };
  }, [canvas, texture, count]);
  const walls: [number, number, number, number][] = [
    [0, -(outer - t) / 2, outer, t],
    [0, (outer - t) / 2, outer, t],
    [-(outer - t) / 2, 0, t, inner],
    [(outer - t) / 2, 0, t, inner],
  ];
  return (
    <group position={[pose.x, 0, pose.z]} rotation={[0, pose.rotY, 0]}>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[outer, 0.04, outer]} />
        <meshBasicMaterial color={WALL_FILL} />
        <Edges color={PAPER} />
      </mesh>
      {walls.map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, wallH / 2, z]}>
          <boxGeometry args={[w, wallH, d]} />
          <meshBasicMaterial color={WALL_FILL} />
          <Edges color={CRITICAL} />
        </mesh>
      ))}
      {/* Tagged on the two walls that face along the belt, so it reads walking either way. */}
      {[1, -1].map((s) => (
        <mesh key={s} position={[0, wallH * 0.55, s * (outer / 2 + 0.003)]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
          <planeGeometry args={[outer * 0.86, (outer * 0.86 * 96) / 256]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
