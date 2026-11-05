// The plain door style. What could go wrong with a style switch is a plain
// world that still builds a texture, draws a frame or mounts the door lights,
// or a style the doors never receive. PlainDoorLeaf is a function component
// without hooks, so its element tree is read directly, with no WebGL.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Edges } from "@react-three/drei";
import { isValidElement, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { DoorFrame } from "./DoorFrame";
import { DoorLeaf } from "./DoorLeaf";
import { PlainDoorLeaf } from "./PlainDoorLeaf";
import { doorParts } from "./SlidingDoor";
import { DEFAULT_DOOR_STYLE, doorsNeedLighting } from "./doorStyle";
import { DOOR_H, PAPER } from "../core/engine";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const code = (rel: string) =>
  readFileSync(path.join(SRC, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

interface Node {
  type: string;
  props: Record<string, unknown>;
}

// Every element an element tree is made of, function components called through
// (one that used a hook would throw here). drei's Edges stays a leaf: it is
// the outline, and calling it would need a renderer.
function flatten(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  const { type, props } = node;
  if (typeof type === "string") return [{ type, props }, ...flatten(props.children as ReactNode)];
  if (type === Edges) return [{ type: "Edges", props }];
  if (typeof type === "symbol") return flatten(props.children as ReactNode); // a fragment
  return flatten((type as (p: unknown) => ReactNode)(props));
}

describe("doorStyle", () => {
  it("defaults to steel, so a consumer that says nothing is unchanged", () => {
    expect(DEFAULT_DOOR_STYLE).toBe("steel");
  });

  it("lights only steel doors, and only when there are doors", () => {
    expect(doorsNeedLighting("steel", 3)).toBe(true);
    expect(doorsNeedLighting("steel", 0)).toBe(false);
    expect(doorsNeedLighting("plain", 3)).toBe(false);
    expect(doorsNeedLighting("plain", 0)).toBe(false);
  });
});

describe("doorParts", () => {
  it("gives steel a frame and a leaf, and plain a leaf and no frame", () => {
    expect(doorParts("steel")).toEqual({ Frame: DoorFrame, Leaf: DoorLeaf });
    expect(doorParts("plain")).toEqual({ Frame: null, Leaf: PlainDoorLeaf });
  });

  it("gives a plain leaf that drops in for the steel one", () => {
    // Compiles only while every prop the steel leaf takes is accepted by the plain one.
    const leaf: ComponentType<ComponentProps<typeof DoorLeaf>> = PlainDoorLeaf;
    expect(leaf).toBe(PlainDoorLeaf);
  });
});

describe("PlainDoorLeaf", () => {
  it("is one flat, unlit slab the size of the leaf, outlined", () => {
    const nodes = flatten(PlainDoorLeaf({ w: 3.2, d: 0.12 }));
    expect(nodes.map((n) => n.type)).toEqual(["boxGeometry", "meshBasicMaterial", "Edges"]);
    expect(nodes[0]!.props.args).toEqual([3.2, DOOR_H, 0.12]);
    expect(nodes[1]!.props).toEqual({ color: PAPER });
  });
});

describe("the plain path draws no textures and no lit materials", () => {
  const FORBIDDEN = [
    /useCanvasTexture/, /useGrainTexture/, /CanvasTexture/, /\bmap=/,
    /meshStandardMaterial/, /meshPhysicalMaterial/, /meshLambertMaterial/,
    /\bEnvironment\b/, /\bLightformer\b/, /DoorLighting/, /[aA]mbientLight|[dD]irectionalLight/,
    /\bInstances?\b/, /doorMetal|DoorMetal/, /DoorFrame/,
  ];
  it.each(["doors/PlainDoorLeaf.tsx", "doors/doorStyle.ts"])("%s", (rel) => {
    const text = code(rel);
    for (const re of FORBIDDEN) expect(text, `${rel} matches ${re}`).not.toMatch(re);
    // Whatever it draws, it draws in basic materials.
    for (const m of text.matchAll(/<(mesh\w*Material)\b/g)) expect(m[1]).toBe("meshBasicMaterial");
    // And it imports only drei's outline and the engine.
    const specs = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const s of specs) expect(["@react-three/drei", "../core/engine"]).toContain(s);
  });
});

describe("the style reaches the doors", () => {
  it("SiteWorld mounts DoorLighting only through doorsNeedLighting, and hands the style to the leaves", () => {
    const text = code("world/SiteWorld.tsx");
    expect(text.match(/<DoorLighting\b/g)).toHaveLength(1);
    expect(text).toMatch(/doorsNeedLighting\(doorStyle, doors\.length\) && <DoorLighting \/>/);
    expect(text).toMatch(/<SiteDoorLeaves [^>]*doorStyle=\{doorStyle\}/);
  });

  it("SiteDoorLeaves hands the style to each door, and each door draws only the parts the style selects", () => {
    expect(code("doors/Doors.tsx")).toMatch(/<Leaf [^>]*doorStyle=\{doorStyle\}/);
    const sliding = code("doors/SlidingDoor.tsx");
    expect(sliding.match(/doorParts\(doorStyle\)/g)).toHaveLength(2);
    expect(sliding).not.toMatch(/<DoorFrame\b|<DoorLeaf\b|<PlainDoorLeaf\b/);
    // The frame is drawn only when the style has one.
    expect(sliding.match(/\{Frame && <Frame /g)).toHaveLength(2);
  });
});
