import { chromium } from "@playwright/test";

async function tryChannel(channel) {
  let browser;
  try {
    browser = await chromium.launch({ channel, headless: true });
    const page = await browser.newPage();
    await page.goto("about:blank");
    await page.close();
    await browser.close();
    return { channel, ok: true };
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    return { channel, ok: false, error: String(error && error.message ? error.message : error) };
  }
}

console.log("Browser environment");
console.log("[OK] Playwright package");

const edge = await tryChannel("msedge");
if (edge.ok) {
  console.log("[OK] Microsoft Edge launch");
  console.log("Selected channel: msedge");
  console.log("Result: PASS");
  process.exit(0);
}

console.log("[WARN] Microsoft Edge launch failed");
console.log(edge.error);

const chrome = await tryChannel("chrome");
if (chrome.ok) {
  console.log("[OK] Google Chrome launch");
  console.log("Selected channel: chrome");
  console.log("Result: PASS");
  process.exit(0);
}

console.log("[ERROR] Google Chrome launch failed");
console.log(chrome.error);
console.log("Result: FAIL");
process.exit(1);
