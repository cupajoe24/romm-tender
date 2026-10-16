import { describe, it, expect, beforeEach, vi } from "vitest";
import * as backend from "../api/backend";
import {
  OUTPUT_GONE,
  OUTPUT_MISSING,
  OUTPUT_READING,
  OUTPUT_UNREAD,
  UPDATE_OUTPUT_TITLE,
  isUpdateOutputReading,
  outputLineTone,
  outputStops,
  readUpdateOutputOnce,
  resetUpdateOutputReadingForTests,
  resolveUpdateOutputView,
} from "./updateOutputView";

describe("updateOutputView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(backend, "logError").mockImplementation(() => {});
    resetUpdateOutputReadingForTests();
  });

  describe("outputLineTone", () => {
    it("maps failure marks and install.sh prefix to danger", () => {
      expect(outputLineTone("[!!] failed step")).toBe("danger");
      expect(outputLineTone("install.sh: syntax error")).toBe("danger");
    });

    it("maps [ok] to success", () => {
      expect(outputLineTone("[ok] completed step")).toBe("success");
    });

    it("maps [..] to muted", () => {
      expect(outputLineTone("[..] in progress")).toBe("muted");
    });

    it("maps any other line to default", () => {
      expect(outputLineTone("regular terminal output")).toBe("default");
    });
  });

  describe("outputStops", () => {
    it("returns empty array for empty input", () => {
      expect(outputStops([])).toEqual([]);
    });

    it("chunks lines by line count limit (12 lines per stop)", () => {
      const lines = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`);
      const stops = outputStops(lines);
      expect(stops.length).toBe(3);
      expect(stops[0]!.split("\n").length).toBe(12);
      expect(stops[1]!.split("\n").length).toBe(12);
      expect(stops[2]!.split("\n").length).toBe(1);
    });

    it("chunks lines when character limit is exceeded", () => {
      const longLine = "a".repeat(700);
      const stops = outputStops([longLine, longLine]);
      expect(stops.length).toBe(2);
    });
  });

  describe("resolveUpdateOutputView", () => {
    it("returns reading state when output is undefined", () => {
      const state = resolveUpdateOutputView(undefined, "1.0.0");
      expect(state).toEqual({
        status: "reading",
        title: UPDATE_OUTPUT_TITLE,
        message: OUTPUT_READING,
      });
    });

    it("returns success state with formatted title and sections", () => {
      const output: backend.UpdateOutput = {
        success: true,
        ran_at: 1729000000,
        missing: null,
        installer: { lines: ["line 1", "line 2"], earlier: 0 },
        new_version: { lines: ["v2 line"], earlier: 0 },
      };
      const state = resolveUpdateOutputView(output, "1.1.0");
      expect(state.status).toBe("success");
      if (state.status === "success") {
        expect(state.title).toContain(UPDATE_OUTPUT_TITLE);
        expect(state.installer.lines).toEqual(["line 1", "line 2"]);
        expect(state.newVersion?.lines).toEqual(["v2 line"]);
        expect(state.newVersionHeading).toBe("1.1.0, when it tried to start");
      }
    });

    it("returns missing state when journal is missing", () => {
      const output: backend.UpdateOutput = {
        success: true,
        ran_at: null,
        missing: "rotated",
        installer: null,
        new_version: null,
      };
      const state = resolveUpdateOutputView(output, "1.1.0");
      expect(state).toEqual({
        status: "missing",
        title: UPDATE_OUTPUT_TITLE,
        message: OUTPUT_MISSING.rotated,
      });
    });

    it("returns gone state when failure record is not found", () => {
      const output = { success: false, reason: "not_found" } as unknown as backend.UpdateOutput;
      const state = resolveUpdateOutputView(output, "1.1.0");
      expect(state).toEqual({
        status: "gone",
        title: UPDATE_OUTPUT_TITLE,
        message: OUTPUT_GONE,
      });
    });

    it("returns unread state when response is null or an unknown failure", () => {
      const stateNull = resolveUpdateOutputView(null, "1.1.0");
      expect(stateNull).toEqual({
        status: "unread",
        title: UPDATE_OUTPUT_TITLE,
        message: OUTPUT_UNREAD,
      });

      const stateOther = resolveUpdateOutputView(
        { success: false, reason: "backend_error" } as unknown as backend.UpdateOutput,
        "1.1.0",
      );
      expect(stateOther).toEqual({
        status: "unread",
        title: UPDATE_OUTPUT_TITLE,
        message: OUTPUT_UNREAD,
      });
    });
  });

  describe("readUpdateOutputOnce", () => {
    it("fetches output and clears inFlight on success", async () => {
      const mockData = { success: true } as unknown as backend.UpdateOutput;
      vi.mocked(backend.getUpdateOutput).mockResolvedValueOnce(mockData);

      expect(isUpdateOutputReading()).toBe(false);
      const promise = readUpdateOutputOnce("2026-10-15T12:00:00Z");
      expect(isUpdateOutputReading()).toBe(true);

      const result = await promise;
      expect(result).toBe(mockData);
      expect(isUpdateOutputReading()).toBe(false);
    });

    it("returns null for concurrent calls while in flight", async () => {
      let resolveFetch!: (val: backend.UpdateOutput) => void;
      const delayed = new Promise<backend.UpdateOutput>((resolve) => {
        resolveFetch = resolve;
      });
      vi.mocked(backend.getUpdateOutput).mockReturnValueOnce(delayed);

      const first = readUpdateOutputOnce(null);
      const second = await readUpdateOutputOnce(null);

      expect(second).toBeNull();
      resolveFetch({ success: true } as unknown as backend.UpdateOutput);
      await first;
    });

    it("catches errors, logs them, and returns null", async () => {
      vi.mocked(backend.getUpdateOutput).mockRejectedValueOnce(new Error("Network failed"));

      const result = await readUpdateOutputOnce(null);
      expect(result).toBeNull();
      expect(backend.logError).toHaveBeenCalled();
      expect(isUpdateOutputReading()).toBe(false);
    });
  });
});
