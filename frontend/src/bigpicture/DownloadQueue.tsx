import { FC, Fragment } from "react";
import { PanelSection, PanelSectionRow, ButtonItem, Field } from "@decky/ui";
import { scrollToTop } from "../utils/scrollHelpers";
import { detach } from "../utils/detach";
import { formatFinishedDescription, useDownloadQueue } from "../utils/downloadQueue";
import { DownloadProgressRow } from "./DownloadProgressRow";

interface DownloadQueueProps {
  onBack: () => void;
}

export const DownloadQueue: FC<DownloadQueueProps> = ({ onBack }) => {
  const { downloads, active, finished, hasFinished, handleCancel, handlePause, handleResume, handleClearCompleted } =
    useDownloadQueue();

  return (
    <>
      <PanelSection>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={onBack}
            // @ts-expect-error onFocus works at runtime; not in Decky's ButtonItem types
            onFocus={scrollToTop}
          >
            Back
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Downloads">
        {downloads.length === 0 ? (
          <PanelSectionRow>
            <Field label="No downloads" />
          </PanelSectionRow>
        ) : (
          <>
            {active.map((item) => (
              <DownloadProgressRow
                key={item.rom_id}
                caption={
                  <>
                    {item.rom_name} ({item.platform_name}){item.status === "paused" ? " — Paused" : ""}
                    {item.status === "extracting" ? " — Extracting…" : ""}
                  </>
                }
                bytesDownloaded={item.bytes_downloaded}
                totalBytes={item.total_bytes}
              />
            ))}
            {active.map((item) =>
              // Extraction is not cancellable and can't pause/resume — the
              // post-transfer unpack runs to completion. Offer no action row,
              // matching the game-detail button's disabled throbber.
              item.status === "extracting" ? null : (
                <Fragment key={`actions-${item.rom_id}`}>
                  {item.status === "downloading" && item.resumable && (
                    <PanelSectionRow>
                      <ButtonItem
                        layout="below"
                        onClick={() => {
                          detach(handlePause(item.rom_id));
                        }}
                      >
                        Pause {item.rom_name}
                      </ButtonItem>
                    </PanelSectionRow>
                  )}
                  {item.status === "paused" && (
                    <PanelSectionRow>
                      <ButtonItem
                        layout="below"
                        onClick={() => {
                          detach(handleResume(item.rom_id));
                        }}
                      >
                        Resume {item.rom_name}
                      </ButtonItem>
                    </PanelSectionRow>
                  )}
                  <PanelSectionRow>
                    <ButtonItem
                      layout="below"
                      onClick={() => {
                        detach(handleCancel(item.rom_id));
                      }}
                    >
                      Cancel {item.rom_name}
                    </ButtonItem>
                  </PanelSectionRow>
                </Fragment>
              ),
            )}

            {finished.map((item) => (
              <PanelSectionRow key={item.rom_id}>
                <Field label={item.rom_name} description={formatFinishedDescription(item)} />
              </PanelSectionRow>
            ))}

            {hasFinished && (
              <PanelSectionRow>
                <ButtonItem
                  layout="below"
                  onClick={() => {
                    detach(handleClearCompleted());
                  }}
                >
                  Clear Completed
                </ButtonItem>
              </PanelSectionRow>
            )}
          </>
        )}
      </PanelSection>
    </>
  );
};
