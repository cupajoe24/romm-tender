/**
 * The decisions behind what the Library page's Platforms tab draws: the BIOS
 * table's marks, its legend and its Contents cell, what the core control can
 * offer, the header's core clause, what the BIOS buttons may do, and what a row's
 * one button is. Every surface that draws the tab reads them, so the QAM page and
 * the desktop's Library tab cannot disagree about a platform; each draws the
 * answers in its own palette, which is why a colour is answered as a tone.
 *
 * The words are `utils/platformsPageWording.ts`'s; the BIOS states'
 * `utils/biosSummary.ts`'s.
 *
 * Structure and vocabulary: `docs/architecture/qam-panel.md`, section Library.
 */

import type { FirmwarePlatformExt, SystemCoreInfo } from "../types";
import { fetchedAsRequired, isFetchable } from "./biosFetchable";
import { biosFileDescription, biosFileNote } from "./biosFileNote";
import { oneOfRowLine } from "./biosGroup";
import { biosHeldRatio } from "./biosHeldRatio";
import { biosSummary } from "./biosSummary";
import { emulatorDataReasonSentence } from "./emulatorSourceWording";
import type { CoreAnswer, PlatformRow, PlatformsPageState } from "./usePlatformsPage";

/** One row of the firmware overview's per-platform file list. Named off the
 *  payload rather than restated, so a field added to it reaches here. */
export type FirmwareRow = FirmwarePlatformExt["files"][number];

/**
 * What a mark's colour says, for each surface to paint in its own palette:
 * `good` a requirement met, `fine` a file here that nothing requires, `bad` a
 * requirement unmet, `quiet` a file missing that nothing requires, `unsure` a
 * need or verdict nothing could establish, `library` the second mark.
 */
export type MarkTone = "good" | "fine" | "bad" | "quiet" | "unsure" | "library";

export interface BiosMark {
  readonly glyph: string;
  readonly tone: MarkTone;
  /** What the mark means — the row's tooltip and the legend's line for it. */
  readonly title: string;
}

/**
 * The second mark: your RomM library does not hold this file.
 *
 * It sits BESIDE the verdict mark and never in place of it — the two are
 * different questions, and a row that is present but unfetchable ("you have it,
 * but you could not fetch it again") is exactly the combination a single
 * channel would lose. Which is why it also carries no need axis of its own: the
 * mark it stands next to already says whether the file is wanted.
 *
 * `⊘` is not one of the verdict shapes and reads as "not available" rather than
 * as a degree of wrong; DejaVu Sans carries U+2298, the same fontconfig
 * fallback the `✓`/`✗` glyphs already rely on for this table.
 */
export const LIBRARY_MARK: BiosMark = { glyph: "⊘", tone: "library", title: "not in your RomM library" };

/**
 * What each mark means — the row's own tooltip AND the legend's line for it, one
 * string serving both.
 *
 * They are the mark's IDENTITY, which is what the legend filters and keys on.
 * Glyph plus colour cannot be: since a one-of group's options became a state of
 * their own, red `✗` is two different sentences (a required file that is absent,
 * an option of a group whose region it serves has nothing in place) and so is
 * green `✓`. Keyed on the pair, the legend would have shown one of each and given
 * the second one React's duplicate key; keyed on the sentence, it shows exactly
 * the ones the table is in.
 */
const MARK_REQUIRED_MISSING = "required, missing";
const MARK_REQUIRED_HERE = "required, here";
const MARK_HERE = "here, not required";
const MARK_MISSING = "missing, not required";
// The `?` glyph's word, and it has to be true of every way a verdict is
// withheld — which since the `checked` vocabulary arrived includes a file the
// emulator READ and does not recognise. "could not be checked" was untrue of
// exactly that one, and it is the reachable case: DuckStation reads such an
// image, boots it, and calls it an unknown BIOS. So the mark says what the
// verdict is — nothing settled, in either direction — and WHY is the row's own
// note beside the name (`biosFileNote`), which is the one place a cause is
// worded.
const MARK_UNCHECKED = "nothing could establish this either way";
const MARK_HERE_NEED_UNKNOWN = "here; nothing could say whether this is wanted";
const MARK_MISSING_NEED_UNKNOWN = "missing; nothing could say whether this is wanted";
const MARK_ONE_OF_THESE_HERE = "one of these, here";
const MARK_ONE_OF_THESE_MISSING = "one of these, missing";

