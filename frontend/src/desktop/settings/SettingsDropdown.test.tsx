import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { componentSources } from "../../test-utils/componentSources";
import { SettingsDropdown } from "./SettingsDropdown";

// The suite-wide stub draws a `<select>` and drops `renderButtonValue`; this one
// draws the button's value the way Steam's does, through that prop.
vi.mock("@decky/ui", () => ({
  Field: (p: { label?: ReactNode; description?: ReactNode; children?: ReactNode }) =>
    createElement(
      "div",
      { "data-testid": "field" },
      createElement("span", { "data-testid": "field-label" }, p.label),
      createElement("span", { "data-testid": "field-desc" }, p.description),
      p.children,
    ),
  Dropdown: (p: {
    rgOptions: { data: unknown; label: ReactNode }[];
    selectedOption: unknown;
    onChange: (option: { data: unknown; label: ReactNode }) => void;
    renderButtonValue?: (shown: ReactNode) => ReactNode;
  }) => {
    const shown = p.rgOptions.find((option) => option.data === p.selectedOption)?.label;
    return createElement(
      "div",
      null,
      createElement("button", { "data-testid": "dropdown-button" }, p.renderButtonValue?.(shown) ?? shown),
      p.rgOptions.map((option) =>
        createElement(
          "button",
          { key: String(option.data), "data-testid": "dropdown-option", onClick: () => p.onChange(option) },
          option.label,
        ),
      ),
    );
  },
}));

const OPTIONS = [
  { data: "auto", label: "Default (World > USA > Europe)" },
  { data: "USA", label: "USA" },
  { data: "Japan", label: "Japan" },
];

describe("SettingsDropdown", () => {
  it("draws its label and description in a Field and reports the picked option", () => {
    const onChange = vi.fn();
    render(
      <SettingsDropdown
        label="Preferred region"
        description="Which dump wins."
        rgOptions={OPTIONS}
        selectedOption="USA"
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId("field-label")).toHaveTextContent("Preferred region");
    expect(screen.getByTestId("field-desc")).toHaveTextContent("Which dump wins.");
    fireEvent.click(screen.getAllByTestId("dropdown-option")[2]!);
    expect(onChange).toHaveBeenCalledWith(OPTIONS[2]);
  });

  it("holds every option's label hidden behind the shown one, whichever is picked", () => {
    render(<SettingsDropdown label="Region" rgOptions={OPTIONS} selectedOption="USA" onChange={vi.fn()} />);
    const button = screen.getByTestId("dropdown-button");
    const sizers = within(button).getAllByTestId("dropdown-width-label");

    expect(sizers.map((el) => el.textContent)).toEqual(OPTIONS.map((option) => option.label));
    for (const sizer of sizers) {
      expect(sizer).toHaveAttribute("aria-hidden", "true");
      expect(sizer).toHaveStyle({ visibility: "hidden", gridArea: "1 / 1" });
    }
    const shown = Array.from(button.querySelectorAll("span > span")).find((el) => !sizers.includes(el as HTMLElement));
    expect(shown).toHaveTextContent("USA");
    expect(shown).toHaveStyle({ gridArea: "1 / 1" });
    expect(shown).not.toHaveStyle({ visibility: "hidden" });
  });
});

describe("the desktop surface's dropdowns", () => {
  it("are drawn only through SettingsDropdown", () => {
    const desktop = componentSources().filter((file) => file.path.startsWith("desktop/"));
    expect(desktop.length).toBeGreaterThan(0);
    const offenders = desktop
      .filter((file) => file.path !== "desktop/settings/SettingsDropdown.tsx")
      .filter((file) => /<Dropdown\b/.test(file.source))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});
