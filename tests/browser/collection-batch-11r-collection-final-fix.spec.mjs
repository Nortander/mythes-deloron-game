import { expect, test } from "@playwright/test";
import {
  attachDiagnostics,
  attachPageDiagnostics,
  clickCollectionCard,
  collectionCard,
  closeCollectionModal,
  openCollection
} from "./helpers/eloron-ui.mjs";

const MUR_NON_MORT_TEXT =
  "[Insensible] [Rempart] Ne peut ni attaquer ni riposter. Chaque fois que ce serviteur subit des dégâts, ajoute 1 à 3 Échos à vos réserves, fonction des dégâts reçus en une fois : de 0 à 4 dommages, génère 1 Écho ; de 5 à 8 dommages, 2 Échos ; au-delà de 8 points de dégâts, 3 Échos. Cet effet peut se produire plusieurs fois par tour. [Vengeance] Ajoute 1 « Commandant squelette » et 2 « Guerriers cendreux » à votre main.";

const HOKHAN_TEXT =
  "[Insensible] [Initiative] Ajoute le « Forgeron de la Lame » à votre main, depuis votre deck ou cimetière, puis inflige un montant de dégâts égal à vos réserves d'Échos, réparti entre tous les serviteurs adverses. [Vengeance] Replace le « Mage du Cercle - Hokhan Ashir » au fond de votre deck et ajoute 8 Échos à vos réserves.";

const HOKHAN_RELATED_IDS = ["MV000019", "MV000016", "MV000017", "MV000018", "MV000021"];
const HOKHAN_RELATED_NAMES = [
  "Forgeron de la Lame",
  "Serviteur de la Lame",
  "Cauchemar de la Lame",
  "Mage de la Lame",
  "Scorpion de la Lame"
];

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expectedRenderedText(value) {
  return normalizeText(value).replace(/\[([^\]]+)]/g, "$1");
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource/i.test(message));
}

test.describe("COLLECTION-BATCH-11R correctif final Collection Morts-vivants", () => {
  test("Mur non-mort et Mage du Cercle - Hokhan Ashir sont synchronisés dans la Collection", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);

    for (const cardId of ["MV000030", "AVS000008", ...HOKHAN_RELATED_IDS]) {
      await page.locator("#searchInput").fill(cardId);
      await expect(collectionCard(page, cardId), `Carte Collection ${cardId}`).toBeVisible();
    }

    const audit = await page.evaluate(({ relatedIds }) => {
      const normalize = value => String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      const strip = html => {
        const node = document.createElement("div");
        node.innerHTML = String(html || "");
        return normalize(node.textContent || "");
      };
      const snapshot = id => {
        const card = CARDS.find(entry => entry.id === id);
        const rawText = card ? String(card.detail || card.desc || "") : "";
        const renderedHtml = card ? formatPlayerFacingCardText(rawText, card) : "";
        const tooltipModel = card ? buildCanonicalCardTooltips(id, "collection") : { right: [] };
        const related = card ? resolveRelatedCards(id) : { resolvedCards: [], unresolvedIds: [] };
        return {
          id,
          found: !!card,
          descText: strip(card?.desc || ""),
          sourceText: strip(rawText),
          rawSource: rawText,
          renderedText: strip(renderedHtml),
          renderedHtml,
          condition: card?.cond || "",
          tooltipTitles: tooltipModel.right.map(item => item.title),
          relatedIds: related.resolvedCards.map(entry => entry.id),
          unresolvedRelatedIds: related.unresolvedIds,
          semicolons: Array.from(rawText.matchAll(/;/g)).map(match => ({
            index: match.index,
            previousChar: rawText[match.index - 1] || ""
          })),
          hasPublicTechnicalId: /\[\s*ID\s*=|RAME\*/.test(strip(rawText))
        };
      };
      return {
        mur: snapshot("MV000030"),
        hokhan: snapshot("AVS000008"),
        relatedFound: relatedIds.map(id => ({ id, found: !!CARDS.find(entry => entry.id === id) }))
      };
    }, { relatedIds: HOKHAN_RELATED_IDS });

    expect(audit.mur.found).toBe(true);
    expect(audit.hokhan.found).toBe(true);
    expect(audit.relatedFound).toEqual(HOKHAN_RELATED_IDS.map(id => ({ id, found: true })));

    expect(normalizeText(audit.mur.descText), "MV000030 desc").toBe(normalizeText(MUR_NON_MORT_TEXT));
    expect(normalizeText(audit.mur.sourceText), "MV000030 source affichée").toBe(normalizeText(MUR_NON_MORT_TEXT));
    expect(normalizeText(audit.mur.renderedText), "MV000030 rendu").toBe(expectedRenderedText(MUR_NON_MORT_TEXT));
    expect(audit.mur.semicolons.length, "MV000030 points-virgules").toBeGreaterThan(0);
    for (const semicolon of audit.mur.semicolons) {
      expect(semicolon.previousChar, `MV000030 point-virgule ${semicolon.index}`).toBe("\u00a0");
    }

    expect(normalizeText(audit.hokhan.descText), "AVS000008 desc").toBe(normalizeText(HOKHAN_TEXT));
    expect(normalizeText(audit.hokhan.renderedText), "AVS000008 rendu").toBe(expectedRenderedText(HOKHAN_TEXT));
    expect(audit.hokhan.condition, "AVS000008 condition parasite").toBe("");
    expect(audit.hokhan.tooltipTitles).not.toContain("CONDITION D’INVOCATION");
    expect(audit.hokhan.tooltipTitles).not.toContain("Condition d’invocation");
    expect(audit.hokhan.relatedIds).toEqual(HOKHAN_RELATED_IDS);
    expect(audit.hokhan.unresolvedRelatedIds).toEqual([]);
    expect(audit.hokhan.hasPublicTechnicalId).toBe(false);
    expect(audit.hokhan.renderedHtml).toContain('data-keyword="Insensible"');
    expect(audit.hokhan.renderedHtml).toContain('data-keyword="Initiative"');
    expect(audit.hokhan.renderedHtml).toContain('data-keyword="Vengeance"');
    expect(audit.hokhan.renderedHtml).toContain('<strong class="kv">8</strong>');

    await page.locator("#searchInput").fill("AVS000008");
    await clickCollectionCard(page, "AVS000008");
    const modal = await page.evaluate(() => ({
      descText: document.querySelector("#modalDesc")?.innerText || "",
      rightText: document.querySelector("#modalRight")?.innerText || "",
      relatedNames: Array.from(document.querySelectorAll("#modalRelated .related-mini .rel-name")).map(node => node.textContent.trim()),
      relatedText: document.querySelector("#modalRelated")?.innerText || ""
    }));
    expect(normalizeText(modal.descText)).toBe(expectedRenderedText(HOKHAN_TEXT));
    expect(modal.rightText).not.toContain("CONDITION D’INVOCATION");
    expect(modal.rightText).not.toContain("Condition d’invocation");
    for (const relatedName of HOKHAN_RELATED_NAMES) {
      expect(modal.relatedNames).toContain(relatedName);
    }
    expect(modal.relatedText).toContain("Forgeron de la Lame");
    await closeCollectionModal(page);

    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });
});
