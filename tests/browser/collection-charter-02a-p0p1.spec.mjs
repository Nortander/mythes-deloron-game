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

async function searchCard(page, cardId) {
  await page.locator("#searchInput").fill(cardId);
  await expect(collectionCard(page, cardId), cardId).toBeVisible();
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource/i.test(message));
}

test.describe("COLLECTION-CHARTER-02A P0/P1", () => {
  test("S000046 affiche une seule plage 1 à 4 PDV avec la palette Sort", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    await searchCard(page, "S000046");

    const audit = await page.evaluate(() => {
      const card = document.querySelector('.ccard[data-card-id="S000046"]');
      const desc = card?.querySelector(".ccard-desc-inner") || card?.querySelector(".ccard-desc-z") || card;
      const kvs = Array.from(desc?.querySelectorAll(".kv") || []).map(node => ({
        text: node.textContent.trim(),
        color: getComputedStyle(node).color
      }));
      return {
        text: desc?.innerText || "",
        html: desc?.innerHTML || "",
        cardClass: card?.className || "",
        frameClass: card?.querySelector(".ccard-frame")?.className || "",
        kvs
      };
    });

    expect(audit.text).toContain("1 à 4 PDV");
    expect(audit.text).not.toContain("1 à 1 à 4 PDV");
    expect(audit.text).not.toContain("4 points de vie");
    expect(audit.frameClass).toContain("sort-card");
    expect(audit.kvs.map(item => item.text)).toEqual(expect.arrayContaining(["1", "4"]));
    const rangeValues = audit.kvs.filter(item => item.text === "1" || item.text === "4");
    expect(rangeValues.every(item => item.color === "rgb(106, 58, 154)")).toBe(true);
    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });

  test("S000061 conserve la ponctuation française, les valeurs et l'infobulle Gel", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    await searchCard(page, "S000061");

    const cardAudit = await page.evaluate(() => {
      const card = document.querySelector('.ccard[data-card-id="S000061"]');
      const desc = card?.querySelector(".ccard-desc-inner") || card?.querySelector(".ccard-desc-z") || card;
      return {
        text: desc?.innerText || "",
        html: desc?.innerHTML || "",
        kvs: Array.from(desc?.querySelectorAll(".kv") || []).map(node => node.textContent.trim()),
        keywords: Array.from(desc?.querySelectorAll("[data-keyword]") || []).map(node => node.getAttribute("data-keyword"))
      };
    });

    expect(cardAudit.text).toContain("allié ; il reçoit");
    expect(cardAudit.text).toContain("temporaire : «");
    expect(cardAudit.text).not.toContain("allié; il reçoit");
    expect(cardAudit.text).not.toContain("temporaire:");
    expect(cardAudit.kvs).toEqual(expect.arrayContaining(["1", "3", "2"]));
    expect(cardAudit.kvs).not.toContain("il");
    expect(cardAudit.keywords).toContain("Gel");

    await clickCollectionCard(page, "S000061");
    const modal = await collectionModalSnapshot(page);
    expect(modal.cardText).toContain("Bouclier de glace");
    expect(modal.cardText).toContain("Gel");
    expect(modal.rightText).toContain("GEL");
    await closeCollectionModal(page);
    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });

  test("R000027 distingue condition d'invocation et capacité spéciale", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    await searchCard(page, "R000027");
    await clickCollectionCard(page, "R000027");

    const audit = await page.evaluate(() => {
      const right = document.querySelector("#modalRight");
      const desc = document.querySelector("#modalDesc");
      const lore = desc?.querySelector(".card-lore-text, em, i") || desc;
      const loreStyle = lore ? getComputedStyle(lore) : null;
      return {
        titles: Array.from(right?.querySelectorAll(".modal-cond-title,.modal-kw-name") || []).map(node => node.textContent.trim()),
        conditionTitle: right?.querySelector(".modal-cond-title")?.textContent.trim() || "",
        conditionText: right?.querySelector(".modal-cond-text")?.innerText.trim() || "",
        rightText: right?.innerText || "",
        descText: desc?.innerText || "",
        loreFontStyle: loreStyle?.fontStyle || ""
      };
    });

    expect(audit.conditionTitle).toBe("CONDITION D’INVOCATION");
    expect(audit.conditionText).toContain("15 serviteurs");
    expect(audit.titles).toContain("CAPACITÉ SPÉCIALE");
    expect(audit.titles).not.toContain("APPROVISIONNEMENT");
    expect(audit.rightText).toContain("Au début de chacun de vos tours");
    expect(audit.rightText).toContain("2 échos");
    expect(audit.rightText).toContain("3 échos supplémentaires");
    expect(audit.descText).toContain("Ce lieu, jadis magnifique et paisible");
    expect(audit.loreFontStyle).toBe("italic");
    await closeCollectionModal(page);
    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });

  test("la référence Larron est H000001 et H000006 reste Prêtre de guerre", async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    const audit = await page.evaluate(() => {
      const read = id => {
        const card = CARDS.find(entry => entry.id === id);
        return card ? { id: card.id, name: card.name, desc: card.desc } : null;
      };
      return { h000001: read("H000001"), h000006: read("H000006") };
    });
    expect(audit.h000001).toMatchObject({ id: "H000001", name: "Larron" });
    expect(audit.h000006).toMatchObject({ id: "H000006", name: "Prêtre de guerre" });
    expect(audit.h000006.desc).not.toContain("Larron");
    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });
});
