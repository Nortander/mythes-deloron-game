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
      cards:input.ids.map(id => ({id, exists:!!CARDS_DATA[id], name:CARDS_DATA[id]?.name || "", type:CARDS_DATA[id]?.type || "", faction:CARDS_DATA[id]?.fac || "", keywords:[...(CARDS_DATA[id]?.kws || [])], text:CARDS_DATA[id]?.cap || ""})),
      runtimeAudit:typeof auditCollectionBatch06Runtime === "function" ? auditCollectionBatch06Runtime() : null,
      player1HandSize:player1.hand.length,
      pestilenceDefinition:KDEF.Pestilence || null
    }), {scenario, ids:fixture.darkElfIds});
    expect(audit.scenarioId).toBe(scenario);
    expect(audit.publicOptionCount).toBe(fixture.expectedHiddenScenarioOptionCount);
    expect(audit.cards.every(card => card.exists), JSON.stringify(audit.cards.filter(card => !card.exists))).toBe(true);
    expect(audit.runtimeAudit).toBeTruthy();
    expect(audit.player1HandSize, scenario + " visible hand size").toBeLessThanOrEqual(fixture.maxVisualHandSize);
    expect(audit.pestilenceDefinition).toContain("dégâts");
    const cardsById = byId(audit.cards);
    if (scenario === fixture.expectedSharArduin.scenario) {
      const shar = cardsById.get("EN000012");
      for (const fragment of fixture.expectedSharArduin.canonicalTextFragments) expect(shar.text).toContain(fragment);
      for (const fragment of fixture.expectedSharArduin.forbiddenTextFragments) expect(shar.text).not.toContain(fragment);
    }
    expect(cardsById.get("EN000001").text).toContain("*2*");
    expect(cardsById.get("EN000005").keywords).toContain("Pestilence");
    expect(cardsById.get("EN000005").text).toContain("[Pestilence]");
    expect(cardsById.get("S000049").name).toBe("Machiavélisme");
    expect(cardsById.get("S000049").text).toContain("*2*");
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

