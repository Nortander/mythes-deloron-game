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

test("Batch-04 scenarios no longer use R000010 examples", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    const audit = await page.evaluate(() => {
      const collect = (player) => ({
        hand:[...player.hand],
        deck:[...player.drawPile],
        graveyard:[...player.graveyard],
        servants:livingServantCardsForPlayer(player).map(fc => fc.dataset.id)
      });
      return {player1:collect(player1), player2:collect(player2)};
    });
    for (const playerAudit of [audit.player1, audit.player2]) {
      expect(playerAudit.hand, scenario + " hand").not.toContain("R000010");
      expect(playerAudit.deck, scenario + " deck").not.toContain("R000010");
      expect(playerAudit.graveyard, scenario + " graveyard").not.toContain("R000010");
      expect(playerAudit.servants, scenario + " servants").not.toContain("R000010");
    }
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
      afterAttacker: targetSummary(attacker),
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
  expect(result.afterAttacker.pdv).toBe(result.before.attacker.pdv);
  expect(result.targetActive).toBe(true);
  expect(result.targetExhausted).toBe(true);
  expect(result.counterText).toBe(fixture.statusCounters.hypnosis.indefiniteCounter);
  expect(result.attackerPulseReason).toBe("combat-hypnosis");
  expect(result.attackerPulseColor).toBe(fixture.pulseColors.DIV000004);
  expect(result.hypnosisEvents).toHaveLength(1);
  expect(result.combatEvents.some(event => event.results?.some(result => result.type === "gorgon-seductress-hypnosis" && result.applied?.success))).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Hypnose prevents attacks and counterattacks until damage wakes the servant", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-hypnose");
  const result = await page.evaluate(async () => {
    const gorgon = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "DIV000004");
    const target = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000001");
    const gorgonBefore = targetSummary(gorgon);
    await resolveCombat(gorgon, target);
    currentPlayer = player2.key;
    attackingFC = null;
    tryAttack(target);
    const refusedWhileHypnotized = {
      attackingInstance: attackingFC?.dataset?.instance || null,
      errorText:(document.querySelector("#errMsg")?.textContent || "").trim(),
      target:targetSummary(target)
    };
    await applyDamage(target, 1);
    attackingFC = null;
    tryAttack(target);
    const afterWake = {
      attackingInstance: attackingFC?.dataset?.instance || null,
      target:targetSummary(target),
      classActive:target.classList.contains("batch03-hypnosis-active"),
      exhausted:target.classList.contains("fc-exhausted")
    };
    cancelAttack();
    return {gorgonBefore, gorgonAfter:targetSummary(gorgon), refusedWhileHypnotized, afterWake};
  });
  expect(result.gorgonAfter.pdv).toBe(result.gorgonBefore.pdv);
  expect(result.refusedWhileHypnotized.attackingInstance).toBeNull();
  expect(result.refusedWhileHypnotized.errorText).toContain("Hypnose");
  expect(result.refusedWhileHypnotized.target.hypnotized).toBe(true);
  expect(result.afterWake.target.hypnotized).toBe(false);
  expect(result.afterWake.classActive).toBe(false);
  expect(result.afterWake.exhausted).toBe(false);
  expect(result.afterWake.attackingInstance).toBe(result.refusedWhileHypnotized.target.instance);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Hypnose blocks the defender counterattack for the combat that wakes it", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-hypnose");
  const result = await page.evaluate(async () => {
    const attacker = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000012");
    const defender = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000001");
    batch03UpdateStats(attacker, {atk:2, pdvMax:14, pdv:14});
    batch03UpdateStats(defender, {atk:5, pdvMax:12, pdv:12});
    applyBatch04Hypnosis(defender, {untilDamage:true, sourceCardId:"DIV000004"});
    const before = {attacker:targetSummary(attacker), defender:targetSummary(defender)};
    await resolveCombat(attacker, defender);
    const afterWakeCombat = {attacker:targetSummary(attacker), defender:targetSummary(defender)};
    await resolveCombat(attacker, defender);
    const afterNextCombat = {attacker:targetSummary(attacker), defender:targetSummary(defender)};
    return {before, afterWakeCombat, afterNextCombat};
  });
  expect(result.before.defender.hypnotized).toBe(true);
  expect(result.afterWakeCombat.defender.hypnotized).toBe(false);
  expect(result.afterWakeCombat.defender.pdv).toBe(result.before.defender.pdv - result.before.attacker.atk);
  expect(result.afterWakeCombat.attacker.pdv).toBe(result.before.attacker.pdv);
  expect(result.afterNextCombat.attacker.pdv).toBe(result.afterWakeCombat.attacker.pdv - result.afterWakeCombat.defender.atk);
  expect(result.afterNextCombat.defender.pdv).toBe(result.afterWakeCombat.defender.pdv - result.before.attacker.atk);
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
      gorgon.classList.remove("batch03-ability-pulse", "batch03-ability-pulse-move", "batch03-passive-pulse");
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
  const result = await page.evaluate(async ({expectedColors, passiveIds}) => {
    const zone = document.querySelector(playerZoneSelector(player1, "servants"));
    zone.innerHTML = "";
    for (const cardId of Object.keys(expectedColors)) {
      zone.insertAdjacentHTML("beforeend", buildFC(cardId, player1.key));
      const fc = zone.lastElementChild;
      applyScenarioServantState(fc, {pdvMax:20, pdv:20, prepared:true});
    }
    const colors = {};
    for (const [cardId] of Object.entries(expectedColors)) {
      const fc = livingServantCardsForPlayer(player1).find(card => card.dataset.id === cardId);
      const passivePulse = cardId === "DIV000004" || passiveIds.includes(cardId);
      pulseBatch03Ability(fc, passivePulse ? "passive" : "start-turn", {passive:passivePulse, move:!passivePulse});
      const style = getComputedStyle(fc);
      colors[cardId] = {
        dataset:fc.dataset.batch04PulseColor,
        css:fc.style.getPropertyValue("--batch04-pulse-color"),
        passive:fc.dataset.batch03PassivePulse || "",
        move:fc.dataset.batch03PulseMove || "",
        classAbility:fc.classList.contains("batch03-ability-pulse"),
        classMove:fc.classList.contains("batch03-ability-pulse-move"),
        classPassive:fc.classList.contains("batch03-passive-pulse"),
        classPassiveGlow:fc.classList.contains("batch04-passive-glow"),
        animationName:style.animationName,
        animationDuration:style.animationDuration,
        faction:CARDS_DATA[cardId]?.fac || ""
      };
    }
    const blockingZone = document.querySelector(playerZoneSelector(player1, "servants"));
    blockingZone.innerHTML = Array.from({length:5}, () => "<div class=\"fc\" data-id=\"H000001\" data-player=\"" + player1.key + "\" data-instance=\"blocking-" + Math.random() + "\"></div>").join("");
    const failed = await summonBatch03Servant(player1, "H000031", {triggerInitiativeEffect:true, ready:true});
    const source = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000031");
    const events = collectionBatch03State.events.slice();
    return {colors, failed, sourceExists:!!source, initiativeEvents:events.filter(event => event.type === "initiative" && event.cardId === "H000031")};
  }, {expectedColors:fixture.pulseColors, passiveIds:fixture.passives.permanentPassiveIds});
  for (const [cardId, color] of Object.entries(fixture.pulseColors)) {
    expect(result.colors[cardId].dataset, cardId).toBe(color);
    expect(result.colors[cardId].css, cardId).toBe(color);
  }
  expect(result.colors.DIV000004.passive).toBe("1");
  expect(result.colors.DIV000004.move).toBe("0");
  expect(result.colors.DIV000004.classPassive).toBe(true);
  expect(result.colors.DIV000004.classPassiveGlow).toBe(true);
  expect(result.colors.DIV000004.classMove).toBe(false);
  expect(result.colors.AVS000005.passive).toBe("1");
  expect(result.colors.AVS000005.move).toBe("0");
  expect(result.colors.AVS000005.classPassive).toBe(true);
  expect(result.colors.AVS000005.classPassiveGlow).toBe(true);
  expect(result.colors.AVS000005.classMove).toBe(false);
  for (const cardId of fixture.passives.permanentPassiveIds) {
    expect(result.colors[cardId].passive, cardId).toBe("1");
    expect(result.colors[cardId].move, cardId).toBe("0");
    expect(result.colors[cardId].classPassive, cardId).toBe(true);
    expect(result.colors[cardId].classPassiveGlow, cardId).toBe(true);
    expect(result.colors[cardId].animationName, cardId).toContain("batch04PassiveGlow");
    expect(result.colors[cardId].animationDuration, cardId).toContain("2.8s");
  }
  expect(result.colors.TRL000020).toMatchObject({dataset:"#b4902073", faction:"trl", move:"1", classAbility:true, classMove:true});
  expect(result.colors.N000004).toMatchObject({dataset:"#a0a8b866", faction:"nain", move:"1", classAbility:true, classMove:true});
  expect(result.failed.success).toBe(false);
  expect(result.sourceExists).toBe(false);
  expect(result.initiativeEvents).toHaveLength(0);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Ump uses full Troll terrain theme and Troll pulse color", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-pulses");
  const result = await page.evaluate((expectedColor) => {
    const source = livingServantCardsForPlayer(player2).find(card => card.dataset.id === "TRL000020");
    if (!source) return {found:false};
    pulseBatch03Ability(source, "test-troll-theme", {move:true});
    const preview = source.cloneNode(true);
    document.body.appendChild(preview);
    const sourceStyle = getComputedStyle(source);
    const imageStyle = getComputedStyle(source.querySelector(".fi"));
    const previewStyle = getComputedStyle(preview);
    const audit = {
      found:true,
      fac:source.dataset.fac || "",
      cardFac:CARDS_DATA.TRL000020?.fac || "",
      hasClass:source.classList.contains("trl-fc"),
      previewHasClass:preview.classList.contains("trl-fc"),
      background:sourceStyle.backgroundImage,
      boxShadow:sourceStyle.boxShadow,
      factionColor:sourceStyle.getPropertyValue("--card-faction-color").trim(),
      imageBorderColor:imageStyle.borderColor,
      imageBoxShadow:imageStyle.boxShadow,
      previewBackground:previewStyle.backgroundImage,
      pulseColor:source.dataset.batch04PulseColor || "",
      pulseMove:source.dataset.batch03PulseMove || "",
      pulseClass:source.classList.contains("batch03-ability-pulse"),
      expectedColor
    };
    preview.remove();
    return audit;
  }, fixture.pulseColors.TRL000020);
  expect(result.found).toBe(true);
  expect(result.cardFac).toBe("trl");
  expect(result.fac).toBe("trl");
  expect(result.hasClass).toBe(true);
  expect(result.previewHasClass).toBe(true);
  expect(result.background).toContain("gradient");
  expect(result.previewBackground).toContain("gradient");
  expect(result.boxShadow).not.toBe("none");
  expect(result.factionColor).toBe("#e0a840");
  expect(result.imageBorderColor).toBe("rgb(122, 60, 16)");
  expect(result.imageBoxShadow).toContain("180");
  expect(result.pulseColor).toBe(fixture.pulseColors.TRL000020);
  expect(result.pulseMove).toBe("1");
  expect(result.pulseClass).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Nain pulse representative is played from hand and triggers a real supply Initiative", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-pulses");
  const result = await page.evaluate(async (config) => {
    currentPlayer = player1.key;
    const servantZone = document.querySelector(playerZoneSelector(player1, "servants"));
    const extraSlot = document.createElement("div");
    extraSlot.className = "slot";
    extraSlot.dataset.player = player1.key;
    servantZone.appendChild(extraSlot);
    const before = {
      hand:[...player1.hand],
      deck:[...player1.drawPile],
      board:livingServantCardsForPlayer(player1).map(card => card.dataset.id),
      freeSlots:document.querySelectorAll(`${playerZoneSelector(player1, "servants")} .slot`).length,
      runtimeHasReplacement:!!CARDS_DATA[config.replacementCandidateId]
    };
    const slot = document.querySelector(`${playerZoneSelector(player1, "servants")} .slot`);
    const played = await playCard(config.cardId, slot, {returnActionValidation:true});
    const source = livingServantCardsForPlayer(player1).find(card => card.dataset.id === config.cardId);
    return {
      before,
      played,
      after:{
        hand:[...player1.hand],
        deck:[...player1.drawPile],
        board:livingServantCardsForPlayer(player1).map(card => card.dataset.id),
        graveyard:[...player1.graveyard],
        pulseReason:source?.dataset.batch03LastPulseReason || "",
        pulseColor:source?.dataset.batch04PulseColor || "",
        move:source?.dataset.batch03PulseMove || "",
        classAbility:!!source?.classList.contains("batch03-ability-pulse"),
        classMove:!!source?.classList.contains("batch03-ability-pulse-move")
      }
    };
  }, fixture.passives.nainRepresentative);
  expect(result.before.runtimeHasReplacement).toBe(fixture.passives.nainRepresentative.replacementCandidateRuntimeAvailable);
  expect(result.before.hand).toContain(fixture.passives.nainRepresentative.cardId);
  expect(result.before.board).not.toContain(fixture.passives.nainRepresentative.cardId);
  expect(result.before.deck).toContain(fixture.passives.nainRepresentative.drawnSupplyId);
  expect(result.before.freeSlots).toBeGreaterThan(0);
  expect(result.played?.success).not.toBe(false);
  expect(result.after.board).toContain(fixture.passives.nainRepresentative.cardId);
  expect(result.after.hand).not.toContain(fixture.passives.nainRepresentative.cardId);
  expect(result.after.hand).toContain(fixture.passives.nainRepresentative.drawnSupplyId);
  expect(result.after.deck).not.toContain(fixture.passives.nainRepresentative.drawnSupplyId);
  expect(result.after.pulseReason).toBe("initiative");
  expect(result.after.pulseColor).toBe(fixture.pulseColors.N000004);
  expect(result.after).toMatchObject({move:"1", classAbility:true, classMove:true});
  await attachDiagnostics(testInfo, diagnostics);
});

