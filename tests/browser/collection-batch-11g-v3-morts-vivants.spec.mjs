import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-11g-v3-morts-vivants.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch11g=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(150);
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message =>
    !/Failed to load resource: the server responded with a status of 404/i.test(message)
    && !/Failed to load resource: net::ERR_(NETWORK_CHANGED|NAME_NOT_RESOLVED)/i.test(message)
  );
}

function playersOf(audit) {
  return audit.players || audit.batch11e?.players || audit.batch11c?.players || audit.batch11b?.players || audit.batch11a?.players || [];
}

function cardIds(entries) {
  return entries.map(entry => entry.cardId || entry.id || entry).filter(Boolean);
}

test("Batch-11G scenarios stay hidden and public undead texts are clean/highlighted", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  const forbidden = new RegExp(fixture.expected.forbiddenPublicIdPattern, "i");
  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    const audit = await page.evaluate((ids) => ({
      scenarioId:selectedScenarioId(),
      publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length,
      cards:ids.map(id => {
        const data = CARDS_DATA[id] || {};
        const raw = String(data.cap || "") + " " + String(data.detail || "") + " " + String(data.cond || "");
        const formatted = formatPlayerFacingCardText(raw);
        return {
          id,
          exists:!!CARDS_DATA[id],
          raw,
          formatted
        };
      }),
      avatarPortrait:player1?.portrait || null,
      avatarSouls:player1?.resourceState?.souls ?? null
    }), fixture.cards);
    expect(audit.publicOptionCount, scenario + " hidden selector option").toBe(0);
    for (const card of audit.cards) {
      expect(card.exists, card.id).toBe(true);
      expect(card.formatted, card.id + " public technical ids").not.toMatch(forbidden);
      if (["R000027", "MV000030", "S000052", "AVS000008"].includes(card.id)) expect(card.formatted).toContain('class="kv"');
    }
  }
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("NÃ©cropole occupies a second blocked supply slot without public text", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11g-necropole-blocage-approvisionnements");
  const result = await page.evaluate(async () => {
    const slot = qs(playerZoneSelector(player1, "appro"))?.querySelector(".slot-appro");
    const play = await playCard("R000027", slot, {returnValidation:true});
    const footprint = qs(playerZoneSelector(player1, "appro"))?.querySelector("[data-batch11a-necropole-footprint]");
    const supplySlot = qs(playerZoneSelector(player1, "appro"))?.querySelector(".slot-appro");
    const style = footprint ? getComputedStyle(footprint) : null;
    return {
      play,
      footprint:{
        exists:!!footprint,
        className:footprint?.className || "",
        text:footprint?.innerText || "",
        width:style?.width || "",
        height:style?.height || "",
        isSupplySlot:footprint?.classList.contains("slot-appro") || false
      },
      remainingSupplySlots:qs(playerZoneSelector(player1, "appro"))?.querySelectorAll(".slot-appro").length || 0,
      supplySlotStillAvailable:!!supplySlot
    };
  });
  expect(result.play.success).toBe(true);
  expect(result.footprint.exists).toBe(true);
  expect(result.footprint.className).toContain(fixture.expected.necropoleFootprintClass);
  expect(result.footprint.text).toBe("");
  expect(result.footprint.isSupplySlot).toBe(false);
  expect(result.footprint.width).toBe(result.footprint.height);
  expect(result.supplySlotStillAvailable).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Main Hokhan avatar returns undead servants to the deck instead of the graveyard", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11g-avatar-hokhan-principal");
  const result = await page.evaluate(async () => {
    const undead = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000001"]');
    const before = auditCollectionBatch11eRuntime();
    await sendToCemetery(undead);
    const after = auditCollectionBatch11eRuntime();
    return {portrait:player1.portrait, souls:player1.resourceState.souls, before, after};
  });
  expect(result.portrait).toBe(fixture.expected.hokhanPortrait);
  expect(result.souls).toBeGreaterThanOrEqual(fixture.expected.hokhanInitialEchoes);
  const afterP1 = playersOf(result.after).find(player => player.playerId === "player1");
  expect(cardIds(afterP1.graveyard)).not.toContain("MV000001");
  expect(cardIds(afterP1.deck)).toContain("MV000001");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Corrected undead messages are emitted without duplicate generic harvest text", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11g-spectre-recolte");
  const spectre = await page.evaluate(async () => {
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    await playCard("MV000002", slot, {returnValidation:true});
    return {message:document.querySelector('#notif')?.textContent || "", events:auditCollectionBatch11eRuntime().events};
  });
  expect(spectre.message).toBe(fixture.expected.spectreMessage);

  await openScenario(page, "collection-batch-11g-eclipse-solaire");
  const eclipse = await page.evaluate(async () => {
    await playCard("S000042", null, {returnValidation:true});
    return document.querySelector('#notif')?.textContent || "";
  });
  expect(eclipse).toBe(fixture.expected.eclipseMessage);

  await openScenario(page, "collection-batch-11g-banshee-modal-vengeance");
  const banshee = await page.evaluate(async () => {
    const fc = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000015"]');
    const victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000001"]');
    await resolveBatch11bInitiative("MV000015", player1, {sourceFC:fc, selectedTargetIds:[victim.dataset.instance]});
    const initiativeMessage = document.querySelector('#notif')?.textContent || "";
    if (fc?.isConnected) await sendToCemetery(fc);
    const vengeanceMessage = document.querySelector('#notif')?.textContent || "";
    return {initiativeMessage, vengeanceMessage};
  });
  expect([fixture.expected.bansheeInitiativeMessage, ""].includes(banshee.initiativeMessage)).toBe(true);
  expect(banshee.vengeanceMessage).toBe(fixture.expected.bansheeVengeanceMessage);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("AraignÃ©e, Mur and Recyclage expose the V3 visual/audit events", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11g-araignee-capture-retour-cimetiere");
  const araignee = await page.evaluate(async () => {
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    const victim = qs(playerZoneSelector(player2, "servants"))?.querySelector('.fc[data-id="H000001"]');
    await playCard("MV000008", slot, {returnValidation:true, selectedTargetIds:[victim.dataset.instance]});
    const spider = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000008"]');
    await sendToCemetery(spider);
    return auditCollectionBatch11eRuntime().events;
  });
  expect(araignee).toEqual(expect.arrayContaining([expect.objectContaining({type:"araignee-vengeance-release"})]));

  await openScenario(page, "collection-batch-11g-mur-non-mort");
  const mur = await page.evaluate(async () => {
    const wall = qs(playerZoneSelector(player1, "servants"))?.querySelector('.fc[data-id="MV000030"]');
    await sendToCemetery(wall);
    return {
      hand:[...document.querySelectorAll(playerZoneSelector(player1, "hand") + ' .hc')].map(node => ({id:node.dataset.id, drawn:node.classList.contains('hc-batch03-ianna-drawn')})),
      events:auditCollectionBatch11eRuntime().events
    };
  });
  expect(mur.events).toEqual(expect.arrayContaining([expect.objectContaining({type:"mur-non-mort-vengeance"})]));
  expect(mur.hand.filter(card => ["MV000022", "MV000001"].includes(card.id)).some(card => card.drawn)).toBe(true);

  await openScenario(page, "collection-batch-11g-recyclage");
  const recyclage = await page.evaluate(async () => {
    await playCard("S000044", null, {returnValidation:true});
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    await playCard("MV000001", slot, {returnValidation:true});
    await new Promise(resolve => setTimeout(resolve, 700));
    return {
      hand:[...document.querySelectorAll(playerZoneSelector(player1, "hand") + ' .hc')].map(node => ({id:node.dataset.id, drawn:node.classList.contains('hc-batch03-ianna-drawn')})),
      events:auditCollectionBatch11eRuntime().events
    };
  });
  expect(recyclage.events).toEqual(expect.arrayContaining([expect.objectContaining({type:"recyclage-on-summon"})]));
  expect(recyclage.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type:"zone-flight", detail:expect.objectContaining({reason:"recyclage-deck-to-hand"})}),
    expect.objectContaining({type:"zone-flight", detail:expect.objectContaining({reason:"recyclage-grave-to-deck"})})
  ]));
  expect(recyclage.hand.some(card => card.drawn)).toBe(true);

  await openScenario(page, "collection-batch-11g-rituel-occulte-animation");
  const rituel = await page.evaluate(async () => {
    await playCard("S000051", null, {returnValidation:true});
    return auditCollectionBatch11eRuntime().events;
  });
  expect(rituel).toEqual(expect.arrayContaining([
    expect.objectContaining({type:"zone-flight", detail:expect.objectContaining({reason:"rituel-occulte-grave-transfer"})})
  ]));
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});


