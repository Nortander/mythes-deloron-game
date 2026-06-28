import { expect } from "@playwright/test";

let partieNavigationSequence = 0;

export const FIRST_SCENARIO_PARTICIPANT_VISIBLE_RANDOM = [0, 0.1, 0];

export function attachPageDiagnostics(page) {
  const diagnostics = { pageErrors: [], consoleErrors: [], requestFailures: [] };
  page.on("pageerror", (error) => diagnostics.pageErrors.push(String(error && error.message ? error.message : error)));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    diagnostics.requestFailures.push({
      method: request.method(),
      url: request.url(),
      errorText: request.failure()?.errorText || "failed"
    });
  });
  return diagnostics;
}

export async function attachDiagnostics(testInfo, diagnostics) {
  await testInfo.attach("diagnostics", {
    contentType: "application/json",
    body: Buffer.from(JSON.stringify(diagnostics, null, 2), "utf8")
  });
}

export async function openCollection(page) {
  await page.goto("/code/collection.html");
  await expect(page.locator("#cardsGrid")).toBeVisible();
  await expect(page.locator(".ccard[data-card-id]").first()).toBeVisible();
}

export function collectionCard(page, cardId) {
  return page.locator(`.ccard[data-card-id="${cardId}"]`).first();
}

export async function clickCollectionCard(page, cardId) {
  const card = collectionCard(page, cardId);
  await expect(card).toBeVisible();
  await card.click();
  await page.waitForTimeout(250);
}

export async function collectionModalSnapshot(page) {
  return page.evaluate(() => {
    const overlay = document.querySelector("#modalOverlay");
    const card = document.querySelector("#modalCard");
    const related = document.querySelector("#modalRelated");
    const right = document.querySelector("#modalRight");
    const modalDesc = document.querySelector("#modalDesc");
    const style = overlay ? getComputedStyle(overlay) : null;
    const lore = document.querySelector("#modalDesc .card-lore-text, #modalDesc em, #modalDesc");
    const loreStyle = lore ? getComputedStyle(lore) : null;
    const loreText = (lore?.innerText || "").trim();
    const visibleDescendants = Array.from(modalDesc?.querySelectorAll("*") || [])
      .filter((element) => {
        const elementStyle = getComputedStyle(element);
        return elementStyle.display !== "none" && elementStyle.visibility !== "hidden" && (element.innerText || "").trim();
      })
      .map((element) => {
        const elementStyle = getComputedStyle(element);
        const text = (element.innerText || "").trim();
        return {
          tagName: element.tagName,
          className: element.className || "",
          text,
          coversAllLore: !!loreText && text === loreText,
          fontStyle: elementStyle.fontStyle,
          fontWeight: elementStyle.fontWeight,
          textDecorationLine: elementStyle.textDecorationLine,
          color: elementStyle.color
        };
      });
    return {
      open: !!document.querySelector("#modalOverlay.open"),
      overlayClass: overlay?.className || "",
      display: style?.display || "",
      visibility: style?.visibility || "",
      opacity: style?.opacity || "",
      cardText: card?.innerText || "",
      rightText: right?.innerText || "",
      relatedText: related?.innerText || "",
      relatedVisible: !!related && getComputedStyle(related).display !== "none",
      loreText,
      loreElementTag: lore?.tagName || "",
      loreDescendants: visibleDescendants,
      loreGlobalWrapperTags: visibleDescendants
        .filter((entry) => entry.coversAllLore && ["STRONG", "B", "U"].includes(entry.tagName))
        .map((entry) => entry.tagName),
      loreStyle: loreStyle ? {
        fontStyle: loreStyle.fontStyle,
        fontWeight: loreStyle.fontWeight,
        textDecorationLine: loreStyle.textDecorationLine,
        color: loreStyle.color
      } : null
    };
  });
}

export async function closeCollectionModal(page) {
  if (await page.locator("#modalOverlay.open").count()) {
    await page.keyboard.press("Escape");
    await expect(page.locator("#modalOverlay.open")).toHaveCount(0);
  }
}

async function installRandomSequence(page, values) {
  if (!Array.isArray(values) || values.length === 0) return;
  await page.addInitScript((sequence) => {
    const nativeRandom = Math.random.bind(Math);
    let index = 0;
    Math.random = () => (index < sequence.length ? sequence[index++] : nativeRandom());
  }, values);
}

export async function waitForVisibleHandStable(page) {
  const visibleFaceCards = page.locator(
    '.hand-j1[data-hand-visibility="face"] .hc[data-id], .hand-j2[data-hand-visibility="face"] .hc[data-id]'
  );
  await expect(visibleFaceCards.first()).toBeVisible();
  let previousCount = -1;
  let stableSamples = 0;
  await expect.poll(async () => {
    const count = await visibleFaceCards.count();
    if (count > 0 && count === previousCount) stableSamples += 1;
    else stableSamples = 0;
    previousCount = count;
    return stableSamples;
  }, {
    timeout: 3000,
    intervals: [50, 50, 50, 50, 50, 100, 100]
  }).toBeGreaterThanOrEqual(2);
}

