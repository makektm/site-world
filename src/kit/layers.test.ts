// Layers toggle independently, except within a group, where turning one on
// turns the rest off; defaults honour that too.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { initialLayers, setLayerOn, soloLayer, toggleLayer, useLayers, type LayerDef } from "./layers";

const DEFS: readonly LayerDef[] = [
  { id: "traffic", label: "traffic", defaultOn: true },
  { id: "cost", label: "cost", group: "tint", defaultOn: true },
  { id: "age", label: "age", group: "tint", defaultOn: true },
  { id: "agents", label: "agents" },
];

describe("layer state", () => {
  it("starts from defaults, first in a group winning", () => {
    expect(initialLayers(DEFS)).toEqual({ traffic: true, cost: true, age: false, agents: false });
  });

  it("toggles ungrouped layers independently", () => {
    const s = toggleLayer(DEFS, initialLayers(DEFS), "agents");
    expect(s.agents).toBe(true);
    expect(s.traffic).toBe(true);
  });

  it("keeps a group exclusive", () => {
    const s = toggleLayer(DEFS, initialLayers(DEFS), "age");
    expect(s).toMatchObject({ cost: false, age: true, traffic: true });
  });

  it("ignores unknown ids and no-op writes", () => {
    const s = initialLayers(DEFS);
    expect(setLayerOn(DEFS, s, "nope", true)).toBe(s);
    expect(setLayerOn(DEFS, s, "traffic", true)).toBe(s);
  });

  it("solos a layer, and un-solos it", () => {
    const solo = soloLayer(DEFS, initialLayers(DEFS), "agents");
    expect(solo).toEqual({ traffic: false, cost: false, age: false, agents: true });
    expect(Object.values(soloLayer(DEFS, solo, "agents")).some(Boolean)).toBe(false);
  });
});

describe("useLayers", () => {
  it("drives the state and survives inline defs", () => {
    const { result, rerender } = renderHook(() => useLayers([...DEFS]));
    expect(result.current.isOn("traffic")).toBe(true);
    act(() => result.current.toggle("traffic"));
    rerender();
    expect(result.current.isOn("traffic")).toBe(false);
    act(() => result.current.set("age", true));
    expect(result.current.on).toMatchObject({ age: true, cost: false });
    act(() => result.current.clear());
    expect(result.current.isOn("age")).toBe(false);
  });
});
