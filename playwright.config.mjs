import { defineConfig } from "@playwright/test";

const channel = process.env.PLAYWRIGHT_CHANNEL || "msedge";
const nodeCommand = process.platform === "win32"
  ? ".\\.toolchain\\node\\node.exe tools/dev-server.mjs --port 4173"
  : "./.toolchain/node/bin/node tools/dev-server.mjs --port 4173";

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "test-results",
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],
  workers: 1,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel,
    headless: true,
    viewport: { width: 1920, height: 1080 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    colorScheme: "dark",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off"
  },
  webServer: {
    command: nodeCommand,
    url: "http://127.0.0.1:4173/code/collection.html",
    reuseExistingServer: false,
    timeout: 15000
  }
});
