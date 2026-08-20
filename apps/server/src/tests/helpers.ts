import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Express } from "express";
import { createApp } from "../app.js";
import type { AppConfig } from "../config.js";

export interface TestContext {
  vaultRoot: string;
  app: Express;
  cleanup: () => Promise<void>;
}

export async function createTestContext(): Promise<TestContext> {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "note-web-test-"),
  );

  // Setup basic folder structure in temp vault
  await fs.promises.mkdir(path.join(tmpDir, "inbox"), { recursive: true });
  await fs.promises.mkdir(path.join(tmpDir, "projects"), { recursive: true });
  await fs.promises.mkdir(path.join(tmpDir, "attachments"), {
    recursive: true,
  });

  await fs.promises.writeFile(
    path.join(tmpDir, "inbox", "welcome.md"),
    "# Welcome\nThis is a test note.\n",
    "utf8",
  );
  await fs.promises.writeFile(
    path.join(tmpDir, "projects", "alpha.md"),
    "# Project Alpha\nAlpha content line 2.\n",
    "utf8",
  );

  const config: AppConfig = {
    host: "127.0.0.1",
    port: 0,
    vaultRoot: tmpDir,
    customCssPath: path.join(tmpDir, "custom.css"),
    maxNoteBytes: 2097152,
    maxUploadBytes: 20971520,
  };

  const app = createApp(config);

  const cleanup = async () => {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  };

  return { vaultRoot: tmpDir, app, cleanup };
}
