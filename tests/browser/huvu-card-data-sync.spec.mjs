import fs from "node:fs";
import { expect, test } from "@playwright/test";
import {
  attachDiagnostics,
  attachPageDiagnostics,
  clickCollectionCard,
  collectionCard,
  collectionModalSnapshot,
  openCollection,
  previewSnapshot,
  waitForVisibleHandStable
} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/huvu-sync-1-cards.json", import.meta.url), "utf8"));

const COLLECTION_SCREENSHOTS = {
  MV000026: "test-results/huvu-sync-MV000026-collection.png",
  R000027: "test-results/huvu-sync-R000027-collection.png",
  S000051: "test-results/huvu-sync-S000051-collection.png",
  S000052: "test-results/huvu-sync-S000052-collection.png"
};

const PARTIE_SCREENSHOTS = {
  MV000026: "test-results/huvu-sync-MV000026-partie.png",
  R000027: "test-results/huvu-sync-R000027-partie.png"
};

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

async function searchCollectionCard(page, cardId) {
  await page.locator("#searchInput").fill(cardId);
  await expect(collectionCard(page, cardId), `Collection card ${cardId}`).toBeVisible();
}

async function closeModalWithButton(page) {
  await page.locator("#modalClose").click();
  await expect(page.locator("#modalOverlay.open")).toHaveCount(0);
}