/**
 * The row's verdict, as the payload states it or as its silence leaves it.
 *
 * A folder's verdict is what it HOLDS, never that the folder is there — the
 * register's rule — so a payload carrying no verdict for one leaves the row
 * unestablished rather than falling back to presence. For a declared file
 * `downloaded` IS the verdict, which is the only thing the fallback is for.
 */
export function rowVerdict(file: FirmwareRow): boolean | null {
  const declaredFolder = file.declared_kind === "directory";
  const fallback = declaredFolder ? null : file.downloaded;
  return file.satisfied !== undefined ? file.satisfied : fallback;
}

/**
 * The first mark in one row's `On disk` cell, as a glyph and a tone.
 *
 * Two facts, two channels, so neither has to be read off the other:
 *
 * - **the glyph is the VERDICT** — `✓` met, `✗` not met, `?` nothing could
 *   establish it. It is `BiosFileEntry.satisfied`, **never presence**: for a
 *   declared folder the two come apart completely, since RetroDECK links
 *   LRPS2's `pcsx2/bios` onto the BIOS root, so the folder is always there and
 *   what satisfies the core is a file inside it.
 * - **the tone is the NEED** — strong where the core the platform launches
 *   with requires the file, quiet where it does not, **unsure where nothing
 *   could say**. Keyed on `required_by_active`, not `wanted`, because the
 *   summary above the table counts the same way and the two must not disagree
 *   about what "required" means.
 *
 * The two axes are read in that order, and the order is load-bearing. A
 * `wanted: "unknown"` row has no placement and a launching emulator whose
 * reading is incomplete (`reading_complete_for`, `domain/firmware_wants.py`),
 * and its verdict is `downloaded` all the same (`domain/bios_status.py`,
 * `_row_verdict(None, …)`), so it IS established. Testing the need axis first
 * would spend the glyph on a need-axis fact and throw that verdict away, and a
 * platform nothing could be asked about is made entirely of such rows: that is
 * the pane telling the reader they can place BIOS files by hand, so which ones
 * are already there is the one thing it must not stop saying.
 *
 * So the four states come out as required + met `good` `✓`, required + unmet
 * `bad` `✗`, not required + met `fine` `✓`, not required + unmet `quiet` `✗`; a
 * need nothing could establish keeps its glyph and goes `unsure`; and only a
 * verdict nothing could establish becomes `?`.
 *
 * `not_needed` and `optional` share the quiet branch on purpose: for the core
 * about to launch, a file it does not require is not a gap either way.
 *
 * **An option of the launching emulator's one-of group (`one_of`) is the one need
 * the two channels above cannot carry**, and it is the fifth state rather than a
 * shade of the fourth: the emulator marks no such file required, because the
 * group is the requirement and the file one way to meet it, yet a missing one
 * leaves the regions it serves with nothing to boot. So it is strong like a
 * required row, under its own words, and it is asked between the two above and
 * the required/not-required pair below: an unestablished verdict is still `?`,
 * and an unestablished NEED is still `unsure`, both tested first. Which region it
 * serves is the line under the row ({@link oneOfRowLine}).
 *
 * The `Contents` cell reads the same `satisfied`, so the two columns are two
 * renderings of one field and cannot contradict each other.
 */
