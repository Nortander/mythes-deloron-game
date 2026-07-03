import fs from "node:fs";
import { expect, test } from "@playwright/test";
import {
  attachDiagnostics,
  attachPageDiagnostics,
  clickCollectionCard,
  collectionCard,
  collectionModalSnapshot,
  openCollection
} from "./helpers/eloron-ui.mjs";

const canonical = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-canonical-cards.json", import.meta.url), "utf8"));
const signatures = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-effect-signatures.json", import.meta.url), "utf8"));
const primitives = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-engine-primitives.json", import.meta.url), "utf8"));
const keywords = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-keyword-matrix.json", import.meta.url), "utf8"));
const dependencies = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-card-dependencies.json", import.meta.url), "utf8"));

const addedIds = ["MV000025", "N000015", "S000054"];
const byId = Object.fromEntries(canonical.cards.map(card => [card.id, card]));

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource/i.test(message));
}

async function searchCollectionCard(page, cardId) {
  await page.locator("#searchInput").fill(cardId);
  await expect(collectionCard(page, cardId), `Collection card ${cardId}`).toBeVisible();
}

test("Collection corpus matches the 2026-07-03 canonical export", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openCollection(page);
  const audit = await page.evaluate((expectedIds) => {
    const ids = CARDS.map(card => card.id);
    const expected = new Set(expectedIds);
    const counts = new Map();
    ids.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
    const serialized = JSON.stringify(CARDS);
    return {
      collectionCount: ids.length,
      uniqueCount: counts.size,
      canonicalCount: expectedIds.filter(id => counts.has(id)).length,
      missing: expectedIds.filter(id => !counts.has(id)),
      extra: ids.filter(id => !expected.has(id)),
      duplicates: [...counts.entries()].filter(([, count]) => count !== 1).map(([id, count]) => ({ id, count })),
      excelArtifacts: (serialized.match(/_x[0-9A-Fa-f]{4}_/g) || []).length,
      rawRenderingArtifacts: /undefined|\[object Object\]/.test(serialized)
    };
  }, canonical.cards.map(card => card.id));
  expect(audit.collectionCount).toBeGreaterThanOrEqual(318);
  expect(audit.uniqueCount).toBeGreaterThanOrEqual(318);
  expect(audit.canonicalCount).toBe(318);
  expect(audit.missing).toEqual([]);
  expect(audit.extra.length).toBe(14);
  expect(audit.duplicates).toEqual([]);
  expect(audit.excelArtifacts).toBe(0);
  expect(audit.rawRenderingArtifacts).toBe(false);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Collection effect inventory covers every canonical card", async () => {
  expect(canonical.cardCount).toBe(318);
  expect(canonical.uniqueIdCount).toBe(318);
  expect(signatures.cardCount).toBe(318);
  expect(signatures.signatures.map(sig => sig.id).sort()).toEqual(canonical.cards.map(card => card.id).sort());
  expect(primitives.primitives.length).toBeGreaterThan(10);
  expect(keywords.keywordCount).toBeGreaterThan(10);
  const windjalfDependency = dependencies.dependencies.find(dep => dep.sourceId === "N000015" && dep.dependencyId === "S000054");
  expect(windjalfDependency).toMatchObject({ relation: "ADDS_TO_HAND", dependencyInCanonicalCorpus: true });
  expect(signatures.signatures.find(sig => sig.id === "N000015")?.requiredPrimitives).toContain("create-card");
  expect(signatures.signatures.find(sig => sig.id === "S000054")?.requiredPrimitives).toEqual(expect.arrayContaining(["burn-protection", "burn-status", "duration-persistent"]));
});

for (const cardId of addedIds) {
  test(`Collection renders newly synchronized ${cardId}`, async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    const expected = byId[cardId];
    await openCollection(page);
    await searchCollectionCard(page, cardId);
    const card = collectionCard(page, cardId);
    await expect(card).toContainText(expected.name);
    await expect(card).toContainText(expected.type);
    await expect.poll(() => card.locator("img.ccard-art").evaluate(img => img.naturalWidth), {
      message: `${cardId} Collection image loaded`,
      timeout: 8000
    }).toBeGreaterThan(0);
    await clickCollectionCard(page, cardId);
    const modal = await collectionModalSnapshot(page);
    expect(modal.open).toBe(true);
    expect(modal.cardText).toContain(expected.name);
    expect(modal.cardText).not.toMatch(/_x[0-9A-Fa-f]{4}_|undefined|\[object Object\]/);
    if (cardId === "MV000025") {
      expect(modal.cardText).toContain("Esprit dérangé");
      expect(modal.cardText).toMatch(/3\s*\/\s*2|3.*2/s);
    }
    if (cardId === "N000015") {
      expect(modal.cardText).toContain("Windjalf");
      expect(modal.cardText).toMatch(/2\s*\/\s*7|2.*7/s);
      expect(modal.relatedText).toContain("Boute-flammes");
      expect(modal.cardText).not.toContain("S000054");
      expect(modal.relatedText).not.toContain("S000054");
    }
    if (cardId === "S000054") {
      expect(modal.cardText).toContain("Boute-flammes");
      expect(modal.cardText).toContain("Sort");
      expect(modal.cardText).toContain("Sang ardent");
    }
    await page.screenshot({ path: `test-results/collection-indus-1-${cardId}.png`, fullPage: true });
    await page.keyboard.press("Escape");
    await expect(page.locator("#modalOverlay.open")).toHaveCount(0);
    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });
}

test("new Collection records keep structured costs and generated-card semantics", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openCollection(page);
  const audit = await page.evaluate(() => {
    const pick = id => CARDS.find(card => card.id === id);
    return {
      n000015: pick("N000015"),
      mv000025: pick("MV000025"),
      s000054: pick("S000054"),
      nCost: collectionCostDefinition("N000015"),
      sCost: collectionCostDefinition("S000054"),
      related: resolveRelatedCards("N000015").resolvedCards.map(card => ({ id: card.id, name: card.publicName || card.name })),
      publicTechnicalLeak: [pick("N000015")?.desc, pick("S000054")?.desc].join(" ").includes("[ID =")
    };
  });
  expect(audit.mv000025).toMatchObject({ id: "MV000025", name: "Esprit dérangé", type: "Serviteur", faction: "Mort-vivant", atk: 3, pdv: 2, maxOwned: 0, qty: 0, owned: false });
  expect(audit.n000015).toMatchObject({ id: "N000015", name: "Windjalf, l'Ancien", type: "Serviteur", faction: "Nain", atk: 2, pdv: 7, maxOwned: 1, qty: 0, owned: false });
  expect(audit.s000054).toMatchObject({ id: "S000054", name: "Boute-flammes", type: "Sort", faction: "/", maxOwned: 0, qty: 0, owned: false });
  expect(audit.nCost).toEqual({ total: 5, groups: [{ op: null, resources: [{ key: "selene", amount: 5, explicit: true }] }] });
  expect(audit.sCost).toEqual({ total: 5, groups: [
    { op: null, resources: [{ key: "pierre", amount: 1, explicit: false }] },
    { op: "+", resources: [{ key: "fer", amount: 1, explicit: false }] },
    { op: "+", resources: [{ key: "selene", amount: 1, explicit: false }] }
  ] });
  expect(audit.related).toEqual([{ id: "S000054", name: "Boute-flammes" }]);
  expect(audit.publicTechnicalLeak).toBe(false);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
