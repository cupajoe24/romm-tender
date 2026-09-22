import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { EmulationSettings } from "./EmulationSettings";
import type { GameDetailState } from "../../utils/gameDetailStore";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("../../api/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/backend")>();
  return {
    ...actual,
    getBiosStatus: vi.fn(),
    setGameCore: vi.fn(),
    clearGameCore: vi.fn(),
    debugLog: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../../utils/steamShortcuts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/steamShortcuts")>();
  return {
    ...actual,
    setLaunchOptionsConfirmed: vi.fn().mockResolvedValue(true),
  };
});

import { getBiosStatus, setGameCore, clearGameCore } from "../../api/backend";
import { setLaunchOptionsConfirmed } from "../../utils/steamShortcuts";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const baseDetail: GameDetailState = {
  romId: 42,
  romName: "Resident Evil 2",
  platformSlug: "n64",
  installed: true,
  fsSizeBytes: null,
  saveSyncEnabled: true,
  saveStatus: null,
  saveSyncStatus: null,
  saveSyncLabel: "",
  savefilesInContentDir: false,
  activeSlot: "default",
  raId: null,
  achievementEarned: 0,
  achievementTotal: 0,
  biosNeeded: true,
  biosLabel: "BIOS Present",
  biosRequiredMissing: false,
  activeCoreLabel: "Mupen64Plus-Next",
  activeCoreIsDefault: false,
  emulators: [
    {
      label: "Mupen64Plus-Next",
      kind: "libretro",
      core_so: "mupen64plus_next",
      emulator: "mupen64plus_next",
      is_default: false,
      bakeable: true,
      reason: null,
    },
    {
      label: "ParaLLEl N64",
      kind: "libretro",
      core_so: "parallel_n64",
      emulator: "parallel_n64",
      is_default: true,
      bakeable: true,
      reason: null,
    },
  ],
  emulatorDataAvailable: true,
  platformCoreLabel: "ParaLLEl N64",
  hasGameOverride: true,
};

/** BiosAnswer with two files — one present required, one missing required. */
const BIOS_ANSWER_WITH_FILES = {
  bios_status: {
    needs_bios: true,
    platform_slug: "n64",
    server_count: 2,
    local_count: 1,
    all_downloaded: false,
    required_count: 2,
    required_downloaded: 1,
    bios_level: "partial" as const,
    files: [
      {
        file_name: "n64-pif.bin",
        downloaded: true,
        satisfied: true,
        local_path: "/bios/n64-pif.bin",
        description: "N64 PIF ROM",
        wanted: "needed" as const,
        required_by_active: true,
        on_server: true,
      },
      {
        file_name: "n64-missing.bin",
        downloaded: false,
        satisfied: false,
        local_path: "/bios/n64-missing.bin",
        description: "Missing required BIOS",
        wanted: "needed" as const,
        required_by_active: true,
        on_server: true,
      },
    ],
  },
  bios_level: "partial" as const,
  bios_label: "1 of 2 required",
};

// ─── Render helper ────────────────────────────────────────────────────────────

