import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-11a-morts-vivants-echos.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch11a=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect(page.getByText("MODE TEST — COLLECTION BATCH 11A")).toBeVisible();
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

test("Batch-11A scenarios stay hidden and expose Echo-facing card data", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    const audit = await page.evaluate((ids) => ({
      scenarioId:selectedScenarioId(),
      publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length,
      runtime:auditCollectionBatch11aRuntime(),
      cards:ids.map(id => ({
        id,
        exists:!!CARDS_DATA[id],
        name:CARDS_DATA[id]?.name || "",
        text:CARDS_DATA[id]?.cap || "",
        formatted:formatPlayerFacingCardText(CARDS_DATA[id]?.cap || ""),
        keywords:[...(CARDS_DATA[id]?.kws || [])]
      }))
    }), fixture.cardIds);
    expect(audit.scenarioId).toBe(scenario);
    expect(audit.publicOptionCount, scenario + " public selector option").toBe(0);
    expect(audit.runtime.resourceLabel).toBe(fixture.expected.resourceLabel);
    for (const card of audit.cards) {
      expect(card.exists, card.id).toBe(true);
      expect(card.formatted, card.id + " keeps RAME technical ids out of public text").not.toMatch(/RAME0|RAME5|RAME10|RAME15|RAME20|RAME21|RAME\*/);
    }
    expect(audit.cards.find(card => card.id === "R000021")?.text).toContain("5 Échos");
    expect(audit.cards.find(card => card.id === "MV000009")?.text).toContain("*1 à 3* Échos");
    expect(audit.cards.find(card => card.id === "AVS000008")?.text).toContain("*8* Échos");
  }
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Crypte familiale adds exactly 5 Echo resources and updates the visual Echo stack", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-11a-echos");
  const result = await page.evaluate(async () => {
    const before = auditCollectionBatch11aRuntime().players.find(player => player.playerId === player1.key);
    const slot = qs(playerZoneSelector(player1, "appro"))?.querySelector(".slot-appro");
    const play = await playCard("R000021", slot, {returnValidation:true});
    const after = auditCollectionBatch11aRuntime().players.find(player => player.playerId === player1.key);
    const echoNode = qs(playerZoneSelector(player1, "appro"))?.querySelector("[data-soul]");
    return {
      play,
      before,
      after,
      echoNode:{value:Number(echoNode?.dataset.soul || -1), image:echoNode?.querySelector("img.fi")?.getAttribute("src") || ""},
      events:auditCollectionBatch11aRuntime().events
    };
  });
  expect(result.play.success).toBe(true);
  expect(result.before.souls).toBe(1);
  expect(result.after.souls).toBe(1 + fixture.expected.crypteFamilialeEchoGain);
  expect(result.after.hand).not.toContain("R000021");
  expect(result.echoNode.value).toBe(result.after.souls);
  expect(result.echoNode.image).toContain("RAME10.png");
  expect(result.events.some(event => event.type === "crypte-familiale-echos" && event.detail.amount === fixture.expected.crypteFamilialeEchoGain)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Faucheur d'âmes captures the defeated servant under the Echo pile without duplicating it", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-11a-echos");
  const result = await page.evaluate(async () => {
    const before = auditCollectionBatch11aRuntime();
    const reaper = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000009"]');
    const victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000001"]');
    victim._killer = reaper;
    await sendToCemetery(victim);
    const after = auditCollectionBatch11aRuntime();
    return {
      before,
      after,
      event:window.__collectionBatch11aLastEvent,
      victimStillOnBoard:!!qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000001"]')
    };
  });
  const beforePlayer1 = result.before.players.find(player => player.playerId === "player1");
  const afterPlayer1 = result.after.players.find(player => player.playerId === "player1");
  const afterPlayer2 = result.after.players.find(player => player.playerId === "player2");
  expect(afterPlayer1.souls).toBe(beforePlayer1.souls + fixture.expected.faucheurEchoGain);
  expect(afterPlayer1.capturedVictims).toEqual(expect.arrayContaining([expect.objectContaining({cardId:"H000001", originalOwnerId:"player2", capturedBy:"MV000009"})]));
  expect(afterPlayer2.graveyard.map(entry => entry.cardId)).not.toContain("H000001");
  expect(result.victimStillOnBoard).toBe(false);
  expect(result.event.type).toBe("echo-victim-captured");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Nécropole validates its starting-deck condition, occupies two supply slots, then generates Echo at turn start", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-11a-necropole");
  const result = await page.evaluate(async () => {
    const slot = qs(playerZoneSelector(player1, "appro"))?.querySelector(".slot-appro");
    const play = await playCard("R000027", slot, {returnValidation:true});
    const necropole = qs(playerZoneSelector(player1, "appro"))?.querySelector('.fc[data-id="R000027"]');
    const footprintCount = qs(playerZoneSelector(player1, "appro"))?.querySelectorAll("[data-batch11a-necropole-footprint]").length || 0;
    const undead = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000001"]');
    await sendToCemetery(undead);
    const beforeTurn = auditCollectionBatch11aRuntime().players.find(player => player.playerId === player1.key);
    player1.turnState.startTurnAbilitiesResolved = false;
    await runStartTurnPipeline(player1);
    const turnTrace = getLastStartTurnTrace();
    const afterTurn = auditCollectionBatch11aRuntime().players.find(player => player.playerId === player1.key);
    return {
      play,
      necropoleInstance:necropole?.dataset.supplyInstance || "",
      footprintCount,
      beforeTurn,
      afterTurn,
      turnTrace,
      events:auditCollectionBatch11aRuntime().events
    };
  });
  expect(result.play.success).toBe(true);
  expect(result.necropoleInstance).not.toBe("");
  expect(result.footprintCount).toBe(1);
  expect(result.beforeTurn.necropoleDestroyedSinceLastTurn).toBe(1);
  expect(result.turnTrace.batch11aNecropole).toEqual(expect.objectContaining({
    success:true,
    base:fixture.expected.necropoleBaseGain,
    destroyedBonus:1,
    graveyardBonus:fixture.expected.necropoleOpponentGraveyardBonus,
    amount:4
  }));
  expect(result.afterTurn.souls).toBe(result.beforeTurn.souls + 4);
  expect(result.afterTurn.necropoleDestroyedSinceLastTurn).toBe(0);
  expect(result.events.some(event => event.type === "necropole-start-turn" && event.detail.amount === 4)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Removing Nécropole releases its footprint and fills open servant slots with Esprits dérangés", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-11a-necropole");
  const result = await page.evaluate(async (generatedId) => {
    const slot = qs(playerZoneSelector(player1, "appro"))?.querySelector(".slot-appro");
    await playCard("R000027", slot, {returnValidation:true});
    const necropole = qs(playerZoneSelector(player1, "appro"))?.querySelector('.fc[data-id="R000027"]');
    const beforeFootprints = qs(playerZoneSelector(player1, "appro"))?.querySelectorAll("[data-batch11a-necropole-footprint]").length || 0;
    await sendToCemetery(necropole, {suppressVengeance:true});
    const runtime = auditCollectionBatch11aRuntime();
    const afterPlayer = runtime.players.find(player => player.playerId === player1.key);
    return {
      beforeFootprints,
      afterFootprints:qs(playerZoneSelector(player1, "appro"))?.querySelectorAll("[data-batch11a-necropole-footprint]").length || 0,
      generatedCount:afterPlayer.servants.filter(card => card.id === generatedId).length,
      graveyard:afterPlayer.graveyard.map(entry => entry.cardId),
      events:runtime.events
    };
  }, fixture.expected.necropoleGeneratedServantId);
  expect(result.beforeFootprints).toBe(1);
  expect(result.afterFootprints).toBe(0);
  expect(result.generatedCount).toBeGreaterThan(0);
  expect(result.graveyard).toContain("R000027");
  expect(result.events.some(event => event.type === "necropole-removed-fill-board" && event.detail.summonedCount === result.generatedCount)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
