import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  retries: 0,
  use: {
    ...devices["Pixel 7"],
    defaultBrowserType: "chromium",
    baseURL: "http://127.0.0.1:4319",
    launchOptions: { executablePath: process.env.CHROMIUM_PATH },
  },
  webServer: {
    command: "node tests/browser-server.mjs",
    url: "http://127.0.0.1:4319",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
