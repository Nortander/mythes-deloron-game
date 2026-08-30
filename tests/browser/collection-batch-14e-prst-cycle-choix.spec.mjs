import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource/i.test(message));
}
async function open14EScenario(page, cardId, mode="auto") {
  const scenario = "collection-batch-14b-" + cardId.toLowerCase() + "-core-visual";
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch14e=" + mode + "&t=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout:20000});
  await page.waitForTimeout(150);
}

test("Batch 14E PRST000003 Nor replays end-turn servant effects once", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14EScenario(page, "PRST000003");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const play = await playCard("PRST000003", null, {returnValidation:true});
    syncBatch14EPrstFavorEffects();
    const source = findBoardCard(player1, "H000020");
    const text = batch03DynamicStatusTexts(source);
    const beforeWolves = livingServantCardsForPlayer(player1).filter(fc => fc.dataset.id === "H000021").length;
    await applyBatch03EndTurnAbilities(player1);
    const afterNormal = livingServantCardsForPlayer(player1).filter(fc => fc.dataset.id === "H000021").length;
    const extra = await resolveBatch14EEndTurnEffects(player1);
    const afterNor = livingServantCardsForPlayer(player1).filter(fc => fc.dataset.id === "H000021").length;
    return {play, text, beforeWolves, afterNormal, afterNor, extra, events:window.__collectionBatch14E?.events || []};
  });
  expect(result.play.success).toBe(true);
  expect(result.play.spellRemovedFromGame).toBe(true);
  expect(result.text).toContain("*Bénéficie de la Faveur de Nor* : ses effets de fin de tour se résolvent une deuxième fois.");
  expect(result.afterNormal - result.beforeWolves).toBe(1);
  expect(result.afterNor - result.afterNormal).toBe(1);
  expect(result.extra.nor.success).toBe(true);
  expect(result.events.some(event => event.type === "nor-end-turn-replay")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14E PRST000010 Tiara prevents attack and counter but preserves abilities until owner turn end", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14EScenario(page, "PRST000010");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const play = await playCard("PRST000010", null, {returnValidation:true});
    collectionBatch14EState().autoResolveChoices = true;
    const start = await resolveBatch14EStartTurnEffects(player1);
    const target = document.querySelector('.fc[data-instance="' + start.target.instance + '"]');
    const text = batch03DynamicStatusTexts(target);
    currentPlayer = player2.key;
    tryAttack(target);
    const canUseAbility = canResolveServantAbility(target, {triggerType:"start-turn"});
    const attacker = findBoardCard(player1, "H000001");
    currentPlayer = player1.key;
    const beforePdv = Number(attacker.dataset.pdv || 0);
    await resolveCombat(attacker, target);
    const afterPdv = Number(attacker.dataset.pdv || 0);
    turnSequence += 1;
    const expired = await resolveBatch14EEndTurnEffects(player2);
    return {play, start, text, attackSelected:target.classList.contains("fc-attacking"), canUseAbility, beforePdv, afterPdv, entravedAfter:isBatch14ETiaraEntraved(target), events:window.__collectionBatch14E?.events || [], expired};
  });
  expect(result.play.success).toBe(true);
  expect(result.start.success).toBe(true);
  expect(result.text).toContain("*Entravé par la Faveur de Tiara* : ne peut ni attaquer ni riposter jusqu'à la fin de son prochain tour. Ses capacités restent utilisables.");
  expect(result.attackSelected).toBe(false);
  expect(result.canUseAbility).toBe(true);
  expect(result.afterPdv).toBe(result.beforePdv);
  expect(result.entravedAfter).toBe(false);
  expect(result.events.some(event => event.type === "tiara-entrave-applied")).toBe(true);
  expect(result.events.some(event => event.type === "tiara-entrave-expired")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14E PRST000011 Ulm balances avatar HP with stable floor-ceil rounding", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14EScenario(page, "PRST000011");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const play = await playCard("PRST000011", null, {returnValidation:true});
    const before = {p1:avatarHitPoints(player1), p2:avatarHitPoints(player2), p1Servants:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id), p2Servants:livingServantCardsForPlayer(player2).map(fc => fc.dataset.id)};
    const balance = await resolveBatch14EEndTurnEffects(player1);
    const after = {p1:avatarHitPoints(player1), p2:avatarHitPoints(player2)};
    return {play, before, after, balance, events:window.__collectionBatch14E?.events || []};
  });
  expect(result.play.success).toBe(true);
  expect(result.before.p1).toBe(7);
  expect(result.before.p2).toBe(28);
  expect(result.before.p1Servants).toEqual(["DIV000012"]);
  expect(result.before.p2Servants).toEqual([]);
  expect(result.after).toEqual({p1:17, p2:18});
  expect(result.balance.ulm.rounding).toBe("floor-ceil-total-preserved-lower-hp-receives-floor");
  expect(result.events.some(event => event.type === "ulm-avatar-balance")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14E PRST000012 Zerbo discards one own card and steals up to two random opponent cards", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14EScenario(page, "PRST000012");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const play = await playCard("PRST000012", null, {returnValidation:true});
    collectionBatch14EState().autoResolveChoices = true;
    collectionBatch14EState().randomQueue = [0, 0.5];
    const before = {hand:[...player1.hand], graveyard:[...player1.graveyard], opponentTotal:player2.hand.length + player2.drawPile.length + player2.graveyard.length};
    const zerbo = await resolveBatch14EEndTurnEffects(player1);
    const after = {hand:[...player1.hand], graveyard:[...player1.graveyard], opponentTotal:player2.hand.length + player2.drawPile.length + player2.graveyard.length};
    return {play, before, after, zerbo, events:window.__collectionBatch14E?.events || []};
  });
  expect(result.play.success).toBe(true);
  expect(result.zerbo.zerbo.success).toBe(true);
  expect(result.zerbo.zerbo.discarded).toBe("H000001");
  expect(result.zerbo.zerbo.stolenCount).toBe(2);
  expect(result.after.graveyard).toContain("H000001");
  expect(result.after.hand.length).toBe(result.before.hand.length + 1);
  expect(result.after.opponentTotal).toBe(result.before.opponentTotal - 2);
  expect(result.events.some(event => event.type === "zerbo-discard-and-steal" && event.stolenCount === 2)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14E PRST000013 Kerona grants a deterministic extra turn without chaining", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14EScenario(page, "PRST000013");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    activePlayer = player1;
    const play = await playCard("PRST000013", null, {returnValidation:true});
    collectionBatch14EState().randomQueue = [0.2, 0.8];
    await endTurn();
    const afterSuccess = {currentPlayer, activePlayer:activePlayer.key, noChain:!!player1.batch14eKeronaNoChainNextCheck};
    await endTurn();
    const afterNoChain = {currentPlayer, activePlayer:activePlayer.key, noChain:!!player1.batch14eKeronaNoChainNextCheck};
    const directFailure = await resolveBatch14EKeronaEndTurn(player1);
    return {play, afterSuccess, afterNoChain, directFailure, events:window.__collectionBatch14E?.events || []};
  });
  expect(result.play.success).toBe(true);
  expect(result.afterSuccess.currentPlayer).toBe("player1");
  expect(result.afterSuccess.activePlayer).toBe("player1");
  expect(result.afterSuccess.noChain).toBe(true);
  expect(result.afterNoChain.currentPlayer).toBe("player2");
  expect(result.afterNoChain.noChain).toBe(false);
  expect(result.directFailure.extraTurn).toBe(false);
  expect(result.events.some(event => event.type === "kerona-extra-turn-success")).toBe(true);
  expect(result.events.some(event => event.type === "kerona-no-chain-skip")).toBe(true);
  expect(result.events.some(event => event.type === "kerona-extra-turn-failure")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

