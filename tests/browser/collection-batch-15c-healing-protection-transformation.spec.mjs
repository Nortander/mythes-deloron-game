import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics, openCollection, waitForVisibleHandStable} from "./helpers/eloron-ui.mjs";

const scenarios = [
  "collection-batch-15c-healing",
  "collection-batch-15c-protection",
  "collection-batch-15c-transformation"
];

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

async function openBatch15CScenario(page, scenario) {
  await page.addInitScript(() => {
    const sequence = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
    const nativeRandom = Math.random.bind(Math);
    let index = 0;
    Math.random = () => (index < sequence.length ? sequence[index++] : nativeRandom());
  });
  await page.goto(`/code/partie-test-1.html?scenario=${scenario}&batch15c=${Date.now()}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await waitForVisibleHandStable(page);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect(page.locator(".hc[data-id], .fc[data-id]").first()).toBeVisible();
}

test("Batch 15C scenarios stay hidden and card data is synchronized", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  for (const scenario of scenarios) {
    await openBatch15CScenario(page, scenario);
    const audit = await page.evaluate(() => ({
      publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length,
      cards:["S000003","S000010","S000021","S000028","S000034","S000061"].map(id => {
        const node = document.createElement("div");
        node.innerHTML = fmtDesc((CARDS_DATA[id]?.detail || CARDS_DATA[id]?.cap || ""));
        return {
          id,
          exists:!!CARDS_DATA[id],
          type:CARDS_DATA[id]?.type || null,
          keywords:CARDS_DATA[id]?.kws || [],
          cost:EXTRA_CARD_COST_DEFINITIONS[id] || null,
          highlights:[...node.querySelectorAll("strong.kv")].map(strong => strong.textContent)
        };
      })
    }));
    expect(audit.publicOptionCount).toBe(0);
    for (const card of audit.cards) {
      expect(card.exists, card.id).toBe(true);
      expect(card.type, card.id).toBe("Sort");
    }
    expect(audit.cards.find(card => card.id === "S000003").highlights).toEqual([]);
    expect(audit.cards.find(card => card.id === "S000010").highlights).toEqual(["6", "2"]);
    expect(audit.cards.find(card => card.id === "S000021").highlights).toEqual(["0", "20"]);
    expect(audit.cards.find(card => card.id === "S000021").keywords).toEqual(expect.arrayContaining(["Aria","Lenya","Écho","Rempart"]));
    expect(audit.cards.find(card => card.id === "S000028").keywords).toContain("Insensible");
    expect(audit.cards.find(card => card.id === "S000061").highlights).toEqual(["1", "3", "2", "1"]);
  }
  await openCollection(page);
  const petrificationCollection = await page.evaluate(() => CARDS.find(card => card.id === "S000021"));
  expect(petrificationCollection.kw).toEqual(expect.arrayContaining(["Aria","Lenya","Écho","Rempart"]));
  expect(petrificationCollection.kw).not.toContain("Âme");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000003 and S000010 heal allies with the historical multipliers and adjacency", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15CScenario(page, "collection-batch-15c-healing");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const summaries = () => livingServantCardsForPlayer(player1).map(targetSummary);
    const miraculous = await playCard("S000003", null);
    const afterMiracle = summaries();
    const healer = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "EDB000005");
    const target = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000001");
    const rightAdjacent = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000005");
    await applyDamage(healer, 2);
    await applyDamage(target, 3);
    await applyDamage(rightAdjacent, 2);
    if (!player1.hand.includes("S000010")) player1.hand.push("S000010");
    refreshHand(player1);
    const hand = await playCard("S000010", null, {selectedTargetIds:[target.dataset.instance]});
    const afterHand = summaries();
    return {miraculous, afterMiracle, hand, afterHand};
  });
  expect(result.miraculous.spellResolution.success).toBe(true);
  expect(result.afterMiracle.find(card => card.id === "EDB000005").pdv).toBe(3);
  expect(result.afterMiracle.find(card => card.id === "H000001").pdv).toBe(4);
  expect(result.afterMiracle.find(card => card.id === "H000005").pdv).toBe(5);
  expect(result.hand.spellResolution.success).toBe(true);
  expect(result.afterHand.find(card => card.id === "EDB000005").pdv).toBe(3);
  expect(result.afterHand.find(card => card.id === "H000001").pdv).toBe(4);
  expect(result.afterHand.find(card => card.id === "H000005").pdv).toBe(5);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000028 and S000034 protect allied servants without leaking beyond the next destruction", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15CScenario(page, "collection-batch-15c-protection");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const auraTarget = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000001");
    const rescueTarget = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000005");
    const aura = await playCard("S000028", null, {selectedTargetIds:[auraTarget.dataset.instance]});
    const afterAura = targetSummary(auraTarget);
    const rescue = await playCard("S000034", null);
    const shieldAfterSpell = Number(player1.batch05RescueShield || 0);
    const destroyed = await applyDamage(rescueTarget, 99);
    const afterRescue = targetSummary(rescueTarget);
    const shieldAfterRescue = Number(player1.batch05RescueShield || 0);
    return {
      aura,
      afterAura,
      rescue,
      shieldAfterSpell,
      destroyed,
      afterRescue,
      shieldAfterRescue,
      stillOnBoard:rescueTarget.isConnected,
      graveyard:player1.graveyard.map(getRuntimeCardId)
    };
  });
  expect(result.aura.spellResolution.success).toBe(true);
  expect(result.afterAura.insensible).toBe(true);
  expect(result.afterAura.pdvMax).toBe(7);
  expect(result.afterAura.pdv).toBe(5);
  expect(result.rescue.spellResolution.success).toBe(true);
  expect(result.shieldAfterSpell).toBe(1);
  expect(result.destroyed).toBe(false);
  expect(result.stillOnBoard).toBe(true);
  expect(result.afterRescue.pdv).toBe(1);
  expect(result.shieldAfterRescue).toBe(0);
  expect(result.graveyard).not.toContain("H000005");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000021 petrifies any servant and suppresses attack, counter and abilities except Rempart", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15CScenario(page, "collection-batch-15c-transformation");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const target = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "AVS000010");
    const ally = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000005");
    const legalBefore = legalTargetsForRequirement("S000021", player1).map(fc => fc.dataset.id);
    const resolved = await playCard("S000021", null, {selectedTargetIds:[target.dataset.instance]});
    const after = targetSummary(target);
    const abilityAllowed = canResolveServantAbility(target, {triggerType:"passive"});
    const counterAllowed = canServantCounterAttack(target);
    const combatRefusal = await resolveCombat(target, ally);
    const preview = buildCanonicalCardPreview(target.dataset.id, {sourceElement:target, playerId:target.dataset.player});
    return {legalBefore, resolved, after, abilityAllowed, counterAllowed, combatRefusal, preview};
  });
  expect(result.legalBefore).toEqual(expect.arrayContaining(["H000005","H000001","AVS000010","H000006"]));
  expect(result.resolved.spellResolution.success).toBe(true);
  expect(result.after.batch15cPetrified).toBe(true);
  expect(result.after.atk).toBe(0);
  expect(result.after.pdv).toBe(20);
  expect(result.after.pdvMax).toBe(20);
  expect(result.after.insensible).toBe(true);
  expect(result.after.rempart || result.preview.includes("Rempart")).toBeTruthy();
  expect(result.abilityAllowed).toBe(false);
  expect(result.counterAllowed).toBe(false);
  expect(result.combatRefusal.success).toBe(false);
  expect(result.combatRefusal.reason).toBe("petrified-attacker");
  expect(result.preview).toContain("Pétrifié");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000061 consumes charges only on incoming attacks and freezes attackers", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15CScenario(page, "collection-batch-15c-transformation");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const protectedAlly = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000005");
    const attacker = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000006");
    const shield = await playCard("S000061", null, {selectedTargetIds:[protectedAlly.dataset.instance]});
    const afterShield = targetSummary(protectedAlly);
    await applyDamage(protectedAlly, 1);
    const afterNonAttackDamage = targetSummary(protectedAlly);
    const beforeAttack = {protected:targetSummary(protectedAlly), attacker:targetSummary(attacker)};
    const combat = await resolveCombat(attacker, protectedAlly);
    const afterAttack = {protected:targetSummary(protectedAlly), attacker:{...targetSummary(attacker), frozen:Number(attacker.dataset.frozen || 0)}};
    const events = auditCollectionBatch09Runtime().state.events;
    return {shield, afterShield, afterNonAttackDamage, beforeAttack, combat, afterAttack, events};
  });
  expect(result.shield.spellResolution.success).toBe(true);
  expect(result.afterShield.batch09IceShieldCharges).toBe(3);
  expect(result.afterNonAttackDamage.batch09IceShieldCharges).toBe(3);
  expect(result.afterAttack.protected.batch09IceShieldCharges).toBe(2);
  expect(result.beforeAttack.protected.pdv - result.afterAttack.protected.pdv).toBe(Math.max(0, result.beforeAttack.attacker.atk - 2));
  expect(result.afterAttack.attacker.frozen > 0 || result.events.some(event => event.type === "ice-shield-triggered" && event.gelApplied)).toBeTruthy();
  expect(result.events.filter(event => event.type === "ice-shield-triggered")).toHaveLength(1);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
