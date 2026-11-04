// One AI agent session as a small hovering drone: a dark capsule with a
// glowing visor, a thruster ring underneath and its name floating above. It
// is deliberately not a person — PresenceMarker is the person — so a glance
// at a room tells machines from teammates.
//
// What it shows:
//   visor colour   the state (agentState.ts): working blue, walking cream,
//                  blocked red, idle dim, done green
//   visor pulse    working flickers like typing; blocked breathes slowly
//   sparks         working, with a `target`: motes running from the visor to
//                  the thing being changed
//   badge          blocked: a "?" (or hourglass) over its head — waiting on a human
//
// Motion is data: give it `position` and it walks there at walking pace; give
// it `path` and it follows the waypoints (agentPath.ts), turning smoothly.
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { damp, dampAngle } from "maath/easing";
import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, DoubleSide, Line, LineBasicMaterial,
  type Group, type MeshBasicMaterial, type Sprite, type SpriteMaterial,
} from "three";
import { INK, PAPER, PAPER_DIM, WALL_FILL, getGlowTexture } from "../core/engine";
import { useCanvasTexture } from "../core/useCanvasTexture";
import { AgentTrail } from "./AgentTrail";
import { NameTag } from "./NameTag";
import { AGENT_WALK_SPEED, floorHeading, samplePath, type PathPoint } from "./agentPath";
import { AGENT_STATE_COLOR, AGENT_STATE_LABEL, agentBob, agentGlow, type AgentState } from "./agentState";

const BODY_R = 0.17;
const BODY_LEN = 0.34;
// The capsule's centre: high enough that the thruster ring clears the floor
// and the visor sits about waist-high to a walker (EYE 1.62), so a figure
// reads as small machinery, not a colleague.
const BODY_Y = 0.62;
const VISOR_Y = BODY_Y + 0.1;
const TOP_Y = BODY_Y + BODY_LEN / 2 + BODY_R;
const SPARKS = 4;

/** The glyph a blocked figure floats over its head. */
export type AgentBadge = "?" | "hourglass";

/** Props for {@link AgentFigure}. */
export interface AgentFigureProps {
  /** Shown on the tag. */
  label: string;
  /** The tag's second line; defaults to the state's word ("needs a human"). Pass "" for none. */
  sublabel?: string;
  /** Default "idle". */
  state?: AgentState;
  /** Where it stands, [x, z]. Changing it walks the figure there at `speed`. Ignored while `path` has points. */
  position?: PathPoint;
  /** Waypoints [x, z] to walk along at `speed`, from the first. A new array (by value) starts the walk again. */
  path?: readonly PathPoint[];
  /** Walk the path round and round instead of stopping at its end. */
  loop?: boolean;
  /** Walking pace, m/s. Default AGENT_WALK_SPEED. */
  speed?: number;
  /** Seconds since the walk began, to drive it from a host clock (a timeline scrubber) instead of the frame clock. */
  elapsed?: number;
  /** The point being worked on, [x, y, z] in the parent's space: sparks run to it while working, and the figure turns to face it when standing. */
  target?: readonly [number, number, number];
  /** Facing when standing still with no target (rotation about y, 0 faces +z). */
  heading?: number;
  /** Identity colour for the tag's edge (e.g. per agent kind); the visor always shows the state. */
  color?: string;
  /** Override the badge; `null` hides it even when blocked. Defaults to "?" when blocked. */
  badge?: AgentBadge | null;
  /** Draw a fading line of where it has just walked. */
  trail?: boolean;
  /** Draw the selection ring. */
  selected?: boolean;
  /** Click handler; also turns on the pointer cursor and the hover ring. */
  onSelect?: () => void;
  /** Hover in and out. */
  onHover?: (hovered: boolean) => void;
  /** Hide the name tag (e.g. a zoomed-out overview). */
  hideLabel?: boolean;
  /** Extra height for the tag and badge, metres. Stagger it across a crowd (e.g. 0.3 * index) so tags that are wider than the gap between figures do not sit on top of each other. */
  labelLift?: number;
  /** The moving body, for a host that follows the figure with a camera. Positions are in the parent's space. */
  bodyRef?: RefObject<Group | null>;
  /** Prefers-reduced-motion: no bob, pulse, sparks or badge drift. Walking still happens; it carries meaning. */
  reduce?: boolean;
}

