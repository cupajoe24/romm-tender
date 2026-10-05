import { FC, Fragment } from "react";
import { ModalRoot, DialogButton, showModal } from "@decky/ui";
import { PREFERRED_REGION_CONFIRM, regionChangeLine } from "../../utils/preferredRegion";

interface PreferredRegionModalProps {
  oldLabel: string;
  newLabel: string;
  closeModal?: () => void;
  onDone: (proceed: boolean) => void;
}

/** The QAM's question before a Preferred-region change is saved; its words are `PREFERRED_REGION_CONFIRM`'s. */
const PreferredRegionModalContent: FC<PreferredRegionModalProps> = ({ oldLabel, newLabel, closeModal, onDone }) => {
  const handleChoice = (proceed: boolean) => {
    closeModal?.();
    onDone(proceed);
  };

  return (
    <ModalRoot
      closeModal={() => {
        closeModal?.();
        onDone(false);
      }}
    >
      <div style={{ padding: "16px", minWidth: "320px" }}>
        <div style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "4px", color: "#fff" }}>
          {PREFERRED_REGION_CONFIRM.title}
        </div>
        <div style={{ fontSize: "13px", color: "rgba(255, 255, 255, 0.6)", marginBottom: "16px" }}>
          {regionChangeLine(oldLabel, newLabel)}
        </div>

        <div
          style={{
            padding: "10px",
            background: "rgba(26, 159, 255, 0.12)",
            borderRadius: "4px",
            border: "1px solid rgba(26, 159, 255, 0.3)",
            marginBottom: "12px",
          }}
        >
          <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.8)", lineHeight: "1.4" }}>
            {PREFERRED_REGION_CONFIRM.paragraphs.map((paragraph, index) => (
              <Fragment key={paragraph[0]?.text}>
                {index > 0 && (
                  <>
                    <br />
                    <br />
                  </>
                )}
                {paragraph.map((run) => (run.strong ? <b key={run.text}>{run.text}</b> : run.text))}
              </Fragment>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <DialogButton onClick={() => handleChoice(true)}>{PREFERRED_REGION_CONFIRM.confirm}</DialogButton>
          <DialogButton onClick={() => handleChoice(false)} style={{ opacity: 0.5 }}>
            {PREFERRED_REGION_CONFIRM.cancel}
          </DialogButton>
        </div>
      </div>
    </ModalRoot>
  );
};

/** Show the modal; resolves true if the user confirms, false on cancel / dismiss. */
export function showPreferredRegionModal(oldLabel: string, newLabel: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    showModal(<PreferredRegionModalContent oldLabel={oldLabel} newLabel={newLabel} onDone={resolve} />);
  });
}
