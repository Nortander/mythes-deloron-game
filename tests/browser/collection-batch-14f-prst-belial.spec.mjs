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

async function belialManualSnapshot(page) {
  return page.evaluate(() => collectionBatch14FBelialManualSnapshot());
}

async function clickBelialControl(page, testId) {
  await page.getByTestId(testId).click();
}

test("Batch 14F2 PRST000014 Collection uses Echo wording and V12 highlights", async ({page}, testInfo) => {
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

test("Batch 14F2 PRST000014 activates, leaves play, and adds +1 Echo to gains only", async ({page}, testInfo) => {
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
    const afterRollback = Number(player1.resourceState.souls || 0);
    const transfer = changeSouls(player1, 2, "echo-transfer");
    return {before, play, afterPlay, gain, afterGain, cost, afterCost, rollback, afterRollback, transfer, launchMessage:play.spellResolution?.activationMessage || null, events:[...collectionBatch14FState().events]};
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
  expect(result.launchMessage).toMatchObject({shown:true, message:"LE DEMI-DIEU DES MORTS MANIPULE LES ÉCHOS ET LES ÂMES AU SERVICE DE SES SOMBRES ADORATEURS."});
  expect(result.gain.requestedDelta).toBe(2);
  expect(result.gain.delta).toBe(3);
  expect(result.gain.belialBonus.bonus).toBe(1);
  expect(result.afterGain).toBe(result.before.echoes + 3);
  expect(result.cost.delta).toBe(-2);
  expect(result.afterCost).toBe(result.afterGain - 2);
  expect(result.rollback.delta).toBe(2);
  expect(result.rollback.belialBonus.bonus).toBe(0);
  expect(result.transfer.delta).toBe(2);
  expect(result.transfer.belialBonus.reason).toBe("transfer");
  expect(result.transfer.soulsAfter).toBe(result.afterRollback + 2);
  expect(result.events.filter(event => event.type === "prst-activation-message-shown")).toHaveLength(1);
  expect(result.events.some(event => event.type === "belial-echo-bonus" && event.requestedAmount === 2 && event.appliedAmount === 3)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14F2 PRST000014 opens regeneration after draw and resolves keep/consume choices", async ({page}, testInfo) => {
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
    player1.resourceState.souls = 5;
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
  await expect(modal.locator(".decision-modal-topline")).toBeVisible();
  await expect(modal.locator(".decision-modal-title")).toHaveText("FAVEUR DE BÉLIAL");
  await expect(modal.getByTestId("batch14f-belial-subtitle")).toHaveText("Votre avatar s'épuise... Voulez-vous consommer des Échos pour le régénérer ?");
  await expect(modal.getByTestId("batch14f-belial-avatar")).toBeVisible();
  await expect(modal.getByTestId("batch14f-belial-avatar-hp")).toContainText("24 PDV");
  await expect(modal.getByTestId("batch14f-belial-slider")).toHaveAttribute("max", "5");
  await expect(modal.getByTestId("batch14f-belial-slider")).toHaveAttribute("data-available-echoes", "5");
  await expect(modal.getByTestId("batch14f-belial-heal")).toHaveText("5 PDV");
  await modal.getByTestId("batch14f-belial-keep").click();
  const keep = await keepPromise;
  expect(keep.choice).toBe("keep");
  const afterKeep = await page.evaluate(() => ({echoes:Number(player1.resourceState.souls || 0), hp:avatarHitPoints(player1), pending:!!player1.batch14fBelialRegenPending}));
  expect(afterKeep.echoes).toBe(5);
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
  await secondModal.getByTestId("batch14f-belial-slider").fill("5");
  await expect(secondModal.getByTestId("batch14f-belial-heal")).toHaveText("25 PDV");
  await secondModal.getByTestId("batch14f-belial-consume").click();
  const consume = await consumePromise;
  expect(consume.choice).toBe("consume");
  expect(consume.amount).toBe(5);
  expect(consume.heal).toBe(25);
  expect(consume.echoesAfter).toBe(0);
  expect(consume.hpBefore).toBe(24);
  expect(consume.hpAfter).toBe(49);
  expect(consume.echoPilePulse).toBe(true);
  expect(consume.avatarPulse).toBe(true);

  const noRepeat = await page.evaluate(async () => {
    player1.drawPile = ["MV000004"];
    turnSequence += 1;
    const start = await runStartTurnPipeline(player1);
    return {start, pending:!!player1.batch14fBelialRegenPending, modal:!!pendingDecisionModal, hp:avatarHitPoints(player1)};
  });
  expect(noRepeat.pending).toBe(false);
  expect(noRepeat.modal).toBe(false);
  expect(noRepeat.hp).toBe(49);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14F2 PRST000014 auto-plays from draw and immediately enables real Echo gains", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14FScenario(page, "manual");
  const result = await page.evaluate(() => {
    player1.hand = [];
    player1.drawPile = ["MV000001", "PRST000014"];
    player1.resourceState.souls = 1;
    player1.resourceState.revision += 1;
    renderAllHands();
    updateDeckCount(player1);
    const draw = drawCardFromDeck(player1, () => true, {refresh:false, sourceCardId:"collection-batch-14f2-draw-test"});
    const gain = addSoulToAppro(player1, 1);
    return {
      draw,
      hand:[...player1.hand],
      graveyard:[...player1.graveyard],
      removed:[...(player1.removedFromGame || [])],
      favor:!!player1.prstFavors?.PRST000014,
      echoes:Number(player1.resourceState.souls || 0),
      gain,
      events:[...collectionBatch14FState().events]
    };
  });
  expect(result.draw.success).toBe(true);
  expect(result.draw.cardId).toBe("PRST000014");
  expect(result.draw.prstAutoPlayResolution.handled).toBe(true);
  expect(result.hand).not.toContain("PRST000014");
  expect(result.graveyard).not.toContain("PRST000014");
  expect(result.removed).toContain("PRST000014");
  expect(result.favor).toBe(true);
  expect(result.gain.delta).toBe(2);
  expect(result.gain.belialBonus.bonus).toBe(1);
  expect(result.echoes).toBe(3);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14F3 PRST000014 threshold rearms only after recovering to 25 and clamps overlarge choices", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14FScenario(page, "auto");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    await playCard("PRST000014", null, {returnValidation:true});
    player1.resourceState.souls = 3;
    player1.resourceState.revision += 1;
    projectSoulState(player1);
    setAvatarHitPoints(player1, 30);
    const first = applyAvatarEffectDamage(player1, 6, {sourceCardId:"batch14f-threshold-test"});
    const stillLow = applyAvatarEffectDamage(player1, 1, {sourceCardId:"batch14f-threshold-test"});
    collectionBatch14FState().forcedBelialChoice = {choice:"consume", amount:5};
    player1.firstTurnStarted = true;
    player1.drawPile = ["MV000001"];
    turnSequence += 1;
    await runStartTurnPipeline(player1);
    const afterClamped = {echoes:Number(player1.resourceState.souls || 0), hp:avatarHitPoints(player1), pending:!!player1.batch14fBelialRegenPending};
    const belowAfterClamp = applyAvatarEffectDamage(player1, 1, {sourceCardId:"batch14f-threshold-test"});
    setAvatarHitPoints(player1, 25);
    const rearm = applyAvatarEffectDamage(player1, 1, {sourceCardId:"batch14f-threshold-test"});
    return {first, stillLow, afterClamped, belowAfterClamp, rearm, events:[...collectionBatch14FState().events]};
  });
  expect(result.first.batch14fBelial.armed).toBe(true);
  expect(result.stillLow.batch14fBelial.armed).toBe(false);
  expect(result.stillLow.batch14fBelial.reason).toBe("threshold-not-crossed");
  expect(result.afterClamped.echoes).toBe(0);
  expect(result.afterClamped.hp).toBe(38);
  expect(result.afterClamped.pending).toBe(false);
  expect(result.belowAfterClamp.batch14fBelial.armed).toBe(false);
  expect(result.rearm.batch14fBelial.armed).toBe(true);
  expect(result.events.some(event => event.type === "belial-regen-consumed-echoes" && event.amount === 3 && event.heal === 15)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});


test("Batch 14F4 PRST000014 visual panel drives the V15 Belial rebuild flow", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14FScenario(page, "manual");
  await expect(page.getByTestId("batch14f-belial-test-controls")).toBeVisible();
  await expect(page.getByTestId("batch14f-belial-panel-summary")).toContainText("Faveur: inactive");

  await clickBelialControl(page, "batch14f-belial-control-activate");
  await expect.poll(() => belialManualSnapshot(page)).toMatchObject({favorActive:true});
  const activated = await belialManualSnapshot(page);
  expect(activated.removed).toContain("PRST000014");
  expect(activated.hand).not.toContain("PRST000014");

  const beforeGain = activated.echoes;
  await clickBelialControl(page, "batch14f-belial-control-gain");
  await expect.poll(() => belialManualSnapshot(page)).toMatchObject({echoes:beforeGain + 3});
  const gainSnapshot = await belialManualSnapshot(page);
  expect(gainSnapshot.lastManualAction.result.gain.requestedDelta).toBe(2);
  expect(gainSnapshot.lastManualAction.result.gain.delta).toBe(3);
  expect(gainSnapshot.lastManualAction.result.gain.belialBonus.bonus).toBe(1);

  await clickBelialControl(page, "batch14f-belial-control-echoes-5");
  await clickBelialControl(page, "batch14f-belial-control-hp-30");
  await clickBelialControl(page, "batch14f-belial-control-damage-6");
  const armed = await belialManualSnapshot(page);
  expect(armed.hp).toBe(24);
  expect(armed.regenPending).toBe(true);
  expect(armed.modalOpen).toBe(false);
  await expect(page.locator('[data-decision-id="batch14f-belial-regen"]')).toHaveCount(0);

  await clickBelialControl(page, "batch14f-belial-control-next-turn");
  const modal = page.locator('[data-decision-id="batch14f-belial-regen"]');
  await expect(modal).toBeVisible();
  await expect(modal.locator(".decision-modal-topline")).toBeVisible();
  await expect(modal.locator(".decision-modal-title")).toHaveText("FAVEUR DE BÉLIAL");
  await expect(modal.getByTestId("batch14f-belial-subtitle")).toHaveText("Votre avatar s'épuise... Voulez-vous consommer des Échos pour le régénérer ?");
  await expect(modal.getByTestId("batch14f-belial-reserve")).toContainText("Réserve : 5 Échos");
  await expect(modal.getByTestId("batch14f-belial-slider")).toHaveAttribute("min", "0");
  await expect(modal.getByTestId("batch14f-belial-slider")).toHaveAttribute("max", "5");
  await expect(modal.getByTestId("batch14f-belial-slider")).toHaveAttribute("data-effective-max", "5");
  await modal.getByTestId("batch14f-belial-keep").click();
  await expect.poll(() => belialManualSnapshot(page)).toMatchObject({echoes:5, hp:24, regenPending:false, modalOpen:false});

  await clickBelialControl(page, "batch14f-belial-control-hp-30");
  await clickBelialControl(page, "batch14f-belial-control-damage-6");
  await clickBelialControl(page, "batch14f-belial-control-next-turn");
  const consumeModal = page.locator('[data-decision-id="batch14f-belial-regen"]');
  await expect(consumeModal).toBeVisible();
  await consumeModal.getByTestId("batch14f-belial-slider").fill("5");
  await expect(consumeModal.getByTestId("batch14f-belial-heal")).toHaveText("25 PDV");
  await consumeModal.getByTestId("batch14f-belial-consume").click();
  await expect.poll(() => belialManualSnapshot(page)).toMatchObject({echoes:0, hp:49, regenPending:false, modalOpen:false});

  await clickBelialControl(page, "batch14f-belial-control-echoes-3");
  await clickBelialControl(page, "batch14f-belial-control-hp-30");
  await clickBelialControl(page, "batch14f-belial-control-damage-6");
  await clickBelialControl(page, "batch14f-belial-control-next-turn");
  const clampedModal = page.locator('[data-decision-id="batch14f-belial-regen"]');
  await expect(clampedModal).toBeVisible();
  const clampedSlider = clampedModal.getByTestId("batch14f-belial-slider");
  await expect(clampedSlider).toHaveAttribute("data-available-echoes", "3");
  await expect(clampedSlider).toHaveAttribute("data-effective-max", "3");
  await clampedSlider.evaluate(slider => { slider.value = "5"; slider.dispatchEvent(new Event("input", {bubbles:true})); });
  await expect(clampedSlider).toHaveValue("3");
  await expect(clampedModal.getByTestId("batch14f-belial-heal")).toHaveText("15 PDV");
  await clampedModal.getByTestId("batch14f-belial-keep").click();
  await expect.poll(() => belialManualSnapshot(page)).toMatchObject({echoes:3, hp:24, regenPending:false, modalOpen:false});

  await clickBelialControl(page, "batch14f-belial-control-echoes-0");
  await clickBelialControl(page, "batch14f-belial-control-hp-30");
  await clickBelialControl(page, "batch14f-belial-control-damage-6");
  await clickBelialControl(page, "batch14f-belial-control-next-turn");
  await expect(page.locator('[data-decision-id="batch14f-belial-regen"]')).toHaveCount(0);
  const noEcho = await belialManualSnapshot(page);
  expect(noEcho).toMatchObject({echoes:0, hp:24, regenPending:false, modalOpen:false});
  expect(noEcho.recentEvents.some(event => event.type === "belial-regen-missed-no-echoes")).toBe(true);

  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
