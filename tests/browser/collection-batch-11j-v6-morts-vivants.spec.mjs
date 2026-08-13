import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-11j-v6-morts-vivants.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch11j=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect(page.getByTestId("test-resource-panel")).toContainText(fixture.panelTitle);
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
  return (entries || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean);
}

test("Batch-11J scenarios stay hidden and V6 text fragments are aligned", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    const audit = await page.evaluate(() => ({
      scenarioId: selectedScenarioId(),
      publicOptionCount: document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length,
      panelTitle: document.querySelector('[data-testid="test-resource-panel"] h2')?.textContent || ""
    }));

    expect(audit.publicOptionCount, scenario + " must remain hidden").toBe(fixture.hiddenPublicOptionCount);
    expect(audit.panelTitle).toBe(fixture.panelTitle);
  }

  const textAudit = await page.evaluate(() => {
    const esprit = CARDS_DATA.MV000025 || {};
    return {
      espritText: String(esprit.cap || "") + "\n" + String(esprit.detail || ""),
      protectedCardsPresent: ["R000021","AVS000008","MV000002","MV000003","MV000015","MV000029","MV000008","S000041","S000052","S000042","MV000022"].filter(id => !!CARDS_DATA[id])
    };
  });

  expect(textAudit.espritText).toContain("*1* Écho");
  expect(textAudit.protectedCardsPresent).toEqual(fixture.protectedCards);

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Necropole releases its extra supply slot after owner and opponent removals", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  async function playAndRemove({opponentRemoval}) {
    return page.evaluate(async (opponentRemoval) => {
      const row = qs(playerZoneSelector(player1, "appro"));
      const slot = row?.querySelector(".slot-appro");
      const play = await playCard("R000027", slot, {returnValidation: true});
      const footprintBefore = row?.querySelectorAll("[data-batch11a-necropole-footprint]").length || 0;
      const necropole = row?.querySelector('.fc[data-id="R000027"]');
      if (opponentRemoval) {
        const killer = qs(playerZoneSelector(player2, "servants"))?.querySelector(".fc");
        necropole._killer = killer || null;
        await sendToCemetery(necropole, {killer, forceCemetery: true});
      } else {
        await sendToCemetery(necropole, {forceCemetery: true});
      }
      const audit = auditCollectionBatch11jRuntime();
      const p1 = audit.batch11i.batch11e.batch11a.players.find(player => player.playerId === "player1") || {};
      return {
        play,
        footprintBefore,
        footprintAfter: row?.querySelectorAll("[data-batch11a-necropole-footprint]").length || 0,
        supplySlotsAfter: row?.querySelectorAll(".slot-appro").length || 0,
        servants: (p1.servants || []).map(entry => entry.cardId || entry.id || entry),
        releaseEvents: audit.batch11i.batch11e.batch11a.events.filter(event => event.type === "necropole-footprint-released"),
        fillEvents: audit.batch11i.batch11e.batch11a.events.filter(event => event.type === "necropole-removed-fill-board")
      };
    }, opponentRemoval);
  }

  await openScenario(page, "collection-batch-11j-necropole-removal");
  const owner = await playAndRemove({opponentRemoval: false});
  expect(owner.play.success).toBe(true);
  expect(owner.footprintBefore).toBe(1);
  expect(owner.footprintAfter).toBe(0);
  expect(owner.supplySlotsAfter).toBeGreaterThanOrEqual(5);
  expect(owner.servants).toContain("MV000025");
  expect(owner.releaseEvents.length).toBeGreaterThanOrEqual(1);
  expect(owner.fillEvents.length).toBeGreaterThanOrEqual(1);

  await openScenario(page, "collection-batch-11j-necropole-removal");
  const opponent = await playAndRemove({opponentRemoval: true});
  expect(opponent.play.success).toBe(true);
  expect(opponent.footprintBefore).toBe(1);
  expect(opponent.footprintAfter).toBe(0);
  expect(opponent.servants).toContain("MV000025");
  expect(opponent.releaseEvents.length).toBeGreaterThanOrEqual(1);
  expect(opponent.fillEvents.length).toBeGreaterThanOrEqual(1);

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Hokhan and Echo harvest visuals use the real source and the owner pile", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11j-hokhan-avatar-animation");
  const hokhan = await page.evaluate(async () => {
    const undead = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000001"]');
    await sendToCemetery(undead);
    const audit = auditCollectionBatch11jRuntime();
    return audit.events.filter(event => event.type === "zone-flight" && event.detail?.reason === "hokhan-avatar-graveyard-to-deck").map(event => event.detail);
  });
  expect(hokhan).toEqual(expect.arrayContaining([
    expect.objectContaining({fromPlayer: "player1", fromZone: "servants", toPlayer: "player1", toZone: "deck", fromElementKind: "explicit"})
  ]));

  await openScenario(page, "collection-batch-11j-faucheur-esprit-echo-pulse");
  const faucheur = await page.evaluate(async () => {
    const before = Number(player1.resourceState.souls || 0);
    const killer = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000009"]');
    const victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000001"]');
    victim._killer = killer;
    await sendToCemetery(victim, {killer});
    const after = Number(player1.resourceState.souls || 0);
    return {
      delta: after - before,
      sourceReason: killer?.dataset.batch03LastPulseReason || "",
      pileReason: qs(playerZoneSelector(player1, "appro"))?.querySelector("[data-soul]")?.dataset.batch11EchoPulseReason || "",
      notif: document.querySelector("#notif")?.textContent || ""
    };
  });
  expect(faucheur.delta).toBe(1);
  expect(faucheur.sourceReason).toBe("faucheur-echo-harvest");
  expect(faucheur.pileReason).toBe("gain");
  expect(faucheur.notif).not.toContain("FAUCHEUR D'ÂMES RÉCOLTE");

  const esprit = await page.evaluate(async () => {
    const before = Number(player1.resourceState.souls || 0);
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000025"]');
    await sendToCemetery(source);
    const after = Number(player1.resourceState.souls || 0);
    return {
      delta: after - before,
      sourceReason: source?.dataset.batch03LastPulseReason || "",
      pileReason: qs(playerZoneSelector(player1, "appro"))?.querySelector("[data-soul]")?.dataset.batch11EchoPulseReason || ""
    };
  });
  expect(esprit.delta).toBe(1);
  expect(esprit.sourceReason).toBe("vengeance");
  expect(esprit.pileReason).toBe("gain");

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Amalgam initiatives accept duplicate allied Amalgams and keep the exact V6 messages", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11j-amalgames-duplicates");
  const terrifying = await page.evaluate(async () => {
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    const result = await playCard("MV000004", slot, {returnValidation: true});
    return {result, notif: document.querySelector("#notif")?.textContent || "", events: auditCollectionBatch11jRuntime().batch11i.batch11e.batch11b.events};
  });
  expect(terrifying.result.success).toBe(true);
  expect(terrifying.notif).toContain(fixture.amalgamMessages.MV000004);
  expect(terrifying.events).toEqual(expect.arrayContaining([expect.objectContaining({type: "destroy-capture-echo"})]));

  await openScenario(page, "collection-batch-11j-amalgames-duplicates");
  const abomination = await page.evaluate(async () => {
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    const result = await playCard("MV000005", slot, {returnValidation: true});
    return {result, notif: document.querySelector("#notif")?.textContent || "", sourceReason: document.querySelector('.fc[data-id="MV000005"]')?.dataset.batch03LastPulseReason || ""};
  });
  expect(abomination.result.success).toBe(true);
  expect(abomination.notif).toContain(fixture.amalgamMessages.MV000005);
  expect(abomination.sourceReason).toBe("initiative");

  await openScenario(page, "collection-batch-11j-amalgames-duplicates");
  const erratic = await page.evaluate(async () => {
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    const before = player1.hand.length;
    const result = await playCard("MV000006", slot, {returnValidation: true});
    const after = player1.hand.length;
    return {result, delta: after - before, notif: document.querySelector("#notif")?.textContent || ""};
  });
  expect(erratic.result.success).toBe(true);
  expect(erratic.delta).toBe(2);
  expect(erratic.notif).toContain(fixture.amalgamMessages.MV000006);

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Jeteur and Morghast use printed Echo accounting and visible resource ordering", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11j-jeteur-accounting");
  const jeteur = await page.evaluate(async () => {
    const before = Number(player1.resourceState.souls || 0);
    const victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000005"]');
    await sendToCemetery(victim);
    const after = Number(player1.resourceState.souls || 0);
    const events = auditCollectionBatch11jRuntime().batch11i.batch11e.batch11c.events;
    return {before, after, delta: after - before, victimId: victim?.dataset.id || "", victimName: CARDS_DATA.H000005.name, victimStructuredCost: CARD_COST_DEFINITIONS.H000005.total, sourceStructuredCost: CARD_COST_DEFINITIONS.MV000011.total, helperGain: batch11bEchoAmountFromPrintedCost("H000005"), events};
  });
  expect(jeteur.victimId).toBe("H000005");
  expect(jeteur.victimName).toBe("Fantassin rouge");
  expect(jeteur.victimStructuredCost).toBe(3);
  expect(jeteur.sourceStructuredCost).toBeGreaterThanOrEqual(5);
  expect(jeteur.helperGain).toBe(1);
  expect(jeteur.delta).toBe(1);
  expect(jeteur.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type: "jeteur-destruction-echo", detail: expect.objectContaining({gain: 1})})
  ]));

  await openScenario(page, "collection-batch-11j-morghast-animation-order");
  const morghast = await page.evaluate(async () => {
    window.__batch11jOrder = [];
    const originalPulse = pulseBatch03Ability;
    const originalConsume = consumeSouls;
    pulseBatch03Ability = function(fc, reason, options) {
      if (fc?.dataset?.id === "MV000024") window.__batch11jOrder.push("pulse:" + reason);
      return originalPulse.apply(this, arguments);
    };
    consumeSouls = function(player, amount, reason, preferredSlot) {
      window.__batch11jOrder.push("consume:" + reason);
      return originalConsume.apply(this, arguments);
    };
    const before = Number(player1.resourceState.souls || 0);
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000024"]');
    await sendToCemetery(source);
    const after = Number(player1.resourceState.souls || 0);
    pulseBatch03Ability = originalPulse;
    consumeSouls = originalConsume;
    return {
      before,
      after,
      order: window.__batch11jOrder,
      pileReason: qs(playerZoneSelector(player1, "appro"))?.querySelector("[data-soul]")?.dataset.batch11EchoPulseReason || ""
    };
  });
  expect(morghast.order.indexOf("pulse:vengeance")).toBeGreaterThanOrEqual(0);
  expect(morghast.order.indexOf("consume:morghast-vengeance")).toBeGreaterThan(morghast.order.indexOf("pulse:vengeance"));
  expect(morghast.after).toBeLessThan(morghast.before);
  expect(morghast.pileReason).toBe("morghast-vengeance");

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Ame explosive, Mur non-mort, Recyclage and Rituel expose ordered V6 animations", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "collection-batch-11j-ame-explosive-mur");
  const ame = await page.evaluate(async () => {
    window.__batch11jOrder = [];
    const originalPulse = pulseBatch03Ability;
    const originalDamage = applyDamage;
    pulseBatch03Ability = function(fc, reason, options) {
      if (fc?.dataset?.id === "MV000028") window.__batch11jOrder.push("pulse:" + reason);
      return originalPulse.apply(this, arguments);
    };
    applyDamage = async function(fc, amount, options) {
      if (fc?.dataset?.id === "MV000028") window.__batch11jOrder.push("damage:" + amount);
      return originalDamage.apply(this, arguments);
    };
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000028"]');
    const pdvBefore = Number(source?.dataset.pdv || 0);
    await runStartTurnPipeline(player1);
    const pdvAfter = Number(source?.dataset.pdv || 0);
    pulseBatch03Ability = originalPulse;
    applyDamage = originalDamage;
    return {pdvBefore, pdvAfter, order: window.__batch11jOrder};
  });
  expect(ame.pdvAfter).toBe(ame.pdvBefore - 1);
  expect(ame.order.indexOf("damage:1")).toBeGreaterThan(ame.order.indexOf("pulse:start-turn"));

  const mur = await page.evaluate(async () => {
    const source = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000030"]');
    const start = performance.now();
    await sendToCemetery(source);
    const duration = performance.now() - start;
    const audit = auditCollectionBatch11jRuntime();
    const p1 = audit.batch11i.batch11e.batch11a.players.find(player => player.playerId === "player1") || {};
    return {
      duration,
      handTail: cardIds(p1.hand).slice(-3),
      flights: audit.events.filter(event => event.type === "zone-flight" && event.detail?.reason === "mur-non-mort-to-hand").map(event => event.detail)
    };
    function cardIds(entries) { return (entries || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean); }
  });
  expect(mur.duration).toBeGreaterThanOrEqual(900);
  expect(mur.handTail).toEqual(fixture.murNonMortHandOrder);
  expect(mur.flights).toHaveLength(3);

  await openScenario(page, "collection-batch-11j-recyclage");
  const recyclage = await page.evaluate(async () => {
    await playCard("S000044", null, {returnValidation: true});
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    await playCard("MV000001", slot, {returnValidation: true});
    await new Promise(resolve => setTimeout(resolve, 1500));
    const audit = auditCollectionBatch11jRuntime();
    const handNode = qs(playerZoneSelector(player1, "hand"))?.querySelector('.hc[data-id="MV000002"],.hc[data-id="H000001"],.hc[data-id="MV000025"]');
    return {
      flights: audit.events.filter(event => event.type === "zone-flight").map(event => event.detail),
      lingeringHalo: !!handNode?.classList.contains("hc-batch03-ianna-drawn")
    };
  });
  expect(recyclage.flights).toEqual(expect.arrayContaining([
    expect.objectContaining({reason: "recyclage-deck-to-hand", fromPlayer: "player1", fromZone: "deck", toPlayer: "player1", toZone: "hand"}),
    expect.objectContaining({reason: "recyclage-grave-to-deck", fromPlayer: "player1", fromZone: "graveyard", toPlayer: "player1", toZone: "deck"})
  ]));
  expect(recyclage.lingeringHalo).toBe(false);

  await openScenario(page, "collection-batch-11j-rituel-occulte");
  const rituel = await page.evaluate(async () => {
    const start = performance.now();
    await playCard("S000051", null, {returnValidation: true});
    const duration = performance.now() - start;
    const audit = auditCollectionBatch11jRuntime();
    const p1 = audit.batch11i.batch11e.batch11a.players.find(player => player.playerId === "player1") || {};
    const p2 = audit.batch11i.batch11e.batch11a.players.find(player => player.playerId === "player2") || {};
    return {
      duration,
      p1Graveyard: cardIds(p1.graveyard),
      p2Graveyard: cardIds(p2.graveyard),
      flights: audit.events.filter(event => event.type === "zone-flight" && event.detail?.reason === "rituel-occulte-grave-transfer").map(event => event.detail)
    };
    function cardIds(entries) { return (entries || []).map(entry => entry.cardId || entry.id || entry).filter(Boolean); }
  });
  expect(rituel.duration).toBeGreaterThanOrEqual(1400);
  expect(rituel.p1Graveyard).toEqual(fixture.rituelFinalGraveyard);
  expect(rituel.p2Graveyard).toEqual([]);
  expect(rituel.flights).toHaveLength(3);

  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
