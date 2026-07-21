import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-07-dwarves.json", import.meta.url), "utf8"));
const signatures = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-effect-signatures.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch07b=" + Date.now());
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

function requirementAmount(cost, resourceKey) {
  const normalized = resourceKey.toLowerCase();
  const req = (cost?.requirements || []).find(candidate => {
    const label = String(candidate.resource || candidate.resourceKey || candidate.key || "").toLowerCase();
    return label === normalized || label.includes(normalized) || (normalized === "selene" && label.includes("sél"));
  });
  return req ? Number(req.amount ?? req.requiredAmount ?? 0) : null;
}

function normalizeVisibleCardText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .trim();
}


test("Batch-07 scenarios stay hidden and expose dwarf runtime data", async ({page}, testInfo) => {
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
      player1HandSize:player1.hand.length,
      board:livingServantCardsForPlayer(player1).map(targetSummary)
    }), {scenario, ids:fixture.dwarfIds, dependencies:fixture.directDependencies});
    expect(audit.scenarioId).toBe(scenario);
    expect(audit.publicOptionCount).toBe(fixture.expectedHiddenScenarioOptionCount);
    expect(audit.cards.every(card => card.exists), JSON.stringify(audit.cards.filter(card => !card.exists))).toBe(true);
    expect(audit.dependencies.every(card => card.exists), JSON.stringify(audit.dependencies.filter(card => !card.exists))).toBe(true);
    expect(audit.runtimeAudit).toBeTruthy();
    expect(audit.player1HandSize, scenario + " visible hand size").toBeLessThanOrEqual(fixture.maxVisualHandSize);
    if (scenario === "collection-batch-07-nains") {
      expect(audit.cards.find(card => card.id === "N000001")?.keywords).toContain("Rempart");
      expect(audit.board.map(card => card.id)).toContain("N000009");
    }
  }
  for (const id of fixture.dwarfIds) expect(signaturesById.get(id), id + " signature").toBeTruthy();
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("dwarf public text and spell rendering reflect Daddy visual feedback", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-07-nains");
  const data = await page.evaluate((canonical) => {
    const ids = ["N000002", "N000003", "N000004", "N000005", "N000009", "N000011", "N000015", "S000012", "S000013", "S000024", "S000054"];
    const runtime = Object.fromEntries(ids.map(id => [id, {name:CARDS_DATA[id]?.name, type:CARDS_DATA[id]?.type, fac:CARDS_DATA[id]?.fac, fico:CARDS_DATA[id]?.fico ?? null, kws:[...(CARDS_DATA[id]?.kws || [])], cap:CARDS_DATA[id]?.cap || "", detail:CARDS_DATA[id]?.detail || ""}]));
    const textGuardIds = ["N000005", "N000009"];
    const canonicalComparisons = textGuardIds.map(id => {
      const expected = canonical[id];
      return {id, expectedName:expected.name, actualName:CARDS_DATA[id]?.name || "", expectedDescription:expected.description || "", actualDescription:CARDS_DATA[id]?.cap || ""};
    });
    return {runtime, canonicalComparisons};
  }, fixture.canonicalVisibleText);
  for (const comparison of data.canonicalComparisons) {
    expect(comparison.actualName, comparison.id + " canonical name").toBe(comparison.expectedName);
    expect(normalizeVisibleCardText(comparison.actualDescription), comparison.id + " canonical description").toBe(normalizeVisibleCardText(comparison.expectedDescription));
  }
  const runtime = data.runtime;
  expect(runtime.N000002.cap).toContain("*2*");
  expect(runtime.N000002.cap).toContain("*1 carte*");
  expect(runtime.N000003.cap).toContain("*+2 ATK*");
  expect(runtime.N000004.cap).toContain("*1* carte *Approvisionnement*");
  expect(runtime.N000005.name).toBe("Haut-seigneur Alfric Cassebibine");
  expect(runtime.N000005.cap).toContain("[Rempart] [Rage] [Sang ardent] [Sang-froid]");
  expect(runtime.N000005.cap).toContain("*+1 ATK*");
  expect(runtime.N000005.cap).toContain("*+1 PDV*");
  for (const keyword of ["Rempart", "Rage", "Sang ardent", "Sang-froid"]) expect(runtime.N000005.kws).toContain(keyword);
  expect(runtime.N000009.cap).toContain("*2*");
  expect(runtime.N000009.cap).toContain("*1*");
  expect(runtime.N000009.cap).toContain("« Golem de roche »");
  expect(runtime.N000011.cap).toContain("« Prêtre-combattant »");
  expect(runtime.N000015.cap).toContain("« Boute-flammes »");
  for (const id of ["S000012", "S000013", "S000024", "S000054"]) {
    expect(runtime[id].type, id).toBe("Sort");
    expect(runtime[id].fac, id).toBe("sort");
    expect(runtime[id].fico, id).toBe(null);
  }
  expect(runtime.S000012.cap).toContain("*+2 ATK*");
  expect(runtime.S000012.cap).toContain("*+1 PDV*");
  expect(runtime.S000013.cap).toContain("« Guerriers »");
  expect(runtime.S000013.cap).toContain("« Guerriers expérimentés »");
  expect(runtime.S000024.cap).toContain("*1*");
  expect(runtime.S000024.cap).toContain("*+1*");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
test("Isgrimm requires an explicit graveyard choice and preserves the Rune occurrence", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-07-isgrimm");
  await page.evaluate(() => {
    window.__batch07IsgrimmPromise = summonBatch03Servant(player1, "AVS000013", {triggerInitiativeEffect:true, ready:true});
  });
  await expect(page.getByTestId("zone-card-choice")).toHaveCount(3);
  await expect(page.getByText(fixture.expectedIsgrimm.prompt)).toBeVisible();
  const modalAudit = await page.evaluate(() => {
    const panel = document.querySelector('.zone-card-choice-panel');
    const title = panel?.querySelector('.sort-choice-title');
    const actions = panel?.querySelector('.decision-modal-actions');
    const list = panel?.querySelector('[data-testid="zone-card-choice-list"]');
    const panelStyle = panel ? getComputedStyle(panel) : null;
    const listStyle = list ? getComputedStyle(list) : null;
    const titleRect = title?.getBoundingClientRect();
    const actionsRect = actions?.getBoundingClientRect();
    return {className:panel?.className || "", panelOverflow:panelStyle?.overflow || "", listOverflow:listStyle?.overflow || "", titleOrder:Number(getComputedStyle(title).order || 0), actionsOrder:Number(getComputedStyle(actions).order || 0), titleTop:titleRect?.top ?? 0, actionsTop:actionsRect?.top ?? 0};
  });
  expect(modalAudit.className).toContain("isgrimm-rune-choice-panel");
  expect(modalAudit.panelOverflow).toBe("visible");
  expect(modalAudit.listOverflow).toBe("visible");
  expect(modalAudit.actionsOrder).toBeLessThan(modalAudit.titleOrder);
  expect(modalAudit.actionsTop).toBeLessThanOrEqual(modalAudit.titleTop);
  await page.locator('[data-testid="zone-card-choice"][data-card-id="H000001"]').click();
  await page.getByTestId("zone-card-confirm").click();
  const result = await page.evaluate(async (expected) => {
    const summon = await window.__batch07IsgrimmPromise;
    const isgrimmMessage = document.querySelector('#notif')?.textContent || '';
    const runeEntry = player1.drawPile.find(entry => getRuntimeCardId(entry) === expected.selectedCardId && entry.batch07RuneServant);
    const draw = drawCardFromRuntimeDeck(player1, {predicate:id => id === expected.selectedCardId, refresh:true, sourceCardId:"AVS000013"});
    const handIndex = player1.hand.indexOf(expected.selectedCardId);
    const occurrenceId = batch03HandOccurrenceAt(player1, handIndex);
    const markedInHand = isBatch07RuneHandOccurrence(player1, occurrenceId, expected.selectedCardId);
    const slot = document.querySelector(playerZoneSelector(player1, "servants") + " .slot");
    currentPlayer = player1.key;
    const play = await playCard(expected.selectedCardId, slot, {handOccurrenceId:occurrenceId});
    await new Promise(resolve => setTimeout(resolve, 500));
    const boardCard = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === expected.selectedCardId && fc.dataset.batch07RuneServant === "1");
    const dynamicLines = boardCard ? batch03DynamicStatusTexts(boardCard) : [];
    const previewHtml = boardCard ? fmtDesc(batch03DynamicStatusTexts(boardCard).join(" ")) : "";
    const tooltipHtml = boardCard ? buildPreviewKeywordTooltips(boardCard.dataset.id, {sourceElement:boardCard}) : "";
    const boardSummary = boardCard ? targetSummary(boardCard) : null;
    if (boardCard) await applyDamage(boardCard, 99);
    await new Promise(resolve => setTimeout(resolve, 1200));
    const returnedIndex = batch03HandIndexForOccurrence(player1, expected.selectedCardId, boardSummary?.instance || occurrenceId);
    const returnedOccurrence = returnedIndex >= 0 ? batch03HandOccurrenceAt(player1, returnedIndex) : null;
    return {summon, isgrimmMessage, runeEntry, draw, markedInHand, play, boardSummary, dynamicLines, previewHtml, tooltipHtml, returnedIndex, returnedOccurrence, hand:[...player1.hand], graveyard:[...player1.graveyard].map(getRuntimeCardId), events:auditCollectionBatch07Runtime().events};
  }, fixture.expectedIsgrimm);
  expect(result.summon.success).toBe(true);
  expect(result.isgrimmMessage).toContain(fixture.expectedIsgrimm.message);
  expect(result.runeEntry).toBeTruthy();
  expect(result.runeEntry.batch07RuneServant).toBe(true);
  expect(result.draw.success).toBe(true);
  expect(result.markedInHand).toBe(true);
  expect(result.play.success).toBe(true);
  expect(result.boardSummary?.id).toBe(fixture.expectedIsgrimm.selectedCardId);
  expect(result.dynamicLines).toContain(fixture.expectedRuneLine);
  expect(result.previewHtml).toContain("canonical-keyword-inline");
  expect(result.previewHtml).toContain("Serviteur de la rune");
  expect(result.tooltipHtml).toContain("canonical-keyword-tooltip");
  expect(result.tooltipHtml).toContain('data-keyword="Serviteur de la rune"');
  expect(result.returnedIndex).toBeGreaterThanOrEqual(0);
  expect(result.returnedOccurrence).toBe(result.boardSummary.instance);
  expect(result.hand).toContain(fixture.expectedIsgrimm.selectedCardId);
  expect(result.graveyard).not.toContain(fixture.expectedIsgrimm.selectedCardId);
  expect(result.events.some(event => event.type === "isgrimm-rune-servant" && event.selected?.cardId === fixture.expectedIsgrimm.selectedCardId)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
test("Boute-flammes grants Sang ardent now and fire resistance to future dwarves", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-07-nains");
  const result = await page.evaluate(async () => {
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    resetServants(player1);
    resetServants(player2);
    player1.hand = ["S000054", "N000015", "N000013", "S000012"];
    player1.drawPile = ["N000001", "N000014", "N000003", "R000001"];
    refreshHand(player1);
    updateDeckCount(player1);
    const burnedSummon = await summonBatch03Servant(player1, "N000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "N000003", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "N000005", {triggerInitiativeEffect:false, ready:true});
    const burned = document.querySelector('.fc[data-instance="' + burnedSummon.instanceId + '"]');
    await applyEmbrasement(burned, {sourcePlayer:player2, sourceCardId:'ORC000017'});
    currentPlayer = player1.key;
    const play = await playCard("S000054");
    await new Promise(resolve => setTimeout(resolve, 650));
    const currentDwarves = livingServantCardsForPlayer(player1).filter(isBatch07DwarfServant).map(fc => ({id:fc.dataset.id, burning:Number(fc.dataset.burning || 0), sang:fc.dataset.batch07SangArdent === '1', fire:fc.dataset.batch07FireResistance === '1', lines:batch03DynamicStatusTexts(fc), preview:fmtDesc(batch03DynamicStatusTexts(fc).join(' '))}));
    const graveyardAfterSpell = [...player1.graveyard].map(getRuntimeCardId);
    const lastMessage = document.querySelector('#notif')?.textContent || '';
    const futureDraw = drawCardFromRuntimeDeck(player1, {predicate:id => id === 'N000001', refresh:true, sourceCardId:'S000054'});
    const futureSummon = await summonBatch03Servant(player1, 'N000001', {triggerInitiativeEffect:false, ready:true});
    syncBatch05Passives();
    const future = document.querySelector('.fc[data-instance="' + futureSummon.instanceId + '"]');
    const beforeBurn = targetSummary(future);
    const emb = await applyEmbrasement(future, {sourcePlayer:player2, sourceCardId:'ORC000017'});
    const periodic = burningPeriodicDamageFor(future, {sourcePlayerId:player2.key});
    const beforePeriodic = targetSummary(future);
    await applyStartOfTurnBurning(player1);
    await new Promise(resolve => setTimeout(resolve, 450));
    const afterPeriodic = targetSummary(future);
    return {play, currentDwarves, graveyardAfterSpell, lastMessage, futureDraw, futureSummon, beforeBurn, emb, periodic, beforePeriodic, afterPeriodic, futureLines:batch03DynamicStatusTexts(future), events:auditCollectionBatch07Runtime().events};
  });
  expect(result.play.success).toBe(true);
  expect(result.graveyardAfterSpell).toContain("S000054");
  expect(result.lastMessage).toContain(fixture.expectedBouteFlammes.publicMessage);
  expect(result.lastMessage).toContain("FEU !");
  expect(result.currentDwarves.length).toBeGreaterThanOrEqual(3);
  expect(result.currentDwarves.every(card => card.sang)).toBe(true);
  expect(result.currentDwarves.every(card => card.burning === 0)).toBe(true);
  expect(result.currentDwarves[0].lines).toContain(fixture.expectedBouteFlammes.currentDwarfLine);
  expect(result.currentDwarves.some(card => card.preview.includes("canonical-keyword-inline") && card.preview.includes("Sang ardent"))).toBe(true);
  expect(result.futureDraw.success).toBe(true);
  expect(result.futureSummon.success).toBe(true);
  expect(result.emb.success).toBe(true);
  expect(result.periodic).toBe(fixture.expectedBouteFlammes.periodicDamageAfterResistance);
  expect(result.afterPeriodic.pdv).toBe(result.beforePeriodic.pdv);
  expect(result.futureLines).toContain(fixture.expectedBouteFlammes.futureDwarfLine);
  expect(result.events.some(event => event.type === "boute-flammes")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Glamrig returns by Serviteur de la rune, is blocked for one turn, then becomes playable", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-07-nains");
  const result = await page.evaluate(async () => {
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    const board = player => livingServantCardsForPlayer(player).map(targetSummary);
    resetServants(player1);
    resetServants(player2);
    await summonBatch03Servant(player1, "N000014", {triggerInitiativeEffect:false, ready:true});
    const glamrig = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "N000014");
    const before = targetSummary(glamrig);
    await applyDamage(glamrig, 99);
    await new Promise(resolve => setTimeout(resolve, 1400));
    const returnedIndex = batch03HandIndexForOccurrence(player1, "N000014", before.instance);
    const returnedOccurrence = returnedIndex >= 0 ? batch03HandOccurrenceAt(player1, returnedIndex) : null;
    const blockEntry = returnedIndex >= 0 ? batch03BlockedHandEntry("N000014", player1, returnedIndex) : null;
    const freeSlot = document.querySelector(playerZoneSelector(player1, "servants") + " .slot");
    currentPlayer = player1.key;
    const blockedReplay = await playCard("N000014", freeSlot, {handOccurrenceId:returnedOccurrence, returnActionValidation:true});
    const blockedReplayMessage = document.querySelector("#errMsg")?.textContent || "";
    const handAfterBlockedReplay = [...player1.hand];
    const graveyardAfterBlockedReplay = [...player1.graveyard].map(getRuntimeCardId);
    const boardAfterBlockedReplay = board(player1);
    await endTurnRuntime();
    await endTurnRuntime();
    const freeSlotAfterCooldown = document.querySelector(playerZoneSelector(player1, "servants") + " .slot");
    const replay = await playCard("N000014", freeSlotAfterCooldown, {handOccurrenceId:returnedOccurrence});
    await new Promise(resolve => setTimeout(resolve, 500));
    const boardAfterReplay = board(player1);
    const batch03Events = auditCollectionBatch03Runtime().state.events;
    return {before, returnedIndex, returnedOccurrence, blockEntry, blockedReplay, blockedReplayMessage, handAfterBlockedReplay, graveyardAfterBlockedReplay, boardAfterBlockedReplay, replay, boardAfterReplay, batch03Events};
  });
  expect(result.before.id).toBe("N000014");
  expect(result.returnedIndex).toBeGreaterThanOrEqual(0);
  expect(result.returnedOccurrence).toBe(result.before.instance);
  expect(result.blockEntry).toMatchObject({sourceName:"Serviteur de la rune"});
  expect(result.blockedReplay?.success).toBe(false);
  expect(result.blockedReplay?.reason).toBe("blocked-card");
  expect(result.blockedReplayMessage).toContain("IMPOSSIBLE D'INVOQUER CE SERVITEUR CE TOUR : LA RUNE SE RECHARGE EN PUISSANCE");
  expect(result.handAfterBlockedReplay).toContain("N000014");
  expect(result.graveyardAfterBlockedReplay).not.toContain("N000014");
  expect(result.boardAfterBlockedReplay.map(card => card.id)).not.toContain("N000014");
  expect(result.replay.success).toBe(true);
  expect(result.boardAfterReplay.map(card => card.id)).toContain("N000014");
  expect(result.batch03Events.some(event => event.type === "rune-return-to-hand" && event.cardId === "N000014")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
test("dwarf passives and cost reductions update real stats and requirements", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-07-nains");
  const result = await page.evaluate(async () => {
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    resetServants(player1);
    const venerableSummon = await summonBatch03Servant(player1, "N000003", {triggerInitiativeEffect:false, ready:true});
    const humanSummon = await summonBatch03Servant(player1, "H000001", {triggerInitiativeEffect:false, ready:true});
    syncBatch05Passives();
    syncBatch05Passives();
    const venerableSelf = targetSummary(document.querySelector('.fc[data-instance="' + venerableSummon.instanceId + '"]'));
    const humanBuffed = targetSummary(document.querySelector('.fc[data-instance="' + humanSummon.instanceId + '"]'));
    const dwarfSummon = await summonBatch03Servant(player1, "N000001", {triggerInitiativeEffect:false, ready:true});
    syncBatch05Passives();
    const dwarfAfterArrival = targetSummary(document.querySelector('.fc[data-instance="' + dwarfSummon.instanceId + '"]'));
    document.querySelector('.fc[data-instance="' + venerableSummon.instanceId + '"]').remove();
    syncBatch05Passives();
    const humanAfterRemoval = targetSummary(document.querySelector('.fc[data-instance="' + humanSummon.instanceId + '"]'));
    const dwarfAfterRemoval = targetSummary(document.querySelector('.fc[data-instance="' + dwarfSummon.instanceId + '"]'));

    resetServants(player1);
    const venerableOne = await summonBatch03Servant(player1, "N000003", {triggerInitiativeEffect:false, ready:true});
    const venerableTwo = await summonBatch03Servant(player1, "N000003", {triggerInitiativeEffect:false, ready:true});
    const humanDoubleSummon = await summonBatch03Servant(player1, "H000001", {triggerInitiativeEffect:false, ready:true});
    syncBatch05Passives();
    syncBatch05Passives();
    const multiVenerableOne = targetSummary(document.querySelector('.fc[data-instance="' + venerableOne.instanceId + '"]'));
    const multiVenerableTwo = targetSummary(document.querySelector('.fc[data-instance="' + venerableTwo.instanceId + '"]'));
    const humanDoubleBuffed = targetSummary(document.querySelector('.fc[data-instance="' + humanDoubleSummon.instanceId + '"]'));

    player1.hand = ["N000015"];
    refreshHand(player1);
    const occurrenceId = batch03HandOccurrenceAt(player1, 0);
    const beforeForge = resolveCardCost({player:player1, cardId:"N000015", context:{handOccurrenceId:occurrenceId}}).effectiveCost;
    const forge = resolveBatch07SecretsForge(player1);
    const afterForge = resolveCardCost({player:player1, cardId:"N000015", context:{handOccurrenceId:occurrenceId}}).effectiveCost;

    resetServants(player1);
    await summonBatch03Servant(player1, "N000014", {triggerInitiativeEffect:false, ready:true});
    player1.hand = ["N000015"];
    refreshHand(player1);
    const glamrigOccurrence = batch03HandOccurrenceAt(player1, 0);
    const beforeGlamrig = resolveCardCost({player:player1, cardId:"N000015", context:{handOccurrenceId:glamrigOccurrence}}).effectiveCost;
    const glamrig = resolveBatch07EndTurnEffects(player1);
    const afterGlamrig = resolveCardCost({player:player1, cardId:"N000015", context:{handOccurrenceId:glamrigOccurrence}}).effectiveCost;
    return {baseHumanAtk:CARDS_DATA.H000001.atk, baseDwarfAtk:CARDS_DATA.N000001.atk, baseVenerableAtk:CARDS_DATA.N000003.atk, venerableSelf, humanBuffed, dwarfAfterArrival, humanAfterRemoval, dwarfAfterRemoval, multiVenerableOne, multiVenerableTwo, humanDoubleBuffed, beforeForge, afterForge, forge, beforeGlamrig, afterGlamrig, glamrig};
  });
  expect(result.venerableSelf.atk).toBe(result.baseVenerableAtk);
  expect(result.humanBuffed.atk).toBe(result.baseHumanAtk + 2);
  expect(result.dwarfAfterArrival.atk).toBe(result.baseDwarfAtk + 2);
  expect(result.humanAfterRemoval.atk).toBe(result.baseHumanAtk);
  expect(result.dwarfAfterRemoval.atk).toBe(result.baseDwarfAtk);
  expect(result.multiVenerableOne.atk).toBe(result.baseVenerableAtk + 2);
  expect(result.multiVenerableTwo.atk).toBe(result.baseVenerableAtk + 2);
  expect(result.humanDoubleBuffed.atk).toBe(result.baseHumanAtk + 4);
  expect(result.afterForge.total).toBe(result.beforeForge.total - 1);
  expect(requirementAmount(result.afterForge, "selene")).toBe(requirementAmount(result.beforeForge, "selene") - 1);
  expect(result.afterGlamrig.total).toBe(result.beforeGlamrig.total - 2);
  expect(requirementAmount(result.afterGlamrig, "selene")).toBe(requirementAmount(result.beforeGlamrig, "selene") - 2);
  expect(result.glamrig.applied).toBe(1);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("dwarf combat covers reduction, priest healing, Glamrig adjacency and stone guardian Vengeance", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-07-nains");
  const result = await page.evaluate(async () => {
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
    await new Promise(resolve => setTimeout(resolve, 900));
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
  });
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