test("Yria passive doubles healing, draws one extra card and keeps an immobile pulse", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-pulses");
  const result = await page.evaluate(async (config) => {
    const yria = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === config.cardId);
    const target = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === config.healTargetId);
    const passiveStyleBefore = getComputedStyle(yria);
    const passiveBefore = {
      reason:yria.dataset.batch03LastPulseReason || "",
      passive:yria.dataset.batch03PassivePulse || "",
      move:yria.dataset.batch03PulseMove || "",
      color:yria.dataset.batch04PulseColor || "",
      classGlow:yria.classList.contains("batch04-passive-glow"),
      classPassive:yria.classList.contains("batch03-passive-pulse"),
      animationName:passiveStyleBefore.animationName,
      animationDuration:passiveStyleBefore.animationDuration
    };
    batch03UpdateStats(target, {pdvMax:10, pdv:2});
    const heal = applyHeal(target, config.healRequested);
    player1.firstTurnStarted = true;
    player1.turnState = {};
    player1.drawPile = ["H000001", "H000005", "H000024"];
    player1.hand = [];
    refreshHand(player1);
    updateDeckCount(player1);
    const beforeDraw = {hand:player1.hand.length, deck:player1.drawPile.length};
    const drawn = await runStartTurnPipeline(player1);
    const trace = getLastStartTurnTrace();
    const afterDraw = {hand:player1.hand.length, deck:player1.drawPile.length};
    const pulseStyleAfter = getComputedStyle(yria);
    return {
      passiveBefore,
      heal,
      target:targetSummary(target),
      drawn,
      trace,
      beforeDraw,
      afterDraw,
      yriaPulse:{
        reason:yria.dataset.batch03LastPulseReason || "",
        passive:yria.dataset.batch03PassivePulse || "",
        move:yria.dataset.batch03PulseMove || "",
        color:yria.dataset.batch04PulseColor || "",
        classGlow:yria.classList.contains("batch04-passive-glow"),
        classPassive:yria.classList.contains("batch03-passive-pulse"),
        animationName:pulseStyleAfter.animationName,
        animationDuration:pulseStyleAfter.animationDuration
      }
    };
  }, fixture.passives.yria);
  expect(result.passiveBefore).toMatchObject({passive:"1", move:"0", color:fixture.pulseColors.AVS000005, classGlow:true, classPassive:true});
  expect(result.passiveBefore.animationName).toContain("batch04PassiveGlow");
  expect(result.passiveBefore.animationDuration).toContain("2.8s");
  expect(result.heal.success).toBe(true);
  expect(result.heal.requested).toBe(fixture.passives.yria.healRequested);
  expect(result.heal.gained).toBe(fixture.passives.yria.healExpectedGain);
  expect(result.heal.healModifier.multiplier).toBe(2);
  expect(result.target.pdv).toBe(2 + fixture.passives.yria.healExpectedGain);
  expect(result.afterDraw.hand - result.beforeDraw.hand).toBe(2);
  expect(result.beforeDraw.deck - result.afterDraw.deck).toBe(2);
  expect(result.trace.drawResult.success).toBe(true);
  expect(result.trace.yriaExtraDraw.success).toBe(true);
  expect(result.yriaPulse).toMatchObject({passive:"1", move:"0", color:fixture.pulseColors.AVS000005, classGlow:true, classPassive:true});
  expect(result.yriaPulse.animationName).toContain("batch04PassiveGlow");
  expect(result.yriaPulse.animationDuration).toContain("2.8s");
  await attachDiagnostics(testInfo, diagnostics);
});

