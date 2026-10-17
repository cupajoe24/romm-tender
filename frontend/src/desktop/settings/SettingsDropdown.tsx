/**
 * A setting picked from a list, as Steam's own settings rows draw one: Steam's
 * `Field` around Steam's `Dropdown`.
 *
 * Steam's dropdown button is as wide as the label it shows, so picking a
 * shorter option would shrink it. The shown label is drawn over hidden copies
 * of every option's label in one grid cell, which hold the button at the width
 * of the widest.
 */

import type { CSSProperties, FC, ReactNode } from "react";
import { Dropdown, Field, type SingleDropdownOption } from "@decky/ui";

export interface SettingsDropdownProps {
  label: ReactNode;
  description?: ReactNode;
  rgOptions: readonly SingleDropdownOption[];
  selectedOption: unknown;
  onChange: (option: SingleDropdownOption) => void;
}

const CELL_STYLE: CSSProperties = { gridArea: "1 / 1", whiteSpace: "nowrap" };

/** `shown`, in a box as wide as the widest of `labels`. */
export const WidestLabelBox: FC<{ labels: ReactNode[]; shown: ReactNode }> = ({ labels, shown }) => (
  <span style={{ display: "inline-grid" }}>
    {labels.map((label, i) => (
      <span
        key={i}
        aria-hidden="true"
        data-testid="dropdown-width-label"
        style={{ ...CELL_STYLE, visibility: "hidden" }}
      >
        {label}
      </span>
    ))}
    <span style={CELL_STYLE}>{shown}</span>
  </span>
);

export const SettingsDropdown: FC<SettingsDropdownProps> = ({
  label,
  description,
  rgOptions,
  selectedOption,
  onChange,
}) => (
  <Field label={label} description={description}>
    <Dropdown
      rgOptions={[...rgOptions]}
      selectedOption={selectedOption}
      onChange={onChange}
      renderButtonValue={(shown) => <WidestLabelBox labels={rgOptions.map((option) => option.label)} shown={shown} />}
    />
  </Field>
);
