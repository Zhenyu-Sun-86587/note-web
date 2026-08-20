import fs from "node:fs";
import path from "node:path";

export class VaultError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "VaultError";
  }
}

const BLOCKED_SEGMENTS = new Set([".git", "node_modules"]);

export function normalizeVaultPath(input: string): string {
  const value = input.replaceAll("\\", "/").trim();

  if (!value || value.includes("\0") || value.startsWith("/")) {
    throw new VaultError("INVALID_PATH", "Invalid vault path", 400);
  }

  const segments = value.split("/").filter(Boolean);

  if (
    segments.some(
      (segment) =>
        segment === ".." ||
        segment.startsWith(".") ||
        BLOCKED_SEGMENTS.has(segment),
    )
  ) {
    throw new VaultError("INVALID_PATH", "Invalid vault path", 400);
  }

  return segments.join("/");
}

export function isPathInsideVault(vaultRoot: string, targetPath: string): boolean {
  const rel = path.relative(vaultRoot, targetPath);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

export async function resolveExistingNotePath(
  vaultRoot: string,
  input: string,
): Promise<{ fullPath: string; relativePath: string }> {
  const normalized = normalizeVaultPath(input);
  if (!normalized.endsWith(".md")) {
    throw new VaultError("INVALID_PATH", "Note path must end with .md", 400);
  }

  const fullPath = path.resolve(vaultRoot, normalized);
  if (!isPathInsideVault(vaultRoot, fullPath)) {
    throw new VaultError("ACCESS_DENIED", "Path is outside vault root", 403);
  }

  try {
    const stat = await fs.promises.lstat(fullPath);
    if (stat.isSymbolicLink()) {
      throw new VaultError("ACCESS_DENIED", "Symbolic links are not allowed", 403);
    }
    if (stat.isDirectory()) {
      throw new VaultError("INVALID_PATH", "Target path is a directory", 400);
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new VaultError("NOTE_NOT_FOUND", "Note not found", 404);
    }
    throw err;
  }

  return { fullPath, relativePath: normalized };
}

export async function resolveNewNotePath(
  vaultRoot: string,
  input: string,
): Promise<{ fullPath: string; relativePath: string }> {
  const normalized = normalizeVaultPath(input);
  if (!normalized.endsWith(".md")) {
    throw new VaultError("INVALID_PATH", "Note path must end with .md", 400);
  }

  const fullPath = path.resolve(vaultRoot, normalized);
  if (!isPathInsideVault(vaultRoot, fullPath)) {
    throw new VaultError("ACCESS_DENIED", "Path is outside vault root", 403);
  }

  // Parent directory check
  const parentDir = path.dirname(fullPath);
  try {
    const parentStat = await fs.promises.lstat(parentDir);
    if (parentStat.isSymbolicLink()) {
      throw new VaultError("ACCESS_DENIED", "Symbolic links are not allowed", 403);
    }
    if (!parentStat.isDirectory()) {
      throw new VaultError("FOLDER_NOT_FOUND", "Parent folder is not a directory", 400);
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new VaultError("FOLDER_NOT_FOUND", "Parent folder does not exist", 404);
    }
    throw err;
  }

  // Check target does not exist
  try {
    await fs.promises.lstat(fullPath);
    throw new VaultError("NOTE_ALREADY_EXISTS", "Note already exists", 409);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // Good, it does not exist
      return { fullPath, relativePath: normalized };
    }
    throw err;
  }
}

export async function resolveExistingFolderPath(
  vaultRoot: string,
  input: string,
): Promise<{ fullPath: string; relativePath: string }> {
  if (!input || input === "." || input === "/") {
    return { fullPath: vaultRoot, relativePath: "" };
  }

  const normalized = normalizeVaultPath(input);
  const fullPath = path.resolve(vaultRoot, normalized);
  if (!isPathInsideVault(vaultRoot, fullPath)) {
    throw new VaultError("ACCESS_DENIED", "Path is outside vault root", 403);
  }

  try {
    const stat = await fs.promises.lstat(fullPath);
    if (stat.isSymbolicLink()) {
      throw new VaultError("ACCESS_DENIED", "Symbolic links are not allowed", 403);
    }
    if (!stat.isDirectory()) {
      throw new VaultError("FOLDER_NOT_FOUND", "Target is not a folder", 400);
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new VaultError("FOLDER_NOT_FOUND", "Folder not found", 404);
    }
    throw err;
  }

  return { fullPath, relativePath: normalized };
}

export async function resolveNewFolderPath(
  vaultRoot: string,
  input: string,
): Promise<{ fullPath: string; relativePath: string }> {
  const normalized = normalizeVaultPath(input);
  const fullPath = path.resolve(vaultRoot, normalized);
  if (!isPathInsideVault(vaultRoot, fullPath)) {
    throw new VaultError("ACCESS_DENIED", "Path is outside vault root", 403);
  }

  const parentDir = path.dirname(fullPath);
  try {
    const parentStat = await fs.promises.lstat(parentDir);
    if (parentStat.isSymbolicLink()) {
      throw new VaultError("ACCESS_DENIED", "Symbolic links are not allowed", 403);
    }
    if (!parentStat.isDirectory()) {
      throw new VaultError("FOLDER_NOT_FOUND", "Parent folder is not a directory", 400);
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new VaultError("FOLDER_NOT_FOUND", "Parent folder does not exist", 404);
    }
    throw err;
  }

  try {
    await fs.promises.lstat(fullPath);
    throw new VaultError("FOLDER_ALREADY_EXISTS", "Folder already exists", 409);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { fullPath, relativePath: normalized };
    }
    throw err;
  }
}

export async function resolveAssetPath(
  vaultRoot: string,
  input: string,
): Promise<{ fullPath: string; relativePath: string }> {
  const normalized = normalizeVaultPath(input);
  const fullPath = path.resolve(vaultRoot, normalized);
  if (!isPathInsideVault(vaultRoot, fullPath)) {
    throw new VaultError("ACCESS_DENIED", "Path is outside vault root", 403);
  }

  try {
    const stat = await fs.promises.lstat(fullPath);
    if (stat.isSymbolicLink()) {
      throw new VaultError("ACCESS_DENIED", "Symbolic links are not allowed", 403);
    }
    if (stat.isDirectory()) {
      throw new VaultError("INVALID_PATH", "Target path is a directory", 400);
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new VaultError("ASSET_NOT_FOUND", "Asset not found", 404);
    }
    throw err;
  }

  return { fullPath, relativePath: normalized };
}
