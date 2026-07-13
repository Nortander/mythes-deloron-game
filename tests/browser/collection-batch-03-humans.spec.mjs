import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-03-humans.json", import.meta.url), "utf8"));
const signatures = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-effect-signatures.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch03=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForTimeout(300);
}

function diagnosticsFor(page) {
  return attachPageDiagnostics(page);
}

test("Batch-03 scope promotes every Human candidate and keeps direct dependencies explicit", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, fixture.scenarios[0]);
  const byId = new Map(signatures.signatures.map(signature => [signature.id, signature]));
  expect(fixture.candidateIds).toHaveLength(42);
  for (const id of fixture.candidateIds) {
    expect(byId.get(id)?.faction, id + " faction").toBe("Humain");
    expect(byId.get(id)?.implementationStatus, id + " status").toBe(fixture.expectedFinalStatus);
    expect(byId.get(id)?.missingPrimitives || [], id + " missing primitives").toEqual([]);
  }
  const runtime = await page.evaluate(({candidateIds, dependencyIds}) => {
    return [...candidateIds, ...dependencyIds].map(id => ({
      id,
      exists: !!CARDS_DATA[id],
      name: CARDS_DATA[id]?.name || "",
      type: CARDS_DATA[id]?.type || "",
      image: cardArtworkSrc(id, CARDS_DATA[id]?.assetFolder || facFolder(CARDS_DATA[id]?.fac || "sort"))
    }));
  }, {candidateIds: fixture.candidateIds, dependencyIds: fixture.directDependencyIds});
  expect(runtime.every(card => card.exists), JSON.stringify(runtime.filter(card => !card.exists))).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Human public rendering avoids obsolete cyan highlights and hides technical IDs", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, fixture.scenarios[0]);
  const audit = await page.evaluate(({ids, accent, forbidden}) => {
    const toRgb = cssColor => {
      const probe = document.createElement("span");
      probe.style.color = cssColor;
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    };
    const expectedRgb = toRgb(accent);
    const forbiddenRgb = toRgb(forbidden);
    const rendered = ids.map(id => {
      openCardPreview(id, {sourceType:"test"});
      const layer = document.querySelector("#card-preview-layer");
      const text = layer?.textContent?.replace(/\s+/g, " ").trim() || "";
      const highlights = Array.from(layer?.querySelectorAll(".canonical-keyword-inline,strong.kv,.card-keyword,.card-named-ability") || [])
        .map(node => ({text:node.textContent.trim(), color:getComputedStyle(node).color}));
      return {id, text, highlights};
    });
    return {expectedRgb, forbiddenRgb, rendered};
  }, {ids: fixture.candidateIds, accent: fixture.humanAccentColor, forbidden: fixture.forbiddenMainDescriptionColor});
  for (const card of audit.rendered) {
    expect(card.text, card.id + " public text").not.toMatch(/\b(?:AVS|H|S|B|DIV|MV)\d{6}\b|ID\s*=|effectInstanceId|linkedOccurrenceId/i);
    for (const item of card.highlights) {
      expect(item.color, card.id + " forbidden cyan").not.toBe(audit.forbiddenRgb);
    }
  }
  await attachDiagnostics(testInfo, diagnostics);
});