export function diskMark(file: FirmwareRow): BiosMark {
  const verdict = rowVerdict(file);
  if (verdict === null) return { glyph: "?", tone: "unsure", title: MARK_UNCHECKED };

  const needUnknown = file.wanted === "unknown";
  const required = file.required_by_active;
  const option = Boolean(file.one_of) && !required;
  if (verdict) {
    if (needUnknown) return { glyph: "✓", tone: "unsure", title: MARK_HERE_NEED_UNKNOWN };
    if (option) return { glyph: "✓", tone: "good", title: MARK_ONE_OF_THESE_HERE };
    return { glyph: "✓", tone: required ? "good" : "fine", title: required ? MARK_REQUIRED_HERE : MARK_HERE };
  }
  if (needUnknown) return { glyph: "✗", tone: "unsure", title: MARK_MISSING_NEED_UNKNOWN };
  if (option) return { glyph: "✗", tone: "bad", title: MARK_ONE_OF_THESE_MISSING };
  return { glyph: "✗", tone: required ? "bad" : "quiet", title: required ? MARK_REQUIRED_MISSING : MARK_MISSING };
}

/**
 * The row's second mark, or `null` where the library holds the file.
 *
 * One field, one rule, no conditionality on the verdict: a file downloaded
 * before it left the library is still one that cannot be fetched again, so the
 * mark appears beside a `✓` exactly as it does beside a `✗`.
 *
 * `on_server` absent is not `false` — it is a payload that never spoke about
 * the library — so an unstated row carries no mark rather than a claim.
 *
 * A declared FOLDER is out, and not as a special case: no RomM library holds a
 * folder, so `_overview_row` stamps every folder row `on_server: False`
 * unconditionally and the mark would say "your library does not hold this"
 * about something no library can. That is the sentence `biosFileNote` already
 * refuses to produce for the same reason, and the same reason keeps folder rows
 * out of the download filter and out of the download batch.
 */
export function libraryMark(file: FirmwareRow): BiosMark | null {
  return file.on_server === false && file.declared_kind !== "directory" ? LIBRARY_MARK : null;
}

/**
 * What the marks in `On disk` mean, as the legend under the table lists them.
 *
 * One entry per line, which is what makes a two-mark cell readable and is what
 * keeps the filter doing real work: only the entries the table actually
 * contains, because a line for a state no row is in explains nothing and costs
 * a row, the scarce thing on the QAM's pane. Mark 2 is inside that filter as
 * well — a platform whose library holds every file shows no line for it — and
 * gets one line rather than one per pairing, since it means the same beside
 * every verdict. The order is the order a reader cares about: what is wrong
 * first, then the second channel — and each of a group option's two states sits
 * beside the ordinary mark it shares a tone with, since a reader meeting two
 * `bad` `✗` lines is being told what separates them.
 *
 * The entries carry the same strings the rows' tooltips do, and match on them:
 * see the `MARK_*` block for why the glyph and tone cannot be the identity.
 */
export function biosLegend(files: readonly FirmwareRow[]): BiosMark[] {
  const marks = files.map((file) => diskMark(file));
  const order: BiosMark[] = [
    { glyph: "✗", tone: "bad", title: MARK_REQUIRED_MISSING },
    { glyph: "✗", tone: "bad", title: MARK_ONE_OF_THESE_MISSING },
    { glyph: "✓", tone: "good", title: MARK_REQUIRED_HERE },
    { glyph: "✓", tone: "good", title: MARK_ONE_OF_THESE_HERE },
    { glyph: "✗", tone: "unsure", title: MARK_MISSING_NEED_UNKNOWN },
    { glyph: "✓", tone: "unsure", title: MARK_HERE_NEED_UNKNOWN },
    { glyph: "?", tone: "unsure", title: MARK_UNCHECKED },
    { glyph: "✓", tone: "fine", title: MARK_HERE },
    { glyph: "✗", tone: "quiet", title: MARK_MISSING },
  ];
  const shown = order.filter((entry) => marks.some((mark) => mark.title === entry.title));
  if (files.some((file) => libraryMark(file) !== null)) shown.push(LIBRARY_MARK);
  return shown;
}

