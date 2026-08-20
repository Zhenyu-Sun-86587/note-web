import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  normalizeVaultPath,
  resolveExistingNotePath,
  resolveNewNotePath,
  resolveExistingFolderPath,
  resolveNewFolderPath,
  resolveAssetPath,
  VaultError,
} from "../vault/paths.js";
import { createTestContext, type TestContext } from "./helpers.js";

describe("vault/paths", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe("normalizeVaultPath", () => {
    it("normalizes basic paths and backslashes", () => {
      expect(normalizeVaultPath("inbox/welcome.md")).toBe("inbox/welcome.md");
      expect(normalizeVaultPath("inbox\\welcome.md")).toBe("inbox/welcome.md");
    });

    it("rejects invalid characters, absolute paths, and traversal", () => {
      expect(() => normalizeVaultPath("")).toThrow(VaultError);
      expect(() => normalizeVaultPath("/etc/passwd")).toThrow(VaultError);
      expect(() => normalizeVaultPath("../secret.md")).toThrow(VaultError);
      expect(() => normalizeVaultPath("foo/../secret.md")).toThrow(VaultError);
      expect(() => normalizeVaultPath("inbox/\0bad.md")).toThrow(VaultError);
      expect(() => normalizeVaultPath(".git/config")).toThrow(VaultError);
      expect(() => normalizeVaultPath(".hidden/note.md")).toThrow(VaultError);
    });
  });

  describe("resolveExistingNotePath", () => {
    it("resolves valid existing notes", async () => {
      const result = await resolveExistingNotePath(
        ctx.vaultRoot,
        "inbox/welcome.md",
      );
      expect(result.relativePath).toBe("inbox/welcome.md");
      expect(result.fullPath).toBe(
        path.join(ctx.vaultRoot, "inbox", "welcome.md"),
      );
    });

    it("rejects non-existent notes with 404", async () => {
      await expect(
        resolveExistingNotePath(ctx.vaultRoot, "inbox/nonexistent.md"),
      ).rejects.toThrowError(/Note not found/);
    });

    it("rejects non-md files", async () => {
      await expect(
        resolveExistingNotePath(ctx.vaultRoot, "inbox/file.txt"),
      ).rejects.toThrow(VaultError);
    });

    it("rejects symlinks", async () => {
      const symlinkPath = path.join(ctx.vaultRoot, "inbox", "symlink.md");
      try {
        await fs.promises.symlink(
          path.join(ctx.vaultRoot, "inbox", "welcome.md"),
          symlinkPath,
        );
        await expect(
          resolveExistingNotePath(ctx.vaultRoot, "inbox/symlink.md"),
        ).rejects.toThrowError(/Symbolic links are not allowed/);
      } catch (e) {
        if ((e as Error).message.includes("Symbolic links are not allowed")) {
          // as expected
        } else {
          throw e;
        }
      }
    });
  });

  describe("resolveNewNotePath", () => {
    it("resolves valid new note path when parent exists", async () => {
      const result = await resolveNewNotePath(
        ctx.vaultRoot,
        "inbox/new-note.md",
      );
      expect(result.relativePath).toBe("inbox/new-note.md");
      expect(result.fullPath).toBe(
        path.join(ctx.vaultRoot, "inbox", "new-note.md"),
      );
    });

    it("rejects existing note with 409", async () => {
      await expect(
        resolveNewNotePath(ctx.vaultRoot, "inbox/welcome.md"),
      ).rejects.toThrowError(/Note already exists/);
    });

    it("rejects if parent folder does not exist", async () => {
      await expect(
        resolveNewNotePath(ctx.vaultRoot, "no-such-folder/note.md"),
      ).rejects.toThrowError(/Parent folder does not exist/);
    });
  });

  describe("resolveExistingFolderPath & resolveNewFolderPath", () => {
    it("resolves root folder", async () => {
      const root = await resolveExistingFolderPath(ctx.vaultRoot, "");
      expect(root.fullPath).toBe(ctx.vaultRoot);
    });

    it("resolves existing subfolder", async () => {
      const folder = await resolveExistingFolderPath(ctx.vaultRoot, "projects");
      expect(folder.fullPath).toBe(path.join(ctx.vaultRoot, "projects"));
    });

    it("resolves new folder path", async () => {
      const newFolder = await resolveNewFolderPath(
        ctx.vaultRoot,
        "projects/backend",
      );
      expect(newFolder.relativePath).toBe("projects/backend");
    });
  });

  describe("resolveAssetPath", () => {
    it("resolves existing asset", async () => {
      const assetFull = path.join(ctx.vaultRoot, "attachments", "test.png");
      await fs.promises.writeFile(assetFull, "fake png content");

      const result = await resolveAssetPath(
        ctx.vaultRoot,
        "attachments/test.png",
      );
      expect(result.fullPath).toBe(assetFull);
    });
  });
});
