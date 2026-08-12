import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-11h-v4-necropole-scenarios.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch11h=" + Date.now());
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

function playerAudit(audit, playerId) {
  const batch11aPlayers = audit?.batch11a?.players || audit?.players || [];
  return batch11aPlayers.find(player => player.playerId === playerId) || {};
}

function zoneIds(entries) {
  return (entries || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean);
}

test("Batch-11H scenarios are hidden and expose the dedicated V4 panel", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  const forbidden = new RegExp(fixture.expected.forbiddenPublicIdPattern, "i");

  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    const audit = await page.evaluate((ids) => ({
      scenarioId: selectedScenarioId(),
      publicOptionCount: document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length,
      panelTitle: document.querySelector('[data-testid="test-resource-panel"] h2')?.textContent || "",
      cards: ids.map(id => {
        const data = CARDS_DATA[id] || {};
        const publicText = formatPlayerFacingCardText(String(data.cap || "") + " " + String(data.detail || "") + " " + String(data.cond || ""));
        return {id, exists: !!CARDS_DATA[id], publicText};
      })
    }), fixture.cards);

    expect(audit.publicOptionCount, scenario + " must remain hidden").toBe(0);
    expect(audit.panelTitle).toBe(fixture.expected.panelTitle);
    for (const card of audit.cards) {
      expect(card.exists, card.id).toBe(true);
      expect(card.publicText, card.id + " public text").not.toMatch(forbidden);
    }
  }

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Necropole keeps its second slot blocked until removal, then frees it and fills the board", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11h-necropole-dedicated");

  const result = await page.evaluate(async () => {
    const ids = entries => (entries || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean);
    const row = qs(playerZoneSelector(player1, "appro"));
    const supplySlot = row?.querySelector(".slot-appro");
    const play = await playCard("R000027", supplySlot, {returnValidation: true});
    const footprint = row?.querySelector("[data-batch11a-necropole-footprint]");
    const footprintBeforeEcho = {
      exists: !!footprint,
      text: footprint?.innerText || "",
      className: footprint?.className || "",
      isSupplySlot: footprint?.classList.contains("slot-appro") || false
    };
    const soulsBeforeGain = Number(player1.resourceState.souls || 0);
    const manualGain = addSoulToAppro(player1, 1);
    const footprintAfterEcho = !!row?.querySelector("[data-batch11a-necropole-footprint]");
    player1.batch11aNecropoleDestroyedSinceLastTurn = 3;
    const startTurn = await resolveBatch11aNecropoleStartTurn(player1);
    const necropole = row?.querySelector('.fc[data-id="R000027"]');
    await sendToCemetery(necropole, {forceCemetery: true});
    const after = auditCollectionBatch11eRuntime();
    const p1 = after.batch11a.players.find(player => player.playerId === "player1");
    return {
      play,
      footprintBeforeEcho,
      soulsBeforeGain,
      manualGain,
      footprintAfterEcho,
      startTurn,
      footprintAfterRemoval: !!row?.querySelector("[data-batch11a-necropole-footprint]"),
      remainingSupplySlots: row?.querySelectorAll(".slot-appro").length || 0,
      servants: ids(p1.servants),
      events: after.batch11a.events
    };
  });

  expect(result.play.success).toBe(true);
  expect(result.footprintBeforeEcho.exists).toBe(true);
  expect(result.footprintBeforeEcho.className).toContain(fixture.expected.necropoleFootprintClass);
  expect(result.footprintBeforeEcho.text).toBe("");
  expect(result.footprintBeforeEcho.isSupplySlot).toBe(false);
  expect(result.manualGain.success).toBe(true);
  expect(result.footprintAfterEcho).toBe(true);
  expect(result.startTurn.success).toBe(true);
  expect(result.startTurn.amount).toBeGreaterThanOrEqual(5);
  expect(result.footprintAfterRemoval).toBe(false);
  expect(result.remainingSupplySlots).toBeGreaterThanOrEqual(1);
  expect(result.servants).toContain("MV000025");
  expect(result.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type: "necropole-footprint-applied"}),
    expect.objectContaining({type: "necropole-start-turn"}),
    expect.objectContaining({type: "necropole-footprint-released"}),
    expect.objectContaining({type: "necropole-removed-fill-board"})
  ]));

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Hokhan main avatar and pseudo-avatar keep their distinct runtime contracts", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11h-hokhan-avatar-pseudo");

  const result = await page.evaluate(async () => {
    const ids = entries => (entries || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean);
    const undead = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000001"]');
    await sendToCemetery(undead);
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    const playPseudo = await playCard("AVS000008", slot, {returnValidation: true});
    const pseudo = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="AVS000008"]');
    const firstAudit = auditCollectionBatch11eRuntime();
    const firstFlights = firstAudit.events.filter(event => event.type === "zone-flight" && event.detail?.reason === "hokhan-forgeron-to-hand");
    const initiativeAgain = await resolveBatch11eHokhanInitiative(player1, pseudo);
    const secondAudit = auditCollectionBatch11eRuntime();
    const secondFlights = secondAudit.events.filter(event => event.type === "zone-flight" && event.detail?.reason === "hokhan-forgeron-to-hand");
    const p1 = secondAudit.batch11a.players.find(player => player.playerId === "player1");
    return {
      portrait: player1.portrait,
      playPseudo,
      initiativeAgain,
      deck: ids(p1.deck),
      graveyard: ids(p1.graveyard),
      hand: ids(p1.hand),
      firstFlightCount: firstFlights.length,
      secondFlightCount: secondFlights.length
    };
  });

  expect(result.portrait).toBe(fixture.expected.hokhanPortrait);
  expect(result.deck).toContain("MV000001");
  expect(result.graveyard).not.toContain("MV000001");
  expect(result.playPseudo.success).toBe(true);
  expect(result.hand).toContain("MV000019");
  expect(result.firstFlightCount).toBe(1);
  expect(result.secondFlightCount).toBe(1);
  expect(result.initiativeAgain.forgeron.reason).toBe("already-in-hand");

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Faucheur, Spectre and Gueule expose their V4 messages and Vengeance feedback", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11h-faucheur-spectre-gueule");
  const faucheur = await page.evaluate(async () => {
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000009"]');
    const before = Number(player1.resourceState.souls || 0);
    await sendToCemetery(source);
    const after = auditCollectionBatch11eRuntime();
    return {
      soulsBefore: before,
      soulsAfter: Number(player1.resourceState.souls || 0),
      className: source?.className || "",
      events: after.batch11b.events
    };
  });
  expect(faucheur.soulsAfter - faucheur.soulsBefore).toBeGreaterThanOrEqual(2);
  expect(faucheur.className).toContain("batch03-ability-pulse-move");
  expect(faucheur.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type: "faucheur-vengeance-own-cost-echo"})
  ]));

  await openScenario(page, "collection-batch-11h-faucheur-spectre-gueule");
  const spectre = await page.evaluate(async () => {
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    await playCard("MV000002", slot, {returnValidation: true});
    return document.querySelector("#notif")?.textContent || "";
  });
  expect(spectre).toBe(fixture.expected.spectreMessage);

  await openScenario(page, "collection-batch-11h-faucheur-spectre-gueule");
  const gueule = await page.evaluate(async () => {
    const ids = entries => (entries || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean);
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000003"]');
    await sendToCemetery(source);
    const audit = auditCollectionBatch11eRuntime();
    const p1 = audit.batch11a.players.find(player => player.playerId === "player1");
    return {
      message: document.querySelector("#notif")?.textContent || "",
      sourceConnected: !!document.querySelector('.fc[data-id="MV000003"]'),
      graveyard: ids(p1.graveyard),
      events: audit.events
    };
  });
  expect(gueule.message).toBe(fixture.expected.gueuleMessage);
  expect(gueule.sourceConnected).toBe(true);
  expect(gueule.graveyard).not.toContain("MV000003");
  expect(gueule.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type: "gueule-prevented-destruction"})
  ]));

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Banshee, Gardien, Morghast and Ame explosive keep their V4 trigger timing", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11h-amalgames-banshee-gardien");
  const bansheeGardien = await page.evaluate(async () => {
    const banshee = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000015"]');
    const victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000001"]');
    await resolveBatch11bInitiative("MV000015", player1, {sourceFC: banshee, selectedTargetIds: [victim.dataset.instance]});
    const initiativeMessage = document.querySelector("#notif")?.textContent || "";
    if (banshee?.isConnected) await sendToCemetery(banshee);
    const vengeanceMessage = document.querySelector("#notif")?.textContent || "";
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    await playCard("MV000029", slot, {returnValidation: true});
    const gardienMessage = document.querySelector("#notif")?.textContent || "";
    const soulsBeforeEnd = Number(player1.resourceState.souls || 0);
    await resolveBatch11eEndTurnEffects(player1);
    const soulsAfterEnd = Number(player1.resourceState.souls || 0);
    return {initiativeMessage, vengeanceMessage, gardienMessage, soulsBeforeEnd, soulsAfterEnd, events: auditCollectionBatch11eRuntime().batch11b.events.concat(auditCollectionBatch11eRuntime().events)};
  });
  expect(bansheeGardien.initiativeMessage).toBe(fixture.expected.bansheeInitiativeMessage);
  expect(bansheeGardien.vengeanceMessage).toBe(fixture.expected.bansheeVengeanceMessage);
  expect(bansheeGardien.gardienMessage).toBe(fixture.expected.gardienInitiativeMessage);
  expect(bansheeGardien.soulsAfterEnd - bansheeGardien.soulsBeforeEnd).toBe(1);

  await openScenario(page, "collection-batch-11h-jeteur-morghast");
  const morghast = await page.evaluate(async () => {
    const ids = entries => (entries || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean);
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000024"]');
    await sendToCemetery(source);
    const audit = auditCollectionBatch11eRuntime();
    const p1 = audit.batch11c.players.find(player => player.playerId === "player1");
    return {
      cendreux: ids(p1.servants).filter(id => id === "MV000001").length,
      events: audit.batch11c.events
    };
  });
  expect(morghast.cendreux).toBeGreaterThanOrEqual(1);
  expect(morghast.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type: "morghast-vengeance-fill-board"})
  ]));

  await openScenario(page, "collection-batch-11h-arachnee-ame-mur");
  const ame = await page.evaluate(async () => {
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000028"]');
    const pdvBefore = Number(source?.dataset.pdv || 0);
    await resolveBatch11eStartTurnEffects(player1);
    const pdvAfter = Number(source?.dataset.pdv || 0);
    return {pdvBefore, pdvAfter, events: auditCollectionBatch11eRuntime().events};
  });
  expect(ame.pdvAfter).toBe(ame.pdvBefore - 1);
  expect(ame.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type: "ame-explosive-start-turn"})
  ]));

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Revenants, Recyclage and Rituel occulte expose complete zone moves", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11h-sorts-sacrifice-revenants");
  const revenants = await page.evaluate(async () => {
    const ids = entries => (entries || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean);
    await playCard("S000052", null, {returnValidation: true});
    const audit = auditCollectionBatch11eRuntime();
    const p1 = audit.batch11c.players.find(player => player.playerId === "player1");
    return {
      message: document.querySelector("#notif")?.textContent || "",
      servants: ids(p1.servants),
      events: audit.batch11c.events
    };
  });
  expect(revenants.message).toMatch(new RegExp(fixture.expected.retourRevenantsMessagePattern));
  expect(revenants.servants.filter(id => id.startsWith("MV")).length).toBeGreaterThanOrEqual(1);
  expect(revenants.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type: "retour-des-revenants"})
  ]));

  await openScenario(page, "collection-batch-11h-sorts-eclipse-recyclage-rituel");
  const recyclage = await page.evaluate(async () => {
    await playCard("S000044", null, {returnValidation: true});
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    await playCard("MV000001", slot, {returnValidation: true});
    await new Promise(resolve => setTimeout(resolve, 700));
    return auditCollectionBatch11eRuntime().events;
  });
  const flightReasons = recyclage.filter(event => event.type === "zone-flight").map(event => event.detail?.reason);
  expect(flightReasons).toEqual(expect.arrayContaining(["recyclage-deck-to-hand", "recyclage-grave-to-deck"]));
  expect(flightReasons.indexOf("recyclage-deck-to-hand")).toBeLessThan(flightReasons.indexOf("recyclage-grave-to-deck"));

  await openScenario(page, "collection-batch-11h-sorts-eclipse-recyclage-rituel");
  const rituel = await page.evaluate(async () => {
    player1.hand = ["S000051"];
    player1.graveyard = ["MV000001"];
    player2.graveyard = ["H000001", "R000001", "H000005"];
    refreshHand(player1);
    refreshCemeteryVisual(player1);
    refreshCemeteryVisual(player2);
    await playCard("S000051", null, {returnValidation: true});
    await new Promise(resolve => setTimeout(resolve, 150));
    const audit = auditCollectionBatch11eRuntime();
    const p1 = audit.batch11a.players.find(player => player.playerId === "player1");
    const p2 = audit.batch11a.players.find(player => player.playerId === "player2");
    return {p1, p2, events: audit.events};
  });
  expect(zoneIds(rituel.p2.graveyard)).toEqual([]);
  expect(zoneIds(rituel.p1.graveyard)).toEqual(["MV000001", "H000001", "R000001", "H000005", "S000051"]);
  expect(rituel.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type: "zone-flight", detail: expect.objectContaining({reason: "rituel-occulte-grave-transfer"})})
  ]));

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
