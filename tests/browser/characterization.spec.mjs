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

  test("Collection: owned Serviteur detail modal is still blocked", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    await clickCollectionCard(page, "H000017");
    const snapshot = await collectionModalSnapshot(page);
    await testInfo.attach("owned-servant-modal-snapshot", { contentType: "application/json", body: Buffer.from(JSON.stringify(snapshot, null, 2), "utf8") });
    test.fail(true, "Current regression: clicking an owned Serviteur in Collection does not open the detail modal.");
    expect(snapshot.open).toBeTruthy();
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Collection: missing Serviteur detail modal is still blocked", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    await clickCollectionCard(page, "MV000006");
    const snapshot = await collectionModalSnapshot(page);
    await testInfo.attach("missing-servant-modal-snapshot", { contentType: "application/json", body: Buffer.from(JSON.stringify(snapshot, null, 2), "utf8") });
    test.fail(true, "Current regression: clicking a missing Serviteur in Collection does not open the detail modal.");
    expect(snapshot.open).toBeTruthy();
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Collection: Sort detail modal is still blocked", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    await clickCollectionCard(page, "S000015");
    const snapshot = await collectionModalSnapshot(page);
    await testInfo.attach("sort-modal-snapshot", { contentType: "application/json", body: Buffer.from(JSON.stringify(snapshot, null, 2), "utf8") });
    test.fail(true, "Current regression: clicking a Sort in Collection does not open the detail modal.");
    expect(snapshot.open).toBeTruthy();
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Collection: Approvisionnement lore is visible and styled as lore", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    await clickCollectionCard(page, "R000014");
    const snapshot = await collectionModalSnapshot(page);
    expect(snapshot.open).toBeTruthy();
    expect(snapshot.loreText).toContain("Les ailanteries sont des autels sacrés");
    expect(snapshot.loreStyle?.fontStyle).toBe("italic");
    expect(Number.parseInt(snapshot.loreStyle?.fontWeight || "400", 10)).toBeLessThan(700);
    expect(snapshot.loreStyle?.textDecorationLine).toBe("none");
    await closeCollectionModal(page);
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Collection: related source audit currently fails before visual verification", async ({ page }, testInfo) => {
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
    test.fail(true, "Current regression: related-card audit errors before the Collection detail can verify the left column.");
    expect(audit.every((entry) => !entry.error)).toBeTruthy();
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Partie: Approvisionnement preview still lacks lore in the central card body", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    const sourceCard = await hoverFirstPartCardMatching(page, ".hc.appro", "raith-yria");
    const snapshot = await previewSnapshot(page);
    const loreCandidate = sourceCard.text.split(/\n+/).map((line) => line.trim()).find((line) => line.length > 40 && !line.includes("Approvisionnement"));
    await testInfo.attach("supply-preview-snapshot", {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({ sourceCard, loreCandidate, snapshot }, null, 2), "utf8")
    });
    expect(snapshot.layerOpen).toBeTruthy();
    test.fail(true, "Current regression: Approvisionnement preview body shows the type/fallback instead of the lore.");
    expect(snapshot.previewText).toContain(loreCandidate);
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Partie: Approvisionnement preview tooltip still uses lore as APPROVISIONNEMENT ability", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await hoverFirstPartCardMatching(page, ".hc.appro", "raith-yria");
    const snapshot = await previewSnapshot(page);
    const supplyPanel = snapshot.panels.find((panel) => panel.title === "APPROVISIONNEMENT");
    expect(supplyPanel).toBeTruthy();
    test.fail(true, "Current regression: the APPROVISIONNEMENT tooltip should contain technical production ability, not the lore sentence.");
    expect(supplyPanel.text).toContain("Fournit");
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Partie: servant preview still duplicates the ability in a generic Capacité panel", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await hoverPartCard(page, "H000031", "cheat-embrasement");
    const snapshot = await previewSnapshot(page);
    await testInfo.attach("igor-preview-snapshot", { contentType: "application/json", body: Buffer.from(JSON.stringify(snapshot, null, 2), "utf8") });
    expect(snapshot.previewText).toContain("Igor le Pyromancien");
    test.fail(true, "Current regression: Serviteur previews still create a generic Capacité panel that repeats the central ability.");
    expect(snapshot.panels.some((panel) => panel.title.toLowerCase() === "capacité")).toBeFalsy();
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

  test("Partie: Jardins botaniques has central text and one Capacité panel", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await hoverPartCard(page, "S000045", "approvisionnement-pioche");
    const snapshot = await previewSnapshot(page);
    expect(snapshot.previewText).toContain("Jardins botaniques");
    expect(snapshot.previewText).toContain("Toutes vos cartes");
    expect(snapshot.panels.filter((panel) => panel.title.toLowerCase() === "capacité")).toHaveLength(1);
    await attachDiagnostics(testInfo, diagnostics);
  });

  test("Partie: Jardins botaniques related IDs are not resolved before preview rendering", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openPartie(page, "approvisionnement-pioche");
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
    test.fail(true, "Current regression: related IDs present in the Jardins botaniques detailed text are not resolved into related cards.");
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
