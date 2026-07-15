import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-04-status-pulses.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch04=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(100);
}

function diagnosticsFor(page) {
  return attachPageDiagnostics(page);
}

test("Batch-04 scenarios stay hidden but open directly", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    const audit = await page.evaluate((scenarioId) => ({
      current: selectedScenarioId(),
      publicOptionCount: document.querySelectorAll(`#scenarioSelect option[value="${scenarioId}"]`).length,
      panelVisible: !!document.querySelector('[data-testid="test-resource-panel"]')
    }), scenario);
    expect(audit.current).toBe(scenario);
    expect(audit.publicOptionCount, scenario + " public option").toBe(0);
    expect(audit.panelVisible).toBe(true);
  }
  await attachDiagnostics(testInfo, diagnostics);
});

test("Batch-04 visual scenarios expose robust enemy boards and resources", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  const audits = {};
  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    audits[scenario] = await page.evaluate(() => {
      const enemyServants = livingServantCardsForPlayer(player2).map(card => ({
        id: card.dataset.id,
        pdv: Number(card.dataset.pdv || 0),
        pdvMax: Number(card.dataset.pdvMax || card.dataset.pdv || 0),
        dead: !!card.dataset.dead
      }));
      return {
        enemyServants,
        enemyHand: [...player2.hand],
        enemyDeck: [...player2.drawPile],
        enemySupply: qs(playerZoneSelector(player2, "appro"))?.querySelector(".fc")?.dataset.id || null,
        playerSupply: qs(playerZoneSelector(player1, "appro"))?.querySelector(".fc")?.dataset.id || null,
        playerResources: JSON.parse(JSON.stringify(player1.resourceState || {})),
        enemyResources: JSON.parse(JSON.stringify(player2.resourceState || {}))
      };
    });
  }
  for (const [scenario, audit] of Object.entries(audits)) {
    expect(audit.enemyServants.length, scenario + " enemy servants").toBeGreaterThanOrEqual(fixture.scenarioRobustness.minEnemyServants);
    expect(audit.enemyServants.every(card => card.pdv > 0 && card.pdvMax >= card.pdv), scenario + " robust hp").toBe(true);
    expect(audit.enemyHand.length, scenario + " enemy hand").toBeGreaterThanOrEqual(fixture.scenarioRobustness.minEnemyHandCards);
    expect(audit.enemyDeck.length, scenario + " enemy deck").toBeGreaterThanOrEqual(fixture.scenarioRobustness.minEnemyDeckCards);
    expect(audit.enemySupply, scenario + " enemy supply").toBe(fixture.scenarioRobustness.requiredSupply);
    expect(audit.playerSupply, scenario + " player supply").toBe(fixture.scenarioRobustness.requiredSupply);
    expect(audit.playerResources.souls, scenario + " player souls").toBeGreaterThanOrEqual(40);
    expect(audit.enemyResources.souls, scenario + " enemy souls").toBeGreaterThanOrEqual(40);
  }
  await attachDiagnostics(testInfo, diagnostics);
});

