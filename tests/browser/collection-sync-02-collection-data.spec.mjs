import { expect, test } from "@playwright/test";
import {
  attachDiagnostics,
  attachPageDiagnostics,
  clickCollectionCard,
  collectionCard,
  collectionModalSnapshot,
  openCollection
} from "./helpers/eloron-ui.mjs";

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource/i.test(message));
}

async function searchCard(page, cardId) {
  await page.locator("#searchInput").fill(cardId);
  await expect(collectionCard(page, cardId), `Collection card ${cardId}`).toBeVisible();
}

test("Collection Sync02 applies targeted canonical corrections", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openCollection(page);

  const audit = await page.evaluate(() => {
    const byId = id => CARDS.find(card => card.id === id);
    const pick = id => {
      const card = byId(id);
      return card ? {
        id: card.id,
        name: card.name,
        type: card.type,
        faction: card.faction,
        atk: card.atk,
        pdv: card.pdv,
        cost: card.cost,
        kw: card.kw,
        desc: card.desc,
        img: card.img,
        maxOwned: card.maxOwned,
        qty: card.qty,
        owned: card.owned,
        catalogKind: card.catalogKind,
        obtainability: card.obtainability
      } : null;
    };
    return {
      totalCards: CARDS.length,
      uniqueCards: new Set(CARDS.map(card => card.id)).size,
      ump: pick("TRL000020"),
      s000061: pick("S000061"),
      s000062: pick("S000062"),
      s000063: pick("S000063"),
      s000046: pick("S000046"),
      gob000003: pick("GOB000003"),
      en000005: pick("EN000005"),
      n000005: pick("N000005"),
      av000006: pick("AV000006"),
      avs000006: pick("AVS000006"),
      avp000006: pick("AVP000006"),
      larron: pick("GOB000018"),
      fantassin: pick("H000018"),
      costs: {
        s000061: collectionCostDefinition("S000061"),
        s000062: collectionCostDefinition("S000062"),
        s000063: collectionCostDefinition("S000063")
      },
      sourceHasNewSpells: ["S000061", "S000062", "S000063"].every(id => SOURCE_MECHANICAL_IDS_20260622.has(id)),
      themes: Object.fromEntries(["S000046", "S000049", "S000061", "S000062", "S000063", "GOB000003"].map(id => {
        const card = byId(id);
        return [id, card ? {
          fc: getFc(card),
          color: collectionFactionColor(card),
          icon: factionIconUrl(card),
          modelClass: getCanonicalCardDisplayModel(id).theme.factionClass
        } : null];
      })),
      keywordDefs: {
        pestilence: KEYWORD_DEFS.Pestilence || null,
        colereDivine: KEYWORD_DEFS["Colère divine"] || null
      },
      technicalLeak: ["S000061", "S000062", "S000063", "TRL000020", "N000005", "AV000006"]
        .map(id => byId(id)?.desc || "")
        .join(" ")
        .match(/AVP000006|effectInstanceId|linkedOccurrenceId|\[object Object\]|undefined/)
    };
  });

  expect(audit.totalCards).toBe(audit.uniqueCards);
  expect(audit.ump).toMatchObject({
    id: "TRL000020",
    name: "Ump",
    type: "Serviteur",
    faction: "Troll",
    atk: 9,
    pdv: 9
  });
  expect(audit.ump.kw).toEqual(expect.arrayContaining(["Serviteur de la rune", "Sang-froid", "Rempart", "Sang ardent"]));

  expect(audit.s000061).toMatchObject({ id: "S000061", name: "Bouclier de glace", type: "Sort", faction: "/", cost: 1, maxOwned: 3, obtainability: "OBTAINABLE" });
  expect(audit.s000061.kw).toEqual(expect.arrayContaining(["Gel", "Lenya", "Aria"]));
  expect(audit.s000061.desc).toContain("<3> prochaines attaques");

  expect(audit.s000062).toMatchObject({ id: "S000062", name: "Déferlante de flammes", type: "Sort", faction: "/", cost: 3, maxOwned: 3, obtainability: "OBTAINABLE" });
  expect(audit.s000062.kw).toEqual(expect.arrayContaining(["Lenya", "Aria", "Sélène", "Écho", "Embrasement"]));
  expect(audit.s000062.desc).toContain("infligez-lui ainsi qu'aux serviteurs directement adjacents");
  expect(audit.s000062.desc).toContain("Embrasement");

  expect(audit.s000063).toMatchObject({ id: "S000063", name: "Choc mental", type: "Sort", faction: "/", cost: 2, maxOwned: 3, obtainability: "OBTAINABLE" });
  expect(audit.s000063.kw).toEqual(expect.arrayContaining(["Lenya", "Aria", "Sélène", "Insensible"]));
  expect(audit.s000063.desc).toContain("2 à 6 points de dégâts");
  expect(audit.s000063.desc).toContain("Passe outre");

  expect(audit.s000046).toMatchObject({ id: "S000046", name: "Ça passe ou ça casse", type: "Sort", faction: "Troll", cost: 4, maxOwned: 2 });
  expect(audit.s000046.desc).toContain("1 à 4 PDV");
  expect(audit.s000046.desc).not.toContain("4 points de vie");

  expect(audit.gob000003).toMatchObject({ id: "GOB000003", name: "Gobelin d'exception", type: "Serviteur", faction: "Gobelin" });
  expect(audit.gob000003.desc).toContain("[Colère divine]");
  expect(audit.gob000003.desc).not.toContain("pendant 2 tours");

  expect(audit.en000005).toMatchObject({ id: "EN000005", name: "Héraut ténébreux", type: "Serviteur", faction: "Elfe noir" });
  expect(audit.en000005.kw).toContain("Pestilence");
  expect(audit.en000005.desc).toContain("[Pestilence]");
  expect(audit.keywordDefs.pestilence).toContain("Marque un serviteur malade");
  expect(audit.keywordDefs.colereDivine).toBe("Un serviteur mort-vivant affecté par Colère divine subit des dégâts croissants pendant trois tours : d'abord 2, puis 3, puis 4 points de dégâts. Les dégâts sont subis au début du tour du propriétaire du mort-vivant affecté. Ne peut pas affecter les avatars.");

  for (const id of ["S000046", "S000049", "S000061", "S000062", "S000063"]) {
    expect(audit.themes[id]).toMatchObject({ fc: "sort", color: "#6a3a9a", modelClass: "sort-card" });
  }
  expect(audit.themes.S000046.icon).toContain("FCT00000TRO.png");
  expect(audit.themes.S000049.icon).toContain("FCT00000GOB.png");
  expect(audit.themes.GOB000003).toMatchObject({ fc: "gob", color: "#ffd23f", modelClass: "gob-card" });

  expect(audit.costs.s000061).toMatchObject({ total: 1 });
  expect(audit.costs.s000062).toMatchObject({ total: 3 });
  expect(audit.costs.s000063).toMatchObject({ total: 2 });
  expect(audit.sourceHasNewSpells).toBe(true);

  expect(audit.n000005).toMatchObject({
    id: "N000005",
    name: "Haut-seigneur Alfric Cassebibine",
    type: "Serviteur",
    faction: "Nain",
    atk: 7,
    pdv: 7
  });
  expect(audit.n000005.desc).toContain("Tant qu'il est sur le terrain");
  expect(audit.n000005.kw).toEqual(expect.arrayContaining(["Fer", "Sélène", "Rempart", "Sang ardent", "Sang-froid", "Rage"]));

  expect(audit.av000006).toMatchObject({ id: "AV000006", name: "Gor le Changeforme", type: "Avatar", faction: "Orc" });
  expect(audit.av000006.desc).toContain("vos serviteurs orcs et bêtes coûtent 1 unité de ressource en moins");
  expect(audit.avs000006).toMatchObject({ id: "AVS000006", name: "Mage du Cercle – Gor le Changeforme", type: "Serviteur", faction: "Orc" });
  expect(audit.avs000006.desc).toContain("Insensible");
  expect(audit.avs000006.desc).toContain("Gor (forme d'ours)");
  expect(audit.avp000006).toBe(null);

  expect(audit.larron).toMatchObject({ id: "GOB000018", name: "Petit futé", type: "Serviteur", faction: "Gobelin" });
  expect(audit.fantassin).toMatchObject({ id: "H000018", name: "Recrue", type: "Serviteur", faction: "Humain" });
  expect(audit.technicalLeak).toBe(null);

  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

for (const cardId of ["S000046", "S000061", "S000062", "S000063", "TRL000020", "N000005", "GOB000003", "EN000005", "AV000006", "AVS000006"]) {
  test(`Collection renders Sync02 card ${cardId}`, async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openCollection(page);
    await searchCard(page, cardId);
    await expect.poll(() => collectionCard(page, cardId).locator("img.ccard-art").evaluate(img => img.naturalWidth), {
      message: `${cardId} Collection image loaded`,
      timeout: 8000
    }).toBeGreaterThan(0);
    await clickCollectionCard(page, cardId);
    const modal = await collectionModalSnapshot(page);
    expect(modal.open).toBe(true);
    expect(modal.cardText).not.toMatch(/AVP000006|effectInstanceId|linkedOccurrenceId|\[object Object\]|undefined/);
    if (cardId === "S000046") {
      expect(modal.cardText).toContain("1 à 4 PDV");
      expect(modal.cardText).not.toContain("4 points de vie");
    }
    if (cardId === "TRL000020") expect(modal.cardText).toMatch(/9\s*\/\s*9|9.*9/s);
    if (cardId === "S000061") expect(modal.cardText).toContain("<3> prochaines attaques");
    if (cardId === "S000062") expect(modal.cardText).toContain("Embrasement");
    if (cardId === "S000063") expect(modal.cardText).toContain("2 à 6 points de dégâts");
    if (cardId === "AV000006") {
      expect(modal.cardText).toContain("Gor le Changeforme");
      expect(modal.cardText).toContain("vos serviteurs orcs et bêtes coûtent 1 unité de ressource en moins");
      expect(modal.cardText).not.toContain("Mage du Cercle");
    }
    if (cardId === "GOB000003") {
      expect(modal.cardText).toContain("Colère divine");
      expect(modal.rightText).toContain("d'abord 2, puis 3, puis 4 points de dégâts");
      expect(modal.rightText).not.toContain("Capacité nommée à vérifier");
    }
    if (cardId === "EN000005") {
      expect(modal.cardText).toContain("Pestilence");
      expect(modal.rightText).toContain("Marque un serviteur malade");
    }
    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });
}

