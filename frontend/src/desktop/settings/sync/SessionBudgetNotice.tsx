/**
 * The session-budget card on the desktop's Sync tab: paused, or Steam's memory
 * high after a run, with Restart Steam now. What it says and when it shows are
 * `utils/sessionBudget.ts`'s; the restart is refused while a game runs.
 */

import type { FC } from "react";
import { DialogButton } from "@decky/ui";
import { isAnyAppRunning } from "../../../utils/runningApps";
import {
  RESTART_BLOCKED_BY_GAME,
  RESTART_STEAM_LABEL,
  sessionBudgetCard,
  type SessionBudgetCard,
} from "../../../utils/sessionBudget";
import { restartSteam } from "../../../utils/steamRestart";
import type { SyncPageState } from "../../../utils/useSyncPage";
import { AMBER, BLUE, BUTTON_STYLE, MUTED_TEXT_STYLE, noticeCardStyle } from "../settingsStyles";

const ACCENT: Record<SessionBudgetCard["kind"], string> = { paused: BLUE, "high-heap": AMBER };

export const SessionBudgetNotice: FC<{ state: SyncPageState }> = ({ state }) => {
  const card = sessionBudgetCard({
    lastAttemptStatus: state.stats?.last_attempt?.status,
    syncButton: state.primaryAction,
    rssKb: state.budget?.rss_kb ?? null,
    resumeReady: state.budget?.resume_ready ?? null,
    runDoneItems: state.budget?.run_done_items ?? null,
    runTotalItems: state.budget?.run_total_items ?? null,
  });
  if (card === null) return null;
  const accent = ACCENT[card.kind];
  const gameRunning = isAnyAppRunning();
  return (
    <div data-testid={`budget-${card.kind}`} style={noticeCardStyle(accent)}>
      <div style={{ fontWeight: 700, color: accent, marginBottom: "4px" }}>{card.title}</div>
      <div>{card.body}</div>
      {card.offersRestart && (
        <>
          <DialogButton style={{ ...BUTTON_STYLE, marginTop: "10px" }} disabled={gameRunning} onClick={restartSteam}>
            {RESTART_STEAM_LABEL}
          </DialogButton>
          {gameRunning && <div style={MUTED_TEXT_STYLE}>{RESTART_BLOCKED_BY_GAME}</div>}
        </>
      )}
    </div>
  );
};
