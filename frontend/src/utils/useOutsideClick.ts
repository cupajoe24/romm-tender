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

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [ref, onOutsideClick, active]);
}
