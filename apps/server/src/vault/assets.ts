import fs from "node:fs";
import path from "node:path";
import { VaultError, assertRealPathInsideVault } from "./paths.js";

export interface AssetUploadResult {
  name: string;
  vaultPath: string;
  markdownPath: string;
  previewUrl: string;
}

const ALLOWED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".bmp",
  ".ico",
]);

export function sanitizeFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new VaultError(
      "INVALID_FILE_TYPE",
      `Unsupported file extension: ${ext}. Only image files are allowed.`,
      400,
    );
  }

  const base = path.basename(originalName, ext);
  const cleanBase = base
    .replaceAll(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, "_")
    .slice(0, 50);

  return `${cleanBase || "image"}${ext}`;
}

export async function saveAsset(
  vaultRoot: string,
  originalFilename: string,
  buffer: Buffer,
  notePath: string,
): Promise<AssetUploadResult> {
  const sanitized = sanitizeFilename(originalFilename);
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");

  const targetDirRel = path.posix.join("attachments", year, month);
  const targetDirFull = path.join(vaultRoot, "attachments", year, month);

  await fs.promises.mkdir(targetDirFull, { recursive: true });
  await assertRealPathInsideVault(vaultRoot, targetDirFull, "existing");

  const fileName = `${Date.now()}-${sanitized}`;
  const vaultPath = path.posix.join(targetDirRel, fileName);
  const fullPath = path.join(targetDirFull, fileName);

  await fs.promises.writeFile(fullPath, buffer);

  // Compute relative Markdown path from note's directory to vaultPath
  const noteDir = path.posix.dirname(notePath);
  let markdownPath = path.posix.relative(noteDir === "." ? "" : noteDir, vaultPath);
  if (!markdownPath.startsWith(".")) {
    markdownPath = `./${markdownPath}`;
  }

  const previewUrl = `/api/raw/${vaultPath}`;

  return {
    name: sanitized,
    vaultPath,
    markdownPath,
    previewUrl,
  };
}
