import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics, clickCollectionCard, collectionCard, collectionModalSnapshot, openCollection, openPartie} from "./helpers/eloron-ui.mjs";

const prstIds = ["PRST000001","PRST000002","PRST000003","PRST000004","PRST000005","PRST000006","PRST000007","PRST000008","PRST000009","PRST000010","PRST000011","PRST000012","PRST000013","PRST000014"];
const scenarioFor = id => "collection-batch-14b-" + id.toLowerCase() + "-core-visual";
function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource/i.test(message));
}
async function openPrstScenario(page, cardId) {
  const scenario = scenarioFor(cardId);
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch14b=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect(page.getByText("MODE TEST")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout:20000});
  await page.waitForTimeout(150);
}

test("Batch 14B runtime data and hidden scenarios expose the 14 PRST core records", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openPrstScenario(page, "PRST000001");
  const audit = await page.evaluate((ids) => ({
    cards: ids.map(id => ({id, card:CARDS_DATA[id], cost:EXTRA_CARD_COST_DEFINITIONS[id] || CARD_COST_DEFINITIONS[id]})),
    scenarios: ids.map(id => { const key = "collection-batch-14b-" + id.toLowerCase() + "-core-visual"; const sc = SCENARIOS[key]; return {id, key, scenario:sc, optionCount:document.querySelectorAll('#scenarioSelect option[value="' + key + '"]').length}; }),
    hirin: COLLECTION_BATCH_14B_HIRIN_ARBITRATION
  }), prstIds);
  expect(audit.cards).toHaveLength(14);
  for (const entry of audit.cards) {
    expect(entry.card, entry.id).toBeTruthy();
    expect(entry.card.type, entry.id).toBe("Sort");
    expect(entry.card.fac, entry.id).toBe("sort");
    expect(entry.card.prstFavor, entry.id).toBe(true);
    expect(entry.card.internalMarkers, entry.id).toEqual(expect.arrayContaining(["PRST", "DIVINE_FAVOR_SPECIAL"]));
    expect(entry.card.collectionBatch14BStatus, entry.id).toBe("SOCLE_IMPLEMENTE_EFFET_SPECIFIQUE_DIFFERE");
    expect((entry.card.cap + " " + entry.card.detail + " " + entry.card.cond), entry.id).not.toMatch(/\bPRST\d+\b|\[ID\s*=/i);
    expect(entry.cost.conditions.some(item => item.implemented === true), entry.id).toBe(true);
  }
  for (const entry of audit.scenarios) {
    expect(entry.scenario, entry.id).toBeTruthy();
    expect(entry.scenario.hidden, entry.id).toBe(true);
    expect(entry.optionCount, entry.id).toBe(0);
    expect(entry.scenario.participants, entry.id).toEqual(["yria", "rohen"]);
    expect(entry.scenario.testSetup.player1.hand[0], entry.id).toBe(entry.id);
    expect(entry.scenario.testSetup.player1.drawPile.at(-1), entry.id).toBe(entry.id);
    expect(entry.scenario.testSetup.player1.graveyard.length, entry.id).toBeGreaterThanOrEqual(10);
    expect(entry.scenario.testSetup.player2.graveyard.length, entry.id).toBeGreaterThanOrEqual(10);
    expect(entry.scenario.testSetup.player1.resources.classical.aria, entry.id).toBe(100);
    expect(entry.scenario.testSetup.player2.resources.classical.pierre, entry.id).toBe(100);
  }
  expect(audit.hirin.enemyText).toContain("Maudit par Hirin");
  expect(audit.hirin.alliedText).toContain("passe outre [Rempart]");
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

for (const cardId of prstIds) {
  test("Batch 14B manual PRST play removes " + cardId + " from the game", async ({page}, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openPrstScenario(page, cardId);
    const result = await page.evaluate(async (cardId) => {
      currentPlayer = player1.key;
      const before = {hand:[...player1.hand], graveyard:[...player1.graveyard], removed:[...(player1.removedFromGame || [])]};
      const play = await playCard(cardId, null, {returnValidation:true});
      return {before, play, after:{hand:[...player1.hand], graveyard:[...player1.graveyard], removed:[...(player1.removedFromGame || [])], flags:{...(player1.prstFavors || {})}, last:window.__lastPrstActivation || null}};
    }, cardId);
    expect(result.before.hand[0]).toBe(cardId);
    expect(result.play.success, cardId).toBe(true);
    expect(result.play.spellMovedToGraveyard, cardId).toBe(false);
    expect(result.play.spellRemovedFromGame, cardId).toBe(true);
    expect(result.after.hand, cardId).not.toContain(cardId);
    expect(result.after.graveyard, cardId).not.toContain(cardId);
    expect(result.after.removed, cardId).toContain(cardId);
    expect(result.after.flags[cardId].status, cardId).toBe("SOCLE_IMPLEMENTE_EFFET_SPECIFIQUE_DIFFERE");
    expect(result.after.last.cardId, cardId).toBe(cardId);
    await attachDiagnostics(testInfo, diagnostics);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });
}

test("Batch 14B PRST draw auto-plays from top deck without entering hand or graveyard", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openPrstScenario(page, "PRST000014");
  const result = await page.evaluate(() => {
    player1.hand = [];
    renderAllHands();
    const before = {hand:[...player1.hand], deck:[...player1.drawPile], graveyard:[...player1.graveyard], removed:[...(player1.removedFromGame || [])]};
    const draw = drawCardFromDeck(player1, () => true, {refresh:false, sourceCardId:"collection-batch-14b-test"});
    return {before, draw, after:{hand:[...player1.hand], deck:[...player1.drawPile], graveyard:[...player1.graveyard], removed:[...(player1.removedFromGame || [])], flags:{...(player1.prstFavors || {})}}};
  });
  expect(result.before.deck.at(-1)).toBe("PRST000014");
  expect(result.draw.success).toBe(true);
  expect(result.draw.cardId).toBe("PRST000014");
  expect(result.draw.prstAutoPlayResolution.handled).toBe(true);
  expect(result.after.hand).not.toContain("PRST000014");
  expect(result.after.graveyard).not.toContain("PRST000014");
  expect(result.after.removed).toContain("PRST000014");
  expect(result.after.flags.PRST000014.status).toBe("SOCLE_IMPLEMENTE_EFFET_SPECIFIQUE_DIFFERE");
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14B Collection renders the 14 PRST as spell cards without internal markers", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openCollection(page);
  for (const cardId of prstIds) {
    await page.locator("#searchInput").fill(cardId);
    const card = collectionCard(page, cardId);
    await expect(card, cardId).toBeVisible();
    await expect(card, cardId).toContainText(/SORT|Sort/);
    await clickCollectionCard(page, cardId);
    const modal = await collectionModalSnapshot(page);
    expect(modal.open, cardId).toBe(true);
    expect(modal.cardText, cardId).toContain("Faveur");
    expect(modal.cardText, cardId).not.toMatch(/DIVINE_FAVOR_SPECIAL|\bPRST\d+\b|\[ID\s*=/i);
    await page.keyboard.press("Escape");
  }
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