test("Colere divine uses one styled on-card counter and ticks 2, 3, then 4 damage", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-status-counters");
  const result = await page.evaluate(async () => {
    const target = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "MV000020");
    batch03UpdateStats(target, {pdvMax:12, pdv:12});
    const snapshotCounter = () => {
      const counters = Array.from(target.querySelectorAll('.batch03-status-counter[data-batch03-status-counter="divine-wrath"]'));
      const counter = counters[0] || null;
      const style = counter ? getComputedStyle(counter) : null;
      return {
        count:counters.length,
        text:(counter?.textContent || "").trim(),
        parentIsCard:counter?.parentElement === target,
        position:style?.position || "",
        bottom:style?.bottom || "",
        right:style?.right || "",
        clipPath:style?.clipPath || ""
      };
    };
    const before = Number(target.dataset.pdv);
    const applied = applyBatch03DivineWrath(target, player1, {sourceCardId:"H000012", reason:"batch04-test"});
    syncBatch03DivineWrathCounter(target);
    syncBatch03DivineWrathCounter(target);
    const initial = snapshotCounter();
    const r1 = {divineWrath:[], divineWrathEchoDrain:[]};
    await resolveBatch03DivineWrathStartTurn(player2, r1);
    const after1 = Number(target.dataset.pdv);
    const tick1 = snapshotCounter();
    const r2 = {divineWrath:[], divineWrathEchoDrain:[]};
    await resolveBatch03DivineWrathStartTurn(player2, r2);
    const after2 = Number(target.dataset.pdv);
    const tick2 = snapshotCounter();
    const r3 = {divineWrath:[], divineWrathEchoDrain:[]};
    await resolveBatch03DivineWrathStartTurn(player2, r3);
    const after3 = Number(target.dataset.pdv);
    const finalCounterCount = target.querySelectorAll('.batch03-status-counter[data-batch03-status-counter="divine-wrath"]').length;
    return {applied, before, initial, after1, tick1, after2, tick2, after3, finalCounterCount, r1, r2, r3};
  });
  expect(result.applied.success).toBe(true);
  expect(result.initial).toMatchObject({count:1, text:fixture.statusCounters.divineWrath.initialCounter, parentIsCard:true, position:"absolute"});
  expect(result.initial.bottom).not.toMatch(/^-/);
  expect(result.initial.right).not.toBe("");
  expect(result.after1).toBe(result.before - fixture.statusCounters.divineWrath.damageByTurn[0]);
  expect(result.tick1.text).toBe(fixture.statusCounters.divineWrath.tickCounters[0]);
  expect(result.after2).toBe(result.after1 - fixture.statusCounters.divineWrath.damageByTurn[1]);
  expect(result.tick2.text).toBe(fixture.statusCounters.divineWrath.tickCounters[1]);
  expect(result.after3).toBe(result.after2 - fixture.statusCounters.divineWrath.damageByTurn[2]);
  expect(result.finalCounterCount).toBe(0);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Colere divine refuses non-undead targets without adding counters", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-status-counters");
  const result = await page.evaluate(() => {
    const undead = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "MV000020");
    const human = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000001");
    const applied = applyBatch03DivineWrath(undead, player1, {sourceCardId:"H000012", reason:"batch04-positive-control"});
    const refused = applyBatch03DivineWrath(human, player1, {sourceCardId:"H000012", reason:"batch04-invalid-control"});
    syncBatch03DivineWrathCounter(human);
    return {
      applied,
      refused,
      humanCounterCount: human.querySelectorAll('.batch03-status-counter[data-batch03-status-counter="divine-wrath"]').length,
      humanHasState: !!human.dataset.batch03DivineWrathTurns
    };
  });
  expect(result.applied.success).toBe(true);
  expect(result.refused).toMatchObject({success:false, reason:"invalid-divine-wrath-target"});
  expect(result.humanCounterCount).toBe(0);
  expect(result.humanHasState).toBe(false);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Hypnose indefinite uses a green ripple, infinity counter and clears on damage", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-status-counters");
  const result = await page.evaluate(async () => {
    const target = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000001");
    const beforeLines = batch03DynamicStatusTexts(target);
    const applied = applyBatch04Hypnosis(target, {untilDamage:true, sourceCardId:"DIV000004"});
    const counter = target.querySelector('.batch03-status-counter[data-batch03-status-counter="hypnose"]');
    const styleBefore = counter ? getComputedStyle(counter) : null;
    const afterApply = {
      active:target.classList.contains("batch03-hypnosis-active"),
      exhausted:target.classList.contains("fc-exhausted"),
      counterText:(counter?.textContent || "").trim(),
      counterPosition:styleBefore?.position || "",
      dynamicLines:batch03DynamicStatusTexts(target)
    };
    await applyDamage(target, 1);
    const afterDamage = {
      active:target.classList.contains("batch03-hypnosis-active"),
      exhausted:target.classList.contains("fc-exhausted"),
      counterCount:target.querySelectorAll('.batch03-status-counter[data-batch03-status-counter="hypnose"]').length,
      hasHypno:!!(target.dataset.hypno || target.dataset.hypnosisUntilDamage),
      dynamicLines:batch03DynamicStatusTexts(target)
    };
    return {beforeLines, applied, afterApply, afterDamage};
  });
  expect(result.applied.success).toBe(true);
  expect(result.afterApply.active).toBe(true);
  expect(result.afterApply.exhausted).toBe(true);
  expect(result.afterApply.counterText).toBe(fixture.statusCounters.hypnosis.indefiniteCounter);
  expect(result.afterApply.counterPosition).toBe("absolute");
  expect(result.afterApply.dynamicLines.join(" ")).toContain("Hypnose");
  expect(result.afterDamage).toMatchObject({active:false, exhausted:false, counterCount:0, hasHypno:false});
  expect(result.afterDamage.dynamicLines.join(" ")).not.toContain("Hypnose");
  await attachDiagnostics(testInfo, diagnostics);
});

