// The DOM chrome's keyboard contract: "/" opens go-to and Enter goes; digits
// toggle layers but never while someone is typing; Esc closes the inspector
// but defers to a palette on top of it.
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { GoToPalette, type GoToTarget } from "./GoToPalette";
import { InspectPanel } from "./InspectPanel";
import { LayerBar } from "./LayerBar";
import { useLayers } from "./layers";

const TARGETS: GoToTarget[] = [
  { id: "checkout", label: "checkout", kind: "service", pos: [1, 0, 1] },
  { id: "ledger", label: "ledger", kind: "database", pos: [4, 0, 2] },
];

function key(k: string, code: string, extra: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true, ...extra }));
  });
}

function Palette({ onGo }: { onGo: (t: GoToTarget) => void }) {
  const [open, setOpen] = useState(false);
  return <GoToPalette open={open} onOpenChange={setOpen} targets={TARGETS} onGo={onGo} />;
}

describe("GoToPalette", () => {
  it("opens on /, filters, and goes on Enter", () => {
    const onGo = vi.fn();
    render(<Palette onGo={onGo} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    key("/", "Slash");
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "ledg" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onGo).toHaveBeenCalledWith(TARGETS[1]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on Ctrl+K and closes on Escape", () => {
    render(<Palette onGo={() => {}} />);
    key("k", "KeyK", { ctrlKey: true });
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Ctrl+K typed in its own input, and keeps the browser's shortcut from running", () => {
    render(<Palette onGo={() => {}} />);
    key("k", "KeyK", { ctrlKey: true });
    const input = screen.getByRole("textbox");
    const notCancelled = fireEvent.keyDown(input, { key: "k", code: "KeyK", ctrlKey: true });
    expect(notCancelled).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("LayerBar", () => {
  it("toggles by digit, solos by shift+digit, and ignores typing", () => {
    const { result } = renderHook(() => useLayers([{ id: "traffic", label: "traffic" }, { id: "cost", label: "cost" }]));
    const view = render(<LayerBar layers={result.current} />);
    const sync = () => view.rerender(<LayerBar layers={result.current} />);
    key("1", "Digit1");
    sync();
    expect(result.current.on).toMatchObject({ traffic: true });
    key("!", "Digit2", { shiftKey: true });
    sync();
    expect(result.current.on).toEqual({ traffic: false, cost: true });

    const field = document.createElement("input");
    document.body.appendChild(field);
    act(() => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "1", code: "Digit1", bubbles: true }));
    });
    expect(result.current.on).toEqual({ traffic: false, cost: true });
    field.remove();
    expect(screen.getAllByRole("button")[1]!.getAttribute("aria-pressed")).toBe("true");
  });

  it("leaves a key alone that a focused control already handled", () => {
    const { result } = renderHook(() => useLayers([{ id: "traffic", label: "traffic" }]));
    render(<LayerBar layers={result.current} />);
    const chip = document.createElement("button");
    chip.addEventListener("keydown", (e) => e.preventDefault());
    document.body.appendChild(chip);
    act(() => {
      chip.dispatchEvent(new KeyboardEvent("keydown", { key: "1", code: "Digit1", bubbles: true, cancelable: true }));
    });
    expect(result.current.on).toEqual({ traffic: false });
    chip.remove();
  });
});

describe("InspectPanel", () => {
  it("closes on Esc and on its button, and renders host fields", () => {
    const onClose = vi.fn();
    render(
      <InspectPanel
        open
        title="checkout"
        kind="service"
        fields={[{ label: "owner", value: "team-cart" }]}
        sections={[{ title: "agents", fields: [{ label: "a-7", value: "PR #42", tone: "warn" }] }]}
        onClose={onClose}
      />,
    );
    expect(screen.getByText("team-cart")).toBeTruthy();
    expect(screen.getByText("PR #42").className).toContain("sw-kit-tone-warn");
    key("Escape", "Escape");
    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("leaves Esc to a dialog on top", () => {
    const onClose = vi.fn();
    render(
      <>
        <InspectPanel open title="x" onClose={onClose} />
        <div role="dialog" />
      </>,
    );
    key("Escape", "Escape");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<InspectPanel open={false} title="x" onClose={() => {}} />);
    expect(container.innerHTML).toBe("");
  });
});
