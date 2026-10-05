/**
 * The frame every desktop game-page dialog is drawn in: the backdrop, the box,
 * the title, and the one way out that is not a button — Escape or a click on the
 * backdrop, both reported as `onDismiss`. A dialog passes no `onDismiss` while
 * it must not be left (a request of its own in flight).
 */

import { useEffect, useRef, type CSSProperties, type FC, type ReactNode } from "react";
import { BACKDROP_BUTTON_STYLE, BUTTON_STYLE, MODAL_CONTAINER_STYLE } from "../styles";

export interface DesktopDialogProps {
  /** Unique per dialog kind; ties the box's accessible name to its heading. */
  titleId: string;
  title: string;
  onDismiss?: (() => void) | undefined;
  children: ReactNode;
}

const DIALOG_BOX_STYLE: CSSProperties = {
  width: "520px",
  maxWidth: "92vw",
  maxHeight: "88vh",
  overflowY: "auto",
  background: "linear-gradient(180deg, #243547 0%, #17212b 40%, #0e141b 100%)",
  backgroundColor: "#161e27",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  borderRadius: "6px",
  boxShadow: "0 16px 48px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
  position: "relative",
  zIndex: 1,
  padding: "20px 24px",
  boxSizing: "border-box",
  color: "#c7d5e0",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  outline: "none",
};

const TITLE_STYLE: CSSProperties = {
  margin: "0 0 6px 0",
  fontSize: "18px",
  fontWeight: 700,
  color: "#ffffff",
};

export const DIALOG_TEXT_STYLE: CSSProperties = {
  fontSize: "13px",
  color: "#c7d5e0",
  lineHeight: 1.45,
  marginBottom: "12px",
};

export const DIALOG_MUTED_STYLE: CSSProperties = { fontSize: "12px", color: "#8f98a0", lineHeight: 1.4 };

export const DIALOG_VALUE_STYLE: CSSProperties = { fontSize: "13px", color: "#ffffff" };

export const DIALOG_ACTIONS_STYLE: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px" };

/** A text field in a dialog, as wide as the box. */
export const DIALOG_INPUT_STYLE: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  fontSize: "13px",
  backgroundColor: "rgba(0, 0, 0, 0.4)",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  borderRadius: "3px",
  color: "#ffffff",
  outline: "none",
};

/** What a dialog's field is called, above it. */
export const DIALOG_LABEL_STYLE: CSSProperties = {
  display: "block",
  fontSize: "12px",
  color: "#8f98a0",
  margin: "10px 0 4px",
};

/** The answer a dialog stays open on, above its buttons. */
export const DIALOG_ERROR_STYLE: CSSProperties = { color: "#d94126", fontSize: "12px", margin: "12px 0" };

const DIALOG_BUTTON_BASE: CSSProperties = {
  ...BUTTON_STYLE,
  padding: "8px 14px",
  fontSize: "13px",
  textAlign: "left",
};

export type DialogButtonTone = "primary" | "secondary" | "danger" | "quiet";

// Longhands only: `BUTTON_STYLE` sets `backgroundColor`, and a `background`
// shorthand beside it is one React cannot update cleanly between renders.
const TONE_STYLE: Record<DialogButtonTone, CSSProperties> = {
  primary: {
    backgroundImage: "linear-gradient(90deg, #1a9fff 0%, #0078d4 100%)",
    border: "1px solid rgba(26, 159, 255, 0.6)",
  },
  secondary: { backgroundImage: "none" },
  danger: {
    backgroundImage: "linear-gradient(90deg, #c83c3c 0%, #a02828 100%)",
    border: "1px solid rgba(255, 107, 107, 0.5)",
  },
  quiet: { backgroundImage: "none", backgroundColor: "transparent", color: "#8f98a0" },
};

/** The style of a dialog button of one tone, dimmed when it cannot be pressed. */
export function dialogButtonStyle(tone: DialogButtonTone, disabled = false): CSSProperties {
  return {
    ...DIALOG_BUTTON_BASE,
    ...TONE_STYLE[tone],
    ...(disabled ? { opacity: 0.5, cursor: "not-allowed" } : {}),
  };
}

export const DesktopDialog: FC<DesktopDialogProps> = ({ titleId, title, onDismiss, children }) => {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  // The listener goes on the window that owns the box, not the global one: this
  // code runs in SharedJSContext while the box lives in the desktop client's own
  // document, and a key pressed there never reaches SharedJSContext's window.
  // The Escape is claimed (`preventDefault`), so a window that closes on Escape
  // — the Tender Settings window — leaves this one to the dialog.
  useEffect(() => {
    const view = boxRef.current?.ownerDocument.defaultView;
    if (!view || !onDismiss) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onDismiss();
    };
    view.addEventListener("keydown", onKeyDown);
    return () => view.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return (
    <div className="tender-desktop-dialog" style={MODAL_CONTAINER_STYLE}>
      <button
        type="button"
        aria-label="Close dialog"
        className="tender-desktop-dialog-backdrop"
        style={BACKDROP_BUTTON_STYLE}
        onClick={() => onDismiss?.()}
      />
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="tender-desktop-dialog-box"
        style={DIALOG_BOX_STYLE}
      >
        <h2 id={titleId} style={TITLE_STYLE}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
};
