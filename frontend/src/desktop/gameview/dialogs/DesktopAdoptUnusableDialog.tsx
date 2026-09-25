/**
 * The desktop client's dialog for a namesake that cannot become this game's
 * install — the other shape, or a link. Its only offer is a second copy beside
 * the first. Big Picture's `AdoptUnusableModal` is the other drawing of it.
 */

import type { FC } from "react";
import { ENTRY_KIND_LABEL } from "../../../utils/formatters";
import {
  UNUSABLE_DOWNLOAD_NOTE,
  UNUSABLE_TITLE,
  unusableDownloadLabel,
  unusableIntro,
  unusableTruncatedNote,
} from "../../../utils/adoptWording";
import type { UnusableChoice } from "../../../utils/adoptFlow";
import type { UnusableNamesakeResult } from "../../../types";
import {
  DIALOG_ACTIONS_STYLE,
  DIALOG_MUTED_STYLE,
  DIALOG_TEXT_STYLE,
  DIALOG_VALUE_STYLE,
  DesktopDialog,
  dialogButtonStyle,
} from "./DesktopDialog";

export interface DesktopAdoptUnusableDialogProps {
  unusable: UnusableNamesakeResult;
  onChoice: (choice: UnusableChoice) => void;
}

export const DesktopAdoptUnusableDialog: FC<DesktopAdoptUnusableDialogProps> = ({ unusable, onChoice }) => (
  <DesktopDialog
    titleId="tender-desktop-adopt-unusable-title"
    title={UNUSABLE_TITLE}
    onDismiss={() => onChoice("cancel")}
  >
    <div style={DIALOG_TEXT_STYLE}>{unusableIntro(unusable)}</div>

    <div style={{ marginBottom: "12px" }}>
      {unusable.existing.map((entry) => (
        <div key={entry.path} style={{ ...DIALOG_VALUE_STYLE, marginBottom: "2px" }}>
          {entry.name} <span style={DIALOG_MUTED_STYLE}>({ENTRY_KIND_LABEL[entry.kind]})</span>
        </div>
      ))}
    </div>

    {unusable.truncated && (
      <div style={{ ...DIALOG_MUTED_STYLE, marginBottom: "12px" }}>{unusableTruncatedNote(unusable)}</div>
    )}

    <div style={DIALOG_ACTIONS_STYLE}>
      <button type="button" style={dialogButtonStyle("primary")} onClick={() => onChoice("download")}>
        {unusableDownloadLabel(unusable)}
      </button>
      <div style={DIALOG_MUTED_STYLE}>{UNUSABLE_DOWNLOAD_NOTE}</div>
      <button type="button" style={dialogButtonStyle("quiet")} onClick={() => onChoice("cancel")}>
        Cancel
      </button>
    </div>
  </DesktopDialog>
);
