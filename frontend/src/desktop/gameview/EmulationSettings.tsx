/**
 * EmulationSettings card — emulator/core picker and BIOS status panel for
 * the Desktop "Emulation Settings" tab.
 *
 * Two sections:
 *  1. Emulator / Core — interactive picker. Clicking a row calls setGameCore /
 *     clearGameCore, applies launch_options via setLaunchOptionsConfirmed, and
 *     dispatches `romm_data_changed { type: "core_changed" }` so gameDetailStore
 *     refreshes both core info and BIOS state without any local store work.
 *
 *  2. BIOS / Firmware — per-file status panel. Issues its own getBiosStatus call
 *     (the same call gameDetailStore makes; one extra per tab-open). Shows the
 *     biosSummary sentence with a coloured dot, then each file with its own dot,
 *     name, description, and required / optional / missing badges.
 */

import { useState, useEffect, useCallback, type FC } from "react";
import type { GameDetailState } from "../../utils/gameDetailStore";
import type { BiosAnswer } from "../../api/backend";
import { getBiosStatus, setGameCore, clearGameCore, debugLog } from "../../api/backend";
import { setLaunchOptionsConfirmed } from "../../utils/steamShortcuts";
import { biosColorForLevel } from "../../utils/biosColor";
import { biosSummary } from "../../utils/biosSummary";
import type { BiosFileStatus, BiosLevel, EmulatorOption } from "../../types";
import { detach } from "../../utils/detach";

export interface EmulationSettingsProps {
  title: string;
  detail: GameDetailState;
}

// ─── Style constants ─────────────────────────────────────────────────────────

