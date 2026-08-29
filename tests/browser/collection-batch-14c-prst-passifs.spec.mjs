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
    const beforeCandidates = batch14CNiethalfCandidates(player1).slice(0, 5).map(item => ({cardId:item.cardId, index:item.index, cost:item.cost}));
    const play = await playCard("PRST000008", null, {returnValidation:true});
    const marked = player1.drawPile.map((entry, index) => ({entry, index, cardId:getRuntimeCardId(entry)})).filter(item => item.entry?.batch07RuneServant).map(item => ({cardId:item.cardId, index:item.index, source:item.entry.batch07SourceCardId, niethalf:item.entry.batch14cNiethalfRune === true, addedKeywords:item.entry.batch14cAddedKeywords || []}));
    player1.drawPile = player1.drawPile.filter(entry => entry?.batch07RuneServant).slice(0, 1);
    const draw = drawCardFromDeck(player1, () => true, {refresh:true, sourceCardId:"collection-batch-14c-niethalf-test"});
    const handSlot = document.querySelector(playerZoneSelector(player1, "hand") + ' .hc[data-id="' + draw.cardId + '"]');
    const occurrenceId = handSlot?.dataset?.handOccurrence || batch03HandOccurrenceAt(player1, player1.hand.findIndex(item => getRuntimeCardId(item) === draw.cardId));
    const handTooltips = buildPreviewKeywordTooltips(draw.cardId, {sourceElement:handSlot});
    const boardSlot = document.querySelector(playerZoneSelector(player1, "servants") + " .slot");
    const summon = await playCard(draw.cardId, boardSlot, {returnValidation:true, handOccurrenceId:occurrenceId});
    syncBatch14CPrstFavorEffects();
    const runeBoard = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === draw.cardId && fc.dataset.batch07RuneServant === "1");
    const summaryBeforeDeath = targetSummary(runeBoard);
    const boardTexts = batch03DynamicStatusTexts(runeBoard);
    await applyDamage(runeBoard, 99);
    return {play, beforeCandidates, marked, draw, summon, handTooltips, boardTexts, summaryBeforeDeath, handAfterDeath:[...player1.hand], graveyardAfterDeath:[...player1.graveyard], events:window.__collectionBatch14C?.events || []};
  });
  expect(result.play.success).toBe(true);
  expect(result.beforeCandidates.slice(0, 3)).toEqual([
    {cardId:"N000010", index:9, cost:6},
    {cardId:"N000002", index:8, cost:6},
    {cardId:"N000010", index:7, cost:6}
  ]);
  expect(result.marked).toEqual([
    {cardId:"N000010", index:7, source:"PRST000008", niethalf:true, addedKeywords:["Serviteur de la rune"]},
    {cardId:"N000002", index:8, source:"PRST000008", niethalf:true, addedKeywords:["Serviteur de la rune"]},
    {cardId:"N000010", index:9, source:"PRST000008", niethalf:true, addedKeywords:["Serviteur de la rune"]}
  ]);
  expect(result.events.some(event => event.type === "niethalf-deck-halo")).toBe(true);
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
    return {play, normal:targetSummary(normal), similar:targetSummary(similar), textNormal, renderedNormal, textSimilar, beforePdv, afterPdv:Number(target.dataset.pdv || 0), baseAtk, plan:JSON.parse(normal.dataset.batch05CombatPlan || '{}'), events:window.__collectionBatch14C?.events || []};
  });
  expect(result.play.success).toBe(true);
  expect(result.normal.batch14cShannaFavor).toBe(true);
  expect(result.textNormal).toContain("*Bénéficie de la Faveur de Shanna* : a *25%* de chances d'infliger le double de ses dégâts à chaque attaque.");
  expect(result.renderedNormal).toMatch(/<strong class="kv"[^>]*>Bénéficie de la Faveur de Shanna<\/strong>[\s\u00a0]*:[\s\u00a0]*a <strong class="kv"[^>]*>25%<\/strong>/);
  expect(result.renderedNormal).not.toMatch(/<strong class="kv"[^>]*>[^<]*double de ses dégâts[^<]*<\/strong>/);
  expect(result.similar.batch14cShannaFavor).toBe(false);
  expect(result.textSimilar).not.toContain("*Bénéficie de la Faveur de Shanna*");
  expect(result.afterPdv).toBe(result.beforePdv - result.baseAtk * 2);
  expect(result.events.some(event => event.type === "shanna-critical-hit")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
