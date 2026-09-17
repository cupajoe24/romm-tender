import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AboutDetails, formatReleaseDate } from "./AboutDetails";
import type { RomMetadata } from "../../types";

describe("AboutDetails", () => {
  const sampleMetadata: RomMetadata = {
    summary: "A thrilling adventure across the kingdom.",
    genres: ["RPG", "Action"],
    companies: ["Camelot Software Planning"],
    first_release_date: 1082592000, // 22 Apr 2004
    average_rating: 80.4,
    game_modes: ["Single player", "Split screen"],
    player_count: "1-4",
    cached_at: 1000,
  };

  it("formats epoch timestamp into day month year format", () => {
    expect(formatReleaseDate(null)).toBeNull();
    expect(formatReleaseDate(0)).toBeNull();
    expect(formatReleaseDate(-100)).toBeNull();
    // 1082592000 = 22 Apr 2004
    const formatted = formatReleaseDate(1082592000);
    expect(formatted).toContain("2004");
    expect(formatted).toContain("Apr");
  });

  it("renders cover placeholder when covers array is empty", () => {
    render(<AboutDetails title="Golden Sun" platformName="GBA" metadata={sampleMetadata} covers={[]} />);
    expect(screen.getByText("Golden Sun")).toBeInTheDocument();
    expect(screen.getAllByText("GBA")).toHaveLength(2);
  });

  it("renders default fallback text when platformName and covers are missing", () => {
    render(<AboutDetails title="Generic Game" metadata={null} covers={[]} />);
    expect(screen.getByText("Generic Game")).toBeInTheDocument();
    expect(screen.getByText("RomM Game")).toBeInTheDocument();
  });

  it("renders metadata fields when metadata is provided", () => {
    render(
      <AboutDetails
        title="Golden Sun: The Lost Age"
        platformName="Game Boy Advance"
        metadata={sampleMetadata}
        covers={["https://steamloopback.host/covers/123.jpg"]}
      />,
    );

    expect(screen.getByText("Golden Sun: The Lost Age")).toBeInTheDocument();
    expect(screen.getByText("A thrilling adventure across the kingdom.")).toBeInTheDocument();
    expect(screen.getByText("Game Boy Advance")).toBeInTheDocument();
    expect(screen.getByText("Camelot Software Planning")).toBeInTheDocument();
    expect(screen.getByText("Single player, Split screen")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("1-4")).toBeInTheDocument();
    expect(screen.getByText("RPG")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();

    const img = screen.getByRole("img", { name: "Golden Sun: The Lost Age" });
    expect(img).toHaveAttribute("src", "https://steamloopback.host/covers/123.jpg");
  });

  it("cycles to next cover when current cover fails to load", () => {
    render(
      <AboutDetails
        title="Cover Cycle Game"
        metadata={null}
        covers={["https://invalid.url/cover1.jpg", "https://valid.url/cover2.jpg"]}
      />,
    );

    const img = screen.getByRole("img", { name: "Cover Cycle Game" });
    expect(img).toHaveAttribute("src", "https://invalid.url/cover1.jpg");

    fireEvent.error(img);
    expect(img).toHaveAttribute("src", "https://valid.url/cover2.jpg");
  });
});