test("dark elf end-turn effects summon with undead colors and Vigilance halos", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-06-elfes-noirs");
  const result = await page.evaluate(async (expected) => {
    window.__mythesRandom = () => 0;
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    const board = player => livingServantCardsForPlayer(player).map(fc => ({...targetSummary(fc), className:fc.className, passiveGlow:fc.dataset.batch03PassivePulse === "1", keywords:[...(CARDS_DATA[fc.dataset.id]?.kws || [])]}));

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
    await new Promise(resolve => setTimeout(resolve, 1200));
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
  const generated = byId(result.ownBoard.filter(card => ["MV000007", "MV000002"].includes(card.id)));
  expect(generated.get("MV000007").className).toContain("mvs");
  expect(generated.get("MV000007").passiveGlow).toBe(true);
  expect(generated.get("MV000002").className).toContain("mvs");
  expect(generated.get("MV000002").passiveGlow).toBe(true);
  const totalLoss = result.after.reduce((sum, card, index) => sum + (result.before[index].pdv - card.pdv), 0);
  expect(totalLoss).toBeGreaterThanOrEqual(fixture.expectedEndTurnDamage.EN000009 + fixture.expectedEndTurnDamage.EN000010);
  expect(result.events.some(event => event.type === "necromancien-end-turn" && event.summon?.cardId === "MV000007")).toBe(true);
  expect(result.events.some(event => event.type === "archonte-end-turn")).toBe(true);
  expect(result.events.some(event => event.type === "prince-tueur-end-turn")).toBe(true);
  expect(result.afterVengeance.map(card => card.id)).toContain(fixture.generatedServants.EN000010);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("dark elf combat covers Pestilence, healing, Rempart bypass and extra attack", async ({page}, testInfo) => {
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
    const pestilenceVfx = !!diseasedFc.querySelector('.batch06-pestilence-vfx');
    const pestilenceRawCounters = diseasedFc.querySelectorAll('[data-batch03-status-counter="pestilence"]').length;
    const dynamicPreview = (() => {
      const div = document.createElement('div');
      div.innerHTML = buildCanonicalCardPreview(diseasedFc.dataset.id, {sourceElement:diseasedFc});
      return div.textContent.replace(/\s+/g, ' ').trim();
    })();
    const pdvBeforeWrongTurn = Number(diseasedFc.dataset.pdv || 0);
    applyEndOfTurnEffects(player1);
    await new Promise(resolve => setTimeout(resolve, 450));
    const pdvAfterWrongTurn = Number(diseasedFc.dataset.pdv || 0);
    const pdvBeforeTick = Number(diseasedFc.dataset.pdv || 0);
    applyEndOfTurnEffects(player2);
    await new Promise(resolve => setTimeout(resolve, 650));
    const pdvAfterTick = Number(diseasedFc.dataset.pdv || 0);
    const diseaseAfterFirstTick = Number(diseasedFc.dataset.batch06Disease || 0);
    const vengeance = await triggerVengeance("EN000005", player1, diseaseSourceFc, null);
    const diseaseAfterVengeance = Number(diseasedFc.dataset.batch06Disease || 0);
    const pdvBeforeDoubledTick = Number(diseasedFc.dataset.pdv || 0);
    applyEndOfTurnEffects(player2);
    await new Promise(resolve => setTimeout(resolve, 650));
    const pdvAfterDoubledTick = Number(diseasedFc.dataset.pdv || 0);
    const diseaseAfterDoubledTick = Number(diseasedFc.dataset.batch06Disease || 0);
    applyHeal(diseasedFc, 1);
    const diseaseAfterHeal = Number(diseasedFc.dataset.batch06Disease || 0);
    const pestilenceVfxAfterHeal = !!diseasedFc.querySelector('.batch06-pestilence-vfx');

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

    resetServants(player1);
    resetServants(player2);
    const defender = await summonBatch03Servant(player1, "EN000008", {triggerInitiativeEffect:false, ready:true});
    const attacker = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const defenderFc = document.querySelector('.fc[data-instance="' + defender.instanceId + '"]');
    const attackerFc = document.querySelector('.fc[data-instance="' + attacker.instanceId + '"]');
    batch03UpdateStats(defenderFc, {atk:5, pdvMax:10, pdv:2});
    batch03UpdateStats(attackerFc, {atk:1, pdvMax:1, pdv:1});
    currentPlayer = player2.key;
    await resolveCombat(attackerFc, defenderFc);
    const shadowAfterDefenseKill = targetSummary(defenderFc);

    resetServants(player1);
    resetServants(player2);
    const heraldDefender = await summonBatch03Servant(player1, "EN000005", {triggerInitiativeEffect:false, ready:true});
    const heraldAttacker = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const heraldDefenderFc = document.querySelector('.fc[data-instance="' + heraldDefender.instanceId + '"]');
    const heraldAttackerFc = document.querySelector('.fc[data-instance="' + heraldAttacker.instanceId + '"]');
    batch03UpdateStats(heraldDefenderFc, {atk:2, pdvMax:8, pdv:8});
    batch03UpdateStats(heraldAttackerFc, {atk:1, pdvMax:10, pdv:10});
    currentPlayer = player2.key;
    await resolveCombat(heraldAttackerFc, heraldDefenderFc);
    const diseaseFromCounter = Number(heraldAttackerFc.dataset.batch06Disease || 0);

    resetServants(player1);
    resetServants(player2);
    const guardDefender = await summonBatch03Servant(player1, "EN000007", {triggerInitiativeEffect:false, ready:true});
    const guardAttacker = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const guardDefenderFc = document.querySelector('.fc[data-instance="' + guardDefender.instanceId + '"]');
    const guardAttackerFc = document.querySelector('.fc[data-instance="' + guardAttacker.instanceId + '"]');
    batch03UpdateStats(guardDefenderFc, {atk:2, pdvMax:8, pdv:3});
    batch03UpdateStats(guardAttackerFc, {atk:1, pdvMax:10, pdv:10});
    currentPlayer = player2.key;
    await resolveCombat(guardAttackerFc, guardDefenderFc);
    const guardAfterCounter = targetSummary(guardDefenderFc);
    const events = auditCollectionBatch06Runtime().events;

    return {avatarBypass, vivacite, afterVivacite, afterFirstAttack, afterSecondAttack, diseaseAfterHit, pestilenceVfx, pestilenceRawCounters, dynamicPreview, pdvBeforeWrongTurn, pdvAfterWrongTurn, pdvBeforeTick, pdvAfterTick, diseaseAfterFirstTick, diseaseAfterHeal, pestilenceVfxAfterHeal, vengeance, diseaseAfterVengeance, pdvBeforeDoubledTick, pdvAfterDoubledTick, diseaseAfterDoubledTick, diseaseFromCounter, guardAfterCounter, shadowAfterKill, shadowAfterDefenseKill, events};
  });
  expect(result.avatarBypass).toBe(true);
  expect(result.vivacite.success).toBe(true);
  expect(result.afterVivacite.exhausted).toBeFalsy();
  expect(result.afterFirstAttack.exhausted).toBeFalsy();
  expect(result.afterSecondAttack.exhausted).toBeTruthy();
  expect(result.diseaseAfterHit).toBe(fixture.expectedPestilence.initialStack);
  expect(result.pestilenceVfx).toBe(true);
  expect(result.pestilenceRawCounters).toBe(0);
  expect(result.dynamicPreview).toContain(fixture.expectedPestilence.publicStatusText);
  expect(result.dynamicPreview).not.toContain("[Pestilence]");
  expect(result.pdvBeforeWrongTurn - result.pdvAfterWrongTurn).toBe(0);
  expect(result.pdvBeforeTick - result.pdvAfterTick).toBe(fixture.expectedPestilence.firstTickDamage);
  expect(result.diseaseAfterFirstTick).toBe(fixture.expectedPestilence.stackAfterFirstVictimTurn);
  expect(result.vengeance.success).toBe(true);
  expect(result.diseaseAfterVengeance).toBe(fixture.expectedPestilence.doubledStack);
  expect(result.pdvBeforeDoubledTick - result.pdvAfterDoubledTick).toBe(fixture.expectedPestilence.doubledTickDamage);
  expect(result.diseaseAfterDoubledTick).toBe(fixture.expectedPestilence.stackAfterDoubledVictimTurn);
  expect(result.diseaseAfterHeal).toBe(0);
  expect(result.pestilenceVfxAfterHeal).toBe(false);
  expect(result.diseaseFromCounter).toBe(fixture.expectedPestilence.initialStack);
  expect(result.guardAfterCounter.pdv).toBe(4);
  expect(result.events.some(event => event.type === "pestilence-applied" && event.phase === "counter")).toBe(true);
  expect(result.events.some(event => event.type === "pestilence-vengeance-double")).toBe(true);
  expect(result.shadowAfterKill.pdv).toBeGreaterThanOrEqual(8);
  expect(result.shadowAfterDefenseKill.pdv).toBeGreaterThanOrEqual(6);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Shar Arduin uses canonical text, survives damage once per turn, draws by Vengeance and returns by Rune", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, fixture.expectedSharArduin.scenario);
  const result = await page.evaluate(async () => {
    const board = player => livingServantCardsForPlayer(player).map(targetSummary);
    const shar = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "EN000012");
    const canonicalText = CARDS_DATA.EN000012.cap;
    const enemyBefore = board(player2);
    const sharBefore = targetSummary(shar);
    await applyDamage(shar, 2);
    await new Promise(resolve => setTimeout(resolve, 900));
    const sharAfterFirstDamage = targetSummary(shar);
    const enemyAfterFirstDamage = board(player2);
    await applyDamage(shar, 1);
    await new Promise(resolve => setTimeout(resolve, 900));
    const sharAfterSecondDamageSameTurn = targetSummary(shar);
    const enemyAfterSecondDamageSameTurn = board(player2);
    const handBeforeVengeance = [...player1.hand];
    const deckBeforeVengeance = [...player1.drawPile];
    const graveyardBeforeVengeance = [...player1.graveyard];
    shar._killer = livingServantCardsForPlayer(player2)[0] || null;
    const died = await applyDamage(shar, 99);
    await new Promise(resolve => setTimeout(resolve, 1400));
    const handAfterVengeance = [...player1.hand];
    const deckAfterVengeance = [...player1.drawPile];
    const graveyardAfterVengeance = [...player1.graveyard];
    const returnedIndex = batch03HandIndexForOccurrence(player1, "EN000012", sharBefore.instance);
    const returnedOccurrenceId = batch03HandOccurrenceAt(player1, returnedIndex);
    const freeSlot = document.querySelector(playerZoneSelector(player1, "servants") + " .slot");
    const blockedReplay = await playCard("EN000012", freeSlot, {handOccurrenceId:returnedOccurrenceId, returnActionValidation:true});
    const blockedReplayMessage = document.querySelector("#errMsg")?.textContent || "";
    const handAfterBlockedReplay = [...player1.hand];
    const graveyardAfterBlockedReplay = [...player1.graveyard];
    const boardAfterBlockedReplay = board(player1);
    const events = auditCollectionBatch06Runtime().events;
    const batch03Events = auditCollectionBatch03Runtime().state.events;
    return {canonicalText, enemyBefore, sharBefore, sharAfterFirstDamage, enemyAfterFirstDamage, sharAfterSecondDamageSameTurn, enemyAfterSecondDamageSameTurn, handBeforeVengeance, handAfterVengeance, deckBeforeVengeance, deckAfterVengeance, graveyardBeforeVengeance, graveyardAfterVengeance, died, returnedIndex, returnedOccurrenceId, blockedReplay, blockedReplayMessage, handAfterBlockedReplay, graveyardAfterBlockedReplay, boardAfterBlockedReplay, events, batch03Events};
  });
  for (const fragment of fixture.expectedSharArduin.canonicalTextFragments) expect(result.canonicalText).toContain(fragment);
  for (const fragment of fixture.expectedSharArduin.forbiddenTextFragments) expect(result.canonicalText).not.toContain(fragment);
  expect(result.sharBefore.pdv).toBe(5);
  expect(result.sharAfterFirstDamage.pdv).toBe(7);
  for (let i = 0; i < result.enemyBefore.length; i++) {
    expect(result.enemyBefore[i].pdv - result.enemyAfterFirstDamage[i].pdv).toBe(fixture.expectedSharArduin.areaDamageOnSurvive);
    expect(result.enemyAfterFirstDamage[i].pdv - result.enemyAfterSecondDamageSameTurn[i].pdv).toBe(0);
  }
  expect(result.sharAfterSecondDamageSameTurn.pdv).toBe(6);
  expect(result.died).toBe(true);
  expect(result.handAfterVengeance).toContain("EN000012");
  expect(result.handAfterVengeance).toContain("EN000007");
  expect(result.deckAfterVengeance).not.toContain("EN000007");
  expect(result.graveyardAfterVengeance).not.toContain("EN000012");
  expect(result.returnedIndex).toBeGreaterThanOrEqual(0);
  expect(result.returnedOccurrenceId).toBe(result.sharBefore.instance);
  expect(result.blockedReplay?.success).toBe(false);
  expect(result.blockedReplay?.reason).toBe("blocked-card");
  expect(result.blockedReplayMessage).toContain("IMPOSSIBLE D'INVOQUER CE SERVITEUR CE TOUR : LA RUNE SE RECHARGE EN PUISSANCE");
  expect(result.handAfterBlockedReplay).toContain("EN000012");
  expect(result.graveyardAfterBlockedReplay).not.toContain("EN000012");
  expect(result.boardAfterBlockedReplay.map(card => card.id)).not.toContain("EN000012");
  expect(result.events.some(event => event.type === "shar-survived-damage" && event.damageResults?.length >= 2)).toBe(true);
  expect(result.events.some(event => event.type === "EN000012-vengeance" && event.drawResult?.success)).toBe(true);
  expect(result.batch03Events.some(event => event.type === "rune-return-to-hand" && event.cardId === "EN000012")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Machiavélisme adds a real damage bonus to a dark elf Vengeance", async ({page}, testInfo) => {
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
    const spell = resolveMachiavelisme(player1);
    const assassin = await summonBatch03Servant(player1, "EN000002", {triggerInitiativeEffect:false, ready:true});
    const killer = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    for (const enemy of livingServantCardsForPlayer(player2)) batch03UpdateStats(enemy, {atk:0, pdvMax:20, pdv:20});
    const assassinFc = document.querySelector('.fc[data-instance="' + assassin.instanceId + '"]');
    const killerFc = document.querySelector('.fc[data-instance="' + killer.instanceId + '"]');
    batch03UpdateStats(killerFc, {atk:5, pdvMax:20, pdv:20});
    const before = livingServantCardsForPlayer(player2).map(targetSummary);
    const vengeance = await triggerVengeance("EN000002", player1, assassinFc, killerFc);
    const after = livingServantCardsForPlayer(player2).map(targetSummary);
    const events = auditCollectionBatch06Runtime().events;
    return {spell, vengeance, before, after, events};
  });
  expect(result.spell.success).toBe(true);
  expect(result.events.some(event => event.type === "machiavelisme")).toBe(true);
  expect(result.events.some(event => event.type === "machiavelisme-vengeance-bonus" && event.damage?.success)).toBe(true);
  const totalLoss = result.after.reduce((sum, card, index) => sum + (result.before[index].pdv - card.pdv), 0);
  expect(totalLoss).toBeGreaterThanOrEqual(5);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Déplacement instantané rescues only the marked occurrence with a zero-cost next play", async ({page}, testInfo) => {
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
    player1.hand = ["S000056", "EN000002"];
    refreshHand(player1);
    const protectedSummon = await summonBatch03Servant(player1, "EN000002", {triggerInitiativeEffect:false, ready:true});
    const unprotectedSummon = await summonBatch03Servant(player1, "EN000002", {triggerInitiativeEffect:false, ready:true});
    const killerSummon = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const protectedFc = document.querySelector('.fc[data-instance="' + protectedSummon.instanceId + '"]');
    const unprotectedFc = document.querySelector('.fc[data-instance="' + unprotectedSummon.instanceId + '"]');
    const killerFc = document.querySelector('.fc[data-instance="' + killerSummon.instanceId + '"]');
    batch03UpdateStats(killerFc, {atk:5, pdvMax:20, pdv:20});
    const selectedId = protectedFc.dataset.instance;
    const untouchedInstance = unprotectedFc.dataset.instance;
    const mark = resolveDeplacementInstantane(player1, {selectedTargetIds:[selectedId]});
    const before = auditZoneInventories();
    protectedFc._killer = killerFc;
    const died = await applyDamage(protectedFc, 99);
    await new Promise(resolve => setTimeout(resolve, 1200));
    const after = auditZoneInventories();
    player1.resourceState.classical = createEmptyClassicalResources();
    player1.resourceState.souls = 0;
    player1.resourceState.revision += 1;
    projectSoulState(player1);
    refreshHand(player1);
    const handEntries = player1.hand.map((id, index) => {
      const occurrenceId = batch03HandOccurrenceAt(player1, index);
      const cost = resolveCardCost({player:player1, cardId:id, context:{handOccurrenceId:occurrenceId}});
      return {id, occurrenceId, total:cost?.effectiveCost?.total ?? null};
    });
    const rescuedEntry = handEntries.find(entry => entry.id === "EN000002" && entry.occurrenceId === selectedId);
    const unmarkedHandEntry = handEntries.find(entry => entry.id === "EN000002" && entry.occurrenceId !== selectedId);
    const boardAfterRescue = auditCollectionBatch06Runtime().board.player1;
    const activeModifiersBeforeReplay = [...(player1.costModifierState?.active || [])].map(modifier => ({id:modifier.id, sourceId:modifier.sourceId, duration:modifier.duration, criteria:modifier.criteria}));
    const resourcesBeforeReplay = currentResourceSnapshot(player1);
    const replaySlot = document.querySelector(playerZoneSelector(player1, "servants") + " .slot");
    const replay = await playCard("EN000002", replaySlot, {handOccurrenceId:selectedId, returnActionValidation:true});
    await new Promise(resolve => setTimeout(resolve, 300));
    const resourcesAfterReplay = currentResourceSnapshot(player1);
    const afterReplay = auditZoneInventories();
    const afterReplayHandEntries = player1.hand.map((id, index) => ({id, occurrenceId:batch03HandOccurrenceAt(player1, index)}));
    const audit = auditCollectionBatch06Runtime();
    const replayedBoardCard = audit.board.player1.find(card => card.instance === selectedId);
    return {
      mark,
      died,
      before,
      after,
      afterReplay,
      afterReplayHandEntries,
      replay,
      replayedBoardCard,
      boardAfterRescue,
      activeModifiersBeforeReplay,
      resourcesBeforeReplay,
      resourcesAfterReplay,
      hand:[...player1.hand],
      handEntries,
      rescuedEntry,
      unmarkedHandEntry,
      graveyard:[...player1.graveyard],
      board:audit.board.player1,
      events:audit.events,
      untouchedInstance,
      activeModifiers:[...(player1.costModifierState?.active || [])].map(modifier => ({id:modifier.id, sourceId:modifier.sourceId, duration:modifier.duration, criteria:modifier.criteria}))
    };
  });
  expect(result.mark.success).toBe(true);
  expect(result.died).toBe(false);
  expect(result.hand).toContain("EN000002");
  expect(result.graveyard).not.toContain("EN000002");
  expect(result.boardAfterRescue.map(card => card.instance)).toContain(result.untouchedInstance);
  expect(result.boardAfterRescue.map(card => card.instance)).not.toContain(result.mark.target.instance);
  expect(result.events.some(event => event.type === "deplacement-rescue" && event.occurrenceId === result.mark.target.instance)).toBe(true);
  expect(result.activeModifiersBeforeReplay.some(modifier => modifier.sourceId === "S000056" && modifier.duration === "nextEligibleCard" && modifier.criteria.handOccurrenceIds.includes(result.mark.target.instance))).toBe(true);
  expect(result.rescuedEntry.total).toBe(0);
  expect(result.unmarkedHandEntry.total).toBe(fixture.expectedRescue.unprotectedSameIdKeepsPrintedCost);
  expect(result.replay?.success).toBe(true);
  expect(result.replay?.paymentResult?.soulsConsumed).toBe(0);
  expect(result.resourcesAfterReplay).toMatchObject(result.resourcesBeforeReplay);
  expect(result.replayedBoardCard).toMatchObject({id:"EN000002", instance:result.mark.target.instance});
  expect(result.afterReplayHandEntries.map(entry => entry.occurrenceId)).not.toContain(result.mark.target.instance);
  expect(result.afterReplay.player1.graveyard).not.toContain("EN000002");
  expect(result.board.map(card => card.instance)).toContain(result.untouchedInstance);
  expect(result.board.map(card => card.instance)).toContain(result.mark.target.instance);
  expect(result.activeModifiers.some(modifier => modifier.sourceId === "S000056" && modifier.duration === "nextEligibleCard")).toBe(false);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Déplacement instantané target modal is readable and not clipped", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-06-mobilite-elfique");
  await page.evaluate(() => {
    currentPlayer = player1.key;
    const card = document.querySelector(playerZoneSelector(player1, "hand") + ' [data-id="S000056"]');
    void playCard("S000056", card);
    return true;
  });
  const panel = page.locator(".deplacement-instantane-choice-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".decision-modal-minimize")).toBeVisible();
  await expect(panel.locator(".sort-choice-title")).toContainText("Déplacement");
  const firstTarget = panel.locator(".sort-choice-item").first();
  await firstTarget.hover();
  const geometry = await panel.evaluate((node) => {
    const panelBox = node.getBoundingClientRect();
    const targetBox = node.querySelector('.sort-choice-item')?.getBoundingClientRect();
    return {panelTop:panelBox.top, panelBottom:panelBox.bottom, targetTop:targetBox?.top ?? 0, targetBottom:targetBox?.bottom ?? 0, viewportHeight:window.innerHeight};
  });
  expect(geometry.panelTop).toBeGreaterThanOrEqual(0);
  expect(geometry.panelBottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.targetTop).toBeGreaterThanOrEqual(0);
  expect(geometry.targetBottom).toBeLessThanOrEqual(geometry.viewportHeight);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
