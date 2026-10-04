import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DesktopConfirmDialog } from "./DesktopConfirmDialog";

const renderDialog = (onChoice = vi.fn()) => {
  render(
    <DesktopConfirmDialog
      titleId="test-confirm"
      title="Forget everything?"
      description="This cannot be taken back."
      confirmLabel="Forget"
      cancelLabel="Keep"
      tone="danger"
      onChoice={onChoice}
    />,
  );
  return onChoice;
};

describe("DesktopConfirmDialog", () => {
  it("asks its question under its title", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "Forget everything?" });
    expect(dialog).toHaveTextContent("This cannot be taken back.");
  });

  it("answers yes only on the confirm button", () => {
    const onChoice = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Forget" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));

    expect(onChoice.mock.calls).toEqual([[true], [false]]);
  });

  it("answers no on Escape, and claims the key so the window around it does not close too", () => {
    const onChoice = renderDialog();
    const escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });

    window.dispatchEvent(escape);

    expect(onChoice).toHaveBeenCalledWith(false);
    expect(escape.defaultPrevented).toBe(true);
  });

  it("leaves every other key alone", () => {
    const onChoice = renderDialog();
    const enter = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });

    window.dispatchEvent(enter);

    expect(onChoice).not.toHaveBeenCalled();
    expect(enter.defaultPrevented).toBe(false);
  });
});
