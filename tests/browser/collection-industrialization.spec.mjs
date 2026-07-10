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

const julyImportedIds = ["H000032", "H000033", "H000034", "H000035", "H000036", "S000055", "S000057", "S000058", "S000059", "S000060"];
const addedIds = ["MV000025", "N000015", "S000054", ...julyImportedIds];
const expectedCanonicalCount = 328;
const expectedObtainableCount = 310;
const nonObtainableIds = ["B000003", "B000004", "B000005", "EDG000011", "EDG000012", "EN000011", "H000033", "H000034", "H000035", "H000036", "MV000025", "S000008", "S000025", "S000054", "S000057", "S000058", "S000059", "S000060"];
const transformationOnlyIds = ["B000003", "B000004", "B000005"];
const generatedOnlyIds = ["EDG000011", "EN000011", "H000033", "H000034", "H000035", "H000036", "MV000025", "S000008", "S000054", "S000057", "S000058", "S000059", "S000060"];
const specialUnobtainableIds = ["EDG000012", "S000025"];
const byId = Object.fromEntries(canonical.cards.map(card => [card.id, card]));

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource/i.test(message));
}

async function searchCollectionCard(page, cardId) {
  await page.locator("#searchInput").fill(cardId);
  await expect(collectionCard(page, cardId), "Collection card " + cardId).toBeVisible();
}

async function setPossessionFilter(page, value) {
  const button = page.locator('[data-filter="possession"][data-value="' + value + '"]');
  await button.click();
  await expect(button).toHaveClass(/active/);
  await expect(button).toHaveAttribute("aria-checked", "true");
}

async function resetCollectionFilters(page) {
  await page.locator("#btnReset").click();
  await expect(page.locator('[data-filter="possession"][data-value="all"]')).toHaveClass(/active/);
}

test("Collection corpus matches the 2026-07-10 canonical export", async ({ page }, testInfo) => {
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
  expect(audit.collectionCount).toBeGreaterThanOrEqual(expectedCanonicalCount);
  expect(audit.uniqueCount).toBeGreaterThanOrEqual(expectedCanonicalCount);
  expect(audit.canonicalCount).toBe(expectedCanonicalCount);
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
  expect(canonical.cardCount).toBe(expectedCanonicalCount);
  expect(canonical.uniqueIdCount).toBe(expectedCanonicalCount);
  expect(signatures.cardCount).toBe(expectedCanonicalCount);
  expect(signatures.signatures.map(sig => sig.id).sort()).toEqual(canonical.cards.map(card => card.id).sort());
  expect(canonical.cards.filter(card => card.catalogKind === "CARD")).toHaveLength(expectedCanonicalCount);
  expect(canonical.cards.filter(card => card.obtainability === "OBTAINABLE")).toHaveLength(expectedObtainableCount);
  expect(canonical.cards.filter(card => card.maxOwned === 0).map(card => card.id).sort()).toEqual([...nonObtainableIds].sort());
  expect(canonical.cards.filter(card => card.obtainability === "OBTAINABLE" && card.maxOwned === 0)).toEqual([]);
  expect(canonical.cards.filter(card => card.obtainability !== "OBTAINABLE" && card.maxOwned > 0)).toEqual([]);
  expect(signatures.signatures.filter(sig => sig.catalogKind !== "CARD")).toEqual([]);
  expect(signatures.signatures.filter(sig => !["OBTAINABLE", "GENERATED_ONLY", "TRANSFORMATION_ONLY", "SPECIAL_UNOBTAINABLE"].includes(sig.obtainability))).toEqual([]);
  expect(signatures.signatures.filter(sig => sig.obtainability !== "OBTAINABLE").map(sig => sig.id).sort()).toEqual([...nonObtainableIds].sort());
  for (const id of julyImportedIds) {
    const card = byId[id];
    const signature = signatures.signatures.find(item => item.id === id);
    expect(card).toBeTruthy();
    expect(signature).toMatchObject({ id, implementationStatus: "ABSENT", catalogKind: "CARD", obtainability: card.obtainability });
  }
  expect(byId.H000032).toMatchObject({ type: "Serviteur", faction: "Humain", attack: 1, health: 2, costTotal: 1, maxOwned: 1, obtainability: "OBTAINABLE" });
  expect(byId.S000055).toMatchObject({ type: "Sort", faction: "/", costTotal: 0, maxOwned: 1, obtainability: "OBTAINABLE" });
  expect(julyImportedIds.filter(id => byId[id].obtainability === "GENERATED_ONLY")).toEqual(["H000033", "H000034", "H000035", "H000036", "S000057", "S000058", "S000059", "S000060"]);
  expect(dependencies.dependencies).toEqual(expect.arrayContaining([
    expect.objectContaining({ sourceId: "H000032", dependencyId: "S000057", relation: "ADDS_TO_HAND" }),
    expect.objectContaining({ sourceId: "S000060", dependencyId: "H000036", relation: "ADDS_TO_HAND" }),
    expect.objectContaining({ sourceId: "S000055", dependencyId: "MV000024", relation: "SUMMONS_OR_CREATES" })
  ]));
  expect(primitives.primitives.length).toBeGreaterThan(10);
  expect(keywords.keywordCount).toBeGreaterThan(10);
  const windjalfDependency = dependencies.dependencies.find(dep => dep.sourceId === "N000015" && dep.dependencyId === "S000054");
  expect(windjalfDependency).toMatchObject({ relation: "ADDS_TO_HAND", dependencyInCanonicalCorpus: true });
  const doorKeyDependency = dependencies.dependencies.find(dep => dep.sourceId === "S000007" && dep.dependencyId === "S000008");
  expect(doorKeyDependency).toMatchObject({ relation: "REFERENCES", dependencyInCanonicalCorpus: true });
  expect(byId.S000008).toMatchObject({ id: "S000008", name: "Clef de pierre", catalogKind: "CARD", obtainability: "GENERATED_ONLY", maxOwned: 0, generatedOnly: true });
  expect(byId.S000008.obtainabilityReason).toContain("Porte infranchissable");
  expect(signatures.signatures.find(sig => sig.id === "N000015")?.requiredPrimitives).toContain("create-card");
  expect(signatures.signatures.find(sig => sig.id === "S000054")?.requiredPrimitives).toEqual(expect.arrayContaining(["burn-protection", "burn-status", "duration-persistent"]));
});