/** One AI agent session as a small hovering drone with a state-coloured visor and a floating name tag. */
export function AgentFigure({
  label, sublabel, state = "idle", position, path, loop = false, speed = AGENT_WALK_SPEED, elapsed, target, heading,
  color, badge, trail = false, selected = false, onSelect, onHover, hideLabel = false, labelLift = 0, bodyRef, reduce = false,
}: AgentFigureProps) {
  const body = useRef<Group>(null);
  const hover = useRef<Group>(null);
  const visorMat = useRef<MeshBasicMaterial>(null);
  const thrustMat = useRef<MeshBasicMaterial>(null);
  const haloMat = useRef<SpriteMaterial>(null);
  const poolMat = useRef<MeshBasicMaterial>(null);
  const badgeRef = useRef<Group>(null);
  const sparks = useRef<(Sprite | null)[]>([]);
  const stateColor = AGENT_STATE_COLOR[state];
  const base = useMemo(() => new Color(stateColor), [stateColor]);
  const ink = useMemo(() => new Color(INK), []);

  // Keyed by value: hosts rebuild path arrays every render, and a fresh array
  // with the same points must not restart a walk halfway along it.
  const pathKey = path && path.length > 0 ? path.map((p) => `${p[0]},${p[1]}`).join(";") : "";
  const walk = useMemo(() => ({ points: path ?? [], walked: 0 }), [pathKey]);
  const motion = useRef({ x: 0, z: 0, heading: heading ?? 0, ready: false });

  // A pointer cursor set on hover must not outlive the hover: unmounting, or
  // going inert (onSelect removed), sends no pointerout. Same as Plinth.
  const [hovered, setHovered] = useState(false);
  const hoveredRef = useRef(false);
  const active = onSelect !== undefined;
  useEffect(() => () => {
    if (!hoveredRef.current) return;
    hoveredRef.current = false;
    document.body.style.cursor = "default";
  }, [active]);

  // The line from visor to target. Two points rewritten every frame, so it is
  // built here and disposed here, not rebuilt by a JSX component per frame.
  const beam = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(6), 3));
    const material = new LineBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false });
    const obj = new Line(geometry, material);
    obj.frustumCulled = false;
    return obj;
  }, []);
  useEffect(() => () => {
    beam.geometry.dispose();
    (beam.material as LineBasicMaterial).dispose();
  }, [beam]);
  useEffect(() => {
    (beam.material as LineBasicMaterial).color.set(stateColor);
  }, [beam, stateColor]);

  const setBody = (el: Group | null) => {
    body.current = el;
    if (bodyRef) bodyRef.current = el;
  };

  useFrame(({ clock }, dt) => {
    const g = body.current;
    if (!g) return;
    const t = clock.elapsedTime;
    const m = motion.current;
    const pts = walk.points;
    let gx: number;
    let gz: number;
    let gh: number | undefined;
    let pathDone = true;
    if (pts.length > 0) {
      walk.walked = elapsed !== undefined ? elapsed * speed : walk.walked + dt * speed;
      const s = samplePath(pts, walk.walked, loop);
      gx = s.x;
      gz = s.z;
      gh = pts.length > 1 ? s.heading : undefined;
      pathDone = s.done;
    } else {
      gx = position?.[0] ?? 0;
      gz = position?.[1] ?? 0;
    }
    const first = !m.ready;
    if (first) {
      // The first frame lands on the goal: a figure that appears should not
      // be seen sliding in from the origin.
      m.x = gx;
      m.z = gz;
      m.ready = true;
    }
    const dist = Math.hypot(gx - m.x, gz - m.z);
    const moving = dist > 0.04;
    if (pts.length > 0) {
      // The path sample already moves at walking pace; damping only rounds
      // the corners.
      damp(m, "x", gx, 0.12, dt);
      damp(m, "z", gz, 0.12, dt);
    } else {
      // Toward a new `position`, at walking pace rather than a jump: the walk
      // is how a person sees an agent move on to its next job. Scaling the
      // per-axis cap by the direction keeps diagonals at the same pace.
      const ux = dist > 0 ? Math.abs(gx - m.x) / dist : 1;
      const uz = dist > 0 ? Math.abs(gz - m.z) / dist : 1;
      damp(m, "x", gx, 0.3, dt, speed * Math.max(ux, 0.05));
      damp(m, "z", gz, 0.3, dt, speed * Math.max(uz, 0.05));
    }
    // Facing: the way it walks; else its target; else the host's heading.
    let want = m.heading;
    if (pts.length > 0 && gh !== undefined && (!pathDone || !target)) want = gh;
    else if (moving && pts.length === 0) want = floorHeading([m.x, m.z], [gx, gz]);
    else if (target) want = floorHeading([m.x, m.z], [target[0], target[2]]);
    else if (heading !== undefined) want = heading;
    if (first) m.heading = want;
    else dampAngle(m, "heading", want, 0.22, dt);
    g.position.set(m.x, 0, m.z);
    g.rotation.y = m.heading;

    const travelling = (pts.length > 0 && !pathDone) || moving;
    const shown: AgentState = travelling && state === "idle" ? "walking" : state;
    if (hover.current) {
      hover.current.position.y = agentBob(shown, t, reduce);
      // A lean into the direction of travel: the cheapest cue that says "walking".
      hover.current.rotation.x = travelling && !reduce ? 0.14 : 0;
    }
    const glow = agentGlow(shown, t, reduce);
    visorMat.current?.color.copy(ink).lerp(base, 0.25 + 0.75 * glow);
    thrustMat.current?.color.copy(ink).lerp(base, 0.15 + 0.6 * glow);
    if (haloMat.current) haloMat.current.opacity = 0.65 * glow;
    if (poolMat.current) poolMat.current.opacity = 0.12 + 0.2 * glow;
    if (badgeRef.current) badgeRef.current.position.y = TOP_Y + 0.62 + labelLift + (reduce ? 0 : 0.04 * Math.sin(t * 1.8));

    // Sparks and beam live in the parent's space (siblings of the body), so
    // they run straight to the target however the body is turned.
    const working = state === "working" && target !== undefined;
    const vx = m.x + Math.sin(m.heading) * BODY_R;
    const vz = m.z + Math.cos(m.heading) * BODY_R;
    const vy = VISOR_Y + (hover.current?.position.y ?? 0);
    beam.visible = working;
    if (working) {
      const pos = beam.geometry.getAttribute("position") as BufferAttribute;
      pos.setXYZ(0, vx, vy, vz);
      pos.setXYZ(1, target[0], target[1], target[2]);
      pos.needsUpdate = true;
    }
    sparks.current.forEach((s, i) => {
      if (!s) return;
      s.visible = working && !reduce;
      if (!s.visible || !target) return;
      const p = (t * 1.1 + i / SPARKS) % 1;
      s.position.set(
        vx + (target[0] - vx) * p,
        vy + (target[1] - vy) * p + Math.sin(Math.PI * p) * 0.18,
        vz + (target[2] - vz) * p,
      );
      const k = 0.22 * (1 - 0.5 * p);
      s.scale.set(k, k, 1);
      (s.material as SpriteMaterial).opacity = 0.9 * (1 - p * 0.7);
    });
  });

  const shownBadge = badge === undefined ? (state === "blocked" ? "?" : null) : badge;
  const tagSub = sublabel ?? AGENT_STATE_LABEL[state];
  const ring = selected || hovered;

  return (
    <group>
      <group ref={setBody}>
        <group ref={hover}>
          {/* Inverted hull: a slightly larger back-faced capsule reads as an
              outline from every side, where Edges on a curved body draws a
              cage of facet lines. */}
          <mesh position={[0, BODY_Y, 0]}>
            <capsuleGeometry args={[BODY_R + 0.018, BODY_LEN, 4, 14]} />
            <meshBasicMaterial color={ring ? PAPER : PAPER_DIM} side={BackSide} />
          </mesh>
          <mesh
            position={[0, BODY_Y, 0]}
            onClick={(event) => {
              if (!onSelect) return;
              event.stopPropagation();
              onSelect();
            }}
            onPointerOver={(event) => {
              if (!onSelect && !onHover) return;
              event.stopPropagation();
              setHovered(true);
              onHover?.(true);
              if (!onSelect) return;
              hoveredRef.current = true;
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              if (!onSelect && !onHover) return;
              setHovered(false);
              onHover?.(false);
              if (!hoveredRef.current) return;
              hoveredRef.current = false;
              document.body.style.cursor = "default";
            }}
          >
            <capsuleGeometry args={[BODY_R, BODY_LEN, 4, 14]} />
            <meshBasicMaterial color={WALL_FILL} />
          </mesh>
          {/* The visor: an open arc of cylinder wrapped round the front
              (theta 0 is +z, the facing direction). */}
          <mesh position={[0, VISOR_Y, 0]}>
            <cylinderGeometry args={[BODY_R + 0.006, BODY_R + 0.006, 0.075, 18, 1, true, -0.95, 1.9]} />
            <meshBasicMaterial ref={visorMat} color={stateColor} side={DoubleSide} toneMapped={false} />
          </mesh>
          <sprite position={[0, VISOR_Y, BODY_R + 0.06]} scale={[0.7, 0.45, 1]}>
            <spriteMaterial ref={haloMat} map={getGlowTexture()} color={stateColor} transparent depthWrite={false} blending={AdditiveBlending} />
          </sprite>
          <mesh position={[0, BODY_Y - BODY_LEN / 2 - BODY_R - 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.12, 0.016, 6, 28]} />
            <meshBasicMaterial ref={thrustMat} color={stateColor} toneMapped={false} />
          </mesh>
        </group>
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.1, 1.1]} />
          <meshBasicMaterial ref={poolMat} map={getGlowTexture()} color={stateColor} transparent depthWrite={false} blending={AdditiveBlending} />
        </mesh>
        {ring && (
          <mesh position={[0, 0.016, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.36, 0.41, 40]} />
            <meshBasicMaterial color={PAPER} transparent opacity={selected ? 0.9 : 0.5} depthWrite={false} />
          </mesh>
        )}
        {shownBadge && (
          <group ref={badgeRef} position={[0, TOP_Y + 0.62 + labelLift, 0]}>
            <BadgeSprite glyph={shownBadge} color={stateColor} />
          </group>
        )}
        {!hideLabel && (
          <NameTag text={label} sub={tagSub || undefined} accent={color ?? stateColor} position={[0, TOP_Y + 0.14 + labelLift, 0]} height={0.17} />
        )}
      </group>
      <primitive object={beam} />
      {Array.from({ length: SPARKS }, (_, i) => (
        <sprite key={i} ref={(el) => { sparks.current[i] = el; }} visible={false}>
          <spriteMaterial map={getGlowTexture()} color={stateColor} transparent depthWrite={false} blending={AdditiveBlending} />
        </sprite>
      ))}
      {trail && <AgentTrail target={body} color={color ?? stateColor} />}
    </group>
  );
}

