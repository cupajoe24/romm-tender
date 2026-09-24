import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { AchievementsCard, formatCardDate, requestOpenAchievementsModal } from "./AchievementsCard";
import * as backend from "../../api/backend";
import * as connState from "../../utils/connectionState";
import type { Achievement, AchievementProgress } from "../../types";

vi.mock("../../api/backend", () => ({
  getAchievements: vi.fn(),
  getAchievementProgress: vi.fn(),
  debugLog: vi.fn(),
}));

vi.mock("../../utils/artwork", () => ({
  getGameIconUrl: vi.fn().mockResolvedValue("data:image/png;base64,ICON_DATA"),
}));

vi.mock("../../utils/connectionState", () => ({
  useRommConnectionState: vi.fn(),
  beginServerLoad: vi.fn(() => ({ id: 1 })),
  settleServerLoad: vi.fn(),
  reportServerReachable: vi.fn(),
}));

describe("AchievementsCard", () => {
  const sampleAchievements: Achievement[] = [
    {
      ra_id: 101,
      badge_id: "badge_101",
      title: "You Will Get The Power!",
      description: "Hit Klepto",
      points: 5,
      badge_url: "https://retroachievements.org/Badge/101.png",
      badge_url_lock: "https://retroachievements.org/Badge/101_lock.png",
      display_order: 1,
      type: "",
      num_awarded: 575,
      num_awarded_hardcore: 300,
    },
    {
      ra_id: 102,
      badge_id: "badge_102",
      title: "Smoking Joe",
      description: "Beat Joe in singles and unlock him as a playable character",
      points: 10,
      badge_url: "https://retroachievements.org/Badge/102.png",
      badge_url_lock: "https://retroachievements.org/Badge/102_lock.png",
      display_order: 2,
      type: "",
      num_awarded: 900,
      num_awarded_hardcore: 450,
    },
    {
      ra_id: 103,
      badge_id: "badge_103",
      title: "Club Slots Champion",
      description: "Win every Club Slots challenge",
      points: 25,
      badge_url: "https://retroachievements.org/Badge/103.png",
      badge_url_lock: "https://retroachievements.org/Badge/103_lock.png",
      display_order: 3,
      type: "",
      num_awarded: 112,
      num_awarded_hardcore: 50,
    },
    {
      ra_id: 104,
      badge_id: "badge_104",
      title: "Go-Go Gates Master",
      description: "Clear Go-Go Gates without a miss",
      points: 25,
      badge_url: "https://retroachievements.org/Badge/104.png",
      badge_url_lock: "https://retroachievements.org/Badge/104_lock.png",
      display_order: 4,
      type: "",
      num_awarded: 88,
      num_awarded_hardcore: 20,
    },
    {
      ra_id: 105,
      badge_id: "badge_105",
      title: "Bonus Challenger",
      description: "Complete all bonus challenges",
      points: 50,
      badge_url: "https://retroachievements.org/Badge/105.png",
      badge_url_lock: "https://retroachievements.org/Badge/105_lock.png",
      display_order: 5,
      type: "",
      num_awarded: 25,
      num_awarded_hardcore: 10,
    },
  ];

  const sampleProgress: AchievementProgress = {
    success: true,
    earned: 2,
    earned_hardcore: 2,
    total: 5,
    earned_achievements: [
      {
        id: "badge_101",
        date: "2025-02-22 12:48:00",
        date_hardcore: "2025-02-22 12:48:00",
      },
      {
        id: "badge_102",
        date: "2025-02-22 13:15:00",
        date_hardcore: "2025-02-22 13:15:00",
      },
    ],
  };

  beforeEach(() => {
    vi.mocked(connState.useRommConnectionState).mockReturnValue("connected");
    vi.mocked(backend.getAchievements).mockResolvedValue({
      success: true,
      achievements: sampleAchievements,
      total: 5,
    });
    vi.mocked(backend.getAchievementProgress).mockResolvedValue(sampleProgress);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("formats card date by removing trailing seconds", () => {
    expect(formatCardDate("2025-02-22 12:48:00")).toBe("2025-02-22 12:48");
  });

  it("renders achievements card with header, summary, and preview rows", async () => {
    render(
      <AchievementsCard
        appId={12345}
        romId={42}
        raId={999}
        title="Mario Golf"
        covers={["https://example.com/cover.jpg"]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Achievements")).toBeInTheDocument();
    });

    expect(screen.getByText("2 of 5 · 2 hardcore")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show all 5" })).toBeInTheDocument();

    // Renders up to 4 items in preview (2 earned + 2 locked)
    expect(screen.getByText("You Will Get The Power!")).toBeInTheDocument();
    expect(screen.getByText("Smoking Joe")).toBeInTheDocument();
    expect(screen.getByText("Club Slots Champion")).toBeInTheDocument();
    expect(screen.getByText("Go-Go Gates Master")).toBeInTheDocument();
    // 5th item should not be in the 4-item preview
    expect(screen.queryByText("Bonus Challenger")).not.toBeInTheDocument();

    // Points
    expect(screen.getByText("5 pts")).toBeInTheDocument();
    expect(screen.getByText("10 pts")).toBeInTheDocument();
    expect(screen.getAllByText("25 pts")).toHaveLength(2);
  });

  it("opens modal when clicking 'Show all 5'", async () => {
    render(
      <AchievementsCard
        appId={12345}
        romId={42}
        raId={999}
        title="Mario Golf"
        covers={["https://example.com/cover.jpg"]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Show all 5" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Show all 5" }));

    // Modal dialog is now open, showing header and full list including 5th item
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Bonus Challenger")).toBeInTheDocument();
  });

  it("opens modal when clicking an achievement preview row", async () => {
    render(<AchievementsCard appId={12345} romId={42} raId={999} title="Mario Golf" />);

    await waitFor(() => {
      expect(screen.getByText("Smoking Joe")).toBeInTheDocument();
    });

    const row = screen.getByText("Smoking Joe").closest('[role="button"]')!;
    fireEvent.click(row);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows offline fallback when RomM is offline and achievements are empty", async () => {
    vi.mocked(connState.useRommConnectionState).mockReturnValue("offline");
    vi.mocked(backend.getAchievements).mockResolvedValue({
      success: false,
      achievements: [],
      total: 0,
    });

    render(<AchievementsCard appId={12345} romId={42} raId={999} title="Mario Golf" />);

    await waitFor(() => {
      expect(screen.getByText("RomM offline — achievements unavailable.")).toBeInTheDocument();
    });
  });

  it("shows empty state when game has no achievements", async () => {
    vi.mocked(backend.getAchievements).mockResolvedValue({
      success: true,
      achievements: [],
      total: 0,
    });
    vi.mocked(backend.getAchievementProgress).mockResolvedValue({
      success: true,
      earned: 0,
      total: 0,
      earned_achievements: [],
    });

    render(<AchievementsCard appId={12345} romId={42} raId={999} title="Mario Golf" />);

    await waitFor(() => {
      expect(screen.getByText("No achievements found for this game.")).toBeInTheDocument();
    });
  });

  it("opens modal when romm_open_achievements_modal event is dispatched", async () => {
    render(<AchievementsCard appId={12345} romId={42} raId={999} title="Mario Golf" />);

    await waitFor(() => {
      expect(screen.getByText("Achievements")).toBeInTheDocument();
    });

    act(() => {
      globalThis.dispatchEvent(
        new CustomEvent("romm_open_achievements_modal", {
          detail: { romId: 42 },
        }),
      );
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opens modal immediately on mount if requested via requestOpenAchievementsModal", async () => {
    requestOpenAchievementsModal(42);

    render(<AchievementsCard appId={12345} romId={42} raId={999} title="Mario Golf" />);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});
