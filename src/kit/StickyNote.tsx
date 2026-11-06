// An in-world note: a square of paper stuck to a wall or floating where it
// was left, with a few words and who wrote them. Its colour says whether a
// person or an agent wrote it, because in an agent-first factory "who said
// this" is the first question about any note.
import { useRef } from "react";
import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { INFO, INK, WARN, fitText } from "../core/engine";
import { wrapLines } from "./infraMath";
import { infraFont, useInfraPaint } from "./infraPaint";

export type NoteAuthorKind = "human" | "agent";

// Paper tints rather than the status colours themselves: a note is a thing,
// not an alert, and INK text must stay readable on it. Human notes lean
// toward WARN's amber (the classic sticky), agent notes toward INFO's blue.
export const NOTE_PAPER: Record<NoteAuthorKind, string> = { human: "#f2dc94", agent: "#a8cdf2" };
/** The stripe and author colour on each kind of note. */
export const NOTE_ACCENT: Record<NoteAuthorKind, string> = { human: WARN, agent: INFO };

export interface StickyNoteProps {
  /** Centre of the note. For a wall, pass a point from hungOnWall(). */
  position: readonly [number, number, number];
  /** Turn about y; the note's face looks down local +z. Ignored when floating. */
  rotationY?: number;
  text: string;
  author: string;
  by: NoteAuthorKind;
  /** e.g. "2h ago"; printed after the author. */
  when?: string;
  /** Edge length in metres. */
  size?: number;
  /** Float in the open and face the camera, bobbing gently (unless `reduce`). */
  floating?: boolean;
  /** A slight roll, in radians, so a wall of notes does not look machine-placed. */
  tilt?: number;
  reduce?: boolean;
}

const PX = 512;

/** A paper note with short text and an author, tinted by human vs agent. */
export function StickyNote({
  position, rotationY = 0, text, author, by, when, size = 0.5, floating = false, tilt = 0, reduce = false,
}: StickyNoteProps) {
  const bob = useRef<Group>(null);
  const texture = useInfraPaint(
    PX,
    PX,
    (ctx, w, h) => {
      ctx.fillStyle = NOTE_PAPER[by];
      ctx.fillRect(0, 0, w, h);
      // The adhesive strip along the top, in the author kind's accent.
      ctx.fillStyle = NOTE_ACCENT[by];
      ctx.globalAlpha = 0.55;
      ctx.fillRect(0, 0, w, 34);
      ctx.globalAlpha = 1;
      ctx.fillStyle = INK;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = infraFont(54, true);
      const lines = wrapLines(text, w - 64, (s) => ctx.measureText(s).width, 6);
      lines.forEach((line, i) => ctx.fillText(line, 32, 100 + i * 62));
      ctx.font = infraFont(32, true);
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.7;
      const sig = `${by === "agent" ? "◆" : "●"} ${author}${when ? ` · ${when}` : ""}`;
      ctx.fillText(fitText(ctx, sig, w - 64), 32, h - 30);
      ctx.globalAlpha = 1;
    },
    [text, author, by, when],
  );
  useFrame(({ clock }) => {
    if (!bob.current) return;
    bob.current.position.y = floating && !reduce ? Math.sin(clock.elapsedTime * 1.3 + position[0]) * 0.04 : 0;
  });
  const note = (
    <group ref={bob}>
      <mesh rotation={[0, 0, tilt]}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
  const [x, y, z] = position;
  return floating ? (
    <Billboard position={[x, y, z]}>{note}</Billboard>
  ) : (
    <group position={[x, y, z]} rotation={[0, rotationY, 0]}>{note}</group>
  );
}
