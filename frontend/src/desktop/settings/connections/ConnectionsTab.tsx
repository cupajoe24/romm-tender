/**
 * The Tender Settings window's Connections tab: the QAM Settings page's
 * Connections section, drawn for the desktop client over the same state and
 * handlers (`useSettingsPage`) and the same words (`utils/settingsWording.ts`).
 *
 * The RomM URL is edited in its row and saved only by its Save button, which is
 * there only while the field differs from the stored URL (D7). Sign-in, the
 * custom headers and the SteamGridDB key validate before they save, so each is
 * a dialog, drawn in the window's own document (`useDialogHost`), as is the
 * sign-out confirm. Sign out is last in its group.
 */

import { useState, type FC } from "react";
import { DialogButton, Field, TextField, ToggleField } from "@decky/ui";
import { verifySgdbApiKey } from "../../../api/backend";
import { detach } from "../../../utils/detach";
import { isHttpsUrl, trimServerUrl } from "../../../utils/serverUrl";
import {
  CUSTOM_HEADERS_LABEL,
  EDIT_LABEL,
  INSECURE_SSL_DESCRIPTION,
  INSECURE_SSL_LABEL,
  ROMM_ACCOUNT_LABEL,
  ROMM_HEADING,
  ROMM_URL_LABEL,
  SAVE_LABEL,
  SGDB_HEADING,
  SGDB_KEY_LABEL,
  SIGN_OUT_CONFIRM,
  SIGN_OUT_DESCRIPTION,
  SIGN_OUT_LABEL,
  accountState,
  customHeadersSummary,
  sgdbKeyState,
  signInButtonLabel,
} from "../../../utils/settingsWording";
import { useSettingsPage, type SettingsPageState } from "../../../utils/useSettingsPage";
import { DesktopConfirmDialog } from "../../gameview/dialogs/DesktopConfirmDialog";
import { useDialogHost, type AskDialog } from "../../gameview/dialogs/useDialogHost";
import { SectionHeading } from "../SectionHeading";
import { desktopSettingsPrompts } from "../settingsPrompts";
import { BUTTON_ROW_STYLE, BUTTON_STYLE, MUTED_TEXT_STYLE, SECTION_STYLE } from "../settingsStyles";
import { CustomHeadersDialog } from "./CustomHeadersDialog";
import { SgdbKeyDialog } from "./SgdbKeyDialog";
import { SignInDialog } from "./SignInDialog";

const ROW_BUTTON_STYLE = { ...BUTTON_STYLE, minWidth: "90px" };
const INLINE_BUTTON_STYLE = { width: "auto", minWidth: "90px", marginLeft: "8px" };

const UrlRow: FC<{ state: SettingsPageState }> = ({ state }) => {
  const [draft, setDraft] = useState(state.url);
  const differs = trimServerUrl(draft) !== state.url;
  // Save rides the field's own inline controls, which Steam draws in the
  // input's row, rather than a row of Tender's beside a field whose box also
  // holds its label and padding.
  return (
    <TextField
      label={ROMM_URL_LABEL}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      inlineControls={
        differs ? (
          <DialogButton style={INLINE_BUTTON_STYLE} onClick={() => state.saveUrl(draft)}>
            {SAVE_LABEL}
          </DialogButton>
        ) : undefined
      }
    />
  );
};

const RommSection: FC<{ state: SettingsPageState; ask: AskDialog }> = ({ state, ask }) => {
  const editHeaders = () =>
    detach(
      ask(undefined, (close) => (
        <CustomHeadersDialog
          storedNames={state.customHeaderNames}
          save={state.saveCustomHeaders}
          onClose={() => close(undefined)}
        />
      )),
    );
  const openSignIn = () =>
    detach(ask(undefined, (close) => <SignInDialog signIn={state.signIn} onClose={() => close(undefined)} />));
  const confirmSignOut = async () => {
    const confirmed = await ask(false, (resolve) => (
      <DesktopConfirmDialog
        titleId="tender-settings-sign-out-title"
        title={SIGN_OUT_CONFIRM.title}
        description={SIGN_OUT_CONFIRM.description}
        confirmLabel={SIGN_OUT_CONFIRM.confirm}
        cancelLabel={SIGN_OUT_CONFIRM.cancel}
        tone="danger"
        onChoice={resolve}
      />
    ));
    if (confirmed) state.signOut();
  };

  return (
    <section style={SECTION_STYLE}>
      <SectionHeading title={ROMM_HEADING} />
      {/* Keyed on the stored URL, which arrives after the first render and is
          stored trimmed: a new one starts the field over from it. */}
      <UrlRow key={state.url} state={state} />
      <Field label={CUSTOM_HEADERS_LABEL} description={customHeadersSummary(state.customHeaderNames.length)}>
        <DialogButton style={ROW_BUTTON_STYLE} onClick={editHeaders}>
          {EDIT_LABEL}
        </DialogButton>
      </Field>
      <Field label={ROMM_ACCOUNT_LABEL} description={accountState(state.hasToken)}>
        <DialogButton style={ROW_BUTTON_STYLE} onClick={openSignIn}>
          {signInButtonLabel(state.hasToken)}
        </DialogButton>
      </Field>
      {isHttpsUrl(state.url) && (
        <ToggleField
          label={INSECURE_SSL_LABEL}
          description={INSECURE_SSL_DESCRIPTION}
          checked={state.allowInsecureSsl}
          onChange={state.setAllowInsecureSsl}
        />
      )}
      {state.status && (
        <div role="status" style={MUTED_TEXT_STYLE}>
          {state.status}
        </div>
      )}
      {state.hasToken && (
        <>
          <div style={BUTTON_ROW_STYLE}>
            <DialogButton style={BUTTON_STYLE} onClick={() => detach(confirmSignOut())}>
              {SIGN_OUT_LABEL}
            </DialogButton>
          </div>
          <div style={MUTED_TEXT_STYLE}>{SIGN_OUT_DESCRIPTION}</div>
        </>
      )}
    </section>
  );
};

const SteamGridDBSection: FC<{ state: SettingsPageState; ask: AskDialog }> = ({ state, ask }) => {
  const editKey = () =>
    detach(
      ask(undefined, (close) => (
        <SgdbKeyDialog steps={{ verify: verifySgdbApiKey, save: state.saveSgdbKey }} onClose={() => close(undefined)} />
      )),
    );
  return (
    <section style={SECTION_STYLE}>
      <SectionHeading title={SGDB_HEADING} />
      <Field label={SGDB_KEY_LABEL} description={sgdbKeyState(state.sgdbApiKey)}>
        <DialogButton style={ROW_BUTTON_STYLE} onClick={editKey}>
          {EDIT_LABEL}
        </DialogButton>
      </Field>
    </section>
  );
};

export const ConnectionsTab: FC = () => {
  const dialogs = useDialogHost();
  const state = useSettingsPage(desktopSettingsPrompts(dialogs.ask));
  return (
    <div data-testid="tender-settings-connections">
      <RommSection state={state} ask={dialogs.ask} />
      <SteamGridDBSection state={state} ask={dialogs.ask} />
      {dialogs.element}
    </div>
  );
};
