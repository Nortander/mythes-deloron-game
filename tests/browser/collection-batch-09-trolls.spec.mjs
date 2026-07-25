import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-09-trolls.json", import.meta.url), "utf8"));
const signatures = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-effect-signatures.json", import.meta.url), "utf8"));

const SCENARIOS = ["collection-batch-09-trolls", "collection-batch-09-vengeance", "collection-batch-09-tempo"];

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch09=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(150);
}

function diagnosticsFor(page) {
  return attachPageDiagnostics(page);
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message =>
    !/Failed to load resource: the server responded with a status of 404/i.test(message)
    && !/Failed to load resource: net::ERR_(NETWORK_CHANGED|NAME_NOT_RESOLVED)/i.test(message)
  );
}

function byId(items) {
  return new Map(items.map(item => [item.id, item]));
}

test("Batch-09 scenarios stay hidden and expose all Troll runtime cards", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  const signaturesById = byId(signatures.signatures);
  for (const scenario of SCENARIOS) {
    await openScenario(page, scenario);
    const audit = await page.evaluate((input) => ({
      scenarioId:selectedScenarioId(),
      publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + input.scenario + '"]').length,
      cards:input.ids.map(id => ({id, exists:!!CARDS_DATA[id], name:CARDS_DATA[id]?.name || "", type:CARDS_DATA[id]?.type || "", faction:CARDS_DATA[id]?.fac || "", keywords:[...(CARDS_DATA[id]?.kws || [])], text:CARDS_DATA[id]?.cap || ""})),
      runtimeAudit:typeof auditCollectionBatch09Runtime === "function" ? auditCollectionBatch09Runtime() : null,
      handSize:player1.hand.length,
      imageProbe:Array.from(document.querySelectorAll('.fc img,.hc img')).filter(img => (img.getAttribute('src') || '').includes('../assets/')).slice(0, 10).map(img => ({src:img.getAttribute('src') || '', width:img.naturalWidth}))
    }), {scenario, ids:fixture.cardIds});
    expect(audit.scenarioId).toBe(scenario);
    expect(audit.publicOptionCount, scenario + " public option").toBe(0);
    expect(audit.cards.every(card => card.exists), JSON.stringify(audit.cards.filter(card => !card.exists))).toBe(true);
    expect(audit.runtimeAudit).toBeTruthy();
    expect(audit.handSize).toBeLessThanOrEqual(12);
    for (const probe of audit.imageProbe) expect(probe.width, probe.src).toBeGreaterThan(0);
  }
  for (const id of fixture.cardIds) expect(signaturesById.get(id), id + " signature").toBeTruthy();
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Troll costs, Cache de gros cailloux and Faveurs apply structured rules", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-09-trolls");
  const result = await page.evaluate(async () => {
    const costTotal = (id) => resolveCardCost({player:player1, cardId:id})?.effectiveCost?.total ?? null;
    const before = {giant:costTotal("TRL000019"), twelve:costTotal("TRL000012"), cache:supplyDefinition("R000026")?.production?.vector || {}};
    await triggerSort("PRST000005", player1);
    const afterMugwa = {giant:costTotal("TRL000019"), twelve:costTotal("TRL000012"), foodRequirement:(resolveCardCost({player:player1, cardId:"TRL000012"})?.effectiveCost?.requirements || []).filter(req => req.resource === "nourriture").length};
    await triggerSort("PRST000004", player1);
    const target = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000006");
    const handBefore = player1.hand.length;
    await sendToCemetery(target);
    const handAfter = player1.hand.length;
    const added = player1.hand.slice(handBefore);
    return {before, afterMugwa, flags:{zarrach:!!player1.batch09ZarrachFavor, mugwa:!!player1.batch09MugwaFavor}, handBefore, handAfter, added, events:auditCollectionBatch09Runtime().state.events};
  });
  expect(result.before.cache.pierre).toBe(3);
  expect(result.before.cache.fer).toBe(2);
  expect(result.afterMugwa.giant).toBe(3);
  expect(result.afterMugwa.twelve).toBe(3);
  expect(result.afterMugwa.foodRequirement).toBe(0);
  expect(result.flags.zarrach).toBe(true);
  expect(result.flags.mugwa).toBe(true);
  expect(result.handAfter).toBe(result.handBefore + 1);
  expect(result.added.length).toBe(1);
  expect(result.events.some(event => event.type === "zarrach-death-trigger")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Grande horde buffs Trolls and Goblins, buffs Orc attack, and draws only when Humans remain", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-09-trolls");
  const result = await page.evaluate(async () => {
    const troll = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000005");
    const gob = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000001");
    const orcFc = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "ORC000001");
    const before = {hand:player1.hand.length, deck:player1.drawPile.length, troll:targetSummary(troll), gob:targetSummary(gob), orc:targetSummary(orcFc)};
    const spell = await triggerSort("S000048", player1);
    const after = {hand:player1.hand.length, deck:player1.drawPile.length, troll:targetSummary(troll), gob:targetSummary(gob), orc:targetSummary(orcFc), sources:{troll:troll.dataset.batch05PassiveSources || "", gob:gob.dataset.batch05PassiveSources || "", orc:orcFc.dataset.batch05PassiveSources || ""}};
    return {before, spell, after};
  });
  expect(result.spell.drawn).toBe(2);
  expect(result.after.hand).toBe(result.before.hand + 2);
  expect(result.after.deck).toBe(result.before.deck - 2);
  expect(result.after.troll.pdvMax).toBe(result.before.troll.pdvMax + 1);
  expect(result.after.gob.pdvMax).toBe(result.before.gob.pdvMax + 1);
  expect(result.after.orc.atk).toBe(result.before.orc.atk + 1);
  expect(result.after.sources.troll).toContain("S000048");
  expect(result.after.sources.gob).toContain("S000048");
  expect(result.after.sources.orc).toContain("S000048");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Troll initiatives, end-turn and start-turn effects mutate the expected zones and stats", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-09-trolls");
  const result = await page.evaluate(async () => {
    const stone = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000005");
    const hoarder = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000018");
    const bone = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000007");
    const before = {enemy:livingServantCardsForPlayer(player2).length, p1Grave:player1.graveyard.length, p2Grave:player2.graveyard.length, stone:targetSummary(stone), hoarder:targetSummary(hoarder), bone:targetSummary(bone)};
    const siege = await resolveBatch09Initiative("TRL000004", player1, {sourceFC:livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000004")});
    const stoneResult = await resolveBatch09Initiative("TRL000005", player1, {sourceFC:stone});
    const hoarderResult = await resolveBatch09Initiative("TRL000018", player1, {sourceFC:hoarder});
    await resolveBatch09EndTurnEffects(player1);
    const afterEnd = {enemy:livingServantCardsForPlayer(player2).length, p1Grave:player1.graveyard.length, p2Grave:player2.graveyard.length, stone:targetSummary(stone), hoarder:targetSummary(hoarder), bone:targetSummary(bone)};
    await resolveBatch09StartTurnEffects(player1);
    const afterStart = {bone:targetSummary(bone)};
    return {before, siege, stoneResult, hoarderResult, afterEnd, afterStart, events:auditCollectionBatch09Runtime().state.events};
  });
  expect(result.siege.success).toBe(true);
  expect(result.afterEnd.enemy).toBeLessThanOrEqual(result.before.enemy);
  expect(result.stoneResult.success).toBe(true);
  expect(result.afterEnd.stone.atk + result.afterEnd.stone.pdvMax).toBeGreaterThan(result.before.stone.atk + result.before.stone.pdvMax);
  expect(result.hoarderResult.stored.length).toBeGreaterThan(0);
  expect(result.afterEnd.p1Grave + result.afterEnd.p2Grave).toBeLessThan(result.before.p1Grave + result.before.p2Grave + 3);
  expect(result.afterEnd.bone.pdvMax).toBeGreaterThanOrEqual(result.before.bone.pdvMax);
  expect(result.afterStart.bone.pdv).toBeLessThanOrEqual(result.afterEnd.bone.pdv);
  expect(result.events.some(event => event.type === "cadaver-hoarder-initiative")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Troll combat effects, Protectroll and Vengeance resolve without ghost occurrences", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-09-tempo");
  const tempo = await page.evaluate(async () => {
    const protectroll = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000010");
    const beforeAvatar = avatarHitPoints(player1);
    const avatarDamage = applyAvatarEffectDamage(player1, 4, {sourceCardId:"TEST"});
    const giantBefore = resolveCardCost({player:player1, cardId:"TRL000019"})?.effectiveCost?.total ?? null;
    await applyDamage(protectroll, 1);
    const giantAfter = resolveCardCost({player:player1, cardId:"TRL000019"})?.effectiveCost?.total ?? null;
    const instable = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000017");
    window.__mythesRandom = () => 0.99;
    const beforeInstable = targetSummary(instable);
    const beforeDeck = player1.drawPile.length;
    const beforeAllies = livingServantCardsForPlayer(player1).map(targetSummary);
    const startTurn = await resolveBatch09StartTurnEffects(player1);
    const afterAllies = livingServantCardsForPlayer(player1).map(targetSummary);
    return {beforeAvatar, afterAvatar:avatarHitPoints(player1), avatarDamage, giantBefore, giantAfter, beforeInstable, instable:targetSummary(instable), beforeDeck, afterDeck:player1.drawPile.length, beforeAllies, afterAllies, startTurn};
  });
  expect(tempo.avatarDamage.reduction).toBe(1);
  expect(tempo.afterAvatar).toBe(tempo.beforeAvatar - 3);
  expect(tempo.giantAfter).toBeLessThan(tempo.giantBefore);
  expect(tempo.startTurn.find(entry => entry?.cardId === "TRL000017")?.roll).toBe(3);
  expect(tempo.afterDeck).toBe(tempo.beforeDeck - 1);
  expect(tempo.afterAllies.some(after => {
    const before = tempo.beforeAllies.find(card => card.instance === after.instance);
    return before && after.id !== "TRL000017" && after.pdv < before.pdv;
  })).toBe(true);

  await openScenario(page, "collection-batch-09-vengeance");
  const vengeance = await page.evaluate(async () => {
    const before = {p1Servants:livingServantCardsForPlayer(player1).map(targetSummary), p1Grave:[...player1.graveyard], p1Avatar:avatarHitPoints(player1), p2Servants:livingServantCardsForPlayer(player2).map(targetSummary), p1Deck:player1.drawPile.map(getRuntimeCardId)};
    const rejeton = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000013");
    const premier = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000014");
    await sendToCemetery(rejeton);
    await sendToCemetery(premier);
    const after = {p1Servants:livingServantCardsForPlayer(player1).map(targetSummary), p1Grave:[...player1.graveyard].map(getRuntimeCardId), p1Avatar:avatarHitPoints(player1), p2Servants:livingServantCardsForPlayer(player2).map(targetSummary), p1Deck:player1.drawPile.map(getRuntimeCardId)};
    return {before, after, events:auditCollectionBatch09Runtime().state.events};
  });
  expect(vengeance.after.p1Servants.map(card => card.id)).not.toContain("TRL000013");
  expect(vengeance.after.p1Avatar).toBeGreaterThanOrEqual(vengeance.before.p1Avatar);
  expect(vengeance.before.p2Servants.some(before => {
    const after = vengeance.after.p2Servants.find(card => card.instance === before.instance);
    return !after || after.pdv < before.pdv;
  })).toBe(true);
  expect(vengeance.after.p1Servants.map(card => card.id)).toContain("TRL000001");
  expect(vengeance.after.p1Servants.map(card => card.id)).toContain("TRL000003");
  expect(vengeance.after.p1Grave.filter(id => id === "TRL000013")).toHaveLength(1);
  expect(vengeance.events.some(event => event.type === "mugwa-spawn-vengeance")).toBe(true);
  expect(vengeance.events.some(event => event.type === "first-born-vengeance")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Triangle des tenebres, Ca passe ou ca casse, and Troll-nain attachment preserve zone inventory", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-09-trolls");
  const result = await page.evaluate(async () => {
    const snapshot = () => ({
      hand:[...player1.hand],
      deck:player1.drawPile.map(getRuntimeCardId),
      graveyard:[...player1.graveyard].map(getRuntimeCardId),
      servants:livingServantCardsForPlayer(player1).map(targetSummary),
      enemies:livingServantCardsForPlayer(player2).map(targetSummary)
    });
    const beforeAttach = snapshot();
    const attachmentTarget = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000005");
    const attach = await playCard("TRL000015", null, {selectedTargetIds:[attachmentTarget.dataset.instance], returnValidation:true});
    const afterAttach = snapshot();
    await sendToCemetery(attachmentTarget);
    const afterAttachmentDeath = snapshot();
    const invalidTargets = livingServantCardsForPlayer(player1).filter(fc => fc.dataset.id !== "TRL000011").slice(0, 2);
    const beforeTriangleRefusal = snapshot();
    const refusal = await playCard("S000055", null, {selectedTargetIds:invalidTargets.map(fc => fc.dataset.instance), returnValidation:true});
    const afterTriangleRefusal = snapshot();
    while (livingServantCardsForPlayer(player1).filter(fc => !fc.dataset.insensible).length < 3) {
      await summonBatch03Servant(player1, "H000001", {triggerInitiativeEffect:false, ready:true});
    }
    const sacrificeTargets = livingServantCardsForPlayer(player1).filter(fc => !fc.dataset.insensible).slice(0, 3);
    const triangle = await playCard("S000055", null, {selectedTargetIds:sacrificeTargets.map(fc => fc.dataset.instance), returnValidation:true});
    const afterTriangle = snapshot();
    const troll = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000011") || livingServantCardsForPlayer(player1).find(fc => fc.dataset.id?.startsWith("TRL"));
    const beforeCasse = snapshot();
    const casse = await triggerSort("S000046", player1, {selectedTargetIds:[troll.dataset.instance]});
    const afterCasse = snapshot();
    return {beforeAttach, attach, afterAttach, afterAttachmentDeath, beforeTriangleRefusal, refusal, afterTriangleRefusal, triangle, afterTriangle, beforeCasse, casse, afterCasse, events:auditCollectionBatch09Runtime().state.events};
  });
  expect(result.attach.success).toBe(true);
  expect(result.afterAttach.hand).not.toContain("TRL000015");
  expect(result.afterAttach.servants.some(card => card.id === "TRL000015")).toBe(false);
  expect(result.afterAttachmentDeath.hand).toContain("TRL000015");
  expect(result.refusal.success).toBe(false);
  expect(result.afterTriangleRefusal.hand).toEqual(result.beforeTriangleRefusal.hand);
  expect(result.afterTriangleRefusal.servants.map(card => card.instance).sort()).toEqual(result.beforeTriangleRefusal.servants.map(card => card.instance).sort());
  expect(result.triangle.success).toBe(true);
  expect(result.afterTriangle.graveyard.filter(id => id === "S000055")).toHaveLength(1);
  expect(result.afterTriangle.graveyard.length).toBe(result.beforeTriangleRefusal.graveyard.length + 4);
  expect(result.casse.success).toBe(true);
  expect(result.casse.rounds).toBeGreaterThan(0);
  expect(result.afterCasse.enemies.length).toBeLessThanOrEqual(result.beforeCasse.enemies.length);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