test("Human Initiative handlers resolve movement, damage, summons, freeze and pair effects", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-triggers");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = player => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length: 5}, () => `<div class="slot" data-player="${player.key}"></div>`).join("");
    };
    const before = auditCollectionBatch03Runtime();
    resetServants(player1);
    const h2 = await summonBatch03Servant(player1, "H000002", {triggerInitiativeEffect:true, ready:true});
    const afterH2 = auditCollectionBatch03Runtime();
    resetServants(player1);
    const h4 = await summonBatch03Servant(player1, "H000004", {triggerInitiativeEffect:true, ready:true});
    resetServants(player1);
    const h7 = await summonBatch03Servant(player1, "H000007", {triggerInitiativeEffect:true, ready:true});
    resetServants(player1);
    const h11 = await summonBatch03Servant(player1, "H000011", {triggerInitiativeEffect:true, ready:true});
    resetServants(player1);
    await summonBatch03Servant(player1, "H000016", {triggerInitiativeEffect:false, ready:true});
    const h15 = await summonBatch03Servant(player1, "H000015", {triggerInitiativeEffect:true, ready:true});
    resetServants(player1);
    const h15Ally = await summonBatch03Servant(player1, "H000015", {triggerInitiativeEffect:false, ready:true});
    const h15AllyFc = document.querySelector(`.fc[data-instance="${h15Ally.instanceId}"]`);
    if (h15AllyFc) await applyDamage(h15AllyFc, 2);
    const woundedAllies = livingServantCardsForPlayer(player1).map(fc => ({id:fc.dataset.id, pdv:Number(fc.dataset.pdv), max:Number(fc.dataset.pdvMax)}));
    const h16 = await summonBatch03Servant(player1, "H000016", {triggerInitiativeEffect:true, ready:true});
    resetServants(player1);
    const h31 = await summonBatch03Servant(player1, "H000031", {triggerInitiativeEffect:true, ready:true});
    const after = auditCollectionBatch03Runtime();
    return {before, h2, afterH2, h4, h7, h11, h15, woundedAllies, h16, h31, after};
  });
  expect(result.h2.initiative.operations[0].result.destination).toBe("hand");
  expect(result.afterH2.zones.player2.hand).toContain("H000001");
  expect(result.h4.initiative.operations.some(op => op.type === "damage")).toBe(true);
  expect(result.h7.initiative.operations.some(op => op.type === "cdg")).toBe(true);
  expect(result.h11.initiative.operations.some(op => op.cardId === "H000008" || op.type === "patrol-summon-on-attack")).toBe(true);
  expect(result.h15.initiative.operations.some(op => op.type === "vengeful-damage")).toBe(true);
  expect(result.h16.initiative.operations.some(op => op.type === "paladin-heal")).toBe(true);
  expect(result.h31.initiative.operations.filter(op => op.cardId === "DIV000006")).toHaveLength(2);
  expect(result.after.board.player1.map(card => card.id)).toEqual(expect.arrayContaining(["H000031", "DIV000006"]));
  await attachDiagnostics(testInfo, diagnostics);
});

test("Human AVS handlers resolve Insensible, summons, turn skip and spell echo", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-avatars");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = player => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length: 5}, () => `<div class="slot" data-player="${player.key}"></div>`).join("");
    };
    resetServants(player1);
    const avs1 = await summonBatch03Servant(player1, "AVS000001", {triggerInitiativeEffect:true, ready:true});
    const avs2 = await summonBatch03Servant(player1, "AVS000002", {triggerInitiativeEffect:true, ready:true});
    resetServants(player1);
    await summonBatch03Servant(player1, "AVS000003", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "AVS000001", {triggerInitiativeEffect:false, ready:true});
    const ally = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "AVS000003");
    const healTarget = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "AVS000001");
    if (healTarget) await applyDamage(healTarget, 1);
    if (!player1.hand.includes("S000010")) player1.hand.push("S000010");
    refreshHand(player1);
    const spell = await playCard("S000010", null, {selectedTargetIds:[healTarget?.dataset.instance]});
    resetServants(player1);
    const avs4 = await summonBatch03Servant(player1, "AVS000004", {triggerInitiativeEffect:true, ready:true});
    resetServants(player1);
    const avs7 = await summonBatch03Servant(player1, "AVS000007", {triggerInitiativeEffect:true, ready:true});
    resetServants(player1);
    const avs14 = await summonBatch03Servant(player1, "AVS000014", {triggerInitiativeEffect:true, ready:true});
    const after = auditCollectionBatch03Runtime();
    return {avs1, avs2, avs3:targetSummary(ally), avs4, avs7, avs14, spell, after};
  });
  expect(result.avs1.initiative.operations.some(op => op.type === "cdg")).toBe(true);
  expect(result.avs2.initiative.operations.some(op => op.type === "damage-dot")).toBe(true);
  expect(result.avs4.initiative.operations.map(op => op.cardId)).toEqual(expect.arrayContaining(["B000006", "B000007"]));
  expect(result.avs7.initiative.operations.map(op => op.cardId)).toContain("DIV000001");
  expect(result.after.state.events.some(event => event.type === "spell-echo" && event.cardId === "S000010")).toBe(true);
  expect(result.after.state.events.some(event => event.type === "initiative" && event.cardId === "AVS000014")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Human spells heal, protect and apply blessed-sword combat without zone loss", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-spells");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    for (const id of ["S000010", "S000028", "S000033"]) {
      if (!player1.hand.includes(id)) player1.hand.push(id);
    }
    refreshHand(player1);
    const allies = livingServantCardsForPlayer(player1);
    const target = allies[1];
    const before = auditCollectionBatch03Runtime();
    const heal = await playCard("S000010", null, {selectedTargetIds:[target.dataset.instance]});
    const auraTarget = livingServantCardsForPlayer(player1)[0];
    const aura = await playCard("S000028", null, {selectedTargetIds:[auraTarget.dataset.instance]});
    const blessed = await playCard("S000033", null);
    const attacker = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000005");
    const undead = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "MV000020");
    delete attacker.dataset.new;
    await resolveCombat(attacker, undead);
    const after = auditCollectionBatch03Runtime();
    return {before, heal, aura, blessed, after, auraTarget:targetSummary(auraTarget)};
  });
  expect(result.heal.spellResolution.success).toBe(true);
  expect(result.aura.spellResolution.success).toBe(true);
  expect(result.auraTarget.insensible).toBe(true);
  expect(result.blessed.spellResolution.success).toBe(true);
  expect(result.after.state.events.some(event => event.type === "combat-hook" && JSON.stringify(event).includes("blessed-swords-divine-wrath"))).toBe(true);
  expect(result.after.zones.player1.graveyard).toEqual(expect.arrayContaining(["S000010", "S000028", "S000033"]));
  await attachDiagnostics(testInfo, diagnostics);
});

