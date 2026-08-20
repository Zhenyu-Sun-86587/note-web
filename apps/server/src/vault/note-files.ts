import fs from "node:fs";
import path from "node:path";
import { makeRevision } from "./revision.js";
import {
  resolveExistingNotePath,
  resolveNewNotePath,
  VaultError,
} from "./paths.js";

export interface NoteDocument {
  path: string;
  content: string;
  revision: string;
  modifiedAt: string;
  size: number;
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.note-web-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.tmp`;
  await fs.promises.writeFile(tempPath, content, "utf8");
  await fs.promises.rename(tempPath, filePath);
}

export async function readNote(
  vaultRoot: string,
  relativePath: string,
): Promise<NoteDocument> {
  const { fullPath, relativePath: normalizedPath } =
    await resolveExistingNotePath(vaultRoot, relativePath);

  const content = await fs.promises.readFile(fullPath, "utf8");
  const stat = await fs.promises.stat(fullPath);

  return {
    path: normalizedPath,
    content,
    revision: makeRevision(content),
    modifiedAt: stat.mtime.toISOString(),
    size: stat.size,
  };
}

export async function createNote(
  vaultRoot: string,
  relativePath: string,
  content = "",
): Promise<NoteDocument> {
  const { fullPath, relativePath: normalizedPath } = await resolveNewNotePath(
    vaultRoot,
    relativePath,
  );

  await atomicWrite(fullPath, content);
  const stat = await fs.promises.stat(fullPath);

  return {
    path: normalizedPath,
    content,
    revision: makeRevision(content),
    modifiedAt: stat.mtime.toISOString(),
    size: stat.size,
  };
}

export async function writeNote(
  vaultRoot: string,
  relativePath: string,
  content: string,
  baseRevision: string,
): Promise<NoteDocument> {
  const { fullPath, relativePath: normalizedPath } =
    await resolveExistingNotePath(vaultRoot, relativePath);

  const currentContent = await fs.promises.readFile(fullPath, "utf8");
  const currentRevision = makeRevision(currentContent);

  if (currentRevision !== baseRevision) {
    throw new VaultError(
      "REVISION_CONFLICT",
      "The file changed on disk",
      409,
      { currentRevision },
    );
  }

  await atomicWrite(fullPath, content);
  const stat = await fs.promises.stat(fullPath);

  return {
    path: normalizedPath,
    content,
    revision: makeRevision(content),
    modifiedAt: stat.mtime.toISOString(),
    size: stat.size,
  };
}

export async function moveNote(
  vaultRoot: string,
  fromPath: string,
  toPath: string,
): Promise<void> {
  const { fullPath: sourcePath } = await resolveExistingNotePath(
    vaultRoot,
    fromPath,
  );
  const { fullPath: destPath } = await resolveNewNotePath(vaultRoot, toPath);

  await fs.promises.rename(sourcePath, destPath);
}

export async function deleteNote(
  vaultRoot: string,
  relativePath: string,
): Promise<void> {
  const { fullPath } = await resolveExistingNotePath(vaultRoot, relativePath);
  await fs.promises.unlink(fullPath);
}
