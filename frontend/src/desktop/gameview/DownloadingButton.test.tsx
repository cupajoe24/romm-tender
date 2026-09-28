import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DownloadingButton } from "./DownloadingButton";

describe("DownloadingButton", () => {
  it("renders download progress and calls cancel", () => {
    const onCancel = vi.fn();
    const onPauseResume = vi.fn();

    render(
      <DownloadingButton
        progressPercent={45}
        isExtracting={false}
        isPaused={false}
        isResumable={true}
        progressRatio={0.45}
        onPauseResume={onPauseResume}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText("45%")).toBeInTheDocument();
    const cancelBtn = screen.getByLabelText("Cancel download");
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);

    const pauseBtn = screen.getByLabelText("Pause download");
    fireEvent.click(pauseBtn);
    expect(onPauseResume).toHaveBeenCalledTimes(1);
  });

  it("renders extracting state without pause/cancel controls", () => {
    render(
      <DownloadingButton
        progressPercent={80}
        isExtracting={true}
        isPaused={false}
        isResumable={true}
        progressRatio={0.8}
        onPauseResume={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Extracting… 80%")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cancel download")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pause download")).not.toBeInTheDocument();
  });

  it("renders paused state with resume button", () => {
    const onPauseResume = vi.fn();
    render(
      <DownloadingButton
        progressPercent={25}
        isExtracting={false}
        isPaused={true}
        isResumable={true}
        progressRatio={0.25}
        onPauseResume={onPauseResume}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Paused (25%)")).toBeInTheDocument();
    const resumeBtn = screen.getByLabelText("Resume download");
    fireEvent.click(resumeBtn);
    expect(onPauseResume).toHaveBeenCalledTimes(1);
  });
});
