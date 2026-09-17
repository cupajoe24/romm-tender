import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findDesktopWindow, findReactClient, coverCandidates, heroCandidates } from "./desktopWindow";
import * as deckyUi from "@decky/ui";

describe("desktopWindow", () => {
  const originalPopupManager = (window as unknown as { g_PopupManager?: unknown }).g_PopupManager;
  const originalAppStore = (window as unknown as { appStore?: unknown }).appStore;

  beforeEach(() => {
    delete (window as unknown as { g_PopupManager?: unknown }).g_PopupManager;
    delete (window as unknown as { appStore?: unknown }).appStore;
  });

  afterEach(() => {
    (window as unknown as { g_PopupManager?: unknown }).g_PopupManager = originalPopupManager;
    (window as unknown as { appStore?: unknown }).appStore = originalAppStore;
    vi.restoreAllMocks();
  });

  describe("findDesktopWindow", () => {
    it("returns undefined when g_PopupManager is missing", () => {
      expect(findDesktopWindow()).toBeUndefined();
    });

    it("returns undefined when GetPopups is empty or has no SP Desktop popup", () => {
      (window as unknown as { g_PopupManager?: unknown }).g_PopupManager = {
        GetPopups: () => [{ m_strName: "QuickAccess-NA", m_popup: {} as Window }],
      };
      expect(findDesktopWindow()).toBeUndefined();
    });

    it("returns the desktop window when an SP Desktop popup is present", () => {
      const mockWin = { document: {} } as Window;
      (window as unknown as { g_PopupManager?: unknown }).g_PopupManager = {
        GetPopups: () => [
          { m_strName: "Notification", m_popup: {} as Window },
          { m_strName: "SP Desktop - Library", m_popup: mockWin },
        ],
      };
      expect(findDesktopWindow()).toBe(mockWin);
    });
  });

  describe("findReactClient", () => {
    it("resolves the client module carrying createRoot", () => {
      const mockClient = { createRoot: vi.fn() };
      vi.spyOn(deckyUi, "findModule").mockImplementation((fn: (m: unknown) => boolean) => {
        return fn(mockClient) ? mockClient : undefined;
      });

      const client = findReactClient();
      expect(client).toBeDefined();
      expect(client?.createRoot).toBe(mockClient.createRoot);
    });

    it("returns undefined when no module exports createRoot", () => {
      vi.spyOn(deckyUi, "findModule").mockReturnValue(undefined);
      expect(findReactClient()).toBeUndefined();
    });
  });

  describe("coverCandidates", () => {
    it("returns empty array when appStore is absent", () => {
      expect(coverCandidates(1234)).toEqual([]);
    });

    it("returns empty array when app overview is absent", () => {
      (window as unknown as { appStore?: unknown }).appStore = {
        GetAppOverviewByAppID: vi.fn().mockReturnValue(undefined),
        GetCustomVerticalCapsuleURLs: vi.fn(),
      };
      expect(coverCandidates(1234)).toEqual([]);
    });

    it("returns empty array when GetCustomVerticalCapsuleURLs returns non-array", () => {
      (window as unknown as { appStore?: unknown }).appStore = {
        GetAppOverviewByAppID: vi.fn().mockReturnValue({ appid: 1234 }),
        GetCustomVerticalCapsuleURLs: vi.fn().mockReturnValue(undefined),
      };
      expect(coverCandidates(1234)).toEqual([]);
    });

    it("formats candidate URLs with steamloopback.host", () => {
      (window as unknown as { appStore?: unknown }).appStore = {
        GetAppOverviewByAppID: vi.fn().mockReturnValue({ appid: 1234 }),
        GetCustomVerticalCapsuleURLs: vi.fn().mockReturnValue(["/capsules/1234.jpg", "/capsules/1234.png"]),
      };
      expect(coverCandidates(1234)).toEqual([
        "https://steamloopback.host/capsules/1234.jpg",
        "https://steamloopback.host/capsules/1234.png",
      ]);
    });
  });

  describe("heroCandidates", () => {
    it("returns empty array when appStore is absent", () => {
      expect(heroCandidates(1234)).toEqual([]);
    });

    it("returns empty array when app overview is absent", () => {
      (window as unknown as { appStore?: unknown }).appStore = {
        GetAppOverviewByAppID: vi.fn().mockReturnValue(undefined),
        GetCustomHeroImageURLs: vi.fn(),
      };
      expect(heroCandidates(1234)).toEqual([]);
    });

    it("returns empty array when GetCustomHeroImageURLs returns non-array", () => {
      (window as unknown as { appStore?: unknown }).appStore = {
        GetAppOverviewByAppID: vi.fn().mockReturnValue({ appid: 1234 }),
        GetCustomHeroImageURLs: vi.fn().mockReturnValue(undefined),
      };
      expect(heroCandidates(1234)).toEqual([]);
    });

    it("formats hero candidate URLs with steamloopback.host", () => {
      (window as unknown as { appStore?: unknown }).appStore = {
        GetAppOverviewByAppID: vi.fn().mockReturnValue({ appid: 1234 }),
        GetCustomHeroImageURLs: vi.fn().mockReturnValue(["/hero/1234.jpg", "/hero/1234.png"]),
      };
      expect(heroCandidates(1234)).toEqual([
        "https://steamloopback.host/hero/1234.jpg",
        "https://steamloopback.host/hero/1234.png",
      ]);
    });
  });
});
