import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createContext } from "react";
import * as deckyUi from "@decky/ui";
import {
  findSteamSettingsParts,
  isActiveAccountHook,
  isSteamMemoryRouter,
  isSteamPopupComponent,
  resetSteamSettingsParts,
  type SteamSettingsParts,
} from "./steamSettingsParts";

// Built from source text rather than written in TypeScript, which the test
// transform would reformat: the predicates read minified text, so these carry
// the shape read on the device, and the lookalikes the near misses beside it.
const popupComponent = new Function(
  "e",
  'const[s]=[!0===e.onlyPopoutIfNeeded?"inline":"popout"];return"inline"===s?null:"popout"===s?e:null',
);
const routerWrapper = new Function(
  "e",
  "const{children:t,initialRoute:r,initialEntries:i}=e,n=i||[r];return{initialIndex:n.length-1,initialEntries:n,children:t}",
);
const routerLookalike = new Function("e", "return{initialRoute:e.initialRoute,initialEntries:[],initialIndex:1}");
const accountHook = new Function(
  'const e=(0,n.useContext)(i);if(!e)throw new Error("called useActiveAccount outside of ActiveAccountProvider");return e.useActiveAccount()',
);

/** The module the account hook is exported from, with its provider beside it. */
const AccountContext = createContext<unknown>(undefined);
const accountModule = { LH: accountHook, Rh: AccountContext };

const STEAM_ID = "76561190000000001";

const findAmong =
  (...candidates: unknown[]) =>
  (predicate: (candidate: unknown) => boolean): unknown =>
    candidates.find((candidate) => predicate(candidate));

const findModuleHolding =
  (module: Record<string, unknown>) =>
  (predicate: (candidate: unknown) => boolean): unknown =>
    Object.values(module).some((candidate) => predicate(candidate)) ? module : undefined;

/** Steam's connection manager, whose SteamID answers only when asked as a method of itself. */
function stubSignedInAccount(): void {
  const steamid = {
    id: STEAM_ID,
    ConvertTo64BitString(this: { id: string }) {
      return this.id;
    },
  };
  vi.stubGlobal("cm", { steamid });
}

const everyPartFound = (): void => {
  vi.mocked(deckyUi.findModuleExport).mockImplementation(findAmong(routerLookalike, popupComponent, routerWrapper));
  vi.mocked(deckyUi.findModuleByExport).mockImplementation(findModuleHolding(accountModule));
  stubSignedInAccount();
};

describe("the searches for Steam's settings-window parts", () => {
  it("recognise the popup component by its inline-or-popout choice", () => {
    expect(isSteamPopupComponent(popupComponent)).toBe(true);
    expect(isSteamPopupComponent(new Function("e", "return e.modal"))).toBe(false);
    expect(isSteamPopupComponent({ onlyPopoutIfNeeded: true, popout: "inline" })).toBe(false);
  });

  it("recognise the router wrapper by its history starting at the last entry", () => {
    expect(isSteamMemoryRouter(routerWrapper)).toBe(true);
    expect(isSteamMemoryRouter(routerLookalike)).toBe(false);
    expect(isSteamMemoryRouter("initialRoute initialIndex:n.length-1")).toBe(false);
  });

  it("recognise the account hook by the error it throws outside its provider", () => {
    expect(isActiveAccountHook(accountHook)).toBe(true);
    expect(isActiveAccountHook(new Function("return useActiveAccount()"))).toBe(false);
  });
});

describe("findSteamSettingsParts", () => {
  beforeEach(() => {
    resetSteamSettingsParts();
    vi.mocked(deckyUi.findModuleExport).mockReset();
    vi.mocked(deckyUi.findModuleByExport).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names every part a search did not find", () => {
    expect(findSteamSettingsParts()).toEqual({
      missing: ["account provider", "signed-in account", "popup", "router"],
    });
  });

  it("answers the parts once every search finds one, and does not search again for what it found", () => {
    everyPartFound();
    const first = findSteamSettingsParts();
    expect(first).toMatchObject({
      parts: {
        AccountProvider: AccountContext,
        Popup: popupComponent,
        Router: routerWrapper,
        Sidebar: deckyUi.SidebarNavigation,
      },
    });

    vi.mocked(deckyUi.findModuleExport).mockClear();
    vi.mocked(deckyUi.findModuleByExport).mockClear();
    const { account: _account, ...components } = (first as { parts: SteamSettingsParts }).parts;
    expect(findSteamSettingsParts()).toMatchObject({ parts: components });
    expect(deckyUi.findModuleExport).not.toHaveBeenCalled();
    expect(deckyUi.findModuleByExport).not.toHaveBeenCalled();
  });

  it("provides the signed-in account the way Steam's own roots do, read from Steam's connection manager", () => {
    everyPartFound();
    const found = findSteamSettingsParts() as { parts: SteamSettingsParts };

    expect(found.parts.account.useActiveAccount()).toBe(STEAM_ID);
  });

  it("finds no provider in a module that exports the hook without a context beside it", () => {
    everyPartFound();
    vi.mocked(deckyUi.findModuleByExport).mockImplementation(findModuleHolding({ LH: accountHook, other: {} }));

    expect(findSteamSettingsParts()).toEqual({ missing: ["account provider"] });
  });

  it("opens nothing for an account Steam's connection manager cannot answer", () => {
    everyPartFound();
    vi.stubGlobal("cm", { steamid: {} });

    expect(findSteamSettingsParts()).toEqual({ missing: ["signed-in account"] });
  });

  it("asks again for a part an earlier search missed", () => {
    everyPartFound();
    vi.mocked(deckyUi.findModuleExport).mockImplementation(findAmong(popupComponent));
    expect(findSteamSettingsParts()).toEqual({ missing: ["router"] });

    vi.mocked(deckyUi.findModuleExport).mockImplementation(findAmong(routerWrapper));
    expect(findSteamSettingsParts()).toHaveProperty("parts");
  });
});
