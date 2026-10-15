/**
 * Detail pane for Recovery Bundles in Desktop Data Management.
 */

import type { FC } from "react";
import { formatBytes } from "../../../utils/formatters";
import { pluralize } from "../../../utils/pluralize";
import { figureLine, newestFirst } from "../../../utils/dataInventoryView";
import type { DataPageState } from "../../../utils/useDataPage";
import type { RecoveryBundleEntry } from "../../../types";
import { SectionHeading } from "../SectionHeading";
import { MUTED_TEXT_STYLE, NUMERIC_STYLE, SECTION_STYLE, TABLE_STYLE, TD_STYLE, TH_STYLE } from "../settingsStyles";

export interface RecoveryBundlesDetailPaneProps {
  state: DataPageState;
}

const BundleTable: FC<{ bundles: readonly RecoveryBundleEntry[] }> = ({ bundles }) => {
  const seen = new Map<string, number>();
  const sorted = [...bundles].sort(newestFirst);

  return (
    <table style={TABLE_STYLE} data-testid="bundle-table">
      <thead>
        <tr data-testid="bundle-header">
          <th style={TH_STYLE}>Game</th>
          <th style={TH_STYLE}>Sealed</th>
          <th style={{ ...TH_STYLE, ...NUMERIC_STYLE }}>Size</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((bundle) => {
          const pair = `${bundle.day ?? "none"}:${bundle.name}`;
          const nth = (seen.get(pair) ?? 0) + 1;
          seen.set(pair, nth);
          const sealed = bundle.day ?? "—";
          const size = bundle.bytes === null ? "—" : formatBytes(bundle.bytes);
          return (
            <tr key={`${pair}:${nth}`}>
              <td style={TD_STYLE} title={bundle.name}>
                {bundle.name}
              </td>
              <td style={TD_STYLE}>{sealed}</td>
              <td style={{ ...TD_STYLE, ...NUMERIC_STYLE }}>{size}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export const RecoveryBundlesDetailPane: FC<RecoveryBundlesDetailPaneProps> = ({ state }) => {
  const inventory = state.inventory;
  const answered = inventory.state === "answered" ? inventory.value : null;

  return (
    <section style={SECTION_STYLE} data-testid="recovery-bundles-detail-pane">
      <SectionHeading title="Recovery Bundles" />
      <div style={MUTED_TEXT_STYLE}>
        Before the cleanup deletes a game&apos;s local data it seals a snapshot of it
        {answered === null ? "" : `, in ${answered.recovery_root}`}. Nothing is ever read back automatically and nothing
        here removes one — they are yours to keep, move or delete in a file manager.
      </div>
      <div style={{ ...MUTED_TEXT_STYLE, fontWeight: 600 }}>
        {figureLine(
          inventory,
          "The list of recovery bundles",
          (read) => `${pluralize(read.recovery_bundles, "bundle")} · ${formatBytes(read.recovery_bytes)}`,
        )}
      </div>

      {answered !== null && (
        <div style={MUTED_TEXT_STYLE}>
          {answered.recovery_bundles === 0
            ? "Nothing has been sealed under that folder. Bundles an older version wrote elsewhere are not counted here."
            : "Each carries a README explaining what it holds. Bundles an older version sealed under a different folder are not counted here."}
        </div>
      )}

      {answered !== null && answered.recovery_bundle_list.length > 0 && (
        <BundleTable bundles={answered.recovery_bundle_list} />
      )}
    </section>
  );
};
