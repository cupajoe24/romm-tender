import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { useOutsideClick } from "./useOutsideClick";

describe("useOutsideClick", () => {
  it("does not call callback when inactive", () => {
    const onOutside = vi.fn();
    const div = document.createElement("div");
    document.body.appendChild(div);

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(div);
      useOutsideClick(ref, onOutside, false);
    });

    const outsideDiv = document.createElement("div");
    document.body.appendChild(outsideDiv);
    outsideDiv.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(onOutside).not.toHaveBeenCalled();
    div.remove();
    outsideDiv.remove();
  });

  it("calls callback when mousedown occurs outside element", () => {
    const onOutside = vi.fn();
    const div = document.createElement("div");
    document.body.appendChild(div);

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(div);
      useOutsideClick(ref, onOutside, true);
    });

    const outsideDiv = document.createElement("div");
    document.body.appendChild(outsideDiv);
    outsideDiv.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(onOutside).toHaveBeenCalledTimes(1);
    div.remove();
    outsideDiv.remove();
  });

  it("does not call callback when mousedown occurs inside element", () => {
    const onOutside = vi.fn();
    const div = document.createElement("div");
    const child = document.createElement("span");
    div.appendChild(child);
    document.body.appendChild(div);

    renderHook(() => {
      const ref = useRef<HTMLDivElement>(div);
      useOutsideClick(ref, onOutside, true);
    });

    child.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(onOutside).not.toHaveBeenCalled();
    div.remove();
  });
});
