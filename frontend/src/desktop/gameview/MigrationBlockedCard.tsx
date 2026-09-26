import type { FC } from "react";
import { FaExclamationTriangle } from "react-icons/fa";
import { CARD_STYLE } from "./styles";

export const MIGRATION_BLOCKED_DEFAULT_TITLE = "RetroDECK Migration Required";
export const MIGRATION_BLOCKED_DEFAULT_MESSAGE =
  "Open the plugin QAM to migrate files or dismiss the migration before playing.";

export interface MigrationBlockedCardProps {
  /** Compact mode for narrow contexts. */
  compact?: boolean;
  title?: string;
  message?: string;
}

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
      style={{
        ...CARD_STYLE,
        display: "flex",
        flexDirection: compact ? "column" : "row",
        alignItems: compact ? "center" : "flex-start",
        gap: compact ? "12px" : "16px",
        background: "linear-gradient(135deg, rgba(255, 170, 0, 0.08) 0%, rgba(36, 40, 47, 0.75) 100%)",
        backgroundColor: "rgba(36, 40, 47, 0.75)",
        border: "1px solid rgba(255, 170, 0, 0.35)",
        borderLeft: "4px solid #ffaa00",
        borderRadius: "4px",
        padding: compact ? "16px" : "20px 24px",
        textAlign: compact ? "center" : "left",
      }}
    >
      <FaExclamationTriangle
        style={{
          color: "#ffaa00",
          fontSize: compact ? "24px" : "32px",
          minWidth: compact ? "24px" : "32px",
          flexShrink: 0,
          marginTop: compact ? 0 : "2px",
        }}
        aria-hidden="true"
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1, minWidth: 0 }}>
        <div
          className="tender-desktop-migration-title"
          style={{
            fontSize: compact ? "15px" : "17px",
            fontWeight: 600,
            color: "rgba(255, 255, 255, 0.95)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </div>
        <div
          className="tender-desktop-migration-message"
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