export async function openPartie(page, scenario = "raith-yria", options = {}) {
  await installRandomSequence(page, options.randomValues);
  const params = new URLSearchParams();
  if (scenario && scenario !== "raith-yria") params.set("scenario", scenario);
  params.set("env1f2", `${Date.now()}-${partieNavigationSequence += 1}`);
  const suffix = `?${params.toString()}`;
  await page.goto(`/code/partie-test-1.html${suffix}`);
  await expect(page.locator("#scenarioSelect")).toHaveValue(scenario);
  await waitForVisibleHandStable(page);
}

export function partCard(page, cardId) {
  return page.locator(`.hc[data-id="${cardId}"], .fc[data-id="${cardId}"]`).first();
}

export async function hoverPartCard(page, cardId, scenario = "raith-yria", options = {}) {
  await openPartie(page, scenario, options);
  const card = partCard(page, cardId);
  await expect(card, `Expected ${cardId} to be visible in scenario ${scenario}`).toBeVisible();
  const box = await card.boundingBox();
  if (!box) throw new Error(`Card ${cardId} has no bounding box`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#card-preview-layer.preview-open")).toBeVisible();
  await page.waitForTimeout(250);
}

export async function hoverFirstPartCardMatching(page, selector, scenario = "raith-yria") {
  await openPartie(page, scenario);
  const card = page.locator(selector).first();
  await expect(card, `Expected at least one visible card matching ${selector} in scenario ${scenario}`).toBeVisible();
  const summary = await card.evaluate((el) => ({
    cardId: el.dataset.id || el.getAttribute("data-id") || el.getAttribute("data-card-id") || null,
    text: el.innerText || "",
    className: el.className
  }));
  const box = await card.boundingBox();
  if (!box) throw new Error(`Card matching ${selector} has no bounding box`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#card-preview-layer.preview-open")).toBeVisible();
  await page.waitForTimeout(250);
  return summary;
}

export async function previewSnapshot(page) {
  return page.evaluate(() => {
    const layer = document.querySelector("#card-preview-layer");
    const preview = document.querySelector(".canonical-card-preview");
    const descInner = preview?.querySelector(".fz-desc-inner");
    const lore = descInner?.querySelector(".fz-lore-text .card-lore-text, .card-lore-text");
    const loreStyle = lore ? getComputedStyle(lore) : null;
    const paragraphs = Array.from(descInner?.querySelectorAll(":scope > .fz-desc-text") || []).map((paragraph) => {
      const paragraphStyle = getComputedStyle(paragraph);
      return {
        text: (paragraph.innerText || "").trim(),
        className: paragraph.className || "",
        fontStyle: paragraphStyle.fontStyle,
        fontWeight: paragraphStyle.fontWeight,
        textDecorationLine: paragraphStyle.textDecorationLine,
        color: paragraphStyle.color
      };
    });
    const panels = Array.from(document.querySelectorAll(".canonical-keyword-tooltip")).map((panel) => {
      const title = panel.querySelector("strong")?.textContent?.trim() || "";
      return { title, text: panel.innerText || "", html: panel.innerHTML || "" };
    });
    const related = document.querySelector(".canonical-related-cards");
    return {
      layerOpen: !!layer?.classList.contains("preview-open"),
      previewClass: preview?.className || "",
      previewText: preview?.innerText || "",
      descriptionText: descInner?.innerText || "",
      centralParagraphs: paragraphs,
      loreStyle: loreStyle ? {
        fontStyle: loreStyle.fontStyle,
        fontWeight: loreStyle.fontWeight,
        textDecorationLine: loreStyle.textDecorationLine,
        color: loreStyle.color
      } : null,
      panelCount: panels.length,
      panels,
      relatedText: related?.innerText || "",
      relatedVisible: !!related && getComputedStyle(related).display !== "none"
    };
  });
}

export async function collectionInventory(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll(".ccard[data-card-id]")).map((card) => ({
    cardId: card.getAttribute("data-card-id"),
    className: card.className,
    text: (card.innerText || "").replace(/\s+/g, " ").trim()
  })));
}

export async function partieInventory(page, scenarios) {
  const inventory = [];
  for (const scenario of scenarios) {
    const params = new URLSearchParams();
    if (scenario !== "raith-yria") params.set("scenario", scenario);
    params.set("env1f2", `${Date.now()}-${partieNavigationSequence += 1}`);
    const suffix = `?${params.toString()}`;
    await page.goto(`/code/partie-test-1.html${suffix}`);
    await expect(page.locator("#scenarioSelect")).toHaveValue(scenario);
    await waitForVisibleHandStable(page);
    const cards = await page.evaluate(() => Array.from(document.querySelectorAll(".hc, .fc")).map((card) => ({
      cardId: card.dataset.id || card.getAttribute("data-id") || card.getAttribute("data-card-id") || null,
      className: card.className,
      text: (card.innerText || "").replace(/\s+/g, " ").trim()
    })));
    inventory.push({ scenario, cards });
  }
  return inventory;
}