test("Gorgone seductrice applies Hypnose only after attacking a surviving legal servant", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-hypnose");
  const result = await page.evaluate(async () => {
    const attacker = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "DIV000004");
    const target = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000001");
    const before = {
      target: targetSummary(target),
      attacker: targetSummary(attacker),
      events: collectionBatch03State.events.length
    };
    await resolveCombat(attacker, target);
    const counter = target.querySelector('.batch03-status-counter[data-batch03-status-counter="hypnose"]');
    const events = collectionBatch03State.events.slice(before.events);
    return {
      before,
      afterTarget: targetSummary(target),
      targetActive: target.classList.contains("batch03-hypnosis-active"),
      targetExhausted: target.classList.contains("fc-exhausted"),
      counterText: (counter?.textContent || "").trim(),
      attackerPulseColor: attacker.dataset.batch04PulseColor || "",
      attackerPulseReason: attacker.dataset.batch03LastPulseReason || "",
      hypnosisEvents: events.filter(event => event.type === "hypnosis-applied"),
      combatEvents: events.filter(event => event.type === "combat-hook")
    };
  });
  expect(result.before.target.pdv).toBeGreaterThan(result.before.attacker.atk);
  expect(result.afterTarget.pdv).toBe(result.before.target.pdv - result.before.attacker.atk);
  expect(result.targetActive).toBe(true);
  expect(result.targetExhausted).toBe(true);
  expect(result.counterText).toBe(fixture.statusCounters.hypnosis.indefiniteCounter);
  expect(result.attackerPulseReason).toBe("combat-hypnosis");
  expect(result.attackerPulseColor).toBe(fixture.pulseColors.DIV000004);
  expect(result.hypnosisEvents).toHaveLength(1);
  expect(result.combatEvents.some(event => event.results?.some(result => result.type === "gorgon-seductress-hypnosis" && result.applied?.success))).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Gorgone seductrice does not pulse or hypnotize dead or Insensible targets", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-hypnose");
  const result = await page.evaluate(async () => {
    const resetGorgonPulse = (gorgon) => {
      delete gorgon.dataset.batch04PulseColor;
      delete gorgon.dataset.batch03LastPulseReason;
      delete gorgon.dataset.batch03LastPulseMove;
      delete gorgon.dataset.batch03PulseMove;
      delete gorgon.dataset.batch03PassivePulse;
      gorgon.style.removeProperty("--batch04-pulse-color");
      gorgon.classList.remove("batch03-ability-pulse", "batch03-ability-pulse-passive");
    };
    const gorgon = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "DIV000004");
    const lethalTarget = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000005");
    batch03UpdateStats(lethalTarget, {pdvMax:2, pdv:2});
    await triggerBatch03CombatHooks(gorgon, lethalTarget, {damageDealt:Number(gorgon.dataset.atk || 0), targetDied:true, phase:"attack"});
    const afterDead = {
      hypno: !!(lethalTarget.dataset.hypno || lethalTarget.dataset.hypnosisUntilDamage),
      pulseReason: gorgon.dataset.batch03LastPulseReason || ""
    };
    resetGorgonPulse(gorgon);
    const insensibleTarget = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "AVS000003");
    const beforeInsensiblePdv = Number(insensibleTarget.dataset.pdv || 0);
    const hook = await triggerBatch03CombatHooks(gorgon, insensibleTarget, {damageDealt:Number(gorgon.dataset.atk || 0), targetDied:false, phase:"attack"});
    return {
      afterDead,
      insensible: {
        beforePdv: beforeInsensiblePdv,
        afterPdv: Number(insensibleTarget.dataset.pdv || 0),
        hypno: !!(insensibleTarget.dataset.hypno || insensibleTarget.dataset.hypnosisUntilDamage),
        pulseReason: gorgon.dataset.batch03LastPulseReason || "",
        hook
      }
    };
  });
  expect(result.afterDead.hypno).toBe(false);
  expect(result.afterDead.pulseReason).toBe("");
  expect(result.insensible.afterPdv).toBe(result.insensible.beforePdv);
  expect(result.insensible.hypno).toBe(false);
  expect(result.insensible.pulseReason).toBe("");
  expect(result.insensible.hook.some(entry => entry.type === "gorgon-seductress-hypnosis" && entry.applied?.success === false)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Hypnose duration displays numeric turns and expires through start-turn ticks", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-status-counters");
  const result = await page.evaluate(async () => {
    const target = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000001");
    applyBatch04Hypnosis(target, {turns:2, sourceCardId:"H000034"});
    const text = () => (target.querySelector('.batch03-status-counter[data-batch03-status-counter="hypnose"]')?.textContent || "").trim();
    const initial = text();
    await applyStartTurnServantAbilities(player2);
    const afterOne = text();
    await applyStartTurnServantAbilities(player2);
    const afterTwo = {
      text:text(),
      active:target.classList.contains("batch03-hypnosis-active"),
      hasHypno:!!target.dataset.hypno
    };
    return {initial, afterOne, afterTwo};
  });
  expect(result.initial).toBe(fixture.statusCounters.hypnosis.durationCounters[0]);
  expect(result.afterOne).toBe(fixture.statusCounters.hypnosis.durationCounters[1]);
  expect(result.afterTwo).toMatchObject({text:"", active:false, hasHypno:false});
  await attachDiagnostics(testInfo, diagnostics);
});