/**
 * The Contents cell — what a read of the row's destination found inside it.
 *
 * The em dash means **nothing was asked**, and must never come to mean "asked
 * and found nothing": the whole-machine inventory is deliberately unverified, so
 * a plain file row carries no content answer at all and #1803 is the work that
 * will give it one. A declared folder does carry one, because the resolver lists
 * that folder the way the core does, and the row's `satisfied` verdict is what
 * came back.
 *
 * "no image" covers both ways a folder fails its core — one holding nothing the
 * core would boot, and a plain file sitting where the core opens a folder —
 * because the core's listing reaches no image either way. Which of the two it is
 * belongs to the line under the row, whose wording is {@link biosFileNote}'s.
 */
export function contentsCell(file: FirmwareRow): string {
  if (file.declared_kind !== "directory") return "—";
  if (file.satisfied === true) {
    const held = file.images?.length ?? 0;
    if (held === 0) return "an image";
    return held === 1 ? "1 image" : `${held} images`;
  }
  return file.satisfied === false ? "no image" : "unknown";
}

/**
 * The folder the emulator declared this file in, with its trailing slash, or
 * `null` for a file that belongs at the root of the BIOS directory.
 *
 * The row's own name is a basename, so without this the pane cannot answer the
 * one question a user placing a file by hand has: which folder. 207 of the 695
 * declarations a stock RetroDECK ships name a subdirectory — `dc/dc_boot.bin`,
 * `ep128emu/roms/exos21.rom` — and their descriptions spell it in only 115 of
 * those, so the description is not a substitute for the declaration.
 */
export function declaredFolder(file: FirmwareRow): string | null {
  const declared = file.declared_path;
  if (!declared?.includes("/")) return null;
  return `${declared.slice(0, declared.lastIndexOf("/"))}/`;
}

/**
 * What a row says under itself: the emulator's description of the file, then
 * its lines — which region a one-of group's option serves, the row's note, and
 * the images a folder holds.
 *
 * The library note is the one sentence the cell's second mark now carries, and
 * on a platform whose library holds little it was the same words under nearly
 * every row, so a row whose note is the library's says nothing more. An option
 * of the group says which region it serves, under the row — the mark beside the
 * name has room for a glyph, and the region is the reason the file matters.
 *
 * Each image string is the resolver's verbatim, and a surface keeps its spacing
 * (`pre-wrap`): the column padding PCSX2 puts in its own option labels is what
 * makes a line matchable against the emulator's own picker.
 */
export function biosRowText(file: FirmwareRow): { description: string | null; lines: string[] } {
  const { note, lines, fromLibrary } = biosFileNote(file);
  const groupLine = file.one_of && !file.required_by_active ? [oneOfRowLine(file.one_of, rowVerdict(file))] : [];
  return {
    description: biosFileDescription(file) || null,
    lines: [...groupLine, ...(fromLibrary ? [] : [...(note ? [note] : []), ...lines])],
  };
}

/**
 * What a platform's BIOS section says and may do, from its one firmware answer.
 */
export interface BiosSectionView {
  /** The short status, the section's coloured note. */
  readonly status: string;
  /** The sentence under the title, with the library's own ratio behind it. */
  readonly sentence: string;
  /** Not one row was answered, so the section says where a file can be put by hand. */
  readonly nothingEstablished: boolean;
  /** How many missing files Download required would fetch. */
  readonly requiredMissing: number;
  readonly canDownloadRequired: boolean;
  readonly canDownloadAll: boolean;
  /** The names of the rows that offer their own Download. */
  readonly fetchable: ReadonlySet<string>;
  /** How many of the plugin's own downloads Delete BIOS would remove. */
  readonly deletable: number;
  /** How many rows nothing installed could answer for. */
  readonly unanswered: number;
}

