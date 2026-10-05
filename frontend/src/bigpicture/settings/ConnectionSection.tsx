/**
 * RomM server connection settings — URL, account sign-in/token, and SSL toggle.
 * Pure renderer: the parent owns the field values, the has-token flag, the
 * status string, and the save/sign-in logic. The QAM connection row probes the
 * server automatically, so there is no manual test affordance here.
 *
 * It is one group of the Settings page's Connections section, and its title
 * names the SERVICE rather than the section: SteamGridDB is the other service
 * on that pane and both are connections.
 */

import { FC } from "react";
import {
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  ConfirmModal,
  DialogButton,
  Field,
  showModal,
  ToggleField,
} from "@decky/ui";
import { TextInputModal } from "./TextInputModal";
import { ConnectModal } from "./ConnectModal";
import { CustomHeadersModal } from "./CustomHeadersModal";
import { isHttpsUrl } from "../../utils/serverUrl";
import type { SignInResult } from "../../utils/rommSignIn";
import type { SaveHeadersResult } from "../../utils/customHeaders";
import {
  CUSTOM_HEADERS_LABEL,
  EDIT_LABEL,
  INSECURE_SSL_DESCRIPTION,
  INSECURE_SSL_LABEL,
  ROMM_ACCOUNT_LABEL,
  ROMM_HEADING,
  ROMM_URL_LABEL,
  ROMM_URL_UNSET,
  SIGN_OUT_CONFIRM,
  SIGN_OUT_DESCRIPTION,
  SIGN_OUT_LABEL,
  accountState,
  customHeadersSummary,
  signInButtonLabel,
} from "../../utils/settingsWording";
import type { CustomHeaderEntry } from "../../types";

interface ConnectionSectionProps {
  url: string;
  hasToken: boolean;
  allowInsecureSsl: boolean;
  status: string;
  /** Names of the configured proxy headers — values never reach the frontend. */
  customHeaderNames: string[];
  onUrlChange: (value: string) => void;
  onSaveCustomHeaders: (headers: CustomHeaderEntry[]) => Promise<SaveHeadersResult>;
  onConnect: (username: string, password: string) => Promise<SignInResult>;
  onConnectToken: (token: string) => Promise<SignInResult>;
  onConnectPairing: (code: string) => Promise<SignInResult>;
  onAllowInsecureSslChange: (value: boolean) => void;
  onSignOut: () => void;
}

export const ConnectionSection: FC<ConnectionSectionProps> = ({
  url,
  hasToken,
  allowInsecureSsl,
  status,
  customHeaderNames,
  onUrlChange,
  onSaveCustomHeaders,
  onConnect,
  onConnectToken,
  onConnectPairing,
  onAllowInsecureSslChange,
  onSignOut,
}) => {
  return (
    <PanelSection title={ROMM_HEADING}>
      <PanelSectionRow>
        <Field label={ROMM_URL_LABEL} description={url || ROMM_URL_UNSET}>
          <DialogButton
            style={{ minWidth: "auto", width: "auto" }}
            onClick={() =>
              showModal(<TextInputModal label={ROMM_URL_LABEL} value={url} field="url" onSubmit={onUrlChange} />)
            }
          >
            {EDIT_LABEL}
          </DialogButton>
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field label={CUSTOM_HEADERS_LABEL} description={customHeadersSummary(customHeaderNames.length)}>
          <DialogButton
            style={{ minWidth: "auto", width: "auto" }}
            onClick={() =>
              showModal(<CustomHeadersModal storedNames={customHeaderNames} onSave={onSaveCustomHeaders} />)
            }
          >
            {EDIT_LABEL}
          </DialogButton>
        </Field>
      </PanelSectionRow>
      <PanelSectionRow>
        <Field label={ROMM_ACCOUNT_LABEL} description={accountState(hasToken)}>
          <DialogButton
            style={{ minWidth: "auto", width: "auto" }}
            onClick={() =>
              showModal(
                <ConnectModal
                  onConnect={onConnect}
                  onConnectToken={onConnectToken}
                  onConnectPairing={onConnectPairing}
                />,
              )
            }
          >
            {signInButtonLabel(hasToken)}
          </DialogButton>
        </Field>
      </PanelSectionRow>
      {hasToken && (
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            description={SIGN_OUT_DESCRIPTION}
            onClick={() =>
              showModal(
                <ConfirmModal
                  strTitle={SIGN_OUT_CONFIRM.title}
                  strDescription={SIGN_OUT_CONFIRM.description}
                  strOKButtonText={SIGN_OUT_CONFIRM.confirm}
                  strCancelButtonText={SIGN_OUT_CONFIRM.cancel}
                  onOK={onSignOut}
                />,
              )
            }
          >
            {SIGN_OUT_LABEL}
          </ButtonItem>
        </PanelSectionRow>
      )}
      {isHttpsUrl(url) && (
        <PanelSectionRow>
          <ToggleField
            label={INSECURE_SSL_LABEL}
            description={INSECURE_SSL_DESCRIPTION}
            checked={allowInsecureSsl}
            onChange={onAllowInsecureSslChange}
          />
        </PanelSectionRow>
      )}
      {status && (
        <PanelSectionRow>
          {/* Focusable because the pane scrolls by moving focus and this line
              is not the last thing on it — the SteamGridDB group follows, so a
              reader walking down would step straight over the answer to the
              sign-in they just made. */}
          <Field label={status} focusable={true} />
        </PanelSectionRow>
      )}
    </PanelSection>
  );
};
