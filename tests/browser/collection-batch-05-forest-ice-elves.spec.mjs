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
  return diagnostics.consoleErrors.filter(message =>
    !/Failed to load resource: the server responded with a status of 404/i.test(message)
    && !/Failed to load resource: net::ERR_(NETWORK_CHANGED|NAME_NOT_RESOLVED)/i.test(message)
  );
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
        runtimeAudit:typeof auditCollectionBatch05Runtime === 'function' ? auditCollectionBatch05Runtime() : null,
        player1HandSize:player1.hand.length
      };
    }, {scenario, ids:allIds});
    expect(audit.scenarioId).toBe(scenario);
    expect(audit.publicOptionCount).toBe(fixture.expectedHiddenScenarioOptionCount);
    expect(audit.cards.every(card => card.exists), JSON.stringify(audit.cards.filter(card => !card.exists))).toBe(true);
    expect(audit.runtimeAudit).toBeTruthy();
    expect(audit.player1HandSize, scenario + ' visible test hand size').toBeLessThanOrEqual(fixture.maxVisualHandSize);
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



test("Batch-05B visual feedback covers forest elf corrections", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-05-elfes-des-bois");
  const result = await page.evaluate(async (expected) => {
    window.__mythesRandom = () => 0;
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };

    const kyra = CARDS_DATA.EDB000013;
    const kyraPreview = buildPreviewKeywordTooltips("EDB000013");

    resetServants(player1);
    resetServants(player2);
    const druid = await summonBatch03Servant(player1, "EDB000001", {triggerInitiativeEffect:false, ready:true});
    const ally = await summonBatch03Servant(player1, "EDB000005", {triggerInitiativeEffect:false, ready:true});
    const undead = await summonBatch03Servant(player2, "MV000020", {triggerInitiativeEffect:false, ready:true});
    const druidFc = document.querySelector('.fc[data-instance="' + druid.instanceId + '"]');
    const allyFc = document.querySelector('.fc[data-instance="' + ally.instanceId + '"]');
    const undeadFc = document.querySelector('.fc[data-instance="' + undead.instanceId + '"]');
    batch03UpdateStats(allyFc, {pdvMax:6, pdv:2});
    batch03UpdateStats(undeadFc, {pdvMax:20, pdv:20});
    const allyBefore = targetSummary(allyFc);
    const undeadBefore = targetSummary(undeadFc);
    await resolveCombat(druidFc, undeadFc);
    const allyAfter = targetSummary(allyFc);
    const undeadAfter = targetSummary(undeadFc);
    const druidEvents = collectionBatch05State.events.filter(event => event.type === "combat-post");

    resetServants(player1);
    const camo = await summonBatch03Servant(player1, "EDB000003", {triggerInitiativeEffect:false, ready:true});
    syncBatch05Passives();
    updateCamouflageVFX();
    const camoFc = document.querySelector('.fc[data-instance="' + camo.instanceId + '"]');
    const camoAudit = {vfx:camoFc.dataset.camouflageVfx || "", hover:camoFc.dataset.camouflageHoverVfx || "", hasPassive:camoFc.dataset.batch03PassivePulse === "1", layerSrc:camoFc.querySelector('.vfx-camo')?.getAttribute('src') || ""};

    resetServants(player1);
    await summonBatch03Servant(player1, "EDB000006", {triggerInitiativeEffect:false, ready:true});
    syncBatch05Passives();
    const vigilance = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "EDB000006");

    player1.hand = ["S000045"];
    player1.drawPile = [];
    refreshHand(player1);
    const gardens = await triggerSort("S000045", player1);
    const approZone = document.querySelector(playerZoneSelector(player1, "appro"));
    approZone.innerHTML = Array.from({length:5}, () => '<div class="slot-appro" data-player="' + player1.key + '"></div>').join("");
    ensureBotanicalGardenState(player1).enabled = true;
    for (let i = 0; i < 3; i++) {
      const slot = approZone.querySelector('.slot-appro');
      slot.outerHTML = buildFC("R000003", player1.key);
      const fc = Array.from(approZone.querySelectorAll('.fc[data-id="R000003"]')).pop();
      registerSupplyInstance(player1, fc);
    }
    const stack = botanicalStackForCard(player1, "R000003");
    const botanical = {gardens, members:botanicalStackMembers(player1, stack).length, vector:botanicalStackVector(player1, stack)};

    return {kyra:{atk:kyra.atk, pdv:kyra.pdv, cap:kyra.cap, tooltipCount:(kyra.extraTooltips || []).length, tooltipHtml:kyraPreview}, druid:{allyBefore, allyAfter, undeadBefore, undeadAfter, lastEvent:druidEvents[druidEvents.length - 1]}, camoAudit, vigilance:{hasPassive:vigilance?.dataset.batch03PassivePulse === "1"}, botanical, expected};
  }, fixture);
  expect(result.kyra.atk).toBe(fixture.expectedKyra.atk);
  expect(result.kyra.pdv).toBe(fixture.expectedKyra.pdv);
  expect(result.kyra.tooltipCount).toBe(fixture.expectedKyra.tooltipCount);
  expect(result.kyra.tooltipHtml).toContain("COMPORTEMENT 4");
  expect(result.kyra.tooltipHtml).toContain(fixture.expectedKyra.behaviorThreeKeyword);
  expect(result.druid.undeadAfter.pdv).toBeLessThanOrEqual(result.druid.undeadBefore.pdv - 6);
  expect(result.druid.allyAfter.pdv).toBe(result.druid.allyBefore.pdv + 1);
  expect(result.druid.lastEvent.results.some(entry => entry.type === "druid-heal")).toBe(true);
  expect(result.camoAudit.vfx).toBe("VFX000010");
  expect(result.camoAudit.hover).toBe("VFX000012");
  expect(result.camoAudit.layerSrc).toContain("VFX000010.png");
  expect(result.camoAudit.hasPassive).toBe(true);
  expect(result.vigilance.hasPassive).toBe(true);
  expect(result.botanical.members).toBe(fixture.botanicalBerryStack.copies);
  expect(result.botanical.vector.nourriture).toBe(fixture.botanicalBerryStack.production.nourriture);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch-05B Tisseur, ancient ice spells and rescue shield resolve as runtime effects", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-05-anciens-givre");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    resetServants(player1);
    resetServants(player2);
    player1.hand = ["S000026","S000027","S000029","S000034"];
    player1.drawPile = ["EDG000001","EDG000003","EDG000004","EDG000006","S000004"];
    player1.graveyard = ["EDG000001","EDG000003","EDG000006","EDG000008"];
    refreshHand(player1);
    await summonBatch03Servant(player1, "EDG000008", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "EDG000007", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    const oath = await triggerSort("S000026", player1);
    const tisseur = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "EDG000012");
    const tisseurSummary = targetSummary(tisseur);
    const afterOath = {board:livingServantCardsForPlayer(player1).map(targetSummary), opponent:livingServantCardsForPlayer(player2).map(targetSummary), graveyard:[...player1.graveyard], hand:[...player1.hand]};

    player1.drawPile = ["EDG000001"];
    const blockedDraw = drawCardFromRuntimeDeck(player1, {sourceCardId:"S000029"});
    const lockedSummon = await summonBatch03Servant(player1, "EDG000006", {sourceCardId:"S000029", triggerInitiativeEffect:false, ready:true});
    const tisseurBeforeDamageCount = livingServantCardsForPlayer(player1).length;
    await applyDamage(tisseur, 1);
    const afterTisseurDamage = livingServantCardsForPlayer(player1).map(targetSummary);

    const avatarHpBefore = Number(document.querySelector(playerZoneSelector(player2, 'avatar') + ' .av-stat:nth-child(2) span')?.textContent || 50);
    await attackAvatar(tisseur, player2);
    const avatarHpAfter = Number(document.querySelector(playerZoneSelector(player2, 'avatar') + ' .av-stat:nth-child(2) span')?.textContent || 50);

    const snowfall = resolveChuteDeNeige(player1);
    resetServants(player2);
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    applyEndOfTurnEffects(player1);
    const coldTargets = livingServantCardsForPlayer(player2).map(fc => ({id:fc.dataset.id, gel:Number(fc.dataset.frozen || 0), cdg:Number(fc.dataset.frozen_cdg || 0)}));

    resetServants(player1);
    player1.drawPile = ["EDG000001","EDG000003","EDG000004","H000001","S000004"];
    player1.hand = [];
    refreshHand(player1);
    const patrol = resolvePatrouilleGlaciale(player1);

    resetServants(player1);
    const fragile = await summonBatch03Servant(player1, "EDG000006", {triggerInitiativeEffect:false, ready:true});
    const fragileFc = document.querySelector('.fc[data-instance="' + fragile.instanceId + '"]');
    batch03UpdateStats(fragileFc, {pdvMax:6, pdv:2});
    const rescue = resolveSecoursMagique(player1);
    const graveyardDragonCountBeforeRescue = player1.graveyard.filter(id => id === "EDG000006").length;
    const died = await applyDamage(fragileFc, 99);
    const saved = targetSummary(fragileFc);
    const graveyardDragonCountAfterRescue = player1.graveyard.filter(id => id === "EDG000006").length;

    return {oath, tisseurSummary, afterOath, blockedDraw, lockedSummon, tisseurBeforeDamageCount, afterTisseurDamage, avatarHpBefore, avatarHpAfter, snowfall, coldTargets, patrol, handAfterPatrol:[...player1.hand], deckAfterPatrol:[...player1.drawPile], rescue, died, saved, graveyard:[...player1.graveyard], graveyardDragonCountBeforeRescue, graveyardDragonCountAfterRescue};
  });
  expect(result.oath.success).toBe(true);
  expect(result.tisseurSummary.id).toBe("EDG000012");
  expect(result.tisseurSummary.atk).toBeGreaterThan(20);
  expect(result.afterOath.opponent).toHaveLength(0);
  expect(result.afterOath.hand).toHaveLength(0);
  expect(result.blockedDraw.success).toBe(false);
  expect(result.blockedDraw.reason).toBe("tisseur-draw-lock");
  expect(result.lockedSummon.success).toBe(false);
  expect(result.lockedSummon.reason).toBe("tisseur-summon-lock");
  expect(result.afterTisseurDamage.length).toBe(result.tisseurBeforeDamageCount + 1);
  expect(result.afterTisseurDamage.some(card => ["DIV000010", "EDG000006"].includes(card.id))).toBe(true);
  expect(result.avatarHpAfter).toBe(result.avatarHpBefore);
  expect(result.snowfall.success).toBe(true);
  expect(result.coldTargets.some(card => card.gel >= 3 || card.cdg >= 2)).toBe(true);
  expect(result.patrol.success).toBe(true);
  expect(result.handAfterPatrol).toEqual(expect.arrayContaining(["EDG000001", "EDG000003", "EDG000004"]));
  expect(result.deckAfterPatrol).toEqual(expect.arrayContaining(["H000001", "S000004"]));
  expect(result.rescue.success).toBe(true);
  expect(result.died).toBe(false);
  expect(result.saved.pdv).toBe(1);
  expect(result.graveyardDragonCountAfterRescue).toBe(result.graveyardDragonCountBeforeRescue);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});