export function biosSectionView(firmware: FirmwarePlatformExt, serverOffline: boolean): BiosSectionView {
  const files = firmware.files;
  // The library's own progress, read nowhere but `allDone`, which is one of
  // `canDownloadAll`'s conditions. Counted over what the LIBRARY holds, not over
  // the rows — the rows include files no library holds, and offering to fetch
  // those is work the user cannot do. What the pane STATES is a separate reader
  // of the same pair (`utils/biosHeldRatio`), and the optional-missing breakdown
  // below is a local file-level axis the level doesn't model.
  const total = firmware.server_count ?? files.filter((f) => f.on_server).length;
  const done = firmware.local_count ?? files.filter((f) => f.on_server && f.downloaded).length;
  const allDone = done === total;

  const requiredWithheld = firmware.required_withheld ?? 0;
  const systemImage = firmware.system_image ?? "not_demanded";
  // **No surface words the seven states itself** — `utils/biosSummary.ts`
  // holds them, and the section takes both halves of one answer: the short
  // `status` as the section's coloured note, where the title beside it says what
  // is being counted, and the `sentence` under it. The console's own demand
  // outranking the level's decline is decided in there too, which is what stops
  // this pane from reading that order differently from the game page's.
  const { status, sentence } = biosSummary(firmware, files, firmware.bios_level ?? null);
  // The narrowest of the declines: not one row on the platform was answered, so
  // the pane has nothing to point the reader at and says where a file can be put
  // instead. A withheld required row and an unsettled console demand are both
  // declined VERDICTS over rows that DID answer, and neither reaches this. It
  // decides one extra LINE only — what the pane offers to fetch is a separate
  // question with a separate input, below.
  const nothingEstablished =
    firmware.bios_level === "unknown" &&
    systemImage !== "absent" &&
    requiredWithheld === 0 &&
    systemImage !== "unsettled";

  // The download affordances key off what is missing AND fetchable, and read
  // the VERDICT nowhere — not `bios_level`, not `required_withheld`, not
  // `system_image`. They are two independent questions: what the RESOLVER could
  // establish is the emulator's demand, what is FETCHABLE is what the RomM
  // library holds, and neither answers the other. A required file the library
  // does not hold leaves the platform not ready and still gives the user
  // nothing to press here; a platform nothing could be read for still has a
  // library behind it, and fetching from it is the one action that moves the
  // platform along at all.
  //
  // The two further inputs below are of those same two kinds, and neither is a
  // readiness gate either: `fetch_for_required` is the launching emulator's own
  // demand — its required files, and the options of the regions its one-of
  // group does not cover yet, the one rule the download itself applies — and
  // `allDone` is the library's own finished ratio.
  //
  // Reading readiness here is what took the buttons off PS2, GameCube and PSP
  // the moment a BIOS answer was scoped to the emulator that actually launches:
  // those launch standalone emulators the resolver holds no card for, so the
  // verdict declines — which says nothing whatever about the files their
  // library offers.
  //
  // Which rows are fetchable at all — the library's side of it, including why a
  // declared folder is out — is `isFetchable`, shared with the game page's BIOS
  // tab so the two surfaces cannot disagree about what can be downloaded.
  const fetchableMissing = files.filter(isFetchable);
  const requiredMissing = fetchableMissing.filter(fetchedAsRequired).length;
  const hasOptionalMissing = fetchableMissing.some((f) => !fetchedAsRequired(f));
  return {
    status,
    // The library's own ratio rides along behind the sentence, in every one of
    // the seven states and in the words the game page uses —
    // `utils/biosHeldRatio` writes it for both, because the two surfaces say one
    // thing about a platform and a fact one of them carries is a fact the other
    // is missing.
    sentence: `${sentence}${biosHeldRatio(firmware)}`,
    nothingEstablished,
    requiredMissing,
    canDownloadRequired: requiredMissing > 0 && !serverOffline,
    canDownloadAll: !allDone && (hasOptionalMissing || requiredMissing > 0) && !serverOffline,
    fetchable: new Set(fetchableMissing.map((f) => f.file_name)),
    // What Delete BIOS would remove — a record count, not a library one. There
    // is no local fallback: the rows say nothing about who downloaded a file, so
    // a payload without the field offers no delete rather than guessing.
    deletable: firmware.deletable_count ?? 0,
    unanswered: files.filter((f) => f.wanted === "unknown").length,
  };
}

