import { useEffect, useSyncExternalStore, type CSSProperties, type FC } from "react";
import { FaExclamationTriangle, FaGamepad } from "react-icons/fa";
import {
  usePlaytimeScopeState,
  setPlaytimeScopeState,
  fetchPlaytimeScopeState,
  PLAYTIME_SCOPE_TITLE,
  PLAYTIME_SCOPE_MESSAGE,
} from "../../utils/playtimeScopeStore";
import { isSessionActive } from "../../utils/sessionManager";
import { showToast } from "../../utils/toast";
import { BUTTON_STYLE, ACTIVE_SESSION_CARD_STYLE, PLAYTIME_SCOPE_CARD_STYLE } from "./styles";

export { PLAYTIME_SCOPE_TITLE, PLAYTIME_SCOPE_MESSAGE };

/** Title of the active session banner. */
export const ACTIVE_SESSION_DEFAULT_TITLE = "Active Session in Progress";

/** Body text alerting that a game session is active. */
export const ACTIVE_SESSION_DEFAULT_MESSAGE =
  "This game has an active session running. Cross-device playtime and save sync will be finalized once the session ends.";

export interface ActiveSessionBannerProps {
  compact?: boolean | undefined;
  title?: string | undefined;
  message?: string | undefined;
}

const ACTIVE_SESSION_STANDARD_STYLE: CSSProperties = {
  ...ACTIVE_SESSION_CARD_STYLE,
  display: "flex",
  flexDirection: "row",
  alignItems: "flex-start",
  gap: "16px",
  padding: "18px 20px",
  textAlign: "left",
};

const ACTIVE_SESSION_COMPACT_STYLE: CSSProperties = {
  ...ACTIVE_SESSION_CARD_STYLE,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "12px",
  padding: "16px",
  textAlign: "center",
};

const ACTIVE_SESSION_STANDARD_ICON_STYLE: CSSProperties = {
  color: "#3898ec",
  fontSize: "28px",
  minWidth: "28px",
  flexShrink: 0,
  marginTop: "2px",
};

const ACTIVE_SESSION_COMPACT_ICON_STYLE: CSSProperties = {
  color: "#3898ec",
  fontSize: "22px",
  minWidth: "22px",
  flexShrink: 0,
  marginTop: 0,
};

const ACTIVE_SESSION_DOT_STYLE: CSSProperties = {
  display: "inline-block",
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  backgroundColor: "#3898ec",
  boxShadow: "0 0 8px #3898ec",
};

const PLAYTIME_SCOPE_STANDARD_STYLE: CSSProperties = {
  ...PLAYTIME_SCOPE_CARD_STYLE,
  display: "flex",
  flexDirection: "row",
  alignItems: "flex-start",
  gap: "16px",
  padding: "18px 20px",
  textAlign: "left",
};

const PLAYTIME_SCOPE_COMPACT_STYLE: CSSProperties = {
  ...PLAYTIME_SCOPE_CARD_STYLE,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "12px",
  padding: "16px",
  textAlign: "center",
};

const PLAYTIME_SCOPE_STANDARD_ICON_STYLE: CSSProperties = {
  color: "#d4a72c",
  fontSize: "28px",
  minWidth: "28px",
  flexShrink: 0,
  marginTop: "2px",
};

const PLAYTIME_SCOPE_COMPACT_ICON_STYLE: CSSProperties = {
  color: "#d4a72c",
  fontSize: "22px",
  minWidth: "22px",
  flexShrink: 0,
  marginTop: 0,
};

const OPEN_CONNECTIONS_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  backgroundColor: "rgba(212, 167, 44, 0.15)",
  borderColor: "rgba(212, 167, 44, 0.4)",
  color: "#e2bf58",
};

const BANNER_CONTENT_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  flex: 1,
  minWidth: 0,
};

/**
 * Polished desktop card alerting the user to an active session for the current game.
 * Styled with desktop client typography, glassmorphism, and a glowing blue active status indicator.
 */
export const ActiveSessionBanner: FC<ActiveSessionBannerProps> = ({
  compact = false,
  title = ACTIVE_SESSION_DEFAULT_TITLE,
  message = ACTIVE_SESSION_DEFAULT_MESSAGE,
}) => {
  return (
    <div
      role="region"
      aria-label="Active Game Session"
      data-testid="desktop-active-session-banner"
      className="tender-desktop-card tender-desktop-active-session-card"
      style={compact ? ACTIVE_SESSION_COMPACT_STYLE : ACTIVE_SESSION_STANDARD_STYLE}
    >
      <FaGamepad
        style={compact ? ACTIVE_SESSION_COMPACT_ICON_STYLE : ACTIVE_SESSION_STANDARD_ICON_STYLE}
        aria-hidden="true"
      />
      <div style={BANNER_CONTENT_STYLE}>
        <div
          className="tender-desktop-active-session-title"
          style={{
            fontSize: compact ? "14px" : "16px",
            fontWeight: 600,
            color: "rgba(255, 255, 255, 0.95)",
            letterSpacing: "-0.01em",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            justifyContent: compact ? "center" : "flex-start",
          }}
        >
          <span>{title}</span>
          <span style={ACTIVE_SESSION_DOT_STYLE} title="Session active" />
        </div>
        <div
          className="tender-desktop-active-session-message"
          style={{
            fontSize: compact ? "12px" : "13px",
            color: "rgba(255, 255, 255, 0.75)",
            lineHeight: 1.5,
          }}
        >
          {message}
        </div>
      </div>
    </div>
  );
};