test("Human combat, end-turn and Vengeance hooks preserve inventories", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-overview");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = player => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length: 5}, () => `<div class="slot" data-player="${player.key}"></div>`).join("");
    };
    const before = auditCollectionBatch03Runtime();
    resetServants(player1);
    await summonBatch03Servant(player1, "H000026", {triggerInitiativeEffect:false, ready:true});
    const guard = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000026");
    await applyDamage(guard, 1);
    resetServants(player1);
    await summonBatch03Servant(player1, "H000020", {triggerInitiativeEffect:false, ready:true});
    const wolf = await applyBatch03EndTurnAbilities(player1);
    player1.hand.push("H000027");
    await applyBatch03EndTurnAbilities(player1);
    resetServants(player1);
    const necrane = await summonBatch03Servant(player1, "H000030", {triggerInitiativeEffect:false, ready:true});
    await applyBatch03StartTurnAbilities(player1);
    const necraneFc = document.querySelector(`.fc[data-instance="${necrane.instanceId}"]`);
    necraneFc._killer = livingServantCardsForPlayer(player2)[0] || null;
    await sendToCemetery(necraneFc);
    resetServants(player1);
    const h29 = await summonBatch03Servant(player1, "H000029", {triggerInitiativeEffect:false, ready:true});
    const h29fc = document.querySelector(`.fc[data-instance="${h29.instanceId}"]`);
    const victim = livingServantCardsForPlayer(player2)[0];
    batch03UpdateStats(victim, {pdv:1});
    delete h29fc.dataset.new;
    await resolveCombat(h29fc, victim);
    const after = auditCollectionBatch03Runtime();
    return {before, after, wolf};
  });
  expect(result.after.board.player2.map(card => card.id)).toContain("H000001");
  expect(result.wolf.wolfSummons.some(summon => summon.cardId === "H000021" && summon.success)).toBe(true);
  expect(result.after.handBuffs.player1.H000027?.atk).toBeGreaterThanOrEqual(1);
  expect(result.after.state.events.some(event => event.type === "vengeance-necrane")).toBe(true);
  expect(result.after.state.events.some(event => event.type === "combat-hook" && JSON.stringify(event).includes("bronze-colossus-discard"))).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});
