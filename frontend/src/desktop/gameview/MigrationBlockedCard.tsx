import type { CSSProperties, FC } from "react";
import { FaExclamationTriangle } from "react-icons/fa";
import { MIGRATION_BLOCKED_DEFAULT_TITLE, MIGRATION_BLOCKED_DEFAULT_MESSAGE } from "../../utils/migrationStore";
import { WARNING_CARD_STYLE } from "./styles";

export { MIGRATION_BLOCKED_DEFAULT_TITLE, MIGRATION_BLOCKED_DEFAULT_MESSAGE };

export interface MigrationBlockedCardProps {
  /** Compact mode for narrow contexts. */
  compact?: boolean;
  title?: string;
  message?: string;
}

const STANDARD_CARD_STYLE: CSSProperties = {
  ...WARNING_CARD_STYLE,
  display: "flex",
  flexDirection: "row",
  alignItems: "flex-start",
  gap: "16px",
  padding: "20px 24px",
  textAlign: "left",
};

const COMPACT_CARD_STYLE: CSSProperties = {
  ...WARNING_CARD_STYLE,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "12px",
  padding: "16px",
  textAlign: "center",
};

const STANDARD_ICON_STYLE: CSSProperties = {
  color: "#ffaa00",
  fontSize: "32px",
  minWidth: "32px",
  flexShrink: 0,
  marginTop: "2px",
};

const COMPACT_ICON_STYLE: CSSProperties = {
  color: "#ffaa00",
  fontSize: "24px",
  minWidth: "24px",
  flexShrink: 0,
  marginTop: 0,
};

const CONTENT_CONTAINER_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  flex: 1,
  minWidth: 0,
};

const STANDARD_TITLE_STYLE: CSSProperties = {
  fontSize: "17px",
  fontWeight: 600,
  color: "rgba(255, 255, 255, 0.95)",
  letterSpacing: "-0.01em",
};

const COMPACT_TITLE_STYLE: CSSProperties = {
  fontSize: "15px",
  fontWeight: 600,
  color: "rgba(255, 255, 255, 0.95)",
  letterSpacing: "-0.01em",
};

const STANDARD_MESSAGE_STYLE: CSSProperties = {
  fontSize: "13px",
  color: "rgba(255, 255, 255, 0.75)",
  lineHeight: 1.5,
};

const COMPACT_MESSAGE_STYLE: CSSProperties = {
  fontSize: "12px",
  color: "rgba(255, 255, 255, 0.75)",
  lineHeight: 1.5,
};

/**
 * Polished warning card shown on the desktop game view when a RetroDECK migration is pending.
 * Matches desktop client conventions with desktop typography, glassmorphism, and an amber alert accent.
 */
export const MigrationBlockedCard: FC<MigrationBlockedCardProps> = ({
  compact = false,
  title = MIGRATION_BLOCKED_DEFAULT_TITLE,
  message = MIGRATION_BLOCKED_DEFAULT_MESSAGE,
}) => {
  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="desktop-migration-blocked-card"
      className="tender-desktop-card tender-desktop-migration-card tender-desktop-warning-card"
      style={compact ? COMPACT_CARD_STYLE : STANDARD_CARD_STYLE}
    >
      <FaExclamationTriangle style={compact ? COMPACT_ICON_STYLE : STANDARD_ICON_STYLE} aria-hidden="true" />
      <div style={CONTENT_CONTAINER_STYLE}>
        <div className="tender-desktop-migration-title" style={compact ? COMPACT_TITLE_STYLE : STANDARD_TITLE_STYLE}>
          {title}
        </div>
        <div
          className="tender-desktop-migration-message"
          style={compact ? COMPACT_MESSAGE_STYLE : STANDARD_MESSAGE_STYLE}
        >
          {message}
        </div>
      </div>
    </div>
  );
};
