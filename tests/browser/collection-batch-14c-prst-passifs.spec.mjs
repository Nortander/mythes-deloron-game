import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource/i.test(message));
}
async function open14CScenario(page, cardId) {
  const scenario = "collection-batch-14b-" + cardId.toLowerCase() + "-core-visual";
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch14c=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout:20000});
  await page.waitForTimeout(150);
}

test("Batch 14C PRST000002 Elen fixes superscript, supply tooltip, green production and stable servant slots", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14CScenario(page, "PRST000002");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const previewHtml = buildCanonicalCardPreview("PRST000002", {sourceType:"test"});
    const zone = document.querySelector(playerZoneSelector(player1, "servants"));
    const baseBefore = Array.from(zone.children).map((node, index) => {
      node.dataset.batch14cBaseIndex = String(index);
      const rect = node.getBoundingClientRect();
      return {index, left:Math.round(rect.left), width:Math.round(rect.width), height:Math.round(rect.height)};
    });
    const supply = player1.supplies[0];
    const rawBefore = compactProductionVector(supply.currentProduction);
    const effectiveBefore = batch14CEffectiveSupplyProduction(player1, supply);
    const resourcesBefore = {...player1.resourceState.classical};
    const play = await playCard("PRST000002", null, {returnValidation:true});
    await new Promise(resolve => setTimeout(resolve, 760));
    const extraSlots = Array.from(zone.querySelectorAll(".batch14c-elen-extra-slot"));
    const baseAfter = Array.from(zone.querySelectorAll('[data-batch14c-base-index]')).map(node => {
      const rect = node.getBoundingClientRect();
      return {index:Number(node.dataset.batch14cBaseIndex), left:Math.round(rect.left), width:Math.round(rect.width), height:Math.round(rect.height)};
    }).sort((a, b) => a.index - b.index);
    const supplyElement = document.querySelector(playerZoneSelector(player1, "appro") + " .fc[data-type='appro']");
    const runtimeModel = getRuntimeCardDisplayModel(supplyElement?.dataset.id, player1, {sourceElement:supplyElement});
    const tooltips = buildCanonicalCardTooltips(runtimeModel, "preview").right;
    const tooltipHtml = buildPreviewKeywordTooltips(supplyElement?.dataset.id, {sourceElement:supplyElement});
    const elenTooltip = tooltips.find(tip => tip.title === "FAVEUR D'ELEN");
    const resNumber = supplyElement?.querySelector(".fc-res-num");
    const resColor = resNumber ? getComputedStyle(resNumber).color : "";
    return {play, previewHtml, rawBefore, effectiveBefore, effectiveAfter:batch14CEffectiveSupplyProduction(player1, supply), resourcesBefore, resourcesAfter:{...player1.resourceState.classical}, baseBefore, baseAfter, extraSlots:extraSlots.map(slot => slot.dataset.batch14cElenSlot), elenTooltip, tooltipHtml, tooltipTitles:tooltips.map(tip => tip.title), boosted:supplyElement?.dataset.batch14cElenProduction, resColor, events:window.__collectionBatch14C?.events || []};
  });
  expect(result.play.success).toBe(true);
  expect(result.play.spellRemovedFromGame).toBe(true);
  expect(result.previewHtml).toContain("7<sup>ème</sup>");
  expect(result.previewHtml).toContain("8<sup>ème</sup>");
  expect(result.previewHtml).not.toContain("&lt;sup&gt;");
  expect(result.effectiveBefore).toEqual(result.rawBefore);
  for (const [key, value] of Object.entries(result.rawBefore)) {
    expect(result.effectiveAfter[key], key).toBe(value * 2);
    expect(result.resourcesAfter[key], key).toBe(result.resourcesBefore[key] * 2);
  }
  expect(result.boosted).toBe("1");
  expect(result.resColor).toBe("rgb(80, 232, 112)");
  expect(result.extraSlots.sort()).toEqual(["left", "right"]);
  expect(result.baseAfter).toHaveLength(result.baseBefore.length);
  for (const before of result.baseBefore) {
    const after = result.baseAfter.find(item => item.index === before.index);
    expect(after).toBeTruthy();
    expect(Math.abs(after.left - before.left), "base slot " + before.index + " left shift").toBeLessThanOrEqual(1);
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
  }
  expect(result.tooltipTitles).toContain("FAVEUR D'ELEN");
  expect(result.tooltipHtml).toMatch(/FAVEUR D(?:'|&#39;)ELEN/);
  expect(result.elenTooltip.body).toBe("Elen vous accorde l'abondance et accroît le rendement de toutes vos cartes d'approvisionnement.");
  expect(result.events.some(event => event.type === "elen-extra-slots-created")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14C PRST000005 Mugwa fixes present/future Troll costs and restores canonical launch message", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14CScenario(page, "PRST000005");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const beforeHand = resolveCardCost({player:player1, cardId:"TRL000019"})?.effectiveCost;
    const play = await playCard("PRST000005", null, {returnValidation:true});
    const message = document.querySelector("#notif")?.textContent || "";
    const present = resolveCardCost({player:player1, cardId:"TRL000019"})?.effectiveCost;
    player1.drawPile = ["H000001", "TRL000016"];
    const draw = drawCardFromDeck(player1, () => true, {refresh:true, sourceCardId:"collection-batch-14c-mugwa-test"});
    const future = resolveCardCost({player:player1, cardId:"TRL000016"})?.effectiveCost;
    const human = resolveCardCost({player:player1, cardId:"H000001"})?.effectiveCost;
    return {play, draw, message, beforeHand, present, future, human, modifierIds:(player1.costModifierState?.active || []).map(modifier => modifier.id)};
  });
  expect(result.play.success).toBe(true);
  expect(result.message).toContain("Mugwa remplit le ventre de ses enfants ! Trolls, plus faim !");
  expect(result.present.total).toBe(3);
  expect(result.future.total).toBe(3);
  expect(result.present.requirements.some(req => req.resource === "nourriture")).toBe(false);
  expect(result.future.requirements.some(req => req.resource === "nourriture")).toBe(false);
  expect(result.beforeHand.total).not.toBe(3);
  expect(result.human.total).not.toBe(3);
  expect(result.draw.cardId).toBe("TRL000016");
  expect(result.modifierIds).toContain("player1-batch14c-mugwa");
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14C PRST000008 Niethalf marks the three costliest nearest deck servants as visible Rune servants", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14CScenario(page, "PRST000008");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    player1.drawPile = ["N000001", "N000002", "N000002", "N000010", "N000003", "N000010", "PRST000008"];
    const beforeCandidates = batch14CNiethalfCandidates(player1).slice(0, 6).map(item => ({cardId:item.cardId, index:item.index, cost:item.cost, occurrenceKey:item.occurrenceKey || null}));
    const initialN000002OccurrenceKeys = player1.drawPile.map((entry, index) => ({entry, index, cardId:getRuntimeCardId(entry)})).filter(item => item.cardId === "N000002").map(item => item.entry?.batch14cDeckOccurrenceKey || item.entry?.occurrenceId || null);
    const play = await playCard("PRST000008", null, {returnValidation:true});
    const marked = player1.drawPile.map((entry, index) => ({entry, index, cardId:getRuntimeCardId(entry)})).filter(item => item.entry?.batch07RuneServant).map(item => ({cardId:item.cardId, index:item.index, source:item.entry.batch07SourceCardId, niethalf:item.entry.batch14cNiethalfRune === true, occurrenceKey:item.entry.batch14cOccurrenceKey || null, deckOccurrenceKey:item.entry.batch14cDeckOccurrenceKey || null, sourceIndex:item.entry.batch14cNiethalfSourceIndex, addedKeywords:item.entry.batch14cAddedKeywords || []}));
    const markedEntriesForDraw = player1.drawPile.filter(entry => entry?.batch07RuneServant);
    const unmarkedDuplicateIndexes = player1.drawPile.map((entry, index) => ({entry, index, cardId:getRuntimeCardId(entry)})).filter(item => item.cardId === "N000002" && !item.entry?.batch07RuneServant).map(item => item.index);
    const unmarkedDuplicateEntry = player1.drawPile[unmarkedDuplicateIndexes[0]];
    const haloDeck = document.querySelector(playerSelectors(player1).deckBack);
    const haloVariant = haloDeck?.dataset.batch14cNiethalfHaloVariant || "";
    const roundedRadius = haloDeck ? getComputedStyle(haloDeck).borderRadius : "";
    const activationEventsBeforeTurnCycle = (window.__collectionBatch14C?.events || []).filter(event => event.type === "niethalf-activated").length;
    await endTurn();
    await endTurn();
    const eventsAfterTurnCycle = window.__collectionBatch14C?.events || [];
    const haloEventsAfterTurnCycle = eventsAfterTurnCycle.filter(event => event.type === "niethalf-deck-halo").length;
    const activationEventsAfterTurnCycle = eventsAfterTurnCycle.filter(event => event.type === "niethalf-activated").length;
    const duplicateIgnoredEvents = eventsAfterTurnCycle.filter(event => event.type === "niethalf-duplicate-activation-ignored");
    const markedAfterTurnCycle = player1.drawPile.filter(entry => entry?.batch07RuneServant).length;
    const lastPrstActivationAfterTurnCycle = window.__lastPrstActivation || null;
    player1.drawPile = [unmarkedDuplicateEntry];
    const unmarkedDraw = drawCardFromDeck(player1, () => true, {refresh:true, sourceCardId:"collection-batch-14c-niethalf-unmarked-duplicate-test"});
    const unmarkedOccurrenceId = batch03HandOccurrenceAt(player1, player1.hand.length - 1);
    const unmarkedHandSlot = document.querySelector(playerZoneSelector(player1, "hand") + ' .hc[data-hand-occurrence="' + unmarkedOccurrenceId + '"]');
    const unmarkedHandTooltips = buildPreviewKeywordTooltips(unmarkedDraw.cardId, {sourceElement:unmarkedHandSlot});
    const unmarkedBoardSlot = document.querySelector(playerZoneSelector(player1, "servants") + " .slot");
    const unmarkedSummon = await playCard(unmarkedDraw.cardId, unmarkedBoardSlot, {returnValidation:true, handOccurrenceId:unmarkedOccurrenceId});
    syncBatch14CPrstFavorEffects();
    const unmarkedBoard = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === unmarkedDraw.cardId && fc.dataset.batch07RuneServant !== "1");
    player1.drawPile = markedEntriesForDraw.slice(0, 1);
    const draw = drawCardFromDeck(player1, () => true, {refresh:true, sourceCardId:"collection-batch-14c-niethalf-test"});
    const occurrenceId = batch03HandOccurrenceAt(player1, player1.hand.length - 1);
    const handSlot = document.querySelector(playerZoneSelector(player1, "hand") + ' .hc[data-hand-occurrence="' + occurrenceId + '"]');
    const handTooltips = buildPreviewKeywordTooltips(draw.cardId, {sourceElement:handSlot});
    const boardSlot = document.querySelector(playerZoneSelector(player1, "servants") + " .slot");
    const summon = await playCard(draw.cardId, boardSlot, {returnValidation:true, handOccurrenceId:occurrenceId});
    syncBatch14CPrstFavorEffects();
    const runeBoard = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === draw.cardId && fc.dataset.batch07RuneServant === "1");
    const summaryBeforeDeath = targetSummary(runeBoard);
    const boardTexts = batch03DynamicStatusTexts(runeBoard);
    await applyDamage(runeBoard, 99);
    return {play, beforeCandidates, initialN000002OccurrenceKeys, marked, unmarkedDuplicateIndexes, haloVariant, roundedRadius, activationEventsBeforeTurnCycle, haloEventsAfterTurnCycle, activationEventsAfterTurnCycle, duplicateIgnoredEvents, markedAfterTurnCycle, lastPrstActivationAfterTurnCycle, unmarkedDraw, unmarkedSummon, unmarkedHandTooltips, unmarkedBoardSummary:targetSummary(unmarkedBoard), draw, summon, handTooltips, boardTexts, summaryBeforeDeath, handAfterDeath:[...player1.hand], graveyardAfterDeath:[...player1.graveyard], events:window.__collectionBatch14C?.events || []};
  });
  expect(result.play.success).toBe(true);
  expect(result.beforeCandidates.slice(0, 3)).toEqual([
    expect.objectContaining({cardId:"N000010", index:5, cost:6}),
    expect.objectContaining({cardId:"N000010", index:3, cost:6}),
    expect.objectContaining({cardId:"N000002", index:2, cost:6})
  ]);
  expect(result.initialN000002OccurrenceKeys).toHaveLength(2);
  expect(new Set(result.initialN000002OccurrenceKeys).size).toBe(2);
  expect(result.marked).toHaveLength(3);
  expect(result.marked).toEqual([
    expect.objectContaining({cardId:"N000002", index:2, source:"PRST000008", niethalf:true, sourceIndex:2, addedKeywords:["Serviteur de la rune"]}),
    expect.objectContaining({cardId:"N000010", index:3, source:"PRST000008", niethalf:true, sourceIndex:3, addedKeywords:["Serviteur de la rune"]}),
    expect.objectContaining({cardId:"N000010", index:5, source:"PRST000008", niethalf:true, sourceIndex:5, addedKeywords:["Serviteur de la rune"]})
  ]);
  expect(new Set(result.marked.map(item => item.occurrenceKey)).size).toBe(3);
  expect(result.unmarkedDuplicateIndexes).toEqual([1]);
  expect(result.events.filter(event => event.type === "niethalf-deck-halo")).toHaveLength(1);
  expect(result.activationEventsBeforeTurnCycle).toBe(1);
  expect(result.haloEventsAfterTurnCycle).toBe(1);
  expect(result.activationEventsAfterTurnCycle).toBe(1);
  expect(result.duplicateIgnoredEvents).toHaveLength(1);
  expect(result.markedAfterTurnCycle).toBe(3);
  expect(result.lastPrstActivationAfterTurnCycle?.duplicateIgnored).toBe(true);
  expect(result.haloVariant).toBe("soft-rounded");
  expect(parseFloat(result.roundedRadius)).toBeGreaterThanOrEqual(20);
  expect(result.unmarkedDraw.cardId).toBe("N000002");
  expect(result.unmarkedSummon.success).toBe(true);
  expect(result.unmarkedHandTooltips).not.toContain("Serviteur de la rune");
  expect(result.unmarkedBoardSummary.runeServant).toBe(false);
  expect(result.handTooltips).toContain("Serviteur de la rune");
  expect(result.boardTexts).toContain("Bénéficie de [Serviteur de la rune].");
  expect(result.summaryBeforeDeath.runeServant).toBe(true);
  expect(result.handAfterDeath).toContain(result.draw.cardId);
  expect(result.graveyardAfterDeath).not.toContain(result.draw.cardId);
  expect(result.events.some(event => event.type === "niethalf-deck-halo")).toBe(true);
  expect(result.events.some(event => event.type === "niethalf-activated" && event.selected.length === 3)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14C PRST000009 Shanna highlights only the exact dynamic text segments and keeps non-cumul critical chance", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14CScenario(page, "PRST000009");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const extraSimilar = await summonBatch03Servant(player1, "EDB000003", {triggerInitiativeEffect:false, ready:true});
    const similarCard = document.querySelector('.fc[data-instance="' + extraSimilar.instanceId + '"]');
    collectionBatch14CState().randomQueue = [0.1];
    window.__collectionBatch14CRandomQueue = [0.1];
    const play = await playCard("PRST000009", null, {returnValidation:true});
    syncBatch14CPrstFavorEffects();
    const normal = findBoardCard(player1, "H000001");
    const similar = similarCard;
    const target = findBoardCard(player2, "MV000001");
    const textNormal = batch03DynamicStatusTexts(normal);
    const renderedNormal = fmtDesc(formatPlayerFacingCardText(textNormal[0] || ""), facColor(CARDS_DATA[normal.dataset.id].fac));
    const textSimilar = batch03DynamicStatusTexts(similar);
    const beforePdv = Number(target.dataset.pdv);
    const baseAtk = Number(normal.dataset.atk);
    await resolveCombat(normal, target);
    const afterCriticalPdv = Number(target.dataset.pdv || 0);
    const events = window.__collectionBatch14C?.events || [];
    const feedbackIndex = events.findIndex(event => event.type === "shanna-critical-feedback-before-damage");
    const damageIndex = events.findIndex(event => event.type === "shanna-critical-damage-resolve");
    const criticalIndex = events.findIndex(event => event.type === "shanna-critical-hit");
    const feedbackEvent = events[feedbackIndex] || null;
    const damageEvent = events[damageIndex] || null;
    const eventAfterFeedback = events[feedbackIndex + 1]?.type || null;
    collectionBatch14CState().randomQueue = [0.9];
    window.__collectionBatch14CRandomQueue = [0.9];
    const missTarget = findBoardCard(player2, "MV000002") || target;
    await resolveCombat(normal, missTarget);
    const eventsAfterMiss = window.__collectionBatch14C?.events || [];
    const criticalFeedbackCount = eventsAfterMiss.filter(event => event.type === "shanna-critical-feedback-before-damage").length;
    const criticalDamageCount = eventsAfterMiss.filter(event => event.type === "shanna-critical-damage-resolve").length;
    return {play, normal:targetSummary(normal), similar:targetSummary(similar), textNormal, renderedNormal, textSimilar, beforePdv, afterCriticalPdv, afterPdv:Number(target.dataset.pdv || 0), baseAtk, feedbackIndex, damageIndex, criticalIndex, feedbackEvent, damageEvent, eventAfterFeedback, criticalFeedbackCount, criticalDamageCount, normalLastPulse:normal.dataset.batch03LastPulseReason || '', similarLastPulse:similar.dataset.batch03LastPulseReason || '', plan:JSON.parse(normal.dataset.batch05CombatPlan || '{}'), events:eventsAfterMiss};
  });
  expect(result.play.success).toBe(true);
  expect(result.normal.batch14cShannaFavor).toBe(true);
  expect(result.textNormal).toContain("*Bénéficie de la Faveur de Shanna* : a *25%* de chances d'infliger le double de ses dégâts à chaque attaque.");
  expect(result.renderedNormal).toMatch(/<strong class="kv"[^>]*>Bénéficie de la Faveur de Shanna<\/strong>[\s\u00a0]*:[\s\u00a0]*a <strong class="kv"[^>]*>25%<\/strong>/);
  expect(result.renderedNormal).not.toMatch(/<strong class="kv"[^>]*>[^<]*double de ses dégâts[^<]*<\/strong>/);
  expect(result.similar.batch14cShannaFavor).toBe(false);
  expect(result.textSimilar).not.toContain("*Bénéficie de la Faveur de Shanna*");
  expect(result.feedbackIndex).toBeGreaterThan(result.criticalIndex);
  expect(result.eventAfterFeedback).toBe("shanna-critical-damage-resolve");
  expect(result.damageIndex).toBe(result.feedbackIndex + 1);
  expect(result.feedbackEvent.phase).toBe("immediate-before-damage");
  expect(result.feedbackEvent.targetPdvBefore).toBe(result.beforePdv);
  expect(result.damageEvent.targetPdvBefore).toBe(result.beforePdv);
  expect(result.afterCriticalPdv).toBe(result.beforePdv - result.baseAtk * 2);
  expect(result.normalLastPulse).toBe("batch14c-shanna-critical");
  expect(result.similarLastPulse).not.toBe("batch14c-shanna-critical");
  expect(result.criticalFeedbackCount).toBe(1);
  expect(result.criticalDamageCount).toBe(1);
  expect(result.events.some(event => event.type === "shanna-critical-hit")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
