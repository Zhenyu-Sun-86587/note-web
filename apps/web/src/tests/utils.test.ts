import { describe, it, expect } from "vitest";
import {
  ensureMdExtension,
  removeMdExtension,
  getBasename,
  getDirname,
  joinPaths,
} from "../utils/note-path";
import { generateConflictPath } from "../utils/filename";
import { formatDate } from "../utils/date";

describe("Web Utils", () => {
  describe("note-path utils", () => {
    it("ensureMdExtension adds .md only when missing", () => {
      expect(ensureMdExtension("test")).toBe("test.md");
      expect(ensureMdExtension("test.md")).toBe("test.md");
      expect(ensureMdExtension("nested/test")).toBe("nested/test.md");
      expect(ensureMdExtension("")).toBe("");
    });

    it("removeMdExtension strips .md", () => {
      expect(removeMdExtension("test.md")).toBe("test");
      expect(removeMdExtension("test.txt")).toBe("test.txt");
      expect(removeMdExtension("test")).toBe("test");
    });

    it("getBasename and getDirname extract components correctly", () => {
      expect(getBasename("projects/backend/server.md")).toBe("server.md");
      expect(getDirname("projects/backend/server.md")).toBe("projects/backend");
      expect(getBasename("welcome.md")).toBe("welcome.md");
      expect(getDirname("welcome.md")).toBe("");
    });

    it("joinPaths combines path segments safely", () => {
      expect(joinPaths("projects", "backend", "note.md")).toBe(
        "projects/backend/note.md",
      );
      expect(joinPaths("/projects/", "/sub/")).toBe("projects/sub");
    });
  });

  describe("filename utils", () => {
    it("generateConflictPath creates conflict copy with timestamp", () => {
      const conflict = generateConflictPath("projects/server.md");
      expect(conflict).toMatch(/^projects\/server\.conflict-\d{8}-\d{6}\.md$/);

      const rootConflict = generateConflictPath("welcome.md");
      expect(rootConflict).toMatch(/^welcome\.conflict-\d{8}-\d{6}\.md$/);
    });
  });

  describe("date utils", () => {
    it("formatDate formats ISO string without throwing", () => {
      const formatted = formatDate("2026-08-20T12:00:00.000Z");
      expect(typeof formatted).toBe("string");
      expect(formatted.length).toBeGreaterThan(0);
    });
  });
});