const LABEL_COLOR = "#6e7f91";
const VALUE_COLOR = "#dfe3e6";
const SECTION_TITLE_STYLE: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#8f98a0",
  marginBottom: "10px",
};
const DIVIDER_STYLE: React.CSSProperties = {
  borderTop: "1px solid rgba(255, 255, 255, 0.07)",
  margin: "18px 0",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** A single emulator row in the picker. */
const EmulatorRow: FC<{
  emu: EmulatorOption;
  isActive: boolean;
  isDefault: boolean;
  actionLoading: boolean;
  onSelect: (emu: EmulatorOption) => void;
}> = ({ emu, isActive, isDefault, actionLoading, onSelect }) => {
  const disabled = !emu.bakeable || actionLoading;
  const [hovered, setHovered] = useState(false);

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 10px",
    borderRadius: "4px",
    cursor: disabled ? "default" : "pointer",
    backgroundColor: isActive
      ? "rgba(102, 192, 244, 0.12)"
      : hovered && !disabled
        ? "rgba(255, 255, 255, 0.06)"
        : "transparent",
    border: isActive ? "1px solid rgba(102, 192, 244, 0.25)" : "1px solid transparent",
    transition: "background-color 0.12s ease, border-color 0.12s ease",
    opacity: disabled && !isActive ? 0.45 : 1,
    userSelect: "none",
  };

  return (
    <div
      style={rowStyle}
      onClick={() => {
        if (!disabled) {
          onSelect(emu);
        }
      }}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(emu);
        }
      }}
      tabIndex={disabled ? -1 : 0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={emu.bakeable ? undefined : (emu.reason ?? "Not available")}
      role="option"
      aria-selected={isActive}
    >
      {/* Active-state indicator dot */}
      <div
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          flexShrink: 0,
          backgroundColor: isActive ? "#66c0f4" : "rgba(255, 255, 255, 0.18)",
          transition: "background-color 0.12s ease",
        }}
      />

      {/* Label */}
      <span
        style={{
          flex: 1,
          fontSize: "13px",
          fontWeight: isActive ? 600 : 400,
          color: isActive ? "#ffffff" : VALUE_COLOR,
        }}
      >
        {emu.label}
      </span>

      {/* Badges */}
      <div style={{ display: "flex", gap: "5px", alignItems: "center", flexShrink: 0 }}>
        {isDefault && (
          <span
            style={{
              fontSize: "10px",
              padding: "1px 5px",
              borderRadius: "2px",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              color: "#8f98a0",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            Default
          </span>
        )}
        <span
          style={{
            fontSize: "10px",
            padding: "1px 5px",
            borderRadius: "2px",
            backgroundColor: emu.kind === "libretro" ? "rgba(66, 135, 245, 0.15)" : "rgba(245, 166, 66, 0.15)",
            color: emu.kind === "libretro" ? "#7aadff" : "#f5a642",
            border:
              emu.kind === "libretro" ? "1px solid rgba(66, 135, 245, 0.25)" : "1px solid rgba(245, 166, 66, 0.25)",
          }}
        >
          {emu.kind === "libretro" ? "RetroArch" : "Standalone"}
        </span>
        {!emu.bakeable && (
          <span
            style={{
              fontSize: "10px",
              padding: "1px 5px",
              borderRadius: "2px",
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              color: "#6e7f91",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            Unavailable
          </span>
        )}
        {isActive && !isDefault && (
          <span
            style={{
              fontSize: "10px",
              padding: "1px 5px",
              borderRadius: "2px",
              backgroundColor: "rgba(59, 130, 246, 0.18)",
              color: "#60a5fa",
              border: "1px solid rgba(59, 130, 246, 0.28)",
            }}
          >
            Override
          </span>
        )}
      </div>
    </div>
  );
};

/** Dot colour for one BIOS file row — mirrors the BiosTab logic. */
function biosFileDotColor(file: BiosFileStatus): string {
  const verdict = file.satisfied === undefined ? file.downloaded : file.satisfied;
  if (verdict === null) return "#d4a72c";
  if (verdict) return "#5ba32b";
  if (file.required_by_active) return "#d94126";
  const requiredElsewhere = Object.values(file.cores ?? {}).some((c) => c.required);
  return requiredElsewhere ? "#d4a72c" : "#8f98a0";
}

/** One BIOS file row. */
const BiosFileRow: FC<{ file: BiosFileStatus }> = ({ file }) => {
  const dotColor = biosFileDotColor(file);
  const verdict = file.satisfied === undefined ? file.downloaded : file.satisfied;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "7px 0",
        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
      }}
    >
      {/* Dot */}
      <div
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          flexShrink: 0,
          backgroundColor: dotColor,
          marginTop: "4px",
        }}
      />

      {/* File info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              fontWeight: 500,
              color: VALUE_COLOR,
              fontFamily: "monospace",
              wordBreak: "break-all",
            }}
          >
            {file.file_name}
          </span>

          {/* Required badge */}
          {file.required_by_active && (
            <span
              style={{
                fontSize: "10px",
                padding: "1px 5px",
                borderRadius: "2px",
                backgroundColor: verdict === false ? "rgba(217, 65, 38, 0.18)" : "rgba(255, 255, 255, 0.07)",
                color: verdict === false ? "#f87171" : "#8f98a0",
                border: verdict === false ? "1px solid rgba(217, 65, 38, 0.25)" : "1px solid rgba(255, 255, 255, 0.1)",
                flexShrink: 0,
              }}
            >
              Required
            </span>
          )}
          {/* Optional badge (wanted but not required by the active core) */}
          {!file.required_by_active && file.wanted === "needed" && (
            <span
              style={{
                fontSize: "10px",
                padding: "1px 5px",
                borderRadius: "2px",
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                color: "#8f98a0",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                flexShrink: 0,
              }}
            >
              Optional
            </span>
          )}

          {/* Present / Missing / Unknown badge */}
          <span
            style={{
              fontSize: "10px",
              padding: "1px 5px",
              borderRadius: "2px",
              backgroundColor:
                verdict === true
                  ? "rgba(91, 163, 43, 0.15)"
                  : verdict === false
                    ? "rgba(217, 65, 38, 0.15)"
                    : "rgba(212, 167, 44, 0.15)",
              color: verdict === true ? "#86efac" : verdict === false ? "#f87171" : "#fcd34d",
              border:
                verdict === true
                  ? "1px solid rgba(91, 163, 43, 0.25)"
                  : verdict === false
                    ? "1px solid rgba(217, 65, 38, 0.25)"
                    : "1px solid rgba(212, 167, 44, 0.25)",
              flexShrink: 0,
            }}
          >
            {verdict === true ? "Present" : verdict === false ? "Missing" : "Unknown"}
          </span>
        </div>

        {file.description && (
          <div
            style={{
              fontSize: "11px",
              color: LABEL_COLOR,
              marginTop: "2px",
              lineHeight: 1.4,
            }}
          >
            {file.description}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const EmulationSettings: FC<EmulationSettingsProps> = ({ title, detail }) => {
  const platform = detail.platformSlug ? detail.platformSlug.toUpperCase() : "Platform";

  // Full BIOS detail — GameDetailState only carries the 3 derived badge fields, so
  // we issue our own getBiosStatus call when the ROM is known and BIOS is needed.
  const [biosRecord, setBiosRecord] = useState<{
    romId: number;
    answer: BiosAnswer | null;
  } | null>(null);

  const biosAnswer = detail.romId && detail.biosNeeded && biosRecord?.romId === detail.romId ? biosRecord.answer : null;

  const biosLoading = Boolean(detail.romId && detail.biosNeeded && biosRecord?.romId !== detail.romId);

  // Core-change action state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch the full BIOS answer whenever the ROM or biosNeeded status changes
  useEffect(() => {
    const romId = detail.romId;
    if (!romId || !detail.biosNeeded) {
      return;
    }
    let cancelled = false;
    getBiosStatus(romId)
      .then((ans) => {
        if (!cancelled) {
          setBiosRecord({ romId, answer: ans });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          detach(debugLog(`EmulationSettings: getBiosStatus error: ${e}`));
          setBiosRecord({ romId, answer: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [detail.romId, detail.biosNeeded]);

  // Emulator picker handler
  const handleSelectEmulator = useCallback(
    async (emu: EmulatorOption) => {
      const romId = detail.romId;
      if (!romId || !emu.bakeable || actionLoading) return;

      // Picking the default-marked core clears the override; any other pick sets it.
      const pickingDefault = emu.is_default;

      setActionLoading(true);
      setActionError(null);
      try {
        const result = pickingDefault ? await clearGameCore(romId) : await setGameCore(romId, emu.label);
        if (!result.success) {
          setActionError(result.message ?? "Could not apply emulator change.");
          return;
        }
        // Apply the rebaked launch options when the ROM is installed and bound
        if (result.launch_options !== undefined && result.app_id != null) {
          try {
            await setLaunchOptionsConfirmed(result.app_id, result.launch_options);
          } catch (e) {
            detach(debugLog(`EmulationSettings: setLaunchOptionsConfirmed threw: ${e}`));
          }
        }
        // Tell gameDetailStore to refresh core + BIOS state
        globalThis.dispatchEvent(
          new CustomEvent("romm_data_changed", {
            detail: { type: "core_changed" },
          }),
        );
      } catch (e) {
        setActionError("Failed to apply emulator change.");
        detach(debugLog(`EmulationSettings: handleSelectEmulator threw: ${e}`));
      } finally {
        setActionLoading(false);
      }
    },
    [detail.romId, actionLoading],
  );

  // ── Derived values ──────────────────────────────────────────────────────────

  const activeCore = detail.activeCoreLabel || detail.platformCoreLabel || "Default";
  const defaultEmulator = detail.emulators.find((e) => e.is_default);

  // BIOS summary sentence and file list from the live biosAnswer
  let biosSentence: string | null = null;
  let biosLevel: BiosLevel | null = null;
  let biosFiles: BiosFileStatus[] = [];
  if (biosAnswer?.bios_status) {
    biosLevel = biosAnswer.bios_level ?? null;
    biosFiles = biosAnswer.bios_status.files ?? [];
    const summary = biosSummary({ ...biosAnswer.bios_status, active_core_label: activeCore }, biosFiles, biosLevel);
    biosSentence = summary.sentence;
  }
  const biosStatusDotColor = biosColorForLevel(biosLevel);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="tender-desktop-emulation-settings"
      style={{
        display: "flex",
        flexDirection: "column",
        color: "#c7d5e0",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* ── Header ── */}
      <div style={{ marginBottom: "20px" }}>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#8f98a0",
            marginBottom: "4px",
          }}
        >
          {platform} EMULATION
        </div>
        <h2
          style={{
            margin: "0 0 6px 0",
            fontSize: "22px",
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h2>
        <p style={{ margin: "0", fontSize: "13px", lineHeight: 1.5, color: "#a0b0c0" }}>
          Emulator selection and BIOS status for this title.
        </p>
      </div>

      {/* ── Active-core summary row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          paddingBottom: "14px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
          marginBottom: "18px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: LABEL_COLOR, fontSize: "13px", minWidth: "100px" }}>Active Core</span>
        <span style={{ color: VALUE_COLOR, fontWeight: 500, fontSize: "13px" }}>{activeCore}</span>
        {detail.hasGameOverride && (
          <span
            style={{
              fontSize: "11px",
              padding: "1px 6px",
              borderRadius: "2px",
              backgroundColor: "rgba(59, 130, 246, 0.18)",
              color: "#60a5fa",
              border: "1px solid rgba(59, 130, 246, 0.28)",
            }}
          >
            Game override
          </span>
        )}
      </div>

      {/* ── Section 1: Emulator / Core picker ── */}
      <div>
        <div style={SECTION_TITLE_STYLE}>Emulator / Core</div>

        {!detail.emulatorDataAvailable ? (
          <div
            style={{
              padding: "14px",
              borderRadius: "4px",
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.07)",
              fontSize: "13px",
              color: LABEL_COLOR,
            }}
          >
            Emulator data unavailable — RetroDECK may not be installed or configured.
          </div>
        ) : detail.emulators.length === 0 ? (
          <div
            style={{
              padding: "14px",
              borderRadius: "4px",
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.07)",
              fontSize: "13px",
              color: LABEL_COLOR,
            }}
          >
            No emulators found for this platform.
          </div>
        ) : (
          <div
            role="listbox"
            aria-label="Emulator selection"
            style={{ display: "flex", flexDirection: "column", gap: "2px" }}
          >
            {detail.emulators.map((emu) => {
              // Active when: no override and emu is default, OR override set and label matches.
              const isActive = detail.activeCoreIsDefault ? emu.is_default : emu.label === detail.activeCoreLabel;
              return (
                <EmulatorRow
                  key={emu.label}
                  emu={emu}
                  isActive={isActive}
                  isDefault={emu.is_default}
                  actionLoading={actionLoading}
                  onSelect={(selected) => {
                    void handleSelectEmulator(selected);
                  }}
                />
              );
            })}
          </div>
        )}

        {actionLoading && (
          <div
            style={{
              marginTop: "10px",
              fontSize: "12px",
              color: "#8f98a0",
              display: "flex",
              alignItems: "center",
              gap: "7px",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                border: "2px solid rgba(102, 192, 244, 0.3)",
                borderTopColor: "#66c0f4",
                animation: "romm-spin 0.7s linear infinite",
              }}
            />
            Applying…
          </div>
        )}

        {actionError && !actionLoading && (
          <div
            style={{
              marginTop: "10px",
              padding: "8px 10px",
              borderRadius: "3px",
              backgroundColor: "rgba(217, 65, 38, 0.1)",
              border: "1px solid rgba(217, 65, 38, 0.25)",
              fontSize: "12px",
              color: "#f87171",
            }}
          >
            {actionError}
          </div>
        )}

        {detail.emulators.length > 1 && !actionLoading && (
          <div style={{ marginTop: "8px", fontSize: "11px", color: "#6e7f91" }}>
            {detail.hasGameOverride
              ? "Select the default emulator to remove the per-game override."
              : `Select any emulator to set a per-game override.${defaultEmulator ? ` Default: ${defaultEmulator.label}.` : ""}`}
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div style={DIVIDER_STYLE} />

      {/* ── Section 2: BIOS / Firmware ── */}
      <div>
        <div style={SECTION_TITLE_STYLE}>BIOS / Firmware</div>

        {!detail.biosNeeded ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                flexShrink: 0,
                backgroundColor: "#5ba32b",
              }}
            />
            <span style={{ fontSize: "13px", color: VALUE_COLOR }}>No BIOS required for this title</span>
          </div>
        ) : biosLoading ? (
          <div style={{ fontSize: "13px", color: LABEL_COLOR }}>Loading BIOS status…</div>
        ) : (
          <>
            {/* Summary dot + sentence */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                marginBottom: biosFiles.length > 0 ? "14px" : "0",
              }}
            >
              <div
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  flexShrink: 0,
                  backgroundColor: biosStatusDotColor,
                  marginTop: "4px",
                }}
              />
              <div>
                {biosSentence ? (
                  <span style={{ fontSize: "13px", color: VALUE_COLOR }}>{biosSentence}</span>
                ) : (
                  <span style={{ fontSize: "13px", color: LABEL_COLOR }}>
                    {detail.biosLabel || "BIOS status unavailable"}
                  </span>
                )}
              </div>
            </div>

            {/* Per-file table */}
            {biosFiles.length > 0 && (
              <div
                style={{
                  borderRadius: "4px",
                  border: "1px solid rgba(255, 255, 255, 0.07)",
                  backgroundColor: "rgba(0, 0, 0, 0.2)",
                  padding: "0 10px",
                }}
              >
                {biosFiles.map((file) => (
                  <BiosFileRow key={file.file_name} file={file} />
                ))}
              </div>
            )}

            {biosFiles.length === 0 && (
              <div style={{ fontSize: "12px", color: LABEL_COLOR, marginTop: "6px" }}>
                File details not available — BIOS status could not be established.
              </div>
            )}
          </>
        )}
      </div>

      {/* Spin keyframe — injected inline since we cannot touch global CSS here */}
      <style>{`@keyframes romm-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
