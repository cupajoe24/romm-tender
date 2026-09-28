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

    it("skips non-scrollable overflow:visible elements even if scrollHeight exceeds clientHeight", () => {
      const scroller = document.createElement("div");
      scroller.style.overflowY = "scroll";

      const wrapper = document.createElement("div");
      wrapper.style.overflowY = "visible";
      Object.defineProperty(wrapper, "scrollHeight", { value: 1000, configurable: true });
      Object.defineProperty(wrapper, "clientHeight", { value: 300, configurable: true });

      const inner = document.createElement("div");
      wrapper.appendChild(inner);
      scroller.appendChild(wrapper);
      document.body.appendChild(scroller);

      expect(findScrollContainer(inner)).toBe(scroller);
      scroller.remove();
    });

    it("falls back to window if no scrollable container", () => {
      const el = document.createElement("div");
      document.body.appendChild(el);

      expect(findScrollContainer(el) === el.ownerDocument.defaultView).toBe(true);
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

    it("resets playSection background to transparent on dispose if disposed while pinned", () => {
      const scroller = document.createElement("div");
      scroller.style.overflowY = "scroll";
      document.body.appendChild(scroller);

      const playBar = document.createElement("div");
      const playSection = document.createElement("div");
      scroller.appendChild(playBar);
      scroller.appendChild(playSection);

      scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
      playBar.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;

      const controller = createStickyPlayBarController(playBar, playSection, ledger);
      expect(playSection.style.backgroundColor).toBe(SOLID_PLAY_BAR_BG);

      controller.dispose();
      expect(playSection.style.backgroundColor).toBe("transparent");

      ledger.restoreAll();
      scroller.remove();
    });

    it("observes playBar via ResizeObserver and updates pinning when layout changes", () => {
      let roCallback: (() => void) | null = null;
      class MockResizeObserver {
        constructor(cb: () => void) {
          roCallback = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {
          roCallback = null;
        }
      }
      const origRO = window.ResizeObserver;
      window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

      const scroller = document.createElement("div");
      scroller.style.overflowY = "scroll";
      document.body.appendChild(scroller);

      const playBar = document.createElement("div");
      scroller.appendChild(playBar);

      scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
      playBar.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;

      const controller = createStickyPlayBarController(playBar, playBar, ledger);
      expect(playBar.style.backgroundColor).toBe(SOLID_PLAY_BAR_BG);

      // Layout changes (hero expands) so playBar moves down
      playBar.getBoundingClientRect = () => ({ top: 300 }) as DOMRect;
      if (typeof roCallback === "function") {
        (roCallback as () => void)();
      }

      expect(playBar.style.backgroundColor).toBe(GLASS_PLAY_BAR_BG);
      expect(playBar.style.boxShadow).toBe("none");

      controller.dispose();
      ledger.restoreAll();
      scroller.remove();
      window.ResizeObserver = origRO;
    });

    it("maintains hero wrapper overflow visible so parallax and refraction persist when unpinned and pinned", () => {
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
      hero.style.overflow = "hidden"; // Simulate any pre-existing or native hidden overflow
      panel.appendChild(hero);

      const content = document.createElement("div");
      panel.appendChild(content);

      const playBar = document.createElement("div");
      content.appendChild(playBar);

      // Start unpinned: playBar top is below scroller top
      scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
      playBar.getBoundingClientRect = () => ({ top: 150 }) as DOMRect;

      const controller = createStickyPlayBarController(playBar, playBar, ledger, content, panel);

      expect(hero.style.overflow).toBe("visible");

      // Scroll so playBar pins to the top; hero continues scrolling in background for remaining cards
      playBar.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
      controller.updatePinning();

      expect(hero.style.overflow).toBe("visible");

      // Scroll back up so playBar unpins
      playBar.getBoundingClientRect = () => ({ top: 150 }) as DOMRect;
      controller.updatePinning();

      expect(hero.style.overflow).toBe("visible");

      controller.dispose();
      ledger.restoreAll();
      expect(hero.style.overflow).toBe("hidden"); // Restored to pre-existing style
      scroller.remove();
    });

    it("re-applies baseline styles on updatePinning even if styles were wiped externally", () => {
      const scroller = document.createElement("div");
      scroller.style.overflowY = "scroll";
      document.body.appendChild(scroller);

      const playBar = document.createElement("div");
      scroller.appendChild(playBar);

      const controller = createStickyPlayBarController(playBar, playBar, ledger);
      expect(playBar.style.zIndex).toBe("10");
      expect(playBar.style.position).toBe("sticky");

      // Simulate external VDOM re-render wiping inline styles
      playBar.style.zIndex = "";
      playBar.style.position = "";

      controller.updatePinning();

      expect(playBar.style.zIndex).toBe("10");
      expect(playBar.style.position).toBe("sticky");

      controller.dispose();
      ledger.restoreAll();
      scroller.remove();
    });

    it("matches correctly identifies managed elements", () => {
      const playBar = document.createElement("div");
      const otherBar = document.createElement("div");
      document.body.appendChild(playBar);
      document.body.appendChild(otherBar);

      const controller = createStickyPlayBarController(playBar, playBar, ledger);

      expect(controller.matches(playBar, playBar)).toBe(true);
      expect(controller.matches(otherBar, playBar)).toBe(false);
      expect(controller.matches(playBar, otherBar)).toBe(false);

      playBar.remove();
      expect(controller.matches(playBar, playBar)).toBe(false);

      controller.dispose();
      ledger.restoreAll();
      otherBar.remove();
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
