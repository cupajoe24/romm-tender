import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { DrillDown } from "./DrillDown";

const view = (open: boolean) => (
  <DrillDown open={open} list={<div>the list</div>} detail={<div>the detail</div>} onBack={vi.fn()} />
);

const collapsed = (testId: string) => screen.getByTestId(testId).style.height === "0px";

afterEach(() => {
  vi.useRealTimers();
});

describe("DrillDown", () => {
  it("shows the list and keeps the detail out of the way until it opens", () => {
    render(view(false));
    expect(screen.getByTestId("drill-down-detail")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("drill-down-list").style.transform).toBe("translateX(0)");
    expect(screen.getByTestId("drill-down-detail").style.transform).toBe("translateX(100%)");
    expect(collapsed("drill-down-detail")).toBe(true);
    expect(collapsed("drill-down-list")).toBe(false);
  });

  it("keeps both panels' height while the slide runs, and drops the list's once it is over", () => {
    vi.useFakeTimers();
    const { rerender } = render(view(false));
    rerender(view(true));
    // Each panel slides by its own width, so neither can overshoot the frame.
    expect(screen.getByTestId("drill-down-list").style.transform).toBe("translateX(-100%)");
    expect(screen.getByTestId("drill-down-detail").style.transform).toBe("translateX(0)");
    expect(collapsed("drill-down-list")).toBe(false);
    expect(collapsed("drill-down-detail")).toBe(false);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(collapsed("drill-down-list")).toBe(true);
    expect(screen.getByTestId("drill-down-list")).toHaveAttribute("aria-hidden", "true");
  });

  it("slides the list back, and collapses the detail once the slide is over", () => {
    vi.useFakeTimers();
    const { rerender } = render(view(true));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender(view(false));
    expect(collapsed("drill-down-list")).toBe(false);
    expect(collapsed("drill-down-detail")).toBe(false);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(collapsed("drill-down-detail")).toBe(true);
  });
});
