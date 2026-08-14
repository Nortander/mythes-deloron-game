import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-11m-v9-necropole-echos-sequencing.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch11m=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect(page.getByTestId("test-resource-panel")).toContainText(fixture.panelTitle);
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(150);
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message =>
    !/Failed to load resource: the server responded with a status of 404/i.test(message)
    && !/Failed to load resource: net::ERR_(FAILED|NETWORK_CHANGED|NAME_RESOLUTION_FAILED|NAME_NOT_RESOLVED)/i.test(message)
  );
}

async function attachCleanDiagnostics(testInfo, diagnostics) {
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
}

function eventIndex(events, type, predicate = () => true) {
  return events.findIndex(event => event.type === type && predicate(event.detail || {}));
}

function eventAt(events, type, predicate = () => true) {
  const event = events.find(entry => entry.type === type && predicate(entry.detail || {}));
  expect(event, "missing event " + type).toBeTruthy();
  return event.at;
}

function expectEchoOrder(events, cardId, reason, finalEchoes) {
  const sourceIndex = eventIndex(events, "echo-source-pulse", detail => detail.cardId === cardId && detail.reason === reason);
  const rameIndex = eventIndex(events, "echo-pile-pulse", detail => detail.reason === "gain");
  const mutationIndex = eventIndex(events, "echo-resource-mutated", detail => detail.reason === "gain" && detail.soulsAfter === finalEchoes);
  const projectionIndex = eventIndex(events, "echo-counter-projected", detail => detail.visibleAmount === finalEchoes);
  expect(sourceIndex).toBeGreaterThanOrEqual(0);
  expect(sourceIndex).toBeLessThan(rameIndex);
  expect(rameIndex).toBeLessThan(mutationIndex);
  expect(mutationIndex).toBeLessThan(projectionIndex);
  const sourceAt = events[sourceIndex].at;
  const rameAt = events[rameIndex].at;
  expect(rameAt - sourceAt).toBeGreaterThanOrEqual(450);
}

async function removeNecropole(page, scenario, mode) {
  await openScenario(page, scenario);
  return page.evaluate(async ({mode, waitMs}) => {
    const row = qs(playerZoneSelector(player1, "appro"));
    const servantRow = qs(playerZoneSelector(player1, "servants"));
    const play = await playCard("R000027", row?.querySelector(".slot-appro"), {returnValidation:true});
    const necropole = row?.querySelector('.fc[data-id="R000027"]');
    const freeServantSlotsBefore = servantRow?.querySelectorAll(".slot").length || 0;
    const eventStart = auditCollectionBatch11lRuntime().batch11aEvents.length;
    let removal = null;
    if (mode === "owner") {
      removal = discardSupplyInstanceToOwnCemetery(player1, necropole?.dataset?.supplyInstance || "", {fc:necropole, targetCemetery:qs(playerZoneSelector(player1, "cemetery"))});
    } else {
      const killer = qs(playerZoneSelector(player2, "servants"))?.querySelector(".fc");
      if (killer) necropole._killer = killer;
      removal = await sendToCemetery(necropole, {killer, forceCemetery:true});
    }
    await new Promise(resolve => setTimeout(resolve, waitMs));
    const audit = auditCollectionBatch11lRuntime();
    const p1 = audit.batch11j.batch11i.batch11e.batch11a.players.find(player => player.playerId === "player1") || {};
    return {
      play,
      removal,
      freeServantSlotsBefore,
      footprintAfter:row?.querySelectorAll("[data-batch11a-necropole-footprint]").length || 0,
      supplySlotsAfter:row?.querySelectorAll(".slot-appro").length || 0,
      servants:(p1.servants || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean),
      supplies:(p1.supplies || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean),
      events:audit.batch11aEvents.slice(eventStart).map(event => ({type:event.type, detail:event.detail, at:event.at}))
    };
  }, {mode, waitMs: 3800});
}

test("Batch-11M scenarios stay hidden and only target the four V9 open cards", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    const audit = await page.evaluate(() => ({
      scenarioId:selectedScenarioId(),
      publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length,
      panelTitle:document.querySelector('[data-testid="test-resource-panel"] h2')?.textContent || "",
      testCardId:activeScenario?.testCardId || ""
    }));
    expect(audit.publicOptionCount, scenario + " must remain hidden").toBe(fixture.hiddenPublicOptionCount);
    expect(audit.panelTitle).toBe(fixture.panelTitle);
    expect(fixture.targetCards).toContain(audit.testCardId);
    expect(fixture.protectedScenarioSubjects).not.toContain(audit.testCardId);
  }

  await attachCleanDiagnostics(testInfo, diagnostics);
});