test("Goblin Collection highlights use the validated visual palette", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openCollection(page);
  await searchCard(page, "GOB000018");
  await clickCollectionCard(page, "GOB000018");
  const colors = await page.evaluate(() => {
    const modalHighlight = document.querySelector("#modalDesc strong.kv, #modalDesc em");
    const keywordName = document.querySelector("#modalRight .modal-kw-name");
    const cardHighlight = document.querySelector('.ccard[data-card-id="GOB000018"] .ccard-desc-inner strong.kv, .ccard[data-card-id="GOB000018"] .ccard-desc-inner em');
    const toHex = value => {
      const match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!match) return String(value || "");
      return "#" + match.slice(1, 4).map(component => Number(component).toString(16).padStart(2, "0")).join("");
    };
    return {
      modalHighlight: toHex(modalHighlight && getComputedStyle(modalHighlight).color),
      keywordName: toHex(keywordName && getComputedStyle(keywordName).color),
      cardHighlight: toHex(cardHighlight && getComputedStyle(cardHighlight).color)
    };
  });
  expect([colors.modalHighlight, colors.cardHighlight]).toContain("#ffd23f");
  expect(colors.keywordName).toBe("#e6b93f");
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Collection Sync02B keeps Sort palette, numeric highlights and French punctuation", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openCollection(page);
  for (const cardId of ["S000046", "S000049", "S000061", "S000062", "S000063"]) {
    await searchCard(page, cardId);
    const themeClass = await page.evaluate(id => getCanonicalCardDisplayModel(id).theme.factionClass, cardId);
    expect(themeClass).toBe("sort-card");
    await clickCollectionCard(page, cardId);
    const audit = await page.evaluate(() => {
      const modalCard = document.querySelector("#modalCard");
      const modalDesc = document.querySelector("#modalDesc");
      const modalRight = document.querySelector("#modalRight");
      const iconSrc = document.querySelector("#modalFico")?.getAttribute("src") || "";
      return {
        modalClass: modalCard?.className || "",
        descHtml: modalDesc?.innerHTML || "",
        rightHtml: modalRight?.innerHTML || "",
        kvCount: modalDesc?.querySelectorAll("strong.kv").length || 0,
        conditionKvCount: modalRight?.querySelectorAll(".modal-cond-text strong.kv").length || 0,
        iconSrc
      };
    });
    expect(audit.modalClass).toContain("m-sort");
    expect(audit.kvCount, `${cardId} numeric highlight count`).toBeGreaterThan(0);
    if (cardId === "S000046") {
      expect(audit.conditionKvCount).toBeGreaterThanOrEqual(2);
      expect(audit.iconSrc).toContain("FCT00000TRO.png");
      expect(audit.descHtml).toContain("<strong class=\"kv\">1</strong> à <strong class=\"kv\">4</strong> PDV");
    }
    if (cardId === "S000049") expect(audit.iconSrc).toContain("FCT00000GOB.png");
    await page.keyboard.press("Escape");
  }

  await searchCard(page, "EN000005");
  await clickCollectionCard(page, "EN000005");
  const punctuation = await page.evaluate(() => ({
    descHtml: document.querySelector("#modalDesc")?.innerHTML || "",
    rightHtml: document.querySelector("#modalRight")?.innerHTML || "",
    keywordColonSample: formatPlayerFacingCardText("[Vengeance]: texte")
  }));
  expect(punctuation.descHtml).not.toContain("</strong>:");
  expect(punctuation.keywordColonSample).toContain("</strong>\u00a0:");
  expect(punctuation.keywordColonSample).not.toContain("</strong>:");
  expect(punctuation.rightHtml).toContain("Pestilence");

  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
