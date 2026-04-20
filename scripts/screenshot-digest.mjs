import { chromium } from "playwright-core";

const execPath = "/Users/simonazoulay/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

const browser = await chromium.launch({ executablePath: execPath });
const context = await browser.newContext({ viewport: { width: 800, height: 1200 } });
const page = await context.newPage();
await page.goto(`file:///tmp/digest-preview.html`);
await page.screenshot({ path: "/tmp/digest-preview.png", fullPage: true });
console.log("Screenshot saved: /tmp/digest-preview.png");
await browser.close();
