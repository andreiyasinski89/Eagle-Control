import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // A page seen for the first time is built by the dev server while the test waits: five seconds is too little for that.
  expect: { timeout: 20_000 },
  // PW_CHANNEL=msedge (or chrome) runs the browser already installed on the machine instead of the one Playwright downloads.
  use: { baseURL: process.env.APP_URL ?? "http://localhost:3000", channel: process.env.PW_CHANNEL || undefined },
  // With APP_URL set the app is already running there (for example the demo on port 3100): nothing is started.
  webServer: process.env.APP_URL
    ? undefined
    : [
        {
          command: "npm run dev",
          url: "http://localhost:3000/api/health",
          reuseExistingServer: true,
          timeout: 120_000,
        },
        // The mailbox the sign-in tests read the links from (Mailpit on the same ports is used when it is already running).
        { command: "node scripts/e2e-mailbox.mjs", url: "http://localhost:8025/api/v1/info", reuseExistingServer: true, timeout: 30_000 },
      ],
});
