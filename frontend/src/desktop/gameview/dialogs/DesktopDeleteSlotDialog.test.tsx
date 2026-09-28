import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DesktopDeleteSlotDialog } from "./DesktopDeleteSlotDialog";
import type { SlotDeleteInfo } from "../../../types";

describe("DesktopDeleteSlotDialog", () => {
  const deleteInfo: SlotDeleteInfo = {
    success: true,
    slot: "speedrun",
    source: "server",
    local_file_count: 0,
    server_save_count: 2,
  };

  it("renders title, warning lines, irreversible note, and action buttons", () => {
    render(<DesktopDeleteSlotDialog deleteInfo={deleteInfo} onDismiss={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByText("Delete Slot")).toBeInTheDocument();
    expect(
      screen.getByText("This will permanently delete 2 saves from slot 'speedrun' on the RomM server."),
    ).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("calls onConfirm when Delete button is clicked", () => {
    const onConfirm = vi.fn();
    render(<DesktopDeleteSlotDialog deleteInfo={deleteInfo} onDismiss={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when Cancel button is clicked", () => {
    const onDismiss = vi.fn();
    render(<DesktopDeleteSlotDialog deleteInfo={deleteInfo} onDismiss={onDismiss} onConfirm={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
