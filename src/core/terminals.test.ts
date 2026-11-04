// What every site-world terminal must do about a walker: being in range never powers
// it on, E does, walking away powers it off — and only one is ever powered.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTerminals, type TerminalDef } from "./terminals";

const DEFS: readonly TerminalDef[] = [
  { id: "a", stand: [0, 0] },
  { id: "b", stand: [5, 5], flyOffset: 1 },
];

function slot(overrides: { consoleId?: string | null } = {}) {
  const onConsoleExit = vi.fn();
  const view = renderHook(
    (props: { consoleId?: string | null }) =>
      useTerminals(DEFS, {
        mode: "walk",
        consoleId: props.consoleId ?? null,
        cameraRef: { current: { x: 1, z: 0 } },
        onConsoleExit,
      }),
    { initialProps: overrides },
  );
  return { ...view, onConsoleExit };
}

function pressE() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE", key: "e" }));
  });
}

describe("a terminal", () => {
  it("stays off when a walker arrives, and powers on only on E", () => {
    const { result } = slot();
    act(() => result.current.get("a").onNear(true));
    expect(result.current.get("a").near).toBe(true);
    expect(result.current.get("a").on).toBe(false);

    pressE();
    expect(result.current.get("a").on).toBe(true);
    expect(result.current.get("a").rig).toBe(true);
    expect(result.current.get("a").focus).toBeGreaterThan(0);
  });

  it("ignores E out of range", () => {
    const { result } = slot();
    pressE();
    expect(result.current.anyOn).toBe(false);
  });

  it("powers off when the walker leaves, and stays off on return", () => {
    const { result } = slot();
    act(() => result.current.get("a").onNear(true));
    pressE();
    act(() => result.current.get("a").onNear(false));
    expect(result.current.get("a").on).toBe(false);
    act(() => result.current.get("a").onNear(true));
    expect(result.current.get("a").on).toBe(false);
  });

  it("leaving one terminal's range does not power off another", () => {
    const { result } = slot();
    act(() => result.current.get("a").onNear(true));
    pressE();
    act(() => result.current.get("b").onNear(false));
    expect(result.current.get("a").on).toBe(true);
  });

  it("powers off when a host console takes over", () => {
    const { result, rerender } = slot();
    act(() => result.current.get("a").onNear(true));
    pressE();
    rerender({ consoleId: "host-console" });
    expect(result.current.anyOn).toBe(false);
  });
});

describe("the slot", () => {
  it("powers one terminal at a time, whichever is activated last", () => {
    const { result, onConsoleExit } = slot();
    act(() => result.current.get("a").onActivate());
    expect(result.current.get("a").on).toBe(true);
    act(() => result.current.get("b").onActivate());
    expect(result.current.get("a").on).toBe(false);
    expect(result.current.get("b").on).toBe(true);
    expect(onConsoleExit).toHaveBeenCalledTimes(2);
  });

  it("keeps the first terminal's rig up while the second powers on, so it can collapse", () => {
    const { result } = slot();
    act(() => result.current.get("a").onActivate());
    act(() => result.current.get("b").onActivate());
    expect(result.current.get("a").rig).toBe(true);
    act(() => result.current.get("a").setRig(false));
    expect(result.current.get("a").rig).toBe(false);
  });

  it("anchors the fly-in along the line the click came from, and reports the active terminal", () => {
    const { result } = slot();
    act(() => result.current.get("b").onActivate());
    expect(result.current.active?.def.id).toBe("b");
    expect(result.current.active?.anchor).toMatchObject({ id: "b" });
  });

  it("rejects a terminal no room declared", () => {
    const { result } = slot();
    expect(() => result.current.get("nope")).toThrow(/no terminal/);
  });
});
