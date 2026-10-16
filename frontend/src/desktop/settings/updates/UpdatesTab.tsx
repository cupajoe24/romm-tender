/**
 * The Tender Settings window's Updates tab: the QAM Settings page's Updates
 * section, drawn for the desktop client over the same state and handlers
 * (`useSettingsPage`), install hook (`useUpdateInstall`), and wording
 * (`utils/settingsWording.ts`).
 *
 * Implements:
 * - Version display rows (Installed, Available) with update color accents.
 * - Single-flight installer output dialog ("Show what the installer said").
 * - Install flow progress card, step status marks, and progress bar.
 * - Daily check toggle using SettingsToggle (Field + Toggle, never ToggleField).
 * - "Check now" action button.
 * - Desktop dwell tracking via useSeenAfterDwell(true, "desktop") (Decision D12).
 */

import { useEffect, useReducer, type FC, type ReactNode } from "react";
import { DialogButton, Field, ProgressBar } from "@decky/ui";
import { NOT_INSTALLED_PROGRAM, availableNewer, availableValue } from "../../../utils/updateAvailableView";
import {
  INSTALL_STATE_UNREAD,
  SHOW_OUTPUT,
  STEP_MARKS,
  STEP_TONES,
  WAITING_FOR,
  buttonLabel,
  installButtonShown,
  installStateUnread,
  installSteps,
  namesStatusUnread,
  pausedDownloadsHint,
  shownBlock,
  waitReasonLines,
  type BlockNote,
} from "../../../utils/updateInstallView";
import { useUpdateInstall, type UpdateInstall } from "../../../utils/useUpdateInstall";
import { useSeenAfterDwell } from "../../../utils/updateDot";
import {
  AVAILABLE_VERSION_LABEL,
  CHECK_NOW_LABEL,
  CHECKING_NOW_LABEL,
  DAILY_CHECK_DESCRIPTION,
  DAILY_CHECK_LABEL,
  INSTALLED_VERSION_LABEL,
  UPDATES_HEADING,
} from "../../../utils/settingsWording";
import { useSettingsPage, type SettingsPageState } from "../../../utils/useSettingsPage";
import { useDialogHost } from "../../gameview/dialogs/useDialogHost";
import { SectionHeading } from "../SectionHeading";
import { SettingsToggle } from "../SettingsToggle";
import { desktopSettingsPrompts } from "../settingsPrompts";
import {
  AMBER,
  BLUE,
  BUTTON_ROW_STYLE,
  BUTTON_STYLE,
  GREEN,
  MUTED,
  MUTED_TEXT_STYLE,
  RED,
  SECTION_STYLE,
  SETTING_CARD_STYLE,
  TEXT,
  noticeCardStyle,
} from "../settingsStyles";
import { DesktopUpdateOutputDialog } from "./DesktopUpdateOutputDialog";

const STEP_COLORS = {
  success: GREEN,
  accent: BLUE,
  muted: MUTED,
  danger: RED,
  warning: AMBER,
  default: TEXT,
};

function renderBlockNote(note: string | BlockNote | null | undefined): ReactNode {
  if (!note) return null;
  if (typeof note === "string") return note;
  return <span style={note.tone === "warning" ? { color: AMBER, fontWeight: 600 } : undefined}>{note.text}</span>;
}

interface UpdatesControlsProps {
  readonly state: SettingsPageState;
  readonly install: UpdateInstall;
  readonly onOpenOutput: (rolledBackAt: string | null, version: string) => void;
}

