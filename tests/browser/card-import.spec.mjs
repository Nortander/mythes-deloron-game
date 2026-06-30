import { expect, test } from "@playwright/test";
import {
  attachDiagnostics,
  attachPageDiagnostics,
  clickCollectionCard,
  closeCollectionModal,
  collectionCard,
  collectionModalSnapshot,
  openCollection,
  openPartie,
  partCard,
  previewSnapshot
} from "./helpers/eloron-ui.mjs";

const IMPORT_SCENARIO = "test-import-2-cartes";
const EXCEL_ESCAPE_ARTIFACT_RE = /_x[0-9A-Fa-f]{4}_/i;

const importedCards = [
  {
    id: "EDB000014",
    name: "Dryade de l'Arbre de vie",
    type: "Serviteur",
    faction: "Elfe des bois",
    assetPath: "/assets/elfes-des-bois/EDB000014.png",
    collectionScreenshot: "test-results/import-EDB000014-collection.png",
    partieScreenshot: "test-results/import-EDB000014-partie.png",
    centralText: "Soigne entièrement vos autres serviteurs",
    expectedPanels: ["Insensible", "Initiative", "Embrasement", "Gel", "Coup de glace", "Hypnose"],
    forbiddenPanels: ["CAPACITÉ", "Serviteur"],
    relatedNames: ["Pixie", "Père des arbres"]
  },
  {
    id: "S000053",
    name: "Chaud-froid",
    type: "Sort",
    faction: "/",
    assetPath: "/assets/sorts/S000053.png",
    collectionScreenshot: "test-results/import-S000053-collection.png",
    partieScreenshot: "test-results/import-S000053-partie.png",
    centralText: "Applique Coup de glace",
    expectedPanels: ["Coup de glace", "Gel", "Embrasement"],
    forbiddenPanels: ["Serviteur", "Approvisionnement"],
    relatedNames: []
  }
];

async function expectCardImageLoaded(cardLocator) {
  await expect.poll(async () => cardLocator.evaluate((card) => {
    const image = card.querySelector("img");
    if (!image) return false;
    return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
  }), { timeout: 15000 }).toBeTruthy();
}

async function revealCollectionCard(page, card) {
  await page.locator("#searchInput").fill(card.id);
  await expect(collectionCard(page, card.id)).toBeVisible();
}

async function assertNoBlockingDiagnostics(diagnostics) {
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors.filter((message) => !message.includes("Failed to load resource"))).toEqual([]);
  expect(diagnostics.requestFailures.filter((request) => (
    !request.url.includes("favicon") &&
    !request.url.endsWith(".mp3")
  ))).toEqual([]);
}

async function hoverVisibleImportedCard(page, cardId) {
  await openPartie(page, IMPORT_SCENARIO);
  const card = page.locator(`.hc[data-id="${cardId}"]:visible, .fc[data-id="${cardId}"]:visible`).first();
  await expect(card, `Expected visible imported card ${cardId}`).toBeVisible();
  await card.hover({ force: true });
  await expect(page.locator("#card-preview-layer.preview-open")).toBeVisible();
  await page.waitForTimeout(250);
}

function expectNoExcelEscapeArtifact(text) {
  expect(String(text || "")).not.toMatch(EXCEL_ESCAPE_ARTIFACT_RE);
}

