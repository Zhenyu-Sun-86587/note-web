import fs from "node:fs";
import path from "node:path";
import {
  resolveExistingFolderPath,
  resolveNewFolderPath,
  VaultError,
} from "./paths.js";

export async function createFolder(
  vaultRoot: string,
  relativePath: string,
): Promise<void> {
  const { fullPath } = await resolveNewFolderPath(vaultRoot, relativePath);
  await fs.promises.mkdir(fullPath);
}

export async function renameFolder(
  vaultRoot: string,
  fromRelativePath: string,
  toRelativePath: string,
): Promise<void> {
  const normalizedFrom = fromRelativePath
    ? fromRelativePath.replaceAll("\\", "/").trim()
    : "";
  if (!normalizedFrom || normalizedFrom === "." || normalizedFrom === "/") {
    throw new VaultError(
      "ACCESS_DENIED",
      "Cannot rename vault root folder",
      403,
    );
  }

  const { fullPath: srcFull } = await resolveExistingFolderPath(
    vaultRoot,
    fromRelativePath,
  );
  const { fullPath: destFull } = await resolveNewFolderPath(
    vaultRoot,
    toRelativePath,
  );

  const parentDir = path.dirname(destFull);
  await fs.promises.mkdir(parentDir, { recursive: true });

  await fs.promises.rename(srcFull, destFull);
}

export async function deleteFolder(
  vaultRoot: string,
  relativePath: string,
): Promise<void> {
  const normalized = relativePath
    ? relativePath.replaceAll("\\", "/").trim()
    : "";
  if (!normalized || normalized === "." || normalized === "/") {
    throw new VaultError(
      "ACCESS_DENIED",
      "Cannot delete vault root folder",
      403,
    );
  }

  const { fullPath } = await resolveExistingFolderPath(vaultRoot, relativePath);

  const entries = await fs.promises.readdir(fullPath);
  if (entries.length > 0) {
    throw new VaultError(
      "FOLDER_NOT_EMPTY",
      "Folder is not empty. Only empty folders can be deleted.",
      400,
    );
  }

  await fs.promises.rmdir(fullPath);
}
