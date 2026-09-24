import { useState, useEffect } from "react";
import { getRomMetadataShared } from "../api/sharedReads";
import type { RomMetadata } from "../types";

/**
 * Loads ROM metadata asynchronously using shared in-flight caching,
 * with cancellation safety.
 */
export function useRomMetadata(romId: number | null | undefined): RomMetadata | null {
  const [loadedMetadata, setLoadedMetadata] = useState<RomMetadata | null>(null);

  useEffect(() => {
    if (!romId) return;

    let cancelled = false;
    void getRomMetadataShared(romId)
      .then((meta) => {
        if (!cancelled) {
          setLoadedMetadata(meta);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedMetadata(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [romId]);

  return romId ? loadedMetadata : null;
}
