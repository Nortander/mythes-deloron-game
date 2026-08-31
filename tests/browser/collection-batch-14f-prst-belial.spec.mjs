import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics, clickCollectionCard, collectionCard, collectionModalSnapshot, openCollection} from "./helpers/eloron-ui.mjs";

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource/i.test(message));
}

async function open14FScenario(page, mode="auto") {
  const scenario = "collection-batch-14b-prst000014-core-visual";
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch14f=" + mode + "&t=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout:20000});
  await page.waitForTimeout(150);
}

test("Batch 14F1 PRST000014 Collection uses Echo wording and V12 highlights", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openCollection(page);
  await page.locator("#searchInput").fill("PRST000014");
  await expect(collectionCard(page, "PRST000014")).toBeVisible();
  await clickCollectionCard(page, "PRST000014");
  const modal = await collectionModalSnapshot(page);
  expect(modal.open).toBe(true);
  expect(modal.cardText).toContain("1 Écho");
  expect(modal.cardText).toContain("25");
  expect(modal.cardText).toContain("jusqu'à 5 Échos lors de votre prochain tour");
  expect(modal.cardText).toContain("5 PDV");
  expect(modal.cardText).not.toMatch(/\bâme\b|\bâmes\b/i);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14F1 PRST000014 activates, leaves play, and adds +1 Echo to gains only", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14FScenario(page);
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const before = {hand:[...player1.hand], deck:[...player1.drawPile], graveyard:[...player1.graveyard], removed:[...(player1.removedFromGame || [])], echoes:Number(player1.resourceState.souls || 0)};
    const play = await playCard("PRST000014", null, {returnValidation:true});
    const afterPlay = {hand:[...player1.hand], graveyard:[...player1.graveyard], removed:[...(player1.removedFromGame || [])], favor:!!player1.prstFavors?.PRST000014, specific:play?.spellResolution?.specificResolution?.batch14f || null};
    const gain = addSoulToAppro(player1, 2);
    const afterGain = Number(player1.resourceState.souls || 0);
    const cost = consumeSouls(player1, 2, "batch14f-test-cost");
    const afterCost = Number(player1.resourceState.souls || 0);
    const rollback = changeSouls(player1, 2, "payment-rollback");
    return {before, play, afterPlay, gain, afterGain, cost, afterCost, rollback, events:[...collectionBatch14FState().events]};
  });
  expect(result.before.hand[0]).toBe("PRST000014");
  expect(result.before.deck.at(-1)).toBe("PRST000014");
  expect(result.play.success).toBe(true);
  expect(result.play.spellRemovedFromGame).toBe(true);
  expect(result.afterPlay.hand).not.toContain("PRST000014");
  expect(result.afterPlay.graveyard).not.toContain("PRST000014");
  expect(result.afterPlay.removed).toContain("PRST000014");
  expect(result.afterPlay.favor).toBe(true);
  expect(result.afterPlay.specific.success).toBe(true);
  expect(result.gain.requestedDelta).toBe(2);
  expect(result.gain.delta).toBe(3);
  expect(result.gain.belialBonus.bonus).toBe(1);
  expect(result.afterGain).toBe(result.before.echoes + 3);
  expect(result.cost.delta).toBe(-2);
  expect(result.afterCost).toBe(result.afterGain - 2);
  expect(result.rollback.delta).toBe(2);
  expect(result.rollback.belialBonus.bonus).toBe(0);
  expect(result.events.some(event => event.type === "belial-echo-bonus" && event.requestedAmount === 2 && event.appliedAmount === 3)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14F1 PRST000014 opens regeneration after draw and resolves keep/consume choices", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14FScenario(page, "manual");
  const noEcho = await page.evaluate(async () => {
    currentPlayer = player1.key;
    await playCard("PRST000014", null, {returnValidation:true});
    player1.resourceState.souls = 0;
    player1.resourceState.revision += 1;
    projectSoulState(player1);
    setAvatarHitPoints(player1, 30);
    const damage = applyAvatarEffectDamage(player1, 6, {sourceCardId:"batch14f-test"});
    player1.firstTurnStarted = true;
    player1.drawPile = ["MV000001"];
    turnSequence += 1;
    const start = await runStartTurnPipeline(player1);
    return {damage, startTrace:getLastStartTurnTrace(), start, pending:!!player1.batch14fBelialRegenPending, modal:!!pendingDecisionModal, events:[...collectionBatch14FState().events], echoes:Number(player1.resourceState.souls || 0), hp:avatarHitPoints(player1)};
  });
  expect(noEcho.damage.batch14fBelial.armed).toBe(true);
  expect(noEcho.pending).toBe(false);
  expect(noEcho.modal).toBe(false);
  expect(noEcho.echoes).toBe(0);
  expect(noEcho.hp).toBe(24);
  expect(noEcho.events.some(event => event.type === "belial-regen-missed-no-echoes")).toBe(true);

  const keepPromise = page.evaluate(async () => {
    player1.resourceState.souls = 4;
    player1.resourceState.revision += 1;
    projectSoulState(player1);
    setAvatarHitPoints(player1, 30);
    applyAvatarEffectDamage(player1, 6, {sourceCardId:"batch14f-test"});
    player1.firstTurnStarted = true;
    player1.drawPile = ["MV000002"];
    turnSequence += 1;
    await runStartTurnPipeline(player1);
    return getLastStartTurnTrace()?.batch14fBelial || null;
  });
  const modal = page.locator('[data-decision-id="batch14f-belial-regen"]');
  await expect(modal).toBeVisible();
  await expect(modal.locator(".decision-modal-minimize")).toHaveText("RÉDUIRE");
  await expect(modal.locator(".decision-modal-title")).toHaveText("FAVEUR DE BÉLIAL");
  await expect(modal.getByTestId("batch14f-belial-subtitle")).toHaveText("Votre avatar s'épuise... Voulez-vous consommer des Échos pour le régénérer ?");
  await expect(modal.getByTestId("batch14f-belial-avatar")).toBeVisible();
  await expect(modal.getByTestId("batch14f-belial-avatar-hp")).toContainText("24 PDV");
  await expect(modal.getByTestId("batch14f-belial-slider")).toHaveAttribute("max", "4");
  await expect(modal.getByTestId("batch14f-belial-heal")).toHaveText("5 PDV");
  await modal.getByTestId("batch14f-belial-keep").click();
  const keep = await keepPromise;
  expect(keep.choice).toBe("keep");
  const afterKeep = await page.evaluate(() => ({echoes:Number(player1.resourceState.souls || 0), hp:avatarHitPoints(player1), pending:!!player1.batch14fBelialRegenPending}));
  expect(afterKeep.echoes).toBe(4);
  expect(afterKeep.hp).toBe(24);
  expect(afterKeep.pending).toBe(false);

  const consumePromise = page.evaluate(async () => {
    setAvatarHitPoints(player1, 30);
    applyAvatarEffectDamage(player1, 6, {sourceCardId:"batch14f-test"});
    player1.firstTurnStarted = true;
    player1.drawPile = ["MV000003"];
    turnSequence += 1;
    await runStartTurnPipeline(player1);
    return getLastStartTurnTrace()?.batch14fBelial || null;
  });
  const secondModal = page.locator('[data-decision-id="batch14f-belial-regen"]');
  await expect(secondModal).toBeVisible();
  await secondModal.getByTestId("batch14f-belial-slider").fill("4");
  await expect(secondModal.getByTestId("batch14f-belial-heal")).toHaveText("20 PDV");
  await secondModal.getByTestId("batch14f-belial-consume").click();
  const consume = await consumePromise;
  expect(consume.choice).toBe("consume");
  expect(consume.amount).toBe(4);
  expect(consume.heal).toBe(20);
  expect(consume.echoesAfter).toBe(0);
  expect(consume.hpBefore).toBe(24);
  expect(consume.hpAfter).toBe(44);

  const noRepeat = await page.evaluate(async () => {
    player1.drawPile = ["MV000004"];
    turnSequence += 1;
    const start = await runStartTurnPipeline(player1);
    return {start, pending:!!player1.batch14fBelialRegenPending, modal:!!pendingDecisionModal, hp:avatarHitPoints(player1)};
  });
  expect(noRepeat.pending).toBe(false);
  expect(noRepeat.modal).toBe(false);
  expect(noRepeat.hp).toBe(44);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
