import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-11l-v8-core-blockers.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch11l=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect(page.getByTestId("test-resource-panel")).toContainText(fixture.panelTitle);
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(150);
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message =>
    !/Failed to load resource: the server responded with a status of 404/i.test(message)
    && !/Failed to load resource: net::ERR_(NETWORK_CHANGED|NAME_RESOLUTION_FAILED|NAME_NOT_RESOLVED)/i.test(message)
  );
}

function indexOfEvent(events, type, predicate = () => true) {
  return events.findIndex(event => event.type === type && predicate(event.detail || {}));
}

async function attachCleanDiagnostics(testInfo, diagnostics) {
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
}

test("Batch-11L scenarios stay hidden, use the 11L panel, and do not reopen protected subjects", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    const audit = await page.evaluate(() => ({
      scenarioId: selectedScenarioId(),
      publicOptionCount: document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length,
      panelTitle: document.querySelector('[data-testid="test-resource-panel"] h2')?.textContent || "",
      testCardId: activeScenario?.testCardId || ""
    }));
    expect(audit.publicOptionCount, scenario + " must remain hidden").toBe(fixture.hiddenPublicOptionCount);
    expect(audit.panelTitle).toBe(fixture.panelTitle);
    expect(fixture.targetCards, scenario + " must focus on an open V8 card").toContain(audit.testCardId);
    expect(fixture.protectedScenarioSubjects, scenario + " must not reopen a protected card as subject").not.toContain(audit.testCardId);
  }

  await attachCleanDiagnostics(testInfo, diagnostics);
});

test("Necropole releases both supply slots and fills the board on owner and opponent removals", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  async function playAndRemove(scenario, mode) {
    await openScenario(page, scenario);
    return page.evaluate(async mode => {
      const row = qs(playerZoneSelector(player1, "appro"));
      const servantRow = qs(playerZoneSelector(player1, "servants"));
      const play = await playCard("R000027", row?.querySelector(".slot-appro"), {returnValidation: true});
      const necropole = row?.querySelector('.fc[data-id="R000027"]');
      const freeServantSlotsBefore = servantRow?.querySelectorAll(".slot").length || 0;
      const slotsBefore = row?.querySelectorAll(".slot-appro").length || 0;
      const footprintBefore = row?.querySelectorAll("[data-batch11a-necropole-footprint]").length || 0;
      let removal = null;
      if (mode === "owner") {
        removal = discardSupplyInstanceToOwnCemetery(player1, necropole?.dataset?.supplyInstance || "", {fc:necropole, targetCemetery:qs(playerZoneSelector(player1, "cemetery"))});
      } else {
        const killer = qs(playerZoneSelector(player2, "servants"))?.querySelector(".fc");
        if (killer) necropole._killer = killer;
        removal = await sendToCemetery(necropole, {killer, forceCemetery:true});
      }
      await new Promise(resolve => setTimeout(resolve, 900));
      const audit = auditCollectionBatch11lRuntime();
      const p1 = audit.batch11j.batch11i.batch11e.batch11a.players.find(player => player.playerId === "player1") || {};
      return {
        play,
        removal,
        freeServantSlotsBefore,
        slotsBefore,
        footprintBefore,
        footprintAfter:row?.querySelectorAll("[data-batch11a-necropole-footprint]").length || 0,
        slotsAfter:row?.querySelectorAll(".slot-appro").length || 0,
        servants:(p1.servants || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean),
        supplies:(p1.supplies || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean),
        events:audit.batch11aEvents.map(event => ({type:event.type, detail:event.detail}))
      };
    }, mode);
  }

  const owner = await playAndRemove("collection-batch-11l-necropole-removal-owner", "owner");
  expect(owner.play.success).toBe(true);
  expect(owner.removal.success).toBe(true);
  expect(owner.footprintBefore).toBe(1);
  expect(owner.footprintAfter).toBe(0);
  expect(owner.slotsAfter).toBeGreaterThanOrEqual(owner.slotsBefore + 2);
  expect(owner.supplies).not.toContain("R000027");
  expect(owner.servants.filter(id => id === "MV000025")).toHaveLength(owner.freeServantSlotsBefore);
  expect(owner.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type:"necropole-removal-voluntary-cemetery"}),
    expect.objectContaining({type:"necropole-footprint-released"}),
    expect.objectContaining({type:"necropole-removed-fill-board"})
  ]));

  const opponent = await playAndRemove("collection-batch-11l-necropole-removal-opponent", "opponent");
  expect(opponent.play.success).toBe(true);
  expect(opponent.footprintBefore).toBe(1);
  expect(opponent.footprintAfter).toBe(0);
  expect(opponent.slotsAfter).toBeGreaterThanOrEqual(opponent.slotsBefore + 2);
  expect(opponent.supplies).not.toContain("R000027");
  expect(opponent.servants.filter(id => id === "MV000025")).toHaveLength(opponent.freeServantSlotsBefore);
  expect(opponent.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type:"necropole-footprint-released"}),
    expect.objectContaining({type:"necropole-removed-fill-board"})
  ]));

  await attachCleanDiagnostics(testInfo, diagnostics);
});

