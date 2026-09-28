/**
 * Shared download progress color interpolation, gradient stops, and formatting utilities.
 * Used by both Big Picture (CustomPlayButton) and Desktop (DownloadingButton).
 */

export type RGB = [number, number, number];

/** Download button blue gradient stops (#1a9fff, #0078d4) */
export const BLUE_LEFT: RGB = [26, 159, 255];
export const BLUE_RIGHT: RGB = [0, 120, 212];

/** Big Picture play button visible green gradient stops (#50c82f, #18b14e) */
export const BPM_GREEN_LEFT: RGB = [80, 200, 47];
export const BPM_GREEN_RIGHT: RGB = [24, 177, 78];

/** Desktop play button green gradient stops (#59bf43, #409930) */
export const DESKTOP_GREEN_LEFT: RGB = [89, 191, 67];
export const DESKTOP_GREEN_RIGHT: RGB = [64, 153, 48];

/**
 * Linearly interpolate between two RGB colors by factor t (0..1).
 */
export function lerpColor(a: RGB, b: RGB, t: number): string {
  const clampedT = Math.min(1, Math.max(0, t));
  const r = Math.round(a[0] + (b[0] - a[0]) * clampedT);
  const g = Math.round(a[1] + (b[1] - a[1]) * clampedT);
  const bl = Math.round(a[2] + (b[2] - a[2]) * clampedT);
  return `rgb(${r}, ${g}, ${bl})`;
}

/**
 * Generate the progress fill gradient transitioning from blue to green.
 *
 * @param progressRatio 0..1 ratio of downloaded bytes
 * @param isExtracting whether extraction is active (solid green)
 * @param variant "bigpicture" or "desktop" for platform-specific green shades
 */
export function getDownloadFillGradient(
  progressRatio: number,
  isExtracting: boolean,
  variant: "bigpicture" | "desktop" = "bigpicture",
): string {
  const greenLeft = variant === "desktop" ? DESKTOP_GREEN_LEFT : BPM_GREEN_LEFT;
  const greenRight = variant === "desktop" ? DESKTOP_GREEN_RIGHT : BPM_GREEN_RIGHT;

  if (isExtracting) {
    return variant === "desktop"
      ? "linear-gradient(90deg, #59bf43 0%, #409930 100%)"
      : `linear-gradient(to right, rgb(${greenLeft.join(",")}), rgb(${greenRight.join(",")}))`;
  }

  const t = Math.min(1, Math.max(0, progressRatio));
  const dir = variant === "desktop" ? "90deg" : "to right";
  const stop1 = variant === "desktop" ? `${lerpColor(BLUE_LEFT, greenLeft, t)} 0%` : lerpColor(BLUE_LEFT, greenLeft, t);
  const stop2 =
    variant === "desktop" ? `${lerpColor(BLUE_RIGHT, greenRight, t)} 100%` : lerpColor(BLUE_RIGHT, greenRight, t);

  return `linear-gradient(${dir}, ${stop1}, ${stop2})`;
}

/**
 * Pulse color shifting from blue to green with progress; frozen amber while paused.
 */
export function getDownloadPulseColor(
  progressRatio: number,
  options: { paused?: boolean; extracting?: boolean; downloading?: boolean },
  variant: "bigpicture" | "desktop" = "bigpicture",
): string {
  if (options.paused) {
    return "rgba(212,167,44,0.7)";
  }
  const greenLeft = variant === "desktop" ? DESKTOP_GREEN_LEFT : BPM_GREEN_LEFT;
  if (options.extracting) {
    return `rgb(${greenLeft.join(", ")})`;
  }
  if (options.downloading) {
    const t = Math.min(1, Math.max(0, progressRatio));
    return lerpColor(BLUE_LEFT, greenLeft, t);
  }
  return "rgba(26,159,255,0.7)";
}

/**
 * Base background gradient for the unfilled portion of the download progress bar.
 */
export function getDownloadBaseBackground(
  progressRatio: number,
  options: { isOffline?: boolean; extracting?: boolean; downloading?: boolean },
): string {
  if (options.isOffline) {
    return "linear-gradient(to right, #6b7b8b, #5a6a7a)";
  }
  if (options.extracting) {
    return "linear-gradient(to right, #1a4d1a, #0f3320)";
  }
  if (options.downloading) {
    const t = Math.min(1, Math.max(0, progressRatio));
    return `linear-gradient(to right, ${lerpColor([10, 50, 90], [5, 35, 65], t)}, ${lerpColor([5, 35, 65], [5, 50, 30], t)})`;
  }
  return "linear-gradient(to right, #1a9fff, #0078d4)";
}

/**
 * Format download progress as "X / Y MB" (with unit only on the total)
 * matching Steam Big Picture's download progress format.
 */
export function formatProgress(downloaded: number, total: number): string {
  if (total < 1024) return `${downloaded} / ${total} B`;
  if (total < 1024 * 1024) return `${(downloaded / 1024).toFixed(1)} / ${(total / 1024).toFixed(1)} KB`;
  if (total < 1024 * 1024 * 1024)
    return `${(downloaded / (1024 * 1024)).toFixed(1)} / ${(total / (1024 * 1024)).toFixed(1)} MB`;
  return `${(downloaded / (1024 * 1024 * 1024)).toFixed(2)} / ${(total / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
