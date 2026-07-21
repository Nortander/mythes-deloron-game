import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-07-dwarves.json", import.meta.url), "utf8"));
const signatures = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-effect-signatures.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch07=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(150);
}

function diagnosticsFor(page) {
  return attachPageDiagnostics(page);
}

function byId(items) {
  return new Map(items.map(item => [item.id, item]));
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message =>
    !/Failed to load resource: the server responded with a status of 404/i.test(message)
    && !/Failed to load resource: net::ERR_(NETWORK_CHANGED|NAME_NOT_RESOLVED)/i.test(message)
  );
}

test("Batch-07 scenarios stay hidden and expose every dwarf card", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  const signaturesById = byId(signatures.signatures);
  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    const audit = await page.evaluate((input) => ({
      scenarioId:selectedScenarioId(),
      publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + input.scenario + '"]').length,
      cards:input.ids.map(id => ({id, exists:!!CARDS_DATA[id], name:CARDS_DATA[id]?.name || "", type:CARDS_DATA[id]?.type || "", faction:CARDS_DATA[id]?.fac || "", keywords:[...(CARDS_DATA[id]?.kws || [])], text:CARDS_DATA[id]?.cap || "", lore:CARDS_DATA[id]?.lore || ""})),
      dependencies:input.dependencies.map(id => ({id, exists:!!CARDS_DATA[id], name:CARDS_DATA[id]?.name || ""})),
      runtimeAudit:typeof auditCollectionBatch07Runtime === "function" ? auditCollectionBatch07Runtime() : null,
      player1HandSize:player1.hand.length
    }), {scenario, ids:fixture.dwarfIds, dependencies:fixture.directDependencies});
    expect(audit.scenarioId).toBe(scenario);
    expect(audit.publicOptionCount).toBe(fixture.expectedHiddenScenarioOptionCount);
    expect(audit.cards.every(card => card.exists), JSON.stringify(audit.cards.filter(card => !card.exists))).toBe(true);
    expect(audit.dependencies.every(card => card.exists), JSON.stringify(audit.dependencies.filter(card => !card.exists))).toBe(true);
    expect(audit.runtimeAudit).toBeTruthy();
    expect(audit.player1HandSize, scenario + " visible hand size").toBeLessThanOrEqual(fixture.maxVisualHandSize);
    const cardsById = byId(audit.cards);
    expect(cardsById.get("N000001").keywords).toContain("Rempart");
    expect(cardsById.get("N000013").text || cardsById.get("N000013").lore).toBeTruthy();
  }
  for (const id of fixture.dwarfIds) {
    expect(signaturesById.get(id), id + " signature").toBeTruthy();
  }
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("dwarf Initiative effects damage, mill, summon and create exact runtime cards", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-07-nains");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    const board = player => livingServantCardsForPlayer(player).map(targetSummary);

    resetServants(player1);
    resetServants(player2);
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000006", {triggerInitiativeEffect:false, ready:true});
    for (const enemy of livingServantCardsForPlayer(player2)) batch03UpdateStats(enemy, {atk:0, pdvMax:2, pdv:2});
    player1.drawPile = ["R000001"];
    const beforeElite = board(player2);
    const elite = await summonBatch03Servant(player1, "N000002", {triggerInitiativeEffect:true, ready:true});
    await new Promise(resolve => setTimeout(resolve, 900));
    const afterElite = board(player2);
    const handAfterElite = [...player1.hand];

    resetServants(player1);
    resetServants(player2);
    player2.drawPile = ["H000001", "R000001", "H000005"];
    player2.graveyard = [];
    updateDeckCount(player2);
    refreshCemeteryVisual(player2);
    const demolisseur = await summonBatch03Servant(player1, "N000006", {triggerInitiativeEffect:true, ready:true});
    await new Promise(resolve => setTimeout(resolve, 500));
    const afterMillDemolisseur = {deck:[...player2.drawPile], graveyard:[...player2.graveyard]};
    const lance = await summonBatch03Servant(player1, "N000012", {triggerInitiativeEffect:true, ready:true});
    await new Promise(resolve => setTimeout(resolve, 500));
    const afterMillLance = {deck:[...player2.drawPile], graveyard:[...player2.graveyard]};

    resetServants(player1);
    const ram = await summonBatch03Servant(player1, "N000010", {triggerInitiativeEffect:true, ready:true});
    await new Promise(resolve => setTimeout(resolve, 800));
    const ramBoard = board(player1).filter(card => card.id === "N000010");

    resetServants(player1);
    player1.hand = [];
    refreshHand(player1);
    const windjalf = await summonBatch03Servant(player1, "N000015", {triggerInitiativeEffect:true, ready:true});
    await new Promise(resolve => setTimeout(resolve, 600));
    const windjalfHand = [...player1.hand];

    return {beforeElite, afterElite, elite, handAfterElite, afterMillDemolisseur, afterMillLance, demolisseur, lance, ram, ramBoard, windjalf, windjalfHand, events:auditCollectionBatch07Runtime().events};
  });
  expect(result.afterElite).toHaveLength(0);
  expect(result.beforeElite).toHaveLength(3);
  expect(result.handAfterElite).toContain("R000001");
  expect(result.afterMillDemolisseur.graveyard).toEqual(["H000005"]);
  expect(result.afterMillLance.graveyard).toEqual(["H000005", "R000001"]);
  expect(result.ramBoard).toHaveLength(5);
  expect(result.windjalfHand).toContain("S000054");
  expect(result.events.some(event => event.type === "initiative" && event.result?.cardId === "N000002")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("dwarf spells modify stats, replace warriors and add permanent forge effects", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-07-nains");
  const result = await page.evaluate(async () => {
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    resetServants(player1);
    await summonBatch03Servant(player1, "N000013", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "H000001", {triggerInitiativeEffect:false, ready:true});
    const dwarfBefore = targetSummary(livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "N000013"));
    const humanBefore = targetSummary(livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000001"));
    const training = resolveBatch07FruitsEntrainement(player1);
    const dwarfAfterTraining = targetSummary(livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "N000013"));
    const humanAfterTraining = targetSummary(livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000001"));

    resetServants(player1);
    player1.drawPile = ["N000007", "H000001"];
    player1.hand = ["N000007", "S000013"];
    player1.graveyard = ["N000007", "R000001"];
    refreshHand(player1);
    updateDeckCount(player1);
    refreshCemeteryVisual(player1);
    await summonBatch03Servant(player1, "N000007", {triggerInitiativeEffect:false, ready:true});
    const replacement = resolveBatch07ExperienceCombat(player1);
    const boardAfterReplacement = livingServantCardsForPlayer(player1).map(targetSummary);

    player1.hand = ["N000001"];
    refreshHand(player1);
    const occurrenceId = batch03HandOccurrenceAt(player1, 0);
    const costBeforeForge = effectiveCost("N000001", player1, {handOccurrenceId:occurrenceId});
    const forge = resolveBatch07SecretsForge(player1);
    const costAfterForge = effectiveCost("N000001", player1, {handOccurrenceId:occurrenceId});
    await summonBatch03Servant(player1, "N000003", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "N000005", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "N000013", {triggerInitiativeEffect:false, ready:true});
    syncBatch05Passives();
    const passiveSources = livingServantCardsForPlayer(player1).map(fc => ({id:fc.dataset.id, atk:Number(fc.dataset.atk || 0), pdvMax:Number(fc.dataset.pdvMax || 0), passiveGlow:fc.dataset.batch03PassivePulse === "1", pulseColor:fc.dataset.batch04PulseColor || "", passiveSources:fc.dataset.batch05PassiveSources || ""}));

    return {dwarfBefore, humanBefore, training, dwarfAfterTraining, humanAfterTraining, replacement, deck:[...player1.drawPile].map(getRuntimeCardId), hand:[...player1.hand], graveyard:[...player1.graveyard].map(getRuntimeCardId), boardAfterReplacement, forge, costBeforeForge, costAfterForge, passiveSources, events:auditCollectionBatch07Runtime().events};
  });
  expect(result.dwarfAfterTraining.atk).toBe(result.dwarfBefore.atk + 2);
  expect(result.dwarfAfterTraining.pdvMax).toBe(result.dwarfBefore.pdvMax + 1);
  expect(result.humanAfterTraining.atk).toBe(result.humanBefore.atk);
  expect(result.deck).toContain(fixture.expectedWarriorReplacement.to);
  expect(result.hand).not.toContain(fixture.expectedWarriorReplacement.from);
  expect(result.graveyard).toContain(fixture.expectedWarriorReplacement.to);
  expect(result.boardAfterReplacement.map(card => card.id)).toContain(fixture.expectedWarriorReplacement.to);
  expect(result.costAfterForge).toBe(result.costBeforeForge - 1);
  const sourceN000003 = result.passiveSources.find(card => card.id === "N000003");
  const sourceN000005 = result.passiveSources.find(card => card.id === "N000005");
  const buffedMilicien = result.passiveSources.find(card => card.id === "N000013");
  expect(sourceN000003.passiveGlow).toBe(true);
  expect(sourceN000003.pulseColor).toBe(fixture.expectedPulseColor);
  expect(sourceN000005.passiveGlow).toBe(true);
  expect(buffedMilicien.passiveSources).toContain("N000003");
  expect(buffedMilicien.passiveSources).toContain("N000005");
  expect(buffedMilicien.passiveSources).toContain("S000024");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Isgrimm grants a runtime Rune servant and preserves the occurrence through deck, hand and return", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-07-isgrimm");
  const result = await page.evaluate(async (expected) => {
    window.__mythesRandom = () => 0;
    const before = {
      ownGraveyard:[...player1.graveyard],
      opponentGraveyard:[...player2.graveyard],
      ownDeck:[...player1.drawPile].map(getRuntimeCardId)
    };
    const isgrimm = await summonBatch03Servant(player1, "AVS000013", {triggerInitiativeEffect:true, ready:true});
    await new Promise(resolve => setTimeout(resolve, 900));
    const runeEntry = player1.drawPile.find(entry => getRuntimeCardId(entry) === expected.selectedCardId && entry.batch07RuneServant);
    const draw = drawCardFromRuntimeDeck(player1, {predicate:id => id === expected.selectedCardId, refresh:true, sourceCardId:"AVS000013"});
    const handIndex = player1.hand.indexOf(expected.selectedCardId);
    const occurrenceId = batch03HandOccurrenceAt(player1, handIndex);
    const markedInHand = isBatch07RuneHandOccurrence(player1, occurrenceId, expected.selectedCardId);
    const slot = document.querySelector(playerZoneSelector(player1, "servants") + " .slot");
    currentPlayer = player1.key;
    const play = await playCard(expected.selectedCardId, slot, {handOccurrenceId:occurrenceId});
    await new Promise(resolve => setTimeout(resolve, 650));
    const boardCard = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === expected.selectedCardId && fc.dataset.batch07RuneServant === "1");
    const boardSummary = boardCard ? targetSummary(boardCard) : null;
    if (boardCard) {
      boardCard._killer = null;
      await applyDamage(boardCard, 99);
      await new Promise(resolve => setTimeout(resolve, 1300));
    }
    const returnedIndex = batch03HandIndexForOccurrence(player1, expected.selectedCardId, boardSummary?.instance || occurrenceId);
    const returnedOccurrence = returnedIndex >= 0 ? batch03HandOccurrenceAt(player1, returnedIndex) : null;
    const blockedReplay = returnedIndex >= 0
      ? await playCard(expected.selectedCardId, document.querySelector(playerZoneSelector(player1, "servants") + " .slot"), {handOccurrenceId:returnedOccurrence, returnActionValidation:true})
      : null;
    const audit = auditCollectionBatch07Runtime();
    return {before, isgrimm, runeEntry, draw, handIndex, occurrenceId, markedInHand, play, boardSummary, returnedIndex, returnedOccurrence, blockedReplay, hand:[...player1.hand], graveyard:[...player1.graveyard].map(getRuntimeCardId), audit};
  }, fixture.expectedIsgrimm);
  expect(result.isgrimm.success).toBe(true);
  expect(result.runeEntry).toBeTruthy();
  expect(result.runeEntry.batch07RuneServant).toBe(true);
  expect(result.draw.success).toBe(true);
  expect(result.markedInHand).toBe(true);
  expect(result.boardSummary).toBeTruthy();
  expect(result.returnedIndex).toBeGreaterThanOrEqual(0);
  expect(result.returnedOccurrence).toBe(result.boardSummary.instance);
  expect(result.hand).toContain(fixture.expectedIsgrimm.selectedCardId);
  expect(result.graveyard).not.toContain(fixture.expectedIsgrimm.selectedCardId);
  expect(result.blockedReplay?.success).toBe(false);
  expect(result.blockedReplay?.reason).toBe("blocked-card");
  expect(result.audit.events.some(event => event.type === "isgrimm-rune-servant")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("dwarf combat covers reduction, priest healing, Glamrig adjacency and stone guardian Vengeance", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-07-nains");
  const result = await page.evaluate(async (expected) => {
    window.__mythesRandom = () => 0;
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    const board = player => livingServantCardsForPlayer(player).map(targetSummary);

    resetServants(player1);
    resetServants(player2);
    const guardianSummon = await summonBatch03Servant(player1, "N000009", {triggerInitiativeEffect:false, ready:true});
    const guardian = document.querySelector('.fc[data-instance="' + guardianSummon.instanceId + '"]');
    const guardianBefore = targetSummary(guardian);
    await applyDamage(guardian, 5);
    await new Promise(resolve => setTimeout(resolve, 650));
    const guardianAfterReduction = targetSummary(guardian);
    await applyDamage(guardian, 99);
    await new Promise(resolve => setTimeout(resolve, 1200));
    const afterGuardianVengeance = board(player1);

    resetServants(player1);
    const priestSummon = await summonBatch03Servant(player1, "N000011", {triggerInitiativeEffect:false, ready:true});
    const allySummon = await summonBatch03Servant(player1, "N000013", {triggerInitiativeEffect:false, ready:true});
    const priest = document.querySelector('.fc[data-instance="' + priestSummon.instanceId + '"]');
    const ally = document.querySelector('.fc[data-instance="' + allySummon.instanceId + '"]');
    batch03UpdateStats(ally, {pdvMax:8, pdv:4});
    const allyBeforeHeal = targetSummary(ally);
    await applyDamage(priest, 2);
    await new Promise(resolve => setTimeout(resolve, 700));
    const allyAfterHeal = targetSummary(ally);

    resetServants(player1);
    resetServants(player2);
    const glamrigSummon = await summonBatch03Servant(player1, "N000014", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000006", {triggerInitiativeEffect:false, ready:true});
    for (const enemy of livingServantCardsForPlayer(player2)) batch03UpdateStats(enemy, {atk:0, pdvMax:20, pdv:20});
    const glamrig = document.querySelector('.fc[data-instance="' + glamrigSummon.instanceId + '"]');
    currentPlayer = player1.key;
    const beforeGlamrig = board(player2);
    await resolveCombat(glamrig, livingServantCardsForPlayer(player2)[1]);
    await new Promise(resolve => setTimeout(resolve, 700));
    const afterGlamrig = board(player2);
    const events = auditCollectionBatch07Runtime().events;

    return {guardianBefore, guardianAfterReduction, afterGuardianVengeance, allyBeforeHeal, allyAfterHeal, beforeGlamrig, afterGlamrig, events};
  }, fixture.expectedCombat);
  expect(result.guardianBefore.pdv - result.guardianAfterReduction.pdv).toBe(5 - fixture.expectedCombat.stoneGuardianReduction);
  expect(result.afterGuardianVengeance.map(card => card.id)).toContain("DIV000008");
  expect(result.allyAfterHeal.pdv - result.allyBeforeHeal.pdv).toBe(fixture.expectedCombat.priestHeal);
  expect(result.beforeGlamrig[0].pdv - result.afterGlamrig[0].pdv).toBe(fixture.expectedCombat.glamrigAdjacentDamage);
  expect(result.beforeGlamrig[2].pdv - result.afterGlamrig[2].pdv).toBe(fixture.expectedCombat.glamrigAdjacentDamage);
  expect(result.events.some(event => event.type === "stone-guardian-damage-reduction")).toBe(true);
  expect(result.events.some(event => event.type === "n000009-vengeance")).toBe(true);
  expect(result.events.some(event => event.type === "glamrig-adjacent-damage")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
