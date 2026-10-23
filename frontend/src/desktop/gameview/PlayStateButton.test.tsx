import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CHOOSE_GAME_FIRST_IN_MENU } from "../../utils/artworkTabWording";
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

  it("renders menu with Refresh Artwork, Choose SteamGridDB Game…, Refresh Metadata, and Uninstall in order with standard grey colors", () => {
    const onRefreshArtwork = vi.fn();
    const onChooseGame = vi.fn();
    const onRefreshMetadata = vi.fn();
    const onUninstall = vi.fn();
    const { container } = render(
      <PlayStateButton
        effectiveState="play"
        showMenu={true}
        onPlay={vi.fn()}
        onToggleMenu={vi.fn()}
        onRefreshArtwork={onRefreshArtwork}
        onChooseGame={onChooseGame}
        onRefreshMetadata={onRefreshMetadata}
        onUninstall={onUninstall}
      />,
    );

    const group = container.querySelector(".tender-desktop-play-btn-group");
    expect(group).toHaveStyle({ zIndex: "1000" });

    const menu = container.querySelector(".tender-desktop-play-menu")!;
    expect(menu).toBeInTheDocument();

    const menuButtons = menu.querySelectorAll("button");
    expect(menuButtons).toHaveLength(4);

    expect(menuButtons[0]).toHaveTextContent("Refresh Artwork");
    expect(menuButtons[1]).toHaveTextContent("Choose SteamGridDB Game…");
    expect(menuButtons[2]).toHaveTextContent("Refresh Metadata");
    expect(menuButtons[3]).toHaveTextContent("Uninstall");

    // Standard grey color (#c7d5e0) on the artwork and metadata items
    expect(menuButtons[0]).toHaveStyle({ color: "#c7d5e0" });
    expect(menuButtons[1]).toHaveStyle({ color: "#c7d5e0" });
    expect(menuButtons[2]).toHaveStyle({ color: "#c7d5e0" });

    // Destructive red on uninstall
    expect(menuButtons[3]).toHaveStyle({ color: "#ff6b6b" });

    fireEvent.click(menuButtons[0]!);
    expect(onRefreshArtwork).toHaveBeenCalledTimes(1);

    fireEvent.click(menuButtons[1]!);
    expect(onChooseGame).toHaveBeenCalledTimes(1);

    fireEvent.click(menuButtons[2]!);
    expect(onRefreshMetadata).toHaveBeenCalledTimes(1);

    fireEvent.click(menuButtons[3]!);
    expect(onUninstall).toHaveBeenCalledTimes(1);
  });

  it("greys Refresh Artwork and says where to choose a game, when told the ROM has none", () => {
    const onRefreshArtwork = vi.fn();
    render(
      <PlayStateButton
        effectiveState="play"
        showMenu={true}
        onPlay={vi.fn()}
        onToggleMenu={vi.fn()}
        refreshArtworkDisabled={true}
        onRefreshArtwork={onRefreshArtwork}
        onUninstall={vi.fn()}
      />,
    );

    const refresh = screen.getByRole("button", { name: /refresh artwork/i });
    expect(refresh).toBeDisabled();
    expect(refresh).toHaveTextContent(CHOOSE_GAME_FIRST_IN_MENU);
    fireEvent.click(refresh);
    expect(onRefreshArtwork).not.toHaveBeenCalled();
  });
});
