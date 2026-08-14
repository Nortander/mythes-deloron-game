import { expect, test } from "@playwright/test";
import {
  attachDiagnostics,
  attachPageDiagnostics,
  clickCollectionCard,
  collectionCard,
  closeCollectionModal,
  openCollection
} from "./helpers/eloron-ui.mjs";

const ECHO_HARVEST_TITLE = "RÉCOLTE D'ÉCHOS";
const ECHO_HARVEST_BODY =
  "Les serviteurs et sorts qui génèrent de l'Écho en détruisant/ capturant d'autres cartes récoltent plus ou moins de ressources en fonction du coût de base de leurs victimes (1 Écho pour un coût de 0 à 4 ; 2 Échos pour un coût entre 5 et 8 ; 3 Échos au-delà de 8). Cette règle peut connaître des exceptions, si une carte mentionne explicitement des chiffres différents.";

const TARGET_IDS = [
  "MV000026",
  "MV000028",
  "MV000008",
  "MV000009",
  "MV000029",
  "MV000003",
  "MV000011",
  "MV000030",
  "MV000002"
];

const EXACT_TEXTS = {
  MV000008:
    "[Initiative] Retire 1 serviteur adverse ciblé du terrain. [Vengeance] Le serviteur précédemment retiré reprend sa place sur le terrain, sauf si l'adversaire n'a plus d'emplacement de serviteur libre, auquel cas, ajoute la victime à votre cimetière.",
  MV000009:
    "Chaque fois que ce serviteur détruit un adversaire, ajoute 1 à 3 Échos à votre approvisionnement. [Vengeance] Génère son coût en Échos et l'ajoute à vos réserves.",
  MV000029:
    "[Initiative] Ajoute 3 Échos à vos réserves. À chacune de vos fins de tour, si vous n’avez dépensé aucun Écho pendant ce tour, fournit 1 Écho supplémentaire.",
  MV000003:
    "La première fois que la « Gueule du trépas » devrait être détruite, détruit à sa place 1 serviteur adverse dont l'attaque est inférieure ou égale à celle de cette carte, puis génère 1 à 3 Échos en fonction du coût imprimé de la victime. Enfin, rend à la « Gueule du trépas » un montant de points de vie égal à l'attaque du serviteur détruit à sa place."
};

const HARVEST_TOOLTIP_CARDS = ["MV000026", "MV000028", "MV000009", "MV000003", "MV000011", "MV000002"];

function normalizeText(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function expectedRenderedText(value) {
  return normalizeText(value).replace(/\[([^\]]+)]/g, "$1").replace(/’/g, "'");
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource/i.test(message));
}

