import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-11b-morts-vivants-triggers.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch11b=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(150);
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message =>
    !/Failed to load resource: the server responded with a status of 404/i.test(message)
    && !/Failed to load resource: net::ERR_(NETWORK_CHANGED|NAME_NOT_RESOLVED)/i.test(message)
  );
}

async function playFromHand(page, cardId, zone = "servants") {
  return page.evaluate(async ({cardId, zone}) => {
    const selector = zone === "appro" ? playerZoneSelector(player1, "appro") : playerZoneSelector(player1, "servants");
    const slot = qs(selector)?.querySelector(zone === "appro" ? ".slot-appro" : ".slot");
    return playCard(cardId, slot, {returnValidation:true});
  }, {cardId, zone});
}

test("Batch-11B scenarios stay hidden and expose clean Echo-facing card data", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  for (const scenario of Object.values(fixture.scenarios)) {
    await openScenario(page, scenario);
    const audit = await page.evaluate((ids) => ({
      scenarioId:selectedScenarioId(),
      publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length,
      runtime:auditCollectionBatch11bRuntime(),
      cards:ids.map(id => ({
        id,
        exists:!!CARDS_DATA[id],
        text:String(CARDS_DATA[id]?.cap || "") + " " + String(CARDS_DATA[id]?.detail || ""),
        keywords:[...(CARDS_DATA[id]?.kws || [])],
        resType:CARDS_DATA[id]?.resType || "",
        cost:CARDS_DATA[id]?.cost ?? null,
        pdv:CARDS_DATA[id]?.pdv ?? null
      }))
    }), fixture.selectedCards.map(card => card.id));
    expect(audit.publicOptionCount, scenario + " public selector option").toBe(0);
    expect(audit.runtime.scenarioId).toBe(scenario);
    for (const card of audit.cards) {
      expect(card.exists, card.id).toBe(true);
      expect(card.text, card.id + " public text has no technical RAME id").not.toMatch(/RAME(?:0|5|10|15|20|21|\*)|\[ID\s*=/i);
      expect(card.text, card.id + " public text has no old mechanical Ame label").not.toMatch(/Âme|Âmes|Ã‚me|\bme\b/);
    }
    expect(audit.cards.find(card => card.id === "MV000003")?.pdv).toBe(8);
    expect(audit.cards.find(card => card.id === "MV000015")?.resType).toContain("Écho");
    expect(audit.cards.find(card => card.id === "MV000015")?.resType).toContain("Aria");
  }
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Spectre, Gueule and Amalgame terrifiant destroy eligible servants, add Echoes, and capture victims", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, fixture.scenarios.initiativeCaptures);
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const servants = () => qs(playerZoneSelector(player1, "servants"));
    const enemyServants = () => qs(playerZoneSelector(player2, "servants"));
    const playOnSlot = async (cardId) => playCard(cardId, servants().querySelector(".slot"), {returnValidation:true});
    const before = auditCollectionBatch11bRuntime();
    const spectrePlay = await playOnSlot("MV000002");
    const afterSpectre = auditCollectionBatch11bRuntime();

    const gueuleSlot = servants().querySelector(".slot");
    gueuleSlot.outerHTML = buildFC("MV000003", player1.key);
    const gueule = servants().querySelector('.fc[data-id="MV000003"]');
    gueule.dataset.pdv = "4";
    const pdv = gueule.querySelector(".fc-pdv-val");
    if (pdv) { pdv.textContent = "4"; pdv.className = "fc-pdv-val red"; }
    const gueuleInitiative = await triggerInitiative("MV000003", player1, {sourceFC:gueule, sourceInstanceId:gueule.dataset.instance || null});
    const afterGueule = auditCollectionBatch11bRuntime();

    const amalgamePlay = await playOnSlot("MV000004");
    const afterAmalgame = auditCollectionBatch11bRuntime();
    return {
      before,
      spectrePlay,
      afterSpectre,
      gueuleInitiative,
      afterGueule,
      amalgamePlay,
      afterAmalgame,
      enemyBoard:Array.from(enemyServants().querySelectorAll(".fc:not([data-dead])")).map(fc => fc.dataset.id),
      events:auditCollectionBatch11bRuntime().events
    };
  });
  const p1Before = result.before.players.find(player => player.playerId === "player1");
  const p1AfterSpectre = result.afterSpectre.players.find(player => player.playerId === "player1");
  const p1AfterGueule = result.afterGueule.players.find(player => player.playerId === "player1");
  const p1AfterAmalgame = result.afterAmalgame.players.find(player => player.playerId === "player1");
  const p2AfterAmalgame = result.afterAmalgame.players.find(player => player.playerId === "player2");

  expect(result.spectrePlay.success).toBe(true);
  expect(p1AfterSpectre.souls).toBe(p1Before.souls - 2 + 1);
  expect(p1AfterSpectre.capturedVictims).toEqual(expect.arrayContaining([expect.objectContaining({cardId:"H000001", originalOwnerId:"player2", capturedBy:"MV000002", amount:1})]));
  expect(p2AfterAmalgame.graveyard.map(entry => entry.cardId)).not.toEqual(expect.arrayContaining(["H000001", "H000005", "H000006"]));

  expect(result.gueuleInitiative.success).toBe(true);
  expect(result.gueuleInitiative.heal.gained).toBeGreaterThan(0);
  expect(p1AfterGueule.capturedVictims).toEqual(expect.arrayContaining([expect.objectContaining({capturedBy:"MV000003", amount:1})]));

  expect(result.amalgamePlay.success).toBe(true);
  expect(p1AfterAmalgame.capturedVictims).toEqual(expect.arrayContaining([expect.objectContaining({capturedBy:"MV000004", amount:3})]));
  expect(result.enemyBoard).toEqual([]);
  expect(result.events.filter(event => event.type === "destroy-capture-echo")).toHaveLength(3);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Amalgame erratique draws three cards and Amalgame rageur reduces the next Echo cost", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, fixture.scenarios.amalgams);
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const zone = qs(playerZoneSelector(player1, "servants"));
    const before = auditCollectionBatch11bRuntime().players.find(player => player.playerId === player1.key);
    const erratique = await playCard("MV000006", zone.querySelector(".slot"), {returnValidation:true});
    const afterErratique = auditCollectionBatch11bRuntime().players.find(player => player.playerId === player1.key);
    const rageur = await playCard("MV000005", zone.querySelector(".slot"), {returnValidation:true});
    const afterRageur = auditCollectionBatch11bRuntime().players.find(player => player.playerId === player1.key);
    const affordability = getCardAffordabilityResult("MV000003", player1);
    return {before, erratique, afterErratique, rageur, afterRageur, affordability, events:auditCollectionBatch11bRuntime().events};
  });
  expect(result.erratique.success).toBe(true);
  expect(result.afterErratique.hand.length).toBe(result.before.hand.length - 1 + 3);
  expect(result.afterErratique.deck.length).toBe(result.before.deck.length - 3);
  expect(result.events).toEqual(expect.arrayContaining([expect.objectContaining({type:"amalgam-draw", detail:expect.objectContaining({draw:expect.objectContaining({count:3})})})]));

  expect(result.rageur.success).toBe(true);
  expect(result.affordability.printedCost.total).toBe(5);
  expect(result.affordability.effectiveCost.total).toBe(2);
  expect(result.affordability.appliedModifiers).toEqual(expect.arrayContaining([expect.objectContaining({sourceId:"MV000005"})]));
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Banshee moves a low-attack enemy into its deck and its Vengeance returns an opposing hand card", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, fixture.scenarios.bansheeVengeance);
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const zone = qs(playerZoneSelector(player1, "servants"));
    const before = auditCollectionBatch11bRuntime();
    const play = await playCard("MV000015", zone.querySelector(".slot"), {returnValidation:true});
    const afterInitiative = auditCollectionBatch11bRuntime();
    const boardBanshee = zone.querySelector('.fc[data-id="MV000015"]');
    await sendToCemetery(boardBanshee);
    const afterVengeance = auditCollectionBatch11bRuntime();
    return {before, play, afterInitiative, afterVengeance, events:auditCollectionBatch11bRuntime().events};
  });
  const beforeP2 = result.before.players.find(player => player.playerId === "player2");
  const afterInitiativeP2 = result.afterInitiative.players.find(player => player.playerId === "player2");
  const afterVengeanceP1 = result.afterVengeance.players.find(player => player.playerId === "player1");
  const afterVengeanceP2 = result.afterVengeance.players.find(player => player.playerId === "player2");

  expect(result.play.success).toBe(true);
  expect(afterInitiativeP2.servants.map(card => card.id)).not.toContain("H000001");
  expect(afterInitiativeP2.deck.length).toBe(beforeP2.deck.length + 1);
  expect(afterInitiativeP2.graveyard.map(entry => entry.cardId)).not.toContain("H000001");

  expect(afterVengeanceP2.hand.length).toBe(afterInitiativeP2.hand.length - 1);
  expect(afterVengeanceP2.deck.length).toBe(afterInitiativeP2.deck.length + 1);
  expect(afterVengeanceP1.graveyard.map(entry => entry.cardId)).toContain("MV000015");
  expect(result.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type:"return-servant-to-deck"}),
    expect.objectContaining({type:"banshee-vengeance-hand-to-deck", detail:expect.objectContaining({returnedCard:"H000001"})})
  ]));
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Gardien du reliquaire adds three Echoes on Initiative and keeps its end-turn clause deferred", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, fixture.scenarios.bansheeVengeance);
  const result = await page.evaluate(async () => {
    const zone = qs(playerZoneSelector(player1, "servants"));
    const before = auditCollectionBatch11bRuntime().players.find(player => player.playerId === player1.key);
    const play = await playCard("MV000029", zone.querySelector(".slot"), {returnValidation:true});
    const after = auditCollectionBatch11bRuntime().players.find(player => player.playerId === player1.key);
    return {before, play, after, events:auditCollectionBatch11bRuntime().events};
  });
  expect(result.play.success).toBe(true);
  expect(result.after.souls).toBe(result.before.souls + 3);
  expect(result.after.servants.map(card => card.id)).toContain("MV000029");
  expect(result.events).toEqual(expect.arrayContaining([expect.objectContaining({
    type:"reliquary-guardian-initiative",
    detail:expect.objectContaining({deferred:["end-turn-extra-echo-if-no-echo-spent"]})
  })]));
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
