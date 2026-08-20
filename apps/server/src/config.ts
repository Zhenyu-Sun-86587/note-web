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

  const defaultCustomCss = path.resolve(process.cwd(), "./config/custom.css");
  const fallbackCustomCss = path.resolve(
    process.cwd(),
    "../../config/custom.css",
  );
  const altCustomCss = path.resolve(process.cwd(), "../config/custom.css");

  const customCssPath = env.CUSTOM_CSS_PATH
    ? path.resolve(process.cwd(), env.CUSTOM_CSS_PATH)
    : fs.existsSync(defaultCustomCss)
      ? defaultCustomCss
      : fs.existsSync(fallbackCustomCss)
        ? fallbackCustomCss
        : fs.existsSync(altCustomCss)
          ? altCustomCss
          : defaultCustomCss;

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

  const defaultFontsDir = path.resolve(process.cwd(), "./config/fonts");
  const fallbackFontsDir = path.resolve(
    process.cwd(),
    "../../config/fonts",
  );
  const altFontsDir = path.resolve(process.cwd(), "../config/fonts");

  const fontsDir = env.FONTS_DIR
    ? path.resolve(process.cwd(), env.FONTS_DIR)
    : fs.existsSync(defaultFontsDir)
      ? defaultFontsDir
      : fs.existsSync(fallbackFontsDir)
        ? fallbackFontsDir
        : fs.existsSync(altFontsDir)
          ? altFontsDir
          : defaultFontsDir;

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
