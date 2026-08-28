import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource/i.test(message));
}
async function open14DScenario(page, cardId) {
  const scenario = "collection-batch-14b-" + cardId.toLowerCase() + "-core-visual";
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch14d=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout:20000});
  await page.waitForTimeout(150);
}

test("Batch 14D PRST000001 Aonir marks human servants and applies Divine Wrath to damaged undead", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14DScenario(page, "PRST000001");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const play = await playCard("PRST000001", null, {returnValidation:true});
    syncBatch14DPrstFavorEffects();
    const human = findBoardCard(player1, "H000001");
    const undead = findBoardCard(player2, "MV000001");
    const beforeSouls = Number(player2.resourceState.souls || 0);
    const text = batch03DynamicStatusTexts(human);
    const wrath = batch14DApplyAonirWrathOnCombatDamage(human, undead, {damageDealt:1, targetDied:false, phase:"attack"});
    undead.dataset.batch03DivineWrathNextDamage = "20";
    const startTurn = {divineWrath:[], divineWrathEchoDrain:[]};
    await resolveBatch03DivineWrathStartTurn(player2, startTurn);
    return {
      play,
      text,
      blessing: human.dataset.batch14dAonirBlessing,
      wrath,
      wrathTurns: undead.dataset.batch03DivineWrathTurns || null,
      beforeSouls,
      afterSouls: Number(player2.resourceState.souls || 0),
      graveyard: [...player2.graveyard],
      startTurn,
      events: window.__collectionBatch14D?.events || []
    };
  });
  expect(result.play.success).toBe(true);
  expect(result.play.spellRemovedFromGame).toBe(true);
  expect(result.blessing).toBe("1");
  expect(result.text).toContain("Bénéficie de la Faveur d'Aonir : inflige [Colère Divine] aux morts-vivants qu'il rencontre. Peut parfois détruire des Échos.");
  expect(result.wrath.success).toBe(true);
  expect(result.wrath.sourceCardId).toBe("PRST000001");
  expect(result.graveyard).toContain("MV000001");
  expect(result.afterSouls).toBe(result.beforeSouls - 1);
  expect(result.events.some(event => event.type === "aonir-divine-wrath-echo-drain")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14D PRST000004 Zarrach replaces a destroyed allied servant with same-cost Orc/Goblin/Troll", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14DScenario(page, "PRST000004");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const play = await playCard("PRST000004", null, {returnValidation:true});
    syncBatch14DPrstFavorEffects();
    const victim = findBoardCard(player1, "H000001");
    const deadCost = Number(CARDS_DATA[victim.dataset.id].cost);
    const beforeHand = [...player1.hand];
    await applyDamage(victim, 99);
    const added = player1.hand.find(id => !beforeHand.includes(id));
    const card = CARDS_DATA[added] || null;
    return {play, beforeHand, afterHand:[...player1.hand], added, card, deadCost, events:window.__collectionBatch14D?.events || []};
  });
  expect(result.play.success).toBe(true);
  expect(result.afterHand.length).toBe(result.beforeHand.length + 1);
  expect(result.added).toBeTruthy();
  expect(result.card.type).toBe("Serviteur");
  expect(["orc", "gob", "trl"]).toContain(result.card.fac);
  expect(Number(result.card.cost)).toBe(result.deadCost);
  expect(result.events.some(event => event.type === "zarrach-servant-death-replacement" && event.success)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14D PRST000006 Éréon draws two cards for the favor owner after opponent draw without recursion", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14DScenario(page, "PRST000006");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const play = await playCard("PRST000006", null, {returnValidation:true});
    player1.hand = [];
    player1.drawPile = ["H000001", "H000002", "H000003"];
    player2.hand = [];
    player2.drawPile = ["H000005"];
    renderAllHands();
    const before = {p1Hand:player1.hand.length, p1Deck:player1.drawPile.length, p2Hand:player2.hand.length, p2Deck:player2.drawPile.length};
    const opponentDraw = drawCardFromDeck(player2, () => true, {refresh:true, sourceCardId:"collection-batch-14d-test"});
    await new Promise(resolve => setTimeout(resolve, 1150));
    return {play, opponentDraw, before, after:{p1Hand:player1.hand.length, p1Deck:player1.drawPile.length, p2Hand:player2.hand.length, p2Deck:player2.drawPile.length, p1HandIds:[...player1.hand], p2HandIds:[...player2.hand]}, events:window.__collectionBatch14D?.events || []};
  });
  expect(result.play.success).toBe(true);
  expect(result.opponentDraw.success).toBe(true);
  expect(result.after.p2Hand).toBe(result.before.p2Hand + 1);
  expect(result.after.p1Hand).toBe(result.before.p1Hand + 2);
  expect(result.after.p1Deck).toBe(result.before.p1Deck - 2);
  expect(result.events.filter(event => event.type === "ereon-bonus-draw")).toHaveLength(2);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14D PRST000007 Hirin bypasses Rempart and curses enemy servants against their own avatar", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14DScenario(page, "PRST000007");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const play = await playCard("PRST000007", null, {returnValidation:true});
    syncBatch14DPrstFavorEffects();
    const ally = findBoardCard(player1, "H000001");
    const enemy = findBoardCard(player2, "MV000007");
    const textAlly = batch03DynamicStatusTexts(ally);
    const textEnemy = batch03DynamicStatusTexts(enemy);
    attackingFC = ally;
    highlightTargets();
    const avatarTargetable = !!document.querySelector(playerZoneSelector(player2, "avatar") + " .av-portrait.av-valid-target");
    const hpBefore = avatarHitPoints(player2);
    await applyDamage(enemy, 99);
    return {play, player2Key:player2.key, ally:targetSummary(ally), enemyBeforeText:textEnemy, textAlly, avatarTargetable, hpBefore, hpAfter:avatarHitPoints(player2), events:window.__collectionBatch14D?.events || []};
  });
  expect(result.play.success).toBe(true);
  expect(result.ally.batch14dHirinBypassRempart).toBe(true);
  expect(result.textAlly).toContain("Bénéficie de la Faveur d'Hirin : passe outre [Rempart].");
  expect(result.enemyBeforeText).toContain("Maudit par Hirin le Messager : inflige 1 point de dégât à son avatar quand ce serviteur est détruit.");
  expect(result.avatarTargetable).toBe(true);
  expect(result.hpAfter).toBe(result.hpBefore - 1);
  expect(result.events.some(event => event.type === "hirin-cursed-servant-destroyed" && event.ownerId === result.player2Key)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
