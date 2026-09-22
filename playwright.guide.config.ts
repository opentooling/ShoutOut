import { defineConfig, devices } from "@playwright/test";

/** Captures the user guide screenshots (npm run guide:screenshots). Not part of the E2E suite. */
export default defineConfig({
  testDir: "./e2e/guide",
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_BASE_URL ?? "http://shoutout.localtest.me",
  },
});
