import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  findScrollContainer,
  isPlayBarPinned,
  findInflatedHeroWrapper,
  createStickyPlayBarController,
} from "./stickyPlayBarController";
import { DomRestorationLedger } from "./restorationLedger";
import { GLASS_PLAY_BAR_BG, PINNED_PLAY_BAR_SHADOW, SOLID_PLAY_BAR_BG } from "../gameview/styles";

describe("stickyPlayBarController", () => {
  let ledger: DomRestorationLedger;

  beforeEach(() => {
    ledger = new DomRestorationLedger();
  });

  afterEach(() => {
    ledger.restoreAll();
  });

  describe("findScrollContainer", () => {
    it("returns element with overflowY auto or scroll", () => {
      const outer = document.createElement("div");
      outer.style.overflowY = "auto";

      const inner = document.createElement("div");
      outer.appendChild(inner);
      document.body.appendChild(outer);

      expect(findScrollContainer(inner)).toBe(outer);
      outer.remove();
    });

    it("falls back to window if no scrollable container", () => {
      const el = document.createElement("div");
      document.body.appendChild(el);

      expect(findScrollContainer(el)).toBe(window);
      el.remove();
    });
  });

  describe("isPlayBarPinned", () => {
    it("returns true when top <= scrollerTop + 2", () => {
      const scroller = document.createElement("div");
      const playBar = document.createElement("div");

      scroller.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
      playBar.getBoundingClientRect = () => ({ top: 101 }) as DOMRect;

      expect(isPlayBarPinned(playBar, scroller)).toBe(true);
    });

    it("returns false when top > scrollerTop + 2", () => {
      const scroller = document.createElement("div");
      const playBar = document.createElement("div");

      scroller.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
      playBar.getBoundingClientRect = () => ({ top: 150 }) as DOMRect;

      expect(isPlayBarPinned(playBar, scroller)).toBe(false);
    });

    it("handles window as scroller", () => {
      const playBar = document.createElement("div");
      vi.spyOn(playBar, "getBoundingClientRect").mockReturnValue({
        top: 0,
        bottom: 50,
        left: 0,
        right: 100,
        width: 100,
        height: 50,
      } as DOMRect);

      expect(isPlayBarPinned(playBar, window)).toBe(true);
    });
  });

  describe("createStickyPlayBarController", () => {
    it("applies glass styles when unpinned and solid styles when pinned", () => {
      const scroller = document.createElement("div");
      scroller.style.overflowY = "scroll";
      document.body.appendChild(scroller);

      const playBar = document.createElement("div");
      scroller.appendChild(playBar);

      // Unpinned
      scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
      playBar.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;

      const controller = createStickyPlayBarController(playBar, playBar, ledger);

      expect(playBar.style.backgroundColor).toBe(GLASS_PLAY_BAR_BG);
      expect(playBar.style.boxShadow).toBe("none");

      // Pin
      playBar.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
      controller.updatePinning();

      expect(playBar.style.backgroundColor).toBe(SOLID_PLAY_BAR_BG);
      expect(playBar.style.boxShadow).toBe(PINNED_PLAY_BAR_SHADOW);

      controller.dispose();
      ledger.restoreAll();
      scroller.remove();
    });

    it("clips inflated hero wrapper when updatePinning is executed with container and steamPanel", () => {
      const scroller = document.createElement("div");
      scroller.style.overflowY = "scroll";
      document.body.appendChild(scroller);

      const panel = document.createElement("div");
      scroller.appendChild(panel);

      const hero = document.createElement("div");
      hero.className = "HeroBanner";
      const canvas = document.createElement("canvas");
      hero.appendChild(canvas);
      Object.defineProperty(hero, "scrollHeight", { value: 1200, configurable: true });
      Object.defineProperty(hero, "offsetHeight", { value: 300, configurable: true });
      panel.appendChild(hero);

      const content = document.createElement("div");
      panel.appendChild(content);

      const playBar = document.createElement("div");
      content.appendChild(playBar);

      const controller = createStickyPlayBarController(playBar, playBar, ledger, content, panel);

      expect(hero.style.overflow).toBe("hidden");

      controller.dispose();
      ledger.restoreAll();
      expect(hero.style.overflow).toBe("");
      scroller.remove();
    });
  });

  describe("findInflatedHeroWrapper", () => {
    it("identifies hero sibling when canvas child causes scrollHeight > offsetHeight", () => {
      const scroller = document.createElement("div");
      const parent = document.createElement("div");
      scroller.appendChild(parent);

      const hero = document.createElement("div");
      const canvas = document.createElement("canvas");
      hero.appendChild(canvas);
      Object.defineProperty(hero, "scrollHeight", { value: 400, configurable: true });
      Object.defineProperty(hero, "offsetHeight", { value: 300, configurable: true });
      parent.appendChild(hero);

      const content = document.createElement("div");
      const playBar = document.createElement("div");
      content.appendChild(playBar);
      parent.appendChild(content);

      document.body.appendChild(scroller);
      try {
        const found = findInflatedHeroWrapper(content, playBar, scroller);
        expect(found).toBe(hero);
      } finally {
        scroller.remove();
      }
    });

    it("skips siblings that contain the play bar", () => {
      const scroller = document.createElement("div");
      const wrapper = document.createElement("div");
      scroller.appendChild(wrapper);

      const playBar = document.createElement("div");
      playBar.className = "PlayBar";
      wrapper.appendChild(playBar);
      Object.defineProperty(wrapper, "scrollHeight", { value: 2000, configurable: true });
      Object.defineProperty(wrapper, "offsetHeight", { value: 300, configurable: true });

      const container = document.createElement("div");
      wrapper.appendChild(container);

      document.body.appendChild(scroller);
      try {
        const result = findInflatedHeroWrapper(container, playBar, scroller);
        expect(result).toBeNull();
      } finally {
        scroller.remove();
      }
    });

    it("ignores element when scrollHeight <= offsetHeight", () => {
      const scroller = document.createElement("div");
      const panel = document.createElement("div");
      scroller.appendChild(panel);

      const hero = document.createElement("div");
      hero.className = "HeroWrapper";
      Object.defineProperty(hero, "scrollHeight", { value: 300, configurable: true });
      Object.defineProperty(hero, "offsetHeight", { value: 300, configurable: true });
      panel.appendChild(hero);

      const content = document.createElement("div");
      const playBar = document.createElement("div");
      content.appendChild(playBar);
      panel.appendChild(content);

      document.body.appendChild(scroller);
      try {
        const result = findInflatedHeroWrapper(content, playBar, scroller);
        expect(result).toBeNull();
      } finally {
        scroller.remove();
      }
    });

    it("returns null when no matching sibling exists", () => {
      const scroller = document.createElement("div");
      const panel = document.createElement("div");
      scroller.appendChild(panel);

      const content = document.createElement("div");
      const playBar = document.createElement("div");
      content.appendChild(playBar);
      panel.appendChild(content);

      document.body.appendChild(scroller);
      try {
        const result = findInflatedHeroWrapper(content, playBar, scroller);
        expect(result).toBeNull();
      } finally {
        scroller.remove();
      }
    });

    it("handles window as scroller", () => {
      const panel = document.createElement("div");
      const hero = document.createElement("div");
      hero.className = "HeroWrapper";
      Object.defineProperty(hero, "scrollHeight", { value: 1200, configurable: true });
      Object.defineProperty(hero, "offsetHeight", { value: 300, configurable: true });
      panel.appendChild(hero);

      const content = document.createElement("div");
      const playBar = document.createElement("div");
      content.appendChild(playBar);
      panel.appendChild(content);

      document.body.appendChild(panel);
      try {
        const result = findInflatedHeroWrapper(content, playBar, window);
        expect(result).toBe(hero);
      } finally {
        panel.remove();
      }
    });
  });
});