async function openTechnicalScenario(page, scenario) {
  const params = new URLSearchParams({ scenario, huvuSync1: `${Date.now()}-${Math.random()}` });
  await page.goto(`/code/partie-test-1.html?${params.toString()}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await waitForVisibleHandStable(page);
}

async function hoverVisiblePartCard(page, cardId) {
  const card = page.locator(`.hc[data-id="${cardId}"], .fc[data-id="${cardId}"]`).first();
  await expect(card, `Partie card ${cardId}`).toBeVisible();
  await expect.poll(() => card.evaluate((element) => element.querySelector("img")?.naturalWidth || 0), {
    message: `${cardId} image naturalWidth`,
    timeout: 5000
  }).toBeGreaterThan(0);
  const box = await card.boundingBox();
  if (!box) throw new Error(`Card ${cardId} has no bounding box`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#card-preview-layer.preview-open")).toBeVisible();
  await page.waitForTimeout(250);
  return previewSnapshot(page);
}

test("HUVU-SYNC-1 structure covers canonical direct cards without touching public decks", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openCollection(page);
  const collectionAudit = await page.evaluate((expectedIds) => {
    const ids = CARDS.map(card => card.id);
    const counts = Object.fromEntries(expectedIds.map(id => [id, ids.filter(value => value === id).length]));
    const serialized = JSON.stringify(CARDS.filter(card => expectedIds.includes(card.id)));
    return {
      counts,
      missing: expectedIds.filter(id => !ids.includes(id)),
      duplicates: expectedIds.filter(id => counts[id] !== 1),
      excelArtifacts: (serialized.match(/_x[0-9A-Fa-f]{4}_/g) || []).length,
      rawIdsDisplayed: CARDS.filter(card => expectedIds.includes(card.id) && /undefined|null|\[object Object\]/.test(String(card.name || card.desc || ""))).map(card => card.id)
    };
  }, fixture.canonicalDirectIds);

  expect(collectionAudit.missing).toEqual([]);
  expect(collectionAudit.duplicates).toEqual([]);
  expect(collectionAudit.excelArtifacts).toBe(0);
  expect(collectionAudit.rawIdsDisplayed).toEqual([]);

  await openTechnicalScenario(page, "huvu-sync-gallery-a");
  const partieAudit = await page.evaluate((expectedIds) => {
    const ids = Object.keys(CARDS_DATA);
    const serialized = JSON.stringify(Object.fromEntries(expectedIds.map(id => [id, CARDS_DATA[id]])));
    return {
      missing: expectedIds.filter(id => !ids.includes(id)),
      excelArtifacts: (serialized.match(/_x[0-9A-Fa-f]{4}_/g) || []).length,
      galleriesHidden: !Array.from(document.querySelectorAll("#scenarioSelect option")).some(option => /^huvu-sync-gallery-/.test(option.value)),
      deckHokhan: [...DECK_HOKHAN],
      deckUram: [...DECK_URAM],
      startHokhan: [...START_OUI_HOKHAN],
      startUram: [...START_OUI_URAM]
    };
  }, fixture.canonicalDirectIds);

  expect(partieAudit.missing).toEqual([]);
  expect(partieAudit.excelArtifacts).toBe(0);
  expect(partieAudit.galleriesHidden).toBe(true);
  expect(partieAudit.deckHokhan).toEqual(fixture.codedDeckBaseline.DECK_HOKHAN);
  expect(partieAudit.deckUram).toEqual(fixture.codedDeckBaseline.DECK_URAM);
  expect(partieAudit.startHokhan).toEqual(fixture.codedDeckBaseline.START_OUI_HOKHAN);
  expect(partieAudit.startUram).toEqual(fixture.codedDeckBaseline.START_OUI_URAM);

  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

for (const cardId of fixture.collectionAddedIds) {
  test(`Collection renders synchronized ${cardId}`, async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    const expected = fixture.cards[cardId];

    await openCollection(page);
    await searchCollectionCard(page, cardId);
    const card = collectionCard(page, cardId);
    await expect.poll(() => card.locator("img.ccard-art").evaluate((img) => img.naturalWidth), {
      message: `${cardId} Collection image loaded`,
      timeout: 5000
    }).toBeGreaterThan(0);
    await expect(card).toContainText(expected.type);

    await clickCollectionCard(page, cardId);
    let modal = await collectionModalSnapshot(page);
    expect(modal.open).toBe(true);
    expect(modal.cardText).toContain(expected.name);
    expect(modal.cardText).not.toMatch(/_x[0-9A-Fa-f]{4}_|undefined|null|\[object Object\]/);
    expect(modal.cardText.trim().length).toBeGreaterThan(30);
    if (cardId === "MV000026") {
      expect(modal.cardText).toContain("Adepte de Bélial");
      expect(modal.cardText).toMatch(/1\s*\/\s*4|1\s+4|1.*4/s);
    }
    if (cardId === "R000027") {
      expect(modal.cardText).toContain("Nécropole");
      expect(modal.rightText).toContain("APPROVISIONNEMENT");
      expect(modal.cardText).toContain("Ce lieu");
    }
    if (cardId === "S000051" || cardId === "S000052") {
      expect(modal.cardText).toContain("Sort");
      expect(modal.rightText).not.toContain("Condition d’invocation");
    }
    if (COLLECTION_SCREENSHOTS[cardId]) await page.screenshot({ path: COLLECTION_SCREENSHOTS[cardId], fullPage: true });

    await page.keyboard.press("Escape");
    await expect(page.locator("#modalOverlay.open")).toHaveCount(0);

    await clickCollectionCard(page, cardId);
    modal = await collectionModalSnapshot(page);
    expect(modal.open).toBe(true);
    await closeModalWithButton(page);

    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });
}

for (const [scenario, cardIds] of Object.entries(fixture.galleries)) {
  test(`Partie ${scenario} exposes synchronized static cards`, async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openTechnicalScenario(page, scenario);
    for (const cardId of cardIds) {
      const expected = fixture.cards[cardId];
      const snapshot = await hoverVisiblePartCard(page, cardId);
      expect(snapshot.layerOpen).toBe(true);
      expect(snapshot.previewText).toContain(expected.name);
      expect(snapshot.descriptionText.trim().length).toBeGreaterThan(0);
      expect(snapshot.previewText).not.toMatch(/_x[0-9A-Fa-f]{4}_|undefined|null|\[object Object\]/);
      const emptyPanels = snapshot.panels.filter(panel => !panel.title || !panel.text.trim());
      expect(emptyPanels).toEqual([]);
      if (expected.type === "Approvisionnement") {
        expect(snapshot.descriptionText).toContain("Ce lieu");
        expect(snapshot.panels.map(panel => panel.title)).toContain("APPROVISIONNEMENT");
      }
      if (expected.type === "Serviteur") {
        expect(snapshot.previewText).toMatch(new RegExp(String(expected.attack ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        expect(snapshot.previewText).toMatch(new RegExp(String(expected.life ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
      if (PARTIE_SCREENSHOTS[cardId]) await page.screenshot({ path: PARTIE_SCREENSHOTS[cardId], fullPage: true });
    }
    await page.screenshot({ path: `test-results/${scenario === "huvu-sync-gallery-a" ? "huvu-sync-gallery-a" : "huvu-sync-gallery-b"}.png`, fullPage: true });
    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });
}

test("HUVU-SYNC-1 data assertions match the controlled fixture", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openTechnicalScenario(page, "huvu-sync-gallery-a");
  const result = await page.evaluate((cards) => {
    const spellHandlers = typeof SPELL_HANDLERS !== "undefined" ? SPELL_HANDLERS : {};
    const specialHandlers = typeof SPECIAL_CARD_HANDLERS !== "undefined" ? SPECIAL_CARD_HANDLERS : {};
    const supplyDefs = typeof SUPPLY_PRODUCTION_DEFS !== "undefined" ? SUPPLY_PRODUCTION_DEFS : {};
    return Object.fromEntries(Object.entries(cards).map(([id, expected]) => {
    const data = CARDS_DATA[id] || null;
    const cost = getCanonicalCostDefinition(id);
    return [id, {
      exists: !!data,
      name: data?.name || "",
      type: data?.type || "",
      costTotal: cost?.total ?? data?.cost ?? null,
      attack: data?.atk ?? null,
      life: data?.pdv ?? null,
      hasHandler: !!(spellHandlers?.[id] || specialHandlers?.[id] || supplyDefs?.[id])
    }];
    }));
  }, fixture.cards);

  for (const [cardId, expected] of Object.entries(fixture.cards)) {
    if (!expected.inPartySync) continue;
    expect(result[cardId].exists, cardId).toBe(true);
    expect(result[cardId].name, cardId).toBe(expected.name);
    expect(result[cardId].type, cardId).toBe(expected.type);
    expect(result[cardId].costTotal, cardId).toBe(expected.costTotal);
    if (expected.type === "Serviteur") {
      expect(result[cardId].attack, `${cardId} attack`).toBe(expected.attack);
      expect(result[cardId].life, `${cardId} life`).toBe(expected.life);
    }
  }

  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
