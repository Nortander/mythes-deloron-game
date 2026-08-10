import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-11c-morts-vivants-resurrections-sacrifices.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch11c=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect(page.getByTestId("test-resource-panel")).toContainText("COLLECTION BATCH 11C");
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(150);
}

async function openCollectionPage(page) {
  await page.goto("/code/collection.html?batch11cCollection=" + Date.now());
  await expect.poll(() => page.evaluate(() => typeof CARDS !== "undefined" && Array.isArray(CARDS) && CARDS.length > 0)).toBe(true);
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message =>
    !/Failed to load resource: the server responded with a status of 404/i.test(message)
    && !/Failed to load resource: net::ERR_(NETWORK_CHANGED|NAME_NOT_RESOLVED)/i.test(message)
  );
}

function ids(entries) {
  return entries.map(entry => entry.cardId || entry.id || entry).filter(Boolean);
}

test("Batch-11C scenarios stay hidden and public card contracts use Echo wording without RAME ids", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  for (const scenario of Object.values(fixture.scenarios)) {
    await openScenario(page, scenario);
    const audit = await page.evaluate((cardIds) => ({
      scenarioId:selectedScenarioId(),
      publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length,
      runtime:auditCollectionBatch11cRuntime(),
      cards:cardIds.map(id => ({
        id,
        exists:!!CARDS_DATA[id],
        text:String(CARDS_DATA[id]?.cap || "") + " " + String(CARDS_DATA[id]?.detail || "") + " " + String(CARDS_DATA[id]?.cond || ""),
        keywords:[...(CARDS_DATA[id]?.kws || [])],
        costDefinition:cardCostDefinition(id)
      }))
    }), fixture.selectedCards.map(card => card.id));
    expect(audit.publicOptionCount, scenario + " public selector option").toBe(0);
    expect(audit.runtime.scenarioId).toBe(scenario);
    for (const card of audit.cards) {
      expect(card.exists, card.id).toBe(true);
      expect(card.text, card.id + " public text has no technical ids").not.toMatch(/RAME(?:0|5|10|15|20|21|\*)|\[ID\s*=/i);
      expect(card.text + JSON.stringify(card.keywords), card.id + " keeps Echo vocabulary").toMatch(/Écho|Échos/i);
    }
  }

  await openCollectionPage(page);
  const collectionAudit = await page.evaluate((cardIds) => cardIds.map(id => {
    const cards = CARDS.filter(card => card.id === id);
    return cards.map(card => ({
      id,
      name:card.name,
      text:String(card.desc || "") + " " + String(card.detail || "") + " " + String(card.cond || ""),
      keywords:card.kw || [],
      costDefinition:collectionCostDefinition(id)
    }));
  }).flat(), fixture.selectedCards.map(card => card.id));
  for (const card of collectionAudit) {
    expect(card.text, card.id + " Collection text has no RAME id").not.toMatch(/RAME(?:0|5|10|15|20|21|\*)|\[ID\s*=/i);
    expect(card.text + JSON.stringify(card.keywords), card.id + " Collection text keeps Echo vocabulary").toMatch(/Écho|Échos/i);
  }
  expect(collectionAudit.find(card => card.id === "MV000011")?.costDefinition.total).toBe(6);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000041 damages from own graveyard count, captures lethal victims, exiles current graveyard, then joins graveyard itself", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, fixture.scenarios.sacrificePower);
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const before = auditCollectionBatch11cRuntime();
    const play = await playCard("S000041", null, {returnValidation:true});
    const after = auditCollectionBatch11cRuntime();
    return {before, play, after, events:auditCollectionBatch11cRuntime().events};
  });
  expect(result.play.success).toBe(true);
  expect(result.play.spellMovedToGraveyard).toBe(true);
  expect(result.play.spellResolution).toMatchObject({code:"puissance-du-sacrifice-resolved", damagePoints:fixture.expected.sacrificeDamagePoints});
  const p1After = result.after.players.find(player => player.playerId === "player1");
  const p2After = result.after.players.find(player => player.playerId === "player2");
  expect(p1After.graveyard.map(entry => entry.cardId)).toEqual(["S000041"]);
  expect(p1After.capturedVictims).toEqual(expect.arrayContaining([
    expect.objectContaining({cardId:"H000001", capturedBy:"S000041"}),
    expect.objectContaining({cardId:"H000005", capturedBy:"S000041"})
  ]));
  expect(ids(p2After.graveyard)).not.toEqual(expect.arrayContaining(["H000001", "H000005"]));
  expect(p2After.servants.map(card => card.id)).toEqual([]);
  expect(result.events).toEqual(expect.arrayContaining([expect.objectContaining({type:"puissance-du-sacrifice"})]));
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000041 refuses before mutation when the caster has no servant in graveyard", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, fixture.scenarios.sacrificeRefusal);
  const result = await page.evaluate(async () => {
    const before = auditCollectionBatch11cRuntime();
    const play = await playCard("S000041", null, {returnValidation:true});
    const after = auditCollectionBatch11cRuntime();
    return {before, play, after, errorText:document.querySelector("#errMsg")?.innerText || ""};
  });
  expect(result.play).toMatchObject({success:false, reason:"zone-play-requirement"});
  expect(result.after.inventories).toEqual(result.before.inventories);
  expect(result.errorText).toContain("Vous ne remplissez pas les conditions");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000052 summons distinct low-cost undead from deck, then from graveyard, or grants five Echoes when none exist", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, fixture.scenarios.returnRevenantsDeck);
  const deckResult = await page.evaluate(async () => {
    const play = await playCard("S000052", null, {returnValidation:true});
    return {play, after:auditCollectionBatch11cRuntime()};
  });
  expect(deckResult.play.success).toBe(true);
  expect(deckResult.play.spellMovedToGraveyard).toBe(true);
  expect(deckResult.play.spellResolution.sourceZone).toBe("deck");
  expect(deckResult.play.spellResolution.operation.summoned.map(item => item.cardId).sort()).toEqual(["MV000001", "MV000002", "MV000025"]);
  const deckP1 = deckResult.after.players.find(player => player.playerId === "player1");
  expect(deckP1.servants.map(card => card.id).sort()).toEqual(["MV000001", "MV000002", "MV000025"]);
  expect(deckP1.graveyard.map(entry => entry.cardId)).toContain("S000052");

  await openScenario(page, fixture.scenarios.returnRevenantsGraveyard);
  const graveyardResult = await page.evaluate(async () => {
    const play = await playCard("S000052", null, {returnValidation:true});
    return {play, after:auditCollectionBatch11cRuntime()};
  });
  expect(graveyardResult.play.success).toBe(true);
  expect(graveyardResult.play.spellResolution.sourceZone).toBe("graveyard");
  const graveP1 = graveyardResult.after.players.find(player => player.playerId === "player1");
  expect(graveP1.servants.map(card => card.id).sort()).toEqual(["MV000001", "MV000002", "MV000025"]);
  expect(graveP1.graveyard.map(entry => entry.cardId)).toEqual(["S000052"]);

  await openScenario(page, fixture.scenarios.returnRevenantsFallback);
  const fallback = await page.evaluate(async () => {
    const before = auditCollectionBatch11cRuntime().players.find(player => player.playerId === "player1");
    const play = await playCard("S000052", null, {returnValidation:true});
    const after = auditCollectionBatch11cRuntime().players.find(player => player.playerId === "player1");
    return {before, play, after};
  });
  expect(fallback.play.success).toBe(true);
  expect(fallback.play.spellResolution.fallbackEcho).toMatchObject({success:true, delta:fixture.expected.fallbackEchoGain});
  expect(fallback.after.souls).toBe(fallback.before.souls + fixture.expected.fallbackEchoGain);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("MV000011 generates capped Echoes from servant destruction and its Vengeance captures the exact victim once", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, fixture.scenarios.jeteurMorghast);
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const before = auditCollectionBatch11cRuntime();
    const firstVictim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000001"]');
    await sendToCemetery(firstVictim, {suppressVengeance:true});
    const afterPassive = auditCollectionBatch11cRuntime();
    const jeteur = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000011"]');
    await sendToCemetery(jeteur);
    const afterVengeance = auditCollectionBatch11cRuntime();
    return {before, afterPassive, afterVengeance, events:auditCollectionBatch11cRuntime().events, batch11bEvents:auditCollectionBatch11bRuntime().events};
  });
  const beforeP1 = result.before.players.find(player => player.playerId === "player1");
  const passiveP1 = result.afterPassive.players.find(player => player.playerId === "player1");
  const vengeanceP1 = result.afterVengeance.players.find(player => player.playerId === "player1");
  const vengeanceP2 = result.afterVengeance.players.find(player => player.playerId === "player2");
  expect(passiveP1.souls).toBe(beforeP1.souls + 1);
  expect(result.events).toEqual(expect.arrayContaining([expect.objectContaining({type:"jeteur-destruction-echo"})]));
  expect(vengeanceP1.capturedVictims).toEqual(expect.arrayContaining([expect.objectContaining({cardId:"H000005", capturedBy:"MV000011"})]));
  expect(vengeanceP2.graveyard.map(entry => entry.cardId)).not.toContain("H000005");
  expect(vengeanceP1.graveyard.map(entry => entry.cardId)).toContain("MV000011");
  expect(result.batch11bEvents.filter(event => event.type === "destroy-capture-echo").length).toBeGreaterThanOrEqual(1);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("MV000024 pays strict Echo+Aria costs, converts kills to Echoes, and fills free slots on Vengeance without duplicating cards", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, fixture.scenarios.jeteurMorghast);
  const result = await page.evaluate(async () => {
    const zone = qs(playerZoneSelector(player1, "servants"));
    const handBefore = [...player1.hand];
    player1.resourceState.souls = 4;
    projectSoulState(player1);
    const refused = await playCard("MV000024", zone.querySelector(".slot"), {returnValidation:true});
    const afterRefusal = auditCollectionBatch11cRuntime();
    player1.resourceState.souls = 8;
    projectSoulState(player1);
    const playable = await playCard("MV000024", zone.querySelector(".slot"), {returnValidation:true});
    const afterPlayable = auditCollectionBatch11cRuntime();
    const morghast = zone.querySelector('.fc[data-id="MV000024"]');
    const victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000001"]');
    if (victim) victim._killer = morghast;
    await sendToCemetery(victim, {killer:morghast});
    const afterKill = auditCollectionBatch11cRuntime();
    const dyingMorghast = zone.querySelector('.fc[data-id="MV000024"]');
    await sendToCemetery(dyingMorghast);
    const afterVengeance = auditCollectionBatch11cRuntime();
    return {handBefore, refused, afterRefusal, playable, afterPlayable, afterKill, afterVengeance, events:auditCollectionBatch11cRuntime().events};
  });
  expect(result.refused).toBeUndefined();
  const refusedP1 = result.afterRefusal.players.find(player => player.playerId === "player1");
  expect(refusedP1.hand).toEqual(result.handBefore);
  expect(refusedP1.souls).toBe(4);
  expect(result.playable.success).toBe(true);
  const playedP1 = result.afterPlayable.players.find(player => player.playerId === "player1");
  expect(playedP1.servants.map(card => card.id).filter(id => id === "MV000024").length).toBeGreaterThanOrEqual(2);
  const killP1 = result.afterKill.players.find(player => player.playerId === "player1");
  expect(killP1.souls).toBeGreaterThan(playedP1.souls);
  expect(result.events).toEqual(expect.arrayContaining([expect.objectContaining({type:"morghast-kill-echo"})]));
  const vengeanceP1 = result.afterVengeance.players.find(player => player.playerId === "player1");
  expect(vengeanceP1.servants.map(card => card.id)).toContain(fixture.expected.morghastWarriorId);
  expect(vengeanceP1.graveyard.map(entry => entry.cardId)).toContain("MV000024");
  expect(result.events).toEqual(expect.arrayContaining([expect.objectContaining({type:"morghast-vengeance-fill-board"})]));
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
