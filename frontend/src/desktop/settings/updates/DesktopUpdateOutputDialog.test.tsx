import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as backend from "../../../api/backend";
import {
  OUTPUT_GONE,
  OUTPUT_MISSING,
  OUTPUT_READING,
  OUTPUT_UNREAD,
  resetUpdateOutputReadingForTests,
} from "../../../utils/updateOutputView";
import { DesktopUpdateOutputDialog } from "./DesktopUpdateOutputDialog";

vi.mock("../../../api/backend", async (importActual) => ({
  ...(await importActual<typeof import("../../../api/backend")>()),
  getUpdateOutput: vi.fn(),
  logError: vi.fn(),
}));

describe("DesktopUpdateOutputDialog", () => {
  beforeEach(() => {
    resetUpdateOutputReadingForTests();
    vi.mocked(backend.getUpdateOutput).mockReset();
  });

  it("shows reading indicator while waiting for backend response", async () => {
    let resolveRead!: (value: backend.UpdateOutput) => void;
    vi.mocked(backend.getUpdateOutput).mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );

    render(<DesktopUpdateOutputDialog rolledBackAt={null} version="1.1.0" onClose={vi.fn()} />);

    expect(screen.getByTestId("output-reading").textContent).toBe(OUTPUT_READING);

    await act(async () => {
      resolveRead({
        success: true,
        ran_at: 1729000000,
        missing: null,
        installer: { lines: ["install line 1"], earlier: 0 },
        new_version: null,
      });
    });

    expect(screen.queryByTestId("output-reading")).toBeNull();
    expect(screen.getByTestId("output-installer").textContent).toContain("install line 1");
  });

  it("renders installer output lines with tone colors", async () => {
    vi.mocked(backend.getUpdateOutput).mockResolvedValue({
      success: true,
      ran_at: 1729000000,
      missing: null,
      installer: {
        lines: [
          "[ok] Step done",
          "[..] Step running",
          "[!!] Step failed",
          "install.sh: Error occurred",
          "plain output",
        ],
        earlier: 5,
      },
      new_version: null,
    });

    render(<DesktopUpdateOutputDialog rolledBackAt="2026-10-15T12:00:00Z" version="1.1.0" onClose={vi.fn()} />);

    await act(async () => {});

    expect(screen.getByText("5 earlier lines are not shown.")).toBeInTheDocument();

    const lines = screen.getAllByTestId("output-line");
    expect(lines).toHaveLength(5);
    expect(lines[0]?.style.color).toBe("#59bf40"); // success
    expect(lines[1]?.style.color).toBe("#8f98a0"); // muted
    expect(lines[2]?.style.color).toBe("#e5a00d"); // danger
    expect(lines[3]?.style.color).toBe("#e5a00d"); // danger
    expect(lines[4]?.style.color).toBe("#c7d5e0"); // default
  });

  it("renders new version section when available after rollback", async () => {
    vi.mocked(backend.getUpdateOutput).mockResolvedValue({
      success: true,
      ran_at: 1729000000,
      missing: null,
      installer: { lines: ["installer line"], earlier: 0 },
      new_version: { lines: ["v2 crash report"], earlier: 1 },
    });

    render(<DesktopUpdateOutputDialog rolledBackAt="2026-10-15T12:00:00Z" version="1.2.0" onClose={vi.fn()} />);

    await act(async () => {});

    expect(screen.getByText("The installer")).toBeInTheDocument();
    expect(screen.getByText("1.2.0, when it tried to start")).toBeInTheDocument();
    expect(screen.getByText("1 earlier line is not shown.")).toBeInTheDocument();
    expect(screen.getByTestId("output-new-version").textContent).toContain("v2 crash report");
  });

  it("renders missing reason when journal lines rotated out", async () => {
    vi.mocked(backend.getUpdateOutput).mockResolvedValue({
      success: true,
      ran_at: null,
      missing: "rotated",
      installer: null,
      new_version: null,
    });

    render(<DesktopUpdateOutputDialog rolledBackAt="2026-10-15T12:00:00Z" version="1.1.0" onClose={vi.fn()} />);

    await act(async () => {});

    expect(screen.getByTestId("output-message").textContent).toBe(OUTPUT_MISSING.rotated);
  });

  it("renders gone message when failure record was not found", async () => {
    vi.mocked(backend.getUpdateOutput).mockResolvedValue({
      success: false,
      reason: "not_found",
      message: "Not found",
    });

    render(<DesktopUpdateOutputDialog rolledBackAt="2026-10-15T12:00:00Z" version="1.1.0" onClose={vi.fn()} />);

    await act(async () => {});

    expect(screen.getByTestId("output-message").textContent).toBe(OUTPUT_GONE);
  });

  it("renders unread message when read rejects", async () => {
    vi.mocked(backend.getUpdateOutput).mockRejectedValue(new Error("network failure"));

    render(<DesktopUpdateOutputDialog rolledBackAt="2026-10-15T12:00:00Z" version="1.1.0" onClose={vi.fn()} />);

    await act(async () => {});

    expect(screen.getByTestId("output-message").textContent).toBe(OUTPUT_UNREAD);
  });

  it("invokes onClose when Close button is clicked", async () => {
    vi.mocked(backend.getUpdateOutput).mockResolvedValue({
      success: true,
      ran_at: 1729000000,
      missing: null,
      installer: { lines: ["line"], earlier: 0 },
      new_version: null,
    });

    const onClose = vi.fn();
    render(<DesktopUpdateOutputDialog rolledBackAt={null} version="1.1.0" onClose={onClose} />);

    await act(async () => {});

    const btn = screen.getByTestId("output-close-btn");
    await userEvent.click(btn);

    expect(onClose).toHaveBeenCalledOnce();
  });
});
