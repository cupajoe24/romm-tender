import { describe, it, expect } from "vitest";
import {
  lerpColor,
  formatProgress,
  getDownloadFillGradient,
  getDownloadPulseColor,
  getDownloadBaseBackground,
  BLUE_LEFT,
  BLUE_RIGHT,
  BPM_GREEN_LEFT,
  BPM_GREEN_RIGHT,
  DESKTOP_GREEN_LEFT,
  DESKTOP_GREEN_RIGHT,
} from "./downloadProgress";

describe("downloadProgress", () => {
  describe("lerpColor", () => {
    it("returns start color when t is 0", () => {
      expect(lerpColor([0, 0, 0], [100, 100, 100], 0)).toBe("rgb(0, 0, 0)");
    });

    it("returns end color when t is 1", () => {
      expect(lerpColor([0, 0, 0], [100, 100, 100], 1)).toBe("rgb(100, 100, 100)");
    });

    it("interpolates correctly at midpoint t = 0.5", () => {
      expect(lerpColor([0, 50, 100], [100, 150, 200], 0.5)).toBe("rgb(50, 100, 150)");
    });

    it("clamps t below 0 to start color", () => {
      expect(lerpColor([10, 20, 30], [50, 60, 70], -0.5)).toBe("rgb(10, 20, 30)");
    });

    it("clamps t above 1 to end color", () => {
      expect(lerpColor([10, 20, 30], [50, 60, 70], 1.5)).toBe("rgb(50, 60, 70)");
    });
  });

  describe("formatProgress", () => {
    it("formats bytes (< 1024)", () => {
      expect(formatProgress(500, 800)).toBe("500 / 800 B");
    });

    it("formats kilobytes (< 1MB)", () => {
      expect(formatProgress(512 * 1024, 768 * 1024)).toBe("512.0 / 768.0 KB");
    });

    it("formats megabytes (< 1GB)", () => {
      expect(formatProgress(25.5 * 1024 * 1024, 100 * 1024 * 1024)).toBe("25.5 / 100.0 MB");
    });

    it("formats gigabytes (>= 1GB)", () => {
      expect(formatProgress(1.25 * 1024 * 1024 * 1024, 2.5 * 1024 * 1024 * 1024)).toBe("1.25 / 2.50 GB");
    });
  });

  describe("getDownloadFillGradient", () => {
    it("returns bigpicture extracting gradient", () => {
      const grad = getDownloadFillGradient(0.5, true, "bigpicture");
      expect(grad).toBe(
        `linear-gradient(to right, rgb(${BPM_GREEN_LEFT.join(",")}), rgb(${BPM_GREEN_RIGHT.join(",")}))`,
      );
    });

    it("returns desktop extracting gradient", () => {
      const grad = getDownloadFillGradient(0.5, true, "desktop");
      expect(grad).toBe("linear-gradient(90deg, #59bf43 0%, #409930 100%)");
    });

    it("interpolates bigpicture progress gradient from blue to green", () => {
      const grad0 = getDownloadFillGradient(0, false, "bigpicture");
      expect(grad0).toContain(lerpColor(BLUE_LEFT, BPM_GREEN_LEFT, 0));
      expect(grad0).toContain(lerpColor(BLUE_RIGHT, BPM_GREEN_RIGHT, 0));

      const grad1 = getDownloadFillGradient(1, false, "bigpicture");
      expect(grad1).toContain(lerpColor(BLUE_LEFT, BPM_GREEN_LEFT, 1));
      expect(grad1).toContain(lerpColor(BLUE_RIGHT, BPM_GREEN_RIGHT, 1));
    });

    it("interpolates desktop progress gradient with 90deg and percentage stops", () => {
      const grad = getDownloadFillGradient(0.5, false, "desktop");
      expect(grad).toContain("linear-gradient(90deg,");
      expect(grad).toContain(`${lerpColor(BLUE_LEFT, DESKTOP_GREEN_LEFT, 0.5)} 0%`);
      expect(grad).toContain(`${lerpColor(BLUE_RIGHT, DESKTOP_GREEN_RIGHT, 0.5)} 100%`);
    });

    it("clamps out-of-range progress ratios", () => {
      const gradNeg = getDownloadFillGradient(-0.2, false, "bigpicture");
      const grad0 = getDownloadFillGradient(0, false, "bigpicture");
      expect(gradNeg).toBe(grad0);

      const gradOver = getDownloadFillGradient(1.5, false, "bigpicture");
      const grad1 = getDownloadFillGradient(1, false, "bigpicture");
      expect(gradOver).toBe(grad1);
    });
  });

  describe("getDownloadPulseColor", () => {
    it("returns amber when paused", () => {
      expect(getDownloadPulseColor(0.5, { paused: true })).toBe("rgba(212,167,44,0.7)");
    });

    it("returns bpm green when extracting in bigpicture mode", () => {
      expect(getDownloadPulseColor(0.5, { extracting: true }, "bigpicture")).toBe(`rgb(${BPM_GREEN_LEFT.join(", ")})`);
    });

    it("returns desktop green when extracting in desktop mode", () => {
      expect(getDownloadPulseColor(0.5, { extracting: true }, "desktop")).toBe(`rgb(${DESKTOP_GREEN_LEFT.join(", ")})`);
    });

    it("interpolates color when downloading", () => {
      const color = getDownloadPulseColor(0.5, { downloading: true }, "bigpicture");
      expect(color).toBe(lerpColor(BLUE_LEFT, BPM_GREEN_LEFT, 0.5));
    });

    it("returns default blue when idle", () => {
      expect(getDownloadPulseColor(0, {})).toBe("rgba(26,159,255,0.7)");
    });
  });

  describe("getDownloadBaseBackground", () => {
    it("returns muted slate when offline", () => {
      expect(getDownloadBaseBackground(0.5, { isOffline: true })).toBe("linear-gradient(to right, #6b7b8b, #5a6a7a)");
    });

    it("returns dark green when extracting", () => {
      expect(getDownloadBaseBackground(0.5, { extracting: true })).toBe("linear-gradient(to right, #1a4d1a, #0f3320)");
    });

    it("interpolates darker shade when downloading", () => {
      const bg = getDownloadBaseBackground(0.5, { downloading: true });
      expect(bg).toContain("linear-gradient(to right,");
      expect(bg).toContain(lerpColor([10, 50, 90], [5, 35, 65], 0.5));
    });

    it("returns default blue gradient when idle", () => {
      expect(getDownloadBaseBackground(0, {})).toBe("linear-gradient(to right, #1a9fff, #0078d4)");
    });
  });
});
