import { describe, it, expect } from "vitest";
import {
  findSteamOverviewPanel,
  findSteamPlaySection,
  findSteamPlayButton,
  isPlayBarElement,
  isTenderElement,
  isRightControlsElement,
  findSteamPlayBarBadges,
  findSteamRightControls,
  TENDER_PLAY_BUTTON_ID,
  TENDER_SUBSTITUTE_ID,
} from "./elementSelectors";

describe("elementSelectors", () => {
  describe("isTenderElement", () => {
    it("identifies Tender substitute and play button by ID", () => {
      const el1 = document.createElement("div");
      el1.id = TENDER_PLAY_BUTTON_ID;
      expect(isTenderElement(el1)).toBe(true);

      const el2 = document.createElement("div");
      el2.id = TENDER_SUBSTITUTE_ID;
      expect(isTenderElement(el2)).toBe(true);
    });

    it("identifies descendants of Tender containers", () => {
      const parent = document.createElement("div");
      parent.id = TENDER_SUBSTITUTE_ID;
      const child = document.createElement("span");
      parent.appendChild(child);
      document.body.appendChild(parent);

      expect(isTenderElement(child)).toBe(true);
      parent.remove();
    });

    it("identifies elements with tender- class names", () => {
      const el = document.createElement("div");
      el.className = "tender-desktop-card";
      expect(isTenderElement(el)).toBe(true);
    });

    it("returns false for non-Tender elements", () => {
      const el = document.createElement("div");
      el.className = "AppDetailsOverviewPanel";
      expect(isTenderElement(el)).toBe(false);
    });
  });

  describe("isPlayBarElement with Fiber and classes", () => {
    it("recognizes element via fiber component name", () => {
      const el = document.createElement("div");
      (el as unknown as Record<string, unknown>)["__reactFiber$test"] = {
        type: { displayName: "PlayBar" },
      };
      expect(isPlayBarElement(el)).toBe(true);
    });

    it("recognizes element via substring class name", () => {
      const el = document.createElement("div");
      el.className = "header_InPage_2xK9";
      expect(isPlayBarElement(el)).toBe(true);
    });

    it("returns false for unrelated elements", () => {
      const el = document.createElement("div");
      el.className = "RightColumn";
      expect(isPlayBarElement(el)).toBe(false);
    });
  });

  describe("findSteamOverviewPanel", () => {
    it("finds panel via Fiber component name when classes are unhashed", () => {
      const doc = document.implementation.createHTMLDocument();
      const panel = doc.createElement("div");
      panel.className = "CustomPanelWrapper";
      (panel as unknown as Record<string, unknown>)["__reactFiber$123"] = {
        type: { displayName: "AppDetailsOverviewPanel" },
      };
      doc.body.appendChild(panel);

      expect(findSteamOverviewPanel(doc)).toBe(panel);
    });

    it("ignores Tender substitute container", () => {
      const doc = document.implementation.createHTMLDocument();
      const sub = doc.createElement("div");
      sub.id = TENDER_SUBSTITUTE_ID;
      sub.className = "AppDetailsOverviewPanel";
      doc.body.appendChild(sub);

      expect(findSteamOverviewPanel(doc)).toBeNull();
    });
  });

  describe("findSteamPlayButton", () => {
    it("finds button with Fiber name", () => {
      const root = document.createElement("div");
      const btn = document.createElement("button");
      (btn as unknown as Record<string, unknown>)["__reactFiber$btn"] = {
        type: { displayName: "PlayButton" },
      };
      root.appendChild(btn);

      expect(findSteamPlayButton(root)).toBe(btn);
    });

    it("finds button via ARIA label", () => {
      const root = document.createElement("div");
      const btn = document.createElement("button");
      btn.setAttribute("aria-label", "Play Game");
      root.appendChild(btn);

      expect(findSteamPlayButton(root)).toBe(btn);
    });

    it("finds button via text content PLAY", () => {
      const root = document.createElement("div");
      const btn = document.createElement("button");
      btn.textContent = "PLAY";
      root.appendChild(btn);

      expect(findSteamPlayButton(root)).toBe(btn);
    });
  });

  describe("findSteamPlaySection", () => {
    it("locates play section containing a play button", () => {
      const root = document.createElement("div");
      const section = document.createElement("div");
      section.className = "PlaySection";
      const btn = document.createElement("button");
      btn.setAttribute("aria-label", "Play Game");
      section.appendChild(btn);
      root.appendChild(section);

      expect(findSteamPlaySection(root)).toBe(section);
    });
  });

  describe("isRightControlsElement and findSteamRightControls", () => {
    it("identifies right controls via Fiber component name", () => {
      const el = document.createElement("div");
      (el as unknown as Record<string, unknown>)["__reactFiber$rc"] = {
        type: { displayName: "RightControls" },
      };
      expect(isRightControlsElement(el)).toBe(true);
    });

    it("finds right controls in a play bar", () => {
      const root = document.createElement("div");
      const rc = document.createElement("div");
      rc.className = "RightControls";
      root.appendChild(rc);

      expect(findSteamRightControls(root)).toBe(rc);
    });
  });

  describe("findSteamPlayBarBadges", () => {
    it("identifies GameStat badges while ignoring Tender elements", () => {
      const root = document.createElement("div");
      const stat = document.createElement("div");
      stat.className = "GameStat";
      stat.textContent = "10 hours";
      root.appendChild(stat);

      const badges = findSteamPlayBarBadges(root);
      expect(badges).toContain(stat);
    });
  });
});
