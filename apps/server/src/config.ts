import fs from "node:fs";
import path from "node:path";

export interface AppConfig {
  host: string;
  port: number;
  vaultRoot: string;
  customCssPath: string;
  maxNoteBytes: number;
  maxUploadBytes: number;
  publicDir?: string;
  fontsDir?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const host = env.HOST || "127.0.0.1";
  const port = Number.parseInt(env.PORT || "3000", 10);
  const rawVaultRoot = env.VAULT_ROOT || "./test-vault";
  const vaultRoot = path.resolve(process.cwd(), rawVaultRoot);

  if (!fs.existsSync(vaultRoot)) {
    throw new Error(`VAULT_ROOT does not exist: ${vaultRoot}`);
  }

  const stat = fs.statSync(vaultRoot);
  if (!stat.isDirectory()) {
    throw new Error(`VAULT_ROOT must be a directory: ${vaultRoot}`);
  }

  const customCssPath = path.resolve(
    process.cwd(),
    env.CUSTOM_CSS_PATH || "./config/custom.css",
  );
  const maxNoteBytes = Number.parseInt(
    env.MAX_NOTE_BYTES || "2097152",
    10,
  );
  const maxUploadBytes = Number.parseInt(
    env.MAX_UPLOAD_BYTES || "20971520",
    10,
  );

  const defaultWebDist = path.resolve(process.cwd(), "./apps/web/dist");
  const fallbackWebDist = path.resolve(process.cwd(), "../web/dist");

  const publicDir = env.PUBLIC_DIR
    ? path.resolve(process.cwd(), env.PUBLIC_DIR)
    : fs.existsSync(defaultWebDist)
      ? defaultWebDist
      : fs.existsSync(fallbackWebDist)
        ? fallbackWebDist
        : undefined;

  const fontsDir = env.FONTS_DIR
    ? path.resolve(process.cwd(), env.FONTS_DIR)
    : path.resolve(process.cwd(), "./config/fonts");

  return {
    host,
    port,
    vaultRoot,
    customCssPath,
    maxNoteBytes,
    maxUploadBytes,
    publicDir,
    fontsDir,
  };
}