test("Necropole waits 500 ms after removal and summons Esprits one by one with undead pulses", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  for (const [scenario, mode] of [
    ["collection-batch-11m-necropole-owner-removal-delay", "owner"],
    ["collection-batch-11m-necropole-opponent-removal-delay", "opponent"]
  ]) {
    const audit = await removeNecropole(page, scenario, mode);
    expect(audit.play.success).toBe(true);
    if (mode === "owner") expect(audit.removal.success).toBe(true);
    expect(audit.footprintAfter).toBe(0);
    expect(audit.supplies).not.toContain("R000027");
    expect(audit.servants.filter(id => id === fixture.necropole.expectedSummonedCardId)).toHaveLength(audit.freeServantSlotsBefore);

    const delayStartAt = eventAt(audit.events, "necropole-removal-delay-start", detail => detail.sourceConnected === false);
    const summons = audit.events.filter(event => event.type === "necropole-esprit-summoned");
    expect(summons).toHaveLength(audit.freeServantSlotsBefore);
    expect(summons[0].at - delayStartAt).toBeGreaterThanOrEqual(fixture.necropole.minimumRemovalDelayMs - 30);
    for (let index = 1; index < summons.length; index += 1) {
      expect(summons[index].at - summons[index - 1].at).toBeGreaterThanOrEqual(fixture.necropole.minimumSummonGapMs - 30);
    }
    for (const summon of summons) {
      expect(summon.detail.cardId).toBe(fixture.necropole.expectedSummonedCardId);
      expect(summon.detail.pulseColor).toBe(fixture.necropole.expectedPulseColor);
      expect(summon.detail.sourceConnected).toBe(false);
    }
  }

  await attachCleanDiagnostics(testInfo, diagnostics);
});

test("Jeteur de sorts reanime uses the victim printed total once for a cost-3 combat kill", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11m-jeteur-cost3-single-kill");
  const audit = await page.evaluate(async fixtureJeteur => {
    const watcher = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000011"]');
    const victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="' + fixtureJeteur.singleKillVictimId + '"]');
    const before = Number(player1.resourceState.souls || 0);
    const beforeAudit = auditCollectionBatch11lRuntime();
    const eventStart = beforeAudit.batch11aEvents.length;
    const cEventStart = beforeAudit.batch11j.batch11i.batch11e.batch11c.events.length;
    victim._killer = watcher;
    await sendToCemetery(victim, {killer:watcher, forceCemetery:true});
    await new Promise(resolve => setTimeout(resolve, 900));
    const after = Number(player1.resourceState.souls || 0);
    const audit = auditCollectionBatch11lRuntime();
    const events = audit.batch11aEvents.slice(eventStart).map(event => ({type:event.type, detail:event.detail, at:event.at}));
    const cEvents = audit.batch11j.batch11i.batch11e.batch11c.events.slice(cEventStart);
    return {
      before,
      after,
      delta:after - before,
      printedCost:CARD_COST_DEFINITIONS[fixtureJeteur.singleKillVictimId]?.total ?? CARDS_DATA[fixtureJeteur.singleKillVictimId]?.cost,
      helperGain:batch11bEchoAmountFromPrintedCost(fixtureJeteur.singleKillVictimId),
      watcherGainEvents:cEvents.filter(event => event.type === "jeteur-destruction-echo"),
      implicitCaptureEvents:events.filter(event => event.type === "echo-victim-captured" && event.detail?.source?.id === "MV000011"),
      events
    };
  }, fixture.jeteur);

  expect(audit.printedCost).toBe(fixture.jeteur.singleKillVictimPrintedCost);
  expect(audit.helperGain).toBe(fixture.jeteur.singleKillExpectedEchoGain);
  expect(audit.delta).toBe(fixture.jeteur.singleKillExpectedEchoGain);
  expect(audit.watcherGainEvents).toHaveLength(1);
  expect(audit.watcherGainEvents[0].detail.gain).toBe(fixture.jeteur.singleKillExpectedEchoGain);
  expect(audit.implicitCaptureEvents).toEqual([]);
  expectEchoOrder(audit.events, "MV000011", "batch11c-echo-watch", audit.after);

  await attachCleanDiagnostics(testInfo, diagnostics);
});

