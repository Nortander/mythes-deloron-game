import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const SCENARIO = "collection-batch-14b-prst000014-core-visual";

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource/i.test(message));
}

async function open14F5Scenario(page, mode = "manual") {
  await page.goto("/code/partie-test-1.html?scenario=" + SCENARIO + "&batch14f=" + mode + "&batch14f5=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(SCENARIO);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(150);
}

async function attachCleanDiagnostics(testInfo, diagnostics) {
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
}

test("Batch 14F5 MV000011 gains Echoes when Hokhan redirects an allied undead destruction to deck", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14F5Scenario(page);

  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const watcher = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000011"]');
    const ally = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000009"]');
    const beforeAudit = auditCollectionBatch11lRuntime();
    const cEventStart = beforeAudit.batch11j.batch11i.batch11e.batch11c.events.length;
    const eEventStart = beforeAudit.batch11j.batch11i.batch11e.events.length;
    const before = Number(player1.resourceState.souls || 0);
    const deckVictimCountBefore = player1.drawPile.filter(cardId => cardId === "MV000009").length;
    const graveyardVictimCountBefore = player1.graveyard.filter(cardId => cardId === "MV000009").length;
    await sendToCemetery(ally, {suppressVengeance: true});
    await new Promise(resolve => setTimeout(resolve, 900));
    const afterAudit = auditCollectionBatch11lRuntime();
    const after = Number(player1.resourceState.souls || 0);
    const cEvents = afterAudit.batch11j.batch11i.batch11e.batch11c.events.slice(cEventStart);
    const eEvents = afterAudit.batch11j.batch11i.batch11e.events.slice(eEventStart);
    return {
      watcherStillOnBoard: !!watcher?.isConnected,
      allyStillOnBoard: !!ally?.isConnected,
      before,
      after,
      delta: after - before,
      helperGain: batch11bEchoAmountFromPrintedCost("MV000009"),
      deckVictimCountBefore,
      deckVictimCountAfter: player1.drawPile.filter(cardId => cardId === "MV000009").length,
      graveyardVictimCountBefore,
      graveyardVictimCountAfter: player1.graveyard.filter(cardId => cardId === "MV000009").length,
      hokhanEvents: eEvents.filter(event => event.type === "hokhan-avatar-graveyard-to-deck"),
      watcherEvents: cEvents.filter(event => event.type === "jeteur-destruction-echo")
    };
  });

  expect(result.watcherStillOnBoard).toBe(true);
  expect(result.allyStillOnBoard).toBe(false);
  expect(result.deckVictimCountAfter).toBe(result.deckVictimCountBefore + 1);
  expect(result.graveyardVictimCountAfter).toBe(result.graveyardVictimCountBefore);
  expect(result.hokhanEvents).toHaveLength(1);
  expect(result.helperGain).toBe(1);
  expect(result.delta).toBe(1);
  expect(result.watcherEvents).toHaveLength(1);
  expect(result.watcherEvents[0].detail.gain).toBe(1);
  expect(result.watcherEvents[0].detail.destroyed.id).toBe("MV000009");
  expect(result.watcherEvents[0].detail.source.id).toBe("MV000011");

  await attachCleanDiagnostics(testInfo, diagnostics);
});

test("Batch 14F5 MV000011 caps destruction Echo production at 10 per watcher per turn", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14F5Scenario(page);

  const result = await page.evaluate(async () => {
    turnSequence += 1;
    currentPlayer = player1.key;
    player1.resourceState.souls = 0;
    player1.resourceState.revision += 1;
    projectSoulState(player1);
    const watcher = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000011"]');
    const beforeAudit = auditCollectionBatch11lRuntime();
    const cEventStart = beforeAudit.batch11j.batch11i.batch11e.batch11c.events.length;
    for (let index = 0; index < 4; index += 1) {
      await summonBatch03Servant(player2, "MV000012", {sourceCardId: "batch14f5-jeteur-cap", triggerInitiativeEffect: false, ready: true});
      const victims = Array.from(qs(playerZoneSelector(player2, "servants"))?.querySelectorAll('.fc[data-id="MV000012"]') || []);
      const victim = victims.at(-1);
      if (!victim) throw new Error("missing-cap-victim");
      await sendToCemetery(victim, {killer: watcher, suppressVengeance: true});
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    const afterAudit = auditCollectionBatch11lRuntime();
    const cEvents = afterAudit.batch11j.batch11i.batch11e.batch11c.events.slice(cEventStart).filter(event => event.type === "jeteur-destruction-echo");
    return {
      echoes: Number(player1.resourceState.souls || 0),
      helperGain: batch11bEchoAmountFromPrintedCost("MV000012"),
      gains: cEvents.map(event => event.detail.gain),
      capAfter: cEvents.map(event => event.detail.capAfter)
    };
  });

  expect(result.helperGain).toBe(3);
  expect(result.gains).toEqual([3, 3, 3, 1]);
  expect(result.capAfter).toEqual([3, 6, 9, 10]);
  expect(result.echoes).toBe(10);

  await attachCleanDiagnostics(testInfo, diagnostics);
});

