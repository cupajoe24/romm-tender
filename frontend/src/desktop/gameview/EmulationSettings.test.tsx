import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmulationSettings } from "./EmulationSettings";
import type { GameDetailState } from "../../utils/gameDetailStore";

describe("EmulationSettings", () => {
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

  it("renders emulation settings with active core and override badge", () => {
    render(<EmulationSettings title="Resident Evil 2" detail={baseDetail} />);

    expect(screen.getByText("N64 EMULATION")).toBeInTheDocument();
    expect(screen.getByText("Resident Evil 2")).toBeInTheDocument();
    expect(screen.getAllByText("Mupen64Plus-Next")).toHaveLength(2);
    expect(screen.getByText("Override")).toBeInTheDocument();
    expect(screen.getAllByText("ParaLLEl N64")).toHaveLength(2);
    expect(screen.getByText("Custom game override")).toBeInTheDocument();
    expect(screen.getByText("BIOS Present")).toBeInTheDocument();
    expect(screen.getByText("Cloud save sync enabled")).toBeInTheDocument();
  });

  it("handles default configuration when no override is present", () => {
    const detailWithoutOverride: GameDetailState = {
      ...baseDetail,
      hasGameOverride: false,
      activeCoreLabel: null,
      platformCoreLabel: "ParaLLEl N64",
      biosNeeded: false,
    };

    render(<EmulationSettings title="Mario 64" detail={detailWithoutOverride} />);

    expect(screen.getByText("Inherited from platform")).toBeInTheDocument();
    expect(screen.getByText("No BIOS required")).toBeInTheDocument();
  });
});
