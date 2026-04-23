import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config.
 *
 * Runs against the PROD URL by default (reads PLAYWRIGHT_BASE_URL).
 * For local testing: start `npm run dev` then run `npm run test:e2e:local`.
 *
 * Uses system Chrome to avoid downloading Playwright browsers.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";
const isLocal  = BASE_URL.includes("localhost");

export default defineConfig({
  testDir: "src/__tests__/e2e",
  fullyParallel: false,          // sequential — avoids DB race conditions
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: BASE_URL,
    // Use system Chrome — avoids separate browser download
    channel: "chrome",
    headless: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // 1. Setup: create an authenticated session file
    {
      name: "auth-setup",
      testMatch: "**/auth.setup.ts",
      use: { storageState: undefined },
    },
    // 2. Unauthenticated tests — no stored state
    {
      name: "public",
      testMatch: "**/public.spec.ts",
      use: { storageState: undefined },
    },
    // 3. Authenticated tests — reuse session from setup
    {
      name: "authenticated",
      testMatch: "**/authenticated.spec.ts",
      use: { storageState: "src/__tests__/e2e/.auth/session.json" },
      dependencies: ["auth-setup"],
    },
  ],

  // Start Next.js dev server when running locally
  ...(isLocal && {
    webServer: {
      command: "npm run dev",
      url: BASE_URL,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  }),
});