const UpdatesControlsSection: FC<UpdatesControlsProps> = ({ state, install, onOpenOutput }) => {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!install.underWay) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [install.underWay]);

  const earlier = state.update.currentVersion || "the earlier version";
  const block = shownBlock(install, state.updateOutcome.failure, earlier);
  const showButton = installButtonShown(install);
  const pausedHint = pausedDownloadsHint(install.pausedDownloads);
  const waiting = !install.underWay && install.waitReasons.length > 0;
  const waitLines = install.waitReasons.flatMap(waitReasonLines);
  const inlineWait = waitLines.length === 1 && !install.waitReasons.some(namesStatusUnread) ? waitLines[0] : null;
  const unread = installStateUnread(install);

  return (
    <section style={SECTION_STYLE}>
      <SectionHeading title={UPDATES_HEADING} />

      <Field label={INSTALLED_VERSION_LABEL}>
        <span data-testid="updates-installed">{state.update.currentVersion || "—"}</span>
      </Field>

      <Field
        label={AVAILABLE_VERSION_LABEL}
        {...(!showButton && unread
          ? { description: <span data-testid="updates-install-unread">{INSTALL_STATE_UNREAD}</span> }
          : {})}
      >
        <span
          data-testid="updates-available"
          style={availableNewer(state.update) ? { color: GREEN, fontWeight: 600 } : undefined}
        >
          {availableValue(state.update)}
        </span>
      </Field>

      {!state.update.installedProgram && (
        <Field label={<span data-testid="updates-not-installed">{NOT_INSTALLED_PROGRAM}</span>} />
      )}

      {showButton && (
        <div style={{ margin: "10px 0" }}>
          {waiting && (
            <div data-testid="updates-waiting" style={MUTED_TEXT_STYLE}>
              {inlineWait !== null ? (
                <>
                  {`${WAITING_FOR} `}
                  <span data-testid="updates-wait-reason">{inlineWait}</span>
                </>
              ) : (
                <>
                  <div>{WAITING_FOR}</div>
                  {waitLines.map((line) => (
                    <div key={line} data-testid="updates-wait-reason">
                      {line}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          {pausedHint && (
            <div data-testid="updates-paused-hint" style={MUTED_TEXT_STYLE}>
              {pausedHint}
            </div>
          )}
          {install.refusal && (
            <div data-testid="updates-install-refusal" style={{ ...MUTED_TEXT_STYLE, color: AMBER }}>
              {install.refusal}
            </div>
          )}
          {unread && (
            <div data-testid="updates-install-unread" style={MUTED_TEXT_STYLE}>
              {INSTALL_STATE_UNREAD}
            </div>
          )}
          <div style={BUTTON_ROW_STYLE}>
            <DialogButton
              style={BUTTON_STYLE}
              onClick={install.install}
              disabled={
                install.pressing || install.underWay || install.waitReasons.length > 0 || install.version === null
              }
            >
              {buttonLabel(install)}
            </DialogButton>
          </div>
        </div>
      )}

      {block && (
        <div style={block.failed ? noticeCardStyle(AMBER) : SETTING_CARD_STYLE}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              width: "100%",
            }}
          >
            <span
              data-testid="updates-caption"
              style={block.failed ? { fontWeight: 700, color: AMBER } : { fontWeight: 600, color: TEXT }}
            >
              {block.caption}
            </span>
            <span
              data-testid="updates-elapsed"
              style={{ color: MUTED, fontVariantNumeric: "tabular-nums", fontSize: "12px" }}
            >
              {block.aside}
            </span>
          </div>

          {block.percent !== undefined && (
            <div style={{ width: "100%", margin: "8px 0" }}>
              <ProgressBar
                indeterminate={block.percent === null}
                {...(block.percent !== null ? { nProgress: block.percent } : {})}
              />
            </div>
          )}

          {block.at && (
            <div
              style={{
                fontSize: "12px",
                display: "flex",
                flexWrap: "wrap",
                gap: "4px 16px",
                margin: "8px 0",
              }}
            >
              {installSteps(block.at, block.failed).map(({ id, label, status }) => (
                <span key={id} data-testid={`updates-step-${id}`} data-status={status}>
                  <span style={{ color: STEP_COLORS[STEP_TONES[status]], fontWeight: 600 }}>{STEP_MARKS[status]}</span>{" "}
                  {label}
                </span>
              ))}
            </div>
          )}

          {block.note && (
            <div data-testid="updates-note" style={MUTED_TEXT_STYLE}>
              {renderBlockNote(block.note)}
            </div>
          )}

          {block.output && (
            <div style={BUTTON_ROW_STYLE}>
              <DialogButton
                style={BUTTON_STYLE}
                onClick={() => {
                  if (block.output) {
                    onOpenOutput(block.output.rolledBackAt, block.output.version);
                  }
                }}
              >
                {SHOW_OUTPUT}
              </DialogButton>
            </div>
          )}
        </div>
      )}

      <SettingsToggle
        label={DAILY_CHECK_LABEL}
        description={DAILY_CHECK_DESCRIPTION}
        checked={state.update.enabled}
        onChange={state.changeUpdateCheckEnabled}
      />

      <div style={BUTTON_ROW_STYLE}>
        <DialogButton
          style={BUTTON_STYLE}
          onClick={() => {
            if (!install.underWay) state.checkForUpdateNow();
          }}
          disabled={state.checkingForUpdate || install.underWay}
        >
          {state.checkingForUpdate ? CHECKING_NOW_LABEL : CHECK_NOW_LABEL}
        </DialogButton>
      </div>

      {state.updateCheckResult && (
        <div role="status" data-testid="updates-result" style={MUTED_TEXT_STYLE}>
          {state.updateCheckResult}
        </div>
      )}
    </section>
  );
};

export const UpdatesTab: FC = () => {
  useSeenAfterDwell(true, "desktop");
  const dialogs = useDialogHost();
  const state = useSettingsPage(desktopSettingsPrompts(dialogs.ask));
  const install = useUpdateInstall();

  const handleOpenOutput = (rolledBackAt: string | null, version: string) => {
    void dialogs.ask(undefined, (resolve) => (
      <DesktopUpdateOutputDialog rolledBackAt={rolledBackAt} version={version} onClose={() => resolve(undefined)} />
    ));
  };

  return (
    <div data-testid="tender-settings-updates">
      <UpdatesControlsSection state={state} install={install} onOpenOutput={handleOpenOutput} />
      {dialogs.element}
    </div>
  );
};