/**
 * A BIOS row's one action: fetch it, or remove the copy we fetched — or
 * nothing.
 *
 * The two are alternatives in every state the pane can show, so one narrow
 * column carries both. They are not mutually exclusive by construction, though:
 * a file downloaded before an emu-atlas bump moved its placement is absent at
 * the new destination (so fetchable) and present at the recorded one (so
 * deletable). Download wins there, which is the useful half — the file the core
 * will look for is the one that is missing.
 *
 * **The delete's condition is `deletable_count` and nothing else.** That field
 * says how many of the plugin's own downloads a delete here would take, which
 * is the whole authority; `downloaded` is `os.path.exists` and is equally true
 * of `dolphin-emu/Sys/codehandler.bin`, which RetroDECK ships, no library can
 * hand back, and which sits one row above a real download on the GameCube pane.
 * The unlink itself re-reads the records and takes the path each one holds, so
 * this action cannot widen what it removes.
 *
 * A declared FOLDER offers it too, and that is a different rule from the one
 * that keeps a folder out of the downloads: there is no file to FETCH into a
 * name the emulator lists, but the files already inside it are ours wherever a
 * record names them. Its button carries the count and its delete is addressed
 * by the folder rather than by a file name, because no record carries the
 * folder's name.
 */
export type BiosRowAction =
  { readonly kind: "download" } | { readonly kind: "delete"; readonly folder: boolean; readonly count: number } | null;

export function biosRowAction(
  file: FirmwareRow,
  fetchable: ReadonlySet<string>,
  serverOffline: boolean,
): BiosRowAction {
  if (fetchable.has(file.file_name) && !serverOffline) return { kind: "download" };
  const count = file.deletable_count ?? 0;
  if (count === 0) return null;
  return { kind: "delete", folder: file.declared_kind === "directory", count };
}

/**
 * What a download button shows instead of its label: a spinner while its own run
 * is going, `failed` for the moment after one fails, or nothing.
 *
 * Both are keyed on the run's slug as well as the button's identity, because
 * `downloadPending` and `downloadFailed` name the button and every pane reads
 * the same state — without the slug a spinner would appear on the pane the
 * reader walked to. That pane shows disabled buttons and the line naming the
 * platform that is busy, which is what it always did.
 */
export function downloadState(row: PlatformRow, state: PlatformsPageState, id: string): "spinner" | "failed" | null {
  if (state.busySlug !== row.slug) return null;
  if (state.downloadPending === id) return "spinner";
  return state.downloadFailed === id ? "failed" : null;
}

/**
 * What the core control can do, and what to say about it.
 *
 * One decision, because the answer is rendered in two places — the header's
 * icon button and the line under it — and splitting it would let the two
 * disagree, which is a sentence saying there is nothing to switch under a
 * button that switches.
 *
 * `pick` opens the menu. `blocked` renders the SAME chip, disabled, with
 * `reason` in its tooltip — a control that is always there and greyed when
 * there is nothing to press, which is the ruling the Remove group already
 * follows. A sentence costs a row to report that nothing can be done; the
 * tooltip costs none and keeps the header's shape constant across panes.
 *
 * `notice` is for the branches that are not "nothing to switch" but a problem
 * with the platform or the install — a failed read, no RetroDECK, no emulator
 * at all. Those keep their line, because a greyed chip would hide a failure
 * behind a hover the Deck's controller has no way to perform.
 */
export type CoreOffer = { kind: "pick"; core: SystemCoreInfo } | { kind: "blocked"; reason: string; notice?: string };

