import { expect, test } from "@playwright/test";
import {
  attachDiagnostics,
  attachPageDiagnostics,
  clickCollectionCard,
  collectionCard,
  closeCollectionModal,
  collectionModalSnapshot,
  openCollection
} from "./helpers/eloron-ui.mjs";

const ARBITRATED_PUNCTUATION_IDS = [
  "B000007",
  "B000010",
  "B000011",
  "B000016",
  "DIV000014",
  "DIV000015",
  "GOB000019",
  "GOB000020",
  "H000025",
  "MV000012",
  "N000013",
  "R000002",
  "R000007",
  "R000016",
  "R000018",
  "R000020",
  "R000024",
  "S000007",
  "S000042",
  "S000055",
  "TRL000003"
];

async function searchCard(page, cardId) {
  await page.locator("#searchInput").fill(cardId);
  await expect(collectionCard(page, cardId), cardId).toBeVisible();
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource/i.test(message));
}

function normalizeSpaces(text) {
  return String(text || "").replace(/\u202f/g, "\u00a0");
}

function frenchPunctuationViolations(html) {
  const normalized = String(html || "")
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/\u202f/g, "\u00a0")
    .replace(/<[^>]+>/g, "");
  return Array.from(normalized.matchAll(/[^\u00a0][;:!?]/g)).map(match => ({
    index: match.index,
    fragment: normalized.slice(Math.max(0, match.index - 24), match.index + 24)
  }));
}

async function readCollectionCard(page, cardId) {
  await searchCard(page, cardId);
  return page.evaluate((id) => {
    const card = document.querySelector(`.ccard[data-card-id="${id}"]`);
    const dataSource = typeof CARDS !== "undefined" ? CARDS : window.CARDS;
    const data = dataSource?.find(entry => entry.id === id) || null;
    const desc = card?.querySelector(".ccard-desc-inner") || card?.querySelector(".ccard-desc-z") || card;
    const descTextNode = desc?.querySelector("p") || desc;
    const lore = desc?.querySelector("i, em, .card-lore-text");
    const style = lore ? getComputedStyle(lore) : null;
    const descStyle = descTextNode ? getComputedStyle(descTextNode) : null;
    return {
      id,
      data: data ? {
        name: data.name,
        type: data.type,
        desc: data.desc || "",
        detail: data.detail || "",
        cond: data.cond || "",
        keywords: data.kw || [],
        prodIcons: (data.prod || []).map(item => item.i || "")
      } : null,
      visibleText: desc?.innerText || "",
      visibleHtml: desc?.innerHTML || "",
      loreFontStyle: style?.fontStyle || "",
      descFontStyle: descStyle?.fontStyle || "",
      loreTagName: lore?.tagName || "",
      hasItalicLoreNode: !!lore
    };
  }, cardId);
}

async function openModalAudit(page, cardId) {
  await searchCard(page, cardId);
  await clickCollectionCard(page, cardId);
  const snapshot = await collectionModalSnapshot(page);
  const details = await page.evaluate(() => {
    const right = document.querySelector("#modalRight");
    const modalDesc = document.querySelector("#modalDesc");
    const modalLore = modalDesc?.querySelector("i, em, .card-lore-text");
    const modalLoreStyle = modalLore ? getComputedStyle(modalLore) : null;
    const conditionTexts = Array.from(right?.querySelectorAll(".modal-cond-text") || [])
      .map(node => (node.innerText || "").trim());
    const titles = Array.from(right?.querySelectorAll(".modal-cond-title,.modal-kw-name") || [])
      .map(node => (node.innerText || "").trim());
    const icons = Array.from(document.querySelectorAll("#modalCard img, #modalRight img"))
      .map(img => img.currentSrc || img.src || "");
    return {
      conditionTexts,
      titles,
      icons,
      modalLoreTagName: modalLore?.tagName || "",
      modalLoreFontStyle: modalLoreStyle?.fontStyle || ""
    };
  });
  await closeCollectionModal(page);
  return { ...snapshot, ...details };
}