test("Batch-05C Daddy feedback keeps text, lore and scenario readability deterministic", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-05-elfes-des-bois");
  const result = await page.evaluate(async () => {
    const pixie = CARDS_DATA.S000040;
    const worker = CARDS_DATA.EDB000004;
    const workerHtml = buildHC("EDB000004", player1.key, 0);
    const pixieHtml = buildHC("S000040", player1.key, 0);
    return {
      pixieCap:pixie.cap || "",
      pixieTextHasUnaccented:/cimetiere/i.test(pixie.cap || ""),
      workerLore:worker.lore || "",
      workerHtml,
      pixieHtml,
      forestHandSize:player1.hand.length
    };
  });
  await openScenario(page, "collection-batch-05-elfes-de-glace");
  result.iceHandSize = await page.evaluate(() => player1.hand.length);
  expect(result.pixieCap).toContain("cimetière");
  expect(result.pixieTextHasUnaccented).toBe(false);
  expect(result.workerLore.length).toBeGreaterThan(20);
  expect(result.workerHtml).toContain("card-lore-text");
  expect(result.workerHtml).toContain("<i");
  expect(result.pixieHtml).not.toContain("card-lore-text");
  expect(result.forestHandSize).toBeLessThanOrEqual(fixture.maxVisualHandSize);
  expect(result.iceHandSize).toBeLessThanOrEqual(fixture.maxVisualHandSize);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch-05C combat feedback covers Druide counter, cold retaliation and Kyra rune replay lock", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-05-druide");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    resetServants(player1);
    resetServants(player2);
    const druid = await summonBatch03Servant(player1, "EDB000001", {triggerInitiativeEffect:false, ready:true});
    const undead = await summonBatch03Servant(player2, "MV000020", {triggerInitiativeEffect:false, ready:true});
    const druidFc = document.querySelector('.fc[data-instance="' + druid.instanceId + '"]');
    const undeadFc = document.querySelector('.fc[data-instance="' + undead.instanceId + '"]');
    batch03UpdateStats(druidFc, {pdvMax:20, pdv:20});
    batch03UpdateStats(undeadFc, {pdvMax:20, pdv:20, atk:1});
    const beforeCounter = targetSummary(undeadFc);
    const druidCounterAtk = Number(druidFc.dataset.atk || 0);
    await resolveCombat(undeadFc, druidFc);
    const afterCounter = targetSummary(undeadFc);

    resetServants(player1);
    resetServants(player2);
    const guard = await summonBatch03Servant(player1, "EDG000003", {triggerInitiativeEffect:false, ready:true});
    const attacker = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const guardFc = document.querySelector('.fc[data-instance="' + guard.instanceId + '"]');
    const attackerFc = document.querySelector('.fc[data-instance="' + attacker.instanceId + '"]');
    batch03UpdateStats(guardFc, {pdvMax:20, pdv:20, atk:1});
    batch03UpdateStats(attackerFc, {pdvMax:20, pdv:20, atk:1});
    await resolveCombat(attackerFc, guardFc);
    const guardEvent = collectionBatch05State.events.filter(event => event.type === "combat-retaliation-cold").pop();

    resetServants(player1);
    const kyra = await summonBatch03Servant(player1, "EDB000013", {triggerInitiativeEffect:false, ready:true});
    const kyraFc = document.querySelector('.fc[data-instance="' + kyra.instanceId + '"]');
    await applyDamage(kyraFc, 99);
    const kyraIndex = player1.hand.lastIndexOf("EDB000013");
    const kyraBlocked = isBatch03HandCardBlocked("EDB000013", player1, kyraIndex);
    const handHasKyra = player1.hand.includes("EDB000013");
    return {beforeCounter, afterCounter, druidCounterAtk, guardEvent, kyraIndex, kyraBlocked, handHasKyra};
  });
  expect(result.afterCounter.pdv).toBeLessThanOrEqual(result.beforeCounter.pdv - result.druidCounterAtk * 2 + 2);
  expect(result.guardEvent?.type).toBe("combat-retaliation-cold");
  expect(result.guardEvent?.coldType).toBe("garde-hivernale");
  expect(result.kyraIndex).toBeGreaterThanOrEqual(0);
  expect(result.handHasKyra).toBe(true);
  expect(result.kyraBlocked).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch-05C dedicated scenarios cover Envoûteuse, Après la catastrophe and Grande-soigneuse tie rules", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-05-envouteuse");
  const envouteuse = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    await summonBatch03Servant(player1, "EDB000011", {triggerInitiativeEffect:true, ready:true});
    const free = {hand:[...player1.hand], event:collectionBatch05State.events.filter(event => event.type === "initiative-generic").pop()};
    resetServants(player1);
    player1.hand = Array.from({length:MAX_HAND}, (_, index) => index % 2 === 0 ? "H000001" : "H000005");
    refreshHand(player1);
    await summonBatch03Servant(player1, "EDB000011", {triggerInitiativeEffect:true, ready:true});
    const full = {hand:[...player1.hand], eventCount:collectionBatch05State.events.filter(event => event.type === "initiative-generic" && event.cardId === "EDB000011").length};

    resetServants(player1);
    player1.hand = [];
    player1.graveyard = [];
    refreshHand(player1);
    const vengeanceStart = collectionBatch05State.events.length;
    const vengeanceCard = await summonBatch03Servant(player1, "EDB000011", {triggerInitiativeEffect:true, ready:true});
    const vengeanceFc = document.querySelector('.fc[data-instance="' + vengeanceCard.instanceId + '"]');
    const createdBeforeDeath = [...player1.hand].filter(id => ["R000014","R000004","R000017"].includes(id));
    await applyDamage(vengeanceFc, 99);
    await new Promise(resolve => setTimeout(resolve, 1280));
    const vengeanceEvents = collectionBatch05State.events.slice(vengeanceStart);
    const pulseIndex = vengeanceEvents.findIndex(event => event.type === "envouteuse-vengeance-feedback" && event.phase === "pulse");
    const messageIndex = vengeanceEvents.findIndex(event => event.type === "envouteuse-vengeance-feedback" && event.phase === "message");
    const pulse = vengeanceEvents[pulseIndex] || null;
    const message = vengeanceEvents[messageIndex] || null;
    const afterVengeance = {
      createdBeforeDeath,
      hand:[...player1.hand],
      graveyard:[...player1.graveyard],
      pulseIndex,
      messageIndex,
      pulse,
      message
    };

    resetServants(player1);
    player1.hand = [];
    player1.graveyard = [];
    refreshHand(player1);
    const noopStart = collectionBatch05State.events.length;
    const noopCard = await summonBatch03Servant(player1, "EDB000011", {triggerInitiativeEffect:false, ready:true});
    const noopFc = document.querySelector('.fc[data-instance="' + noopCard.instanceId + '"]');
    await applyDamage(noopFc, 99);
    await new Promise(resolve => setTimeout(resolve, 760));
    await new Promise(resolve => setTimeout(resolve, 620));
    const noopEvents = collectionBatch05State.events.slice(noopStart).filter(event => event.type === "envouteuse-vengeance-feedback");
    const noFalsePulse = {eventCount:noopEvents.length, hand:[...player1.hand], graveyard:[...player1.graveyard]};
    return {free, full, afterVengeance, noFalsePulse};
  });
  expect(envouteuse.free.hand).toEqual(expect.arrayContaining(["R000014", "R000004", "R000017"]));
  expect(envouteuse.free.event?.cardId).toBe("EDB000011");
  expect(envouteuse.full.hand).not.toEqual(expect.arrayContaining(["R000014", "R000004", "R000017"]));
  expect(envouteuse.full.eventCount).toBe(1);
  expect(envouteuse.afterVengeance.createdBeforeDeath).toEqual(["R000014", "R000004", "R000017"]);
  expect(envouteuse.afterVengeance.hand).not.toEqual(expect.arrayContaining(["R000014", "R000004", "R000017"]));
  expect(envouteuse.afterVengeance.graveyard).toContain("EDB000011");
  expect(envouteuse.afterVengeance.pulseIndex).toBeGreaterThanOrEqual(0);
  expect(envouteuse.afterVengeance.messageIndex).toBeGreaterThan(envouteuse.afterVengeance.pulseIndex);
  expect(envouteuse.afterVengeance.pulse).toMatchObject({sourceHasPulse:true, sourceHasMove:true, sourcePulseReason:"vengeance"});
  expect(envouteuse.afterVengeance.message).toMatchObject({phase:"message", sourcePulseReason:"vengeance"});
  expect(envouteuse.noFalsePulse.eventCount).toBe(0);
  expect(envouteuse.noFalsePulse.graveyard).toContain("EDB000011");

  await openScenario(page, "collection-batch-05-apres-catastrophe");
  const catastrophe = await page.evaluate(async () => {
    player1.hand = ["S000015"];
    refreshHand(player1);
    const promise = triggerSort("S000015", player1);
    await new Promise(resolve => setTimeout(resolve, 120));
    const style = getComputedStyle(document.querySelector('.sort-choice-cards'));
    const childCount = document.querySelectorAll('.sort-choice-item').length;
    const panel = document.querySelector('.apres-catastrophe-choice-panel');
    const title = document.querySelector('.apres-catastrophe-choice-panel .sort-choice-title');
    const reduce = document.querySelector('#apresMinimize') || document.querySelector('.apres-catastrophe-choice-panel .decision-modal-minimize');
    const rect = element => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return {left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height, centerX:r.left + r.width / 2};
    };
    const layout = {panel:rect(panel), title:rect(title), reduce:rect(reduce)};
    document.querySelector('#apresCancel')?.click?.();
    return {childCount, flexWrap:style.flexWrap, overflowY:style.overflowY, promiseType:typeof promise, layout};
  });
  expect(catastrophe.childCount).toBeGreaterThan(10);
  expect(catastrophe.flexWrap).toBe("wrap");
  expect(["auto", "scroll"]).toContain(catastrophe.overflowY);
  expect(Math.abs(catastrophe.layout.title.centerX - catastrophe.layout.panel.centerX)).toBeLessThanOrEqual(6);
  expect(catastrophe.layout.reduce.bottom).toBeLessThanOrEqual(catastrophe.layout.title.top);
  expect(catastrophe.layout.panel.right - catastrophe.layout.reduce.right).toBeLessThanOrEqual(40);

  await openScenario(page, "collection-batch-05-elfes-de-glace");
  const healer = await page.evaluate(() => {
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    return (async () => {
      resetServants(player1);
      await summonBatch03Servant(player1, "EDG000007", {triggerInitiativeEffect:false, ready:true});
      const a = await summonBatch03Servant(player1, "EDG000006", {triggerInitiativeEffect:false, ready:true});
      const b = await summonBatch03Servant(player1, "H000005", {triggerInitiativeEffect:false, ready:true});
      const afc = document.querySelector('.fc[data-instance="' + a.instanceId + '"]');
      const bfc = document.querySelector('.fc[data-instance="' + b.instanceId + '"]');
      batch03UpdateStats(afc, {pdvMax:6, pdv:2});
      batch03UpdateStats(bfc, {pdvMax:6, pdv:2});
      applyEndOfTurnEffects(player1);
      return {a:targetSummary(afc), b:targetSummary(bfc), event:collectionBatch05State.events.filter(event => event.type === "combat-retaliation-cold").length};
    })();
  });
  expect(healer.a.pdv).toBe(5);
  expect(healer.b.pdv).toBe(5);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch-05C cold duration and ancient oath bonuses survive passive resync", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-05-anciens-givre");
  const result = await page.evaluate(async () => {
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    window.__mythesRandom = () => 0;
    resetServants(player1);
    resetServants(player2);
    player1.hand = ["S000026","S000027"];
    player1.graveyard = ["EDG000001","EDG000003","EDG000006"];
    refreshHand(player1);
    await triggerSort("S000026", player1);
    const tisseur = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "EDG000012");
    const afterOath = targetSummary(tisseur);
    syncBatch05Passives();
    const afterResync = targetSummary(tisseur);
    resolveChuteDeNeige(player1);
    const enemy = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const enemy2 = await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    const enemyFc = document.querySelector('.fc[data-instance="' + enemy.instanceId + '"]');
    const enemy2Fc = document.querySelector('.fc[data-instance="' + enemy2.instanceId + '"]');
    batch05ApplyGel({sourcePlayer:player1, targetFC:enemyFc, sourceCardId:"S000027", turns:1, type:"gel"});
    const gelAfterSnow = Number(enemyFc.dataset.frozen || 0);
    batch05ApplyGel({sourcePlayer:player1, targetFC:enemy2Fc, sourceCardId:"S000027", turns:1, type:"cdg"});
    const cdgAfterSnow = Number(enemy2Fc.dataset.frozen_cdg || 0);
    return {afterOath, afterResync, gelAfterSnow, cdgAfterSnow};
  });
  expect(result.afterOath.atk).toBeGreaterThan(20);
  expect(result.afterResync.atk).toBe(result.afterOath.atk);
  expect(result.afterResync.pdvMax).toBe(result.afterOath.pdvMax);
  expect(result.gelAfterSnow).toBe(fixture.coldDurations.afterSnowfallGel);
  expect(result.cdgAfterSnow).toBe(fixture.coldDurations.afterSnowfallCdg);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});


