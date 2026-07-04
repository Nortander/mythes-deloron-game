import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { attachDiagnostics, attachPageDiagnostics } from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-01-zone-spells.json", import.meta.url), "utf8"));

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

function counts(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

async function openScenario(page, scenario) {
  const params = new URLSearchParams({scenario, batch01: `${Date.now()}-${Math.random()}`});
  await page.goto(`/code/partie-test-1.html?${params.toString()}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForTimeout(800);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const zone = (playerKey) => {
      const player = playerState(playerKey);
      return {
        hand: [...player.hand].map(getRuntimeCardId),
        deck: [...player.drawPile].map(getRuntimeCardId),
        graveyard: [...(player.graveyard || [])].map(getRuntimeCardId),
        resources: {
          classical: {...player.resourceState.classical},
          souls: player.resourceState.souls
        }
      };
    };
    return {
      scenarioId: selectedScenarioId(),
      currentPlayer,
      player1: zone("player1"),
      player2: zone("player2"),
      activeLocks: typeof activeDoorLocks === "function" ? activeDoorLocks().map(lock => ({...lock})) : [],
      freeSlotsPlayer2: typeof getFreeServantSlotCandidates === "function" ? getFreeServantSlotCandidates("player2").map(slot => slot.slotIndex) : [],
      doorMarkers: Array.from(document.querySelectorAll('[data-testid="door-lock-marker"]')).map(marker => ({
        player: marker.dataset.player,
        lockId: marker.dataset.slotLockId,
        hasStats: !!marker.querySelector(".fc-stats"),
        hasCost: !!marker.querySelector(".cost,.hc-cost,.fc-cost,.fc-zoom-cost-z"),
        imageSrc: marker.querySelector("img")?.getAttribute("src") || "",
        text: marker.innerText || "",
        ariaLabel: marker.getAttribute("aria-label") || "",
        opening: marker.dataset.opening || ""
      })),
      publicScenarioValues: Array.from(document.querySelectorAll("#scenarioSelect option")).map(option => option.value),
      panel: typeof getHuvuTestResourcePanelSnapshot === "function" ? getHuvuTestResourcePanelSnapshot() : null,
      errorText: document.querySelector("#errMsg")?.innerText || "",
      notificationText: document.querySelector("#notif")?.innerText || ""
    };
  });
}

async function playSpell(page, cardId, zoneSelection = null) {
  const result = await page.evaluate(async ({id, selection}) => playCard(id, null, selection ? {zoneSelection: selection} : {}), {id: cardId, selection: zoneSelection});
  await page.waitForTimeout(300);
  return result;
}

async function visibleHandCards(page, playerSelector = ".hand-j1") {
  return page.evaluate((selector) => Array.from(document.querySelectorAll(`${selector} .hc`)).map(card => {
    const rect = card.getBoundingClientRect();
    const img = card.querySelector("img");
    const name = card.querySelector(".hc-name")?.innerText || "";
    return {
      id: card.dataset.id || "",
      name,
      visible: !!(card.offsetWidth || card.offsetHeight || card.getClientRects().length),
      hiddenByCss: getComputedStyle(card).display === "none" || getComputedStyle(card).visibility === "hidden" || Number(getComputedStyle(card).opacity) === 0,
      rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
      imageOk: !!img && img.naturalWidth > 0
    };
  }), playerSelector);
}

async function playVisibleSpell(page, cardId) {
  await expect(page.locator(`.hand-j1 .hc[data-id="${cardId}"]`)).toBeVisible();
  return playSpell(page, cardId);
}

async function playDoorOnVisibleSlot(page, targetSelector) {
  await expect(page.locator(`.hand-j1 .hc[data-id="S000007"]`)).toBeVisible();
  await expect(page.locator(targetSelector)).toBeVisible();
  const result = await page.evaluate((selector) => {
    const target = document.querySelector(selector);
    const doorDrop = doorZoneSelectionFromDropTarget(target);
    if (!doorDrop) return {success:false, code:"missing-door-drop-selection"};
    return playCard("S000007", doorDrop.slot, {zoneSelection:doorDrop.zoneSelection});
  }, targetSelector);
  await page.waitForTimeout(300);
  return result;
}

async function doorMarkerVisualAudit(page) {
  return page.evaluate(() => {
    const marker = document.querySelector('[data-testid="door-lock-marker"]');
    const zone = marker?.parentElement;
    const markerRect = marker?.getBoundingClientRect();
    const zoneRect = zone?.getBoundingClientRect();
    const img = marker?.querySelector("img");
    const style = marker ? getComputedStyle(marker) : null;
    const afterStyle = marker ? getComputedStyle(marker, "::after") : null;
    return {
      marker: markerRect ? {
        width: markerRect.width,
        height: markerRect.height,
        ratio: markerRect.width / markerRect.height,
        x: markerRect.x,
        y: markerRect.y
      } : null,
      zone: zoneRect ? {
        width: zoneRect.width,
        height: zoneRect.height,
        x: zoneRect.x,
        y: zoneRect.y
      } : null,
      borderRadius: style?.borderRadius || "",
      afterContent: afterStyle?.content || "",
      text: marker?.innerText || "",
      ariaLabel: marker?.getAttribute("aria-label") || "",
      hasStats: !!marker?.querySelector(".fc-stats,.fc-atk,.fc-pdv,.hc-atk,.hc-pdv"),
      hasCost: !!marker?.querySelector(".cost,.hc-cost,.fc-cost,.fc-zoom-cost-z"),
      imageSrc: img?.getAttribute("src") || "",
      imageOk: !!img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0
    };
  });
}

async function doorPreviewAudit(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-door-lock-preview="1"]');
    const keyImg = root?.querySelector('[data-related-card="S000008"] img');
    return {
      visible: !!root,
      text: root?.innerText || "",
      hasAtk: !!root?.querySelector(".fc-zoom-atk,.hc-atk"),
      hasPdv: !!root?.querySelector(".fc-zoom-pdv,.hc-pdv"),
      hasCost: !!root?.querySelector(".fc-zoom-cost-z,.hc-cost-z"),
      keyImageOk: !!keyImg && keyImg.complete && keyImg.naturalWidth > 0 && keyImg.naturalHeight > 0,
      technicalIdsVisible: /\bS000007\b|\bS000008\b|effectInstanceId|linkedKeyOccurrenceId/.test(root?.innerText || "")
    };
  });
}

test("COLLECTION-BATCH-01 scope is explicit and scenarios stay hidden", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-01-zone-spells");
  const state = await snapshot(page);
  await attachDiagnostics(testInfo, diagnostics);

  expect(fixture.implementedCards).toEqual(["S000007", "S000008", "S000015", "S000029", "S000037", "S000040", "S000043"]);
  expect(fixture.lockedCards).toEqual(["S000004", "S000006", "S000017", "S000022", "S000051"]);
  expect(fixture.deferredCards.map(card => card.id)).toEqual(["S000016"]);
  await expect(page.getByTestId("test-resource-panel")).toContainText("MODE TEST");
  await expect(page.getByTestId("test-resource-panel")).toContainText("COLLECTION BATCH 01");
  expect(state.publicScenarioValues.filter(value => value.startsWith("collection-batch-01"))).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000015 returns selected servants from graveyard to deck and shuffles", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-01-zone-spells");
  const before = await snapshot(page);
  const result = await playSpell(page, "S000015", {selectedCardIds: ["MV000001", "EDB000012"]});
  const after = await snapshot(page);
  await testInfo.attach("s000015-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result.success).toBe(true);
  expect(result.spellMovedToGraveyard).toBe(true);
  expect(result.spellResolution).toMatchObject({code: "apres-la-catastrophe-resolved", shuffled: true});
  expect(result.spellResolution.moved.map(entry => entry.cardId).sort()).toEqual(["EDB000012", "MV000001"]);
  expect(after.player1.hand).not.toContain("S000015");
  expect(after.player1.graveyard).toEqual(["EDB000012", "R000001", "S000015"]);
  expect(counts(after.player1.deck)).toMatchObject({...counts(before.player1.deck), MV000001: 1, EDB000012: 1});
  expect(result.paymentResult).toMatchObject({success: true});
  expect(after.panel.zone).toMatchObject({code: "apres-la-catastrophe-resolved"});
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000015 refuses before payment when no servant is in the graveyard", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-01-zone-spells");
  await page.evaluate(() => {
    playerState("player1").graveyard = ["R000001"];
    refreshCemeteryVisual(playerState("player1"));
  });
  const before = await snapshot(page);
  const result = await playSpell(page, "S000015", {selectedCardIds: ["MV000001"]});
  const after = await snapshot(page);
  await testInfo.attach("s000015-refusal-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result).toBeUndefined();
  expect(after.player1.hand).toEqual(before.player1.hand);
  expect(after.player1.deck).toEqual(before.player1.deck);
  expect(after.player1.graveyard).toEqual(before.player1.graveyard);
  expect(after.player1.resources).toEqual(before.player1.resources);
  expect(after.errorText).toContain("Aucune cible valide");
  expect(after.panel.play.code).toBe("own-graveyard-has-servant");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000029, S000037 and S000043 draw only their legal deck families", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-01-zone-spells");
  const patrouille = await playSpell(page, "S000029");
  const afterPatrouille = await snapshot(page);
  expect(patrouille.success).toBe(true);
  expect(patrouille.spellResolution).toMatchObject({code: "controlled-draw-resolved", count: 3});
  expect(patrouille.spellResolution.drawn.sort()).toEqual(["EDG000001", "EDG000002", "EDG000003"]);
  expect(afterPatrouille.player1.hand).toEqual(expect.arrayContaining(["EDG000001", "EDG000002", "EDG000003"]));
  expect(afterPatrouille.player1.graveyard).toContain("S000029");

  await openScenario(page, "collection-batch-01-zone-spells");
  const ley = await playSpell(page, "S000037");
  const afterLey = await snapshot(page);
  expect(ley.success).toBe(true);
  expect(ley.spellResolution.panelNote).toMatchObject({targetHandSize: 8, spellCountsTowardTarget: false});
  expect(ley.spellResolution.handSizeBeforeDraw).toBe(4);
  expect(ley.spellResolution.candidatesBefore.sort()).toEqual(["GOB000001", "GOB000002", "GOB000003", "GOB000004"]);
  expect(ley.spellResolution.drawn.sort()).toEqual(["GOB000001", "GOB000002", "GOB000003", "GOB000004"]);
  expect(afterLey.player1.hand).toEqual(expect.arrayContaining(["GOB000001", "GOB000002", "GOB000003", "GOB000004"]));
  expect(afterLey.player1.hand).toHaveLength(8);
  expect(afterLey.notificationText).toContain("4 carte(s) piochée(s)");
  expect(afterLey.player1.graveyard).toContain("S000037");

  await openScenario(page, "collection-batch-01-zone-spells");
  const beforeTaureau = await snapshot(page);
  const taureau = await playSpell(page, "S000043");
  const afterTaureau = await snapshot(page);
  await testInfo.attach("draw-family-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({patrouille, afterPatrouille, ley, afterLey, beforeTaureau, taureau, afterTaureau}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);
  expect(taureau.success).toBe(true);
  expect(taureau.spellResolution.candidatesBefore.sort()).toEqual(["B000015", "B000016", "B000017"]);
  expect(taureau.spellResolution.drawn.sort()).toEqual(["B000015", "B000016", "B000017"]);
  expect(afterTaureau.player1.hand).toEqual(expect.arrayContaining(["B000015", "B000016", "B000017"]));
  expect(afterTaureau.player1.hand.length).toBe(beforeTaureau.player1.hand.length - 1 + 3);
  expect(beforeTaureau.player1.deck.filter(id => id.startsWith("B00001")).sort()).toEqual(["B000015", "B000016", "B000017"]);
  expect(afterTaureau.player1.deck).not.toEqual(expect.arrayContaining(["B000015", "B000016", "B000017"]));
  expect(afterTaureau.notificationText).toContain("3 carte(s) piochée(s)");
  expect(afterTaureau.player1.graveyard).toContain("S000043");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000043 announces only the real drawn count when no Minotaur is available", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-01-zone-spells");
  await page.evaluate(() => {
    const p = playerState("player1");
    p.hand = ["S000043"];
    p.drawPile = ["R000010", "EDG000001"];
    p.graveyard = [];
    p.resourceState.classical.nourriture = 10;
    refreshHand(p);
    updateDeckCount(p);
    refreshCemeteryVisual(p);
  });
  const before = await snapshot(page);
  const result = await playSpell(page, "S000043");
  const after = await snapshot(page);
  await testInfo.attach("s000043-empty-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result.success).toBe(true);
  expect(result.spellResolution.drawn).toEqual([]);
  expect(result.spellResolution.count).toBe(0);
  expect(after.player1.hand).toEqual([]);
  expect(after.player1.deck).toEqual(before.player1.deck);
  expect(after.player1.graveyard).toEqual(["S000043"]);
  expect(after.notificationText).toContain("0 carte(s) piochée(s)");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000043 played through the visible hand renders the three Minotaurs", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-01-zone-spells");
  const minotaurs = ["B000015", "B000016", "B000017"];
  const before = await snapshot(page);
  const staticData = await page.evaluate((ids) => ids.map(id => ({
    id,
    exists: !!CARDS_DATA[id],
    name: CARDS_DATA[id]?.name || "",
    type: CARDS_DATA[id]?.type || "",
    imagePath: `${GH}/${CARDS_DATA[id]?.assetFolder || facFolder(CARDS_DATA[id]?.fac)}/${id}.png`
  })), minotaurs);

  expect(before.player1.deck.filter(id => minotaurs.includes(id)).sort()).toEqual(minotaurs);
  expect(before.player1.hand.filter(id => minotaurs.includes(id))).toEqual([]);
  expect(staticData.every(card => card.exists && card.name && card.type === "Serviteur")).toBe(true);

  const playResult = await playVisibleSpell(page, "S000043");
  const afterPlay = await snapshot(page);
  expect(playResult.spellResolution.drawn.sort()).toEqual([...minotaurs].sort());
  expect(playResult.spellResolution.count).toBe(3);
  expect(afterPlay.notificationText).toContain("3 carte(s) piochée(s)");
  await expect.poll(async () => {
    const state = await snapshot(page);
    return minotaurs.every(id => state.player1.hand.includes(id));
  }).toBe(true);
  await expect.poll(async () => {
    const cards = await visibleHandCards(page);
    return minotaurs.every(id => cards.some(card => card.id === id && card.visible && !card.hiddenByCss && card.imageOk && card.name));
  }).toBe(true);

  const after = await snapshot(page);
  const visibleCards = await visibleHandCards(page);
  await testInfo.attach("s000043-ui-ghost-card-audit", {contentType: "application/json", body: Buffer.from(JSON.stringify({staticData, before, after, visibleCards}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(after.player1.deck.filter(id => minotaurs.includes(id))).toEqual([]);
  expect(after.player1.hand).toEqual(expect.arrayContaining(minotaurs));
  expect(after.player1.graveyard).toContain("S000043");
  for (const id of minotaurs) {
    const card = visibleCards.find(entry => entry.id === id);
    expect(card).toMatchObject({visible: true, hiddenByCss: false, imageOk: true});
    expect(card.name).not.toBe("");
    expect(card.rect.width).toBeGreaterThan(0);
    expect(card.rect.height).toBeGreaterThan(0);
  }
  expect(visibleCards.filter(card => minotaurs.includes(card.id))).toHaveLength(3);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000040 returns every Pixie from graveyard to hand", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-01-zone-spells");
  const textAudit = await page.evaluate(() => ({
    cap: CARDS_DATA.S000040.cap,
    detail: CARDS_DATA.S000040.detail,
    rendered: renderZoomDescription(CARDS_DATA.S000040, "#fff").replace(/<[^>]+>/g, " ")
  }));
  const before = await snapshot(page);
  const result = await playSpell(page, "S000040");
  const after = await snapshot(page);
  await testInfo.attach("s000040-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({textAudit, before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(textAudit.cap).toContain("cimetière");
  expect(textAudit.detail).toContain("cimetière");
  expect(textAudit.rendered).toContain("cimetière");
  expect(`${textAudit.cap} ${textAudit.detail} ${textAudit.rendered}`).not.toContain("cimetiere");
  expect(result.success).toBe(true);
  expect(result.spellMovedToGraveyard).toBe(true);
  expect(result.spellResolution).toMatchObject({code: "pixiemanie-resolved"});
  expect(result.spellResolution.moved.map(entry => entry.cardId)).toEqual(["EDB000012", "EDB000012"]);
  expect(counts(after.player1.hand).EDB000012).toBe(2);
  expect(after.player1.graveyard).toEqual(["MV000001", "R000001", "S000040"]);
  expect(after.panel.zone).toMatchObject({code: "pixiemanie-resolved"});
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("lore-only Surineur is italic while spell abilities stay normal", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-01-zone-spells");
  const audit = await page.evaluate(() => {
    const mount = document.createElement("div");
    mount.innerHTML = buildCanonicalCardPreview("GOB000002", {sourceType: "test"});
    document.body.appendChild(mount);
    const surineurLore = mount.querySelector(".canonical-card-preview .fz-desc-inner .card-lore-text");
    const surineurStyle = surineurLore ? getComputedStyle(surineurLore).fontStyle : "";
    mount.remove();

    const pixiemanie = document.createElement("div");
    pixiemanie.innerHTML = buildCanonicalCardPreview("S000040", {sourceType: "test"});
    document.body.appendChild(pixiemanie);
    const pixiemanieDesc = pixiemanie.querySelector(".canonical-card-preview .fz-desc-inner .fz-desc-text");
    const pixiemanieLore = pixiemanie.querySelector(".canonical-card-preview .fz-desc-inner .card-lore-text");
    const pixiemanieStyle = pixiemanieDesc ? getComputedStyle(pixiemanieDesc).fontStyle : "";
    pixiemanie.remove();

    const door = document.createElement("div");
    door.innerHTML = buildCanonicalCardPreview("S000007", {sourceType: "test"});
    document.body.appendChild(door);
    const doorDesc = door.querySelector(".canonical-card-preview .fz-desc-inner .fz-desc-text");
    const doorLore = door.querySelector(".canonical-card-preview .fz-desc-inner .card-lore-text");
    const doorStyle = doorDesc ? getComputedStyle(doorDesc).fontStyle : "";
    door.remove();

    return {
      surineurCap: CARDS_DATA.GOB000002.cap,
      surineurLore: CARDS_DATA.GOB000002.lore,
      surineurStyle,
      pixiemanieStyle,
      pixiemanieHasLore: !!pixiemanieLore,
      doorStyle,
      doorHasLore: !!doorLore
    };
  });
  await testInfo.attach("lore-style-audit", {contentType: "application/json", body: Buffer.from(JSON.stringify(audit, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(audit.surineurCap).toBe("");
  expect(audit.surineurLore).toContain("gobelins");
  expect(audit.surineurStyle).toBe("italic");
  expect(audit.pixiemanieStyle).not.toBe("italic");
  expect(audit.pixiemanieHasLore).toBe(false);
  expect(audit.doorStyle).not.toBe("italic");
  expect(audit.doorHasLore).toBe(false);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("locked draw spells S000004 and S000017 keep their existing behavior", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-01-zone-spells");
  await page.evaluate(() => {
    const p = playerState("player1");
    p.hand = ["S000004"];
    p.drawPile = ["MV000001", "MV000002", "MV000003"];
    p.graveyard = [];
    refreshHand(p);
    updateDeckCount(p);
    refreshCemeteryVisual(p);
  });
  const beforeCommerce = await snapshot(page);
  await page.evaluate(() => playCard("S000004", null, {}));
  await page.locator(".sort-choice-item").first().click();
  await page.waitForTimeout(500);
  const afterCommerce = await snapshot(page);

  await openScenario(page, "collection-batch-01-zone-spells");
  await page.evaluate(() => {
    const p = playerState("player1");
    p.hand = ["S000017"];
    p.drawPile = ["S000051", "MV000001", "S000006"];
    p.graveyard = [];
    refreshHand(p);
    updateDeckCount(p);
    refreshCemeteryVisual(p);
  });
  const beforeQuete = await snapshot(page);
  const quete = await playSpell(page, "S000017");
  const afterQuete = await snapshot(page);
  await testInfo.attach("locked-spells-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({beforeCommerce, afterCommerce, beforeQuete, quete, afterQuete}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(afterCommerce.player1.hand.sort()).toEqual(["MV000001", "MV000002", "MV000003"].sort());
  expect(afterCommerce.player1.deck).toEqual([]);
  expect(afterCommerce.player1.graveyard).toContain("S000004");
  expect(counts([...afterCommerce.player1.hand, ...afterCommerce.player1.deck, ...afterCommerce.player1.graveyard])).toMatchObject(counts([...beforeCommerce.player1.hand, ...beforeCommerce.player1.deck, ...beforeCommerce.player1.graveyard]));

  expect(quete.success).toBe(true);
  expect(afterQuete.player1.hand.sort()).toEqual(["S000006", "S000051"].sort());
  expect(afterQuete.player1.deck).toEqual(["MV000001"]);
  expect(afterQuete.player1.graveyard).toContain("S000017");
  expect(counts([...afterQuete.player1.hand, ...afterQuete.player1.deck, ...afterQuete.player1.graveyard])).toMatchObject(counts([...beforeQuete.player1.hand, ...beforeQuete.player1.deck, ...beforeQuete.player1.graveyard]));
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000007 refuses illegal slots before payment or mutation", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-01-door-key");
  const before = await snapshot(page);
  const result = await playSpell(page, "S000007", {slotIndex: 0, playerId: "player2"});
  const after = await snapshot(page);

  await openScenario(page, "collection-batch-01-door-key");
  const beforeAlly = await snapshot(page);
  const allyResult = await playSpell(page, "S000007", {slotIndex: 0, playerId: "player1"});
  const afterAlly = await snapshot(page);
  await testInfo.attach("door-refusal-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after, beforeAlly, allyResult, afterAlly}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result).toBeUndefined();
  expect(after.player1.hand).toEqual(before.player1.hand);
  expect(after.player1.resources).toEqual(before.player1.resources);
  expect(after.player2.deck).toEqual(before.player2.deck);
  expect(after.activeLocks).toEqual([]);
  expect(after.doorMarkers).toEqual([]);
  expect(after.errorText).toContain("cible");
  expect(after.panel.play.code).toBe("invalid-door-slot");
  expect(allyResult).toBeUndefined();
  expect(afterAlly.player1.hand).toEqual(beforeAlly.player1.hand);
  expect(afterAlly.player1.resources).toEqual(beforeAlly.player1.resources);
  expect(afterAlly.activeLocks).toEqual([]);
  expect(afterAlly.errorText).toContain("cible");
  expect(afterAlly.panel.play.code).toBe("invalid-door-slot");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000007 public text stays free of technical ids", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-01-door-key");
  const audit = await page.evaluate(() => {
    const cap = CARDS_DATA.S000007.cap;
    const previewText = renderZoomDescription(CARDS_DATA.S000007, "#fff").replace(/<[^>]+>/g, " ");
    const sideText = buildCanonicalCardTooltips("S000007").right.map(item => item.body).join(" ");
    return {cap, previewText, sideText};
  });
  await testInfo.attach("door-text-audit", {contentType: "application/json", body: Buffer.from(JSON.stringify(audit, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  const publicText = `${audit.cap} ${audit.previewText} ${audit.sideText}`;
  expect(publicText).toContain("Clef de pierre");
  expect(publicText).toContain("Chaque clef n’ouvre qu’une unique");
  expect(publicText).not.toMatch(/\bS000007\b|\bS000008\b|effectInstanceId|linkedKeyOccurrenceId|\(ID\s*=/);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000007 distinguishes insufficient resources from invalid target", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-01-door-key");
  await page.evaluate(() => {
    const p = playerState("player1");
    p.resourceState.classical = {...createEmptyClassicalResources(), aria: 1, pierre: 0};
    p.resourceState.souls = 0;
  });
  const before = await snapshot(page);
  const result = await playSpell(page, "S000007", {slotIndex: 1, playerId: "player2"});
  const after = await snapshot(page);
  await testInfo.attach("door-resource-refusal-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result).toBeUndefined();
  expect(after.player1.hand).toEqual(before.player1.hand);
  expect(after.player1.resources).toEqual(before.player1.resources);
  expect(after.activeLocks).toEqual([]);
  expect(after.errorText).toContain("Vous manquez de ressources");
  expect(after.errorText).not.toContain("cible");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000007 locks one free opposing slot and linked S000008 releases exactly that slot on draw", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-01-door-key");
  const before = await snapshot(page);
  const playResult = await playDoorOnVisibleSlot(page, "#raithServants .slot:nth-of-type(2)");
  await expect(page.getByTestId("door-key-add-animation")).toBeVisible();
  await expect.poll(() => page.getByTestId("door-key-add-animation").locator("img").evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(async () => {
    const state = await snapshot(page);
    return state.activeLocks.length;
  }).toBe(1);
  const result = await page.evaluate(() => getHuvuTestResourcePanelSnapshot().zone);
  const locked = await snapshot(page);

  await expect(page.getByTestId("door-lock-marker")).toBeVisible();
  await expect.poll(() => page.getByTestId("door-lock-marker").locator("img").evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  const markerAudit = await doorMarkerVisualAudit(page);
  expect(markerAudit.marker.ratio).toBeGreaterThan(0.88);
  expect(markerAudit.marker.ratio).toBeLessThan(1.12);
  expect(markerAudit.marker.width).toBeLessThanOrEqual(90);
  expect(markerAudit.marker.height).toBeLessThanOrEqual(90);
  expect(markerAudit.borderRadius).not.toBe("0px");
  expect(markerAudit.hasStats).toBe(false);
  expect(markerAudit.hasCost).toBe(false);
  expect(markerAudit.text.trim()).toBe("");
  expect(markerAudit.afterContent).not.toMatch(/Porte/i);
  expect(markerAudit.ariaLabel).toContain("Emplacement bloqué par Porte infranchissable");
  expect(markerAudit.imageOk).toBe(true);

  await page.getByTestId("door-lock-marker").hover();
  await expect(page.locator('[data-door-lock-preview="1"]')).toBeVisible();
  const previewAudit = await doorPreviewAudit(page);
  expect(previewAudit.text).toContain("Porte infranchissable");
  expect(previewAudit.text).toContain("Zone barrée");
  expect(previewAudit.text).toContain("Cette zone est barrée par une Porte infranchissable");
  expect(previewAudit.text).toContain("Clef de pierre");
  expect(previewAudit.hasAtk).toBe(false);
  expect(previewAudit.hasPdv).toBe(false);
  expect(previewAudit.hasCost).toBe(false);
  expect(previewAudit.keyImageOk).toBe(true);
  expect(previewAudit.technicalIdsVisible).toBe(false);

  expect(playResult.success).toBe(true);
  expect(result.success).toBe(true);
  expect(result).toMatchObject({code: "porte-infranchissable-resolved"});
  expect(result.linkedKey).toMatchObject({cardId: "S000008", deckOwner: "player2"});
  expect(locked.activeLocks).toHaveLength(1);
  const lockedSlotIndex = locked.activeLocks[0].slotIndex;
  expect(locked.activeLocks[0]).toMatchObject({sourceCardId: "S000007", affectedPlayerId: "player2", status: "ACTIVE"});
  expect(locked.doorMarkers).toHaveLength(1);
  expect(locked.doorMarkers[0].hasStats).toBe(false);
  expect(locked.freeSlotsPlayer2).not.toContain(lockedSlotIndex);
  expect(locked.player1.graveyard).toContain("S000007");
  expect(locked.player2.deck).toContain("S000008");

  await page.evaluate(() => {
    const p = playerState("player1");
    p.hand = ["S000007"];
    p.resourceState.classical.aria = 10;
    p.resourceState.classical.pierre = 10;
    refreshHand(p);
  });
  const blockedAgain = await playSpell(page, "S000007", {slotIndex: lockedSlotIndex, playerId: "player2"});
  const afterBlockedAgain = await snapshot(page);
  expect(blockedAgain).toBeUndefined();
  expect(afterBlockedAgain.errorText).toContain("cible");
  expect(afterBlockedAgain.activeLocks).toHaveLength(1);
  await page.evaluate(() => {
    const p = playerState("player1");
    p.hand = [];
    refreshHand(p);
  });

  const drawResult = await page.evaluate(() => drawCardFromRuntimeDeck("player2", {sourceCardId: "batch-01-test"}));
  await expect(page.getByTestId("stone-key-open-animation")).toBeVisible();
  await expect.poll(() => page.getByTestId("stone-key-open-animation").locator("img").evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await page.waitForTimeout(650);
  const released = await snapshot(page);
  const cemeteryKeyImage = await page.locator(".dc-j2 .cemetery img").evaluate(img => ({
    src: img.getAttribute("src") || "",
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    complete: img.complete
  }));
  await testInfo.attach("door-key-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, locked, markerAudit, previewAudit, afterBlockedAgain, drawResult, released, cemeteryKeyImage}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(drawResult.success).toBe(true);
  expect(drawResult.cardId).toBe("S000008");
  expect(drawResult.linkedKeyResolution).toMatchObject({handled: true, code: "linked-stone-key-drawn"});
  expect(released.activeLocks).toEqual([]);
  expect(released.doorMarkers).toEqual([]);
  expect(released.freeSlotsPlayer2).toContain(lockedSlotIndex);
  expect(released.player2.hand).not.toContain("S000008");
  expect(released.player2.graveyard).toEqual(["S000008"]);
  expect(cemeteryKeyImage.src).toContain("S000008.png");
  expect(cemeteryKeyImage.naturalWidth).toBeGreaterThan(0);
  expect(released.notificationText).toContain("Porte infranchissable s’ouvre");
  expect(released.player1.graveyard).toContain("S000007");
  expect(counts([...released.player1.hand, ...released.player1.deck, ...released.player1.graveyard]).S000007).toBe(1);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