export function coreOffer(core: CoreAnswer): CoreOffer {
  if (core === undefined) return { kind: "blocked", reason: "Reading the emulators for this platform…" };
  if (core === null) {
    const failed = "Could not read the emulators for this platform. Reopen the page to try again.";
    return { kind: "blocked", reason: failed, notice: failed };
  }
  if (!core.emulator_data_available) {
    const absent = emulatorDataReasonSentence(core.emulator_data_reason, core.emulator_source, core.platform_system);
    return { kind: "blocked", reason: absent, notice: absent };
  }
  // An EMPTY menu first, because it is the one case where the fallback fails
  // too. `_resolve_system` hands back the raw RomM slug for a platform its map
  // does not name, and `get_emulator_options` answers `available: true` with no
  // options for a system `es_systems.xml` does not list — `vic-20`,
  // `acorn-electron`, `nintendo-dsi`, `ps5`, `browser` and `win` are in neither
  // on this machine. RetroDECK's own launch then reads `command[1]` for the
  // system, finds nothing, logs "No valid emulator found for system" and exits
  // 1 (`libexec/run_game.sh`), so the games really do not start.
  if (core.emulators.length === 0) {
    const none = "RetroDECK lists no emulator for this platform, so its games will not launch.";
    return { kind: "blocked", reason: none, notice: none };
  }
  // Then the not-bakeable menu, ahead of the counts because it is not one:
  // `active_core_label` is null when nothing ES-DE lists is BAKEABLE, which says
  // nothing about how many entries there are. A platform whose only entry is a
  // standalone emulator this RetroDECK has not installed lands here with one
  // option, and one with two uninstalled ones lands here with two — where a
  // count-shaped branch would have said "offers one emulator" or nothing at all.
  //
  // What the fallback then DOES splits the state in two, and the payload can
  // tell them apart. `run_game.sh` takes `command[1]` for the system when no
  // alternate emulator is set, and `options` keeps ES-DE's document order, so
  // `emulators[0]` IS that command. If its emulator is the one RetroDECK has
  // not installed, the fallback names a binary that is not there and the games
  // do not start. Every other reason leaves the muted branch, which is where
  // Apple I lands: run through this repo's own `classify_command` over the
  // shipped `es_systems.xml`, its two commands come back
  // `no_rom_target` and `quoting`, both `kind: "standalone"` with a null
  // `core_so`. The first is unbakeable because its whole MAME invocation is one
  // quoted argument, so it does not end in `%ROM%` — a different reason from
  // the second's, and neither is `not_installed`.
  if (core.active_core_label === null) {
    const fallback = core.emulators[0];
    if (fallback?.reason === "not_installed") {
      return {
        kind: "blocked",
        reason: `RetroDECK would launch these with ${fallback.label}, which is not installed — and nothing here can pin a different one.`,
        notice: `RetroDECK would launch these with ${fallback.label}, which is not installed — and nothing here can pin a different one.`,
      };
    }
    return {
      kind: "blocked",
      reason: "None of this platform's emulators can be pinned from here, so RetroDECK picks one when a game launches.",
      notice: "None of this platform's emulators can be pinned from here, so RetroDECK picks one when a game launches.",
    };
  }
  // One count branch, and it is exactly true: an empty menu was answered two
  // branches up and a not-bakeable one the branch after it, so a single option
  // here is a single BAKEABLE one — there really is nothing to switch to.
  if (core.emulators.length === 1) {
    return { kind: "blocked", reason: "This platform offers one emulator, so there is nothing to switch." };
  }
  return { kind: "pick", core };
}

/**
 * The tone the header's core clause and its chip both take: nothing can be
 * pinned at all (`unpinnable`), an override the user chose (`override`), or
 * everything else, including a platform running its default (`plain`).
 */
export type CoreTone = "unpinnable" | "override" | "plain";

/** What the header's core clause reads where no option can be pinned: which of
 *  the three unpinnable states the platform is in, said in the fewest words the
 *  state supports. */
