// A canvas and the texture that shows it, disposed when the caller unmounts.
//
// Many components (wall panels, boards, plaques, coordinate tags) need the
// same thing: a 2D canvas drawn once and shown on a 3D surface. Each used to
// carry its own byte-identical copy, so the fix for one was missed in the rest.
//
// **AND NONE OF THEM DISPOSED THE TEXTURE.** That is the reason this
// exists rather than a tidy-up. react-three-fiber disposes what IT creates
// from JSX; a texture built imperatively here and handed on as a prop is the
// caller's to release, so every room a person walked out of left its texture
// on the GPU for the life of the page. One home means the cleanup is written
// once and cannot be forgotten by the next caller.
//
// The canvas is a real DOM canvas drawn with 2D calls, which is this world's
// idiom for a READ-ONLY board: it is lit and occluded as part of the render
// and repaints only when its content changes, where a DOM overlay is neither.
// An interactive surface is real DOM instead — see ConsoleRig.tsx.
import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";

export interface CanvasTextureHandle {
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
}

/** `width`/`height` are the texture's pixel size, not its size in the world.
 *  Changing either builds a new canvas and disposes the old texture. */
export function useCanvasTexture(width: number, height: number): CanvasTextureHandle {
  const canvas = useMemo(() => {
    const el = document.createElement("canvas");
    el.width = width;
    el.height = height;
    return el;
  }, [width, height]);

  const texture = useMemo(() => {
    const tex = new CanvasTexture(canvas);
    // sRGB because every caller draws with CSS colours, which are sRGB. Left
    // unset, three treats the canvas as linear and every board renders pale.
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, [canvas]);

  // The whole point. Returns the teardown rather than doing work on mount, so
  // it runs on unmount and again whenever `texture` is replaced above.
  useEffect(() => () => texture.dispose(), [texture]);

  return { canvas, texture };
}
