import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createContext, useContext, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { fireEvent, screen } from "@testing-library/react";
import * as backend from "../../api/backend";
import type { SettingsTab } from "../../types/navigation";
import * as desktopWindow from "../desktopWindow";
import * as steamParts from "./steamSettingsParts";
import type {
  ActiveAccount,
  ActiveAccountProviderProps,
  SteamMemoryRouterProps,
  SteamPopupProps,
  SteamSidebarProps,
} from "./steamSettingsParts";
import { SETTINGS_MENU_ENTRY_ATTR } from "./settingsMenuEntry";
import {
  forgetTenderSettings,
  openTenderSettings,
  shownSettingsTab,
  startTenderSettings,
  stopTenderSettings,
} from "./settingsWindow";
import { settingsTabRoute } from "./tabs";

vi.mock("../../api/backend", async (importActual) => ({
  ...(await importActual<typeof import("../../api/backend")>()),
  debugLog: vi.fn(() => Promise.resolve()),
}));

vi.mock("../desktopWindow", () => ({
  findDesktopWindow: vi.fn(),
  findReactClient: vi.fn(),
}));

vi.mock("./steamSettingsParts", () => ({ findSteamSettingsParts: vi.fn() }));

/** The window Steam's popup component would create, reduced to what Tender reads of it. */
const makePopupWindow = () =>
  Object.assign(new EventTarget(), { SteamClient: { Window: { BringToFront: vi.fn() } } }) as unknown as Window & {
    SteamClient: { Window: { BringToFront: ReturnType<typeof vi.fn> } };
  };

let popupWindow = makePopupWindow();
const popupRendered = vi.fn<(props: SteamPopupProps) => void>();
const sidebarRendered = vi.fn<(props: SteamSidebarProps) => void>();
const navigated = vi.fn<(page: string) => void>();
const lastPopup = (): SteamPopupProps | undefined => popupRendered.mock.lastCall?.[0];
const lastSidebar = (): SteamSidebarProps | undefined => sidebarRendered.mock.lastCall?.[0];
const navigations = (): string[] => navigated.mock.calls.map(([page]) => page);

const STEAM_ID = "76561190000000001";
const AccountContext = createContext<ActiveAccount | undefined>(undefined);
const account: ActiveAccount = { useActiveAccount: () => STEAM_ID };
const accountSeenByPopup = vi.fn<(account: string) => void>();

// Steam's popup asks the account provider above it for the account, and throws
// without one; it portals its content into the window it creates, and here the
// test's own body is that window's.
function Popup(props: SteamPopupProps) {
  popupRendered(props);
  const provided = useContext(AccountContext);
  if (!provided) throw new Error("called useActiveAccount outside of ActiveAccountProvider");
  accountSeenByPopup(provided.useActiveAccount());
  const { refPopup } = props;
  useEffect(() => {
    refPopup?.(popupWindow);
    return () => refPopup?.(undefined);
  }, [refPopup]);
  return createPortal(
    <div data-testid="popup" data-title={props.strTitle}>
      <button type="button" onClick={props.onDismiss}>
        Close
      </button>
      {props.children}
    </div>,
    document.body,
  );
}

function Router({ initialRoute, children }: SteamMemoryRouterProps) {
  return (
    <div data-testid="router" data-route={initialRoute}>
      {children as ReactNode}
    </div>
  );
}

// Steam's sidebar hands out a navigate function and reports every move through
// `onPageRequested`, as the one read on the device does.
function Sidebar(props: SteamSidebarProps) {
  sidebarRendered(props);
  const { fnSetNavigateToPage, onPageRequested } = props;
  useEffect(() => {
    fnSetNavigateToPage?.((page) => {
      navigated(page);
      onPageRequested?.(page);
    });
  }, [fnSetNavigateToPage, onPageRequested]);
  return <nav data-testid="sidebar" />;
}

const AccountProvider = ({ value, children }: ActiveAccountProviderProps) => (
  <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
);

const parts = { AccountProvider, account, Popup, Router, Sidebar } as unknown as steamParts.SteamSettingsParts;

const debugLines = (): string[] => vi.mocked(backend.debugLog).mock.calls.map((c) => String(c[0]));
const popups = (): HTMLElement[] => screen.queryAllByTestId("popup");
const flushMicrotasks = (): Promise<void> => act(async () => {});
/** The window decides on an Escape once the key's whole dispatch is over. */
const afterTheKey = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

let libraryWindow: Window;
let popupCreated: (() => void)[];

