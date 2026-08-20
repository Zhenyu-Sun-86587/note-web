import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3030",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run start -w apps/server",
    url: "http://127.0.0.1:3030/api/health",
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: "3030",
      HOST: "127.0.0.1",
      VAULT_ROOT: path.resolve(__dirname, "test-vault"),
      FONTS_DIR: path.resolve(__dirname, "config/fonts"),
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
