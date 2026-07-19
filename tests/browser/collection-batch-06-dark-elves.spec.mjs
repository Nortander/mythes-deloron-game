import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-06-dark-elves.json", import.meta.url), "utf8"));
const signatures = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-effect-signatures.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch06=" + Date.now());
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

test("Batch-06 scenarios stay hidden and expose every dark elf card", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  const signaturesById = byId(signatures.signatures);
  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    const audit = await page.evaluate((input) => ({
      scenarioId:selectedScenarioId(),
      publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + input.scenario + '"]').length,
      cards:input.ids.map(id => ({id, exists:!!CARDS_DATA[id], name:CARDS_DATA[id]?.name || "", type:CARDS_DATA[id]?.type || "", faction:CARDS_DATA[id]?.fac || "", keywords:[...(CARDS_DATA[id]?.kws || [])]})),
      runtimeAudit:typeof auditCollectionBatch06Runtime === "function" ? auditCollectionBatch06Runtime() : null,
      player1HandSize:player1.hand.length
    }), {scenario, ids:fixture.darkElfIds});
    expect(audit.scenarioId).toBe(scenario);
    expect(audit.publicOptionCount).toBe(fixture.expectedHiddenScenarioOptionCount);
    expect(audit.cards.every(card => card.exists), JSON.stringify(audit.cards.filter(card => !card.exists))).toBe(true);
    expect(audit.runtimeAudit).toBeTruthy();
    expect(audit.player1HandSize, scenario + " visible hand size").toBeLessThanOrEqual(fixture.maxVisualHandSize);
  }
  for (const id of fixture.darkElfIds) {
    expect(signaturesById.get(id), id + " signature").toBeTruthy();
  }
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("dark elf Initiative and start-turn passives deal exact damage", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-06-elfes-noirs");
  const result = await page.evaluate(async (expected) => {
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
    for (const enemy of livingServantCardsForPlayer(player2)) batch03UpdateStats(enemy, {atk:0, pdvMax:20, pdv:20});
    const beforeEnsorceleur = board(player2);
    await summonBatch03Servant(player1, "EN000001", {triggerInitiativeEffect:true, ready:true});
    await new Promise(resolve => setTimeout(resolve, 450));
    const afterEnsorceleur = board(player2);
    const damagedByEnsorceleur = afterEnsorceleur.filter((card, index) => card.pdv === beforeEnsorceleur[index].pdv - expected.expectedInitiativeDamage.EN000001);

    resetServants(player1);
    resetServants(player2);
    player2.hand = ["H000001", "H000005"];
    refreshAdverseHandBacks(player1);
    const handBeforeDiscard = [...player2.hand];
    await summonBatch03Servant(player1, "EN000004", {triggerInitiativeEffect:true, ready:true});
    await new Promise(resolve => setTimeout(resolve, 450));
    const handAfterDiscard = [...player2.hand];

    resetServants(player1);
    resetServants(player2);
    await summonBatch03Servant(player1, "AVS000009", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000006", {triggerInitiativeEffect:false, ready:true});
    for (const enemy of livingServantCardsForPlayer(player2)) batch03UpdateStats(enemy, {atk:0, pdvMax:30, pdv:30});
    const beforeRaith = board(player2);
    const raithResult = await applyBatch03StartTurnAbilities(player1);
    const afterRaith = board(player2);

    resetServants(player1);
    resetServants(player2);
    await summonBatch03Servant(player1, "AVS000012", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    for (const enemy of livingServantCardsForPlayer(player2)) batch03UpdateStats(enemy, {atk:0, pdvMax:20, pdv:20});
    const beforeZahaarOne = board(player2);
    const zahaarOne = await applyBatch03StartTurnAbilities(player1);
    const afterZahaarOne = board(player2);
    const zahaarTwo = await applyBatch03StartTurnAbilities(player1);
    const afterZahaarTwo = board(player2);

    return {beforeEnsorceleur, afterEnsorceleur, damagedByEnsorceleur, handBeforeDiscard, handAfterDiscard, beforeRaith, afterRaith, raithResult, beforeZahaarOne, afterZahaarOne, zahaarOne, zahaarTwo, afterZahaarTwo};
  }, fixture);
  expect(result.damagedByEnsorceleur).toHaveLength(2);
  expect(result.handBeforeDiscard).toHaveLength(2);
  expect(result.handAfterDiscard).toHaveLength(1);
  const raithLosses = result.afterRaith.map((card, index) => result.beforeRaith[index].pdv - card.pdv);
  expect(raithLosses).toContain(fixture.expectedStartTurnDamage.AVS000009.central);
  expect(raithLosses).toContain(fixture.expectedStartTurnDamage.AVS000009.adjacent);
  expect(result.raithResult.raithPassive[0].adjacent.length).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < result.beforeZahaarOne.length; i++) {
    expect(result.beforeZahaarOne[i].pdv - result.afterZahaarOne[i].pdv).toBe(fixture.expectedStartTurnDamage.AVS000012.firstTurn);
    expect(result.afterZahaarOne[i].pdv - result.afterZahaarTwo[i].pdv).toBe(fixture.expectedStartTurnDamage.AVS000012.secondTurn);
  }
  expect(result.zahaarOne.zahaarPassive[0].amount).toBe(1);
  expect(result.zahaarTwo.zahaarPassive[0].amount).toBe(2);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("dark elf end-turn effects summon, damage and keep generated cards coherent", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-06-elfes-noirs");
  const result = await page.evaluate(async (expected) => {
    window.__mythesRandom = () => 0;
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    const board = player => livingServantCardsForPlayer(player).map(targetSummary);

    resetServants(player1);
    resetServants(player2);
    await summonBatch03Servant(player1, "EN000003", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "EN000009", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "EN000010", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    for (const enemy of livingServantCardsForPlayer(player2)) batch03UpdateStats(enemy, {atk:0, pdvMax:30, pdv:30});
    const before = board(player2);
    applyEndOfTurnEffects(player1);
    await new Promise(resolve => setTimeout(resolve, 900));
    const after = board(player2);
    const ownBoard = board(player1);
    const events = auditCollectionBatch06Runtime().events;

    resetServants(player1);
    resetServants(player2);
    const prince = await summonBatch03Servant(player1, "EN000010", {triggerInitiativeEffect:false, ready:true});
    const princeFc = document.querySelector('.fc[data-instance="' + prince.instanceId + '"]');
    await applyDamage(princeFc, 99);
    await new Promise(resolve => setTimeout(resolve, 1100));
    const afterVengeance = board(player1);

    return {before, after, ownBoard, events, afterVengeance, expected};
  }, fixture);
  expect(result.ownBoard.map(card => card.id)).toEqual(expect.arrayContaining(["MV000007", "MV000002"]));
  const totalLoss = result.after.reduce((sum, card, index) => sum + (result.before[index].pdv - card.pdv), 0);
  expect(totalLoss).toBeGreaterThanOrEqual(fixture.expectedEndTurnDamage.EN000009 + fixture.expectedEndTurnDamage.EN000010);
  expect(result.events.some(event => event.type === "archonte-end-turn")).toBe(true);
  expect(result.events.some(event => event.type === "prince-tueur-end-turn")).toBe(true);
  expect(result.afterVengeance.map(card => card.id)).toContain(fixture.generatedServants.EN000010);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("dark elf combat covers disease, healing, Rempart bypass and extra attack", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-06-mobilite-elfique");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };

    resetServants(player1);
    resetServants(player2);
    const assassin = await summonBatch03Servant(player1, "EN000006", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000026", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const assassinFc = document.querySelector('.fc[data-instance="' + assassin.instanceId + '"]');
    currentPlayer = player1.key;
    tryAttack(assassinFc);
    const avatarBypass = !!document.querySelector(playerZoneSelector(player2, "avatar") + " .av-valid-target");
    cancelAttack();

    resetServants(player1);
    resetServants(player2);
    const elf = await summonBatch03Servant(player1, "EN000002", {triggerInitiativeEffect:false, ready:true});
    const target = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const elfFc = document.querySelector('.fc[data-instance="' + elf.instanceId + '"]');
    const targetFc = document.querySelector('.fc[data-instance="' + target.instanceId + '"]');
    const elfState = fc => ({...targetSummary(fc), exhausted:fc.dataset.exhausted === "1", extraAttack:fc.dataset.batch06ExtraAttack === "1", extraAttackConsumed:fc.dataset.batch06ExtraAttackConsumed === "1"});
    batch03UpdateStats(targetFc, {atk:0, pdvMax:20, pdv:20});
    elfFc.dataset.exhausted = "1";
    elfFc.classList.add("fc-exhausted");
    const vivacite = resolveVivaciteElfique(player1);
    const afterVivacite = elfState(elfFc);
    await resolveCombat(elfFc, targetFc);
    const afterFirstAttack = elfState(elfFc);
    await resolveCombat(elfFc, targetFc);
    const afterSecondAttack = elfState(elfFc);

    resetServants(player1);
    resetServants(player2);
    const diseaseSource = await summonBatch03Servant(player1, "EN000005", {triggerInitiativeEffect:false, ready:true});
    const diseasedTarget = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const diseaseSourceFc = document.querySelector('.fc[data-instance="' + diseaseSource.instanceId + '"]');
    const diseasedFc = document.querySelector('.fc[data-instance="' + diseasedTarget.instanceId + '"]');
    batch03UpdateStats(diseasedFc, {atk:0, pdvMax:20, pdv:20});
    await resolveCombat(diseaseSourceFc, diseasedFc);
    const diseaseAfterHit = Number(diseasedFc.dataset.batch06Disease || 0);
    const pdvBeforeTick = Number(diseasedFc.dataset.pdv || 0);
    applyEndOfTurnEffects(player1);
    await new Promise(resolve => setTimeout(resolve, 450));
    const pdvAfterTick = Number(diseasedFc.dataset.pdv || 0);
    applyHeal(diseasedFc, 1);
    const diseaseAfterHeal = Number(diseasedFc.dataset.batch06Disease || 0);
    diseasedFc.dataset.batch06Disease = "2";
    diseasedFc.dataset.batch06DiseaseSourcePlayer = player1.key;
    syncBatch06DiseaseCounter(diseasedFc);
    await triggerVengeance("EN000005", player1, diseaseSourceFc, null);
    const diseaseAfterVengeance = Number(diseasedFc.dataset.batch06Disease || 0);

    resetServants(player1);
    resetServants(player2);
    const shadow = await summonBatch03Servant(player1, "EN000008", {triggerInitiativeEffect:false, ready:true});
    const weak = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const shadowFc = document.querySelector('.fc[data-instance="' + shadow.instanceId + '"]');
    const weakFc = document.querySelector('.fc[data-instance="' + weak.instanceId + '"]');
    batch03UpdateStats(shadowFc, {pdvMax:10, pdv:3});
    batch03UpdateStats(weakFc, {atk:0, pdvMax:1, pdv:1});
    await resolveCombat(shadowFc, weakFc);
    const shadowAfterKill = targetSummary(shadowFc);

    return {avatarBypass, vivacite, afterVivacite, afterFirstAttack, afterSecondAttack, diseaseAfterHit, pdvBeforeTick, pdvAfterTick, diseaseAfterHeal, diseaseAfterVengeance, shadowAfterKill};
  });
  expect(result.avatarBypass).toBe(true);
  expect(result.vivacite.success).toBe(true);
  expect(result.afterVivacite.exhausted).toBeFalsy();
  expect(result.afterFirstAttack.exhausted).toBeFalsy();
  expect(result.afterSecondAttack.exhausted).toBeTruthy();
  expect(result.diseaseAfterHit).toBe(1);
  expect(result.pdvBeforeTick - result.pdvAfterTick).toBe(1);
  expect(result.diseaseAfterHeal).toBe(0);
  expect(result.diseaseAfterVengeance).toBe(4);
  expect(result.shadowAfterKill.pdv).toBeGreaterThanOrEqual(8);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Déplacement instantané rescues the same servant into hand with a zero-cost next play", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-06-mobilite-elfique");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    resetServants(player1);
    resetServants(player2);
    player1.hand = ["S000056"];
    refreshHand(player1);
    const protectedSummon = await summonBatch03Servant(player1, "EN000002", {triggerInitiativeEffect:false, ready:true});
    const killerSummon = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const protectedFc = document.querySelector('.fc[data-instance="' + protectedSummon.instanceId + '"]');
    const killerFc = document.querySelector('.fc[data-instance="' + killerSummon.instanceId + '"]');
    batch03UpdateStats(killerFc, {atk:5, pdvMax:20, pdv:20});
    const selectedId = protectedFc.dataset.instance;
    const mark = resolveDeplacementInstantane(player1, {selectedTargetIds:[selectedId]});
    const before = auditZoneInventories();
    protectedFc._killer = killerFc;
    const died = await applyDamage(protectedFc, 99);
    await new Promise(resolve => setTimeout(resolve, 1200));
    const after = auditZoneInventories();
    const cost = resolveCardCost({player:player1, cardId:"EN000002"});
    const audit = auditCollectionBatch06Runtime();
    return {
      mark,
      died,
      before,
      after,
      hand:[...player1.hand],
      graveyard:[...player1.graveyard],
      board:audit.board.player1,
      events:audit.events,
      costTotal:cost?.effectiveCost?.total ?? cost?.effectiveCost?.totalCost ?? null,
      activeModifiers:[...(player1.costModifierState?.active || [])].map(modifier => ({id:modifier.id, sourceId:modifier.sourceId, duration:modifier.duration, criteria:modifier.criteria}))
    };
  });
  expect(result.mark.success).toBe(true);
  expect(result.died).toBe(false);
  expect(result.hand).toContain("EN000002");
  expect(result.graveyard).not.toContain("EN000002");
  expect(result.board.map(card => card.id)).not.toContain("EN000002");
  expect(result.events.some(event => event.type === "deplacement-rescue" && event.rescuedCardId === "EN000002")).toBe(true);
  expect(result.activeModifiers.some(modifier => modifier.sourceId === "S000056" && modifier.duration === "nextEligibleCard")).toBe(true);
  expect(result.costTotal).toBe(0);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
