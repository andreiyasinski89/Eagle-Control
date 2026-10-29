import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // PW_CHANNEL=msedge (or chrome) runs the browser already installed on the machine instead of the one Playwright downloads.
  use: { baseURL: process.env.APP_URL ?? "http://localhost:3000", channel: process.env.PW_CHANNEL || undefined },
  // With APP_URL set the app is already running there (for example the demo on port 3100): nothing is started.
  webServer: process.env.APP_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000/api/health",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
