/**
 * A section heading inside a Tender Settings tab: Steam's own section header,
 * with an optional quiet clause after the title.
 */

import type { FC } from "react";
import { DialogControlsSectionHeader } from "@decky/ui";
import { HEADING_NOTE_STYLE } from "./settingsStyles";

export const SectionHeading: FC<{
  title: string;
  note?: string | null | undefined;
  noteColor?: string | undefined;
}> = ({ title, note, noteColor }) => (
  <DialogControlsSectionHeader>
    {title}
    {note != null && <span style={{ ...HEADING_NOTE_STYLE, ...(noteColor ? { color: noteColor } : {}) }}>{note}</span>}
  </DialogControlsSectionHeader>
);
