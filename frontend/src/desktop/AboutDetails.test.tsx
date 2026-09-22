import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AboutDetails, formatReleaseDate } from "./AboutDetails";
import type { RomMetadata } from "../types";

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

  describe("formatReleaseDate", () => {
    it("returns null for null, 0, or negative timestamps", () => {
      expect(formatReleaseDate(null)).toBeNull();
      expect(formatReleaseDate(0)).toBeNull();
      expect(formatReleaseDate(-100)).toBeNull();
    });

    it("formats a positive timestamp into day month year", () => {
      const formatted = formatReleaseDate(1082592000);
      expect(formatted).toMatch(/\d{1,2}\s[A-Z][a-z]{2}\s2004/);
    });
  });

  describe("component rendering", () => {
    it("renders title, summary, and metadata fields when provided", () => {
      render(
        <AboutDetails
          title="Mario Golf: Advance Tour"
          platformName="Game Boy Advance"
          metadata={sampleMetadata}
          covers={["https://steamloopback.host/custom/1.jpg"]}
        />,
      );

      expect(screen.getByText("Mario Golf: Advance Tour")).toBeInTheDocument();
      expect(screen.getByText("A thrilling adventure across the kingdom.")).toBeInTheDocument();
      expect(screen.getByText("Game Boy Advance")).toBeInTheDocument();
      expect(screen.getByText("Camelot Software Planning")).toBeInTheDocument();
      expect(screen.getByText("Single player, Split screen")).toBeInTheDocument();
      expect(screen.getByText("80%")).toBeInTheDocument();
      expect(screen.getByText("1-4")).toBeInTheDocument();
      expect(screen.getByText("RPG")).toBeInTheDocument();
      expect(screen.getByText("Action")).toBeInTheDocument();
    });

    it("renders placeholder when no covers are provided", () => {
      render(<AboutDetails title="Generic ROM" platformName="SNES" metadata={null} />);
      expect(screen.getByText("Generic ROM")).toBeInTheDocument();
      const snesElements = screen.getAllByText("SNES");
      expect(snesElements.length).toBe(2);
    });

    it("advances cover candidate index on image error", () => {
      render(
        <AboutDetails
          title="Cover Test"
          platformName="GBA"
          metadata={null}
          covers={["https://steamloopback.host/bad.jpg", "https://steamloopback.host/good.png"]}
        />,
      );

      const img = screen.getByRole("img", { name: "Cover Test" });
      expect(img).toHaveAttribute("src", "https://steamloopback.host/bad.jpg");

      fireEvent.error(img);
      expect(img).toHaveAttribute("src", "https://steamloopback.host/good.png");
    });
  });
});
