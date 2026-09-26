import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DesktopUnsyncedSavesDialog } from "./DesktopUnsyncedSavesDialog";

describe("DesktopUnsyncedSavesDialog — serverReachable: true", () => {
  it("renders reachable copy and all three buttons", () => {
    const onChoice = vi.fn();
    render(<DesktopUnsyncedSavesDialog versionName="Super Mario (USA)" serverReachable={true} onChoice={onChoice} />);

    const dialog = screen.getByRole("dialog", { name: "Unsynced saves" });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      '"Super Mario (USA)" has save changes that were never uploaded to RomM. They stay on disk, but won\'t sync until you switch back.',
    );
    expect(screen.getByRole("button", { name: "Sync now & switch" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch anyway" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls onChoice with 'sync_and_switch' on Sync now & switch click", () => {
    const onChoice = vi.fn();
    render(<DesktopUnsyncedSavesDialog versionName="Super Mario (USA)" serverReachable={true} onChoice={onChoice} />);

    fireEvent.click(screen.getByRole("button", { name: "Sync now & switch" }));
    expect(onChoice).toHaveBeenCalledWith("sync_and_switch");
  });

  it("calls onChoice with 'switch_anyway' on Switch anyway click", () => {
    const onChoice = vi.fn();
    render(<DesktopUnsyncedSavesDialog versionName="Super Mario (USA)" serverReachable={true} onChoice={onChoice} />);

    fireEvent.click(screen.getByRole("button", { name: "Switch anyway" }));
    expect(onChoice).toHaveBeenCalledWith("switch_anyway");
  });

  it("calls onChoice with 'cancel' on Cancel click", () => {
    const onChoice = vi.fn();
    render(<DesktopUnsyncedSavesDialog versionName="Super Mario (USA)" serverReachable={true} onChoice={onChoice} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChoice).toHaveBeenCalledWith("cancel");
  });
});

describe("DesktopUnsyncedSavesDialog — serverReachable: false", () => {
  it("renders unreachable copy and only Switch anyway and Cancel", () => {
    const onChoice = vi.fn();
    render(<DesktopUnsyncedSavesDialog versionName="Super Mario (USA)" serverReachable={false} onChoice={onChoice} />);

    const dialog = screen.getByRole("dialog", { name: "Unsynced saves" });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      "\"Super Mario (USA)\" has save changes that were never uploaded, and RomM is not reachable right now — so they can't be synced first. They stay on disk, but won't sync until you switch back.",
    );
    expect(screen.queryByRole("button", { name: "Sync now & switch" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch anyway" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls onChoice with 'switch_anyway' on Switch anyway click", () => {
    const onChoice = vi.fn();
    render(<DesktopUnsyncedSavesDialog versionName="Super Mario (USA)" serverReachable={false} onChoice={onChoice} />);

    fireEvent.click(screen.getByRole("button", { name: "Switch anyway" }));
    expect(onChoice).toHaveBeenCalledWith("switch_anyway");
  });

  it("calls onChoice with 'cancel' on Escape key", () => {
    const onChoice = vi.fn();
    render(<DesktopUnsyncedSavesDialog versionName="Super Mario (USA)" serverReachable={false} onChoice={onChoice} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onChoice).toHaveBeenCalledWith("cancel");
  });
});
