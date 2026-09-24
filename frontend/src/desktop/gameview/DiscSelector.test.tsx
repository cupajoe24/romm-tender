import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor, act, fireEvent, within } from "@testing-library/react";
import { DiscSelector } from "./DiscSelector";
import { toaster } from "../../api/host";
import * as backend from "../../api/backend";
import type { CachedGameDetail, DiscSelection, VersionList } from "../../api/backend";
import { emitHostEvent } from "../../test-utils/host-event-bus";
import type { DownloadCompleteEvent } from "../../types";

vi.mock("../../utils/cachedGameDetailStore", () => ({
  getCachedGameDetail: vi.fn<(appId: number) => Promise<CachedGameDetail>>(),
  invalidateCachedGameDetail: vi.fn(),
}));

vi.mock("../../utils/steamShortcuts", () => ({
  setLaunchOptionsConfirmed: vi.fn<(appId: number, value: string) => Promise<boolean>>().mockResolvedValue(true),
}));

vi.mock("../../utils/versionSwitchApplication", () => ({
  applyCommittedVersionSwitch: vi.fn().mockResolvedValue(true),
}));

import { getCachedGameDetail } from "../../utils/cachedGameDetailStore";
import { setLaunchOptionsConfirmed } from "../../utils/steamShortcuts";
import { applyCommittedVersionSwitch } from "../../utils/versionSwitchApplication";

function mockCachedDetail(overrides: Partial<CachedGameDetail> = {}): void {
  vi.mocked(getCachedGameDetail).mockResolvedValue({
    found: true,
    rom_id: 42,
    rom_name: "Final Fantasy VII",
    installed: true,
    ...overrides,
  });
}

const m3uSelection: DiscSelection = {
  multi_disc: true,
  discs: [
    { filename: "ff7 (Disc 1).cue", label: "Disc 1", index: 1 },
    { filename: "ff7 (Disc 2).cue", label: "Disc 2", index: 2 },
    { filename: "ff7 (Disc 3).cue", label: "Disc 3", index: 3 },
  ],
  selected: null,
  default: { kind: "m3u", label: "All discs (m3u)", filename: "ff7.m3u" },
};

const discDefaultSelection: DiscSelection = {
  multi_disc: true,
  discs: [
    { filename: "game (Disc 1).chd", label: "Disc 1", index: 1 },
    { filename: "game (Disc 2).chd", label: "Disc 2", index: 2 },
  ],
  selected: "game (Disc 2).chd",
  default: { kind: "disc", label: "Disc 1", filename: "game (Disc 1).chd" },
};

function multiVersionList(overrides: Partial<VersionList> = {}): VersionList {
  return {
    multi_version: true,
    bound_vanished: false,
    server_query_failed: false,
    versions: [
      {
        rom_id: 42,
        name: "Final Fantasy VII (USA)",
        label: "USA (v1.1)",
        regions: ["USA"],
        languages: ["En"],
        revision: "1.1",
        tags: [],
        active: true,
        is_default: true,
        installed: true,
        synced: true,
        switchable: true,
        vanished: false,
      },
      {
        rom_id: 43,
        name: "Final Fantasy VII (Japan)",
        label: "Japan",
        regions: ["Japan"],
        languages: ["Ja"],
        revision: "",
        tags: [],
        active: false,
        is_default: false,
        installed: false,
        synced: false,
        switchable: true,
        vanished: false,
      },
    ],
    ...overrides,
  };
}

function vanishedVersionList(): VersionList {
  return {
    multi_version: true,
    bound_vanished: false,
    server_query_failed: false,
    versions: [
      {
        rom_id: 42,
        name: "Final Fantasy VII (USA)",
        label: "USA (v1.1)",
        regions: ["USA"],
        languages: ["En"],
        revision: "1.1",
        tags: [],
        active: true,
        is_default: true,
        installed: true,
        synced: true,
        switchable: true,
        vanished: false,
      },
      {
        rom_id: 44,
        name: "Final Fantasy VII (Europe)",
        label: "Europe",
        regions: ["Europe"],
        languages: ["En"],
        revision: "",
        tags: [],
        active: false,
        is_default: false,
        installed: false,
        synced: true,
        switchable: false,
        vanished: true,
      },
    ],
  };
}

const flushAsync = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