test("Batch 14F5 MV000011 does not trigger itself after leaving the board", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14F5Scenario(page);

  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const watcher = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000011"]');
    const beforeAudit = auditCollectionBatch11lRuntime();
    const cEventStart = beforeAudit.batch11j.batch11i.batch11e.batch11c.events.length;
    const before = Number(player1.resourceState.souls || 0);
    await sendToCemetery(watcher, {suppressVengeance: true});
    await new Promise(resolve => setTimeout(resolve, 700));
    const afterWatcherDeath = Number(player1.resourceState.souls || 0);
    const ally = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000009"]');
    await sendToCemetery(ally, {suppressVengeance: true});
    await new Promise(resolve => setTimeout(resolve, 700));
    const afterAudit = auditCollectionBatch11lRuntime();
    const cEvents = afterAudit.batch11j.batch11i.batch11e.batch11c.events.slice(cEventStart).filter(event => event.type === "jeteur-destruction-echo");
    return {
      before,
      afterWatcherDeath,
      after: Number(player1.resourceState.souls || 0),
      watcherStillOnBoard: !!watcher?.isConnected,
      events: cEvents
    };
  });

  expect(result.watcherStillOnBoard).toBe(false);
  expect(result.afterWatcherDeath).toBe(result.before);
  expect(result.after).toBe(result.before);
  expect(result.events).toEqual([]);

  await attachCleanDiagnostics(testInfo, diagnostics);
});

test("Batch 14F5 PRST000014 highlights runtime spell text and regenerates after real avatar attack damage", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14F5Scenario(page);

  const highlight = await page.evaluate(() => {
    const handCard = qs(playerZoneSelector(player1, "hand"))?.querySelector('.hc[data-id="PRST000014"]');
    const zoomHost = document.createElement("div");
    zoomHost.innerHTML = renderZoomDescription(CARDS_DATA.PRST000014, facColor(CARDS_DATA.PRST000014.fac));
    return {
      handStrongTexts: Array.from(handCard?.querySelectorAll(".hc-desc-text strong.kv") || []).map(node => node.textContent.trim()),
      zoomStrongTexts: Array.from(zoomHost.querySelectorAll(".fz-desc-text strong.kv")).map(node => node.textContent.trim())
    };
  });
  for (const texts of [highlight.handStrongTexts, highlight.zoomStrongTexts]) {
    expect(texts).toContain("1 Écho");
    expect(texts).toContain("25");
    expect(texts).toContain("jusqu'à 5 Échos lors de votre prochain tour");
    expect(texts).toContain("5 PDV");
  }

  const regen = await page.evaluate(async () => {
    currentPlayer = player1.key;
    await playCard("PRST000014", null, {returnValidation: true});
    player1.resourceState.souls = 5;
    player1.resourceState.revision += 1;
    projectSoulState(player1);
    setAvatarHitPoints(player1, 30);
    const attacker = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="N000003"]');
    currentPlayer = player2.key;
    await attackAvatar(attacker, player1);
    await new Promise(resolve => setTimeout(resolve, 700));
    const afterAttack = {hp: avatarHitPoints(player1), pending: !!player1.batch14fBelialRegenPending, events: [...collectionBatch14FState().events]};
    collectionBatch14FState().forcedBelialChoice = {choice: "consume", amount: 2};
    player1.firstTurnStarted = true;
    player1.drawPile = ["MV000001"];
    turnSequence += 1;
    await runStartTurnPipeline(player1);
    return {
      afterAttack,
      trace: getLastStartTurnTrace()?.batch14fBelial || null,
      hp: avatarHitPoints(player1),
      echoes: Number(player1.resourceState.souls || 0),
      pending: !!player1.batch14fBelialRegenPending,
      events: [...collectionBatch14FState().events]
    };
  });

  expect(regen.afterAttack.hp).toBe(24);
  expect(regen.afterAttack.pending).toBe(true);
  expect(regen.afterAttack.events.some(event => event.type === "belial-regen-armed" && event.reason === "avatar-attack" && event.sourceCardId === "N000003")).toBe(true);
  expect(regen.trace).toMatchObject({choice: "consume", amount: 2, heal: 10, hpBefore: 24, hpAfter: 34});
  expect(regen.hp).toBe(34);
  expect(regen.echoes).toBe(3);
  expect(regen.pending).toBe(false);
  expect(regen.events.some(event => event.type === "belial-regen-consumed-echoes" && event.amount === 2 && event.heal === 10)).toBe(true);

  await attachCleanDiagnostics(testInfo, diagnostics);
});