test("Jeteur threshold table maps printed totals 0-4, 5-8 and 9+ to exactly 1, 2 and 3 Echoes", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11m-jeteur-thresholds");
  const audit = await page.evaluate(async cases => {
    const watcher = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000011"]');
    const results = [];
    for (const thresholdCase of cases) {
      let victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="' + thresholdCase.victimId + '"]');
      if (!victim) {
        await summonBatch03Servant(player2, thresholdCase.victimId, {sourceCardId:"TEST-11M", triggerInitiativeEffect:false, ready:true});
        victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="' + thresholdCase.victimId + '"]');
      }
      if (!victim) throw new Error("missing-threshold-victim-" + thresholdCase.victimId);
      const before = Number(player1.resourceState.souls || 0);
      const beforeAudit = auditCollectionBatch11lRuntime();
      const eventStart = beforeAudit.batch11aEvents.length;
      const cEventStart = beforeAudit.batch11j.batch11i.batch11e.batch11c.events.length;
      victim._killer = watcher;
      await sendToCemetery(victim, {killer:watcher, forceCemetery:true, suppressVengeance:true});
      await new Promise(resolve => setTimeout(resolve, 900));
      const after = Number(player1.resourceState.souls || 0);
      const afterAudit = auditCollectionBatch11lRuntime();
      const events = afterAudit.batch11aEvents.slice(eventStart).map(event => ({type:event.type, detail:event.detail, at:event.at}));
      const cEvents = afterAudit.batch11j.batch11i.batch11e.batch11c.events.slice(cEventStart);
      results.push({
        victimId:thresholdCase.victimId,
        before,
        after,
        delta:after - before,
        printedCost:CARD_COST_DEFINITIONS[thresholdCase.victimId]?.total ?? CARDS_DATA[thresholdCase.victimId]?.cost,
        helperGain:batch11bEchoAmountFromPrintedCost(thresholdCase.victimId),
        watcherGainEvents:cEvents.filter(event => event.type === "jeteur-destruction-echo"),
        events
      });
    }
    return results;
  }, fixture.jeteur.thresholdCases);

  expect(audit).toHaveLength(fixture.jeteur.thresholdCases.length);
  for (const [index, result] of audit.entries()) {
    const expected = fixture.jeteur.thresholdCases[index];
    expect(result.victimId).toBe(expected.victimId);
    expect(result.printedCost).toBe(expected.printedCost);
    expect(result.helperGain).toBe(expected.expectedEchoGain);
    expect(result.delta).toBe(expected.expectedEchoGain);
    expect(result.watcherGainEvents).toHaveLength(1);
    expect(result.watcherGainEvents[0].detail.gain).toBe(expected.expectedEchoGain);
    expectEchoOrder(result.events, "MV000011", "batch11c-echo-watch", result.after);
  }

  await attachCleanDiagnostics(testInfo, diagnostics);
});

test("Morghast and Mur non-mort mutate Echoes only after source pulse and RAME pulse", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11m-morghast-sequencing-only");
  const morghast = await page.evaluate(async () => {
    const beforeAudit = auditCollectionBatch11lRuntime();
    const eventStart = beforeAudit.batch11aEvents.length;
    const victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000001"]');
    const killer = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000024"]');
    victim._killer = killer;
    const before = Number(player1.resourceState.souls || 0);
    await sendToCemetery(victim, {killer, forceCemetery:true});
    await new Promise(resolve => setTimeout(resolve, 900));
    const afterAudit = auditCollectionBatch11lRuntime();
    const after = Number(player1.resourceState.souls || 0);
    return {before, after, delta:after - before, events:afterAudit.batch11aEvents.slice(eventStart).map(event => ({type:event.type, detail:event.detail, at:event.at}))};
  });
  expect(morghast.delta).toBe(1);
  expectEchoOrder(morghast.events, "MV000024", "batch11c-morghast-echo", morghast.after);

  await openScenario(page, "collection-batch-11m-mur-non-mort-sequencing-only");
  const mur = await page.evaluate(async damage => {
    const beforeAudit = auditCollectionBatch11lRuntime();
    const eventStart = beforeAudit.batch11aEvents.length;
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000030"]');
    const before = Number(player1.resourceState.souls || 0);
    await applyDamage(source, damage, {sourceCardId:"TEST-11M"});
    await new Promise(resolve => setTimeout(resolve, 900));
    const afterAudit = auditCollectionBatch11lRuntime();
    const after = Number(player1.resourceState.souls || 0);
    return {before, after, delta:after - before, events:afterAudit.batch11aEvents.slice(eventStart).map(event => ({type:event.type, detail:event.detail, at:event.at}))};
  }, fixture.mur.damage);
  expect(mur.delta).toBe(fixture.mur.expectedEchoGain);
  expectEchoOrder(mur.events, "MV000030", "damage-echo", mur.after);

  await attachCleanDiagnostics(testInfo, diagnostics);
});