test("Remaining AVS audit implements Raith and Zahaar while deferring Isgrimm", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-pulses");
  const result = await page.evaluate(async (audit) => {
    const resetBoard = () => {
      for (const player of [player1, player2]) {
        const zone = document.querySelector(playerZoneSelector(player, "servants"));
        zone.innerHTML = Array.from({length:5}, () => "<div class=\"slot\" data-player=\"" + player.key + "\"></div>").join("");
        player.hand = [];
        player.drawPile = [];
        player.graveyard = [];
        player.firstTurnStarted = false;
        player.turnState = {};
        refreshHand(player);
        updateDeckCount(player);
        refreshCemeteryVisual(player);
      }
    };
    const summon = async (player, cardId, pdv=20) => {
      const result = await summonBatch03Servant(player, cardId, {triggerInitiativeEffect:false, ready:true});
      const fc = document.querySelector(".fc[data-instance=\"" + result.instanceId + "\"]");
      if (fc) applyScenarioServantState(fc, {pdvMax:pdv, pdv, prepared:true});
      return fc;
    };
    const runtimeAvs = audit.avsIds.map(id => ({id, present:!!CARDS_DATA[id], name:CARDS_DATA[id]?.name || ""}));
    resetBoard();
    const raith = await summon(player1, "AVS000009", 40);
    const raithTargets = [await summon(player2, "H000005", 20), await summon(player2, "H000005", 20), await summon(player2, "H000005", 20)];
    window.__mythesRandom = () => 0.4;
    const raithBefore = raithTargets.map(targetSummary);
    const raithResult = await applyBatch03StartTurnAbilities(player1);
    const raithAfter = raithTargets.map(targetSummary);
    const raithPulse = {reason:raith.dataset.batch03LastPulseReason || "", color:raith.dataset.batch04PulseColor || "", move:raith.dataset.batch03PulseMove || "", classAbility:raith.classList.contains("batch03-ability-pulse")};
    delete window.__mythesRandom;
    resetBoard();
    const zahaar = await summon(player1, "AVS000012", 40);
    const zahaarTargets = [await summon(player2, "H000005", 20), await summon(player2, "H000005", 20), await summon(player2, "H000005", 20)];
    const zahaarBefore = zahaarTargets.map(targetSummary);
    const zahaarFirst = await applyBatch03StartTurnAbilities(player1);
    const zahaarAfterFirst = zahaarTargets.map(targetSummary);
    const zahaarSecond = await applyBatch03StartTurnAbilities(player1);
    const zahaarAfterSecond = zahaarTargets.map(targetSummary);
    const zahaarPulse = {reason:zahaar.dataset.batch03LastPulseReason || "", color:zahaar.dataset.batch04PulseColor || "", move:zahaar.dataset.batch03PulseMove || "", classAbility:zahaar.classList.contains("batch03-ability-pulse")};
    const isgrimmInitiative = await resolveBatch03Initiative("AVS000013", player1, {});
    return {
      runtimeAvs,
      raith:{before:raithBefore, after:raithAfter, result:raithResult, pulse:raithPulse},
      zahaar:{before:zahaarBefore, afterFirst:zahaarAfterFirst, afterSecond:zahaarAfterSecond, first:zahaarFirst, second:zahaarSecond, pulse:zahaarPulse, nextDamage:zahaar.dataset.batch04ZahaarDamage || ""},
      isgrimm:{present:!!CARDS_DATA.AVS000013, keywords:CARDS_DATA.AVS000013?.kws || [], initiative:isgrimmInitiative},
      deferred:audit.deferred
    };
  }, fixture.avatarAudit);
  expect(result.runtimeAvs.filter(card => !card.present)).toEqual([]);
  expect(result.raith.result.raithPassive).toHaveLength(1);
  const raithEffect = result.raith.result.raithPassive[0];
  expect(raithEffect.source.id).toBe("AVS000009");
  const raithBeforeByInstance = new Map(result.raith.before.map(card => [card.instance, card]));
  const raithAfterByInstance = new Map(result.raith.after.map(card => [card.instance, card]));
  expect(raithAfterByInstance.get(raithEffect.central.instance).pdv).toBe(raithBeforeByInstance.get(raithEffect.central.instance).pdv - 10);
  for (const adjacent of raithEffect.adjacent) {
    expect(raithAfterByInstance.get(adjacent.target.instance).pdv).toBe(raithBeforeByInstance.get(adjacent.target.instance).pdv - 5);
  }
  const affectedInstances = new Set([raithEffect.central.instance, ...raithEffect.adjacent.map(item => item.target.instance)]);
  for (const before of result.raith.before) {
    if (!affectedInstances.has(before.instance)) expect(raithAfterByInstance.get(before.instance).pdv).toBe(before.pdv);
  }
  expect(result.raith.pulse).toMatchObject({reason:"start-turn", color:fixture.pulseColors.AVS000009, move:"1", classAbility:true});
  expect(result.zahaar.first.zahaarPassive).toHaveLength(1);
  expect(result.zahaar.first.zahaarPassive[0].source.id).toBe("AVS000012");
  expect(result.zahaar.first.zahaarPassive[0]).toMatchObject({amount:1, nextAmount:2});
  expect(result.zahaar.second.zahaarPassive).toHaveLength(1);
  expect(result.zahaar.second.zahaarPassive[0].source.id).toBe("AVS000012");
  expect(result.zahaar.second.zahaarPassive[0]).toMatchObject({amount:2, nextAmount:3});
  for (let index = 0; index < result.zahaar.before.length; index += 1) {
    expect(result.zahaar.afterFirst[index].pdv).toBe(result.zahaar.before[index].pdv - 1);
    expect(result.zahaar.afterSecond[index].pdv).toBe(result.zahaar.before[index].pdv - 3);
  }
  expect(result.zahaar.nextDamage).toBe("3");
  expect(result.zahaar.pulse).toMatchObject({reason:"start-turn", color:fixture.pulseColors.AVS000012, move:"1", classAbility:true});
  expect(result.isgrimm.present).toBe(true);
  expect(result.isgrimm.keywords).toContain("Serviteur de la rune");
  expect(result.isgrimm.initiative?.handled).toBe(false);
  expect(result.deferred.AVS000013).toContain("Choix cimetiere/deck");
  await attachDiagnostics(testInfo, diagnostics);
});

