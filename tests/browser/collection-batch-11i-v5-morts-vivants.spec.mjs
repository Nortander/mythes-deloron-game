import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-11i-v5-morts-vivants.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch11i=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect(page.getByTestId("test-resource-panel")).toContainText(fixture.expected.panelTitle);
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(150);
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message =>
    !/Failed to load resource: the server responded with a status of 404/i.test(message)
    && !/Failed to load resource: net::ERR_(NETWORK_CHANGED|NAME_NOT_RESOLVED)/i.test(message)
  );
}

function ids(entries) {
  return (entries || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean);
}

test("Batch-11I scenarios stay hidden and V5 text fragments are charted", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    const audit = await page.evaluate(() => ({
      scenarioId: selectedScenarioId(),
      publicOptionCount: document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length,
      panelTitle: document.querySelector('[data-testid="test-resource-panel"] h2')?.textContent || ""
    }));

    expect(audit.publicOptionCount, scenario + " must remain hidden").toBe(fixture.expected.hiddenPublicOptionCount);
    expect(audit.panelTitle).toBe(fixture.expected.panelTitle);
  }

  const textAudit = await page.evaluate((expectations) => expectations.map(entry => {
    const data = CARDS_DATA[entry.id] || {};
    const text = String(data.cap || "") + "\n" + String(data.detail || "");
    return {id: entry.id, text};
  }), fixture.highlightExpectations);

  for (const expected of fixture.highlightExpectations) {
    const card = textAudit.find(entry => entry.id === expected.id);
    expect(card, expected.id).toBeTruthy();
    for (const fragment of expected.fragments) {
      expect(card.text, expected.id + " fragment " + fragment).toContain(fragment);
    }
  }

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Necropole releases both supply slots and fills the board when its owner removes it", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11i-necropole-cleanup");

  const result = await page.evaluate(async () => {
    const toIds = entries => (entries || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean);
    const getPlayerAudit = (audit, playerId) => audit?.batch11e?.batch11a?.players?.find(player => player.playerId === playerId) || {};
    const row = qs(playerZoneSelector(player1, "appro"));
    const slot = row?.querySelector(".slot-appro");
    const play = await playCard("R000027", slot, {returnValidation: true});
    const footprintBefore = row?.querySelectorAll("[data-batch11a-necropole-footprint]").length || 0;
    const necropole = row?.querySelector('.fc[data-id="R000027"]');
    await sendToCemetery(necropole, {forceCemetery: true});
    const audit = auditCollectionBatch11iRuntime();
    const p1 = getPlayerAudit(audit, "player1");
    return {
      play,
      footprintBefore,
      footprintAfter: row?.querySelectorAll("[data-batch11a-necropole-footprint]").length || 0,
      supplySlotsAfter: row?.querySelectorAll(".slot-appro").length || 0,
      servants: toIds(p1.servants),
      events: audit.batch11e.batch11a.events
    };
  });

  expect(result.play.success).toBe(true);
  expect(result.footprintBefore).toBe(1);
  expect(result.footprintAfter).toBe(0);
  expect(result.supplySlotsAfter).toBeGreaterThanOrEqual(5);
  expect(result.servants.filter(id => id === "MV000025").length).toBeGreaterThanOrEqual(1);
  expect(result.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type: "necropole-footprint-released"}),
    expect.objectContaining({type: "necropole-removed-fill-board"})
  ]));

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Hokhan avatar starts with a visible RAME pile and silently returns undead to the deck", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11i-hokhan-avatar");

  const result = await page.evaluate(async (forbiddenMessage) => {
    const toIds = entries => (entries || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean);
    const getPlayerAudit = (audit, playerId) => audit?.batch11e?.batch11a?.players?.find(player => player.playerId === playerId) || {};
    const beforeText = document.querySelector("#notif")?.textContent || "";
    const undead = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000001"]');
    await sendToCemetery(undead);
    await new Promise(resolve => setTimeout(resolve, 120));
    const audit = auditCollectionBatch11iRuntime();
    const p1 = getPlayerAudit(audit, "player1");
    const message = document.querySelector("#notif")?.textContent || "";
    return {
      souls: Number(player1.resourceState.souls || 0),
      echoPile: audit.echoPiles.player1,
      deck: toIds(p1.deck),
      graveyard: toIds(p1.graveyard),
      messageChangedToForbidden: message.includes(forbiddenMessage) && message !== beforeText,
      events: audit.batch11e.events
    };
  }, fixture.expected.forbiddenHokhanAvatarMessage);

  expect(result.souls).toBe(5);
  expect(result.echoPile).toBe("5");
  expect(result.deck).toContain("MV000001");
  expect(result.graveyard).not.toContain("MV000001");
  expect(result.messageChangedToForbidden).toBe(false);
  expect(result.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type: "zone-flight", detail: expect.objectContaining({reason: "hokhan-avatar-graveyard-to-deck"})}),
    expect.objectContaining({type: "hokhan-avatar-graveyard-to-deck"})
  ]));

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Hokhan pseudo-avatar animates Forgeron once and then skips duplicate hand movement", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11i-hokhan-pseudo-forgeron");

  const result = await page.evaluate(async () => {
    const toIds = entries => (entries || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean);
    const getPlayerAudit = (audit, playerId) => audit?.batch11e?.batch11a?.players?.find(player => player.playerId === playerId) || {};
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    const playPseudo = await playCard("AVS000008", slot, {returnValidation: true});
    const pseudo = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="AVS000008"]');
    const firstAudit = auditCollectionBatch11iRuntime();
    const firstFlights = firstAudit.batch11e.events.filter(event => event.type === "zone-flight" && event.detail?.reason === "hokhan-forgeron-to-hand");
    const initiativeAgain = await resolveBatch11eHokhanInitiative(player1, pseudo);
    const secondAudit = auditCollectionBatch11iRuntime();
    const secondFlights = secondAudit.batch11e.events.filter(event => event.type === "zone-flight" && event.detail?.reason === "hokhan-forgeron-to-hand");
    const p1 = getPlayerAudit(secondAudit, "player1");
    return {
      playPseudo,
      initiativeAgain,
      hand: toIds(p1.hand),
      firstFlightCount: firstFlights.length,
      secondFlightCount: secondFlights.length
    };
  });

  expect(result.playPseudo.success).toBe(true);
  expect(result.hand).toContain("MV000019");
  expect(result.firstFlightCount).toBe(1);
  expect(result.secondFlightCount).toBe(1);
  expect(result.initiativeAgain.forgeron.reason).toBe("already-in-hand");

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Ame explosive loses life through the real start-turn pipeline", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11i-arachnee-ame-mur");

  const result = await page.evaluate(async () => {
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000028"]');
    const pdvBefore = Number(source?.dataset.pdv || 0);
    await runStartTurnPipeline(player1);
    const pdvAfter = Number(source?.dataset.pdv || 0);
    const audit = auditCollectionBatch11iRuntime();
    return {pdvBefore, pdvAfter, events: audit.batch11e.events};
  });

  expect(result.pdvAfter).toBe(result.pdvBefore - 1);
  expect(result.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type: "ame-explosive-start-turn"})
  ]));

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Retours, Recyclage, Rituel and Mur non-mort expose V5 messages and zone flights", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11i-sacrifice-revenants");
  const revenants = await page.evaluate(async () => {
    await playCard("S000052", null, {returnValidation: true});
    return document.querySelector("#notif")?.textContent || "";
  });
  expect(revenants).toMatch(new RegExp(fixture.expected.retourRevenantsMessagePattern));
  expect(revenants).not.toContain(fixture.expected.forbiddenRetourRevenantsText);

  await openScenario(page, "collection-batch-11i-recyclage-rituel");
  const recyclage = await page.evaluate(async () => {
    await playCard("S000044", null, {returnValidation: true});
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    await playCard("MV000001", slot, {returnValidation: true});
    await new Promise(resolve => setTimeout(resolve, 800));
    return auditCollectionBatch11iRuntime().batch11e.events;
  });
  const recyclageReasons = recyclage.filter(event => event.type === "zone-flight").map(event => event.detail?.reason);
  expect(recyclageReasons).toEqual(expect.arrayContaining(["recyclage-deck-to-hand", "recyclage-grave-to-deck"]));
  expect(recyclageReasons.indexOf("recyclage-deck-to-hand")).toBeLessThan(recyclageReasons.indexOf("recyclage-grave-to-deck"));

  await openScenario(page, "collection-batch-11i-recyclage-rituel");
  const rituel = await page.evaluate(async () => {
    const getPlayerAudit = (audit, playerId) => audit?.batch11e?.batch11a?.players?.find(player => player.playerId === playerId) || {};
    player1.hand = ["S000051"];
    player1.graveyard = ["MV000001"];
    player2.graveyard = ["H000001", "R000001", "H000005"];
    refreshHand(player1);
    refreshCemeteryVisual(player1);
    refreshCemeteryVisual(player2);
    const start = performance.now();
    await playCard("S000051", null, {returnValidation: true});
    const duration = performance.now() - start;
    const audit = auditCollectionBatch11iRuntime();
    const p1 = getPlayerAudit(audit, "player1");
    const p2 = getPlayerAudit(audit, "player2");
    return {duration, p1, p2, events: audit.batch11e.events};
  });
  expect(ids(rituel.p2.graveyard)).toEqual([]);
  expect(ids(rituel.p1.graveyard)).toEqual(["MV000001", "H000001", "R000001", "H000005", "S000051"]);
  expect(rituel.duration).toBeGreaterThanOrEqual(1400);
  expect(rituel.events.filter(event => event.type === "zone-flight" && event.detail?.reason === "rituel-occulte-grave-transfer")).toHaveLength(3);

  await openScenario(page, "collection-batch-11i-arachnee-ame-mur");
  const mur = await page.evaluate(async () => {
    const toIds = entries => (entries || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean);
    const getPlayerAudit = (audit, playerId) => audit?.batch11e?.batch11a?.players?.find(player => player.playerId === playerId) || {};
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000030"]');
    await sendToCemetery(source);
    const audit = auditCollectionBatch11iRuntime();
    const p1 = getPlayerAudit(audit, "player1");
    return {hand: toIds(p1.hand), events: audit.batch11e.events};
  });
  expect(mur.hand).toEqual(expect.arrayContaining(["MV000022", "MV000001"]));
  expect(mur.events.filter(event => event.type === "zone-flight" && event.detail?.reason === "mur-non-mort-to-hand")).toHaveLength(3);

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Jeteur and Morghast isolated scenarios preserve exact Echo accounting", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11i-jeteur-accounting");
  const jeteur = await page.evaluate(async () => {
    const before = Number(player1.resourceState.souls || 0);
    const victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000001"]');
    await sendToCemetery(victim);
    const after = Number(player1.resourceState.souls || 0);
    const audit = auditCollectionBatch11iRuntime();
    return {before, after, delta: after - before, events: audit.batch11e.batch11c.events};
  });
  expect(jeteur.delta).toBe(1);
  expect(jeteur.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type: "jeteur-destruction-echo", detail: expect.objectContaining({gain: 1})})
  ]));

  await openScenario(page, "collection-batch-11i-morghast-accounting");
  const morghast = await page.evaluate(async () => {
    const toIds = entries => (entries || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean);
    const getPlayerAudit = (audit, playerId) => audit?.batch11e?.batch11a?.players?.find(player => player.playerId === playerId) || {};
    const before = Number(player1.resourceState.souls || 0);
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000024"]');
    await sendToCemetery(source);
    const after = Number(player1.resourceState.souls || 0);
    const audit = auditCollectionBatch11iRuntime();
    const p1 = getPlayerAudit(audit, "player1");
    const event = audit.batch11e.batch11c.events.find(item => item.type === "morghast-vengeance-fill-board");
    const cendreuxCount = toIds(p1.servants).filter(id => id === "MV000001").length;
    return {before, after, spent: before - after, summonCount: event?.detail?.summonCount || 0, cendreuxCount, event};
  });
  expect(morghast.event).toBeTruthy();
  expect(morghast.spent).toBe(morghast.summonCount);
  expect(morghast.cendreuxCount).toBe(morghast.summonCount);

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
