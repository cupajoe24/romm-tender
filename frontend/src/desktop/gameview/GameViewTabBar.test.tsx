import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GameViewTabBar } from "./GameViewTabBar";

describe("GameViewTabBar", () => {
  it("renders both Game Info and Emulation Settings tabs", () => {
    render(<GameViewTabBar activeTab="game-info" onSelectTab={vi.fn()} />);

    const gameInfoTab = screen.getByRole("tab", { name: "Game Info" });
    const emulationSettingsTab = screen.getByRole("tab", { name: "Emulation Settings" });

    expect(gameInfoTab).toBeInTheDocument();
    expect(emulationSettingsTab).toBeInTheDocument();
    expect(gameInfoTab).toHaveAttribute("aria-selected", "true");
    expect(emulationSettingsTab).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelectTab when a tab is clicked", () => {
    const handleSelectTab = vi.fn();
    render(<GameViewTabBar activeTab="game-info" onSelectTab={handleSelectTab} />);

    const emulationSettingsTab = screen.getByRole("tab", { name: "Emulation Settings" });
    fireEvent.click(emulationSettingsTab);

    expect(handleSelectTab).toHaveBeenCalledWith("emulation-settings");
  });

  it("applies active styling and aria-selected state for emulation-settings tab", () => {
    render(<GameViewTabBar activeTab="emulation-settings" onSelectTab={vi.fn()} />);

    const gameInfoTab = screen.getByRole("tab", { name: "Game Info" });
    const emulationSettingsTab = screen.getByRole("tab", { name: "Emulation Settings" });

    expect(gameInfoTab).toHaveAttribute("aria-selected", "false");
    expect(emulationSettingsTab).toHaveAttribute("aria-selected", "true");
    expect(emulationSettingsTab).toHaveClass("active");
  });

  it("applies custom className when provided", () => {
    render(<GameViewTabBar activeTab="game-info" onSelectTab={vi.fn()} className="custom-test-bar" />);

    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveClass("tender-desktop-tab-bar");
    expect(tablist).toHaveClass("custom-test-bar");
  });
});