async function renderSettings(props?: { title?: string; detail?: Partial<GameDetailState> }) {
  const mergedDetail: GameDetailState = {
    ...baseDetail,
    ...props?.detail,
  };
  const result = render(<EmulationSettings title={props?.title ?? "Resident Evil 2"} detail={mergedDetail} />);
  if (mergedDetail.romId && mergedDetail.biosNeeded) {
    await waitFor(() => {
      expect(screen.queryByText("Loading BIOS status…")).not.toBeInTheDocument();
    });
  }
  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("EmulationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return BIOS files so most tests see the file list
    vi.mocked(getBiosStatus).mockResolvedValue(BIOS_ANSWER_WITH_FILES);
  });

  // ── Basic render ──────────────────────────────────────────────────────────

  it("renders the platform heading and title", async () => {
    await renderSettings();
    expect(screen.getByText("N64 EMULATION")).toBeInTheDocument();
    expect(screen.getByText("Resident Evil 2")).toBeInTheDocument();
  });

  it("shows the active core in the summary row with Game override badge when override is set", async () => {
    await renderSettings();
    // Active core label appears in the summary row
    const activeCoreSpans = screen.getAllByText("Mupen64Plus-Next");
    expect(activeCoreSpans.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Game override")).toBeInTheDocument();
  });

  // ── Emulator picker ───────────────────────────────────────────────────────

  it("renders a listbox with all emulators", async () => {
    await renderSettings();
    expect(screen.getByRole("listbox", { name: /emulator selection/i })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("marks the active emulator as selected", async () => {
    await renderSettings();
    const options = screen.getAllByRole("option");
    // Mupen64Plus-Next is activeCoreLabel and activeCoreIsDefault=false → it's the active one
    const mupenOption = options.find((o) => o.textContent.includes("Mupen64Plus-Next"));
    expect(mupenOption).toHaveAttribute("aria-selected", "true");
    const parallelOption = options.find((o) => o.textContent.includes("ParaLLEl N64"));
    expect(parallelOption).toHaveAttribute("aria-selected", "false");
  });

  it("shows Default badge on the default emulator and Override badge on the active non-default", async () => {
    await renderSettings();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("Override")).toBeInTheDocument();
  });

  it("shows RetroArch badge for libretro emulators", async () => {
    await renderSettings();
    const retroarchBadges = screen.getAllByText("RetroArch");
    expect(retroarchBadges.length).toBeGreaterThanOrEqual(2);
  });

  it("shows Unavailable badge and ignores clicks for non-bakeable emulators", async () => {
    const detailWithNonBakeable: GameDetailState = {
      ...baseDetail,
      emulators: [
        ...baseDetail.emulators,
        {
          label: "Needs Setup",
          kind: "standalone",
          core_so: null,
          emulator: "needs_setup",
          is_default: false,
          bakeable: false,
          reason: "inject",
        },
      ],
    };
    await renderSettings({ detail: detailWithNonBakeable });
    expect(screen.getByText("Unavailable")).toBeInTheDocument();

    const nonBakeableOption = screen.getAllByRole("option").find((o) => o.textContent.includes("Needs Setup"));
    expect(nonBakeableOption).toBeDefined();
    fireEvent.click(nonBakeableOption!);
    // No API call should be made for non-bakeable options
    expect(setGameCore).not.toHaveBeenCalled();
    expect(clearGameCore).not.toHaveBeenCalled();
  });

  it("shows emulator data unavailable message when emulatorDataAvailable is false", async () => {
    await renderSettings({
      detail: { emulatorDataAvailable: false, emulators: [] },
    });
    expect(screen.getByText(/Emulator data unavailable/)).toBeInTheDocument();
  });

  it("shows 'No emulators found' when emulators is empty but data is available", async () => {
    await renderSettings({
      detail: { emulators: [] },
    });
    expect(screen.getByText("No emulators found for this platform.")).toBeInTheDocument();
  });

  // ── Core change interactions ──────────────────────────────────────────────

  it("calls clearGameCore when the default-marked emulator is clicked", async () => {
    vi.mocked(clearGameCore).mockResolvedValue({ success: true, app_id: 1234, launch_options: "-e parallel" });
    await renderSettings();

    const parallelOption = screen.getAllByRole("option").find((o) => o.textContent.includes("ParaLLEl N64"));
    fireEvent.click(parallelOption!);

    await waitFor(() => expect(clearGameCore).toHaveBeenCalledWith(42));
    expect(setLaunchOptionsConfirmed).toHaveBeenCalledWith(1234, "-e parallel");
  });

  it("calls setGameCore when a non-default emulator is selected", async () => {
    vi.mocked(setGameCore).mockResolvedValue({ success: true, app_id: 1234, launch_options: "-e mupen" });
    await renderSettings({
      title: "Mario 64",
      detail: {
        activeCoreIsDefault: true,
        activeCoreLabel: null,
        hasGameOverride: false,
      },
    });

    const mupenOption = screen.getAllByRole("option").find((o) => o.textContent.includes("Mupen64Plus-Next"));
    fireEvent.click(mupenOption!);

    await waitFor(() => expect(setGameCore).toHaveBeenCalledWith(42, "Mupen64Plus-Next"));
    expect(setLaunchOptionsConfirmed).toHaveBeenCalledWith(1234, "-e mupen");
  });

  it("skips setLaunchOptionsConfirmed when result has no app_id (ROM not installed)", async () => {
    vi.mocked(setGameCore).mockResolvedValue({ success: true }); // no app_id / launch_options
    await renderSettings({
      title: "Mario 64",
      detail: {
        activeCoreIsDefault: true,
        activeCoreLabel: null,
        hasGameOverride: false,
      },
    });

    const mupenOption = screen.getAllByRole("option").find((o) => o.textContent.includes("Mupen64Plus-Next"));
    fireEvent.click(mupenOption!);

    await waitFor(() => expect(setGameCore).toHaveBeenCalled());
    expect(setLaunchOptionsConfirmed).not.toHaveBeenCalled();
  });

  it("shows an error message when setGameCore returns failure", async () => {
    vi.mocked(setGameCore).mockResolvedValue({ success: false, message: "Core unavailable" });
    await renderSettings({
      title: "Mario 64",
      detail: {
        activeCoreIsDefault: true,
        activeCoreLabel: null,
        hasGameOverride: false,
      },
    });

    const mupenOption = screen.getAllByRole("option").find((o) => o.textContent.includes("Mupen64Plus-Next"));
    fireEvent.click(mupenOption!);

    await waitFor(() => expect(screen.getByText("Core unavailable")).toBeInTheDocument());
  });

  // ── Default configuration ─────────────────────────────────────────────────

  it("shows default (no override) state — no Override badge, correct active selection", async () => {
    await renderSettings({
      title: "Mario 64",
      detail: {
        hasGameOverride: false,
        activeCoreLabel: null,
        activeCoreIsDefault: true,
        platformCoreLabel: "ParaLLEl N64",
      },
    });

    expect(screen.queryByText("Game override")).not.toBeInTheDocument();
    // ParaLLEl N64 is the default, so it should be the selected option
    const parallelOption = screen.getAllByRole("option").find((o) => o.textContent.includes("ParaLLEl N64"));
    expect(parallelOption).toHaveAttribute("aria-selected", "true");
  });

  // ── BIOS section ──────────────────────────────────────────────────────────

  it("shows BIOS file list when biosNeeded is true and getBiosStatus returns files", async () => {
    await renderSettings();
    await waitFor(() => expect(getBiosStatus).toHaveBeenCalledWith(42));
    expect(screen.getByText("n64-pif.bin")).toBeInTheDocument();
    expect(screen.getByText("n64-missing.bin")).toBeInTheDocument();
  });

  it("shows Required badge for files required by the active core", async () => {
    await renderSettings();
    await waitFor(() => screen.getByText("n64-pif.bin"));
    const requiredBadges = screen.getAllByText("Required");
    expect(requiredBadges).toHaveLength(2);
  });

  it("shows Present badge for downloaded files and Missing for absent ones", async () => {
    await renderSettings();
    await waitFor(() => screen.getByText("n64-pif.bin"));
    expect(screen.getByText("Present")).toBeInTheDocument();
    expect(screen.getByText("Missing")).toBeInTheDocument();
  });

  it("shows 'No BIOS required' when biosNeeded is false", async () => {
    await renderSettings({
      title: "Mario 64",
      detail: { biosNeeded: false },
    });
    expect(screen.getByText("No BIOS required for this title")).toBeInTheDocument();
  });

  it("shows file-details-unavailable message when getBiosStatus returns no files", async () => {
    vi.mocked(getBiosStatus).mockResolvedValue({
      bios_status: { needs_bios: true, platform_slug: "n64", server_count: 0, local_count: 0, all_downloaded: false },
      bios_level: null,
      bios_label: "BIOS required",
    });
    render(<EmulationSettings title="Resident Evil 2" detail={baseDetail} />);
    await waitFor(() => expect(getBiosStatus).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/File details not available/)).toBeInTheDocument());
  });
});
