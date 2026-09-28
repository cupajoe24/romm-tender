import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlayButtonBadges } from "./PlayButtonBadges";
import * as achievementsCard from "./AchievementsCard";
import { BIOS_MISSING_RED } from "../../utils/biosColor";

vi.mock("./AchievementsCard", () => ({
  requestOpenAchievementsModal: vi.fn(),
}));

describe("PlayButtonBadges", () => {
  const baseDetail = {
    installed: true,
    fsSizeBytes: 1024 * 1024 * 50,
    raId: null,
    achievementEarned: 0,
    achievementTotal: 0,
    saveSyncEnabled: false,
    saveStatus: null,
    saveSyncStatus: null,
    biosRequiredMissing: false,
    biosNeeded: false,
    biosLabel: null,
  };

  const basePlaytime = {
    lastPlayed: "Yesterday",
    playtime: "2.5 hours",
  };

  it("renders last played and playtime badges", () => {
    render(
      <PlayButtonBadges
        detail={baseDetail}
        playtimeInfo={basePlaytime}
        achievementCounts={null}
        setupInfo={null}
        isOffline={false}
        romId={100}
      />,
    );

    expect(screen.getByText("LAST PLAYED")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText("PLAYTIME")).toBeInTheDocument();
    expect(screen.getByText("2.5 hours")).toBeInTheDocument();
  });

  it("renders space required badge when game is uninstalled", () => {
    render(
      <PlayButtonBadges
        detail={{ ...baseDetail, installed: false }}
        playtimeInfo={basePlaytime}
        achievementCounts={null}
        setupInfo={null}
        isOffline={false}
        romId={100}
      />,
    );

    expect(screen.getByText("SPACE REQUIRED")).toBeInTheDocument();
    expect(screen.getByText("50.0 MB")).toBeInTheDocument();
  });

  it("renders achievements badge and handles click and Enter key", () => {
    render(
      <PlayButtonBadges
        detail={{ ...baseDetail, raId: 1234 }}
        playtimeInfo={basePlaytime}
        achievementCounts={{ earned: 5, total: 10 }}
        setupInfo={null}
        isOffline={false}
        romId={100}
      />,
    );

    expect(screen.getByText("ACHIEVEMENTS")).toBeInTheDocument();
    expect(screen.getByText("5/10")).toBeInTheDocument();

    const achBtn = screen.getByText("ACHIEVEMENTS").closest('[role="button"]')!;
    fireEvent.click(achBtn);
    expect(achievementsCard.requestOpenAchievementsModal).toHaveBeenCalledWith(100);

    fireEvent.keyDown(achBtn, { key: "Enter" });
    expect(achievementsCard.requestOpenAchievementsModal).toHaveBeenCalledTimes(2);
  });

  it("renders save sync badge and switches tab on click", () => {
    const dispatchSpy = vi.spyOn(globalThis, "dispatchEvent");
    render(
      <PlayButtonBadges
        detail={{ ...baseDetail, saveSyncEnabled: true }}
        playtimeInfo={basePlaytime}
        achievementCounts={null}
        setupInfo={null}
        isOffline={false}
        romId={100}
      />,
    );

    expect(screen.getByText("SAVE SYNC")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();

    const syncBtn = screen.getByText("SAVE SYNC").closest('[role="button"]')!;
    fireEvent.click(syncBtn);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "romm_tab_switch",
        detail: { tab: "emulation-settings" },
      }),
    );
  });

  it("renders bios badge with biosLabel and red dot when required bios is missing", () => {
    render(
      <PlayButtonBadges
        detail={{ ...baseDetail, biosRequiredMissing: true, biosLabel: "1/3 required" }}
        playtimeInfo={basePlaytime}
        achievementCounts={null}
        setupInfo={null}
        isOffline={false}
        romId={100}
      />,
    );

    expect(screen.getByText("BIOS")).toBeInTheDocument();
    expect(screen.getByText("1/3 required")).toBeInTheDocument();
    const biosBadge = screen.getByText("BIOS").closest(".tender-desktop-bios")!;
    const dot = biosBadge.querySelector(".romm-status-dot")!;
    expect(dot).toHaveStyle({ backgroundColor: BIOS_MISSING_RED });
  });

  it("does not render bios badge when required bios is not missing", () => {
    render(
      <PlayButtonBadges
        detail={{ ...baseDetail, biosRequiredMissing: false, biosLabel: "OK" }}
        playtimeInfo={basePlaytime}
        achievementCounts={null}
        setupInfo={null}
        isOffline={false}
        romId={100}
      />,
    );

    expect(screen.queryByText("BIOS")).not.toBeInTheDocument();
  });

  it("switches to emulation-settings tab on click and Enter key when bios badge is clicked", () => {
    const dispatchSpy = vi.spyOn(globalThis, "dispatchEvent");
    dispatchSpy.mockClear();
    render(
      <PlayButtonBadges
        detail={{ ...baseDetail, biosRequiredMissing: true, biosLabel: "Missing" }}
        playtimeInfo={basePlaytime}
        achievementCounts={null}
        setupInfo={null}
        isOffline={false}
        romId={100}
      />,
    );

    const biosBadge = screen.getByText("BIOS").closest('[role="button"]')!;
    fireEvent.click(biosBadge);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "romm_tab_switch",
        detail: { tab: "emulation-settings" },
      }),
    );

    fireEvent.keyDown(biosBadge, { key: "Enter" });
    expect(dispatchSpy).toHaveBeenCalledTimes(2);
  });
});
