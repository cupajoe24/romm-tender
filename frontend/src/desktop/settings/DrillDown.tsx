/**
 * A list that gives way to one entry's detail: the list fills the tab, and
 * opening an entry slides it out to the left and the detail in from the right,
 * with a Back button at the detail's top that slides the list back. A tab's
 * content column is too narrow for a list and a detail side by side.
 *
 * Both panels stay mounted, so the slide has something to move. The one out of
 * view is `inert` — out of the tab order and hidden from assistive technology —
 * and, once the slide is over, takes no height, so the content area scrolls
 * over the panel in view alone. Opening moves focus to Back; going back returns
 * it to whatever held it when the detail opened, the row that opened it. Focus
 * is read off the panel's own document: the settings window is not the realm
 * this code runs in.
 */

import { useEffect, useRef, useState, type CSSProperties, type FC, type ReactNode } from "react";
import { DialogButton } from "@decky/ui";
import { FaChevronLeft } from "react-icons/fa";
import { BUTTON_STYLE } from "./settingsStyles";

export interface DrillDownProps {
  /** Whether the detail is the panel in view. */
  open: boolean;
  list: ReactNode;
  /** What the detail panel shows; kept while it slides out, so it does not empty mid-slide. */
  detail: ReactNode;
  onBack: () => void;
}

const SLIDE_MS = 200;

export const BACK_LABEL = "Back";

/**
 * Both panels in one grid cell, so each is exactly the frame's width and slides
 * by its own width. A 200%-wide track of two halves would be sized off the
 * frame's width, which Steam's content area does not make definite, and its
 * halves need not come out half the track — a slide by half of it overshoots.
 */
const FRAME_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  alignItems: "start",
  width: "100%",
  overflow: "hidden",
};

const PANEL_STYLE: CSSProperties = { gridArea: "1 / 1", minWidth: 0, boxSizing: "border-box" };

const slide = (x: string): CSSProperties => ({
  transform: `translateX(${x})`,
  transition: `transform ${SLIDE_MS}ms ease`,
});

/** Out of view and its slide over: no height, so the scroll follows the panel in view. */
const SETTLED_AWAY: CSSProperties = { height: 0, overflow: "hidden", visibility: "hidden" };

export const DrillDown: FC<DrillDownProps> = ({ open, list, detail, onBack }) => {
  const backRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  // Which panel the last finished slide left in view; until the current slide
  // finishes, both panels keep their height.
  const [settled, setSettled] = useState(open);

  useEffect(() => {
    const doc = backRef.current?.ownerDocument;
    if (!doc) return;
    if (open) {
      returnTo.current = doc.activeElement as HTMLElement | null;
      backRef.current?.querySelector("button")?.focus();
    } else {
      returnTo.current?.focus();
      returnTo.current = null;
    }
    const timer = doc.defaultView?.setTimeout(() => setSettled(open), SLIDE_MS);
    return () => {
      if (timer !== undefined) doc.defaultView?.clearTimeout(timer);
    };
  }, [open]);

  const listAway = open && settled;
  const detailAway = !open && !settled;
  return (
    <div data-testid="drill-down" style={FRAME_STYLE}>
      <div
        data-testid="drill-down-list"
        inert={open}
        aria-hidden={open}
        style={{ ...PANEL_STYLE, ...slide(open ? "-100%" : "0"), ...(listAway ? SETTLED_AWAY : {}) }}
      >
        {list}
      </div>
      <div
        data-testid="drill-down-detail"
        inert={!open}
        aria-hidden={!open}
        style={{ ...PANEL_STYLE, ...slide(open ? "0" : "100%"), ...(detailAway ? SETTLED_AWAY : {}) }}
      >
        <div ref={backRef} style={{ marginBottom: "10px" }}>
          <DialogButton
            style={{ ...BUTTON_STYLE, minWidth: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}
            onClick={onBack}
          >
            <FaChevronLeft size={12} />
            {BACK_LABEL}
          </DialogButton>
        </div>
        {detail}
      </div>
    </div>
  );
};
