import { expect, test } from "@playwright/test";

function attachDiagnostics(page, messages) {
  page.on("pageerror", (error) => messages.pageErrors.push(String(error && error.message ? error.message : error)));
  page.on("console", (message) => {
    if (message.type() === "error") {
      messages.consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    messages.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || "failed"}`);
  });
}

test("Collection opens Ailantérie detail modal", async ({ page }, testInfo) => {
  const diagnostics = { pageErrors: [], consoleErrors: [], requestFailures: [] };
  attachDiagnostics(page, diagnostics);

  await page.goto("/code/collection.html");
  await expect(page.locator("#cardsGrid")).toBeVisible();
  await expect(page.locator(".ccard[data-card-id]").first()).toBeVisible();

  const ailant = page.locator('.ccard[data-card-id="R000014"]');
  await expect(ailant).toBeVisible();
  await ailant.click();

  const overlay = page.locator("#modalOverlay.open");
  await expect(overlay).toBeVisible();
  await expect(page.locator("#modalCard")).toBeVisible();
  await expect(page.locator("#modalName")).toContainText(/AILANT[ÉE]RIE/i);
  await expect(page.locator("#modalRight")).toContainText("APPROVISIONNEMENT");

  await page.screenshot({ path: "test-results/infrastructure-collection.png", fullPage: true });

  await page.keyboard.press("Escape");
  await expect(page.locator("#modalOverlay.open")).toHaveCount(0);

  await ailant.click();
  await expect(page.locator("#modalOverlay.open")).toBeVisible();
  await page.locator("#modalClose").click();
  await expect(page.locator("#modalOverlay.open")).toHaveCount(0);

  await testInfo.attach("diagnostics", {
    contentType: "application/json",
    body: Buffer.from(JSON.stringify(diagnostics, null, 2), "utf8")
  });
});

test("Partie test loads board and card images", async ({ page }, testInfo) => {
  const diagnostics = { pageErrors: [], consoleErrors: [], requestFailures: [] };
  attachDiagnostics(page, diagnostics);

  await page.goto("/code/partie-test-1.html");
  await expect(page.locator("#scenarioSelect")).toBeVisible();
  await expect(page.locator("#raithServants")).toBeVisible();
  await expect(page.locator("#yriaServants")).toBeVisible();
  await expect(page.locator(".hand-j1")).toBeVisible();
  await expect(page.locator(".hand-j2")).toBeVisible();

  await page.waitForFunction(() => Array.from(document.images).some((img) => img.complete && img.naturalWidth > 0), null, { timeout: 15000 });
  const loadedImageCount = await page.evaluate(() => Array.from(document.images).filter((img) => img.complete && img.naturalWidth > 0).length);
  expect(loadedImageCount).toBeGreaterThan(0);

  await page.screenshot({ path: "test-results/infrastructure-partie.png", fullPage: true });

  await testInfo.attach("diagnostics", {
    contentType: "application/json",
    body: Buffer.from(JSON.stringify(diagnostics, null, 2), "utf8")
  });
});