test("Jeteur de sorts reanime grants Echoes from one printed-cost source only", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11l-jeteur-accounting-single-source");
  const audit = await page.evaluate(async fixtureJeteur => {
    const beforeAudit = auditCollectionBatch11lRuntime();
    const eventStart = beforeAudit.batch11aEvents.length;
    const sourceIds = Array.from(qs(playerZoneSelector(player1, "servants"))?.querySelectorAll(".fc") || []).map(fc => fc.dataset.id);
    const victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="' + fixtureJeteur.victimId + '"]');
    const before = Number(player1.resourceState.souls || 0);
    const victimCost = CARD_COST_DEFINITIONS[fixtureJeteur.victimId]?.total ?? CARDS_DATA[fixtureJeteur.victimId]?.cost;
    const helperGain = batch11bEchoAmountFromPrintedCost(fixtureJeteur.victimId);
    await sendToCemetery(victim, {forceCemetery:true});
    await new Promise(resolve => setTimeout(resolve, 250));
    const afterAudit = auditCollectionBatch11lRuntime();
    const events = afterAudit.batch11aEvents.slice(eventStart);
    const after = Number(player1.resourceState.souls || 0);
    return {sourceIds, before, after, delta:after - before, victimCost, helperGain, events:events.map(event => ({type:event.type, detail:event.detail}))};
  }, fixture.jeteur);

  expect(audit.sourceIds).toEqual(["MV000011"]);
  expect(audit.victimCost).toBe(fixture.jeteur.victimPrintedCost);
  expect(audit.helperGain).toBe(fixture.jeteur.expectedEchoGain);
  expect(audit.before).toBe(fixture.jeteur.initialEchoes);
  expect(audit.after).toBe(fixture.jeteur.finalEchoes);
  expect(audit.delta).toBe(fixture.jeteur.expectedEchoGain);
  const sourcePulse = indexOfEvent(audit.events, "echo-source-pulse", detail => detail.cardId === "MV000011");
  const ramePulse = indexOfEvent(audit.events, "echo-pile-pulse", detail => detail.reason === "gain" && detail.amount === fixture.jeteur.initialEchoes);
  const mutation = indexOfEvent(audit.events, "echo-resource-mutated", detail => detail.soulsAfter === fixture.jeteur.finalEchoes);
  const projection = indexOfEvent(audit.events, "echo-counter-projected", detail => detail.visibleAmount === fixture.jeteur.finalEchoes);
  expect(sourcePulse).toBeGreaterThanOrEqual(0);
  expect(sourcePulse).toBeLessThan(ramePulse);
  expect(ramePulse).toBeLessThan(mutation);
  expect(mutation).toBeLessThan(projection);

  await attachCleanDiagnostics(testInfo, diagnostics);
});

test("Morghast and Mur non-mort show source, RAME pulse, mutation and projection in order", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11l-morghast-sequencing");
  const morghast = await page.evaluate(async () => {
    const beforeAudit = auditCollectionBatch11lRuntime();
    const eventStart = beforeAudit.batch11aEvents.length;
    const victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000001"]');
    const killer = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000024"]');
    if (!victim || !killer) throw new Error("missing-morghast-test-state");
    victim._killer = killer;
    const before = Number(player1.resourceState.souls || 0);
    await sendToCemetery(victim, {killer, forceCemetery:true});
    await new Promise(resolve => setTimeout(resolve, 250));
    const afterAudit = auditCollectionBatch11lRuntime();
    return {before, after:Number(player1.resourceState.souls || 0), events:afterAudit.batch11aEvents.slice(eventStart).map(event => ({type:event.type, detail:event.detail}))};
  });
  const morghastSource = indexOfEvent(morghast.events, "echo-source-pulse", detail => detail.cardId === "MV000024" && detail.reason === "batch11c-morghast-echo");
  const morghastRame = indexOfEvent(morghast.events, "echo-pile-pulse", detail => detail.reason === "gain" && detail.amount === morghast.before);
  const morghastMutation = indexOfEvent(morghast.events, "echo-resource-mutated", detail => detail.soulsBefore === morghast.before && detail.soulsAfter === morghast.after);
  const morghastProjection = indexOfEvent(morghast.events, "echo-counter-projected", detail => detail.visibleAmount === morghast.after);
  expect(morghast.after - morghast.before).toBe(1);
  expect(morghastSource).toBeLessThan(morghastRame);
  expect(morghastRame).toBeLessThan(morghastMutation);
  expect(morghastMutation).toBeLessThan(morghastProjection);

  await openScenario(page, "collection-batch-11l-mur-non-mort-sequencing");
  const mur = await page.evaluate(async damage => {
    const beforeAudit = auditCollectionBatch11lRuntime();
    const eventStart = beforeAudit.batch11aEvents.length;
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000030"]');
    const before = Number(player1.resourceState.souls || 0);
    await applyDamage(source, damage, {sourceCardId:"TEST-11L"});
    await new Promise(resolve => setTimeout(resolve, 250));
    const afterAudit = auditCollectionBatch11lRuntime();
    return {before, after:Number(player1.resourceState.souls || 0), events:afterAudit.batch11aEvents.slice(eventStart).map(event => ({type:event.type, detail:event.detail}))};
  }, fixture.mur.damage);
  const murSource = indexOfEvent(mur.events, "echo-source-pulse", detail => detail.cardId === "MV000030" && detail.reason === "damage-echo");
  const murRame = indexOfEvent(mur.events, "echo-pile-pulse", detail => detail.reason === "gain" && detail.amount === mur.before);
  const murMutation = indexOfEvent(mur.events, "echo-resource-mutated", detail => detail.soulsBefore === mur.before && detail.soulsAfter === mur.after);
  const murProjection = indexOfEvent(mur.events, "echo-counter-projected", detail => detail.visibleAmount === mur.after);
  expect(mur.after - mur.before).toBe(fixture.mur.expectedEchoGain);
  expect(murSource).toBeLessThan(murRame);
  expect(murRame).toBeLessThan(murMutation);
  expect(murMutation).toBeLessThan(murProjection);

  await attachCleanDiagnostics(testInfo, diagnostics);
});

