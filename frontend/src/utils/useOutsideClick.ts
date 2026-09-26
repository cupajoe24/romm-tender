import { useEffect, type RefObject } from "react";

/**
 * Invokes `onOutsideClick` when a mousedown occurs outside the element referenced by `ref`.
 *
 * Attaches a `mousedown` listener to the document while `active` is true.
 */
export function useOutsideClick<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T | null>,
  onOutsideClick: () => void,
  active: boolean = true,
): void {
  useEffect(() => {
    if (!active) return;

    const handleOutsideClick = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOutsideClick();
      }
    };

    const targetDoc = ref.current?.ownerDocument ?? (typeof document !== "undefined" ? document : null);
    if (!targetDoc) return;

    targetDoc.addEventListener("mousedown", handleOutsideClick);
    return () => {
      targetDoc.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [ref, onOutsideClick, active]);
}