/** A round badge with a "?" or an hourglass, on its own small canvas. */
function BadgeSprite({ glyph, color }: { glyph: AgentBadge; color: string }) {
  const { canvas, texture } = useCanvasTexture(128, 128);
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let alive = true;
    const paint = () => {
      if (!alive) return;
      ctx.clearRect(0, 0, 128, 128);
      ctx.beginPath();
      ctx.arc(64, 64, 56, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.lineWidth = 7;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.fillStyle = color;
      if (glyph === "?") {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "700 82px 'IBM Plex Mono', ui-monospace, monospace";
        ctx.fillText("?", 64, 70);
      } else {
        // Drawn, not a font glyph: the hourglass emoji renders differently on
        // every platform, and not at all in some headless browsers.
        ctx.beginPath();
        ctx.moveTo(40, 32);
        ctx.lineTo(88, 32);
        ctx.lineTo(64, 64);
        ctx.lineTo(88, 96);
        ctx.lineTo(40, 96);
        ctx.lineTo(64, 64);
        ctx.closePath();
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(48, 96);
        ctx.lineTo(80, 96);
        ctx.lineTo(64, 76);
        ctx.closePath();
        ctx.fill();
      }
      texture.needsUpdate = true;
    };
    paint();
    void document.fonts?.ready.then(paint);
    return () => {
      alive = false;
    };
  }, [canvas, texture, glyph, color]);
  return (
    <>
      <sprite scale={[0.9, 0.9, 1]}>
        <spriteMaterial map={getGlowTexture()} color={color} transparent opacity={0.5} depthWrite={false} blending={AdditiveBlending} />
      </sprite>
      <sprite scale={[0.3, 0.3, 1]}>
        <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
      </sprite>
    </>
  );
}