test("Serviteur de la rune flight targets the owner hand and preserves the occurrence", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-rune-return");
  const result = await page.evaluate(async () => {
    player1.hand = [];
    refreshHand(player1);
    const fc = livingServantCardsForPlayer(player1).find(card => card.dataset.id === "H000031");
    const instance = fc.dataset.instance;
    const before = auditCollectionBatch03Runtime();
    const pending = applyDamage(fc, 99);
    await new Promise(resolve => setTimeout(resolve, 980));
    const flight = document.querySelector('.batch03-rune-flight[data-card-id="H000031"]');
    const handRect = document.querySelector(playerZoneSelector(player1, "hand"))?.getBoundingClientRect();
    const flightAudit = flight ? {
      exists:true,
      target:flight.dataset.flightTarget,
      ownerId:flight.dataset.ownerId,
      fromX:Number(flight.dataset.fromX),
      fromY:Number(flight.dataset.fromY),
      toX:Number(flight.dataset.toX),
      toY:Number(flight.dataset.toY),
      animation:getComputedStyle(flight).animationName,
      insideHandX:handRect ? Number(flight.dataset.toX) >= handRect.left - 120 && Number(flight.dataset.toX) <= handRect.right + 120 : false,
      nearHandY:handRect ? Math.abs(Number(flight.dataset.toY) - (handRect.top + handRect.height / 2 - 64)) < 40 : false
    } : {exists:false};
    await pending;
    const after = auditCollectionBatch03Runtime();
    const returned = document.querySelector(`.hc[data-id="H000031"][data-occurrence-id="${instance}"], .hc[data-id="H000031"][data-instance="${instance}"]`);
    return {before, after, instance, flightAudit, returnedExists:!!returned};
  });
  expect(result.flightAudit).toMatchObject({exists:true, target:fixture.runeReturn.destination, ownerId:"player1"});
  expect(result.flightAudit.animation).toContain("batch03RuneFlight");
  expect(result.flightAudit.insideHandX).toBe(true);
  expect(result.flightAudit.nearHandY).toBe(true);
  expect(result.after.zones.player1.hand).toContain("H000031");
  expect(result.after.zones.player1.graveyard).not.toContain("H000031");
  expect(result.after.board.player1.map(card => card.id)).not.toContain("H000031");
  expect(result.after.state.events.some(event => event.type === "rune-return-to-hand" && event.sourceInstanceId === result.instance)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Ability pulses use faction colors, passive loops stay still and failures do not pulse", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-pulses");
  const result = await page.evaluate(async (expectedColors) => {
    const colors = {};
    for (const [cardId] of Object.entries(expectedColors)) {
      const fc = livingServantCardsForPlayer(player1).find(card => card.dataset.id === cardId);
      pulseBatch03Ability(fc, cardId === "DIV000004" ? "passive" : "start-turn", {passive:cardId === "DIV000004", move:cardId !== "DIV000004"});
      colors[cardId] = {
        dataset:fc.dataset.batch04PulseColor,
        css:fc.style.getPropertyValue("--batch04-pulse-color"),
        passive:fc.dataset.batch03PassivePulse || "",
        move:fc.dataset.batch03PulseMove || ""
      };
    }
    const zone = document.querySelector(playerZoneSelector(player1, "servants"));
    zone.innerHTML = Array.from({length:5}, () => `<div class="fc" data-id="H000001" data-player="${player1.key}" data-instance="blocking-${Math.random()}"></div>`).join("");
    const failed = await summonBatch03Servant(player1, "H000031", {triggerInitiativeEffect:true, ready:true});
    const source = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000031");
    const events = collectionBatch03State.events.slice();
    return {colors, failed, sourceExists:!!source, initiativeEvents:events.filter(event => event.type === "initiative" && event.cardId === "H000031")};
  }, fixture.pulseColors);
  for (const [cardId, color] of Object.entries(fixture.pulseColors)) {
    expect(result.colors[cardId].dataset, cardId).toBe(color);
    expect(result.colors[cardId].css, cardId).toBe(color);
  }
  expect(result.colors.DIV000004.passive).toBe("1");
  expect(result.colors.DIV000004.move).toBe("0");
  expect(result.failed.success).toBe(false);
  expect(result.sourceExists).toBe(false);
  expect(result.initiativeEvents).toHaveLength(0);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Undergast replays no-target, legal-target, retarget and Echo-cost spells without duplicate costs", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-undergast-cases");
  const result = await page.evaluate(async () => {
    const resetBoard = () => {
      const zone1 = document.querySelector(playerZoneSelector(player1, "servants"));
      const zone2 = document.querySelector(playerZoneSelector(player2, "servants"));
      zone1.innerHTML = Array.from({length:5}, () => `<div class="slot" data-player="${player1.key}"></div>`).join("");
      zone2.innerHTML = Array.from({length:5}, () => `<div class="slot" data-player="${player2.key}"></div>`).join("");
    };
    const resourceCopy = () => JSON.parse(JSON.stringify(player1.resourceState || {}));

    resetBoard();
    await summonBatch03Servant(player1, "AVS000003", {triggerInitiativeEffect:false, ready:true});
    player1.hand = ["S000051"];
    player1.graveyard = ["MV000001"];
    player2.graveyard = ["H000001","R000001"];
    player1.resourceState.classical.aria = 40;
    refreshHand(player1);
    refreshRuntimeZone(player1, "graveyard");
    refreshRuntimeZone(player2, "graveyard");
    const noTargetBefore = {hand:[...player1.hand], selfGrave:[...player1.graveyard], oppGrave:[...player2.graveyard]};
    const noTarget = await playCard("S000051");
    const noTargetAfter = {hand:[...player1.hand], selfGrave:[...player1.graveyard], oppGrave:[...player2.graveyard], events:collectionBatch03State.events.slice()};

    resetBoard();
    await summonBatch03Servant(player1, "AVS000003", {triggerInitiativeEffect:false, ready:true});
    const healSummon = await summonBatch03Servant(player1, "H000001", {triggerInitiativeEffect:false, ready:true});
    const healTarget = document.querySelector(`.fc[data-instance="${healSummon.instanceId}"]`);
    batch03UpdateStats(healTarget, {pdvMax:20, pdv:4});
    player1.hand = ["S000010"];
    player1.resourceState.classical.aria = 40;
    refreshHand(player1);
    const sameTarget = await playCard("S000010", null, {selectedTargetIds:[healTarget.dataset.instance]});
    const sameTargetAfter = {pdv:Number(healTarget.dataset.pdv), events:collectionBatch03State.events.slice()};

    resetBoard();
    await summonBatch03Servant(player1, "AVS000003", {triggerInitiativeEffect:false, ready:true});
    const targetA = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const targetB = await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    player1.hand = ["S000005"];
    player1.resourceState.classical.aria = 40;
    refreshHand(player1);
    const retarget = await playCard("S000005", null, {selectedTargetIds:[targetA.instanceId]});
    const retargetAfter = {board:livingServantCardsForPlayer(player2).map(targetSummary), graveyard:[...player2.graveyard], targetB, events:collectionBatch03State.events.slice()};

    resetBoard();
    await summonBatch03Servant(player1, "AVS000003", {triggerInitiativeEffect:false, ready:true});
    player1.hand = [];
    player1.resourceState.classical.aria = 0;
    player1.resourceState.souls = 10;
    refreshHand(player1);
    const resourcesBefore = resourceCopy();
    const affordability = getCardAffordabilityResult("S000044", player1);
    const payment = affordability?.playable ? applyPaymentPlan(player1, affordability.paymentPlan, {cardId:"S000044"}) : {success:false, reason:"not-playable"};
    const echoCost = await handleBatch03SpellResolved("S000044", player1, {spellResolution:{success:true}});
    const resourcesAfter = resourceCopy();
    const echoEvents = collectionBatch03State.events.filter(event => event.type === "spell-echo" && event.cardId === "S000044");
    return {noTargetBefore, noTarget, noTargetAfter, sameTarget, sameTargetAfter, retarget, retargetAfter, resourcesBefore, resourcesAfter, affordability, payment, echoCost, echoEvents, finalHand:[...player1.hand], finalGrave:[...player1.graveyard]};
  });
  expect(result.noTarget.success).toBe(true);
  expect(result.noTargetAfter.selfGrave).toEqual(["MV000001","H000001","R000001","S000051"]);
  expect(result.noTargetAfter.oppGrave).toEqual([]);
  expect(result.noTargetAfter.events.filter(event => event.type === "spell-echo" && event.cardId === "S000051").length).toBeGreaterThanOrEqual(1);
  expect(result.sameTarget.success).toBe(true);
  expect(result.sameTargetAfter.pdv).toBeGreaterThan(10);
  expect(result.sameTargetAfter.events.some(event => event.type === "spell-echo" && event.cardId === "S000010" && event.echoContext?.context?.selectedTargetIds?.length === 1 && !event.echoContext.context.batch03EchoRetargeted)).toBe(true);
  expect(result.retarget.success).toBe(true);
  expect(result.retargetAfter.graveyard).toEqual(expect.arrayContaining(["H000001","H000005"]));
  expect(result.retargetAfter.board.map(card => card.id)).not.toContain("H000005");
  expect(result.retargetAfter.events
    .some(event => event.type === "spell-echo" && event.cardId === "S000005" && event.echoContext?.context?.batch03EchoRetargeted)).toBe(true);
  expect(result.resourcesBefore.souls).toBe(10);
  expect(result.affordability.playable).toBe(true);
  expect(result.payment.success).toBe(true);
  expect(result.resourcesAfter.souls).toBe(4);
  expect(result.echoCost.echoed).toBe(true);
  expect(result.echoEvents.length).toBeGreaterThanOrEqual(1);
  expect(result.finalHand).not.toContain("S000044");
  await attachDiagnostics(testInfo, diagnostics);
});
