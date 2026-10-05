/**
 * The Tender Settings window's Library tab: the QAM's Library page — Platforms
 * and Collections — drawn for the desktop client over the same state
 * (`usePlatformsPage`, `useCollectionsPage`), words and decisions. Only the
 * drawing is the desktop's own, and every confirm is a desktop dialog drawn in
 * the window's own document (`useDialogHost`).
 *
 * The two halves are switched by the two buttons at the top, and switching
 * ENTERS the half shown, as the QAM page's tab change does: the collections
 * read waits for its half, and a read that failed is asked again there.
 */

import { useState, type FC } from "react";
import { DialogButton } from "@decky/ui";
import { useCollectionsPage } from "../../../utils/useCollectionsPage";
import { usePlatformsPage } from "../../../utils/usePlatformsPage";
import { useDialogHost } from "../../gameview/dialogs/useDialogHost";
import { BLUE, BUTTON_STYLE, MUTED } from "../settingsStyles";
import { CollectionsPane } from "./CollectionsPane";
import { PlatformsPane } from "./PlatformsPane";

/**
 * This tab's prune leases. The page's unmount releases every lease its owner
 * holds, so the name differs from the QAM's Platforms tab's: closing the window
 * must not release leases an open QAM page still holds.
 */
const LEASE_OWNER = "tender-settings-library";

type Half = "platforms" | "collections";

const HALVES: readonly { id: Half; title: string }[] = [
  { id: "platforms", title: "Platforms" },
  { id: "collections", title: "Collections" },
];

export const LibraryTab: FC = () => {
  const [half, setHalf] = useState<Half>("platforms");
  const platforms = usePlatformsPage(LEASE_OWNER);
  const collections = useCollectionsPage();
  const dialogs = useDialogHost();

  const show = (next: Half) => {
    if (next === half) return;
    if (next === "collections") collections.enter();
    else platforms.enter();
    setHalf(next);
  };

  return (
    <div data-testid="tender-settings-library">
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        {HALVES.map(({ id, title }) => (
          <DialogButton
            key={id}
            style={{
              ...BUTTON_STYLE,
              minWidth: "auto",
              color: id === half ? undefined : MUTED,
              borderBottom: `2px solid ${id === half ? BLUE : "transparent"}`,
            }}
            onClick={() => show(id)}
          >
            {title}
          </DialogButton>
        ))}
      </div>
      {half === "platforms" ? (
        <PlatformsPane state={platforms} ask={dialogs.ask} />
      ) : (
        <CollectionsPane state={collections} ask={dialogs.ask} />
      )}
      {dialogs.element}
    </div>
  );
};