async function renderAndOpen(appId = 100) {
  const r = render(<DiscSelector appId={appId} />);
  await r.findByTestId("disc-btn");
  await act(async () => {
    fireEvent.click(r.getByTestId("disc-btn"));
  });
  return r;
}

describe("Desktop DiscSelector — render gate", () => {
  beforeEach(() => {
    vi.mocked(getCachedGameDetail).mockReset();
    vi.mocked(backend.getDiscSelection).mockReset();
    vi.mocked(backend.getVersionList).mockReset().mockResolvedValue({ multi_version: false, bound_vanished: false });
  });

  it("renders nothing for a single-disc and single-version ROM", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue({ multi_disc: false });

    const { container } = render(<DiscSelector appId={100} />);

    await waitFor(() => {
      expect(vi.mocked(backend.getDiscSelection)).toHaveBeenCalledWith(42);
    });
    expect(container.querySelector('[data-testid="disc-btn"]')).toBeNull();
  });

  it("renders nothing when the ROM is not found in the cache and single-version", async () => {
    vi.mocked(getCachedGameDetail).mockResolvedValue({ found: false });

    const { container } = render(<DiscSelector appId={100} />);

    await flushAsync();
    expect(vi.mocked(backend.getDiscSelection)).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="disc-btn"]')).toBeNull();
  });

  it("renders nothing when the ROM is not installed and single-version", async () => {
    mockCachedDetail({ installed: false });

    const { container } = render(<DiscSelector appId={100} />);

    await flushAsync();
    expect(vi.mocked(backend.getDiscSelection)).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="disc-btn"]')).toBeNull();
  });
});

describe("Desktop DiscSelector — multi-disc rendering", () => {
  beforeEach(() => {
    vi.mocked(getCachedGameDetail).mockReset();
    vi.mocked(backend.getDiscSelection).mockReset();
    vi.mocked(backend.getVersionList).mockReset().mockResolvedValue({ multi_version: false, bound_vanished: false });
  });

  it("shows the stacked-discs face (no number) and lists the m3u default + each disc", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue(m3uSelection);

    const r = await renderAndOpen();

    expect(r.getByTestId("disc-btn").textContent).toBe("");
    const menu = r.getByTestId("disc-menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent.replace("✓", ""))).toEqual(["All discs (m3u)", "Disc 1", "Disc 2", "Disc 3"]);
    expect(within(menu).queryByTestId("disc-version-separator")).toBeNull();
  });

  it("lists disc-only options (no m3u default) and shows the pinned disc number in the face", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue(discDefaultSelection);

    const r = await renderAndOpen();

    expect(r.getByTestId("disc-btn").textContent).toBe("2");
    const menu = r.getByTestId("disc-menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent.replace("✓", ""))).toEqual(["Disc 1", "Disc 2"]);
    expect(within(menu).queryByText("All discs (m3u)")).toBeNull();
  });

  it("closes the menu on outside click", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue(m3uSelection);

    const r = await renderAndOpen();
    expect(r.getByTestId("disc-menu")).toBeInTheDocument();

    await act(async () => {
      fireEvent.mouseDown(document.body);
    });

    expect(r.queryByTestId("disc-menu")).toBeNull();
  });
});

