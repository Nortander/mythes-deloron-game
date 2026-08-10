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

const CASES = [
  { id: "H000032", name: "Gabar, l'apprenti magicien maladroit", expectedColor: "rgb(38, 196, 236)", keyword: "Initiative", value: "1" },
  { id: "EDB000008", name: "Maître-archer", expectedColor: "rgb(42, 90, 16)", keyword: "Initiative", value: "5" },
  { id: "EDG000003", name: "Garde hivernale", expectedColor: "rgb(42, 143, 212)", keyword: "Rempart", value: "1" },
  { id: "N000005", name: "Haut-seigneur Alfric Cassebibine", expectedColor: "rgb(128, 144, 168)", keyword: "Rempart", value: "+1" }
];
const SORT_VALUE_COLOR = "rgb(106, 58, 154)";
const MODAL_SORT_VALUE_COLOR = "rgb(90, 26, 138)";

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource/i.test(message));
}

async function searchCard(page, cardId) {
  await page.locator("#searchInput").fill(cardId);
  await expect(collectionCard(page, cardId), cardId).toBeVisible();
}

async function readDescriptionHighlights(page, cardId) {
  await searchCard(page, cardId);
  const normal = await page.evaluate((id) => {
    const card = document.querySelector(`.ccard[data-card-id="${id}"]`);
    const desc = card?.querySelector(".ccard-desc-inner") || card;
    const keyword = desc?.querySelector(".card-keyword, .card-named-ability, em");
    const values = Array.from(desc?.querySelectorAll("strong.kv") || []).map(node => ({
      text: node.textContent?.trim() || "",
      color: getComputedStyle(node).color
    }));
    return {
      text: desc?.innerText || "",
      keywordText: keyword?.textContent?.trim() || "",
      keywordColor: keyword ? getComputedStyle(keyword).color : "",
      values
    };
  }, cardId);

  await clickCollectionCard(page, cardId);
  const modal = await page.evaluate(() => {
    const desc = document.querySelector("#modalDesc");
    const keyword = desc?.querySelector(".card-keyword, .card-named-ability, em:not(.card-lore-text)");
    const values = Array.from(desc?.querySelectorAll("strong.kv") || []).map(node => ({
      text: node.textContent?.trim() || "",
      color: getComputedStyle(node).color
    }));
    return {
      text: desc?.innerText || "",
      keywordText: keyword?.textContent?.trim() || "",
      keywordColor: keyword ? getComputedStyle(keyword).color : "",
      values
    };
  });
  await closeCollectionModal(page);
  return { normal, modal };
}

test.describe("COLLECTION-CHARTER-03 highlights de description", () => {
  test("les highlights de description utilisent les couleurs validées par faction", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    const audits = [];

    for (const item of CASES) {
      const audit = await readDescriptionHighlights(page, item.id);
      audits.push({ id: item.id, name: item.name, audit });

      expect(audit.normal.text, item.id).toContain(item.keyword);
      expect(audit.normal.keywordText, item.id).toContain(item.keyword);
      expect(audit.normal.keywordColor, `${item.id} normal keyword`).toBe(item.expectedColor);
      expect(audit.normal.values, `${item.id} normal values`).toEqual(expect.arrayContaining([{ text: item.value, color: item.expectedColor }]));

      expect(audit.modal.text, item.id).toContain(item.keyword);
      expect(audit.modal.keywordText, item.id).toContain(item.keyword);
      expect(audit.modal.keywordColor, `${item.id} modal keyword`).toBe(item.expectedColor);
      expect(audit.modal.values, `${item.id} modal values`).toEqual(expect.arrayContaining([{ text: item.value, color: item.expectedColor }]));
    }

    await testInfo.attach("description-highlight-colors", {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify(audits, null, 2), "utf8")
    });
    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });

  test("S000046 conserve 1 à 4 PDV et l'espace insécable avant deux-points", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    await searchCard(page, "S000046");

    const normal = await page.evaluate(() => {
      const desc = document.querySelector('.ccard[data-card-id="S000046"] .ccard-desc-inner');
      return { text: desc?.innerText || "", html: desc?.innerHTML || "" };
    });
    expect(normal.text).toContain("Choisissez 1 serviteur troll allié");
    expect(normal.text).toContain("1 à 4 PDV");
    expect(normal.text).not.toContain("1 à 1 à 4 PDV");
    expect(normal.html.replace(/&nbsp;/g, "\u00a0")).toContain("allié\u00a0:");

    await clickCollectionCard(page, "S000046");
    const modal = await collectionModalSnapshot(page);
    expect(modal.cardText).toContain("Choisissez 1 serviteur troll allié");
    expect(modal.cardText).toContain("1 à 4 PDV");
    expect(modal.cardText).not.toContain("1 à 1 à 4 PDV");
    await closeCollectionModal(page);
    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });

  test("S000061 masque les chevrons internes et conserve Gel", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    await searchCard(page, "S000061");

    const normal = await page.evaluate(() => {
      const desc = document.querySelector('.ccard[data-card-id="S000061"] .ccard-desc-inner');
      return { text: desc?.innerText || "", html: desc?.innerHTML || "" };
    });
    expect(normal.text).toContain("des 3 prochaines attaques");
    expect(normal.text).not.toContain("<3>");
    expect(normal.html).not.toContain("&lt;3&gt;");
    expect(normal.text).toContain("Gel");
    expect(await page.locator('.ccard[data-card-id="S000061"] .ccard-desc-inner strong.kv', { hasText: "3" }).evaluate(node => getComputedStyle(node).color)).toBe(SORT_VALUE_COLOR);

    await clickCollectionCard(page, "S000061");
    const modal = await collectionModalSnapshot(page);
    expect(modal.cardText).toContain("des 3 prochaines attaques");
    expect(modal.cardText).not.toContain("<3>");
    expect(modal.rightText).toContain("Gel");
    expect(await page.locator("#modalDesc strong.kv", { hasText: "3" }).evaluate(node => getComputedStyle(node).color)).toBe(MODAL_SORT_VALUE_COLOR);
    await closeCollectionModal(page);
    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });

  test("R000022 et R000023 gardent seulement leur infobulle Approvisionnement spécifique", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);

    for (const item of [
      { id: "R000022", expected: "Fournit 2 de Nourriture au joueur." },
      { id: "R000023", expected: "Fournit 3 de Sélène au joueur." }
    ]) {
      await searchCard(page, item.id);
      await clickCollectionCard(page, item.id);
      const audit = await page.evaluate(() => {
        const right = document.querySelector("#modalRight");
        return {
          titles: Array.from(right?.querySelectorAll(".modal-cond-title,.modal-kw-name") || []).map(node => node.textContent.trim()),
          texts: Array.from(right?.querySelectorAll(".modal-cond-text,.modal-kw-def") || []).map(node => node.innerText.trim()),
          rightText: right?.innerText || ""
        };
      });
      expect(audit.titles.map(title => title.toUpperCase()).filter(title => title === "APPROVISIONNEMENT")).toHaveLength(1);
      expect(audit.rightText).toContain(item.expected);
      expect(audit.rightText).not.toContain("L'un des trois types de cartes");
      expect(audit.rightText).not.toContain("Chaque joueur peut en avoir jusqu'à 6 sur son plateau");
      await closeCollectionModal(page);
    }

    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });
});