beforeEach(() => {
  popupWindow = makePopupWindow();
  popupRendered.mockClear();
  accountSeenByPopup.mockClear();
  sidebarRendered.mockClear();
  navigated.mockClear();
  popupCreated = [];
  libraryWindow = { closed: false } as Window;
  vi.mocked(backend.debugLog).mockClear();
  vi.mocked(steamParts.findSteamSettingsParts).mockReturnValue({ parts });
  vi.mocked(desktopWindow.findReactClient).mockReturnValue({ createRoot });
  vi.mocked(desktopWindow.findDesktopWindow).mockImplementation(() => libraryWindow);
  vi.stubGlobal("g_PopupManager", {
    GetPopups: () => [],
    AddPopupCreatedCallback: (cb: () => void) => popupCreated.push(cb),
    AddPopupDestroyedCallback: () => undefined,
  });
});

afterEach(() => {
  act(() => stopTenderSettings());
  forgetTenderSettings();
  vi.unstubAllGlobals();
});

/** Steam reports a popup created or destroyed, which is when the supervisor looks again. */
const steamReportsAPopup = (): void => act(() => popupCreated.forEach((cb) => cb()));

const open = (tab?: SettingsTab): boolean => {
  let opened = false;
  act(() => {
    opened = openTenderSettings(tab);
  });
  return opened;
};

