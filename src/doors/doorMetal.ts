// The look of a door, as data: where a leaf's plates meet and where the bolts
// sit, in metres from the leaf's top-left. Pure, so the layout is testable;
// the drawings here (grain, hazard stripes, an ID plate) are only paint.
//
// A leaf is divided into equal plates no wider than PLATE_W, in two rows of
// plates; each plate corner carries a rivet, so a wider door shows more
// plates, never bigger ones — the same scale of detail on a 1.2m door as on
// a 7.2m bi-parting pair.
import { DOOR_H } from "../core/engine";

/** Plates are up to this wide, in metres. */
export const PLATE_W = 1.25;
/** Rivets sit this far in from a plate's corner, in metres. */
export const RIVET_INSET = 0.09;
/** The kick plate along the foot of the leaf: darker, lower, riveted. */
export const KICK_H = 0.32;
/** Texels per metre, both ways. */
export const DOOR_TEXELS_PER_M = 96;

export interface DoorLayout {
  /** x of each vertical seam between plates (excluding the leaf's own edges). */
  seamsX: number[];
  /** y of each horizontal seam: between the two plate rows, and above the kick plate. */
  seamsY: number[];
  /** Rivet centres. */
  rivets: [number, number][];
}

export function doorLayout(width: number): DoorLayout {
  const plates = Math.max(1, Math.ceil(width / PLATE_W));
  const plateW = width / plates;
  const seamsX: number[] = [];
  for (let i = 1; i < plates; i++) seamsX.push(i * plateW);

  // Two rows of plates above the kick plate.
  const bodyH = DOOR_H - KICK_H;
  const seamsY = [bodyH / 2, bodyH];

  const rows: [number, number][] = [[0, bodyH / 2], [bodyH / 2, bodyH], [bodyH, DOOR_H]];
  const rivets: [number, number][] = [];
  for (const [y0, y1] of rows) {
    for (let i = 0; i < plates; i++) {
      const x0 = i * plateW;
      const x1 = x0 + plateW;
      for (const x of [x0 + RIVET_INSET, x1 - RIVET_INSET]) {
        for (const y of [y0 + RIVET_INSET, y1 - RIVET_INSET]) rivets.push([x, y]);
      }
    }
  }
  return { seamsX, seamsY, rivets };
}

/** A small deterministic generator (mulberry32). The brushing must come out
 * the same every time a door is drawn — Math.random would repaint a different
 * door on every remount, and a test could not pin it. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paints brushed steel for a leaf or frame `width` metres wide: a vertical
 * sheen and long, faint horizontal strokes. Plates, seams and bolts are real
 * geometry (DoorLeaf.tsx, DoorFrame.tsx) laid out by `doorLayout`; this is
 * only the grain on their faces. The canvas is DOOR_TEXELS_PER_M to the metre. */
export function drawDoorMetal(ctx: CanvasRenderingContext2D, width: number, height: number = DOOR_H): void {
  const ppm = DOOR_TEXELS_PER_M;
  const w = Math.round(width * ppm);
  const h = Math.round(height * ppm);

  const sheen = ctx.createLinearGradient(0, 0, 0, h);
  sheen.addColorStop(0, "#c7ced6");
  sheen.addColorStop(0.5, "#ffffff");
  sheen.addColorStop(1, "#aeb6bf");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);

  const rand = seeded(Math.round(width * 1000) + 17);
  const strokes = Math.round((w * h) / 70);
  for (let i = 0; i < strokes; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const len = 18 + rand() * 110;
    ctx.globalAlpha = 0.03 + rand() * 0.07;
    ctx.fillStyle = rand() < 0.5 ? "#ffffff" : "#4a5460";
    ctx.fillRect(x, y, len, 1);
  }
  ctx.globalAlpha = 1;
}

/** Diagonal hazard stripes, `w` x `h` texels, one stripe pair per `period`
 * texels: warning amber on ink, the marking on a jamb's edge. */
export function drawHazard(ctx: CanvasRenderingContext2D, w: number, h: number, period: number, amber: string, ink: string): void {
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = amber;
  for (let y = -w; y < h + w; y += period) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y - w);
    ctx.lineTo(w, y - w + period / 2);
    ctx.lineTo(0, y + period / 2);
    ctx.closePath();
    ctx.fill();
  }
}

/** A stencilled door ID plate: the code on ink, in a ruled box. */
export function drawIdPlate(ctx: CanvasRenderingContext2D, w: number, h: number, code: string, paper: string, ink: string): void {
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = paper;
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = paper;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(h * 0.52)}px 'IBM Plex Mono', monospace`;
  ctx.fillText(code, w / 2, h / 2 + 2);
}