test("Mageobelin lance-cailloux damages one valid enemy at end turn and stays silent without targets", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-pulses");
  const result = await page.evaluate(async (config) => {
    const zone = document.querySelector(playerZoneSelector(player2, "servants"));
    zone.innerHTML = "";
    zone.insertAdjacentHTML("beforeend", buildFC(config.damageTargetId, player2.key));
    const target = zone.lastElementChild;
    applyScenarioServantState(target, {pdvMax:12, pdv:12, prepared:true});
    const mage = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === config.cardId);
    const before = {target:targetSummary(target), mage:targetSummary(mage)};
    const applied = await applyBatch03EndTurnAbilities(player1);
    const after = {target:targetSummary(target), mage:targetSummary(mage), pulseReason:mage.dataset.batch03LastPulseReason || "", pulseColor:mage.dataset.batch04PulseColor || "", pulseMove:mage.dataset.batch03PulseMove || "", classAbility:mage.classList.contains("batch03-ability-pulse"), classMove:mage.classList.contains("batch03-ability-pulse-move")};
    delete mage.dataset.batch04PulseColor;
    delete mage.dataset.batch03LastPulseReason;
    mage.style.removeProperty("--batch04-pulse-color");
    mage.classList.remove("batch03-ability-pulse", "batch03-ability-pulse-move", "batch03-passive-pulse", "batch04-passive-glow");
    target.dataset.insensible = "1";
    const refused = await applyBatch03EndTurnAbilities(player1);
    const refusedAfter = {target:targetSummary(target), pulseReason:mage.dataset.batch03LastPulseReason || "", pulseColor:mage.dataset.batch04PulseColor || ""};
    return {before, applied, after, refused, refusedAfter};
  }, fixture.passives.mageobelin);
  expect(result.applied.mageobelinThrows).toHaveLength(1);
  expect(result.applied.mageobelinThrows[0]).toMatchObject({success:true, amount:result.before.mage.atk});
  expect(result.after.target.pdv).toBe(result.before.target.pdv - result.before.mage.atk);
  expect(result.after.pulseReason).toBe("end-turn");
  expect(result.after.pulseColor).toBe(fixture.pulseColors.GOB000001);
  expect(result.after.pulseMove).toBe("1");
  expect(result.after.classAbility).toBe(true);
  expect(result.after.classMove).toBe(true);
  expect(result.refused.mageobelinThrows).toHaveLength(1);
  expect(result.refused.mageobelinThrows[0]).toMatchObject({success:false, reason:"no-valid-target"});
  expect(result.refusedAfter.target.pdv).toBe(result.after.target.pdv);
  expect(result.refusedAfter.pulseReason).toBe("");
  expect(result.refusedAfter.pulseColor).toBe("");
  await attachDiagnostics(testInfo, diagnostics);
});