describe("openTenderSettings", () => {
  it("opens Steam's popup titled Tender Settings at Steam's settings size, with a router of its own", () => {
    expect(open()).toBe(true);

    expect(popups()).toHaveLength(1);
    expect(lastPopup()).toMatchObject({
      strTitle: "Tender Settings",
      popupWidth: 850,
      popupHeight: 722,
      minWidth: 850,
      minHeight: 722,
      resizable: true,
      modal: false,
      saveDimensionsKey: "TenderSettings",
    });
    expect(screen.getByTestId("router")).toHaveAttribute("data-route", settingsTabRoute("sync"));
    expect(screen.getByTestId("router")).toContainElement(screen.getByTestId("sidebar"));
    expect(lastSidebar()).toMatchObject({ title: "Tender Settings", disableRouteReporting: true });
    expect(lastSidebar()?.pages).toHaveLength(12);
    expect(shownSettingsTab()).toBe("sync");
  });

  it("renders the popup under Steam's account provider, carrying the signed-in account", () => {
    open();

    expect(accountSeenByPopup).toHaveBeenCalledWith(STEAM_ID);
  });

  it("opens on the tab it is asked for", () => {
    open("updates");

    expect(screen.getByTestId("router")).toHaveAttribute("data-route", settingsTabRoute("updates"));
    expect(shownSettingsTab()).toBe("updates");
  });

  it("brings an open window to the front and moves it to the tab asked for, rather than opening another", () => {
    open();
    expect(open("connections")).toBe(true);

    expect(popups()).toHaveLength(1);
    expect(popupWindow.SteamClient.Window.BringToFront).toHaveBeenCalledTimes(1);
    expect(navigations()).toEqual([settingsTabRoute("connections")]);
    expect(shownSettingsTab()).toBe("connections");
  });

  it("only brings the window to the front when asked for no tab, or the tab it is on", () => {
    open("advanced");
    open();
    open("advanced");

    expect(popupWindow.SteamClient.Window.BringToFront).toHaveBeenCalledTimes(2);
    expect(navigations()).toEqual([]);
  });

  it("follows the tab the reader moves to", () => {
    open();
    act(() => lastSidebar()?.onPageRequested?.(settingsTabRoute("downloads")));
    act(() => lastSidebar()?.onPageRequested?.("/not/a/tab"));

    expect(shownSettingsTab()).toBe("downloads");
  });

  it("closes when the reader closes it", async () => {
    open();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    await flushMicrotasks();

    expect(popups()).toHaveLength(0);
    expect(shownSettingsTab()).toBeNull();
  });

  it("closes on Escape in its own window, unless something there took the key", async () => {
    open();
    act(() => {
      const taken = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
      taken.preventDefault();
      popupWindow.dispatchEvent(taken);
      popupWindow.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    await afterTheKey();
    expect(popups()).toHaveLength(1);

    act(() => {
      popupWindow.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    await afterTheKey();
    expect(popups()).toHaveLength(0);
  });

  it("leaves an Escape to a dialog in it that claims the key after the window heard it", async () => {
    // The window's listener is registered first, so a dialog's runs after it in
    // the same dispatch — as the desktop dialog frame's does.
    open();
    popupWindow.addEventListener("keydown", (event) => event.preventDefault());
    act(() => {
      popupWindow.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    });
    await afterTheKey();

    expect(popups()).toHaveLength(1);
  });

  it("stops listening to a window it has closed", async () => {
    const remove = vi.spyOn(popupWindow, "removeEventListener");
    open();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    await flushMicrotasks();

    expect(remove.mock.calls.map(([type]) => type)).toContain("keydown");
  });

  it("opens nothing, and says which of Steam's parts it could not find, when a search missed", () => {
    vi.mocked(steamParts.findSteamSettingsParts).mockReturnValue({ missing: ["popup", "router"] });
    vi.mocked(desktopWindow.findReactClient).mockReturnValue(undefined);

    expect(open()).toBe(false);
    expect(popups()).toHaveLength(0);
    expect(shownSettingsTab()).toBeNull();
    expect(debugLines()).toContain("Tender Settings: cannot open, Steam's popup, router, createRoot not found");
  });

  it("opens nothing, and says so, when React's createRoot cannot be found", () => {
    vi.mocked(desktopWindow.findReactClient).mockReturnValue(undefined);

    expect(open()).toBe(false);
    expect(debugLines()).toContain("Tender Settings: cannot open, Steam's createRoot not found");
  });

  it("opens nothing, and says so, when the root cannot be created", () => {
    vi.mocked(desktopWindow.findReactClient).mockReturnValue({
      createRoot: () => {
        throw new Error("boom");
      },
    });

    expect(open()).toBe(false);
    expect(shownSettingsTab()).toBeNull();
    expect(debugLines()).toContain("Tender Settings: could not draw the window: Error: boom");
  });
});

describe("startTenderSettings", () => {
  it("closes the window with the library window and reopens it on its tab once a new one is there", () => {
    act(() => startTenderSettings());
    open("save-sync");

    libraryWindow = undefined as unknown as Window;
    steamReportsAPopup();
    expect(popups()).toHaveLength(0);
    expect(shownSettingsTab()).toBeNull();

    libraryWindow = { closed: false } as Window;
    steamReportsAPopup();
    expect(popups()).toHaveLength(1);
    expect(shownSettingsTab()).toBe("save-sync");
  });

  it("treats a closed library window as none", () => {
    act(() => startTenderSettings());
    open();

    libraryWindow = { closed: true } as Window;
    steamReportsAPopup();

    expect(popups()).toHaveLength(0);
  });

  it("does not reopen a window the reader closed", async () => {
    act(() => startTenderSettings());
    open();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    await flushMicrotasks();

    libraryWindow = { closed: false } as Window;
    steamReportsAPopup();

    expect(popups()).toHaveLength(0);
  });

  it("closes the window when the surface stops, and reopens it on its tab when it starts again", () => {
    act(() => startTenderSettings());
    open("controller");

    act(() => stopTenderSettings());
    expect(popups()).toHaveLength(0);

    act(() => startTenderSettings());
    expect(popups()).toHaveLength(1);
    expect(shownSettingsTab()).toBe("controller");
  });

  it("does nothing on a callback Steam makes after the surface stopped", () => {
    act(() => startTenderSettings());
    open();
    act(() => stopTenderSettings());
    forgetTenderSettings();

    steamReportsAPopup();

    expect(popups()).toHaveLength(0);
  });

  it("puts the entry in Steam's menu, and the entry opens the window", () => {
    const settingsItem = document.createElement("div");
    settingsItem.className = "contextMenuItem";
    (settingsItem as unknown as Record<string, unknown>)["__reactFiber$test"] = {
      memoizedProps: { steamURL: "steam://settings" },
      return: null,
    };
    document.body.appendChild(settingsItem);
    vi.stubGlobal("g_PopupManager", {
      GetPopups: () => [{ m_popup: window }],
      AddPopupCreatedCallback: () => undefined,
      AddPopupDestroyedCallback: () => undefined,
    });

    act(() => startTenderSettings());
    const entry = document.querySelector<HTMLElement>(`[${SETTINGS_MENU_ENTRY_ATTR}]`);
    expect(settingsItem.nextElementSibling).toBe(entry);

    act(() => entry?.click());
    expect(popups()).toHaveLength(1);

    act(() => stopTenderSettings());
    expect(document.querySelector(`[${SETTINGS_MENU_ENTRY_ATTR}]`)).toBeNull();
    settingsItem.remove();
  });
});