describe("Desktop DiscSelector — selecting a disc", () => {
  beforeEach(() => {
    vi.mocked(getCachedGameDetail).mockReset();
    vi.mocked(backend.getDiscSelection).mockReset();
    vi.mocked(backend.getVersionList).mockReset().mockResolvedValue({ multi_version: false, bound_vanished: false });
    vi.mocked(backend.selectDisc).mockReset();
    vi.mocked(setLaunchOptionsConfirmed).mockClear();
    vi.mocked(setLaunchOptionsConfirmed).mockResolvedValue(true);
    vi.mocked(toaster.toast).mockReset();
  });

  it("calls selectDisc then setLaunchOptionsConfirmed with re-baked launch_options", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue(m3uSelection);
    vi.mocked(backend.selectDisc).mockResolvedValue({
      success: true,
      launch_options: "flatpak run net.retrodeck.retrodeck '/roms/ff7 (Disc 2).cue'",
      selected: "ff7 (Disc 2).cue",
    });

    const r = await renderAndOpen();
    await act(async () => {
      fireEvent.click(within(r.getByTestId("disc-menu")).getByText("Disc 2"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backend.selectDisc).toHaveBeenCalledWith(42, "ff7 (Disc 2).cue");
    expect(setLaunchOptionsConfirmed).toHaveBeenCalledWith(
      100,
      "flatpak run net.retrodeck.retrodeck '/roms/ff7 (Disc 2).cue'",
    );
    expect(r.queryByTestId("disc-menu")).toBeNull();
  });

  it("selecting the m3u default clears the pin via selectDisc(rid, null)", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue({ ...m3uSelection, selected: "ff7 (Disc 2).cue" });
    vi.mocked(backend.selectDisc).mockResolvedValue({
      success: true,
      launch_options: "flatpak run net.retrodeck.retrodeck '/roms/ff7.m3u'",
      selected: null,
    });

    const r = await renderAndOpen();
    await act(async () => {
      fireEvent.click(within(r.getByTestId("disc-menu")).getByText("All discs (m3u)"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backend.selectDisc).toHaveBeenCalledWith(42, null);
    expect(setLaunchOptionsConfirmed).toHaveBeenCalledWith(100, "flatpak run net.retrodeck.retrodeck '/roms/ff7.m3u'");
  });

  it("updates the face after a successful pick", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue(m3uSelection);
    vi.mocked(backend.selectDisc).mockResolvedValue({
      success: true,
      launch_options: "cmd '/roms/ff7 (Disc 3).cue'",
      selected: "ff7 (Disc 3).cue",
    });

    const r = await renderAndOpen();
    await act(async () => {
      fireEvent.click(within(r.getByTestId("disc-menu")).getByText("Disc 3"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect((await r.findByTestId("disc-btn")).textContent).toBe("3");
  });

  it("shows error toast when selectDisc fails", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue(m3uSelection);
    vi.mocked(backend.selectDisc).mockResolvedValue({
      success: false,
      message: "Disc not found",
    });

    const r = await renderAndOpen();
    await act(async () => {
      fireEvent.click(within(r.getByTestId("disc-menu")).getByText("Disc 2"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toaster.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Tender",
        body: "Disc not found",
      }),
    );
  });
});

describe("Desktop DiscSelector — multi-version rendering and switching", () => {
  beforeEach(() => {
    vi.mocked(getCachedGameDetail).mockReset();
    vi.mocked(backend.getDiscSelection).mockReset();
    vi.mocked(backend.getVersionList).mockReset();
    vi.mocked(backend.switchVersion).mockReset();
    vi.mocked(backend.fetchCoverBase64).mockReset().mockResolvedValue({ base64: "imgdata" });
    vi.mocked(applyCommittedVersionSwitch).mockReset().mockResolvedValue(true);
    vi.mocked(toaster.toast).mockReset();
  });

  it("renders layer group trigger when only versions exist (single-disc)", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue({ multi_disc: false });
    vi.mocked(backend.getVersionList).mockResolvedValue(multiVersionList());

    const r = await renderAndOpen();

    const btn = r.getByTestId("disc-btn");
    expect(btn).toHaveAttribute("aria-label", "Select Version");

    const menu = r.getByTestId("disc-menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("USA (v1.1)");
    expect(items[0]).toHaveTextContent("Default");
    expect(items[0]).toHaveTextContent("Downloaded");
    expect(items[0]).toHaveTextContent("✓");
    expect(items[1]).toHaveTextContent("Japan");
    expect(items[1]).toHaveTextContent("not synced");
    expect(within(menu).queryByTestId("disc-version-separator")).toBeNull();
  });

  it("switches version on clicking an inactive switchable version", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue({ multi_disc: false });
    vi.mocked(backend.getVersionList).mockResolvedValue(multiVersionList());
    vi.mocked(backend.switchVersion).mockResolvedValue({
      success: true,
      app_id: 100,
      rom_id: 43,
      target_installed: false,
      launch_options: "cmd '/roms/ff7-jp.chd'",
    });

    const r = await renderAndOpen();
    const menu = r.getByTestId("disc-menu");

    await act(async () => {
      fireEvent.click(within(menu).getByText("Japan"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backend.switchVersion).toHaveBeenCalledWith(100, 43, false);
    expect(applyCommittedVersionSwitch).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, rom_id: 43 }),
      expect.any(Function),
      expect.any(Object),
    );
    expect(r.queryByTestId("disc-menu")).toBeNull();
  });

  it("shows unsynced saves dialog when switchVersion returns unsynced_saves", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue({ multi_disc: false });
    vi.mocked(backend.getVersionList).mockResolvedValue(multiVersionList());
    vi.mocked(backend.switchVersion).mockResolvedValueOnce({
      success: false,
      reason: "unsynced_saves",
      message: "Unsynced saves exist",
      unsynced_rom_id: 42,
      unsynced_version_name: "USA (v1.1)",
      server_reachable: true,
    });

    const r = await renderAndOpen();
    const menu = r.getByTestId("disc-menu");

    await act(async () => {
      fireEvent.click(within(menu).getByText("Japan"));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Unsynced saves dialog opens
    expect(r.getByRole("dialog")).toBeInTheDocument();
    expect(r.getByText(/USA \(v1\.1\).*has save changes that were never uploaded to RomM/i)).toBeInTheDocument();

    // Clicking "Switch anyway" forces switch
    vi.mocked(backend.switchVersion).mockResolvedValueOnce({
      success: true,
      app_id: 100,
      rom_id: 43,
      target_installed: false,
      launch_options: "cmd '/roms/ff7-jp.chd'",
    });

    await act(async () => {
      fireEvent.click(r.getByRole("button", { name: "Switch anyway" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backend.switchVersion).toHaveBeenCalledWith(100, 43, true);
    expect(r.queryByRole("dialog")).toBeNull();
  });

  it("allows cancelling unsynced saves dialog", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue({ multi_disc: false });
    vi.mocked(backend.getVersionList).mockResolvedValue(multiVersionList());
    vi.mocked(backend.switchVersion).mockResolvedValueOnce({
      success: false,
      reason: "unsynced_saves",
      message: "Unsynced saves exist",
      unsynced_rom_id: 42,
      unsynced_version_name: "USA (v1.1)",
      server_reachable: true,
    });

    const r = await renderAndOpen();
    const menu = r.getByTestId("disc-menu");

    await act(async () => {
      fireEvent.click(within(menu).getByText("Japan"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(r.getByRole("dialog")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(r.getByRole("button", { name: "Cancel" }));
    });

    expect(r.queryByRole("dialog")).toBeNull();
    expect(backend.switchVersion).toHaveBeenCalledTimes(1);
  });

  it("renders vanished version with hint and disables switching", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue({ multi_disc: false });
    vi.mocked(backend.getVersionList).mockResolvedValue(vanishedVersionList());

    const r = await renderAndOpen();
    const menu = r.getByTestId("disc-menu");

    const vanishedRow = within(menu).getByText("Europe").closest("button");
    expect(vanishedRow).toBeInTheDocument();
    expect(vanishedRow).toBeDisabled();
    expect(within(vanishedRow!).getByText("No longer available on RomM")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(vanishedRow!);
      await Promise.resolve();
    });

    expect(backend.switchVersion).not.toHaveBeenCalled();
  });
});

describe("Desktop DiscSelector — combined multi-disc and multi-version", () => {
  beforeEach(() => {
    vi.mocked(getCachedGameDetail).mockReset();
    vi.mocked(backend.getDiscSelection).mockReset();
    vi.mocked(backend.getVersionList).mockReset();
    vi.mocked(backend.selectDisc).mockReset();
    vi.mocked(backend.switchVersion).mockReset();
    vi.mocked(backend.fetchCoverBase64).mockReset().mockResolvedValue({ base64: "" });
    vi.mocked(applyCommittedVersionSwitch).mockReset().mockResolvedValue(true);
  });

  it("orders discs first, then versions, separated by a light grey spacer bar, and labels button accordingly", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue(m3uSelection);
    vi.mocked(backend.getVersionList).mockResolvedValue(multiVersionList());

    const r = await renderAndOpen();

    const btn = r.getByTestId("disc-btn");
    expect(btn).toHaveAttribute("aria-label", "Select Disc or Version");

    const menu = r.getByTestId("disc-menu");
    expect(within(menu).getByTestId("disc-version-separator")).toBeInTheDocument();
    expect(within(menu).queryByText("Discs")).toBeNull();
    expect(within(menu).queryByText("Versions")).toBeNull();

    const menuItems = within(menu).getAllByRole("menuitem");
    // Discs: All discs (m3u), Disc 1, Disc 2, Disc 3
    // Versions: USA (v1.1), Japan
    expect(menuItems).toHaveLength(6);

    const itemTexts = menuItems.map((item) => item.textContent || "");
    // First 4 items MUST be discs
    expect(itemTexts[0]).toContain("All discs (m3u)");
    expect(itemTexts[1]).toContain("Disc 1");
    expect(itemTexts[2]).toContain("Disc 2");
    expect(itemTexts[3]).toContain("Disc 3");

    // Last 2 items MUST be versions
    expect(itemTexts[4]).toContain("USA (v1.1)");
    expect(itemTexts[5]).toContain("Japan");
  });

  it("allows selecting a disc from combined menu", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue(m3uSelection);
    vi.mocked(backend.getVersionList).mockResolvedValue(multiVersionList());
    vi.mocked(backend.selectDisc).mockResolvedValue({
      success: true,
      launch_options: "flatpak run net.retrodeck.retrodeck '/roms/ff7 (Disc 2).cue'",
      selected: "ff7 (Disc 2).cue",
    });

    const r = await renderAndOpen();
    const menu = r.getByTestId("disc-menu");

    await act(async () => {
      fireEvent.click(within(menu).getByText("Disc 2"));
      await Promise.resolve();
    });

    expect(backend.selectDisc).toHaveBeenCalledWith(42, "ff7 (Disc 2).cue");
  });

  it("allows switching a version from combined menu", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue(m3uSelection);
    vi.mocked(backend.getVersionList).mockResolvedValue(multiVersionList());
    vi.mocked(backend.switchVersion).mockResolvedValue({
      success: true,
      app_id: 100,
      rom_id: 43,
      target_installed: false,
      launch_options: "cmd '/roms/ff7-jp.chd'",
    });

    const r = await renderAndOpen();
    const menu = r.getByTestId("disc-menu");

    await act(async () => {
      fireEvent.click(within(menu).getByText("Japan"));
      await Promise.resolve();
    });

    expect(backend.switchVersion).toHaveBeenCalledWith(100, 43, false);
    expect(applyCommittedVersionSwitch).toHaveBeenCalled();
  });
});

describe("Desktop DiscSelector — events lifecycle", () => {
  beforeEach(() => {
    vi.mocked(getCachedGameDetail).mockReset();
    vi.mocked(backend.getDiscSelection).mockReset();
    vi.mocked(backend.getVersionList).mockReset().mockResolvedValue({ multi_version: false, bound_vanished: false });
  });

  it("re-fetches getDiscSelection on a matching download_complete (newly multi-disc)", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValueOnce({ multi_disc: false });

    const { queryByTestId, findByTestId } = render(<DiscSelector appId={100} />);
    await waitFor(() => expect(vi.mocked(backend.getDiscSelection)).toHaveBeenCalledTimes(1));
    expect(queryByTestId("disc-btn")).toBeNull();

    vi.mocked(backend.getDiscSelection).mockResolvedValueOnce(m3uSelection);

    await act(async () => {
      emitHostEvent("download_complete", {
        rom_id: 42,
        rom_name: "Final Fantasy VII",
        app_id: 100,
        launch_options: "flatpak run net.retrodeck.retrodeck '/roms/ff7.m3u'",
      } as DownloadCompleteEvent);
      await Promise.resolve();
    });

    expect(await findByTestId("disc-btn")).toBeInTheDocument();
    expect(vi.mocked(backend.getDiscSelection)).toHaveBeenCalledTimes(2);
  });

  it("hides on romm_rom_uninstalled if single-version", async () => {
    mockCachedDetail();
    vi.mocked(backend.getDiscSelection).mockResolvedValue(m3uSelection);

    const { findByTestId, container } = render(<DiscSelector appId={100} />);
    await findByTestId("disc-btn");

    await act(async () => {
      globalThis.dispatchEvent(new CustomEvent("romm_rom_uninstalled", { detail: { rom_id: 42 } }));
    });

    expect(container.querySelector('[data-testid="disc-btn"]')).toBeNull();
  });
});
