import type { EntryKind } from "../types";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Format a Unix timestamp (seconds) as a coarse human-readable date.
 *  Returns "Never" for zero/negative, "Today"/"Yesterday"/"Xd ago" for recent,
 *  and "DD Mon" (or "DD Mon YYYY" if not the current year) for older. */
export function formatLastPlayed(timestamp: number): string {
  if (!timestamp || timestamp <= 0) return "Never";
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  const day = date.getDate();
  const month = MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();
  if (year === now.getFullYear()) return `${day} ${month}`;
  return `${day} ${month} ${year}`;
}

/**
 * Resolve the last-played label, preferring the restored ISO timestamp over
 * Steam's recorded unix seconds when present.
 */
export function resolveLastPlayed(restoredIso: string | null, steamUnixSeconds: number): string {
  if (restoredIso) {
    const normalized =
      restoredIso.endsWith("Z") || /[+-]\d{2}(?::?\d{2})?$/.test(restoredIso) ? restoredIso : `${restoredIso}Z`;
    const ms = Date.parse(normalized);
    if (!Number.isNaN(ms)) return formatLastPlayed(Math.floor(ms / 1000));
  }
  return formatLastPlayed(steamUnixSeconds);
}

/** Format a Unix timestamp (seconds) as a release date string (e.g. "15 Mar 2003"). */
export function formatReleaseDate(timestamp: number | null): string | null {
  if (!timestamp || timestamp <= 0) return null;
  const date = new Date(timestamp * 1000);
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/** Format a byte count as a human-readable string (e.g. "12.4 KB", "1.23 GB"). Empty string for null. */
export function formatBytes(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Format a duration in minutes as a compact playtime string. */
export function formatPlaytime(minutes: number): string {
  if (!minutes || minutes <= 0) return "None";
  if (minutes < 60) return `${minutes} Min`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  if (remainingMin === 0) return hours === 1 ? "1 Hour" : `${hours} Hours`;
  return `${hours}h ${remainingMin}m`;
}

export function formatTimestamp(iso: string | null): string {
  if (!iso) return "unknown";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Like {@link formatTimestamp}, but carrying the YEAR and dropping the seconds.
 *
 * A separate function rather than a change to its sibling: every other caller
 * shows a save or a sync from the last few minutes, where the year is noise and
 * the seconds tell two writes apart. This one exists for the opposite case — two
 * copies of a library whose only distinguishing marks are their size and their
 * date, and which can easily be a year apart. Without the year they read as the
 * same day.
 */
export function formatTimestampWithYear(iso: string | null): string {
  if (!iso) return "unknown";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Format the status line for the "Uninstall All Installed ROMs" action.
 * Always shows the count of removed ROMs; appends an "(N errors)" suffix when
 * the backend reported any per-ROM failures.
 */
export function formatUninstallStatus(removedCount: number, errorCount: number): string {
  const baseMsg = `Removed ${removedCount} ROMs`;
  return errorCount > 0 ? `${baseMsg} (${errorCount} errors)` : baseMsg;
}

/**
 * Format an ISO-8601 timestamp as a coarse "Xm ago" label, recomputed at call time.
 * Mirrors what the backend used to emit but stays fresh between fetches —
 * the backend now ships only the raw ISO timestamp.
 *
 * Returns `null` when the input cannot be parsed; callers decide the fallback label.
 */
export function formatTimeAgo(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const diffMin = Math.floor((Date.now() - ms) / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return `${Math.floor(diffMin / 1440)}d ago`;
}

/** "2025-02-14 15:45:38" -> "2025-02-14 15:45" */
export function formatCardDate(dateStr: string): string {
  return dateStr.replace(/:\d{2}$/, "");
}

/** "2025-02-14 15:45:38" -> formatted localized string (e.g. "Feb 14, 2025, 3:45 PM") */
export function formatModalUnlockDate(dateStr: string): string {
  try {
    const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T");
    const d = new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }
  } catch {
    // fallback to compact string if parsing fails
  }
  return dateStr.replace(/:\d{2}$/, "");
}

/**
 * What each entry kind is called on screen (#260). One map for every dialog that
 * names one, so a fourth kind cannot be spelled out in one place and left to
 * render as its raw wire value in another: `Record<EntryKind, string>` makes
 * adding one to the wire a type error at every door at once.
 *
 * Absence is deliberately not in here. A kind the backend declined to name is a
 * different question per dialog — one of them never receives such an entry at
 * all, the other has its own word for it — and folding that in would put a
 * policy inside a vocabulary.
 */
export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  file: "file",
  dir: "folder",
  link: "shortcut to somewhere else",
};
