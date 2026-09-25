/**
 * The desktop client's comparison dialog: what is already on the device beside
 * what the server would send, with the content check on a button and three
 * exits — use what is there, download instead, or cancel. Big Picture's
 * `AdoptExistingModal` is the other drawing of the same dialog; the words are
 * both surfaces' (`utils/adoptWording.ts`).
 *
 * Downloading is the only destructive exit, so it takes a second confirmation
 * inside this dialog, with the comparison still on screen above it.
 */

import { useEffect, useState, type FC } from "react";
import { addEventListener, removeEventListener } from "../../../api/host";
import { debugLog, verifyExistingContent } from "../../../api/backend";
import {
  EXISTING_TITLE,
  VERIFY_UNREACHABLE_MESSAGE,
  adoptButtonLabel,
  existingIntro,
  existingSize,
  incomingSize,
  lastChangedLine,
  renameNotice,
  replaceWarning,
  sizeVerdict,
  verifyProgressLabel,
} from "../../../utils/adoptWording";
import type { AdoptChoice } from "../../../utils/adoptFlow";
import { detach } from "../../../utils/detach";
import type { TargetOccupiedResult, VerifyContentResult, VerifyProgressEvent } from "../../../types";
import {
  DIALOG_ACTIONS_STYLE,
  DIALOG_MUTED_STYLE,
  DIALOG_TEXT_STYLE,
  DIALOG_VALUE_STYLE,
  DesktopDialog,
  dialogButtonStyle,
} from "./DesktopDialog";

export interface DesktopAdoptExistingDialogProps {
  romId: number;
  occupied: TargetOccupiedResult;
  /** Set when `occupied` describes a candidate elsewhere in the platform folder; the content check runs against it. */
  candidatePath?: string | undefined;
  onChoice: (choice: AdoptChoice) => void;
}

const VERIFY_COLORS: Record<VerifyContentResult["status"], string> = {
  match: "#5ba32b",
  mismatch: "#ff6b6b",
  unverifiable: "#8f98a0",
  missing: "#ff6b6b",
  error: "#ff6b6b",
};

const SIDE_STYLE = {
  padding: "10px 12px",
  borderRadius: "4px",
  backgroundColor: "rgba(0, 0, 0, 0.25)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  display: "flex",
  flexDirection: "column" as const,
  gap: "2px",
  minWidth: 0,
  overflowWrap: "anywhere" as const,
};

export const DesktopAdoptExistingDialog: FC<DesktopAdoptExistingDialogProps> = ({
  romId,
  occupied,
  candidatePath,
  onChoice,
}) => {
  const [verifying, setVerifying] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<VerifyContentResult | null>(null);
  const [confirmingReplace, setConfirmingReplace] = useState(false);

  useEffect(() => {
    const listener = addEventListener<VerifyProgressEvent>("verify_progress", (payload) => {
      if (payload.rom_id !== romId || !payload.bytes_total) return;
      setVerifyProgress(payload.bytes_done / payload.bytes_total);
    });
    return () => removeEventListener("verify_progress", listener);
  }, [romId]);

  const handleVerify = async () => {
    if (verifying) return;
    setVerifying(true);
    setVerdict(null);
    setVerifyProgress(0);
    try {
      setVerdict(await verifyExistingContent(romId, candidatePath ?? null));
    } catch (e) {
      detach(debugLog(`DesktopAdoptExistingDialog: verify failed: ${e}`));
      setVerdict({ status: "error", message: VERIFY_UNREACHABLE_MESSAGE, differences: [] });
    } finally {
      setVerifying(false);
      setVerifyProgress(null);
    }
  };

  const candidate = Boolean(candidatePath);
  const lastChanged = lastChangedLine(occupied);

  return (
    <DesktopDialog
      titleId="tender-desktop-adopt-existing-title"
      title={EXISTING_TITLE}
      onDismiss={() => onChoice("cancel")}
    >
      <div style={DIALOG_TEXT_STYLE}>{existingIntro(occupied, candidate)}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
        <div className="tender-desktop-adopt-existing-side" style={SIDE_STYLE}>
          <div style={DIALOG_MUTED_STYLE}>On this device</div>
          <div style={DIALOG_VALUE_STYLE}>{occupied.existing.name}</div>
          <div style={DIALOG_VALUE_STYLE}>{existingSize(occupied, candidate)}</div>
          {lastChanged && <div style={DIALOG_MUTED_STYLE}>{lastChanged}</div>}
        </div>
        <div className="tender-desktop-adopt-incoming-side" style={SIDE_STYLE}>
          <div style={DIALOG_MUTED_STYLE}>On the server</div>
          <div style={DIALOG_VALUE_STYLE}>{occupied.incoming.name}</div>
          <div style={DIALOG_VALUE_STYLE}>{incomingSize(occupied)}</div>
        </div>
      </div>
      <div style={{ ...DIALOG_TEXT_STYLE, color: "#ffffff" }}>{sizeVerdict(occupied, candidate)}</div>
      {candidate && <div style={DIALOG_TEXT_STYLE}>{renameNotice(occupied)}</div>}

      {verifying && (
        <div className="tender-desktop-adopt-verify-progress" style={DIALOG_TEXT_STYLE}>
          {verifyProgressLabel(verifyProgress)}
        </div>
      )}
      {!verifying && verdict && (
        <div className="tender-desktop-adopt-verify-verdict" style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: "13px", color: VERIFY_COLORS[verdict.status] }}>{verdict.message}</div>
          {verdict.differences.map((d) => (
            <div key={d.name} style={{ ...DIALOG_MUTED_STYLE, marginTop: "4px" }}>
              {d.name}: {d.detail}
            </div>
          ))}
        </div>
      )}

      {confirmingReplace ? (
        <div style={DIALOG_ACTIONS_STYLE}>
          <div className="tender-desktop-adopt-replace-warning" style={{ fontSize: "13px", color: "#ff6b6b" }}>
            {replaceWarning(occupied, candidate)}
          </div>
          <button type="button" style={dialogButtonStyle("danger")} onClick={() => onChoice("replace")}>
            Delete and Download
          </button>
          <button type="button" style={dialogButtonStyle("quiet")} onClick={() => setConfirmingReplace(false)}>
            Go Back
          </button>
        </div>
      ) : (
        <div style={DIALOG_ACTIONS_STYLE}>
          <button
            type="button"
            style={dialogButtonStyle("primary", !occupied.adoptable)}
            disabled={!occupied.adoptable}
            onClick={() => onChoice("adopt")}
          >
            {adoptButtonLabel(occupied)}
          </button>
          <button
            type="button"
            style={dialogButtonStyle("secondary", verifying)}
            disabled={verifying}
            onClick={() => detach(handleVerify())}
          >
            Check Against Server
          </button>
          <button type="button" style={dialogButtonStyle("secondary")} onClick={() => setConfirmingReplace(true)}>
            Download Instead
          </button>
          <button type="button" style={dialogButtonStyle("quiet")} onClick={() => onChoice("cancel")}>
            Cancel
          </button>
        </div>
      )}
    </DesktopDialog>
  );
};