test("Batch-04 pulse scenario exposes remaining avatars and passive cards visually", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-pulses");
  const result = await page.evaluate((visibleIds) => {
    syncBatch04PassivePulses();
    return visibleIds.map(cardId => {
      const fc = livingServantCardsForPlayer(player1).concat(livingServantCardsForPlayer(player2)).find(card => card.dataset.id === cardId);
      const style = fc ? getComputedStyle(fc) : null;
      return {
        cardId,
        found:!!fc,
        player:fc?.dataset.player || "",
        passive:fc?.dataset.batch03PassivePulse || "",
        glow:!!fc?.classList.contains("batch04-passive-glow"),
        animationName:style?.animationName || ""
      };
    });
  }, fixture.passives.scenarioVisibleCards);
  const byId = new Map(result.map(entry => [entry.cardId, entry]));
  for (const cardId of fixture.passives.scenarioVisibleCards) expect(byId.get(cardId)?.found, cardId).toBe(true);
  for (const cardId of fixture.passives.permanentPassiveIds) {
    expect(byId.get(cardId)).toMatchObject({passive:"1", glow:true});
    expect(byId.get(cardId).animationName).toContain("batch04PassiveGlow");
  }
  expect(byId.get(fixture.passives.rempartOnly.cardId)).toMatchObject({passive:"", glow:false});
  await attachDiagnostics(testInfo, diagnostics);
});