test("Deck and cemetery zone flights use logical owner paths for Hokhan, Recyclage and Rituel", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11l-hokhan-avatar-deck-path");
  const hokhan = await page.evaluate(async () => {
    const undead = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000001"]');
    await sendToCemetery(undead);
    await new Promise(resolve => setTimeout(resolve, 250));
    return auditCollectionBatch11lRuntime().zoneFlights.filter(event => event.detail?.reason === "hokhan-avatar-graveyard-to-deck").map(event => event.detail);
  });
  expect(hokhan).toHaveLength(1);
  expect(hokhan[0]).toEqual(expect.objectContaining({cardId:"MV000001", fromPlayer:"player1", fromZone:"servants", toPlayer:"player1", toZone:"deck", visible:true, pathAuditVersion:"batch11l-deck-stack-anchor"}));
  expect(hokhan[0].toElement.isDeckStack).toBe(true);
  expect(hokhan[0].toElement.isDeckCounter).toBe(false);

  await openScenario(page, "collection-batch-11l-recyclage-zone-paths");
  const recyclage = await page.evaluate(async () => {
    await playCard("S000044", null, {returnValidation:true});
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    await playCard("MV000001", slot, {returnValidation:true});
    await new Promise(resolve => setTimeout(resolve, 1200));
    return auditCollectionBatch11lRuntime().zoneFlights.map(event => event.detail);
  });
  const deckToHand = recyclage.find(detail => detail.reason === "recyclage-deck-to-hand");
  const graveToDeck = recyclage.find(detail => detail.reason === "recyclage-grave-to-deck");
  expect(deckToHand).toEqual(expect.objectContaining({fromPlayer:"player1", fromZone:"deck", toPlayer:"player1", toZone:"hand", visible:true}));
  expect(deckToHand.fromElement.isDeckStack).toBe(true);
  expect(deckToHand.fromElement.isDeckCounter).toBe(false);
  expect(graveToDeck).toEqual(expect.objectContaining({fromPlayer:"player1", fromZone:"graveyard", toPlayer:"player1", toZone:"deck", visible:true}));
  expect(graveToDeck.toElement.isDeckStack).toBe(true);
  expect(graveToDeck.toElement.isDeckCounter).toBe(false);

  await openScenario(page, "collection-batch-11l-rituel-cemetery-transfer");
  const rituel = await page.evaluate(async transferred => {
    const before = auditZoneInventories();
    const startedAt = performance.now();
    await playCard("S000051", null, {returnValidation:true});
    await new Promise(resolve => setTimeout(resolve, 1900));
    const finishedAt = performance.now();
    const audit = auditCollectionBatch11lRuntime();
    const flights = audit.zoneFlights.filter(event => event.detail?.reason === "rituel-occulte-grave-transfer").map(event => event.detail);
    return {before, after:audit.inventories, flights, elapsed:finishedAt - startedAt, transferred};
  }, fixture.rituel.transferred);
  expect(rituel.before.player2.graveyard).toEqual(fixture.rituel.transferred);
  expect(rituel.after.player2.graveyard).toEqual([]);
  expect(rituel.after.player1.graveyard).toEqual(fixture.rituel.finalCasterGraveyard);
  expect(rituel.flights.map(detail => detail.cardId)).toEqual(fixture.rituel.transferred);
  for (const flight of rituel.flights) {
    expect(flight).toEqual(expect.objectContaining({fromPlayer:"player2", fromZone:"graveyard", toPlayer:"player1", toZone:"graveyard", visible:true}));
  }
  expect(rituel.elapsed).toBeGreaterThanOrEqual(1500);

  await attachCleanDiagnostics(testInfo, diagnostics);
});
