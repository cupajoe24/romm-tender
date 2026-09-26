import { describe, it, expect, vi, beforeEach } from "vitest";
import { DomRestorationLedger } from "./restorationLedger";
import type { Root } from "react-dom/client";

describe("DomRestorationLedger", () => {
  let ledger: DomRestorationLedger;

  beforeEach(() => {
    ledger = new DomRestorationLedger();
  });

  describe("hide and restore", () => {
    it("hides element and restores original display", () => {
      const el = document.createElement("div");
      el.style.display = "flex";
      document.body.appendChild(el);

      ledger.hide(el);
      expect(el.style.display).toBe("none");
      expect(ledger.isElementHidden(el)).toBe(true);

      ledger.restoreAll();
      expect(el.style.display).toBe("flex");
      expect(ledger.isElementHidden(el)).toBe(false);

      el.remove();
    });

    it("handles elements with no initial display style", () => {
      const el = document.createElement("div");
      document.body.appendChild(el);

      ledger.hide(el);
      expect(el.style.display).toBe("none");

      ledger.restoreAll();
      expect(el.style.display).toBe("");

      el.remove();
    });

    it("unhides single element on demand", () => {
      const el = document.createElement("div");
      el.style.display = "block";
      document.body.appendChild(el);

      ledger.hide(el);
      expect(el.style.display).toBe("none");

      ledger.unhide(el);
      expect(el.style.display).toBe("block");
      expect(ledger.isElementHidden(el)).toBe(false);

      el.remove();
    });
  });

  describe("style mutations and restore", () => {
    it("records original styles and restores them accurately", () => {
      const el = document.createElement("div");
      el.style.position = "relative";
      el.style.backgroundColor = "rgb(0, 0, 0)";
      document.body.appendChild(el);

      ledger.style(el, "position", "sticky");
      ledger.style(el, "top", "0px");
      ledger.style(el, "background-color", "rgb(255, 255, 255)");

      expect(el.style.position).toBe("sticky");
      expect(el.style.top).toBe("0px");
      expect(el.style.backgroundColor).toBe("rgb(255, 255, 255)");

      ledger.restoreAll();

      expect(el.style.position).toBe("relative");
      expect(el.style.top).toBe("");
      expect(el.style.backgroundColor).toBe("rgb(0, 0, 0)");

      el.remove();
    });

    it("preserves earliest recorded value across multiple style calls", () => {
      const el = document.createElement("div");
      el.style.zIndex = "5";
      document.body.appendChild(el);

      ledger.style(el, "z-index", "10");
      ledger.style(el, "z-index", "20");
      expect(el.style.zIndex).toBe("20");

      ledger.restoreAll();
      expect(el.style.zIndex).toBe("5");

      el.remove();
    });

    it("setStyles applies batch styles", () => {
      const el = document.createElement("div");
      document.body.appendChild(el);

      ledger.setStyles(el, {
        opacity: "0.5",
        "pointer-events": "none",
      });

      expect(el.style.opacity).toBe("0.5");
      expect(el.style.pointerEvents).toBe("none");

      ledger.restoreAll();

      expect(el.style.opacity).toBe("");
      expect(el.style.pointerEvents).toBe("");

      el.remove();
    });
  });

  describe("React roots lifecycle", () => {
    it("unmounts root and removes host container on restoreAll", () => {
      const host = document.createElement("div");
      document.body.appendChild(host);

      const unmountMock = vi.fn();
      const mockRoot = { unmount: unmountMock } as unknown as Root;

      ledger.recordRoot(mockRoot, host);
      expect(host.isConnected).toBe(true);

      ledger.restoreAll();

      expect(unmountMock).toHaveBeenCalled();
      expect(host.isConnected).toBe(false);
    });

    it("handles root unmount errors gracefully", () => {
      const host = document.createElement("div");
      document.body.appendChild(host);

      const mockRoot = {
        unmount: vi.fn(() => {
          throw new Error("Unmount error");
        }),
      } as unknown as Root;

      ledger.recordRoot(mockRoot, host);
      expect(() => ledger.restoreAll()).not.toThrow();
      expect(host.isConnected).toBe(false);
    });
  });

  describe("event listeners lifecycle", () => {
    it("attaches listener and removes it on restoreAll", () => {
      const target = document.createElement("div");
      const listener = vi.fn();

      ledger.addListener(target, "scroll", listener);
      target.dispatchEvent(new Event("scroll"));
      expect(listener).toHaveBeenCalledTimes(1);

      ledger.restoreAll();
      target.dispatchEvent(new Event("scroll"));
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("allows removing listener explicitly", () => {
      const target = document.createElement("div");
      const listener = vi.fn();

      ledger.addListener(target, "scroll", listener);
      ledger.removeListener(target, "scroll", listener);

      target.dispatchEvent(new Event("scroll"));
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
