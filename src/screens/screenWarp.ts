// A DOM screen laid onto a 3D quad. ConsoleRig.tsx's header note says why the
// world's interactive screens are real DOM warped by a homography rather than
// drei's <Html transform> or a texture; this is the warp itself, shared by
// every rig that carries one — the consoles on their masts (ConsoleRig) and
// wall panels (WallScreen).

import { useCallback, useMemo } from "react";
import type { RefObject } from "react";
import { useThree } from "@react-three/fiber";
import type { RootState } from "@react-three/fiber";
import { Vector3 } from "three";
import type { Object3D } from "three";
import { CONSOLE_PX_H, CONSOLE_PX_W } from "../core/screenSize";
import { SCREEN_H, SCREEN_W } from "../core/engine";

/** The CSS matrix3d that lays a w x h box (origin top-left) onto the quad
 * p0..p3 — top-left, top-right, bottom-right, bottom-left, in pixels. That
 * is the projective map a flat rectangle takes under a perspective camera,
 * solved from its four corners (Heckbert's square-to-quad), so the DOM
 * screen lands exactly where WebGL draws its bezel. Null when the quad has
 * collapsed to a line. */
export function screenQuadMatrix(w: number, h: number, p: readonly (readonly [number, number])[]): string | null {
  const [p0, p1, p2, p3] = p;
  if (!p0 || !p1 || !p2 || !p3) return null;
  const [x0, y0] = p0;
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-9) return null;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const k = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + k * y3;
  const n = (v: number) => (Number.isFinite(v) ? v : 0).toFixed(8);
  return `matrix3d(${n(a / w)},${n(d / w)},0,${n(g / w)},${n(b / h)},${n(e / h)},0,${n(k / h)},0,0,1,0,${n(x0)},${n(y0)},0,1)`;
}

// The screen's corners in its rig's own space: top-left, top-right,
// bottom-right, bottom-left.
const SCREEN_CORNERS: readonly [number, number][] = [
  [-SCREEN_W / 2, SCREEN_H / 2],
  [SCREEN_W / 2, SCREEN_H / 2],
  [SCREEN_W / 2, -SCREEN_H / 2],
  [-SCREEN_W / 2, -SCREEN_H / 2],
];

export interface ScreenWarp {
  /** Lay the screen onto the group's quad for this camera — call it from the
   * rig's useFrame. It writes the element's transform only when the result
   * changes, so a still camera leaves the browser free to re-rasterise the
   * text at its settled scale, and hides it while any corner is behind the
   * camera. Allocates nothing per frame. */
  warp: (group: Object3D, camera: RootState["camera"]) => void;
  /** Hide the screen, and forget what was last written so the next `warp`
   * shows it again. For a rig that outlives its screen being on. */
  hide: () => void;
}

export function useScreenWarp(screen: RefObject<HTMLElement | null>): ScreenWarp {
  const size = useThree((s) => s.size);
  const scratch = useMemo(
    () => ({
      corner: new Vector3(),
      view: new Vector3(),
      quad: [[0, 0], [0, 0], [0, 0], [0, 0]] as [number, number][],
      last: "",
    }),
    [],
  );
  const warp = useCallback(
    (group: Object3D, camera: RootState["camera"]) => {
      const el = screen.current;
      if (!el) return;
      const { corner, view, quad } = scratch;
      group.updateMatrixWorld();
      camera.updateMatrixWorld();
      let behind = false;
      SCREEN_CORNERS.forEach(([cx, cy], i) => {
        corner.set(cx, cy, 0.004).applyMatrix4(group.matrixWorld);
        view.copy(corner).applyMatrix4(camera.matrixWorldInverse);
        if (view.z > -camera.near) behind = true;
        corner.project(camera);
        quad[i]![0] = ((corner.x + 1) / 2) * size.width;
        quad[i]![1] = ((1 - corner.y) / 2) * size.height;
      });
      const m = behind ? null : screenQuadMatrix(CONSOLE_PX_W, CONSOLE_PX_H, quad);
      const next = m ?? "hidden";
      if (next !== scratch.last) {
        scratch.last = next;
        if (m) {
          el.style.transform = m;
          el.style.visibility = "visible";
        } else {
          el.style.visibility = "hidden";
        }
      }
    },
    [screen, size, scratch],
  );
  const hide = useCallback(() => {
    scratch.last = "hidden";
    if (screen.current) screen.current.style.visibility = "hidden";
  }, [screen, scratch]);
  return useMemo(() => ({ warp, hide }), [warp, hide]);
}
