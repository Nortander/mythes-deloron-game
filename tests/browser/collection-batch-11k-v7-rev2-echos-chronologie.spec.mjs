import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-11k-v7-rev2-echos-chronologie.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch11k=" + Date.now());
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

test("Batch-11K scenarios are hidden, isolated to V7 open cards, and use the 11K panel", async ({page}, testInfo) => {
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
    if (audit.testCardId) expect(fixture.protectedScenarioSubjects).not.toContain(audit.testCardId);
  }

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Echo mutations pulse the RAME pile before the visible counter changes", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11k-jeteur-accounting");
  const jeteur = await page.evaluate(async () => {
    window.__batch11kOrder = [];
    const originalPulseAbility = pulseBatch03Ability;
    const originalPulsePile = pulseBatch11EchoPile;
    const originalProject = projectSoulState;
    pulseBatch03Ability = function(fc, reason, options) {
      if (fc?.dataset?.id === "MV000011") window.__batch11kOrder.push("source-pulse:" + reason);
      return originalPulseAbility.apply(this, arguments);
    };
    pulseBatch11EchoPile = function(player, reason) {
      window.__batch11kOrder.push("rame-pulse:" + reason + ":" + Number(playerState(player)?.resourceState?.souls || 0));
      return originalPulsePile.apply(this, arguments);
    };
    projectSoulState = function(player, preferredSlot) {
      window.__batch11kOrder.push("project:" + Number(playerState(player)?.resourceState?.souls || 0));
      return originalProject.apply(this, arguments);
    };
    const before = Number(player1.resourceState.souls || 0);
    const victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000005"]');
    await sendToCemetery(victim);
    const after = Number(player1.resourceState.souls || 0);
    pulseBatch03Ability = originalPulseAbility;
    pulseBatch11EchoPile = originalPulsePile;
    projectSoulState = originalProject;
    return {before, after, delta: after - before, order: window.__batch11kOrder, helperGain: batch11bEchoAmountFromPrintedCost("H000005"), victimCost: CARD_COST_DEFINITIONS.H000005.total};
  });
  expect(jeteur.victimCost).toBe(3);
  expect(jeteur.helperGain).toBe(1);
  expect(jeteur.delta).toBe(1);
  expect(jeteur.order).toEqual(expect.arrayContaining(["source-pulse:batch11c-echo-watch", "rame-pulse:gain:5", "project:6"]));
  expect(jeteur.order.indexOf("source-pulse:batch11c-echo-watch")).toBeLessThan(jeteur.order.indexOf("rame-pulse:gain:5"));
  expect(jeteur.order.indexOf("rame-pulse:gain:5")).toBeLessThan(jeteur.order.indexOf("project:6"));

  await openScenario(page, "collection-batch-11k-faucheur-accounting");
  const faucheur = await page.evaluate(async () => {
    window.__batch11kOrder = [];
    const originalPulseAbility = pulseBatch03Ability;
    const originalPulsePile = pulseBatch11EchoPile;
    const originalProject = projectSoulState;
    pulseBatch03Ability = function(fc, reason, options) {
      if (fc?.dataset?.id === "MV000009") window.__batch11kOrder.push("source-pulse:" + reason);
      return originalPulseAbility.apply(this, arguments);
    };
    pulseBatch11EchoPile = function(player, reason) {
      window.__batch11kOrder.push("rame-pulse:" + reason + ":" + Number(playerState(player)?.resourceState?.souls || 0));
      return originalPulsePile.apply(this, arguments);
    };
    projectSoulState = function(player, preferredSlot) {
      window.__batch11kOrder.push("project:" + Number(playerState(player)?.resourceState?.souls || 0));
      return originalProject.apply(this, arguments);
    };
    const before = Number(player1.resourceState.souls || 0);
    const killer = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000009"]');
    const victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000001"]');
    victim._killer = killer;
    await sendToCemetery(victim, {killer});
    const after = Number(player1.resourceState.souls || 0);
    pulseBatch03Ability = originalPulseAbility;
    pulseBatch11EchoPile = originalPulsePile;
    projectSoulState = originalProject;
    return {before, after, delta: after - before, order: window.__batch11kOrder, helperGain: batch11bEchoAmountFromPrintedCost("H000001")};
  });
  expect(faucheur.helperGain).toBe(1);
  expect(faucheur.delta).toBe(1);
  expect(faucheur.order.indexOf("source-pulse:faucheur-echo-harvest")).toBeGreaterThanOrEqual(0);
  expect(faucheur.order.indexOf("source-pulse:faucheur-echo-harvest")).toBeLessThan(faucheur.order.indexOf("rame-pulse:gain:5"));
  expect(faucheur.order.indexOf("rame-pulse:gain:5")).toBeLessThan(faucheur.order.indexOf("project:6"));

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Necropole releases both supply slots and fills the board with Esprits deranges on any removal", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11k-necropole-dedicated");
  const audit = await page.evaluate(async () => {
    const row = qs(playerZoneSelector(player1, "appro"));
    const slot = row?.querySelector(".slot-appro");
    const play = await playCard("R000027", slot, {returnValidation: true});
    const before = {
      footprint: row?.querySelectorAll("[data-batch11a-necropole-footprint]").length || 0,
      slots: row?.querySelectorAll(".slot-appro").length || 0,
      blockedText: row?.querySelector("[data-batch11a-necropole-footprint]")?.textContent || "",
      freeForEchoPile: !!row?.querySelector("[data-batch11a-necropole-footprint][data-soul]")
    };
    const necropole = row?.querySelector('.fc[data-id="R000027"]');
    await sendToCemetery(necropole, {forceCemetery: true});
    const runtime = auditCollectionBatch11jRuntime();
    const p1 = runtime.batch11i.batch11e.batch11a.players.find(player => player.playerId === "player1") || {};
    return {
      play,
      before,
      after: {
        footprint: row?.querySelectorAll("[data-batch11a-necropole-footprint]").length || 0,
        slots: row?.querySelectorAll(".slot-appro").length || 0,
        servants: (p1.servants || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean),
        supplies: p1.supplies || []
      },
      events: runtime.batch11i.batch11e.batch11a.events
    };
  });
  expect(audit.play.success).toBe(true);
  expect(audit.before.footprint).toBe(1);
  expect(audit.before.blockedText).not.toContain("Nécropole");
  expect(audit.before.freeForEchoPile).toBe(false);
  expect(audit.after.footprint).toBe(0);
  expect(audit.after.slots).toBeGreaterThanOrEqual(audit.before.slots + 1);
  expect(audit.after.servants.filter(id => id === "MV000025").length).toBeGreaterThanOrEqual(1);
  expect(audit.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type: "necropole-footprint-released"}),
    expect.objectContaining({type: "necropole-removed-fill-board"})
  ]));

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Open V7 effects keep dedicated sequencing for Morghast, Esprit, Mur, Recyclage and Rituel", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11k-esprit-vengeance");
  const esprit = await page.evaluate(async () => {
    window.__batch11kOrder = [];
    const originalPulseAbility = pulseBatch03Ability;
    const originalPulsePile = pulseBatch11EchoPile;
    const originalProject = projectSoulState;
    pulseBatch03Ability = function(fc, reason, options) { if (fc?.dataset?.id === "MV000025") window.__batch11kOrder.push("source-pulse:" + reason); return originalPulseAbility.apply(this, arguments); };
    pulseBatch11EchoPile = function(player, reason) { window.__batch11kOrder.push("rame-pulse:" + reason + ":" + Number(playerState(player)?.resourceState?.souls || 0)); return originalPulsePile.apply(this, arguments); };
    projectSoulState = function(player, preferredSlot) { window.__batch11kOrder.push("project:" + Number(playerState(player)?.resourceState?.souls || 0)); return originalProject.apply(this, arguments); };
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000025"]');
    const before = Number(player1.resourceState.souls || 0);
    await sendToCemetery(source);
    const after = Number(player1.resourceState.souls || 0);
    pulseBatch03Ability = originalPulseAbility;
    pulseBatch11EchoPile = originalPulsePile;
    projectSoulState = originalProject;
    return {delta: after - before, order: window.__batch11kOrder};
  });
  expect(esprit.delta).toBe(1);
  expect(esprit.order.indexOf("source-pulse:vengeance")).toBeLessThan(esprit.order.indexOf("rame-pulse:gain:5"));
  expect(esprit.order.indexOf("rame-pulse:gain:5")).toBeLessThan(esprit.order.indexOf("project:6"));

  await openScenario(page, "collection-batch-11k-mur-non-mort-accounting");
  const mur = await page.evaluate(async () => {
    window.__batch11kOrder = [];
    const originalPulseAbility = pulseBatch03Ability;
    const originalPulsePile = pulseBatch11EchoPile;
    const originalProject = projectSoulState;
    pulseBatch03Ability = function(fc, reason, options) { if (fc?.dataset?.id === "MV000030") window.__batch11kOrder.push("source-pulse:" + reason); return originalPulseAbility.apply(this, arguments); };
    pulseBatch11EchoPile = function(player, reason) { window.__batch11kOrder.push("rame-pulse:" + reason + ":" + Number(playerState(player)?.resourceState?.souls || 0)); return originalPulsePile.apply(this, arguments); };
    projectSoulState = function(player, preferredSlot) { window.__batch11kOrder.push("project:" + Number(playerState(player)?.resourceState?.souls || 0)); return originalProject.apply(this, arguments); };
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000030"]');
    const before = Number(player1.resourceState.souls || 0);
    await applyDamage(source, 5, {sourceCardId:"TEST"});
    const after = Number(player1.resourceState.souls || 0);
    pulseBatch03Ability = originalPulseAbility;
    pulseBatch11EchoPile = originalPulsePile;
    projectSoulState = originalProject;
    return {delta: after - before, order: window.__batch11kOrder};
  });
  expect(mur.delta).toBe(2);
  expect(mur.order.indexOf("source-pulse:damage-echo")).toBeLessThan(mur.order.indexOf("rame-pulse:gain:20"));
  expect(mur.order.indexOf("rame-pulse:gain:20")).toBeLessThan(mur.order.indexOf("project:22"));

  await openScenario(page, "collection-batch-11k-morghast-sequencing");
  const morghast = await page.evaluate(async () => {
    window.__batch11kOrder = [];
    const originalPulseAbility = pulseBatch03Ability;
    const originalConsume = consumeSouls;
    const originalProject = projectSoulState;
    pulseBatch03Ability = function(fc, reason, options) {
      if (fc?.dataset?.id === "MV000024") window.__batch11kOrder.push("source-pulse:" + reason);
      if (fc?.dataset?.id === "MV000001" && reason === "morghast-vengeance-summon") window.__batch11kOrder.push("summon-pulse");
      return originalPulseAbility.apply(this, arguments);
    };
    consumeSouls = function(player, amount, reason) { window.__batch11kOrder.push("consume-call:" + reason); return originalConsume.apply(this, arguments); };
    projectSoulState = function(player, preferredSlot) { window.__batch11kOrder.push("project:" + Number(playerState(player)?.resourceState?.souls || 0)); return originalProject.apply(this, arguments); };
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000024"]');
    const before = Number(player1.resourceState.souls || 0);
    await sendToCemetery(source);
    const after = Number(player1.resourceState.souls || 0);
    pulseBatch03Ability = originalPulseAbility;
    consumeSouls = originalConsume;
    projectSoulState = originalProject;
    return {before, after, order: window.__batch11kOrder};
  });
  expect(morghast.order.indexOf("source-pulse:vengeance")).toBeGreaterThanOrEqual(0);
  expect(morghast.order.indexOf("summon-pulse")).toBeGreaterThan(morghast.order.indexOf("source-pulse:vengeance"));
  expect(morghast.order.indexOf("consume-call:morghast-vengeance")).toBeGreaterThan(morghast.order.lastIndexOf("summon-pulse"));
  expect(morghast.after).toBeLessThan(morghast.before);

  await openScenario(page, "collection-batch-11k-recyclage");
  const recyclage = await page.evaluate(async () => {
    await playCard("S000044", null, {returnValidation: true});
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    await playCard("MV000001", slot, {returnValidation: true});
    const purpleImmediately = !!qs(playerZoneSelector(player1, "hand"))?.querySelector(".hc-batch11-undead-transfer");
    await new Promise(resolve => setTimeout(resolve, 1500));
    const audit = auditCollectionBatch11jRuntime();
    const handNode = qs(playerZoneSelector(player1, "hand"))?.querySelector('.hc[data-id="MV000002"],.hc[data-id="H000001"],.hc[data-id="MV000025"]');
    return {
      purpleImmediately,
      lingeringPurple: !!handNode?.classList.contains("hc-batch11-undead-transfer"),
      lingeringGold: !!handNode?.classList.contains("hc-batch03-ianna-drawn"),
      flights: audit.events.filter(event => event.type === "zone-flight").map(event => event.detail)
    };
  });
  expect(recyclage.purpleImmediately).toBe(true);
  expect(recyclage.lingeringPurple).toBe(false);
  expect(recyclage.lingeringGold).toBe(false);
  expect(recyclage.flights).toEqual(expect.arrayContaining([
    expect.objectContaining({reason:"recyclage-deck-to-hand", fromPlayer:"player1", fromZone:"deck", toPlayer:"player1", toZone:"hand"}),
    expect.objectContaining({reason:"recyclage-grave-to-deck", fromPlayer:"player1", fromZone:"graveyard", toPlayer:"player1", toZone:"deck"})
  ]));

  await openScenario(page, "collection-batch-11k-rituel-occulte");
  const rituel = await page.evaluate(async () => {
    const start = performance.now();
    await playCard("S000051", null, {returnValidation: true});
    const duration = performance.now() - start;
    const audit = auditCollectionBatch11jRuntime();
    const p1 = audit.batch11i.batch11e.batch11a.players.find(player => player.playerId === "player1") || {};
    const p2 = audit.batch11i.batch11e.batch11a.players.find(player => player.playerId === "player2") || {};
    return {
      duration,
      p1Graveyard: (p1.graveyard || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean),
      p2Graveyard: (p2.graveyard || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean),
      flights: audit.events.filter(event => event.type === "zone-flight" && event.detail?.reason === "rituel-occulte-grave-transfer").map(event => event.detail)
    };
  });
  expect(rituel.duration).toBeGreaterThanOrEqual(1400);
  expect(rituel.p1Graveyard).toEqual(fixture.rituelFinalGraveyard);
  expect(rituel.p2Graveyard).toEqual([]);
  expect(rituel.flights).toHaveLength(3);

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
