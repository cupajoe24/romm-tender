/**
 * The Preferred-region setting (ADR-0021 §3): which region wins when a game has
 * several dumps and the plugin must pick one to bind and name the shortcut
 * after — the options it offers, how a value is named, and what the question
 * before a change says.
 */

import type { Phrase } from "./settingsWording";

// The internal sentinel for "no preference — use the fixed build-time order".
export const AUTO_REGION = "auto";

// The fixed anchor regions, in the build-time default order. MIRRORS the backend
// constant DEFAULT_REGION_PRIORITY (backend/domain/sibling_resolution.py) —
// keep the two in sync. This is a fixed order, NOT language/system detection.
export const ANCHOR_REGIONS: readonly string[] = ["World", "USA", "Europe", "Japan"];

// The default option's label states the order explicitly so it never reads as
// auto-detection.
export const DEFAULT_REGION_LABEL = "Default (World > USA > Europe)";

/** What a stored value is called on screen. */
export const regionLabel = (value: string): string => (value === AUTO_REGION ? DEFAULT_REGION_LABEL : value);

/**
 * Build the dropdown options: the "Default" sentinel + the fixed anchors, then
 * every OTHER region found in the local library (sorted, de-duped against the
 * anchors). The currently-selected value is always included so a preference for
 * a region no longer in the library still renders as selected.
 */
export function buildRegionOptions(libraryRegions: string[], selected: string): { data: string; label: string }[] {
  const options: { data: string; label: string }[] = [
    { data: AUTO_REGION, label: DEFAULT_REGION_LABEL },
    ...ANCHOR_REGIONS.map((r) => ({ data: r, label: r })),
  ];
  const known = new Set<string>([AUTO_REGION, ...ANCHOR_REGIONS]);
  const extras = Array.from(new Set(libraryRegions))
    .filter((r) => r && !known.has(r))
    .sort((a, b) => a.localeCompare(b));
  for (const r of extras) {
    options.push({ data: r, label: r });
    known.add(r);
  }
  if (selected !== AUTO_REGION && !known.has(selected)) {
    options.push({ data: selected, label: selected });
  }
  return options;
}

/**
 * The question before a change is saved. What the copy must make unmistakable:
 * the setting persists immediately, but it only affects shortcuts minted from
 * the NEXT sync onward. Already-synced games keep their bound version and
 * shortcut name — the plugin never implicitly switches versions or renames a
 * shortcut. No resync is forced; the question only explains.
 */
export const PREFERRED_REGION_CONFIRM: {
  readonly title: string;
  readonly paragraphs: readonly Phrase[];
  readonly confirm: string;
  readonly cancel: string;
} = {
  title: "Change Preferred Region",
  paragraphs: [
    [
      { text: "This applies to games synced " },
      { text: "from now on", strong: true },
      {
        text:
          ". When a game has several regional versions, the plugin will prefer this region for the version it " +
          "binds and the name it gives the new Steam shortcut.",
      },
    ],
    [
      { text: "Games you have " },
      { text: "already synced keep their current version and shortcut name", strong: true },
      {
        text:
          " — changing this never switches a game's version or renames an existing shortcut. Run a sync to apply " +
          "it to new games.",
      },
    ],
  ],
  confirm: "Save",
  cancel: "Cancel",
};

/** The line under the question's title: the region now, and the one it becomes. */
export const regionChangeLine = (fromLabel: string, toLabel: string): string => `${fromLabel} → ${toLabel}`;
