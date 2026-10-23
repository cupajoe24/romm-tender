/**
 * The desktop client's dialog for choosing the SteamGridDB game a ROM's artwork
 * comes from, opened by the Play menu's Choose SteamGridDB Game… (the desktop
 * client has no ARTWORK tab). The user searches SteamGridDB by title and picks a
 * game to apply; before a change that discards the images the user chose, it
 * says so. Big Picture's `SgdbGamePickerModal` is the other drawing of it.
 */

import { useState, type FC, type FormEvent } from "react";
import type { EndpointFailure, SgdbCandidate } from "../../../api/backend";
import { executeSgdbCandidateSearch, executeSgdbSelectionApply } from "../../../utils/sgdbGamePicker";
import {
  SGDB_PICKER_CLOSE_BUTTON,
  SGDB_PICKER_EXPLANATION,
  SGDB_PICKER_FIELD_LABEL,
  SGDB_PICKER_NO_PREVIEW,
  SGDB_PICKER_RESULTS_NOTE,
  SGDB_PICKER_SEARCH_BUTTON,
  SGDB_PICKER_TITLE,
} from "../../../utils/sgdbPickerWording";
import { GAME_CHANGE_DISCARDS_CHOICES } from "../../../utils/artworkTabWording";
import {
  DIALOG_ERROR_STYLE,
  DIALOG_INPUT_STYLE,
  DIALOG_MUTED_STYLE,
  DIALOG_TEXT_STYLE,
  DesktopDialog,
  dialogButtonStyle,
} from "./DesktopDialog";

export interface DesktopSgdbGamePickerDialogProps {
  romId: number;
  appId: number;
  romName: string;
  candidates?: SgdbCandidate[] | undefined;
  /** The ROM has images the user chose, which the change discards. */
  discardsChoices?: boolean | undefined;
  onApplied?: ((applied: number | EndpointFailure) => void) | undefined;
  onClose: () => void;
}

const DISCARDS_CHOICES_STYLE = { ...DIALOG_TEXT_STYLE, color: "#ffb74d" };

export const DesktopSgdbGamePickerDialog: FC<DesktopSgdbGamePickerDialogProps> = ({
  romId,
  appId,
  romName,
  candidates,
  discardsChoices,
  onApplied,
  onClose,
}) => {
  const [term, setTerm] = useState(romName);
  const [results, setResults] = useState<SgdbCandidate[]>(candidates ?? []);
  const [searching, setSearching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = async (e?: FormEvent) => {
    e?.preventDefault();
    if (searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const outcome = await executeSgdbCandidateSearch(term, { tag: "DesktopSgdbGamePickerDialog" });
      if (outcome.success) {
        setResults(outcome.games);
      } else {
        setResults([]);
        setSearchError(outcome.error);
      }
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = async (selectedId: number) => {
    if (applying) return;
    setApplying(true);
    try {
      const outcome = await executeSgdbSelectionApply({
        romId,
        appId,
        selectedId,
        onApplied,
        tag: "DesktopSgdbGamePickerDialog",
      });
      if (outcome.success) {
        onClose();
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <DesktopDialog
      titleId="tender-desktop-sgdb-picker-title"
      title={SGDB_PICKER_TITLE}
      onDismiss={applying ? undefined : onClose}
    >
      <div style={{ fontSize: "13px", color: "rgba(255, 255, 255, 0.6)", marginBottom: "4px" }}>{romName}</div>
      <div style={DIALOG_TEXT_STYLE}>{SGDB_PICKER_EXPLANATION}</div>
      {discardsChoices ? <div style={DISCARDS_CHOICES_STYLE}>{GAME_CHANGE_DISCARDS_CHOICES}</div> : null}

      <form onSubmit={(e) => void handleSearch(e)} style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <input
          type="text"
          value={term}
          placeholder={SGDB_PICKER_FIELD_LABEL}
          aria-label={SGDB_PICKER_FIELD_LABEL}
          style={{ ...DIALOG_INPUT_STYLE, flex: 1 }}
          onChange={(e) => {
            setTerm(e.target.value);
            setSearchError(null);
          }}
          disabled={searching || applying}
        />
        <button
          type="submit"
          disabled={searching || applying}
          style={{ ...dialogButtonStyle("primary", searching || applying), width: "90px", textAlign: "center" }}
        >
          {searching ? "Searching…" : SGDB_PICKER_SEARCH_BUTTON}
        </button>
      </form>

      {searchError !== null && (
        <div role="alert" style={DIALOG_ERROR_STYLE}>
          {searchError}
        </div>
      )}

      {results.length > 0 && (
        <div style={{ ...DIALOG_MUTED_STYLE, marginBottom: "8px" }}>{SGDB_PICKER_RESULTS_NOTE}</div>
      )}

      {results.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "10px",
            maxHeight: "360px",
            overflowY: "auto",
            paddingRight: "4px",
            marginBottom: "12px",
          }}
        >
          {results.map((game) => (
            <button
              key={game.id}
              type="button"
              disabled={applying}
              onClick={() => void handleSelect(game.id)}
              className="tender-desktop-sgdb-candidate"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "8px",
                gap: "6px",
                background: "rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "4px",
                cursor: applying ? "not-allowed" : "pointer",
                opacity: applying ? 0.6 : 1,
                textAlign: "center",
                color: "#ffffff",
                outline: "none",
              }}
            >
              {game.thumb_url ? (
                <img
                  src={game.thumb_url}
                  alt={game.name}
                  style={{
                    width: "120px",
                    height: "68px",
                    objectFit: "cover",
                    borderRadius: "3px",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "120px",
                    height: "68px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255, 255, 255, 0.08)",
                    borderRadius: "3px",
                    fontSize: "11px",
                    color: "#8f98a0",
                  }}
                >
                  {SGDB_PICKER_NO_PREVIEW}
                </div>
              )}
              <div
                style={{
                  fontSize: "12px",
                  lineHeight: "1.25",
                  wordBreak: "break-word",
                  fontWeight: 500,
                }}
              >
                {game.name}
              </div>
              {game.release_year != null && (
                <div style={{ fontSize: "11px", color: "#8f98a0" }}>{game.release_year}</div>
              )}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
        <button type="button" style={dialogButtonStyle("quiet")} disabled={applying} onClick={onClose}>
          {SGDB_PICKER_CLOSE_BUTTON}
        </button>
      </div>
    </DesktopDialog>
  );
};
