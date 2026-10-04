/**
 * The look of what the Tender Settings window's tabs draw themselves — text,
 * tables, notice cards — beside the Steam components they render for controls
 * and section headings. Sized for the settings window's content column at the
 * desktop client's scale, and coloured from the desktop client's palette.
 */

import type { CSSProperties } from "react";

export const TEXT = "#dcdedf";
export const MUTED = "#8b929a";
export const GREEN = "#59bf40";
export const AMBER = "#d4a72c";
export const RED = "#d4343c";
export const BLUE = "#1a9fff";

const RULE = "1px solid rgba(255, 255, 255, 0.1)";

/** One section of a tab: a heading, then what it holds. */
export const SECTION_STYLE: CSSProperties = { marginBottom: "20px" };

/** The quiet clause beside a section heading — a deadline, a run's position. */
export const HEADING_NOTE_STYLE: CSSProperties = {
  marginLeft: "8px",
  fontWeight: 400,
  textTransform: "none",
  letterSpacing: "normal",
  color: MUTED,
};

export const MUTED_TEXT_STYLE: CSSProperties = { fontSize: "13px", color: MUTED, lineHeight: 1.45, margin: "6px 0" };

/** A row of buttons, each as wide as its words. */
export const BUTTON_ROW_STYLE: CSSProperties = { display: "flex", gap: "8px", flexWrap: "wrap", margin: "8px 0" };

export const BUTTON_STYLE: CSSProperties = { width: "auto", minWidth: "120px", padding: "8px 18px" };

export const TABLE_STYLE: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "13px",
  color: TEXT,
  margin: "8px 0",
};

export const TH_STYLE: CSSProperties = {
  textAlign: "left",
  fontWeight: 400,
  color: MUTED,
  padding: "4px 8px",
  borderBottom: RULE,
};

export const TD_STYLE: CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
  verticalAlign: "top",
};

/** A cell that holds a number: read down the column, so right-aligned and tabular. */
export const NUMERIC_STYLE: CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums" };

/** The total row's cells: a rule over them, and the counts in bold. */
export const TOTAL_CELL_STYLE: CSSProperties = { borderTop: RULE, fontWeight: 600 };

/** The line under a cell's own words — collection names, an error. */
export const SUBLINE_STYLE: CSSProperties = { fontSize: "12px", color: MUTED, marginTop: "2px" };

/** A notice card: an accent edge on a wash of the same colour. */
export function noticeCardStyle(accent: string): CSSProperties {
  return {
    padding: "10px 14px",
    margin: "0 0 16px",
    backgroundColor: `${accent}26`,
    borderLeft: `3px solid ${accent}`,
    borderRadius: "4px",
    color: TEXT,
    fontSize: "13px",
    lineHeight: 1.5,
  };
}

/** A unit's thin progress bar, under its status. */
export const INLINE_BAR_TRACK_STYLE: CSSProperties = {
  height: "4px",
  borderRadius: "2px",
  background: "rgba(255, 255, 255, 0.12)",
  marginTop: "4px",
};
