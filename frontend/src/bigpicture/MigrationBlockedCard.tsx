import { FC } from "react";
import { WarningCard } from "./WarningCard";
import { MIGRATION_BLOCKED_DEFAULT_TITLE, MIGRATION_BLOCKED_DEFAULT_MESSAGE } from "../utils/migrationStore";

interface MigrationBlockedCardProps {
  /** Compact mode for narrow contexts (QAM panel). */
  compact?: boolean;
}

/** Polished warning card shown on the game detail page when a RetroDECK migration is pending. */
export const MigrationBlockedCard: FC<MigrationBlockedCardProps> = ({ compact = false }) => (
  <WarningCard title={MIGRATION_BLOCKED_DEFAULT_TITLE} message={MIGRATION_BLOCKED_DEFAULT_MESSAGE} compact={compact} />
);