test.describe("IMPORT-2B imported cards", () => {
  for (const card of importedCards) {
    test(`asset is served for ${card.id}`, async ({ request }) => {
      const response = await request.get(card.assetPath);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
      expect((await response.body()).length).toBeGreaterThan(0);
    });

    test(`Collection renders ${card.id}`, async ({ page }, testInfo) => {
      const diagnostics = attachPageDiagnostics(page);
      await openCollection(page);
      await revealCollectionCard(page, card);

      const cardElement = collectionCard(page, card.id);
      await expect(cardElement).toBeVisible();
      await expect(cardElement).toContainText(card.name);
      await expect(cardElement.locator(".ccard-type")).toContainText(card.type);
      await expectCardImageLoaded(cardElement);

      await clickCollectionCard(page, card.id);
      const snapshot = await collectionModalSnapshot(page);
      await testInfo.attach(`${card.id}-collection-snapshot`, {
        contentType: "application/json",
        body: Buffer.from(JSON.stringify(snapshot, null, 2), "utf8")
      });

      expect(snapshot.open).toBeTruthy();
      expect(snapshot.cardText).toContain(card.name);
      expectNoExcelEscapeArtifact(snapshot.cardText);
      if (card.id === "EDB000014") {
        expect(snapshot.cardText).toContain("Père des arbres");
        expect(snapshot.cardText).toContain("Soigne entièrement vos autres serviteurs");
      }

      await page.screenshot({ path: card.collectionScreenshot, fullPage: true });
      if (card.id === "EDB000014") {
        await page.screenshot({ path: "test-results/final-EDB000014-collection-clean-text.png", fullPage: true });
      }
      await closeCollectionModal(page);

      await clickCollectionCard(page, card.id);
      await expect(page.locator("#modalOverlay.open")).toBeVisible();
      await page.locator("#modalClose").click();
      await expect(page.locator("#modalOverlay.open")).toHaveCount(0);

      await assertNoBlockingDiagnostics(diagnostics);
      await attachDiagnostics(testInfo, diagnostics);
    });
  }

  test("Partie import scenario exposes both cards deterministically", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openPartie(page, IMPORT_SCENARIO);
    await expect(page.locator("#scenarioSelect")).toHaveValue(IMPORT_SCENARIO);

    for (const card of importedCards) {
      const cardElement = partCard(page, card.id);
      await expect(cardElement).toBeVisible();
      await expectCardImageLoaded(cardElement);
    }

    await assertNoBlockingDiagnostics(diagnostics);
    await attachDiagnostics(testInfo, diagnostics);
  });

  for (const card of importedCards) {
    test(`Partie preview renders ${card.id}`, async ({ page }, testInfo) => {
      const diagnostics = attachPageDiagnostics(page);
      await hoverVisibleImportedCard(page, card.id);
      const snapshot = await previewSnapshot(page);
      await testInfo.attach(`${card.id}-partie-preview`, {
        contentType: "application/json",
        body: Buffer.from(JSON.stringify(snapshot, null, 2), "utf8")
      });

      expect(snapshot.layerOpen).toBeTruthy();
      expect(snapshot.previewText).toContain(card.name);
      expect(snapshot.descriptionText).toContain(card.centralText);
      expectNoExcelEscapeArtifact(snapshot.previewText);
      if (card.id === "EDB000014") {
        expect(snapshot.descriptionText).toContain("Père des arbres");
        expect(snapshot.descriptionText).toContain("Soigne entièrement vos autres serviteurs");
      }
      expect(snapshot.previewText).not.toMatch(/\b(?:EDB000014|S000053)\b/);
      expect(snapshot.panels.every((panel) => panel.text.trim().length > panel.title.length)).toBeTruthy();

      for (const expectedPanel of card.expectedPanels) {
        expect(snapshot.panels.some((panel) => panel.title === expectedPanel)).toBeTruthy();
      }
      for (const forbiddenPanel of card.forbiddenPanels) {
        expect(snapshot.panels.some((panel) => panel.title === forbiddenPanel)).toBeFalsy();
      }
      for (const relatedName of card.relatedNames) {
        expect(snapshot.relatedText).toContain(relatedName);
      }

      await page.screenshot({ path: card.partieScreenshot, fullPage: true });
      if (card.id === "EDB000014") {
        await page.screenshot({ path: "test-results/final-EDB000014-partie-formatted-numbers.png", fullPage: true });
      }
      await assertNoBlockingDiagnostics(diagnostics);
      await attachDiagnostics(testInfo, diagnostics);
    });
  }

  test("Partie preview formats Dryade numeric variables like the Collection", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await hoverVisibleImportedCard(page, "EDB000014");

    const styles = await page.evaluate(() => {
      const preview = document.querySelector(".canonical-card-preview[data-preview-card-id='EDB000014']");
      const desc = preview?.querySelector(".fz-desc-inner");
      const paragraph = desc?.querySelector(".fz-desc-text");
      const ordinaryColor = paragraph ? getComputedStyle(paragraph).color : "";
      const expectedProbe = document.createElement("span");
      expectedProbe.style.color = "#2a5a10";
      document.body.appendChild(expectedProbe);
      const expectedCollectionColor = getComputedStyle(expectedProbe).color;
      expectedProbe.remove();
      const entries = Array.from(desc?.querySelectorAll("strong.kv") || []).map((node) => {
        const computed = getComputedStyle(node);
        return {
          text: (node.textContent || "").trim(),
          fontWeight: computed.fontWeight,
          color: computed.color,
          textDecorationLine: computed.textDecorationLine
        };
      });
      const keywordTexts = Array.from(desc?.querySelectorAll(".card-keyword, .canonical-keyword-inline") || [])
        .map((node) => (node.textContent || "").trim());
      return { ordinaryColor, expectedCollectionColor, entries, keywordTexts, descriptionText: desc?.innerText || "" };
    });

    await testInfo.attach("EDB000014-numeric-variable-styles", {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify(styles, null, 2), "utf8")
    });

    expectNoExcelEscapeArtifact(styles.descriptionText);
    expect(styles.descriptionText).toContain("Père des arbres");
    for (const expected of ["4", "1", "+2"]) {
      const matches = styles.entries.filter((entry) => entry.text === expected);
      expect(matches.length, `Expected formatted numeric variable ${expected}`).toBeGreaterThan(0);
      for (const match of matches) {
        expect(Number.parseInt(match.fontWeight, 10)).toBeGreaterThanOrEqual(600);
        expect(match.color).toBe(styles.expectedCollectionColor);
        expect(match.color).not.toBe(styles.ordinaryColor);
        expect(match.textDecorationLine).not.toContain("underline");
      }
    }
    for (const expectedKeyword of ["Insensible", "Initiative", "Embrasement", "Gel", "Coup de glace", "Hypnose"]) {
      expect(styles.keywordTexts).toContain(expectedKeyword);
    }

    await assertNoBlockingDiagnostics(diagnostics);
    await attachDiagnostics(testInfo, diagnostics);
  });
});
