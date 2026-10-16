/**
 * The Tender Settings window's Downloads tab: the downloads queue and active
 * progress drawn for the desktop client over the shared state, lifecycle, and
 * action handlers (`useDownloadQueue`).
 *
 * Active downloads display title, platform, byte progress and a Steam ProgressBar
 * with Pause, Resume, and Cancel buttons. Finished downloads list completed,
 * failed, and cancelled outcomes with a "Clear Completed" button. An empty
 * queue renders a clean native Steam desktop empty card.
 */

import type { FC } from "react";
import { DialogButton, ProgressBar } from "@decky/ui";
import { detach } from "../../../utils/detach";
import { formatBytes } from "../../../utils/formatters";
import {
  DOWNLOADS_EMPTY_LABEL,
  DOWNLOADS_SECTION_TITLE,
  formatFinishedDescription,
  useDownloadQueue,
} from "../../../utils/downloadQueue";
import { SectionHeading } from "../SectionHeading";
import {
  BUTTON_ROW_STYLE,
  BUTTON_STYLE,
  CARD_BUTTON_STYLE,
  MUTED,
  MUTED_TEXT_STYLE,
  SECTION_STYLE,
  SETTING_CARD_STYLE,
  TEXT,
} from "../settingsStyles";

export const DownloadsTab: FC = () => {
  const { active, finished, hasFinished, isEmpty, handleCancel, handlePause, handleResume, handleClearCompleted } =
    useDownloadQueue();

  return (
    <div data-testid="tender-settings-downloads">
      <section style={SECTION_STYLE}>
        <SectionHeading title={DOWNLOADS_SECTION_TITLE} />

        {isEmpty && (
          <div data-testid="downloads-empty" style={SETTING_CARD_STYLE}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: TEXT }}>{DOWNLOADS_EMPTY_LABEL}</div>
              <div style={MUTED_TEXT_STYLE}>There are no downloads in progress or queued.</div>
            </div>
          </div>
        )}

        {active.length > 0 && (
          <div data-testid="downloads-active-list" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {active.map((item) => (
              <div
                key={item.rom_id}
                data-testid={`download-active-${item.rom_id}`}
                style={{ ...SETTING_CARD_STYLE, flexDirection: "column", alignItems: "stretch", gap: "10px" }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}
                >
                  <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: TEXT }}>
                      <span data-testid="dl-caption">
                        {item.rom_name} ({item.platform_name}){item.status === "paused" ? " — Paused" : ""}
                        {item.status === "extracting" ? " — Extracting…" : ""}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: MUTED, marginTop: "2px" }}>
                      <span data-testid="dl-bytes">
                        {item.total_bytes > 0
                          ? `${formatBytes(item.bytes_downloaded)} / ${formatBytes(item.total_bytes)}`
                          : formatBytes(item.bytes_downloaded)}
                      </span>
                    </div>
                  </div>
                  <div style={{ ...BUTTON_ROW_STYLE, margin: 0, flexShrink: 0 }}>
                    {item.status === "downloading" && item.resumable && (
                      <DialogButton
                        style={CARD_BUTTON_STYLE}
                        onClick={() => {
                          detach(handlePause(item.rom_id));
                        }}
                      >
                        Pause {item.rom_name}
                      </DialogButton>
                    )}
                    {item.status === "paused" && (
                      <DialogButton
                        style={CARD_BUTTON_STYLE}
                        onClick={() => {
                          detach(handleResume(item.rom_id));
                        }}
                      >
                        Resume {item.rom_name}
                      </DialogButton>
                    )}
                    {item.status !== "extracting" && (
                      <DialogButton
                        style={CARD_BUTTON_STYLE}
                        onClick={() => {
                          detach(handleCancel(item.rom_id));
                        }}
                      >
                        Cancel {item.rom_name}
                      </DialogButton>
                    )}
                  </div>
                </div>
                <ProgressBar
                  indeterminate={item.total_bytes === 0}
                  {...(item.total_bytes > 0 ? { nProgress: (item.bytes_downloaded / item.total_bytes) * 100 } : {})}
                />
              </div>
            ))}
          </div>
        )}

        {hasFinished && (
          <div data-testid="downloads-finished-section" style={{ marginTop: active.length > 0 ? "24px" : "0" }}>
            <SectionHeading title="Completed Downloads" />
            <div data-testid="downloads-finished-list" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {finished.map((item) => (
                <div key={item.rom_id} data-testid={`download-finished-${item.rom_id}`} style={SETTING_CARD_STYLE}>
                  <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: TEXT }} data-testid="field-label">
                      {item.rom_name}
                    </div>
                    <div style={{ fontSize: "12px", color: MUTED, marginTop: "2px" }} data-testid="field-desc">
                      {formatFinishedDescription(item)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ ...BUTTON_ROW_STYLE, marginTop: "12px" }}>
              <DialogButton
                style={BUTTON_STYLE}
                onClick={() => {
                  detach(handleClearCompleted());
                }}
              >
                Clear Completed
              </DialogButton>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