for (const cardId of addedIds) {
  test(`Collection renders newly synchronized ${cardId}`, async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    const expected = byId[cardId];
    await openCollection(page);
    if (expected.obtainability !== "OBTAINABLE") await setPossessionFilter(page, "unobtainable");
    await searchCollectionCard(page, cardId);
    if (julyImportedIds.includes(cardId)) {
      await page.locator("#searchInput").fill(expected.name);
      await expect(collectionCard(page, cardId), cardId + " name search result").toBeVisible();
    }
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
    if (julyImportedIds.includes(cardId) && expected.type === "Serviteur") {
      expect(modal.cardText).toMatch(new RegExp(String(expected.attack) + ".*" + String(expected.health), "s"));
    }
    if (julyImportedIds.includes(cardId) && expected.type === "Sort") {
      expect(modal.cardText).toContain("Sort");
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


test("Collection obtainability classification drives the global progress counter", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openCollection(page);
  const audit = await page.evaluate((expectedNonObtainableIds) => {
    const info = auditCollectionObtainability();
    const maxOwnedZero = info.cards.filter(card => card.catalogKind === "CARD" && card.maxOwned === 0).map(card => card.id).sort();
    return {
      canonicalCards: info.cards.filter(card => card.catalogKind === "CARD").length,
      avatars: info.avatars.map(card => card.id).sort(),
      nonObtainable: info.nonObtainable.map(card => ({ id: card.id, obtainability: card.obtainability, hidden: card.hidden, hiddenByDefault: card.hiddenByDefault })).sort((a, b) => a.id.localeCompare(b.id)),
      obtainableCount: info.obtainable.length,
      ownedObtainableCount: info.obtainable.filter(card => card.owned).length,
      counter: info.counter,
      maxOwnedZero,
      badObtainableMaxZero: info.cards.filter(card => card.obtainability === "OBTAINABLE" && card.maxOwned === 0).map(card => card.id),
      s000008: info.cards.find(card => card.id === "S000008"),
      badAvatarCard: info.cards.filter(card => card.type === "Avatar" && card.catalogKind !== "AVATAR").map(card => card.id),
      expectedMissing: expectedNonObtainableIds.filter(id => !maxOwnedZero.includes(id))
    };
  }, nonObtainableIds);
  expect(audit.canonicalCards).toBe(expectedCanonicalCount);
  expect(audit.avatars).toEqual(Array.from({ length: 14 }, (_, index) => "AV" + String(index + 1).padStart(6, "0")));
  expect(audit.maxOwnedZero).toEqual([...nonObtainableIds].sort());
  expect(audit.expectedMissing).toEqual([]);
  expect(audit.nonObtainable.map(card => card.id)).toEqual([...nonObtainableIds].sort());
  expect(audit.nonObtainable.filter(card => card.obtainability === "TRANSFORMATION_ONLY").map(card => card.id).sort()).toEqual([...transformationOnlyIds].sort());
  expect(audit.nonObtainable.filter(card => card.obtainability === "GENERATED_ONLY").map(card => card.id).sort()).toEqual([...generatedOnlyIds].sort());
  expect(audit.nonObtainable.filter(card => card.obtainability === "SPECIAL_UNOBTAINABLE").map(card => card.id).sort()).toEqual([...specialUnobtainableIds].sort());
  expect(audit.obtainableCount).toBe(expectedObtainableCount);
  expect(audit.counter.total).toBe(expectedObtainableCount);
  expect(audit.counter.owned).toBe(audit.ownedObtainableCount);
  expect(audit.counter.label).toBe(audit.ownedObtainableCount + " / " + expectedObtainableCount + " cartes obtenables");
  expect(audit.s000008).toMatchObject({ catalogKind: "CARD", obtainability: "GENERATED_ONLY", maxOwned: 0, qty: 0, owned: false, hidden: false });
  expect(audit.s000008.obtainabilityReason).toContain("Porte infranchissable");
  expect(audit.badObtainableMaxZero).toEqual([]);
  expect(audit.badAvatarCard).toEqual([]);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("POSSESSION is a single exclusive four-button group and keeps the counter global", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openCollection(page);
  const possessionSection = page.locator(".filter-section", { hasText: "Possession" }).first();
  const buttons = possessionSection.locator('[data-filter="possession"]');
  await expect(buttons).toHaveCount(4);
  await expect(buttons).toHaveText(["Toutes", "Possédées", "Manquantes", "Non obtenables"]);
  await expect(possessionSection.locator('[role="radiogroup"]')).toHaveCount(1);
  await expect(page.locator('[data-filter="possession"].active')).toHaveCount(1);
  await expect(page.locator('[data-filter="possession"][data-value="all"]')).toHaveClass(/active/);
  const initialCounter = await page.locator("#collectionCount").innerText();
  expect(initialCounter).toContain("cartes obtenables");
  expect(initialCounter).toContain("/ " + expectedObtainableCount + " cartes obtenables");
  for (const value of ["owned", "missing", "unobtainable", "all"]) {
    await setPossessionFilter(page, value);
    await expect(page.locator('[data-filter="possession"].active')).toHaveCount(1);
    await expect(page.locator('[data-filter="possession"][data-value="' + value + '"]')).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#collectionCount")).toHaveText(initialCounter);
  }
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("POSSESSION modes separate obtainable cards, unobtainable cards, and avatars", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openCollection(page);
  const counterText = await page.locator("#collectionCount").innerText();

  await page.locator("#searchInput").fill("S000054");
  await expect(collectionCard(page, "S000054")).toHaveCount(0);
  await page.locator("#searchInput").fill("S000008");
  await expect(collectionCard(page, "S000008")).toHaveCount(0);
  await page.locator("#searchInput").fill("MV000025");
  await expect(collectionCard(page, "MV000025")).toHaveCount(0);

  await resetCollectionFilters(page);
  await setPossessionFilter(page, "unobtainable");
  await page.locator("#btnShowAll").click();
  const unobtainableRuntime = await page.evaluate(() => getFiltered().map(card => ({ id: card.id, catalogKind: card.catalogKind, obtainability: card.obtainability, owned: card.owned, qty: card.qty, maxOwned: card.maxOwned })).sort((a, b) => a.id.localeCompare(b.id)));
  expect(unobtainableRuntime.map(card => card.id)).toEqual([...nonObtainableIds].sort());
  expect(unobtainableRuntime.every(card => card.catalogKind === "CARD" && card.obtainability !== "OBTAINABLE" && card.maxOwned === 0 && card.qty === 0)).toBe(true);
  await expect(page.locator("#collectionCount")).toHaveText(counterText);
  for (const id of ["B000003", "B000004", "B000005", "MV000025", "S000008", "S000054"]) {
    await page.locator("#searchInput").fill(id);
    await expect(collectionCard(page, id), id + " non-obtainable search result").toBeVisible();
    await expect(collectionCard(page, id).locator(".ccard-qty-unobtainable")).toHaveText("Non obtenable");
  }

  await resetCollectionFilters(page);
  await setPossessionFilter(page, "owned");
  await page.locator("#searchInput").fill("S000008");
  await expect(collectionCard(page, "S000008")).toHaveCount(0);
  await page.locator("#searchInput").fill("");
  const ownedRuntime = await page.evaluate(() => getFiltered().map(card => ({ id: card.id, catalogKind: card.catalogKind, obtainability: card.obtainability, owned: card.owned })));
  expect(ownedRuntime.length).toBeGreaterThan(0);
  expect(ownedRuntime.every(card => card.catalogKind === "CARD" && card.obtainability === "OBTAINABLE" && card.owned)).toBe(true);
  await expect(page.locator("#collectionCount")).toHaveText(counterText);

  await resetCollectionFilters(page);
  await setPossessionFilter(page, "missing");
  await page.locator("#searchInput").fill("S000008");
  await expect(collectionCard(page, "S000008")).toHaveCount(0);
  await page.locator("#searchInput").fill("");
  const missingRuntime = await page.evaluate(() => getFiltered().map(card => ({ id: card.id, catalogKind: card.catalogKind, obtainability: card.obtainability, owned: card.owned })));
  expect(missingRuntime.length).toBeGreaterThan(0);
  expect(missingRuntime.every(card => card.catalogKind === "CARD" && card.obtainability === "OBTAINABLE" && !card.owned)).toBe(true);
  await expect(page.locator("#collectionCount")).toHaveText(counterText);

  await resetCollectionFilters(page);
  await page.locator("#searchInput").fill("AV000001");
  await expect(collectionCard(page, "AV000001")).toBeVisible();
  await setPossessionFilter(page, "unobtainable");
  await expect(collectionCard(page, "AV000001")).toHaveCount(0);
  await expect(page.locator("#collectionCount")).toHaveText(counterText);

  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("non-obtainable cards remain available through linked-card previews and the POSSESSION layout stays contained", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    await openCollection(page);
    const geometry = await page.evaluate(() => {
      const section = Array.from(document.querySelectorAll(".filter-section")).find(element => element.querySelector(".filter-title")?.textContent?.trim() === "Possession");
      const group = section?.querySelector(".filter-toggle-group");
      const button = section?.querySelector('[data-filter="possession"][data-value="unobtainable"]');
      const sectionRect = section?.getBoundingClientRect();
      const groupRect = group?.getBoundingClientRect();
      const buttonRect = button?.getBoundingClientRect();
      return {
        section: sectionRect && { left: sectionRect.left, right: sectionRect.right, top: sectionRect.top, bottom: sectionRect.bottom },
        group: groupRect && { left: groupRect.left, right: groupRect.right, top: groupRect.top, bottom: groupRect.bottom },
        button: buttonRect && { left: buttonRect.left, right: buttonRect.right, top: buttonRect.top, bottom: buttonRect.bottom, width: buttonRect.width, height: buttonRect.height },
        bodyOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    expect(geometry.button.width).toBeGreaterThan(0);
    expect(geometry.button.left).toBeGreaterThanOrEqual(geometry.section.left - 1);
    expect(geometry.button.right).toBeLessThanOrEqual(geometry.section.right + 1);
    expect(geometry.button.right).toBeLessThanOrEqual(geometry.group.right + 1);
    expect(geometry.bodyOverflows).toBe(false);
  }

  await page.setViewportSize({ width: 1600, height: 900 });
  await openCollection(page);
  await page.locator("#searchInput").fill("Windjalf");
  await clickCollectionCard(page, "N000015");
  const modal = await collectionModalSnapshot(page);
  expect(modal.open).toBe(true);
  expect(modal.relatedText).toContain("Boute-flammes");
  expect(modal.relatedText).not.toContain("S000054");
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
