import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlayStateButton } from "./PlayStateButton";

describe("PlayStateButton", () => {
  it("renders PLAY button and triggers onPlay and onToggleMenu", () => {
    const onPlay = vi.fn();
    const onToggleMenu = vi.fn();

    render(
      <PlayStateButton
        effectiveState="play"
        showMenu={false}
        onPlay={onPlay}
        onToggleMenu={onToggleMenu}
        onUninstall={vi.fn()}
      />,
    );

    const playBtn = screen.getByText("PLAY").closest("button")!;
    expect(playBtn).toBeEnabled();
    fireEvent.click(playBtn);
    expect(onPlay).toHaveBeenCalledTimes(1);

    const toggleBtn = screen.getByLabelText("Game Options");
    fireEvent.click(toggleBtn);
    expect(onToggleMenu).toHaveBeenCalledTimes(1);
  });

  it("renders SYNCING SAVES... and disables main button", () => {
    render(
      <PlayStateButton
        effectiveState="syncing"
        showMenu={false}
        onPlay={vi.fn()}
        onToggleMenu={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );

    const syncBtn = screen.getByText("SYNCING SAVES...").closest("button")!;
    expect(syncBtn).toBeDisabled();
  });

  it("renders LAUNCHING... and disables main button", () => {
    render(
      <PlayStateButton
        effectiveState="launching"
        showMenu={false}
        onPlay={vi.fn()}
        onToggleMenu={vi.fn()}
        onUninstall={vi.fn()}
      />,
    );

    const launchBtn = screen.getByText("LAUNCHING...").closest("button")!;
    expect(launchBtn).toBeDisabled();
  });

  it("renders menu with Uninstall option when showMenu is true", () => {
    const onUninstall = vi.fn();
    const { container } = render(
      <PlayStateButton
        effectiveState="play"
        showMenu={true}
        onPlay={vi.fn()}
        onToggleMenu={vi.fn()}
        onUninstall={onUninstall}
      />,
    );

    const group = container.querySelector(".tender-desktop-play-btn-group");
    expect(group).toHaveStyle({ zIndex: "1000" });

    const uninstallBtn = screen.getByText("Uninstall");
    expect(uninstallBtn).toBeInTheDocument();
    fireEvent.click(uninstallBtn);
    expect(onUninstall).toHaveBeenCalledTimes(1);
  });
});
