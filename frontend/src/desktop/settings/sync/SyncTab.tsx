/**
 * The Tender Settings window's Sync tab: the QAM's Sync page, drawn for the
 * desktop client over the same state (`useSyncPage`), words and decisions.
 *
 * One column, because the window's content area scrolls as a whole: first the
 * one thing the tab leads with — the run in flight, the pending preview, or the
 * button that starts one, in that order of authority — then the controls. The
 * session-budget card sits above it while no run is in flight, as on the QAM
 * page: a paused `last_attempt` survives into the resume that clears it.
 *
 * Force Full Sync's confirm is drawn in the window's own document
 * (`useDialogHost`).
 */

import type { FC } from "react";
import { detach } from "../../../utils/detach";
import { FORCE_FULL_SYNC_CONFIRM } from "../../../utils/syncPageWording";
import { useSyncPage } from "../../../utils/useSyncPage";
import { DesktopConfirmDialog } from "../../gameview/dialogs/DesktopConfirmDialog";
import { useDialogHost } from "../../gameview/dialogs/useDialogHost";
import { SessionBudgetNotice } from "./SessionBudgetNotice";
import { IdleBody, PreviewBody, RunBody } from "./SyncBodies";
import { MemorySection, OptionsSection, RunsSection } from "./SyncControls";

export const SyncTab: FC = () => {
  const state = useSyncPage();
  const dialogs = useDialogHost();

  const confirmForceFullSync = async (): Promise<void> => {
    const confirmed = await dialogs.ask(false, (resolve) => (
      <DesktopConfirmDialog
        titleId="tender-settings-force-full-sync-title"
        title={FORCE_FULL_SYNC_CONFIRM.title}
        description={FORCE_FULL_SYNC_CONFIRM.description}
        confirmLabel={FORCE_FULL_SYNC_CONFIRM.confirm}
        cancelLabel={FORCE_FULL_SYNC_CONFIRM.cancel}
        tone="danger"
        onChoice={resolve}
      />
    ));
    if (confirmed) state.forceFullSync();
  };

  let body;
  if (state.run.running) body = <RunBody state={state} />;
  else if (state.preview !== null) body = <PreviewBody state={state} preview={state.preview} />;
  else body = <IdleBody state={state} />;

  return (
    <div data-testid="tender-settings-sync">
      {!state.run.running && <SessionBudgetNotice state={state} />}
      {body}
      <OptionsSection state={state} onForceFullSync={() => detach(confirmForceFullSync())} />
      <MemorySection state={state} />
      <RunsSection state={state} />
      {dialogs.element}
    </div>
  );
};
