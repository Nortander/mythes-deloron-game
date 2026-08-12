import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-11e-repasse-visuelle-globale-mv.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch11e=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect(page.getByTestId("test-resource-panel")).toContainText("COLLECTION BATCH 11E");
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(150);
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message =>
    !/Failed to load resource: the server responded with a status of 404/i.test(message)
    && !/Failed to load resource: net::ERR_(NETWORK_CHANGED|NAME_NOT_RESOLVED)/i.test(message)
  );
}

function cardIds(entries) {
  return entries.map(entry => entry.cardId || entry.id || entry).filter(Boolean);
}

function playersOf(audit) {
  return audit.players || audit.batch11c?.players || audit.batch11b?.players || audit.batch11a?.players || [];
}

test("Batch-11F scenarios stay hidden and public undead texts are clean", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  const visibleByCard = new Map(fixture.cards.map(id => [id, 0]));
  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    const audit = await page.evaluate((cardIds) => ({
      scenarioId:selectedScenarioId(),
      publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length,
      title:document.querySelector('[data-testid="test-resource-panel"]')?.innerText || '',
      cards:cardIds.map(id => {
        const data = CARDS_DATA[id] || {};
        return {
          id,
          exists:!!CARDS_DATA[id],
          visibleCount:document.querySelectorAll('.hc[data-id="' + id + '"], .fc[data-id="' + id + '"]').length,
          text:formatPlayerFacingCardText(String(data.cap || '') + ' ' + String(data.detail || '') + ' ' + String(data.cond || '')),
          keywords:[...(data.kws || [])],
          extraTooltips:[...(data.extraTooltips || [])].map(tip => tip.title || '')
        };
      }),
      avatarSouls:player1?.resourceState?.souls ?? null,
      avatarPortrait:player1?.portrait || null
    }), fixture.cards);
    expect(audit.publicOptionCount, scenario + " hidden selector option").toBe(0);
    expect(audit.title).toContain("COLLECTION BATCH 11E");
    for (const card of audit.cards) {
      expect(card.exists, card.id + " runtime data").toBe(true);
      expect(card.text, card.id + " no public technical ids").not.toMatch(/RAME(?:0|5|10|15|20|21|\*)|\[ID\s*=|AVS000008|MV000019/i);
      visibleByCard.set(card.id, (visibleByCard.get(card.id) || 0) + card.visibleCount);
    }
    const mv3 = audit.cards.find(card => card.id === "MV000003");
    expect(mv3.keywords, "MV000003 has no Initiative").not.toContain("Initiative");
    const wall = audit.cards.find(card => card.id === "MV000030");
    expect(wall.keywords).toEqual(expect.arrayContaining(["Insensible", "Rempart"]));
    expect(audit.avatarPortrait).toBe("AVP000008.png");
    const harvestTitle = fixture.expected.echoHarvestTitle;
    for (const id of fixture.echoHarvestTooltipCards) {
      expect(audit.cards.find(card => card.id === id)?.extraTooltips).toContain(harvestTitle);
    }
    expect(audit.cards.find(card => card.id === "MV000008")?.extraTooltips || []).not.toContain(harvestTitle);
  }
  for (const [cardId, visibleCount] of visibleByCard) {
    expect(visibleCount, cardId + " visible in at least one Batch 11 scenario").toBeGreaterThan(0);
  }
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch-11F public titles and game messages keep uppercase presentation without uppercasing bodies", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11e-parity");
  const result = await page.evaluate(() => {
    const tooltipCard = document.querySelector('.hc[data-id="S000041"]') || document.querySelector('.hc');
    if (tooltipCard) openCardPreview(tooltipCard.dataset.id, {sourceElement:tooltipCard, sourceType:'hand', playerId:tooltipCard.dataset.player});
    showNotif('message de résolution accentué', 900);
    showErr('message de refus accentué', {durationMs:900});
    const keywordTitle = document.querySelector('.canonical-keyword-tooltip > strong');
    const descBody = document.querySelector('.canonical-keyword-tooltip span');
    return {
      handName:getComputedStyle(document.querySelector('.hc-name')).textTransform,
      previewName:getComputedStyle(document.querySelector('.fz-name')).textTransform,
      keywordTitle:keywordTitle ? getComputedStyle(keywordTitle).textTransform : null,
      keywordBody:descBody ? getComputedStyle(descBody).textTransform : null,
      notif:getComputedStyle(document.querySelector('#notif')).textTransform,
      error:getComputedStyle(document.querySelector('#errMsg')).textTransform
    };
  });
  expect(result.handName).toBe('uppercase');
  expect(result.previewName).toBe('uppercase');
  expect(result.keywordTitle).toBe('uppercase');
  expect(result.keywordBody).not.toBe('uppercase');
  expect(result.notif).toBe('uppercase');
  expect(result.error).toBe('uppercase');
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Hokhan avatar, pseudo-avatar and Commandant squelette Echo rules stay deterministic", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11e-hokhan-gueule-mur");
  const result = await page.evaluate(async () => {
    const initialAvatarEchoes = player1.resourceState.souls;
    const gueule = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000003"]');
    const gueuleBefore = targetSummary(gueule);
    const prevent = await applyDamage(gueule, 99);
    const afterGueule = auditCollectionBatch11eRuntime();
    const wall = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000030"]');
    const wallBeforeEchoes = player1.resourceState.souls;
    const wallDamage = await applyDamage(wall, 5);
    const afterWall = auditCollectionBatch11eRuntime();
    const wallAttackBefore = document.querySelector('#errMsg')?.innerText || '';
    tryAttack(wall);
    const wallAttackError = document.querySelector('#errMsg')?.innerText || wallAttackBefore;

    const commandant = await summonBatch03Servant(player1, "MV000022", {triggerInitiativeEffect:false, ready:true});
    const commandantFC = document.querySelector('.fc[data-instance="' + commandant.instanceId + '"]');
    const commandantVictim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000001"]');
    const beforeCommandant = auditCollectionBatch11eRuntime();
    if (commandantVictim) {
      commandantVictim._killer = commandantFC;
      await sendToCemetery(commandantVictim, {killer:commandantFC});
    }
    const afterCommandant = auditCollectionBatch11eRuntime();

    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    const play = await playCard("AVS000008", slot, {returnValidation:true});
    const afterPlay = auditCollectionBatch11eRuntime();
    const hokhan = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="AVS000008"]');
    const echoesBeforeVengeance = player1.resourceState.souls;
    await sendToCemetery(hokhan);
    const afterVengeance = auditCollectionBatch11eRuntime();
    return {initialAvatarEchoes, gueuleBefore, prevent, afterGueule, wallBeforeEchoes, wallDamage, afterWall, wallAttackError, beforeCommandant, afterCommandant, play, afterPlay, echoesBeforeVengeance, afterVengeance};
  });
  expect(result.initialAvatarEchoes).toBeGreaterThanOrEqual(fixture.expected.hokhanInitialEchoes);
  const afterGueuleP1 = playersOf(result.afterGueule).find(player => player.playerId === "player1");
  expect(afterGueuleP1.servants.map(card => card.id)).toContain("MV000003");
  expect(afterGueuleP1.graveyard.map(entry => entry.cardId)).not.toContain("MV000003");
  expect(afterGueuleP1.capturedVictims).toEqual(expect.arrayContaining([expect.objectContaining({cardId:fixture.expected.gueuleVictim, capturedBy:"MV000003"})]));
  expect(["H000001", "H000005", "H000006"]).toContain(fixture.expected.gueuleVictim);
  const afterWallP1 = playersOf(result.afterWall).find(player => player.playerId === "player1");
  expect(afterWallP1.souls).toBe(result.wallBeforeEchoes + fixture.expected.murDamageFiveEchoGain);
  expect(result.wallAttackError).toContain("MUR NON-MORT");
  const beforeCommandantP1 = playersOf(result.beforeCommandant).find(player => player.playerId === "player1");
  const afterCommandantP1 = playersOf(result.afterCommandant).find(player => player.playerId === "player1");
  expect(afterCommandantP1.servants.filter(card => card.id === fixture.expected.commandantSummon).length).toBeGreaterThan(beforeCommandantP1.servants.filter(card => card.id === fixture.expected.commandantSummon).length);
  expect(result.afterCommandant.batch11c?.events || result.afterCommandant.events || []).toEqual(expect.arrayContaining([expect.objectContaining({type:"commandant-kill-summon"})]));
  expect(result.play.success).toBe(true);
  expect(result.play.spellResolution || result.play.initiative || result.play).toBeTruthy();
  const afterPlayP1 = playersOf(result.afterPlay).find(player => player.playerId === "player1");
  expect(afterPlayP1.hand).toContain("MV000019");
  const afterVengeanceP1 = playersOf(result.afterVengeance).find(player => player.playerId === "player1");
  expect(afterVengeanceP1.souls).toBe(result.echoesBeforeVengeance + fixture.expected.hokhanPseudoVengeanceEchoGain);
  expect(cardIds(afterVengeanceP1.graveyard)).not.toContain("AVS000008");
  expect(cardIds(afterVengeanceP1.deck)).toContain("AVS000008");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Araignée réanimée and Âme explosive move victims without loss or duplicate captures", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11e-arachnee-ame");
  const result = await page.evaluate(async () => {
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    const victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000001"]');
    const playAraignee = await playCard("MV000008", slot, {returnValidation:true, selectedTargetIds:[victim.dataset.instance]});
    const afterCapture = auditCollectionBatch11eRuntime();
    const enemyZone = qs(playerZoneSelector(player2, "servants"));
    Array.from(enemyZone.querySelectorAll('.slot')).forEach(emptySlot => { emptySlot.outerHTML = buildFC('H000006', player2.key); });
    enemyZone.querySelectorAll('.fc[data-id="H000006"]').forEach(fc => { delete fc.dataset.new; });
    const araignee = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000008"]');
    await sendToCemetery(araignee);
    const afterRelease = auditCollectionBatch11eRuntime();
    const ame = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000028"]');
    const ameVictim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000006"]');
    if (ameVictim) batch03UpdateStats(ameVictim, {pdv:1, pdvMax:Number(ameVictim.dataset.pdvMax || 2) || 2});
    const beforeAme = auditCollectionBatch11eRuntime();
    await sendToCemetery(ame);
    const afterAme = auditCollectionBatch11eRuntime();
    return {playAraignee, afterCapture, afterRelease, beforeAme, afterAme, events:auditCollectionBatch11eRuntime().events};
  });
  expect(result.playAraignee.success).toBe(true);
  const captureEvent = result.events.find(event => event.type === "araignee-capture");
  const releaseEvent = result.events.find(event => event.type === "araignee-vengeance-release");
  expect(captureEvent).toBeTruthy();
  expect(releaseEvent).toBeTruthy();
  const araigneeVictim = captureEvent.detail.captured.cardId;
  const capturedP2 = playersOf(result.afterCapture).find(player => player.playerId === "player2");
  expect(capturedP2.servants.map(card => card.id)).not.toContain(araigneeVictim);
  const releasedP2 = playersOf(result.afterRelease).find(player => player.playerId === "player2");
  const releaseEventDetail = releaseEvent.detail || {};
  expect(releaseEventDetail.finalDestination).toBe(fixture.expected.araigneeNoSlotDestination);
  expect(releasedP2.servants.map(card => card.id)).not.toContain(araigneeVictim);
  const releaseP1 = playersOf(result.afterRelease).find(player => player.playerId === "player1");
  expect(cardIds(releaseP1.graveyard)).toContain(araigneeVictim);
  expect(result.events).toEqual(expect.arrayContaining([expect.objectContaining({type:"ame-explosive-vengeance"})]));
  const beforeAmeP2 = playersOf(result.beforeAme).find(player => player.playerId === "player2");
  const afterAmeP2 = playersOf(result.afterAme).find(player => player.playerId === "player2");
  expect(afterAmeP2.servants.length).toBeLessThan(beforeAmeP2.servants.length);
  const afterAmeP1 = playersOf(result.afterAme).find(player => player.playerId === "player1");
  expect(afterAmeP1.capturedVictims.length).toBeGreaterThan(0);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Éclipse solaire expires and Recyclage draws, returns a graveyard card, then cleans its turn state", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11e-sorts-globaux");
  const result = await page.evaluate(async () => {
    const before = auditCollectionBatch11eRuntime();
    await playCard("S000042", null, {returnValidation:true});
    const eclipseMessage = document.querySelector('#notif')?.textContent || '';
    const afterEclipse = auditCollectionBatch11eRuntime();
    await endTurnRuntime();
    const afterExpiry = auditCollectionBatch11eRuntime();
    await endTurnRuntime();
    await playCard("S000044", null, {returnValidation:true});
    const recyclageMessage = document.querySelector('#notif')?.textContent || '';
    const beforeSummon = auditCollectionBatch11eRuntime();
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    const summon = await playCard("MV000001", slot, {returnValidation:true});
    const afterSummon = auditCollectionBatch11eRuntime();
    await endTurnRuntime();
    const afterEnd = auditCollectionBatch11eRuntime();
    return {before, afterEclipse, afterExpiry, eclipseMessage, recyclageMessage, beforeSummon, summon, afterSummon, afterEnd, events:auditCollectionBatch11eRuntime().events};
  });
  const beforeP1 = playersOf(result.before).find(player => player.playerId === "player1");
  const eclipseP1 = playersOf(result.afterEclipse).find(player => player.playerId === "player1");
  const expiredP1 = playersOf(result.afterExpiry).find(player => player.playerId === "player1");
  expect(eclipseP1.servants.find(card => card.id === "MV000001")?.atk).toBe((beforeP1.servants.find(card => card.id === "MV000001")?.atk || 0) + 3);
  expect(expiredP1.servants.find(card => card.id === "MV000001")?.atk).toBe(beforeP1.servants.find(card => card.id === "MV000001")?.atk);
  expect(result.eclipseMessage).toBe(fixture.expected.eclipseMessage);
  expect(result.recyclageMessage).toBe(fixture.expected.recyclageMessage);
  expect(result.summon.success).toBe(true);
  const beforeSummonP1 = playersOf(result.beforeSummon).find(player => player.playerId === "player1");
  const afterSummonP1 = playersOf(result.afterSummon).find(player => player.playerId === "player1");
  expect(afterSummonP1.hand.length).toBe(beforeSummonP1.hand.length);
  expect(cardIds(afterSummonP1.deck)).toContain(fixture.expected.recyclageReturnedFromGraveyard);
  expect(cardIds(afterSummonP1.graveyard)).not.toContain(fixture.expected.recyclageReturnedFromGraveyard);
  expect(result.events).toEqual(expect.arrayContaining([expect.objectContaining({type:"eclipse-solaire"})]));
  expect(result.events).toEqual(expect.arrayContaining([expect.objectContaining({type:"recyclage-on-summon"})]));
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Rituel occulte transfers the current opponent graveyard exactly and the spell joins the caster graveyard", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11e-rituel-occult");
  const result = await page.evaluate(async () => {
    const before = auditCollectionBatch11eRuntime();
    const play = await playCard("S000051", null, {returnValidation:true});
    const message = document.querySelector('#notif')?.textContent || '';
    const after = auditCollectionBatch11eRuntime();
    return {before, play, message, after};
  });
  expect(result.play.success).toBe(true);
  const beforeP1 = playersOf(result.before).find(player => player.playerId === "player1");
  const beforeP2 = playersOf(result.before).find(player => player.playerId === "player2");
  const afterP1 = playersOf(result.after).find(player => player.playerId === "player1");
  const afterP2 = playersOf(result.after).find(player => player.playerId === "player2");
  expect(cardIds(beforeP2.graveyard)).toEqual(fixture.expected.ritualOpponentGraveyard);
  expect(cardIds(afterP2.graveyard)).toEqual([]);
  expect(result.message).toBe(fixture.expected.rituelMessage);
  expect(cardIds(afterP1.graveyard)).toEqual([...cardIds(beforeP1.graveyard), ...fixture.expected.ritualOpponentGraveyard, "S000051"]);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
