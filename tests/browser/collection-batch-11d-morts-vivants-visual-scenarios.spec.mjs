import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-11d-morts-vivants-visual-scenarios.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch11d=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect(page.getByTestId("test-resource-panel")).toContainText("COLLECTION BATCH 11D");
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(150);
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message =>
    !/Failed to load resource: the server responded with a status of 404/i.test(message)
    && !/Failed to load resource: net::ERR_(NETWORK_CHANGED|NAME_NOT_RESOLVED)/i.test(message)
  );
}


test("Batch-11D visual scenarios are reachable, hidden from the public selector, and expose their key cards", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario.id);
    const audit = await page.evaluate((cardIds) => ({
      scenarioId:selectedScenarioId(),
      publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length,
      title:document.querySelector('[data-testid="test-resource-panel"]')?.innerText || '',
      cards:cardIds.map(id => ({
        id,
        dataExists:!!CARDS_DATA[id],
        visibleCount:document.querySelectorAll('.hc[data-id="' + id + '"], .fc[data-id="' + id + '"]').length,
        text:formatPlayerFacingCardText(String(CARDS_DATA[id]?.cap || '') + ' ' + String(CARDS_DATA[id]?.detail || '') + ' ' + String(CARDS_DATA[id]?.cond || ''))
      })),
      batch11a:typeof auditCollectionBatch11aRuntime === 'function' ? auditCollectionBatch11aRuntime() : null,
      batch11b:typeof auditCollectionBatch11bRuntime === 'function' ? auditCollectionBatch11bRuntime() : null,
      batch11c:typeof auditCollectionBatch11cRuntime === 'function' ? auditCollectionBatch11cRuntime() : null
    }), scenario.cards);
    expect(audit.publicOptionCount, scenario.id + " hidden selector option").toBe(0);
    expect(audit.title).toContain("COLLECTION BATCH 11D");
    for (const card of audit.cards) {
      expect(card.dataExists, card.id + " data").toBe(true);
      expect(card.visibleCount, card.id + " visible in " + scenario.id).toBeGreaterThan(0);
      expect(card.text, card.id + " no public technical RAME ids").not.toMatch(/RAME(?:0|5|10|15|20|21|\*)|\[ID\s*=/i);
    }
    if (scenario.expectsEcho) {
      const p1 = audit.batch11a?.players?.find(player => player.playerId === "player1");
      expect(typeof p1?.souls, scenario.id + " Echo counter").toBe("number");
    }
  }
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch-11D parity scenario exposes all sixteen real cards with runtime data", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11-global-parity-collection");
  const snapshot = await page.evaluate((cardIds) => cardIds.map(id => {
    const nodes = Array.from(document.querySelectorAll('.hc[data-id="' + id + '"], .fc[data-id="' + id + '"]'));
    const data = CARDS_DATA[id] || null;
    return {
      id,
      visible:nodes.length,
      name:data?.name || '',
      type:data?.type || '',
      faction:data?.fac || '',
      cost:data?.cost ?? null,
      keywords:[...(data?.kws || [])],
      renderedText:nodes.map(node => (node.innerText || '').replace(/\s+/g, ' ').trim())
    };
  }), fixture.cards);
  for (const card of snapshot) {
    expect(card.visible, card.id + " visible").toBeGreaterThan(0);
    expect(card.name, card.id + " name").not.toBe("");
    expect(card.type, card.id + " type").not.toBe("");
  }
  expect(snapshot.map(card => card.id).sort()).toEqual([...fixture.cards].sort());
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch-11D refusal checkpoints keep hand, Echoes and zones stable", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11-global-faucheur-capture");
  const faucheurRefusal = await page.evaluate(async () => {
    player1.resourceState.souls = 1;
    projectSoulState(player1);
    const before = auditCollectionBatch11aRuntime().players.find(player => player.playerId === "player1");
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    const play = await playCard("MV000009", slot, {returnValidation:true});
    const after = auditCollectionBatch11aRuntime().players.find(player => player.playerId === "player1");
    return {before, play:play || null, after, error:document.querySelector("#errMsg")?.innerText || ""};
  });
  expect(faucheurRefusal.play).toBeNull();
  expect(faucheurRefusal.after.hand).toEqual(faucheurRefusal.before.hand);
  expect(faucheurRefusal.after.souls).toBe(1);
  expect(faucheurRefusal.after.servants).toEqual(faucheurRefusal.before.servants);

  await openScenario(page, "collection-batch-11-global-sacrifice-power");
  const sacrificeRefusal = await page.evaluate(async () => {
    player1.graveyard = [{cardId:"R000001", ownerId:player1.key, originalOwnerId:player1.key}];
    const before = auditCollectionBatch11cRuntime();
    const play = await playCard("S000041", null, {returnValidation:true});
    const after = auditCollectionBatch11cRuntime();
    return {before, play:play || null, after, error:document.querySelector("#errMsg")?.innerText || ""};
  });
  expect(sacrificeRefusal.play).toMatchObject({success:false, reason:"zone-play-requirement"});
  expect(sacrificeRefusal.after.inventories).toEqual(sacrificeRefusal.before.inventories);
  expect(sacrificeRefusal.error).toContain("Vous ne remplissez pas les conditions");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch-11D return scenario keeps the deck priority visible for Retour des revenants", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "collection-batch-11-global-return-revenants");
  const result = await page.evaluate(async () => {
    const before = auditCollectionBatch11cRuntime().players.find(player => player.playerId === "player1");
    const play = await playCard("S000052", null, {returnValidation:true});
    const after = auditCollectionBatch11cRuntime().players.find(player => player.playerId === "player1");
    return {before, play, after};
  });
  expect(result.play.success).toBe(true);
  expect(result.play.spellMovedToGraveyard).toBe(true);
  expect(result.play.spellResolution.sourceZone).toBe("deck");
  expect(result.after.graveyard.map(entry => entry.cardId)).toContain("S000052");
  expect(result.after.servants.map(card => card.id).sort()).toEqual(["MV000001", "MV000002", "MV000025"]);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
