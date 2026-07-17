import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-05-forest-ice-elves.json", import.meta.url), "utf8"));
const signatures = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-effect-signatures.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch05=" + Date.now());
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
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

test("Batch-05 scenarios stay hidden and expose every forest or ice elf card", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  const allIds = [...fixture.forestElfIds, ...fixture.iceElfIds, ...fixture.adjacentIcePluralIds];
  const signaturesById = byId(signatures.signatures);
  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    const audit = await page.evaluate((input) => {
      return {
        scenarioId:selectedScenarioId(),
        publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + input.scenario + '"]').length,
        cards:input.ids.map(id => ({id, exists:!!CARDS_DATA[id], name:CARDS_DATA[id]?.name || '', type:CARDS_DATA[id]?.type || '', faction:CARDS_DATA[id]?.fac || '', keywords:[...(CARDS_DATA[id]?.kws || [])]})),
        runtimeAudit:typeof auditCollectionBatch05Runtime === 'function' ? auditCollectionBatch05Runtime() : null
      };
    }, {scenario, ids:allIds});
    expect(audit.scenarioId).toBe(scenario);
    expect(audit.publicOptionCount).toBe(fixture.expectedHiddenScenarioOptionCount);
    expect(audit.cards.every(card => card.exists), JSON.stringify(audit.cards.filter(card => !card.exists))).toBe(true);
    expect(audit.runtimeAudit).toBeTruthy();
  }
  for (const id of allIds) {
    expect(signaturesById.get(id), id + " signature").toBeTruthy();
  }
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Elfes des bois resolve passives, Pixie swarm, healing and graveyard return", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-05-elfes-des-bois");
  const result = await page.evaluate(async (expected) => {
    window.__mythesRandom = () => 0;
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    const ids = (player) => livingServantCardsForPlayer(player).map(fc => fc.dataset.id);

    resetServants(player1);
    await summonBatch03Servant(player1, "EDB000009", {triggerInitiativeEffect:false, ready:true});
    const healer = await summonBatch03Servant(player1, "EDB000005", {triggerInitiativeEffect:false, ready:true});
    const healerFc = document.querySelector('.fc[data-instance="' + healer.instanceId + '"]');
    batch03UpdateStats(healerFc, {pdvMax:3, pdv:1});
    await summonBatch03Servant(player1, "EDB000014", {triggerInitiativeEffect:true, ready:true});
    syncBatch05Passives();
    const dryadBoard = livingServantCardsForPlayer(player1).map(targetSummary);

    resetServants(player1);
    await summonBatch03Servant(player1, "EDB000012", {triggerInitiativeEffect:true, ready:true});
    const pixieBoard = ids(player1);

    player1.hand = ["S000040"];
    player1.graveyard = ["EDB000012", "EDB000012", "H000001"];
    refreshHand(player1);
    const pixieReturn = resolvePixiemanie(player1);

    resetServants(player1);
    await summonBatch03Servant(player1, "EDB000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "EDB000005", {triggerInitiativeEffect:false, ready:true});
    const beforeCraft = livingServantCardsForPlayer(player1).map(targetSummary);
    const craft = resolveArtisanatElfique(player1);
    const afterCraft = livingServantCardsForPlayer(player1).map(targetSummary);

    const wounded = livingServantCardsForPlayer(player1).find(fc => Number(fc.dataset.atk || 0) > 0) || livingServantCardsForPlayer(player1)[0];
    batch03UpdateStats(wounded, {pdvMax:Math.max(4, Number(wounded.dataset.pdvMax || wounded.dataset.pdv || 0)), pdv:1});
    const beforeHeal = targetSummary(wounded);
    await triggerSort("S000003", player1);
    const afterHeal = targetSummary(wounded);

    return {dryadBoard, pixieBoard, pixieReturn, hand:[...player1.hand], graveyard:[...player1.graveyard], beforeCraft, craft, afterCraft, beforeHeal, afterHeal, expected};
  }, fixture);
  expect(result.dryadBoard.find(card => card.id === "EDB000005").pdv).toBe(result.dryadBoard.find(card => card.id === "EDB000005").pdvMax);
  expect(result.dryadBoard.find(card => card.id === "EDB000009").pdvMax).toBeGreaterThanOrEqual(9);
  expect(result.pixieBoard.filter(id => id === "EDB000012")).toHaveLength(fixture.pixieFillCount);
  expect(result.pixieReturn.success).toBe(true);
  expect(result.pixieReturn.moved).toHaveLength(2);
  expect(result.hand.filter(id => id === "EDB000012")).toHaveLength(2);
  expect(result.graveyard).not.toContain("EDB000012");
  expect(result.craft.success).toBe(true);
  for (let i = 0; i < result.beforeCraft.length; i++) {
    expect(result.afterCraft[i].atk).toBe(result.beforeCraft[i].atk + 1);
    expect(result.afterCraft[i].pdvMax).toBeGreaterThanOrEqual(result.beforeCraft[i].pdvMax + 1);
  }
  expect(result.afterHeal.pdv).toBeGreaterThan(result.beforeHeal.pdv);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Elfes des bois combat and Vengeance hooks mutate only the intended zones", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-05-elfes-des-bois");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    resetServants(player1);
    resetServants(player2);
    player1.hand = [];
    player2.hand = ["H000001", "H000005"];
    refreshHand(player1);
    refreshHand(player2);
    const archer = await summonBatch03Servant(player1, "EDB000003", {triggerInitiativeEffect:false, ready:true});
    const target = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const archerFc = document.querySelector('.fc[data-instance="' + archer.instanceId + '"]');
    const targetFc = document.querySelector('.fc[data-instance="' + target.instanceId + '"]');
    batch03UpdateStats(targetFc, {pdvMax:20, pdv:20});
    const targetBefore = targetSummary(targetFc);
    await resolveCombat(archerFc, targetFc);
    const targetAfter = targetSummary(targetFc);

    resetServants(player1);
    resetServants(player2);
    const enchantress = await summonBatch03Servant(player1, "EDB000011", {triggerInitiativeEffect:true, ready:true});
    const enchantressFc = document.querySelector('.fc[data-instance="' + enchantress.instanceId + '"]');
    const handAfterInitiative = [...player1.hand];
    await applyDamage(enchantressFc, 99);
    await new Promise(resolve => setTimeout(resolve, 980));
    const handAfterVengeance = [...player1.hand];

    resetServants(player1);
    resetServants(player2);
    const kyra = await summonBatch03Servant(player1, "EDB000013", {triggerInitiativeEffect:false, ready:true});
    const enemyA = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    const kyraFc = document.querySelector('.fc[data-instance="' + kyra.instanceId + '"]');
    const enemyAFc = document.querySelector('.fc[data-instance="' + enemyA.instanceId + '"]');
    for (const enemy of livingServantCardsForPlayer(player2)) batch03UpdateStats(enemy, {pdvMax:10, pdv:10});
    window.__mythesRandom = () => 0.99;
    const beforeKyra = livingServantCardsForPlayer(player2).map(targetSummary);
    await resolveCombat(kyraFc, enemyAFc);
    const afterKyra = livingServantCardsForPlayer(player2).map(targetSummary);
    const kyraEvents = collectionBatch05State.events.filter(event => event.type === "combat-post");

    return {targetBefore, targetAfter, handAfterInitiative, handAfterVengeance, beforeKyra, afterKyra, kyraEvent:kyraEvents[kyraEvents.length - 1]};
  });
  expect(result.targetAfter.pdv).toBeLessThanOrEqual(result.targetBefore.pdv - 4);
  expect(result.handAfterInitiative).toEqual(expect.arrayContaining(["R000014", "R000004", "R000017"]));
  expect(result.handAfterVengeance).not.toEqual(expect.arrayContaining(["R000014", "R000004", "R000017"]));
  for (let i = 0; i < result.beforeKyra.length; i++) {
    expect(result.afterKyra[i].pdv).toBeLessThanOrEqual(result.beforeKyra[i].pdv - 2);
  }
  expect(result.kyraEvent.results.some(result => result.type === "kyra-draw")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Elfes de glace resolve Initiative, Sang-froid passives and ice wall charges", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-05-elfes-de-glace");
  const result = await page.evaluate(async (expected) => {
    window.__mythesRandom = () => 0;
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    resetServants(player1);
    resetServants(player2);
    player1.drawPile = ["EDG000006", "S000004", "R000010"];
    player1.hand = [];
    refreshHand(player1);
    const perce = await summonBatch03Servant(player1, "EDG000009", {triggerInitiativeEffect:true, ready:true});
    const afterPerce = {hand:[...player1.hand], deck:[...player1.drawPile], board:livingServantCardsForPlayer(player1).map(targetSummary), initiative:perce.initiative};

    resetServants(player1);
    const mother = await summonBatch03Servant(player1, "EDG000010", {triggerInitiativeEffect:true, ready:true});
    const wolvesAfterMother = livingServantCardsForPlayer(player1).map(targetSummary);

    resetServants(player1);
    resetServants(player2);
    resolveMurDeGlace(player1);
    const chargesBefore = player2.batch05IceWallCharges;
    const summoned = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const summonedFc = document.querySelector('.fc[data-instance="' + summoned.instanceId + '"]');
    applyBatch05IceWallToSummon(player2, summonedFc);
    const wallTarget = {id:summonedFc.dataset.id, cdg:summonedFc.dataset.frozen_cdg || "", gel:summonedFc.dataset.frozen_gel || ""};

    resetServants(player1);
    await summonBatch03Servant(player1, "EDG000008", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "EDG000011", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "EDG000011", {triggerInitiativeEffect:false, ready:true});
    syncBatch05Passives();
    const wolfPassives = livingServantCardsForPlayer(player1).map(targetSummary);

    return {afterPerce, mother, wolvesAfterMother, chargesBefore, chargesAfter:player2.batch05IceWallCharges, wallTarget, wolfPassives, expected};
  }, fixture);
  expect(result.afterPerce.hand).toEqual(expect.arrayContaining(["EDG000006", "S000004"]));
  expect(result.afterPerce.deck).not.toContain("EDG000006");
  expect(result.wolvesAfterMother.filter(card => card.id === "EDG000011")).toHaveLength(fixture.wolvesAfterMother - 1);
  expect(result.chargesBefore).toBe(fixture.murDeGlaceCharges);
  expect(result.chargesAfter).toBe(fixture.murDeGlaceCharges - 1);
  expect(result.wallTarget.cdg || result.wallTarget.gel).not.toBe("");
  const wolves = result.wolfPassives.filter(card => card.id === "EDG000011");
  expect(wolves.every(card => card.pdvMax >= 4)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Elfes de glace end-turn effects, Pacte millenaire and wolf death preserve inventory", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-05-elfes-de-glace");
  const result = await page.evaluate(async () => {
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    resetServants(player1);
    player1.hand = [];
    player1.drawPile = [];
    player1.graveyard = ["EDG000006", "EDG000006"];
    refreshHand(player1);
    await summonBatch03Servant(player1, "EDG000005", {triggerInitiativeEffect:false, ready:true});
    const wounded = await summonBatch03Servant(player1, "EDG000006", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "EDG000007", {triggerInitiativeEffect:false, ready:true});
    const woundedFc = document.querySelector('.fc[data-instance="' + wounded.instanceId + '"]');
    batch03UpdateStats(woundedFc, {pdvMax:6, pdv:1});
    const beforeEnd = auditCollectionBatch05Runtime();
    applyEndOfTurnEffects(player1);
    await applyBatch03EndTurnAbilities(player1);
    const afterEnd = auditCollectionBatch05Runtime();
    const healed = targetSummary(woundedFc);
    const elementalCount = livingServantCardsForPlayer(player1).filter(fc => fc.dataset.id === "DIV000007").length;

    const pacte = handleBatch05PacteFallback(player1);
    const afterPacte = livingServantCardsForPlayer(player1).map(targetSummary);

    resetServants(player1);
    const wolf1 = await summonBatch03Servant(player1, "EDG000011", {triggerInitiativeEffect:false, ready:true});
    const wolf2 = await summonBatch03Servant(player1, "EDG000011", {triggerInitiativeEffect:false, ready:true});
    syncBatch05Passives();
    const wolf1Fc = document.querySelector('.fc[data-instance="' + wolf1.instanceId + '"]');
    const wolf2Fc = document.querySelector('.fc[data-instance="' + wolf2.instanceId + '"]');
    const beforeWolfDeath = {wolf1:targetSummary(wolf1Fc), wolf2:targetSummary(wolf2Fc), inventory:auditZoneInventories()};
    await applyDamage(wolf1Fc, 99);
    await new Promise(resolve => setTimeout(resolve, 980));
    syncBatch05Passives();
    const afterWolfDeath = {wolf2:targetSummary(wolf2Fc), inventory:auditZoneInventories(), graveyard:[...player1.graveyard]};

    return {beforeEnd, afterEnd, healed, elementalCount, pacte, afterPacte, beforeWolfDeath, afterWolfDeath};
  });
  expect(result.elementalCount).toBeGreaterThanOrEqual(1);
  expect(result.healed.pdv).toBe(result.healed.pdvMax);
  expect(result.pacte.success).toBe(true);
  expect(result.afterPacte.filter(card => card.player === "player1" && ["EDG000006", "EDG000005", "EDG000007"].includes(card.id)).every(card => card.atk >= 3)).toBe(true);
  expect(result.afterWolfDeath.graveyard).toContain("EDG000011");
  expect(result.afterWolfDeath.wolf2.atk).toBeGreaterThan(result.beforeWolfDeath.wolf2.atk);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch-05 signatures, no-effect cards and deck invariants remain consistent", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-05-elfes-des-bois");
  const signaturesById = byId(signatures.signatures);
  for (const id of [...fixture.forestElfIds, ...fixture.iceElfIds, ...fixture.adjacentIcePluralIds]) {
    const signature = signaturesById.get(id);
    expect(signature, id + " signature").toBeTruthy();
    if (fixture.noProgrammableEffectIds.includes(id)) {
      expect(signature.implementationStatus, id + " no effect").toBe(fixture.expectedNoEffectStatus);
    } else {
      expect(signature.implementationStatus, id + " status").toBe(fixture.expectedFunctionalStatus);
      expect(signature.missingPrimitives || [], id + " missing primitives").toEqual([]);
      expect(signature.directTest, id + " direct test").toBe(fixture.testFile);
    }
  }
  const deckAudit = await page.evaluate(() => {
    const count = values => values.reduce((acc, id) => { acc[id] = (acc[id] || 0) + 1; return acc; }, {});
    return {
      hokhanTotal:DECK_HOKHAN.length,
      hokhanUnique:Object.keys(count(DECK_HOKHAN)).length,
      uramTotal:DECK_URAM.length,
      uramUnique:Object.keys(count(DECK_URAM)).length,
      hokhanMaybe:[...START_MAYBE_HOKHAN],
      uramMaybe:[...START_MAYBE_URAM]
    };
  });
  expect(deckAudit).toMatchObject({hokhanTotal:60, hokhanUnique:45, uramTotal:60, uramUnique:37, hokhanMaybe:["R000010"], uramMaybe:["DIV000002"]});
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
