import "@testing-library/jest-dom/vitest";
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

  it("renders menu with Refresh Artwork, Refresh Metadata, and Uninstall options in order with standard grey colors", () => {
    const onRefreshArtwork = vi.fn();
    const onRefreshMetadata = vi.fn();
    const onUninstall = vi.fn();
    const { container } = render(
      <PlayStateButton
        effectiveState="play"
        showMenu={true}
        onPlay={vi.fn()}
        onToggleMenu={vi.fn()}
        onRefreshArtwork={onRefreshArtwork}
        onRefreshMetadata={onRefreshMetadata}
        onUninstall={onUninstall}
      />,
    );

    const group = container.querySelector(".tender-desktop-play-btn-group");
    expect(group).toHaveStyle({ zIndex: "1000" });

    const menu = container.querySelector(".tender-desktop-play-menu")!;
    expect(menu).toBeInTheDocument();

    const menuButtons = menu.querySelectorAll("button");
    expect(menuButtons).toHaveLength(3);

    // Verify ordering: Refresh Artwork, Refresh Metadata, Uninstall
    expect(menuButtons[0]).toHaveTextContent("Refresh Artwork");
    expect(menuButtons[1]).toHaveTextContent("Refresh Metadata");
    expect(menuButtons[2]).toHaveTextContent("Uninstall");

    // Standard grey color (#c7d5e0) on refresh items
    expect(menuButtons[0]).toHaveStyle({ color: "#c7d5e0" });
    expect(menuButtons[1]).toHaveStyle({ color: "#c7d5e0" });

    // Destructive red on uninstall
    expect(menuButtons[2]).toHaveStyle({ color: "#ff6b6b" });

    // Click triggers
    fireEvent.click(menuButtons[0]!);
    expect(onRefreshArtwork).toHaveBeenCalledTimes(1);

    fireEvent.click(menuButtons[1]!);
    expect(onRefreshMetadata).toHaveBeenCalledTimes(1);

    fireEvent.click(menuButtons[2]!);
    expect(onUninstall).toHaveBeenCalledTimes(1);
  });
});