test("Point abilities pulse only after real mutations for Rhaekor, priest and undead goblin", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-04-pulses");
  const result = await page.evaluate(async (config) => {
    const resetBoard = () => {
      for (const player of [player1, player2]) {
        const zone = document.querySelector(playerZoneSelector(player, "servants"));
        zone.innerHTML = Array.from({length:5}, () => "<div class=\"slot\" data-player=\"" + player.key + "\"></div>").join("");
        player.hand = [];
        player.drawPile = [];
        player.graveyard = [];
        player.turnState = {};
        refreshHand(player);
        updateDeckCount(player);
      }
    };
    const summon = async (player, cardId, state={}) => {
      const summoned = await summonBatch03Servant(player, cardId, {triggerInitiativeEffect:false, ready:true});
      const fc = document.querySelector(".fc[data-instance=\"" + summoned.instanceId + "\"]");
      if (fc) applyScenarioServantState(fc, {pdvMax:state.pdvMax || 12, pdv:state.pdv || state.pdvMax || 12, atk:state.atk, prepared:true});
      return fc;
    };
    const clearPulse = (fc) => {
      delete fc.dataset.batch04PulseColor;
      delete fc.dataset.batch03LastPulseReason;
      delete fc.dataset.batch03PulseMove;
      delete fc.dataset.batch03LastPulseMove;
      fc.style.removeProperty("--batch04-pulse-color");
      fc.classList.remove("batch03-ability-pulse", "batch03-ability-pulse-move", "batch03-passive-pulse", "batch04-passive-glow");
    };
    const pulseAudit = (fc) => ({
      reason:fc.dataset.batch03LastPulseReason || "",
      color:fc.dataset.batch04PulseColor || "",
      move:fc.dataset.batch03PulseMove || "",
      classAbility:fc.classList.contains("batch03-ability-pulse"),
      classMove:fc.classList.contains("batch03-ability-pulse-move")
    });

    resetBoard();
    const rhaekor = await summon(player1, config.rhaekor.cardId, {pdvMax:8, pdv:8});
    const rhaekorBefore = targetSummary(rhaekor);
    const rhaekorEffect = await resolveImmediatePlayEffect({player:player1, cardId:config.rhaekor.cardId, sourceFC:rhaekor});
    const rhaekorPulse = pulseAudit(rhaekor);
    const rhaekorAfter = targetSummary(rhaekor);

    resetBoard();
    const priest = await summon(player1, config.priest.cardId, {pdvMax:8, pdv:8});
    const wounded = await summon(player1, config.priest.healTargetId, {pdvMax:10, pdv:2});
    player1.resourceState.classical.aria = 5;
    const priestResult = await applyBatch03StartTurnAbilities(player1);
    const priestAfter = {target:targetSummary(wounded), pulse:pulseAudit(priest)};
    batch03UpdateStats(wounded, {pdvMax:10, pdv:10});
    clearPulse(priest);
    const priestRefused = await applyBatch03StartTurnAbilities(player1);
    const priestNoHeal = pulseAudit(priest);

    resetBoard();
    currentPlayer = player1.key;
    const undeadGoblin = await summon(player1, config.undeadGoblin.cardId, {pdvMax:12, pdv:6});
    const enemy = await summon(player2, config.undeadGoblin.targetId, {pdvMax:20, pdv:20, atk:0});
    const undeadBefore = targetSummary(undeadGoblin);
    await resolveCombat(undeadGoblin, enemy);
    const undeadAfter = {source:targetSummary(undeadGoblin), pulse:pulseAudit(undeadGoblin)};
    resetBoard();
    currentPlayer = player1.key;
    const fullGoblin = await summon(player1, config.undeadGoblin.cardId, {pdvMax:12, pdv:12});
    const harmlessEnemy = await summon(player2, config.undeadGoblin.targetId, {pdvMax:20, pdv:20, atk:0});
    await resolveCombat(fullGoblin, harmlessEnemy);
    const undeadNoHeal = {source:targetSummary(fullGoblin), pulse:pulseAudit(fullGoblin)};

    return {rhaekor:{before:rhaekorBefore, effect:rhaekorEffect, after:rhaekorAfter, pulse:rhaekorPulse}, priest:{result:priestResult, after:priestAfter, refused:priestRefused, noHeal:priestNoHeal}, undead:{before:undeadBefore, after:undeadAfter, noHeal:undeadNoHeal}};
  }, fixture.passives.pointAbilities);
  expect(result.rhaekor.effect.success).toBe(true);
  expect(result.rhaekor.after.pdv).toBe(result.rhaekor.before.pdv - fixture.passives.pointAbilities.rhaekor.expectedDamage);
  expect(result.rhaekor.pulse).toMatchObject({reason:"initiative", color:fixture.pulseColors.B000002, move:"1", classAbility:true, classMove:true});
  expect(result.priest.result.priestHeals).toHaveLength(1);
  expect(result.priest.result.priestHeals[0].heal.gained).toBe(fixture.passives.pointAbilities.priest.expectedHeal);
  expect(result.priest.after.pulse).toMatchObject({reason:"start-turn", color:fixture.pulseColors.H000006, move:"1", classAbility:true, classMove:true});
  expect(result.priest.refused.priestHeals).toHaveLength(0);
  expect(result.priest.noHeal).toMatchObject({reason:"", color:""});
  expect(result.undead.after.source.pdv).toBe(result.undead.before.pdv + fixture.passives.pointAbilities.undeadGoblin.expectedHeal);
  expect(result.undead.after.pulse).toMatchObject({reason:"combat-heal", color:fixture.pulseColors.MV000020, move:"1", classAbility:true, classMove:true});
  expect(result.undead.noHeal.source.pdv).toBe(12);
  expect(result.undead.noHeal.pulse).toMatchObject({reason:"", color:""});
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