test.describe("COLLECTION-CHARTER-02B P2 arbitrés", () => {
  test("les lignes P2 de ponctuation arbitrées ont un rendu public avec espace insécable française", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    const audit = [];

    for (const id of ARBITRATED_PUNCTUATION_IDS) {
      const card = await readCollectionCard(page, id);
      const violations = frenchPunctuationViolations(card.visibleHtml);
      audit.push({ id, text: card.visibleText, html: card.visibleHtml, violations });
      expect(violations, `${id} should not expose bare French punctuation`).toEqual([]);
    }

    await testInfo.attach("punctuation-audit", {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify(audit, null, 2), "utf8")
    });
    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });

  test("Surineur conserve uniquement l'arbitrage lore italique", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);

    const card = await readCollectionCard(page, "GOB000002");
    expect(card.data.name).toBe("Surineur");
    expect(card.visibleText).toContain("Petits, véloces et bigrement agiles");
    expect([card.loreFontStyle, card.descFontStyle]).toContain("italic");
    expect(card.visibleHtml).not.toContain("data-keyword");

    const modal = await openModalAudit(page, "GOB000002");
    expect(modal.loreText).toContain("Petits, véloces et bigrement agiles");
    expect(modal.modalLoreTagName).toBe("I");
    expect(modal.modalLoreFontStyle).toBe("italic");
    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });

  test("les Approvisionnements P2 affichent les textes et ressources arbitrés", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);

    const berries = await openModalAudit(page, "R000003");
    expect(berries.titles).toContain("APPROVISIONNEMENT");
    expect(berries.rightText).toContain("Fournit 1 unité de Nourriture au joueur.");
    expect(normalizeSpaces(berries.rightText)).toContain("Tant que 3 « Buissons à baies » ou plus");
    expect(berries.rightText).toContain("fixe la production de Nourriture de la pile à 5");

    const forestry = await readCollectionCard(page, "R000017");
    expect(forestry.data.keywords).toEqual(["Bois"]);
    expect(forestry.data.prodIcons.join("\n")).toContain("IC00000BOI.png");
    expect(forestry.data.prodIcons.join("\n")).not.toContain("IC00000NRT.png");
    const forestryModal = await openModalAudit(page, "R000017");
    expect(forestryModal.titles).toContain("APPROVISIONNEMENT");
    expect(forestryModal.rightText).toContain("Fournit 1 ressource de Bois au joueur.");
    expect(forestryModal.rightText).not.toContain("Fournit 1 ressource de Nourriture au joueur.");

    const crypt = await openModalAudit(page, "R000021");
    expect(crypt.titles).toContain("APPROVISIONNEMENT");
    expect(crypt.rightText).toContain("Fournit 3 Échos au joueur.");
    expect(crypt.rightText).toContain("Le visuel de la carte évolue en fonction du total d'Échos disponibles.");
    expect(crypt.rightText).not.toContain("RAME0");
    expect(crypt.rightText).not.toContain("RAME21");
    expect(crypt.rightText).not.toContain("Fournit 3 Âmes au joueur");

    const hunt = await openModalAudit(page, "R000022");
    expect(hunt.titles.map(title => title.toUpperCase())).toContain("APPROVISIONNEMENT");
    expect(hunt.rightText).toContain("Fournit 2 de Nourriture au joueur.");

    const selene = await openModalAudit(page, "R000023");
    expect(selene.titles.map(title => title.toUpperCase())).toContain("APPROVISIONNEMENT");
    expect(selene.rightText).toContain("Fournit 3 de Sélène au joueur.");

    const stones = await openModalAudit(page, "R000026");
    expect(stones.titles).toContain("APPROVISIONNEMENT");
    expect(stones.rightText).toContain("Fournit 3 ressources de Pierre et 2 de Fer.");
    expect(stones.rightText).not.toContain("ressources de pierre");

    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });

  test("Bazar ambulant retrouve son lore sans perdre sa capacité technique", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);

    const card = await readCollectionCard(page, "R000025");
    expect(card.data.name).toBe("Bazar ambulant");
    expect(card.visibleText).toContain("On trouve de tout sur les routes");
    expect(card.visibleText).toContain("C'est fou tout ce que les gens jettent");
    expect(card.visibleText).not.toContain("Au début de chacun de vos tours");
    expect([card.loreFontStyle, card.descFontStyle]).toContain("italic");
    expect(card.data.cond).toContain("Quand cette carte est jouée");
    expect(card.data.cond).toContain("Vous gagnez temporairement");

    const modal = await openModalAudit(page, "R000025");
    expect(modal.loreText).toContain("On trouve de tout sur les routes");
    expect(modal.loreStyle.fontStyle).toBe("italic");
    expect(modal.rightText).toContain("Quand cette carte est jouée");
    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });
});