function fallbackLabel(noEmulator: boolean, fallbackMissing: boolean): string {
  if (noEmulator) return "no emulator";
  return fallbackMissing ? "no emulator installed" : "RetroDECK decides";
}

/**
 * The header's core clause, or `null` where it says nothing, and the tone its
 * clause and chip share — one answer, so the icon and the words beside it cannot
 * disagree.
 *
 * The clause is absent while this platform's core read is in flight, and stays
 * absent if it failed — the read is issued per selection, so walking the list
 * shows each newly focused platform's header without a core until its own answer
 * lands.
 *
 * The clause NAMES the core, and "Default" is not one of the names it can take:
 * `resolve_platform_label` answers with the real label in both ordinary cases —
 * the per-platform override where it still resolves, else the es_systems
 * default. Printing "Default" said the opposite of what was true.
 *
 * `null` splits in two, and only one half is a failure. With options on the menu
 * it means none is BAKEABLE, and `select_default_option` says what follows: the
 * plain RetroDECK launch is baked and RetroDECK resolves the emulator itself, so
 * the games still start and the clause says who is choosing. With NO options
 * there is nothing for RetroDECK to resolve either — its own launch exits 1 —
 * and the clause says so, as unpinnable.
 */
export function coreClause(core: CoreAnswer): { clause: string | null; tone: CoreTone } {
  const activeLabel = core ? core.active_core_label : null;
  // Everything the clause says rests on the emulator list having been READ.
  // `get_emulator_options` answers `available: false` with an EMPTY list when
  // `es_systems.xml` cannot be read at all, so a clause keyed on the list's
  // length alone said "no emulator" in red over a state where nothing was
  // established — the definite failure claim this pane keeps having to remove,
  // and beside a sentence saying RetroDECK was not found. One premise, named
  // once, so the two readings below cannot drift apart.
  // S6582 is raised on the declaration line, so its NOSONAR must sit there; prettier-ignore keeps
  // the formatter from wrapping the trailing comment onto its own line, which would unsuppress it.
  // prettier-ignore
  const emulatorsKnown = core != null && core.emulator_data_available; // NOSONAR(typescript:S6582) — `core?.emulator_data_available` loses the aliased narrowing TypeScript takes from this form, and `core.emulators` two lines below then fails TS18049 twice. The optional chain is shorter and does not type-check.
  const noEmulator = emulatorsKnown && core.emulators.length === 0;
  // The fallback RetroDECK would use is missing, so the clause says that rather
  // than naming a core nothing can run. Same shape as the empty menu: a state
  // the games do not start in.
  const fallbackMissing = emulatorsKnown && activeLabel === null && core.emulators[0]?.reason === "not_installed";
  // The platform-level twin of the game page's `activeCoreIsDefault`, read off
  // the payload's own `is_default`, which marks the single option
  // `select_default_option` picks. No active label is `plain` rather than
  // `override`, because `find` on a null label returns nothing and "not the
  // default" is not the same statement as "an override".
  const activeIsDefault = core?.emulators.find((option) => option.label === activeLabel)?.is_default ?? false;
  let tone: CoreTone = "plain";
  if (noEmulator || fallbackMissing) tone = "unpinnable";
  else if (activeLabel !== null && !activeIsDefault) tone = "override";
  // No clause at all where the list could not be read — the same silence a
  // failed or in-flight core read gets, and for the same reason.
  if (!emulatorsKnown) return { clause: null, tone };
  return { clause: activeLabel ?? fallbackLabel(noEmulator, fallbackMissing), tone };
}

/**
 * Which of the three ways to have no BIOS rows a platform without an answer is
 * in, or `null` where it has one.
 */
export function biosAbsence(row: PlatformRow): "pending" | "failed" | "nothing" | null {
  if (row.firmware || row.firmwareState === "answered") return null;
  return row.firmwareState;
}