test("Batch-05D Daddy feedback locks timing, status scenarios and highlighted text", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-05-elfes-des-bois");
  const textAudit = await page.evaluate((expected) => {
    player1.hand = ["EDB000004"];
    refreshHand(player1);
    const loreEl = document.querySelector('.hc[data-id="EDB000004"] .card-lore-text');
    const cap = id => CARDS_DATA[id]?.cap || "";
    const detail = id => CARDS_DATA[id]?.detail || "";
    return {
      caps:Object.fromEntries(Object.keys(expected.expectedHighlights).map(id => [id, cap(id)])),
      kyraCap:cap("EDB000013"),
      kyraDetail:detail("EDB000013"),
      kyraMessage:batch03BlockedCardPublicMessage("Serviteur de la rune"),
      loreColor:getComputedStyle(loreEl).color,
      loreHtml:loreEl?.outerHTML || ""
    };
  }, fixture);
  for (const [id, snippets] of Object.entries(fixture.expectedHighlights)) {
    for (const snippet of snippets) expect(textAudit.caps[id], id + " highlight " + snippet).toContain(snippet);
  }
  expect(textAudit.kyraCap).toBe(fixture.expectedKyra.cap);
  expect(textAudit.kyraDetail).toBe(fixture.expectedKyra.cap);
  expect(textAudit.kyraDetail).not.toContain("Comportement n°1");
  expect(textAudit.kyraMessage).toBe(fixture.expectedKyra.blockedMessage);
  expect(textAudit.loreHtml).toContain("card-lore-text");
  expect(textAudit.loreColor).toBe("rgb(30, 16, 5)");

  await openScenario(page, "collection-batch-05-dryade-cleanse");
  const dryade = await page.evaluate(async () => {
    const status = fc => ({id:fc.dataset.id, pdv:Number(fc.dataset.pdv || 0), pdvMax:Number(fc.dataset.pdvMax || 0), burning:Number(fc.dataset.burning || 0), gel:Number(fc.dataset.frozen || 0), cdg:Number(fc.dataset.frozen_cdg || 0), hypnose:Number(fc.dataset.hypno || 0)});
    const before = livingServantCardsForPlayer(player1).map(status);
    await summonBatch03Servant(player1, "EDB000014", {triggerInitiativeEffect:true, ready:true});
    const after = livingServantCardsForPlayer(player1).filter(fc => fc.dataset.id !== "EDB000014").map(status);
    const feedbackIndex = collectionBatch05State.events.findIndex(event => event.type === "feedback-before-effect" && event.reason === "initiative" && event.cardId === "EDB000014");
    const initiativeIndex = collectionBatch05State.events.findIndex(event => event.type === "initiative" && event.cardId === "EDB000014");
    return {before, after, feedbackIndex, initiativeIndex};
  });
  expect(dryade.before.some(card => card.burning > 0)).toBe(true);
  expect(dryade.before.some(card => card.gel > 0)).toBe(true);
  expect(dryade.before.some(card => card.cdg > 0)).toBe(true);
  expect(dryade.before.some(card => card.hypnose > 0)).toBe(true);
  expect(dryade.after.every(card => card.pdv === card.pdvMax)).toBe(true);
  expect(dryade.after.every(card => card.burning === 0 && card.gel === 0 && card.cdg === 0 && card.hypnose === 0)).toBe(true);
  expect(dryade.feedbackIndex).toBeGreaterThanOrEqual(0);
  expect(dryade.initiativeIndex).toBeGreaterThan(dryade.feedbackIndex);

  await openScenario(page, "collection-batch-05-pacte-millenaire");
  const pacte = await page.evaluate(async () => {
    const before = {hand:[...player1.hand], deck:[...player1.drawPile], graveyard:[...player1.graveyard], board:livingServantCardsForPlayer(player1).map(targetSummary)};
    const result = await triggerSort("S000023", player1);
    syncBatch05Passives();
    const after = {hand:[...player1.hand], deck:[...player1.drawPile], graveyard:[...player1.graveyard], board:livingServantCardsForPlayer(player1).map(targetSummary)};
    return {before, result, after};
  });
  expect(pacte.before.hand).toEqual(["S000023"]);
  expect(pacte.before.graveyard.filter(id => id === "EDG000006")).toHaveLength(3);
  expect(pacte.before.board.some(card => card.id === "EDG000004")).toBe(true);
  expect(pacte.result).toMatchObject({success:true, mode:"graveyard-atk-buff", amount:1});
  const pacteTargetBefore = pacte.before.board.find(card => card.id === "EDG000004");
  const pacteTargetAfter = pacte.after.board.find(card => card.id === "EDG000004");
  expect(pacteTargetAfter.atk).toBe(pacteTargetBefore.atk + 1);

  await openScenario(page, "collection-batch-05-anciens-givre");
  const snow = await page.evaluate(() => {
    const result = resolveChuteDeNeige(player1);
    const enemy = document.querySelector(playerZoneSelector(player2, "servants") + ' .fc:not([data-dead])');
    batch05ApplyGel({sourcePlayer:player1, targetFC:enemy, sourceCardId:"S000027", turns:1, type:"gel"});
    const gel = Number(enemy.dataset.frozen || 0);
    clearBatch05NegativeStatuses(enemy);
    batch05ApplyGel({sourcePlayer:player1, targetFC:enemy, sourceCardId:"S000027", turns:1, type:"cdg"});
    const cdg = Number(enemy.dataset.frozen_cdg || 0);
    return {result, gel, cdg};
  });
  expect(snow.result.bonus).toBe(1);
  expect(snow.result.effectiveBonus).toBe(1);
  expect(snow.gel).toBe(fixture.coldDurations.afterSnowfallGel);
  expect(snow.cdg).toBe(fixture.coldDurations.afterSnowfallCdg);

  await openScenario(page, "collection-batch-05-elfes-des-bois");
  const timing = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    resetServants(player1);
    resetServants(player2);
    const blade = await summonBatch03Servant(player1, "EDB000007", {triggerInitiativeEffect:false, ready:true});
    const target = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const bladeFc = document.querySelector('.fc[data-instance="' + blade.instanceId + '"]');
    const targetFc = document.querySelector('.fc[data-instance="' + target.instanceId + '"]');
    batch03UpdateStats(targetFc, {pdvMax:30, pdv:30, atk:0});
    await resolveCombat(bladeFc, targetFc);
    const feedbackIndex = collectionBatch05State.events.findIndex(event => event.type === "feedback-before-effect" && event.reason === "lame-sylvestre-cdg");
    const postIndex = collectionBatch05State.events.findIndex(event => event.type === "combat-post" && event.results?.some(result => result.type === "lame-sylvestre-cdg"));
    resetServants(player1);
    resetServants(player2);
    const tree = await summonBatch03Servant(player1, "EDB000009", {triggerInitiativeEffect:false, ready:true});
    const worker = await summonBatch03Servant(player1, "EDB000004", {triggerInitiativeEffect:false, ready:true});
    const treeFc = document.querySelector('.fc[data-instance="' + tree.instanceId + '"]');
    const workerFc = document.querySelector('.fc[data-instance="' + worker.instanceId + '"]');
    const treeBefore = targetSummary(treeFc);
    await applyDamage(workerFc, 99);
    await new Promise(resolve => setTimeout(resolve, 980));
    const treeAfter = targetSummary(treeFc);
    const treeFeedback = collectionBatch05State.events.find(event => event.type === "feedback-before-effect" && event.reason === "tree-atk");
    return {feedbackIndex, postIndex, target:targetSummary(targetFc), treeBefore, treeAfter, treeFeedback};
  });
  expect(timing.feedbackIndex).toBeGreaterThanOrEqual(0);
  expect(timing.postIndex).toBeGreaterThan(timing.feedbackIndex);
  expect(timing.target.cdg).toBeGreaterThanOrEqual(1);
  expect(timing.treeFeedback).toBeTruthy();
  expect(timing.treeAfter.atk).toBe(timing.treeBefore.atk + 1);

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});