test.describe("COLLECTION-BATCH-11Q synchronisation Collection Morts-vivants", () => {
  test("les textes et infobulles Batch 11 validés sont synchronisés dans la Collection", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);

    for (const cardId of TARGET_IDS) {
      await page.locator("#searchInput").fill(cardId);
      await expect(collectionCard(page, cardId), `Carte Collection ${cardId}`).toBeVisible();
    }
    await page.locator("#searchInput").fill("");

    const audit = await page.evaluate(({ targetIds, harvestTitle }) => {
      const normalize = value => String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      const strip = html => {
        const node = document.createElement("div");
        node.innerHTML = String(html || "");
        return normalize(node.textContent || "");
      };
      const semicolonAudit = raw => Array.from(String(raw || "").matchAll(/;/g)).map(match => ({
        index: match.index,
        previousChar: String(raw || "")[match.index - 1] || ""
      }));
      return {
        cards: targetIds.map(id => {
          const card = CARDS.find(entry => entry.id === id);
          const rawText = card ? String(card.detail || card.desc || "") : "";
          const renderedHtml = card ? formatPlayerFacingCardText(rawText, card) : "";
          const tooltipModel = card ? buildCanonicalCardTooltips(id, "collection") : { right: [] };
          return {
            id,
            found: !!card,
            name: card?.name || "",
            keywords: card?.kw || [],
            rawDesc: card?.desc || "",
            rawDetail: card?.detail || "",
            sourceText: strip(rawText),
            renderedText: strip(renderedHtml),
            renderedHtml,
            tooltipTitles: tooltipModel.right.map(item => item.title),
            tooltipBodies: tooltipModel.right.map(item => normalize(item.body)),
            hasHarvestTooltip: tooltipModel.right.some(item => item.title === harvestTitle),
            hasVengeanceTooltip: tooltipModel.right.some(item => item.title === "Vengeance"),
            harvestBody: normalize(tooltipModel.right.find(item => item.title === harvestTitle)?.body || ""),
            visibleTechnicalText: /\[\s*ID\s*=|RAME\*/.test(strip(rawText)),
            semicolons: semicolonAudit(card?.detail || card?.desc || "")
          };
        })
      };
    }, { targetIds: TARGET_IDS, harvestTitle: ECHO_HARVEST_TITLE });

    const byId = Object.fromEntries(audit.cards.map(card => [card.id, card]));

    for (const cardId of TARGET_IDS) {
      expect(byId[cardId]?.found, cardId).toBe(true);
    }

    for (const [cardId, expected] of Object.entries(EXACT_TEXTS)) {
      expect(normalizeText(byId[cardId].sourceText), `${cardId} texte source`).toBe(normalizeText(expected));
      expect(normalizeText(byId[cardId].renderedText), `${cardId} texte rendu`).toBe(expectedRenderedText(expected));
    }

    expect(byId.MV000008.renderedText).not.toContain("Retire le serviteur adverse du terrain");
    expect(byId.MV000008.renderedText).not.toContain("reprend sa place quand l'Araignée géante réanimée");
    expect(byId.MV000009.renderedText).not.toContain("ajoute 1 Écho à votre approvisionnement");
    expect(byId.MV000009.renderedText).not.toContain("placé sous votre pile d’Échos plutôt que dans le cimetière adverse");
    expect(byId.MV000029.renderedText).toContain("À chacune de vos fins de tour");
    expect(byId.MV000003.renderedText).not.toContain("l'attaque est inférieure à celle de cette carte");

    for (const cardId of HARVEST_TOOLTIP_CARDS) {
      expect(byId[cardId].hasHarvestTooltip, `${cardId} infobulle ${ECHO_HARVEST_TITLE}`).toBe(true);
      expect(byId[cardId].harvestBody, `${cardId} corps infobulle`).toBe(normalizeText(ECHO_HARVEST_BODY));
    }
    expect(byId.MV000008.hasHarvestTooltip).toBe(false);
    expect(byId.MV000008.hasVengeanceTooltip).toBe(true);

    for (const cardId of ["MV000026", "MV000028", "MV000009", "MV000003", "MV000011", "MV000002", "MV000008", "MV000029", "MV000030"]) {
      expect(byId[cardId].renderedHtml, `${cardId} nombres valorisés`).toContain('class="kv"');
    }
    expect(byId.MV000008.renderedHtml).toContain('data-keyword="Initiative"');
    expect(byId.MV000008.renderedHtml).toContain('data-keyword="Vengeance"');
    expect(byId.MV000029.renderedHtml).toContain('data-keyword="Initiative"');
    expect(byId.MV000009.renderedHtml).toContain('data-keyword="Vengeance"');

    expect(byId.MV000030.semicolons.length, "MV000030 points-virgules").toBeGreaterThan(0);
    for (const item of byId.MV000030.semicolons) {
      expect(item.previousChar, `MV000030 point-virgule ${item.index}`).toBe("\u00a0");
    }

    await page.locator("#searchInput").fill("MV000003");
    await clickCollectionCard(page, "MV000003");
    const modal = await page.evaluate(() => {
      const right = document.querySelector("#modalRight");
      return {
        text: document.querySelector("#modalDesc")?.innerText || "",
        rightTitles: Array.from(right?.querySelectorAll(".modal-kw-name") || []).map(node => node.textContent.trim()),
        rightText: right?.innerText || ""
      };
    });
    expect(normalizeText(modal.text)).toBe(expectedRenderedText(EXACT_TEXTS.MV000003));
    expect(modal.rightTitles).toContain(ECHO_HARVEST_TITLE);
    expect(modal.rightText).not.toContain("[ID =");
    expect(modal.rightText).not.toContain("RAME");
    await closeCollectionModal(page);

    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });
});
