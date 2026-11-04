// Shared by the door leaf and its frame: the brushed-steel grain, and the
// lighting a standard material needs to show as metal.
//
// EVERY OTHER SURFACE IN THIS SCENE IS A meshBasicMaterial, which no light
// touches. So the lights below are scoped by construction to the doors: they
// are the only lit materials, and nothing else changes look because they exist.

import { useEffect } from "react";
import { Environment, Lightformer } from "@react-three/drei";
import { DOOR_TEXELS_PER_M, drawDoorMetal } from "./doorMetal";
import { useCanvasTexture } from "../core/useCanvasTexture";

/** A brushed-steel grain texture `width` x `height` metres. */
export function useGrainTexture(width: number, height: number) {
  const { canvas, texture } = useCanvasTexture(
    Math.max(8, Math.round(width * DOOR_TEXELS_PER_M)),
    Math.max(8, Math.round(height * DOOR_TEXELS_PER_M)),
  );
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawDoorMetal(ctx, width, height);
    texture.needsUpdate = true;
  }, [canvas, texture, width, height]);
  return texture;
}

/** What a standard material needs in order to be seen as metal: something to
 * reflect (a small procedural studio, built once, no files fetched) and a
 * light to glint under as the walker moves. Mounted once, beside the doors. */
export function DoorLighting() {
  return (
    <>
      <Environment resolution={128} environmentIntensity={1.4}>
        <Lightformer form="rect" intensity={3.2} color="#ffffff" position={[0, 7, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#ffe9c9" position={[-8, 3, 4]} rotation-y={Math.PI / 2} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#9fc4ff" position={[8, 3, -4]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#58e892" position={[0, 2, 9]} rotation-y={Math.PI} scale={[12, 3, 1]} />
      </Environment>
      <ambientLight intensity={1.0} />
      <directionalLight position={[4, 8, 5]} intensity={2} />
      <directionalLight position={[-4, 6, -5]} intensity={1.4} />
    </>
  );
}