test("Batch-05E locks snow bonus, exact text highlights and visual effect timing", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-05-chute-de-neige");
  const snowAudit = await page.evaluate(async () => {
    const cap = id => CARDS_DATA[id]?.cap || "";
    const beforeCaps = {
      EDG000001:cap("EDG000001"),
      EDG000004:cap("EDG000004"),
      EDG000006:cap("EDG000006"),
      EDG000010:cap("EDG000010"),
      EDG000005:cap("EDG000005"),
      EDG000013:cap("EDG000013"),
      S000018:cap("S000018"),
      S000027:cap("S000027"),
      S000029:cap("S000029")
    };
    const archerePreview = (() => {
      const container = document.createElement("div");
      container.innerHTML = buildHC("EDG000013", player1);
      document.body.appendChild(container);
      const kv = Array.from(container.querySelectorAll("strong.kv")).find(node => node.textContent.trim() === "50%");
      const result = {html:container.innerHTML, kvHtml:kv?.outerHTML || "", kvText:kv?.textContent.trim() || "", kvColor:kv ? getComputedStyle(kv).color : ""};
      container.remove();
      return result;
    })();
    const preSnowEnemy = document.querySelector(playerZoneSelector(player2, "servants") + ' .fc[data-id="H000001"]');
    batch05ApplyGel({sourcePlayer:player1, targetFC:preSnowEnemy, sourceCardId:"S000027", turns:1, type:"cdg"});
    const preSnowCdgBefore = Number(preSnowEnemy.dataset.frozen_cdg || 0);
    const preSnowBadgeBefore = preSnowEnemy.querySelector(".fc-ice-badge span")?.textContent || "";
    const first = resolveChuteDeNeige(player1);
    const second = resolveChuteDeNeige(player1);
    const preSnowCdgAfter = Number(preSnowEnemy.dataset.frozen_cdg || 0);
    const preSnowBadgeAfter = preSnowEnemy.querySelector(".fc-ice-badge span")?.textContent || "";
    const enemy = document.querySelector(playerZoneSelector(player2, "servants") + ' .fc[data-id="H000001"]');
    clearBatch05NegativeStatuses(enemy);
    batch05ApplyGel({sourcePlayer:player1, targetFC:enemy, sourceCardId:"S000027", turns:1, type:"gel"});
    const gelOneTurn = Number(enemy.dataset.frozen || 0);
    const gelBadge = enemy.querySelector(".fc-ice-badge span")?.textContent || "";
    clearBatch05NegativeStatuses(enemy);
    batch05ApplyGel({sourcePlayer:player1, targetFC:enemy, sourceCardId:"S000027", turns:2, type:"cdg"});
    const cdgTwoTurns = Number(enemy.dataset.frozen_cdg || 0);
    const cdgBadge = enemy.querySelector(".fc-ice-badge span")?.textContent || "";
    clearBatch05NegativeStatuses(enemy);
    const apprentice = await summonBatch03Servant(player1, "EDG000001", {triggerInitiativeEffect:false, ready:true});
    const apprenticeFc = document.querySelector('.fc[data-instance="' + apprentice.instanceId + '"]');
    batch03UpdateStats(enemy, {pdvMax:30, pdv:30, atk:0});
    await resolveCombat(apprenticeFc, enemy);
    const apprenticeCdg = Number(enemy.dataset.frozen_cdg || 0);
    const apprenticeBadge = enemy.querySelector(".fc-ice-badge span")?.textContent || "";
    clearBatch05NegativeStatuses(enemy);
    const dragon = document.querySelector(playerZoneSelector(player1, "servants") + ' .fc[data-id="EDG000006"]');
    await resolveBatch05Initiative("EDG000006", player1, {sourceFC:dragon});
    const dragonTargets = livingServantCardsForPlayer(player2).map(fc => ({id:fc.dataset.id, cdg:Number(fc.dataset.frozen_cdg || 0), badge:fc.querySelector(".fc-ice-badge span")?.textContent || ""}));
    for (const target of livingServantCardsForPlayer(player2)) clearBatch05NegativeStatuses(target);
    const archer = document.querySelector(playerZoneSelector(player1, "servants") + ' .fc[data-id="EDG000004"]');
    const archerTarget = document.querySelector(playerZoneSelector(player2, "servants") + ' .fc[data-id="H000005"]');
    batch03UpdateStats(archerTarget, {pdvMax:30, pdv:30, atk:0});
    await resolveCombat(archer, archerTarget);
    const archerCdg = Number(archerTarget.dataset.frozen_cdg || 0);
    const archerBadge = archerTarget.querySelector(".fc-ice-badge span")?.textContent || "";
    const afterCaps = {
      EDG000001:cap("EDG000001"),
      EDG000004:cap("EDG000004"),
      EDG000006:cap("EDG000006"),
      S000011:cap("S000011")
    };
    return {beforeCaps, afterCaps, archerePreview, first, second, preSnowCdgBefore, preSnowBadgeBefore, preSnowCdgAfter, preSnowBadgeAfter, gelOneTurn, gelBadge, cdgTwoTurns, cdgBadge, apprenticeCdg, apprenticeBadge, dragonTargets, archerCdg, archerBadge, bonus:player1.batch05SnowfallBonus};
  });
  expect(snowAudit.beforeCaps.EDG000005).toContain("*1* « Élémentaire de glace »");
  expect(snowAudit.beforeCaps.EDG000005).not.toContain("si possible");
  expect(snowAudit.beforeCaps.EDG000010).toContain("*1* « Loup blanc »");
  expect(snowAudit.beforeCaps.EDG000010).not.toContain("*1 Loup blanc*");
  expect(snowAudit.beforeCaps.S000018).toContain("*+1 ATK*");
  expect(snowAudit.beforeCaps.S000018).toContain("*+2 PDV*");
  expect((snowAudit.beforeCaps.EDG000006.match(/\*1\*/g) || [])).toHaveLength(2);
  expect(snowAudit.beforeCaps.S000027).toContain("*1 tour*");
  expect(snowAudit.beforeCaps.S000029).toContain("*3* serviteurs");
  expect(snowAudit.beforeCaps.S000029).not.toContain("*3 serviteurs*");
  expect(snowAudit.beforeCaps.EDG000013).toContain("*50%*");
  expect(snowAudit.beforeCaps.EDG000013).toContain("« Archère millénaire »");
  expect(snowAudit.beforeCaps.EDG000013).not.toContain("*50 %*");
  expect(snowAudit.archerePreview.kvText).toBe("50%");
  expect(snowAudit.archerePreview.kvHtml).toContain("class=\"kv\"");
  expect(snowAudit.archerePreview.kvColor).toBe("rgb(10, 74, 138)");
  expect(snowAudit.first).toMatchObject({success:true, bonus:1, effectiveBonus:1, alreadyActive:false});
  expect(snowAudit.second).toMatchObject({success:true, bonus:1, effectiveBonus:1, alreadyActive:true});
  expect(snowAudit.bonus).toBe(1);
  expect(snowAudit.preSnowCdgBefore).toBe(1);
  expect(snowAudit.preSnowBadgeBefore).toBe("1");
  expect(snowAudit.preSnowCdgAfter).toBe(1);
  expect(snowAudit.preSnowBadgeAfter).toBe("1");
  expect(snowAudit.gelOneTurn).toBe(2);
  expect(snowAudit.gelBadge).toBe("2");
  expect(snowAudit.cdgTwoTurns).toBe(3);
  expect(snowAudit.cdgBadge).toBe("3");
  expect(snowAudit.apprenticeCdg).toBe(2);
  expect(snowAudit.apprenticeBadge).toBe("2");
  expect(snowAudit.dragonTargets.every(target => target.cdg === 2 && target.badge === "2")).toBe(true);
  expect(snowAudit.archerCdg).toBe(3);
  expect(snowAudit.archerBadge).toBe("3");
  expect(snowAudit.afterCaps.EDG000001).toContain("*4* tours");
  expect(snowAudit.afterCaps.EDG000004).toContain("*3* tours");
  expect((snowAudit.afterCaps.EDG000006.match(/\*2\*/g) || [])).toHaveLength(2);
  expect(snowAudit.afterCaps.S000011).toContain("*3* tours");

  await openScenario(page, "collection-batch-05-jeune-dragon-riposte");
  const dragonAudit = await page.evaluate(async () => {
    const attacker = document.querySelector(playerZoneSelector(player2, "servants") + ' .fc[data-id="H000001"]');
    const dragon = document.querySelector(playerZoneSelector(player1, "servants") + ' .fc[data-id="EDG000006"]');
    batch03UpdateStats(attacker, {pdvMax:30, pdv:30, atk:4});
    batch03UpdateStats(dragon, {pdvMax:18, pdv:18, atk:6});
    const before = targetSummary(attacker);
    await resolveCombat(attacker, dragon);
    const after = targetSummary(attacker);
    const feedbackIndex = collectionBatch05State.events.findIndex(event => event.type === "feedback-before-effect" && event.reason === "ice-damage-cdg" && event.phase === "counter");
    const postIndex = collectionBatch05State.events.findIndex(event => event.type === "combat-post" && event.results?.some(result => result.type === "ice-damage-cdg" && result.phase === "counter"));
    return {before, after, feedbackIndex, postIndex};
  });
  expect(dragonAudit.feedbackIndex).toBeGreaterThanOrEqual(0);
  expect(dragonAudit.postIndex).toBeGreaterThan(dragonAudit.feedbackIndex);
  expect(dragonAudit.before.cdg).toBe(0);
  expect(dragonAudit.after.cdg).toBe(1);

  await openScenario(page, "collection-batch-05-elfes-de-glace");
  const iceTiming = await page.evaluate(async () => {
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    resetServants(player1);
    resetServants(player2);
    const apprentice = await summonBatch03Servant(player1, "EDG000001", {triggerInitiativeEffect:false, ready:true});
    const archer = await summonBatch03Servant(player1, "EDG000004", {triggerInitiativeEffect:false, ready:true});
    const aTarget = await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const bTarget = await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    const apprenticeFc = document.querySelector('.fc[data-instance="' + apprentice.instanceId + '"]');
    const archerFc = document.querySelector('.fc[data-instance="' + archer.instanceId + '"]');
    const aTargetFc = document.querySelector('.fc[data-instance="' + aTarget.instanceId + '"]');
    const bTargetFc = document.querySelector('.fc[data-instance="' + bTarget.instanceId + '"]');
    batch03UpdateStats(aTargetFc, {pdvMax:30, pdv:30, atk:0});
    batch03UpdateStats(bTargetFc, {pdvMax:30, pdv:30, atk:0});
    await resolveCombat(apprenticeFc, aTargetFc);
    await resolveCombat(archerFc, bTargetFc);
    const apprenticeFeedback = collectionBatch05State.events.findIndex(event => event.type === "feedback-before-effect" && event.reason === "ice-damage-cdg" && event.source?.id === "EDG000001");
    const apprenticePost = collectionBatch05State.events.findIndex(event => event.type === "combat-post" && event.attacker?.id === "EDG000001" && event.results?.some(result => result.type === "ice-damage-cdg"));
    const archerFeedback = collectionBatch05State.events.findIndex(event => event.type === "feedback-before-effect" && event.reason === "maitre-archere-cdg");
    const archerPost = collectionBatch05State.events.findIndex(event => event.type === "combat-post" && event.attacker?.id === "EDG000004" && event.results?.some(result => result.type === "maitre-archere-cdg"));
    return {
      apprenticeFeedback,
      apprenticePost,
      archerFeedback,
      archerPost,
      apprenticeTarget:targetSummary(aTargetFc),
      archerTarget:targetSummary(bTargetFc)
    };
  });
  expect(iceTiming.apprenticeFeedback).toBeGreaterThanOrEqual(0);
  expect(iceTiming.apprenticePost).toBeGreaterThan(iceTiming.apprenticeFeedback);
  expect(iceTiming.archerFeedback).toBeGreaterThanOrEqual(0);
  expect(iceTiming.archerPost).toBeGreaterThan(iceTiming.archerFeedback);
  expect(iceTiming.apprenticeTarget.cdg).toBe(1);
  expect(iceTiming.archerTarget.cdg).toBe(2);

  await openScenario(page, "collection-batch-05-dryade-solo");
  const dryadeDelay = await page.evaluate(async () => {
    const zone = document.querySelector(playerZoneSelector(player1, "servants"));
    zone.innerHTML = Array.from({length:6}, () => '<div class="slot" data-player="' + player1.key + '"></div>').join("");
    const startedAt = performance.now();
    await summonBatch03Servant(player1, "EDB000014", {triggerInitiativeEffect:true, ready:true});
    const elapsed = performance.now() - startedAt;
    const board = livingServantCardsForPlayer(player1).map(targetSummary);
    const feedbackIndex = collectionBatch05State.events.findIndex(event => event.type === "feedback-before-effect" && event.reason === "initiative" && event.cardId === "EDB000014");
    const initiativeIndex = collectionBatch05State.events.findIndex(event => event.type === "initiative" && event.cardId === "EDB000014");
    return {elapsed, board, feedbackIndex, initiativeIndex};
  });
  expect(dryadeDelay.feedbackIndex).toBeGreaterThanOrEqual(0);
  expect(dryadeDelay.initiativeIndex).toBeGreaterThan(dryadeDelay.feedbackIndex);
  expect(dryadeDelay.board.map(card => card.id)).toEqual(["EDB000014", "EDB000009", "EDB000012", "EDB000012", "EDB000012", "EDB000012"]);
  expect(dryadeDelay.elapsed).toBeGreaterThanOrEqual(2400);

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
