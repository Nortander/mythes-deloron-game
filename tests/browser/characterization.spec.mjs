import { expect, test } from "@playwright/test";
import {
  attachDiagnostics,
  attachPageDiagnostics,
  clickCollectionCard,
  closeCollectionModal,
  collectionInventory,
  collectionModalSnapshot,
  hoverPartCard,
  hoverFirstPartCardMatching,
  FIRST_SCENARIO_PARTICIPANT_VISIBLE_RANDOM,
  openCollection,
  openPartie,
  partieInventory,
  previewSnapshot
} from "./helpers/eloron-ui.mjs";

test.describe("ENV-1F2 characterization of open interface regressions", () => {
  test("inventory: Collection cards and partie scenario cards are discoverable", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    const collection = await collectionInventory(page);
    expect(collection.length).toBeGreaterThan(10);
    expect(collection.some((card) => card.cardId === "R000014")).toBeTruthy();

    const scenarios = ["raith-yria", "hokhan-uram", "rohen-yria", "approvisionnement-pioche", "cheat-embrasement"];
    const partie = await partieInventory(page, scenarios);
    expect(partie).toHaveLength(scenarios.length);
    expect(partie.some((entry) => entry.cards.length > 0)).toBeTruthy();

    await testInfo.attach("collection-card-inventory", { contentType: "application/json", body: Buffer.from(JSON.stringify(collection, null, 2), "utf8") });
    await testInfo.attach("partie-card-inventory", { contentType: "application/json", body: Buffer.from(JSON.stringify(partie, null, 2), "utf8") });
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Collection: Approvisionnement detail modal opens and closes", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    await clickCollectionCard(page, "R000014");
    const snapshot = await collectionModalSnapshot(page);
    expect(snapshot.open).toBeTruthy();
    expect(snapshot.cardText).toContain("Ailanterie");
    expect(snapshot.rightText).toContain("APPROVISIONNEMENT");
    await closeCollectionModal(page);
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Collection: owned Serviteur detail modal opens", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    await clickCollectionCard(page, "H000017");
    const snapshot = await collectionModalSnapshot(page);
    await testInfo.attach("owned-servant-modal-snapshot", { contentType: "application/json", body: Buffer.from(JSON.stringify(snapshot, null, 2), "utf8") });
    expect(snapshot.open).toBeTruthy();
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Collection: missing Serviteur detail modal opens", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    await clickCollectionCard(page, "MV000006");
    const snapshot = await collectionModalSnapshot(page);
    await testInfo.attach("missing-servant-modal-snapshot", { contentType: "application/json", body: Buffer.from(JSON.stringify(snapshot, null, 2), "utf8") });
    expect(snapshot.open).toBeTruthy();
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Collection: Sort detail modal opens", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    await clickCollectionCard(page, "S000015");
    const snapshot = await collectionModalSnapshot(page);
    await testInfo.attach("sort-modal-snapshot", { contentType: "application/json", body: Buffer.from(JSON.stringify(snapshot, null, 2), "utf8") });
    expect(snapshot.open).toBeTruthy();
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Collection: Approvisionnement lore is visible and styled as lore", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    await clickCollectionCard(page, "R000014");
    const snapshot = await collectionModalSnapshot(page);
    expect(snapshot.open).toBeTruthy();
    expect(snapshot.loreText).toContain("Les ailanteries sont des autels");
    expect(snapshot.loreStyle?.fontStyle).toBe("italic");
    expect(Number.parseInt(snapshot.loreStyle?.fontWeight || "400", 10)).toBeLessThan(700);
    expect(snapshot.loreStyle?.textDecorationLine).toBe("none");
    await closeCollectionModal(page);
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Collection: related source audit resolves without ReferenceError", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    const audit = await page.evaluate(() => ["AVS000006", "B000003", "B000013"].map((cardId) => {
      try {
        return { cardId, inDom: !!document.querySelector(`.ccard[data-card-id="${cardId}"]`), audit: window.auditCardRelatedRenderingBasic(cardId) };
      } catch (error) {
        return { cardId, inDom: !!document.querySelector(`.ccard[data-card-id="${cardId}"]`), error: String(error) };
      }
    }));
    await testInfo.attach("collection-related-audit", { contentType: "application/json", body: Buffer.from(JSON.stringify(audit, null, 2), "utf8") });
    expect(audit.every((entry) => !entry.error)).toBeTruthy();
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Partie: Approvisionnement preview shows lore in the central card body", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    const sourceCard = await hoverFirstPartCardMatching(page, ".hc.appro", "raith-yria");
    const snapshot = await previewSnapshot(page);
    const loreCandidate = sourceCard.text.split(/\n+/).map((line) => line.trim()).find((line) => line.length > 40 && !line.includes("Approvisionnement"));
    await testInfo.attach("supply-preview-snapshot", {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({ sourceCard, loreCandidate, snapshot }, null, 2), "utf8")
    });
    expect(snapshot.layerOpen).toBeTruthy();
    expect(snapshot.previewText).toContain(loreCandidate);
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Partie: Approvisionnement preview tooltip uses technical APPROVISIONNEMENT ability", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await hoverFirstPartCardMatching(page, ".hc.appro", "raith-yria");
    const snapshot = await previewSnapshot(page);
    const supplyPanel = snapshot.panels.find((panel) => panel.title === "APPROVISIONNEMENT");
    expect(supplyPanel).toBeTruthy();
    expect(supplyPanel.text).toContain("Fournit");
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Partie: servant preview does not duplicate the ability in a generic Capacite panel", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await hoverPartCard(page, "H000031", "cheat-embrasement");
    const snapshot = await previewSnapshot(page);
    await testInfo.attach("igor-preview-snapshot", { contentType: "application/json", body: Buffer.from(JSON.stringify(snapshot, null, 2), "utf8") });
    expect(snapshot.previewText).toContain("Igor le Pyromancien");
    expect(snapshot.panels.some((panel) => panel.title.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase() === "capacite")).toBeFalsy();
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Partie: Serviteur de la rune keywords are canonical in Igor preview", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await hoverPartCard(page, "H000031", "cheat-embrasement");
    const snapshot = await previewSnapshot(page);
    expect(snapshot.previewText).not.toContain("[Serviteur de la rune]");
    expect(snapshot.panels.some((panel) => panel.title === "Serviteur de la rune")).toBeTruthy();
    expect(snapshot.panels.some((panel) => panel.html.includes('data-keyword="Serviteur de la rune"'))).toBeTruthy();
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Partie: Jardins botaniques has central text and one Capacite panel", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await hoverPartCard(page, "S000045", "approvisionnement-pioche", {
      randomValues: FIRST_SCENARIO_PARTICIPANT_VISIBLE_RANDOM
    });
    const snapshot = await previewSnapshot(page);
    expect(snapshot.previewText).toContain("Jardins botaniques");
    expect(snapshot.previewText).toContain("Toutes vos cartes");
    const abilityPanels = snapshot.panels.filter((panel) => panel.title.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase() === "capacite");
    expect(abilityPanels).toHaveLength(1);
    expect(abilityPanels[0].text.trim().length).toBeGreaterThan("Capacite".length);
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Partie: Jardins botaniques related IDs are resolved before preview rendering", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openPartie(page, "approvisionnement-pioche", {
      randomValues: FIRST_SCENARIO_PARTICIPANT_VISIBLE_RANDOM
    });
    const relatedAudit = await page.evaluate(() => {
      try {
        const model = window.getCanonicalCardDisplayModel("S000045");
        const related = window.resolveRelatedCards(model);
        return {
          cardId: "S000045",
          publicName: model.publicName,
          detailedEffect: model.detailedEffect,
          canonicalRelatedIds: model.relatedCardIds,
          resolvedRelatedCards: related.resolvedCards,
          unresolvedRelatedIds: related.unresolvedIds,
          duplicateRelatedIds: related.duplicateIds
        };
      } catch (error) {
        return { cardId: "S000045", error: String(error) };
      }
    });
    await testInfo.attach("jardins-related-audit", { contentType: "application/json", body: Buffer.from(JSON.stringify(relatedAudit, null, 2), "utf8") });
    expect(relatedAudit.error).toBeFalsy();
    expect(relatedAudit.canonicalRelatedIds).toEqual(["R000004", "R000003"]);
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Partie: generic card type tooltips are absent", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await hoverPartCard(page, "H000031", "cheat-embrasement");
    const snapshot = await previewSnapshot(page);
    const forbiddenTitles = ["Serviteur", "Sort"];
    expect(snapshot.panels.some((panel) => forbiddenTitles.includes(panel.title))).toBeFalsy();
    await attachDiagnostics(testInfo, diagnostics);
  });
});
