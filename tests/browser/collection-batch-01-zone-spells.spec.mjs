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
  await page.waitForTimeout(300);
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
        imageSrc: marker.querySelector("img")?.getAttribute("src") || ""
      })),
      publicScenarioValues: Array.from(document.querySelectorAll("#scenarioSelect option")).map(option => option.value),
      panel: typeof getHuvuTestResourcePanelSnapshot === "function" ? getHuvuTestResourcePanelSnapshot() : null,
      errorText: document.querySelector("#errMsg")?.innerText || ""
    };
  });
}

async function playSpell(page, cardId, zoneSelection = null) {
  const result = await page.evaluate(async ({id, selection}) => playCard(id, null, selection ? {zoneSelection: selection} : {}), {id: cardId, selection: zoneSelection});
  await page.waitForTimeout(300);
  return result;
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
  expect(ley.spellResolution.drawn.sort()).toEqual(["GOB000001", "GOB000002", "GOB000003"]);
  expect(afterLey.player1.hand).toEqual(expect.arrayContaining(["GOB000001", "GOB000002", "GOB000003"]));
  expect(afterLey.player1.hand).toHaveLength(7);
  expect(afterLey.player1.graveyard).toContain("S000037");

  await openScenario(page, "collection-batch-01-zone-spells");
  const taureau = await playSpell(page, "S000043");
  const afterTaureau = await snapshot(page);
  await testInfo.attach("draw-family-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({patrouille, afterPatrouille, ley, afterLey, taureau, afterTaureau}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);
  expect(taureau.success).toBe(true);
  expect(taureau.spellResolution.drawn.sort()).toEqual(["B000015", "B000016", "B000017"]);
  expect(afterTaureau.player1.hand).toEqual(expect.arrayContaining(["B000015", "B000016", "B000017"]));
  expect(afterTaureau.player1.graveyard).toContain("S000043");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000040 returns every Pixie from graveyard to hand", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-01-zone-spells");
  const before = await snapshot(page);
  const result = await playSpell(page, "S000040");
  const after = await snapshot(page);
  await testInfo.attach("s000040-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

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
  await testInfo.attach("door-refusal-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result).toBeUndefined();
  expect(after.player1.hand).toEqual(before.player1.hand);
  expect(after.player1.resources).toEqual(before.player1.resources);
  expect(after.player2.deck).toEqual(before.player2.deck);
  expect(after.activeLocks).toEqual([]);
  expect(after.doorMarkers).toEqual([]);
  expect(after.errorText).toContain("cible");
  expect(after.panel.play.code).toBe("invalid-door-slot");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000007 locks one free opposing slot and linked S000008 releases exactly that slot on draw", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-01-door-key");
  const before = await snapshot(page);
  const result = await playSpell(page, "S000007", {slotIndex: 1, playerId: "player2"});
  const locked = await snapshot(page);

  await expect(page.getByTestId("door-lock-marker")).toBeVisible();
  await expect.poll(() => page.getByTestId("door-lock-marker").locator("img").evaluate(img => img.naturalWidth)).toBeGreaterThan(0);

  const drawResult = await page.evaluate(() => drawCardFromRuntimeDeck("player2", {sourceCardId: "batch-01-test"}));
  await page.waitForTimeout(300);
  const released = await snapshot(page);
  await testInfo.attach("door-key-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, locked, drawResult, released}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result.success).toBe(true);
  expect(result.spellMovedToGraveyard).toBe(true);
  expect(result.spellResolution).toMatchObject({code: "porte-infranchissable-resolved"});
  expect(result.spellResolution.linkedKey).toMatchObject({cardId: "S000008", deckOwner: "player2"});
  expect(locked.activeLocks).toHaveLength(1);
  expect(locked.activeLocks[0]).toMatchObject({sourceCardId: "S000007", affectedPlayerId: "player2", slotIndex: 1, status: "ACTIVE"});
  expect(locked.doorMarkers).toHaveLength(1);
  expect(locked.doorMarkers[0].hasStats).toBe(false);
  expect(locked.freeSlotsPlayer2).not.toContain(1);
  expect(locked.player1.graveyard).toContain("S000007");
  expect(locked.player2.deck).toContain("S000008");

  expect(drawResult.success).toBe(true);
  expect(drawResult.cardId).toBe("S000008");
  expect(drawResult.linkedKeyResolution).toMatchObject({handled: true, code: "linked-stone-key-drawn"});
  expect(released.activeLocks).toEqual([]);
  expect(released.doorMarkers).toEqual([]);
  expect(released.freeSlotsPlayer2).toContain(1);
  expect(released.player2.hand).not.toContain("S000008");
  expect(released.player2.graveyard).toEqual(["S000008"]);
  expect(released.player1.graveyard).toContain("S000007");
  expect(counts([...released.player1.hand, ...released.player1.deck, ...released.player1.graveyard]).S000007).toBe(1);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
