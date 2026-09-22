import { defineConfig, devices } from "@playwright/test";

/** E2E tests run against a deployed environment (local k3d by default). */
export default defineConfig({
  testDir: "./e2e",
  // Screenshot capture for the user guide has its own config (playwright.guide.config.ts).
  testIgnore: ["guide/**"],
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://shoutout.localtest.me",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
