import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { createElement } from "react";
import * as sgdbGamePicker from "../../../utils/sgdbGamePicker";
import { DesktopSgdbGamePickerDialog } from "./DesktopSgdbGamePickerDialog";

vi.mock("../../../utils/sgdbGamePicker", () => ({
  executeSgdbCandidateSearch: vi.fn(),
  executeSgdbSelectionApply: vi.fn(),
}));

describe("DesktopSgdbGamePickerDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(sgdbGamePicker.executeSgdbCandidateSearch).mockResolvedValue({
      success: true,
      games: [],
    });
    vi.mocked(sgdbGamePicker.executeSgdbSelectionApply).mockResolvedValue({
      success: true,
      applied: 4,
    });
  });

  it("renders with initial candidate list, rom name, and prefilled search field", () => {
    const onClose = vi.fn();
    const candidates = [{ id: 1, name: "Chrono Trigger", release_year: 1995, thumb_url: "https://x/ct.png" }];
    const { getByText, getByRole, getByDisplayValue } = render(
      createElement(DesktopSgdbGamePickerDialog, {
        romId: 10,
        appId: 200,
        romName: "Chrono",
        candidates,
        onClose,
      }),
    );

    expect(getByText("Choose SteamGridDB Game")).toBeInTheDocument();
    expect(getByText("Chrono")).toBeInTheDocument();
    expect(getByDisplayValue("Chrono")).toBeInTheDocument();
    expect(getByText("Chrono Trigger")).toBeInTheDocument();
    expect(getByText("1995")).toBeInTheDocument();
    expect(getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("renders 'No preview' fallback when candidate has no thumbnail URL", () => {
    const candidates = [{ id: 2, name: "Secret of Mana", release_year: null, thumb_url: null }];
    const { getByText } = render(
      createElement(DesktopSgdbGamePickerDialog, {
        romId: 10,
        appId: 200,
        romName: "Mana",
        candidates,
        onClose: vi.fn(),
      }),
    );

    expect(getByText("Secret of Mana")).toBeInTheDocument();
    expect(getByText("No preview")).toBeInTheDocument();
  });

  it("searches candidates on form submit and displays results", async () => {
    vi.mocked(sgdbGamePicker.executeSgdbCandidateSearch).mockResolvedValue({
      success: true,
      games: [{ id: 99, name: "Final Fantasy VI", release_year: 1994, thumb_url: "https://x/ff6.png" }],
    });

    const { getByRole, getByText } = render(
      createElement(DesktopSgdbGamePickerDialog, {
        romId: 10,
        appId: 200,
        romName: "FF6",
        candidates: [],
        onClose: vi.fn(),
      }),
    );

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Search" }));
    });

    expect(sgdbGamePicker.executeSgdbCandidateSearch).toHaveBeenCalledWith("FF6", {
      tag: "DesktopSgdbGamePickerDialog",
    });
    expect(getByText("Final Fantasy VI")).toBeInTheDocument();
    expect(getByText("1994")).toBeInTheDocument();
  });

  it("displays search error when candidate search returns failure", async () => {
    vi.mocked(sgdbGamePicker.executeSgdbCandidateSearch).mockResolvedValue({
      success: false,
      games: [],
      error: "No matches found.",
    });

    const { getByRole, getByRole: getByRoleAlert } = render(
      createElement(DesktopSgdbGamePickerDialog, {
        romId: 10,
        appId: 200,
        romName: "UnknownGame",
        candidates: [],
        onClose: vi.fn(),
      }),
    );

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Search" }));
    });

    expect(getByRoleAlert("alert")).toHaveTextContent("No matches found.");
  });

  it("selects a candidate, executes apply, and calls onClose on success", async () => {
    const onClose = vi.fn();
    const onApplied = vi.fn();
    const candidates = [{ id: 42, name: "EarthBound", release_year: 1994, thumb_url: "https://x/eb.png" }];

    const { getByText } = render(
      createElement(DesktopSgdbGamePickerDialog, {
        romId: 15,
        appId: 500,
        romName: "Mother 2",
        candidates,
        onApplied,
        onClose,
      }),
    );

    await act(async () => {
      fireEvent.click(getByText("EarthBound"));
    });

    expect(sgdbGamePicker.executeSgdbSelectionApply).toHaveBeenCalledWith({
      romId: 15,
      appId: 500,
      selectedId: 42,
      onApplied,
      tag: "DesktopSgdbGamePickerDialog",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose if executeSgdbSelectionApply fails", async () => {
    const onClose = vi.fn();
    vi.mocked(sgdbGamePicker.executeSgdbSelectionApply).mockResolvedValue({
      success: false,
    });
    const candidates = [{ id: 42, name: "EarthBound", release_year: 1994, thumb_url: "https://x/eb.png" }];

    const { getByText } = render(
      createElement(DesktopSgdbGamePickerDialog, {
        romId: 15,
        appId: 500,
        romName: "Mother 2",
        candidates,
        onClose,
      }),
    );

    await act(async () => {
      fireEvent.click(getByText("EarthBound"));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Close button is clicked", () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      createElement(DesktopSgdbGamePickerDialog, {
        romId: 10,
        appId: 200,
        romName: "Chrono",
        onClose,
      }),
    );

    fireEvent.click(getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(
      createElement(DesktopSgdbGamePickerDialog, {
        romId: 10,
        appId: 200,
        romName: "Chrono",
        onClose,
      }),
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
