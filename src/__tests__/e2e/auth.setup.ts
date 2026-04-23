/**
 * Playwright setup: authenticate via magic link and save session state.
 *
 * This runs ONCE before the authenticated test suite. The resulting
 * session cookie is stored in .auth/session.json and reused by all
 * authenticated tests — no repeated login overhead.
 */

import { test as setup, expect } from "@playwright/test";
import path from "path";

const SESSION_FILE = path.join(__dirname, ".auth/session.json");
const MAGIC_TOKEN  = process.env.MAGIC_LINK_TOKEN ?? "xZ3o9riPHl8p9j3dKEvxUc0BfAZHQlVG";

setup("authenticate via magic link", async ({ page }) => {
  // Visit the magic link — API sets the it_session cookie and redirects to /
  const response = await page.goto(`/api/auth/magic/?t=${MAGIC_TOKEN}&next=/`, {
    waitUntil: "commit",  // Don't wait for full page load — we just need the cookie set
  });

  // Follow the redirect to homepage to trigger the full session
  await page.waitForURL(/\/$|\/companies|\/insiders/, { timeout: 20_000 });

  // Verify we're NOT on the login page
  await expect(page).not.toHaveURL(/\/auth\/login/);

  // Save cookies + localStorage for reuse by authenticated tests
  await page.context().storageState({ path: SESSION_FILE });
  console.log("✓ Auth session saved to", SESSION_FILE);
});
