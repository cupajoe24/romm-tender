import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AchievementsModal, formatModalUnlockDate } from "./AchievementsModal";
import type { Achievement, AchievementProgress } from "../../types";

vi.mock("../../utils/artwork", () => ({
  getGameIconUrl: vi.fn().mockResolvedValue("data:image/png;base64,TEST_ICON"),
}));

describe("AchievementsModal", () => {
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
  ];

  const sampleProgress: AchievementProgress = {
    success: true,
    earned: 2,
    earned_hardcore: 2,
    total: 3,
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

  it("formats date strings into localized readable strings", () => {
    const formatted = formatModalUnlockDate("2025-02-22 12:48:00");
    expect(formatted).toContain("2025");
    expect(formatted).toContain("Feb");
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <AchievementsModal
        isOpen={false}
        onClose={vi.fn()}
        title="Mario Golf"
        achievements={sampleAchievements}
        progress={sampleProgress}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders header, progress bar, and achievement cards when open", () => {
    render(
      <AchievementsModal
        isOpen={true}
        onClose={vi.fn()}
        title="Mario Golf"
        coverUrl="https://example.com/cover.jpg"
        achievements={sampleAchievements}
        progress={sampleProgress}
      />,
    );

    expect(screen.getByRole("heading", { name: "Mario Golf" })).toBeInTheDocument();
    expect(screen.getByText("2 OF 3 ACHIEVEMENTS EARNED")).toBeInTheDocument();
    expect(screen.getByText("(67%)")).toBeInTheDocument();

    expect(screen.getByText("You Will Get The Power!")).toBeInTheDocument();
    expect(screen.getByText("Hit Klepto")).toBeInTheDocument();
    expect(screen.getByText("575 players have this achievement")).toBeInTheDocument();
    expect(screen.getByText("Smoking Joe")).toBeInTheDocument();
    expect(screen.getByText("Club Slots Champion")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const handleClose = vi.fn();
    render(
      <AchievementsModal
        isOpen={true}
        onClose={handleClose}
        title="Mario Golf"
        achievements={sampleAchievements}
        progress={sampleProgress}
      />,
    );

    const closeBtn = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop button is clicked", () => {
    const handleClose = vi.fn();
    render(
      <AchievementsModal
        isOpen={true}
        onClose={handleClose}
        title="Mario Golf"
        achievements={sampleAchievements}
        progress={sampleProgress}
      />,
    );

    const backdrop = screen.getByLabelText("Close achievements dialog");
    fireEvent.click(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    const handleClose = vi.fn();
    render(
      <AchievementsModal
        isOpen={true}
        onClose={handleClose}
        title="Mario Golf"
        achievements={sampleAchievements}
        progress={sampleProgress}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("orders earned achievements first and then locked achievements", () => {
    render(
      <AchievementsModal
        isOpen={true}
        onClose={vi.fn()}
        title="Mario Golf"
        achievements={sampleAchievements}
        progress={sampleProgress}
      />,
    );

    const titles = screen.getAllByText(/Smoking Joe|You Will Get The Power!|Club Slots Champion/);
    expect(titles[0]).toHaveTextContent("Smoking Joe");
    expect(titles[1]).toHaveTextContent("You Will Get The Power!");
    expect(titles[2]).toHaveTextContent("Club Slots Champion");
  });

  it("filters achievements using the search input", () => {
    render(
      <AchievementsModal
        isOpen={true}
        onClose={vi.fn()}
        title="Mario Golf"
        achievements={sampleAchievements}
        progress={sampleProgress}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Search");
    fireEvent.change(searchInput, { target: { value: "slots" } });

    expect(screen.getByText("Club Slots Champion")).toBeInTheDocument();
    expect(screen.queryByText("You Will Get The Power!")).not.toBeInTheDocument();
    expect(screen.queryByText("Smoking Joe")).not.toBeInTheDocument();
    expect(screen.getByText("1 matching")).toBeInTheDocument();
  });

  it("renders empty state message when search matches nothing", () => {
    render(
      <AchievementsModal
        isOpen={true}
        onClose={vi.fn()}
        title="Mario Golf"
        achievements={sampleAchievements}
        progress={sampleProgress}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Search");
    fireEvent.change(searchInput, { target: { value: "nonexistent query xyz" } });

    expect(screen.getByText("No achievements match your search.")).toBeInTheDocument();
  });

  it("renders game icon from iconUrl in the header", () => {
    render(
      <AchievementsModal
        isOpen={true}
        onClose={vi.fn()}
        title="Mario Golf"
        iconUrl="data:image/png;base64,DIRECT_ICON"
        achievements={sampleAchievements}
        progress={sampleProgress}
      />,
    );

    const img = screen.getByRole("dialog").querySelector("img");
    expect(img).toHaveAttribute("src", "data:image/png;base64,DIRECT_ICON");
  });

  it("loads game icon from romId when iconUrl is not provided", async () => {
    render(
      <AchievementsModal
        isOpen={true}
        onClose={vi.fn()}
        title="Mario Golf"
        romId={42}
        achievements={sampleAchievements}
        progress={sampleProgress}
      />,
    );

    await waitFor(() => {
      const img = screen.getByRole("dialog").querySelector("img");
      expect(img).toHaveAttribute("src", "data:image/png;base64,TEST_ICON");
    });
  });
});