export interface PlaytimeScopeCardProps {
  compact?: boolean | undefined;
  title?: string | undefined;
  message?: string | undefined;
  onOpenConnections?: (() => void) | undefined;
  onDismiss?: (() => void) | undefined;
}

/**
 * Warning card shown on desktop when the client API token lacks the `roms.user.read`
 * scope needed for cross-device playtime sync. Matches desktop client design conventions.
 */
export const PlaytimeScopeCard: FC<PlaytimeScopeCardProps> = ({
  compact = false,
  title = PLAYTIME_SCOPE_TITLE,
  message = PLAYTIME_SCOPE_MESSAGE,
  onOpenConnections,
  onDismiss,
}) => {
  const handleDismiss = () => {
    setPlaytimeScopeState({ pending: false });
    onDismiss?.();
  };

  const handleOpenConnections = () => {
    if (onOpenConnections) {
      onOpenConnections();
    } else {
      showToast("Open Settings in Big Picture mode to configure RomM connections.");
    }
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="desktop-playtime-scope-banner"
      className="tender-desktop-card tender-desktop-playtime-scope-card tender-desktop-warning-card"
      style={compact ? PLAYTIME_SCOPE_COMPACT_STYLE : PLAYTIME_SCOPE_STANDARD_STYLE}
    >
      <FaExclamationTriangle
        style={compact ? PLAYTIME_SCOPE_COMPACT_ICON_STYLE : PLAYTIME_SCOPE_STANDARD_ICON_STYLE}
        aria-hidden="true"
      />
      <div style={BANNER_CONTENT_STYLE}>
        <div
          className="tender-desktop-playtime-scope-title"
          style={{
            fontSize: compact ? "14px" : "16px",
            fontWeight: 600,
            color: "rgba(255, 255, 255, 0.95)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </div>
        <div
          className="tender-desktop-playtime-scope-message"
          style={{
            fontSize: compact ? "12px" : "13px",
            color: "rgba(255, 255, 255, 0.75)",
            lineHeight: 1.5,
          }}
        >
          {message}
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginTop: "6px",
            justifyContent: compact ? "center" : "flex-start",
          }}
        >
          <button
            type="button"
            className="tender-desktop-button"
            style={OPEN_CONNECTIONS_BUTTON_STYLE}
            onClick={handleOpenConnections}
          >
            Open Connections
          </button>
          <button type="button" className="tender-desktop-button" style={BUTTON_STYLE} onClick={handleDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export interface PlaytimeScopeBannerProps {
  appId?: number | undefined;
  romId?: number | null | undefined;
  compact?: boolean | undefined;
  onOpenConnections?: (() => void) | undefined;
  onDismiss?: (() => void) | undefined;
  scopeTitle?: string | undefined;
  scopeMessage?: string | undefined;
  sessionTitle?: string | undefined;
  sessionMessage?: string | undefined;
}

function subscribeSessionChanged(onStoreChange: () => void): () => void {
  globalThis.addEventListener("romm_session_changed", onStoreChange);
  return () => {
    globalThis.removeEventListener("romm_session_changed", onStoreChange);
  };
}

/**
 * Hook to subscribe to session activity for a given ROM ID.
 * Synchronizes with sessionManager and the global romm_session_changed event.
 */
export function useIsGameSessionActive(romId: number | null | undefined): boolean {
  return useSyncExternalStore(subscribeSessionChanged, () => (romId ? isSessionActive(romId) : false));
}

/**
 * Top-level Remote Play & Session Scope component for the desktop GameView.
 * Integrates both cross-device playtime token scope notifications and active game session alerts.
 */
export const PlaytimeScopeBanner: FC<PlaytimeScopeBannerProps> = ({
  appId: _appId,
  romId,
  compact = false,
  onOpenConnections,
  onDismiss,
  scopeTitle = PLAYTIME_SCOPE_TITLE,
  scopeMessage = PLAYTIME_SCOPE_MESSAGE,
  sessionTitle = ACTIVE_SESSION_DEFAULT_TITLE,
  sessionMessage = ACTIVE_SESSION_DEFAULT_MESSAGE,
}) => {
  const scope = usePlaytimeScopeState();
  const sessionActive = useIsGameSessionActive(romId);

  useEffect(() => {
    fetchPlaytimeScopeState().catch(() => {});
  }, []);

  if (!scope.pending && !sessionActive) {
    return null;
  }

  return (
    <div
      className="tender-desktop-scope-banners-container"
      data-testid="desktop-scope-banners-container"
      style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%", marginBottom: "16px" }}
    >
      {scope.pending && (
        <PlaytimeScopeCard
          compact={compact}
          title={scopeTitle}
          message={scopeMessage}
          onOpenConnections={onOpenConnections}
          onDismiss={onDismiss}
        />
      )}
      {sessionActive && <ActiveSessionBanner compact={compact} title={sessionTitle} message={sessionMessage} />}
    </div>
  );
};
