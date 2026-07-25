import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-08-orcs.json", import.meta.url), "utf8"));
const signatures = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-effect-signatures.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch08=" + Date.now());
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

test("Batch-08 scenarios stay hidden and expose all Orc runtime cards", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  const signaturesById = byId(signatures.signatures);
  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    const audit = await page.evaluate((input) => ({
      scenarioId:selectedScenarioId(),
      publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + input.scenario + '"]').length,
      cards:input.ids.map(id => ({id, exists:!!CARDS_DATA[id], name:CARDS_DATA[id]?.name || "", type:CARDS_DATA[id]?.type || "", faction:CARDS_DATA[id]?.fac || "", keywords:[...(CARDS_DATA[id]?.kws || [])], text:CARDS_DATA[id]?.cap || ""})),
      dependencies:input.dependencies.map(id => ({id, exists:!!CARDS_DATA[id], name:CARDS_DATA[id]?.name || ""})),
      runtimeAudit:typeof auditCollectionBatch08Runtime === "function" ? auditCollectionBatch08Runtime() : null,
      player1HandSize:player1.hand.length,
      textChecks:{
        chaman:CARDS_DATA.ORC000001?.cap || "",
        amasseur:CARDS_DATA.ORC000003?.cap || "",
        berserker:CARDS_DATA.ORC000009?.cap || "",
        chef:CARDS_DATA.ORC000010?.cap || "",
        fireMaster:CARDS_DATA.ORC000017?.cap || "",
        totem:CARDS_DATA.ORC000014?.cap || "",
        pillageCap:CARDS_DATA.S000014?.cap || "",
        pillageDetail:CARDS_DATA.S000014?.detail || "",
        pillageFaction:CARDS_DATA.S000014?.fac || "",
        pillageTooltips:(CARDS_DATA.S000014?.extraTooltips || []).map(tip => tip.body || "").join(" "),
        savoirCap:CARDS_DATA.S000032?.cap || "",
        savoirFaction:CARDS_DATA.S000032?.fac || ""
      },
      renderedTextChecks:{
        amasseurHand:document.querySelector('.hc[data-id="ORC000003"] .hc-desc-text')?.innerHTML || "",
        amasseurPreview:buildCanonicalCardPreview("ORC000003")
      },
      imageProbe:Array.from(document.querySelectorAll('.fc img')).filter(img => (img.getAttribute('src') || '').includes('../assets/')).slice(0, 6).map(img => ({src:img.getAttribute('src') || '', width:img.naturalWidth}))
    }), {scenario, ids:fixture.orcIds, dependencies:fixture.dependencies});
    expect(audit.scenarioId).toBe(scenario);
    expect(audit.publicOptionCount, scenario + " public option").toBe(fixture.expectedHiddenScenarioOptionCount);
    expect(audit.cards.every(card => card.exists), JSON.stringify(audit.cards.filter(card => !card.exists))).toBe(true);
    expect(audit.dependencies.every(card => card.exists), JSON.stringify(audit.dependencies.filter(card => !card.exists))).toBe(true);
    expect(audit.runtimeAudit).toBeTruthy();
    expect(audit.player1HandSize, scenario + " visible hand size").toBeLessThanOrEqual(fixture.maxVisualHandSize);
    expect(audit.textChecks.chaman).toContain("*1*");
    expect(audit.textChecks.chaman).toContain("*2*");
    expect(audit.textChecks.amasseur).toContain("Approvisionnement");
    expect(audit.textChecks.amasseur).not.toContain("[Approvisionnement]");
    expect(audit.textChecks.amasseur).not.toContain("APPROVISIONNEMENT");
    if (scenario === "collection-batch-08-orcs") {
      expect(audit.renderedTextChecks.amasseurHand).toContain("Approvisionnement");
      expect(audit.renderedTextChecks.amasseurHand).toContain('class="kv"');
      expect(audit.renderedTextChecks.amasseurHand).not.toContain("APPROVISIONNEMENT");
    }
    expect(audit.renderedTextChecks.amasseurPreview).toContain("Approvisionnement");
    expect(audit.renderedTextChecks.amasseurPreview).toContain('class="kv"');
    expect(audit.textChecks.berserker).toContain("*25%*");
    expect(audit.textChecks.berserker).toContain("déjà affectée par [Embrasement]");
    expect(audit.textChecks.chef).toContain("*4*");
    expect(audit.textChecks.fireMaster).toContain("*1*");
    expect(audit.textChecks.totem).toContain("*+1 ATK*");
    expect(audit.textChecks.pillageFaction).toBe("sort");
    expect(audit.textChecks.savoirFaction).toBe("sort");
    expect(audit.textChecks.pillageCap).not.toMatch(/ORC000|S000014|ID =/);
    expect(audit.textChecks.pillageDetail).not.toMatch(/ORC000|S000014|ID =/);
    expect(audit.textChecks.pillageDetail).not.toContain("Chaman tribal");
    expect(audit.textChecks.pillageCap).toContain("*4*");
    expect(audit.textChecks.pillageTooltips).toContain("Chaman tribal");
    expect(audit.textChecks.savoirCap).toContain("*10*");
    for (const probe of audit.imageProbe) expect(probe.width, probe.src).toBeGreaterThan(0);
  }
  for (const id of fixture.orcIds) expect(signaturesById.get(id), id + " signature").toBeTruthy();
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Orc passives buff family servants, grant dynamic Rage, and lock avatar passives", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-08-orcs");
  const result = await page.evaluate(async () => {
    const goblin = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000001");
    const butcher = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "ORC000013");
    const totem = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "ORC000014");
    const slaver = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "ORC000012");
    syncBatch05Passives();
    const afterPassive = {goblin:targetSummary(goblin), butcher:targetSummary(butcher), goblinSources:goblin.dataset.batch05PassiveSources || "", goblinTotemRage:goblin.dataset.batch08TotemRage === "1", totem:targetSummary(totem), slaver:targetSummary(slaver)};
    batch03UpdateStats(goblin, {pdvMax:Number(goblin.dataset.pdvMax || 3), pdv:Number(goblin.dataset.pdvMax || 3)});
    updateRageState(goblin);
    const beforeWoundAtk = Number(goblin.dataset.atk || 0);
    await tryApplyAbilityDamage({sourcePlayer:player2, targetFC:goblin, sourceCardId:"H000001", amount:1, bypassInsensitive:true});
    const afterWound = {atk:Number(goblin.dataset.atk || 0), rageActive:goblin.dataset.rageActive === "1", pdv:Number(goblin.dataset.pdv || 0)};
    const deathTarget = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "ORC000012");
    const beforeButcherAtk = Number(butcher.dataset.atk || 0);
    await sendToCemetery(deathTarget);
    const afterButcher = {atk:Number(butcher.dataset.atk || 0), bonus:Number(butcher.dataset.batch08ButcherBonus || 0)};
    const previewHtml = buildCanonicalCardPreview("GOB000001", {sourceElement:goblin, player:player1.key});
    const tooltipsHtml = buildPreviewKeywordTooltips("GOB000001", {sourceElement:goblin, player:player1.key});
    return {afterPassive, beforeWoundAtk, afterWound, beforeButcherAtk, afterButcher, previewHtml, tooltipsHtml, events:auditCollectionBatch08Runtime().events};
  });
  expect(result.afterPassive.goblinSources).toContain("ORC000012");
  expect(result.afterPassive.goblinSources).toContain("ORC000014");
  expect(result.afterPassive.goblinTotemRage).toBe(true);
  expect(result.afterWound.rageActive).toBe(true);
  expect(result.afterWound.atk).toBe(result.beforeWoundAtk + 2);
  expect(result.previewHtml).toContain("Bénéficie temporairement");
  expect(result.tooltipsHtml).toContain("Rage");
  expect(result.afterButcher.atk).toBe(result.beforeButcherAtk + 1);
  expect(result.afterButcher.bonus).toBeGreaterThanOrEqual(1);
  expect(result.events.some(event => event.type === "boucher-ally-death")).toBe(true);

  await openScenario(page, "collection-batch-08-avatar-orc");
  const avatarResult = await page.evaluate(async () => {
    const costTotal = (player, cardId) => resolveCardCost({player, cardId})?.effectiveCost?.total ?? null;
    const avatarVisuals = () => ({
      player1Name:player1.name,
      player2Name:player2.name,
      player1CharacterId:player1.characterId,
      player2CharacterId:player2.characterId,
      player1Portrait:player1.portrait,
      player2Portrait:player2.portrait,
      player1Badge:!!document.querySelector('.av-j1 .batch08-avatar-lock-badge img[src*="ORC000016"]'),
      player2Badge:!!document.querySelector('.av-j2 .batch08-avatar-lock-badge img[src*="ORC000016"]'),
      player1TipDecoration:getComputedStyle(document.querySelector('.av-j1 .av-tip p')).textDecorationLine,
      player2TipDecoration:getComputedStyle(document.querySelector('.av-j2 .av-tip p')).textDecorationLine,
      badgeHasPreview:!!document.querySelector('.batch08-avatar-lock-badge .fc-zoom, .batch08-avatar-lock-badge .hc-tip'),
      p1Hand:[...player1.hand]
    });
    const avatarSources = {
      player1: AVATAR_COST_MODIFIERS[player1.characterId]?.sourceId || null,
      player2: AVATAR_COST_MODIFIERS[player2.characterId]?.sourceId || null,
      player1Portrait: player1.portrait,
      player2Portrait: player2.portrait
    };
    const before = {
      p1OrcCost:costTotal(player1, "ORC000001"),
      p2HumanCost:costTotal(player2, "H000001"),
      p1Disabled:!!player1.batch08AvatarPassivesDisabled,
      p2Disabled:!!player2.batch08AvatarPassivesDisabled,
      visuals:avatarVisuals()
    };
    await summonBatch03Servant(player1, "ORC000016", {triggerInitiativeEffect:true, ready:true});
    const afterLock = {
      p1OrcCost:costTotal(player1, "ORC000001"),
      p2HumanCost:costTotal(player2, "H000001"),
      p1Disabled:!!player1.batch08AvatarPassivesDisabled,
      p2Disabled:!!player2.batch08AvatarPassivesDisabled,
      visuals:avatarVisuals()
    };
    const maleficieur = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "ORC000016");
    await sendToCemetery(maleficieur);
    const afterUnlock = {
      p1OrcCost:costTotal(player1, "ORC000001"),
      p2HumanCost:costTotal(player2, "H000001"),
      p1Disabled:!!player1.batch08AvatarPassivesDisabled,
      p2Disabled:!!player2.batch08AvatarPassivesDisabled,
      visuals:avatarVisuals()
    };
    return {avatarSources, before, afterLock, afterUnlock, events:auditCollectionBatch08Runtime().events};
  });
  expect(avatarResult.before.visuals.player1Name).toBe("Gor le Changeforme");
  expect(avatarResult.before.visuals.player2Name).toBe("Rohen Tahir");
  expect(avatarResult.before.visuals.player1CharacterId).toBe("gor");
  expect(avatarResult.before.visuals.player2CharacterId).toBe("rohen");
  expect(avatarResult.before.visuals.player1Portrait).toBe("AVP000006.png");
  expect(avatarResult.before.visuals.player2Portrait).toBe("AVP000001.png");
  expect(avatarResult.before.visuals.p1Hand).toContain("ORC000016");
  expect(avatarResult.avatarSources.player1).toBe(null);
  expect(avatarResult.avatarSources.player2).toBe("AVP000001");
  expect(avatarResult.before.p1Disabled).toBe(false);
  expect(avatarResult.before.p2Disabled).toBe(false);
  expect(avatarResult.before.visuals.player1Badge).toBe(false);
  expect(avatarResult.before.visuals.player2Badge).toBe(false);
  expect(avatarResult.before.visuals.player1TipDecoration).not.toContain("line-through");
  expect(avatarResult.before.visuals.player2TipDecoration).not.toContain("line-through");
  expect(avatarResult.afterLock.p1Disabled).toBe(true);
  expect(avatarResult.afterLock.p2Disabled).toBe(true);
  expect(avatarResult.afterLock.p1OrcCost).toBe(avatarResult.before.p1OrcCost);
  expect(avatarResult.afterLock.p2HumanCost).toBe(avatarResult.before.p2HumanCost + 1);
  expect(avatarResult.afterLock.visuals.player1Badge).toBe(true);
  expect(avatarResult.afterLock.visuals.player2Badge).toBe(true);
  expect(avatarResult.afterLock.visuals.player1TipDecoration).toContain("line-through");
  expect(avatarResult.afterLock.visuals.player2TipDecoration).toContain("line-through");
  expect(avatarResult.afterLock.visuals.badgeHasPreview).toBe(false);
  expect(avatarResult.afterUnlock.p1Disabled).toBe(false);
  expect(avatarResult.afterUnlock.p2Disabled).toBe(false);
  expect(avatarResult.afterUnlock.p1OrcCost).toBe(avatarResult.before.p1OrcCost);
  expect(avatarResult.afterUnlock.p2HumanCost).toBe(avatarResult.before.p2HumanCost);
  expect(avatarResult.afterUnlock.visuals.player1Badge).toBe(false);
  expect(avatarResult.afterUnlock.visuals.player2Badge).toBe(false);
  expect(avatarResult.afterUnlock.visuals.player1TipDecoration).not.toContain("line-through");
  expect(avatarResult.afterUnlock.visuals.player2TipDecoration).not.toContain("line-through");
  expect(avatarResult.events.some(event => event.type === "initiative" && JSON.stringify(event).includes("avatar-passives-disabled"))).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Orc Initiative effects heal, burn, draw, damage, destroy, create, and scramble", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-08-orcs");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    const board = player => livingServantCardsForPlayer(player).map(targetSummary);

    resetServants(player1); resetServants(player2);
    const woundedSummon = await summonBatch03Servant(player1, "GOB000001", {triggerInitiativeEffect:false, ready:true});
    const wounded = document.querySelector('.fc[data-instance="' + woundedSummon.instanceId + '"]');
    batch03UpdateStats(wounded, {pdvMax:5, pdv:2});
    window.__batch08ChamanOption = "heal";
    await summonBatch03Servant(player1, "ORC000001", {triggerInitiativeEffect:true, ready:true});
    const healResult = targetSummary(wounded);

    resetServants(player1); resetServants(player2);
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    for (const enemy of livingServantCardsForPlayer(player2)) batch03UpdateStats(enemy, {pdvMax:10, pdv:10});
    window.__batch08ChamanOption = "burn";
    await summonBatch03Servant(player1, "ORC000001", {triggerInitiativeEffect:true, ready:true});
    const burnTargets = board(player2).filter(card => card.id === "H000001" || card.id === "H000005");

    player1.drawPile = ["R000010", "H000001"];
    const handBeforeSupply = player1.hand.length;
    await summonBatch03Servant(player1, "ORC000003", {triggerInitiativeEffect:true, ready:true});
    const supplyDraw = {handBefore:handBeforeSupply, handAfter:player1.hand.length, hand:[...player1.hand], deck:[...player1.drawPile].map(getRuntimeCardId)};

    resetServants(player1); resetServants(player2);
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    batch03UpdateStats(livingServantCardsForPlayer(player2)[0], {pdvMax:10, pdv:10});
    await summonBatch03Servant(player1, "ORC000004", {triggerInitiativeEffect:true, ready:true});
    const poisonAfterInit = board(player2)[0];
    await resolveBatch08EndTurnEffects(player1);
    const poisonAfterEnd = board(player2)[0];

    resetServants(player1); resetServants(player2);
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "ORC000007", {triggerInitiativeEffect:true, ready:true});
    const chaosAfterInit = board(player2);
    await resolveBatch08EndTurnEffects(player1);
    const chaosAfterEnd = board(player2);

    resetServants(player1); resetServants(player2);
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    batch03UpdateStats(livingServantCardsForPlayer(player2)[0], {pdvMax:10, pdv:10});
    const berserkerBurn = await summonBatch03Servant(player1, "ORC000009", {triggerInitiativeEffect:true, ready:true});
    const berserkerBurnCard = document.querySelector('.fc[data-instance="' + berserkerBurn.instanceId + '"]');
    const berserkerBurnTarget = livingServantCardsForPlayer(player2)[0];
    const berserkerBurnAfter = {
      source:targetSummary(berserkerBurnCard),
      target:targetSummary(berserkerBurnTarget),
      targetBurning:!!berserkerBurnTarget?.dataset.burning,
      sourceBurning:!!berserkerBurnCard?.dataset.burning,
      feedback:auditCollectionBatch08Runtime().events.filter(event => event.type === "ability-feedback" && event.reason === "berserker-embrasement")
    };

    resetServants(player1); resetServants(player2);
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    batch03UpdateStats(livingServantCardsForPlayer(player2)[0], {pdvMax:3, pdv:3});
    const berserker = await summonBatch03Servant(player1, "ORC000009", {triggerInitiativeEffect:true, ready:true});
    const berserkerCard = document.querySelector('.fc[data-instance="' + berserker.instanceId + '"]');
    const berserkerAfter = {...targetSummary(berserkerCard), burning:!!berserkerCard?.dataset.burning};

    const handBeforeGoblins = [...player1.hand];
    await summonBatch03Servant(player1, "ORC000011", {triggerInitiativeEffect:true, ready:true});
    const goblinCreated = player1.hand.slice(handBeforeGoblins.length);

    resetServants(player1); resetServants(player2);
    await summonBatch03Servant(player1, "ORC000018", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "ORC000002", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    for (const enemy of livingServantCardsForPlayer(player2)) batch03UpdateStats(enemy, {pdvMax:20, pdv:20});
    const meleeBefore = {p1:board(player1), p2:board(player2)};
    const meleeRandom = [0, 0.99];
    window.__mythesRandom = () => meleeRandom.length ? meleeRandom.shift() : 0;
    const melee = await resolveBatch08Initiative("ORC000018", player1);
    const meleeAfter = {p1:board(player1), p2:board(player2)};

    return {healResult, burnTargets, supplyDraw, poisonAfterInit, poisonAfterEnd, chaosAfterInit, chaosAfterEnd, berserkerBurnAfter, berserkerAfter, goblinCreated, meleeBefore, melee, meleeAfter, events:auditCollectionBatch08Runtime().events};
  });
  expect(result.healResult.pdv).toBe(result.healResult.pdvMax);
  expect(result.burnTargets.filter(card => card.id && card.pdv > 0)).toHaveLength(2);
  expect(result.supplyDraw.handAfter).toBe(result.supplyDraw.handBefore + 1);
  expect(result.supplyDraw.hand).toContain("R000010");
  expect(result.poisonAfterInit.pdv).toBeLessThan(result.poisonAfterInit.pdvMax);
  expect(result.poisonAfterEnd.pdv).toBe(result.poisonAfterInit.pdv - 1);
  expect(result.chaosAfterInit.length).toBe(1);
  expect(result.chaosAfterEnd.length).toBe(0);
  expect(result.berserkerBurnAfter.target.pdv).toBeLessThan(result.berserkerBurnAfter.target.pdvMax);
  expect(result.berserkerBurnAfter.targetBurning).toBe(true);
  expect(result.berserkerBurnAfter.sourceBurning).toBe(false);
  expect(result.berserkerBurnAfter.feedback.length).toBeGreaterThanOrEqual(1);
  expect(result.berserkerAfter.pdv).toBeLessThan(result.berserkerAfter.pdvMax);
  expect(result.berserkerAfter.burning).toBe(false);
  expect(result.goblinCreated).toHaveLength(3);
  expect(new Set(result.goblinCreated).size).toBe(3);
  expect(result.goblinCreated.every(id => id.startsWith("GOB"))).toBe(true);
  expect(result.melee.operations[0].pairs.length).toBeGreaterThanOrEqual(1);
  expect(result.melee.operations[0].ownShuffle.after.map(card => card.id)).not.toEqual(result.melee.operations[0].ownShuffle.before.map(card => card.id));
  expect(result.melee.operations[0].enemyShuffle.after.map(card => card.id)).toEqual(result.melee.operations[0].enemyShuffle.before.map(card => card.id));
  expect(result.melee.operations[0].pairs.map(pair => [pair.attacker.id, pair.defender.id])).toEqual([["ORC000002", "H000001"], ["ORC000018", "H000005"]]);
  expect(result.meleeAfter.p2.some((card, index) => card.pdv < result.meleeBefore.p2[index]?.pdv)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Orc combat effects resolve adjacency, kill draws, copy, boar charge, fire, Gultark and Gor", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-08-avatar-orc");
  const result = await page.evaluate(async (expected) => {
    window.__mythesRandom = () => 0;
    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    const board = player => livingServantCardsForPlayer(player).map(targetSummary);

    resetServants(player1); resetServants(player2);
    await summonBatch03Servant(player1, "ORC000008", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000006", {triggerInitiativeEffect:false, ready:true});
    for (const enemy of livingServantCardsForPlayer(player2)) batch03UpdateStats(enemy, {pdvMax:12, pdv:12});
    currentPlayer = player1.key;
    const beforeLance = board(player2);
    await resolveCombat(livingServantCardsForPlayer(player1)[0], livingServantCardsForPlayer(player2)[1]);
    const afterLance = board(player2);

    resetServants(player1); resetServants(player2);
    player1.hand = [];
    refreshHand(player1);
    player1.drawPile = ["H000001", "ORC000002"];
    await summonBatch03Servant(player1, "ORC000010", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    batch03UpdateStats(livingServantCardsForPlayer(player2)[0], {pdvMax:2, pdv:2});
    await resolveCombat(livingServantCardsForPlayer(player1)[0], livingServantCardsForPlayer(player2)[0]);
    const chiefEvents = auditCollectionBatch08Runtime().events;
    const chief = {
      hand:[...player1.hand],
      deck:[...player1.drawPile].map(getRuntimeCardId),
      board:board(player1),
      feedbackIndex:chiefEvents.findIndex(event => event.type === "ability-feedback" && event.reason === "clan-chief-kill-draw"),
      combatIndex:chiefEvents.findIndex(event => event.type === "combat-damage-dealt" && JSON.stringify(event).includes("clan-chief-kill-draw"))
    };

    resetServants(player1); resetServants(player2);
    await summonBatch03Servant(player1, "ORC000019", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    batch03UpdateStats(livingServantCardsForPlayer(player2)[0], {pdvMax:2, pdv:2});
    await resolveCombat(livingServantCardsForPlayer(player1)[0], livingServantCardsForPlayer(player2)[0]);
    renderAllHands();
    const maraborcIndex = player1.hand.lastIndexOf("H000005");
    const maraborcOccurrence = batch03HandOccurrenceAt(player1, maraborcIndex);
    const maraborcHandCard = document.querySelector('.hc[data-id="H000005"]');
    const maraborcHandPreview = buildCanonicalCardPreview("H000005", {sourceElement:maraborcHandCard, player:player1.key});
    const maraborcHandBeforePlay = [...player1.hand];
    const maraborcEffectiveCostBeforePlay = effectiveCost("H000005", player1, {handOccurrenceId:maraborcOccurrence});
    const maraborcPrintedCostBeforePlay = resolveCardCost({player:player1, cardId:"H000005", context:{handOccurrenceId:maraborcOccurrence}})?.printedCost?.total ?? null;
    const maraborcSlot = document.querySelector(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    const maraborcPlay = await playCard("H000005", maraborcSlot, {handOccurrenceId:maraborcOccurrence});
    const maraborcBoardCard = livingServantCardsForPlayer(player1).find(fc => fc.dataset.batch08MaraborcOccurrence === maraborcOccurrence);
    const maraborcBoardPreview = buildCanonicalCardPreview("H000005", {sourceElement:maraborcBoardCard, player:player1.key});
    await sendToCemetery(maraborcBoardCard);
    const maraborcGraveyardEntry = player1.graveyard[player1.graveyard.length - 1];
    const maraborcSourcePreview = buildCanonicalCardPreview("H000005", {player:player1.key});
    const maraborc = {
      hand:[...player1.hand],
      handBeforePlay:maraborcHandBeforePlay,
      occurrence:maraborcOccurrence,
      effectiveCost:maraborcEffectiveCostBeforePlay,
      printedCost:maraborcPrintedCostBeforePlay,
      renderedAsOrc:maraborcHandCard?.classList.contains("orc") || false,
      handPreviewIsOrc:maraborcHandPreview.includes("orc-fc"),
      imageSrc:maraborcHandCard?.querySelector(".hc-art")?.getAttribute("src") || "",
      imageWidth:maraborcHandCard?.querySelector(".hc-art")?.naturalWidth || 0,
      meta:(player1.batch08MaraborcCopies || []).find(entry => entry.occurrenceId === maraborcOccurrence) || null,
      playSuccess:maraborcPlay?.success === true,
      board:maraborcBoardCard ? {...targetSummary(maraborcBoardCard), fac:maraborcBoardCard.dataset.fac, classes:[...maraborcBoardCard.classList], occurrence:maraborcBoardCard.dataset.batch08MaraborcOccurrence || ""} : null,
      boardPreviewIsOrc:maraborcBoardPreview.includes("orc-fc"),
      graveyardEntry:maraborcGraveyardEntry,
      graveyardTopId:getRuntimeCardId(maraborcGraveyardEntry),
      graveyardIsOrc:!!maraborcGraveyardEntry?.batch08MaraborcCopy,
      graveyardOccurrence:maraborcGraveyardEntry?.occurrenceId || null,
      sourceFactionAfter:CARDS_DATA.H000005?.fac || "",
      sourcePreviewIsOrc:maraborcSourcePreview.includes("orc-fc"),
      events:auditCollectionBatch08Runtime().events.filter(event => JSON.stringify(event).includes('maraborc-copy'))
    };

    resetServants(player1); resetServants(player2);
    await summonBatch03Servant(player1, "ORC000015", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    batch03UpdateStats(livingServantCardsForPlayer(player2)[0], {pdvMax:2, pdv:2});
    const boar = livingServantCardsForPlayer(player1)[0];
    await resolveCombat(boar, livingServantCardsForPlayer(player2)[0]);
    const boarAfter = {exhausted:!!boar.dataset.exhausted, extra:boar.dataset.batch08BoarExtraAttack === "1", board:board(player1)};

    resetServants(player1); resetServants(player2);
    await summonBatch03Servant(player1, "ORC000017", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "EDB000001", {triggerInitiativeEffect:false, ready:true});
    const elf = livingServantCardsForPlayer(player2)[0];
    batch03UpdateStats(elf, {pdvMax:10, pdv:10});
    await applyEmbrasement(elf, {sourcePlayer:player1, sourceCardId:"ORC000017"});
    const beforeBurnTick = Number(elf.dataset.pdv || 0);
    await applyStartOfTurnBurning(player2);
    const fire = {before:beforeBurnTick, after:Number(elf.dataset.pdv || 0)};
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    const fireTarget = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000001");
    batch03UpdateStats(fireTarget, {pdvMax:10, pdv:10});
    await applyFireMasterEndOfTurn(player1);
    const fireRetarget = livingServantCardsForPlayer(player2).map(card => ({id:card.dataset.id, burning:!!card.dataset.burning}));

    resetServants(player1); resetServants(player2);
    await summonBatch03Servant(player1, "ORC000020", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "B000004", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    for (const enemy of livingServantCardsForPlayer(player2)) batch03UpdateStats(enemy, {pdvMax:3, pdv:3});
    const beforeGultark = {p2:board(player2), p2Graveyard:[...player2.graveyard].map(getRuntimeCardId)};
    player2.firstTurnStarted = true;
    player2.turnState = null;
    await startTurn(player2);
    const gultarkCard = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "ORC000020");
    await sendToCemetery(gultarkCard);
    const gultarkHandIndex = player1.hand.lastIndexOf("ORC000020");
    const afterGultark = {
      p2:board(player2),
      p2Graveyard:[...player2.graveyard].map(getRuntimeCardId),
      returnedToHand:gultarkHandIndex >= 0,
      blocked:!!batch03BlockedHandEntry("ORC000020", player1, gultarkHandIndex),
      events:auditCollectionBatch08Runtime().events,
      startTrace:typeof getLastStartTurnTrace === "function" ? getLastStartTurnTrace() : null
    };

    resetServants(player1); resetServants(player2);
    const gor = await summonBatch03Servant(player1, "AVS000006", {triggerInitiativeEffect:false, ready:true});
    const gorCard = document.querySelector('.fc[data-instance="' + gor.instanceId + '"]');
    await applyDamage(gorCard, 99);
    await new Promise(resolve => setTimeout(resolve, 900));
    const gorAfter = {board:board(player1), graveyard:[...player1.graveyard].map(getRuntimeCardId)};

    return {beforeLance, afterLance, chief, maraborc, boarAfter, fire, fireRetarget, beforeGultark, afterGultark, gorAfter};
  }, fixture);
  const lanceLosses = result.afterLance.map((card, index) => result.beforeLance[index].pdv - card.pdv);
  expect(lanceLosses.filter(loss => loss > 0).length).toBeGreaterThanOrEqual(2);
  expect(result.chief.board.map(card => card.id)).toContain("ORC000002");
  expect(result.chief.hand).not.toContain("ORC000002");
  expect(result.chief.feedbackIndex).toBeGreaterThanOrEqual(0);
  expect(result.chief.combatIndex).toBeGreaterThan(result.chief.feedbackIndex);
  expect(result.maraborc.handBeforePlay).toContain("H000005");
  expect(result.maraborc.hand).not.toContain("H000005");
  expect(result.maraborc.renderedAsOrc).toBe(true);
  expect(result.maraborc.handPreviewIsOrc).toBe(true);
  expect(result.maraborc.imageSrc).toContain("../assets/humains/H000005.png");
  expect(result.maraborc.imageWidth).toBeGreaterThan(0);
  expect(result.maraborc.meta?.treatedAsOrc).toBe(true);
  expect(result.maraborc.effectiveCost).toBeLessThan(result.maraborc.printedCost);
  expect(result.maraborc.playSuccess).toBe(true);
  expect(result.maraborc.board?.id).toBe("H000005");
  expect(result.maraborc.board?.fac).toBe("orc");
  expect(result.maraborc.board?.classes).toContain("orc-fc");
  expect(result.maraborc.board?.occurrence).toBe(result.maraborc.occurrence);
  expect(result.maraborc.boardPreviewIsOrc).toBe(true);
  expect(result.maraborc.graveyardTopId).toBe("H000005");
  expect(result.maraborc.graveyardIsOrc).toBe(true);
  expect(result.maraborc.graveyardOccurrence).toBe(result.maraborc.occurrence);
  expect(result.maraborc.sourceFactionAfter).toBe("hum");
  expect(result.maraborc.sourcePreviewIsOrc).toBe(false);
  expect(result.maraborc.events.length).toBeGreaterThanOrEqual(1);
  expect(result.boarAfter.exhausted).toBe(false);
  expect(result.boarAfter.extra).toBe(true);
  expect(result.fire.before - result.fire.after).toBe(2);
  expect(result.fireRetarget.filter(card => card.burning)).toHaveLength(2);
  expect(result.afterGultark.p2).toHaveLength(0);
  expect(result.afterGultark.p2Graveyard).toEqual(expect.arrayContaining(["B000004", "H000001"]));
  expect(result.afterGultark.startTrace?.abilitiesResolved).toBe(true);
  expect(result.afterGultark.returnedToHand).toBe(true);
  expect(result.afterGultark.blocked).toBe(true);
  expect(result.afterGultark.events.some(event => event.type === "start-turn" && JSON.stringify(event).includes("gultark-opponent-start"))).toBe(true);
  expect(result.gorAfter.board.map(card => card.id)).toContain(fixture.expectedAvatarReplacement);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Orc spells summon canonical pool and overflow damage to the right", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-08-sorts-orcs");
  const result = await page.evaluate(async (expected) => {
    window.__mythesRandom = () => 0;
    currentPlayer = player1.key;
    const beforePillage = {hand:[...player1.hand], board:livingServantCardsForPlayer(player1).map(targetSummary), graveyard:[...player1.graveyard].map(getRuntimeCardId)};
    const pillage = await playCard("S000014");
    await new Promise(resolve => setTimeout(resolve, 500));
    const afterPillage = {hand:[...player1.hand], board:livingServantCardsForPlayer(player1).map(targetSummary), graveyard:[...player1.graveyard].map(getRuntimeCardId), events:auditCollectionBatch08Runtime().events};

    const resetServants = (player) => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player.key + '"></div>').join("");
    };
    resetServants(player2);
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000006", {triggerInitiativeEffect:false, ready:true});
    batch03UpdateStats(livingServantCardsForPlayer(player2)[0], {pdvMax:3, pdv:3});
    batch03UpdateStats(livingServantCardsForPlayer(player2)[1], {pdvMax:4, pdv:4});
    batch03UpdateStats(livingServantCardsForPlayer(player2)[2], {pdvMax:3, pdv:3});
    player1.hand = ["S000032"];
    refreshHand(player1);
    const target = livingServantCardsForPlayer(player2)[0];
    const beforeSavoir = livingServantCardsForPlayer(player2).map(targetSummary);
    const savoir = await playCard("S000032", null, {selectedTargetIds:[target.dataset.instance]});
    await new Promise(resolve => setTimeout(resolve, 500));
    const afterSavoir = {board:livingServantCardsForPlayer(player2).map(targetSummary), graveyard:[...player2.graveyard].map(getRuntimeCardId), playerGraveyard:[...player1.graveyard].map(getRuntimeCardId), events:auditCollectionBatch08Runtime().events};

    resetServants(player2);
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000006", {triggerInitiativeEffect:false, ready:true});
    const middle = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000005");
    batch03RemoveBoardCardToSlot(middle);
    batch03UpdateStats(livingServantCardsForPlayer(player2)[0], {pdvMax:3, pdv:3});
    batch03UpdateStats(livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000006"), {pdvMax:3, pdv:3});
    player1.hand = ["S000032"];
    refreshHand(player1);
    const holeTarget = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000001");
    const beforeHole = livingServantCardsForPlayer(player2).map(targetSummary);
    const savoirHole = await playCard("S000032", null, {selectedTargetIds:[holeTarget.dataset.instance]});
    await new Promise(resolve => setTimeout(resolve, 500));
    const afterHole = {board:livingServantCardsForPlayer(player2).map(targetSummary), graveyard:[...player2.graveyard].map(getRuntimeCardId), hits:savoirHole.spellResolution?.hits || []};

    const renderedTexts = {
      pillagePreview:buildCanonicalCardPreview("S000014"),
      pillageTooltips:buildPreviewKeywordTooltips("S000014"),
      savoirPreview:buildCanonicalCardPreview("S000032"),
      fireMasterPreview:buildCanonicalCardPreview("ORC000017")
    };

    return {beforePillage, pillage, afterPillage, beforeSavoir, savoir, afterSavoir, beforeHole, savoirHole, afterHole, renderedTexts};
  }, fixture);
  expect(result.pillage.success).toBe(true);
  expect(result.afterPillage.board).toHaveLength(4);
  expect(result.afterPillage.board.every(card => fixture.expectedPillagePool.includes(card.id))).toBe(true);
  expect(result.afterPillage.hand).not.toContain("S000014");
  expect(result.afterPillage.graveyard).toContain("S000014");
  expect(result.savoir.success).toBe(true);
  expect(result.savoir.spellResolution.hits.map(hit => hit.target.id)).toEqual(fixture.expectedSavoirTribalHits);
  expect(result.afterSavoir.graveyard).toEqual(expect.arrayContaining(fixture.expectedSavoirTribalHits));
  expect(result.afterSavoir.playerGraveyard).toContain("S000032");
  expect(result.afterSavoir.events.some(event => event.type === "savoir-tribal")).toBe(true);
  expect(result.afterHole.hits.map(hit => hit.target.id)).toEqual(["H000001"]);
  expect(result.afterHole.graveyard).toContain("H000001");
  expect(result.afterHole.board.map(card => card.id)).toContain("H000006");
  expect(result.afterHole.board.find(card => card.id === "H000006")?.pdv).toBe(3);
  expect(result.renderedTexts.pillagePreview).toContain("sort-fc");
  expect(result.renderedTexts.pillagePreview).not.toContain("orc-fc");
  expect(result.renderedTexts.pillagePreview).not.toContain("Chaman tribal");
  expect(result.renderedTexts.pillagePreview).toMatch(/<strong[^>]*>4<\/strong>/);
  expect(result.renderedTexts.pillageTooltips).toContain("Chaman tribal");
  expect(result.renderedTexts.pillageTooltips).not.toMatch(/ORC000|ID =/);
  expect(result.renderedTexts.savoirPreview).toMatch(/<strong[^>]*>10<\/strong>/);
  expect(result.renderedTexts.fireMasterPreview).toMatch(/<strong[^>]*>1<\/strong>/);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
