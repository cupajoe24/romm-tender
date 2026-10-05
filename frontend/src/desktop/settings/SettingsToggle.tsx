/**
 * A setting with a switch, as Steam's own settings rows draw one: Steam's
 * `Field` around Steam's bare `Toggle`.
 *
 * Not `ToggleField`: `@decky/ui`'s is Steam's name-keyed component selector,
 * which falls back to the classic OFF/ON dialog field in a React root with no
 * component-override context above it — which Tender's window is
 * (`docs/architecture/desktop-dom-architecture.md`, "Tabs").
 */

import type { FC, ReactNode } from "react";
import { Field, Toggle } from "@decky/ui";

export interface SettingsToggleProps {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export const SettingsToggle: FC<SettingsToggleProps> = ({ label, description, checked, disabled, onChange }) => (
  <Field label={label} description={description}>
    <Toggle value={checked} disabled={disabled ?? false} onChange={onChange} />
  </Field>
);
