/**
 * Why a pane's buttons are dead while nothing on it is running: an action is
 * working on another entry (*busyName*, what the page calls it), and the page
 * runs one at a time.
 */
export const busyElsewhereLine = (busyName: string): string =>
  `Working on ${busyName} — actions here are paused until it finishes.`;
