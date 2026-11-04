// The selection store is shared by the canvas and the DOM: it must notify only
// on real changes (a crosshair writes it 20 times a second) and an object that
// leaves must not wipe a hover that has already moved on.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createSelectionStore, sameRef, selectionPrompt, useSelection } from "./selection";

const A = { kind: "service", id: "checkout" };
const B = { kind: "agent", id: "a-7" };

describe("the selection store", () => {
  it("compares refs by value", () => {
    expect(sameRef(A, { ...A })).toBe(true);
    expect(sameRef(A, B)).toBe(false);
    expect(sameRef(null, undefined)).toBe(true);
    expect(sameRef(A, null)).toBe(false);
  });

  it("notifies on change only", () => {
    const store = createSelectionStore();
    const fn = vi.fn();
    store.subscribe(fn);
    store.select(A);
    store.select({ ...A });
    store.hover(B);
    store.hover(B);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(store.getState()).toEqual({ selected: A, hovered: B });
  });

  it("unhovers only the ref still hovered", () => {
    const store = createSelectionStore();
    store.hover(A);
    store.hover(B);
    store.unhover(A);
    expect(store.getState().hovered).toEqual(B);
    store.unhover(B);
    expect(store.getState().hovered).toBeNull();
  });

  it("stops notifying after unsubscribe", () => {
    const store = createSelectionStore();
    const fn = vi.fn();
    const off = store.subscribe(fn);
    off();
    store.select(A);
    expect(fn).not.toHaveBeenCalled();
  });

  it("prompts for the hovered thing unless it is already selected", () => {
    expect(selectionPrompt({ selected: null, hovered: A })).toBe("INSPECT checkout");
    expect(selectionPrompt({ selected: A, hovered: A })).toBeNull();
    expect(selectionPrompt({ selected: null, hovered: null })).toBeNull();
    expect(selectionPrompt({ selected: null, hovered: B }, (r) => r.id.toUpperCase(), "FOLLOW")).toBe("FOLLOW A-7");
  });
});

describe("useSelection", () => {
  it("re-renders on store writes from outside React", () => {
    const store = createSelectionStore();
    const { result } = renderHook(() => useSelection(store));
    expect(result.current.selected).toBeNull();
    act(() => store.select(A));
    expect(result.current.selected).toEqual(A);
    expect(result.current.isSelected({ ...A })).toBe(true);
    act(() => result.current.clear());
    expect(store.getState().selected).toBeNull();
  });
});
