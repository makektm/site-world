// Which look a world's doors have. `steel` is the brushed-metal door: grain
// textures, hazard stripes, an ID plate per frame, bolts and a lit environment.
// `plain` is a flat slab, no frame, in the same unlit basic material as the
// rest of the scene — no textures, no lights, nothing extra to draw.

/** The door look a host picks with `<SiteWorld doorStyle>`. */
export type DoorStyle = "steel" | "plain";

/** The look a world gets when its host does not say. */
export const DEFAULT_DOOR_STYLE: DoorStyle = "steel";

/** Whether a world's doors need DoorLighting. Steel is the only lit material in
 * the scene; plain doors are meshBasicMaterial, which no light touches, so a
 * plain world mounts no environment and no lights at all. */
export function doorsNeedLighting(style: DoorStyle, doorCount: number): boolean {
  return style === "steel" && doorCount > 0;
}
