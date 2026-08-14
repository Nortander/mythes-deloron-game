import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-11n-v10-final-polish.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch11n=" + Date.now());
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

test("Batch-11N scenarios stay hidden and only reopen Necropole and Mur non-mort", async ({page}, testInfo) => {
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
  }

  await attachCleanDiagnostics(testInfo, diagnostics);
});

test("Necropole owner removal uses the final V10 public message and keeps sequential Esprit timing", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, fixture.necropole.scenario);
  const audit = await page.evaluate(async necropole => {
    const row = qs(playerZoneSelector(player1, "appro"));
    const servantRow = qs(playerZoneSelector(player1, "servants"));
    const play = await playCard("R000027", row?.querySelector(".slot-appro"), {returnValidation:true});
    const necropoleFC = row?.querySelector('.fc[data-id="R000027"]');
    const freeServantSlotsBefore = servantRow?.querySelectorAll(".slot").length || 0;
    const eventStart = auditCollectionBatch11lRuntime().batch11aEvents.length;
    const removal = discardSupplyInstanceToOwnCemetery(player1, necropoleFC?.dataset?.supplyInstance || "", {fc:necropoleFC, targetCemetery:qs(playerZoneSelector(player1, "cemetery"))});
    if (removal.success) showNotif(removal.publicMessage || "Approvisionnement envoyé au cimetière.", 2200);
    await new Promise(resolve => setTimeout(resolve, 80));
    const message = document.querySelector("#notif")?.textContent || "";
    await new Promise(resolve => setTimeout(resolve, 3800));
    const afterAudit = auditCollectionBatch11lRuntime();
    const p1 = afterAudit.batch11j.batch11i.batch11e.batch11a.players.find(player => player.playerId === "player1") || {};
    return {
      play,
      removal,
      message,
      freeServantSlotsBefore,
      footprintAfter:row?.querySelectorAll("[data-batch11a-necropole-footprint]").length || 0,
      supplySlotsAfter:row?.querySelectorAll(".slot-appro").length || 0,
      servants:(p1.servants || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean),
      supplies:(p1.supplies || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean),
      events:afterAudit.batch11aEvents.slice(eventStart).map(event => ({type:event.type, detail:event.detail, at:event.at}))
    };
  }, fixture.necropole);

  expect(audit.play.success).toBe(true);
  expect(audit.removal.success).toBe(true);
  expect(audit.removal.publicMessage).toBe(fixture.necropole.expectedMessage);
  expect(audit.message).toBe(fixture.necropole.expectedMessage);
  expect(audit.message.toUpperCase()).not.toContain(fixture.necropole.forbiddenGenericMessagePattern);
  expect(audit.footprintAfter).toBe(0);
  expect(audit.supplies).not.toContain("R000027");
  expect(audit.servants.filter(id => id === fixture.necropole.expectedSummonedCardId)).toHaveLength(audit.freeServantSlotsBefore);

  const messageEvent = audit.events.find(event => event.type === "necropole-removal-voluntary-cemetery");
  expect(messageEvent?.detail?.publicMessage).toBe(fixture.necropole.expectedMessage);
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
  }

  await attachCleanDiagnostics(testInfo, diagnostics);
});

test("Mur non-mort pulses before RAME and keeps the Echo counter unchanged until after the RAME pulse", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, fixture.mur.scenario);
  const audit = await page.evaluate(async mur => {
    const beforeAudit = auditCollectionBatch11lRuntime();
    const eventStart = beforeAudit.batch11aEvents.length;
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000030"]');
    const echoPile = () => qs(playerZoneSelector(player1, "appro"))?.querySelector("[data-soul]");
    const snapshot = label => ({
      label,
      logicalSouls:Number(player1.resourceState.souls || 0),
      visibleSouls:Number(echoPile()?.dataset?.soul || 0),
      sourcePulsing:!!source?.classList.contains("batch03-ability-pulse"),
      sourceMoving:!!source?.classList.contains("batch03-ability-pulse-move"),
      ramePulsing:!!echoPile()?.classList.contains("batch11-echo-pile-pulse"),
      events:auditCollectionBatch11lRuntime().batch11aEvents.slice(eventStart).map(event => ({type:event.type, detail:event.detail, at:event.at}))
    });
    const before = snapshot("before");
    const pending = applyDamage(source, mur.damage, {sourceCardId:"TEST-11N"});
    await new Promise(resolve => setTimeout(resolve, 120));
    const afterSource = snapshot("after-source");
    await new Promise(resolve => setTimeout(resolve, mur.sourceDelayMs + 90));
    const afterRame = snapshot("after-rame-before-commit");
    await pending;
    await new Promise(resolve => setTimeout(resolve, 160));
    const after = snapshot("after-commit");
    return {
      before,
      afterSource,
      afterRame,
      after,
      finalEvents:after.events
    };
  }, fixture.mur);

  expect(audit.afterSource.logicalSouls).toBe(audit.before.logicalSouls);
  expect(audit.afterSource.visibleSouls).toBe(audit.before.visibleSouls);
  expect(audit.afterSource.sourcePulsing).toBe(true);
  expect(audit.afterSource.sourceMoving).toBe(true);

  const rameIndexAtMidpoint = eventIndex(audit.afterRame.events, "echo-pile-pulse", detail => detail.reason === "gain");
  const mutationIndexAtMidpoint = eventIndex(audit.afterRame.events, "echo-resource-mutated", detail => detail.reason === "gain");
  expect(rameIndexAtMidpoint).toBeGreaterThanOrEqual(0);
  expect(mutationIndexAtMidpoint).toBe(-1);
  expect(audit.afterRame.logicalSouls).toBe(audit.before.logicalSouls);
  expect(audit.afterRame.visibleSouls).toBe(audit.before.visibleSouls);
  expect(audit.afterRame.ramePulsing).toBe(true);

  expect(audit.after.logicalSouls).toBe(audit.before.logicalSouls + fixture.mur.expectedEchoGain);
  expect(audit.after.visibleSouls).toBe(audit.after.logicalSouls);
  const sourceIndex = eventIndex(audit.finalEvents, "echo-source-pulse", detail => detail.cardId === "MV000030" && detail.reason === "damage-echo");
  const rameIndex = eventIndex(audit.finalEvents, "echo-pile-pulse", detail => detail.reason === "gain");
  const delayIndex = eventIndex(audit.finalEvents, "echo-rame-commit-delay-start", detail => detail.cardId === "MV000030");
  const mutationIndex = eventIndex(audit.finalEvents, "echo-resource-mutated", detail => detail.reason === "gain" && detail.delta === fixture.mur.expectedEchoGain);
  const projectionIndex = eventIndex(audit.finalEvents, "echo-counter-projected", detail => detail.visibleAmount === audit.after.logicalSouls);
  expect(sourceIndex).toBeGreaterThanOrEqual(0);
  expect(sourceIndex).toBeLessThan(rameIndex);
  expect(rameIndex).toBeLessThan(delayIndex);
  expect(delayIndex).toBeLessThan(mutationIndex);
  expect(mutationIndex).toBeLessThan(projectionIndex);
  expect(audit.finalEvents[rameIndex].at - audit.finalEvents[sourceIndex].at).toBeGreaterThanOrEqual(fixture.mur.sourceDelayMs - 30);
  expect(audit.finalEvents[mutationIndex].at - audit.finalEvents[rameIndex].at).toBeGreaterThanOrEqual(fixture.mur.rameCommitDelayMs - 30);

  await attachCleanDiagnostics(testInfo, diagnostics);
});
