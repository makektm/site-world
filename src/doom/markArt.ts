// The two textures DoomMarks.tsx lays down, drawn once on a canvas: white
// on transparent, since each mark is tinted per instance and drawn
// additively (white takes the tint, transparent adds nothing). Line-art,
// like the rest of the world — a ring and its cracks, not a photograph of a
// hole.

/** A round's strike: a soft scorch, a hard ring where it went in, and a
 * few cracks running out from it. Deterministic: every hole is the same
 * drawing, spun to a different angle where it lands. */
export function drawBulletHole(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2;
  const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, "rgba(255,255,255,0.55)");
  glow.addColorStop(0.25, "rgba(255,255,255,0.25)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = size * 0.035;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = size * 0.018;
  ctx.lineCap = "round";
  // Six cracks, each with one kink, at uneven angles and lengths.
  const cracks = [0.2, 1.3, 2.1, 3.0, 4.2, 5.3];
  cracks.forEach((a, i) => {
    const r0 = size * 0.14;
    const r1 = size * (0.26 + (i % 3) * 0.06);
    const r2 = size * (0.36 + (i % 2) * 0.08);
    const kink = (i % 2 === 0 ? 0.18 : -0.22);
    ctx.globalAlpha = 0.75 - (i % 3) * 0.15;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    ctx.lineTo(c + Math.cos(a + kink) * r2, c + Math.sin(a + kink) * r2);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

/** A demon's ichor: a pooled blot, droplets thrown out round it, and a
 * dotted outline — the drawing's way of saying "this was a body". */
export function drawIchor(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2;
  const pool = ctx.createRadialGradient(c, c, 0, c, c, size * 0.3);
  pool.addColorStop(0, "rgba(255,255,255,0.8)");
  pool.addColorStop(0.7, "rgba(255,255,255,0.45)");
  pool.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = pool;
  ctx.beginPath();
  // A lumpy blot: a circle whose radius wobbles round it.
  for (let i = 0; i <= 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    const r = size * (0.24 + 0.05 * Math.sin(a * 3) + 0.03 * Math.sin(a * 7 + 1));
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  const drops = [[0.4, 0.36], [1.1, 0.42], [1.9, 0.33], [2.7, 0.44], [3.6, 0.38], [4.4, 0.45], [5.2, 0.35], [5.9, 0.41]];
  drops.forEach(([a, r], i) => {
    ctx.beginPath();
    ctx.arc(c + Math.cos(a!) * size * r!, c + Math.sin(a!) * size * r!, size * (0.015 + (i % 3) * 0.01), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = size * 0.012;
  ctx.setLineDash([size * 0.03, size * 0.03]);
  ctx.beginPath();
  ctx.arc(c, c, size * 0.46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}
