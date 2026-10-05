import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { componentSources } from "../../test-utils/componentSources";
import { SettingsToggle } from "./SettingsToggle";

describe("SettingsToggle", () => {
  it("draws its label and description in a Field, and its switch reports each flip", () => {
    const onChange = vi.fn();
    render(
      <SettingsToggle label="Skip preview" description="Start without asking." checked={false} onChange={onChange} />,
    );
    expect(screen.getByTestId("field-label")).toHaveTextContent("Skip preview");
    expect(screen.getByTestId("field-desc")).toHaveTextContent("Start without asking.");
    fireEvent.click(screen.getByTestId("toggle-input"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

// `ToggleField` draws Steam's classic OFF/ON field in a root of Tender's own, so
// the desktop surface draws its switches through `SettingsToggle` or a bare
// `Toggle`, and nothing there spells the classic one.
describe("the desktop surface's switches", () => {
  it("never draw @decky/ui's ToggleField", () => {
    const desktop = componentSources().filter((file) => file.path.startsWith("desktop/"));
    expect(desktop.length).toBeGreaterThan(0);
    const offenders = desktop.filter((file) => /<ToggleField\b/.test(file.source)).map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});
