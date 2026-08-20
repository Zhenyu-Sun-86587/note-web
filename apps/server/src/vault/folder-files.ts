import fs from "node:fs";
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

export async function deleteFolder(
  vaultRoot: string,
  relativePath: string,
): Promise<void> {
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
