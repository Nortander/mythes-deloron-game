import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics, openCollection} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-12a-lame.json", import.meta.url), "utf8"));

async function openScenario(page) {
  await page.goto("/code/partie-test-1.html?scenario=" + fixture.scenario + "&batch12a=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(fixture.scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect(page.getByText(fixture.panelTitle)).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(150);
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message =>
    !/Failed to load resource: the server responded with a status of 404/i.test(message)
    && !/Failed to load resource: net::ERR_(NETWORK_CHANGED|NAME_NOT_RESOLVED)/i.test(message)
  );
}

async function placeFriendlySupport(page, cardId = "AVS000008") {
  await page.evaluate((id) => {
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    if (!slot) throw new Error("missing player1 servant slot");
    const template = document.createElement("template");
    template.innerHTML = buildFC(id, player1).trim();
    const fc = template.content.firstElementChild;
    fc.dataset.prepared = "1";
    slot.replaceWith(fc);
  }, cardId);
}

async function setOpponentServants(page, servants) {
  await page.evaluate((servants) => {
    const zone = qs(playerZoneSelector(player2, "servants"));
    if (!zone) throw new Error("missing player2 servant zone");
    zone.innerHTML = "";
    servants.forEach((entry) => {
      const template = document.createElement("template");
      template.innerHTML = buildFC(entry.id, player2).trim();
      const fc = template.content.firstElementChild;
      if (entry.atk != null) fc.dataset.atk = String(entry.atk);
      if (entry.pdv != null) fc.dataset.pdv = String(entry.pdv);
      if (entry.pdvMax != null) fc.dataset.pdvMax = String(entry.pdvMax);
      fc.dataset.prepared = "1";
      zone.appendChild(fc);
    });
    for (let i = servants.length; i < 5; i++) {
      const slot = document.createElement("div");
      slot.className = "slot";
      zone.appendChild(slot);
    }
  }, servants);
}

async function playFromHand(page, cardId) {
  return page.evaluate(async (cardId) => {
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    if (!slot) throw new Error("missing player1 servant slot");
    return playCard(cardId, slot, {returnValidation:true});
  }, cardId);
}

async function audit(page) {
  return page.evaluate(() => auditCollectionBatch12aRuntime());
}

test("Batch-12A scenario is hidden and exposes clean Blade card data", async ({page}, testInfo) => {
  test.setTimeout(90000);
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page);
  const runtime = await audit(page);
  expect(runtime.panelTitle).toBe(fixture.panelTitle);
  expect(runtime.player1.souls).toBe(fixture.initial.player1Souls);
  expect(runtime.player1.hand).toEqual(fixture.initial.player1Hand);
  expect(runtime.player2.servants).toEqual(fixture.initial.player2Servants);
  const publicOptionCount = await page.evaluate(() => document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length);
  expect(publicOptionCount).toBe(0);
  for (const card of runtime.cards) {
    expect(card.resType, card.id).toMatch(/Écho|Aria\+Écho/);
    expect(card.kws.join(" "), card.id).not.toMatch(/Âme|Ã‚me/i);
    expect(card.cap + " " + card.detail, card.id).not.toMatch(/\[ID\s*=|RAME\d|S000|MV000|AVS000/i);
  }
  await openCollection(page);
  const collection = await page.evaluate((ids) => ids.map(id => {
    const card = CARDS.find(entry => entry.id === id);
    return {id, resType:card?.resType || "", keywords:card?.kw || [], text:String(card?.desc || "") + " " + String(card?.detail || "") + " " + String(card?.cond || "")};
  }), fixture.cards);
  for (const card of collection) {
    const expected = fixture.expectedCollection[card.id];
    expect(card.resType, card.id).toBe(expected.resType);
    expect(card.keywords, card.id).toEqual(expect.arrayContaining(expected.keywords));
    expect(card.text, card.id).not.toMatch(/Âme|Ã‚me|\[ID\s*=|RAME\d|S000|MV000|AVS000/i);
  }
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Serviteur de la Lame requires support and pays Echoes without mutating on refusal", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page);
  const before = await audit(page);
  const refused = await playFromHand(page, "MV000016");
  expect(refused.success).toBe(false);
  expect(refused.actionValidation?.conditionResult?.allowed).toBe(false);
  const afterRefusal = await audit(page);
  expect(afterRefusal.player1.souls).toBe(before.player1.souls);
  expect(afterRefusal.player1.hand).toContain("MV000016");
  expect(afterRefusal.player1.graveyard).toEqual(before.player1.graveyard);
  await placeFriendlySupport(page);
  const played = await playFromHand(page, "MV000016");
  expect(played.success).toBe(true);
  await page.waitForTimeout(350);
  const after = await audit(page);
  expect(after.player1.souls).toBe(before.player1.souls - 2);
  expect(after.player1.hand).not.toContain("MV000016");
  expect(after.player1.servants).toEqual(expect.arrayContaining(["AVS000008", "MV000016"]));
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Cauchemar de la Lame damages a servant or the avatar fallback", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page);
  await placeFriendlySupport(page);
  await setOpponentServants(page, [{id:"H000001", atk:3, pdv:8, pdvMax:8}]);
  const servantResult = await playFromHand(page, "MV000017");
  expect(servantResult.success).toBe(true);
  await page.waitForTimeout(1300);
  let state = await audit(page);
  expect(state.player2.servants).not.toContain("H000001");
  expect(state.player2.graveyard).toContain("H000001");
  expect(state.events.some(event => event.type === "cauchemar-servant-damage" && event.died)).toBe(true);

  await openScenario(page);
  await placeFriendlySupport(page);
  await setOpponentServants(page, []);
  const before = await audit(page);
  const avatarResult = await playFromHand(page, "MV000017");
  expect(avatarResult.success).toBe(true);
  await page.waitForTimeout(800);
  state = await audit(page);
  expect(state.player2.avatarHp).toBe(before.player2.avatarHp - 4);
  expect(state.events.some(event => event.type === "cauchemar-avatar-damage" && event.amount === 4)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Mage de la Lame applies Coup de glace, Gel, draws a spell and reduces its cost", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page);
  await placeFriendlySupport(page);
  await setOpponentServants(page, [{id:"H000001", atk:3, pdv:6, pdvMax:6}, {id:"H000005", atk:5, pdv:7, pdvMax:7}]);
  await page.evaluate(() => { player1.drawPile = ["H000001", "S000004"]; updateDeckCount(player1); });
  const before = await audit(page);
  const result = await playFromHand(page, "MV000018");
  expect(result.success).toBe(true);
  await page.waitForTimeout(2400);
  const state = await audit(page);
  const mageEvent = state.events.find(event => event.type === "mage-lame-initiative");
  expect(mageEvent).toBeTruthy();
  expect(mageEvent.draw.success).toBe(true);
  expect(mageEvent.draw.cardId).toBe("S000004");
  expect(mageEvent.costReduction.amount).toBe(fixture.mageExpectedReduction);
  expect(mageEvent.costReduction.effectiveCost).toBeLessThan(4);
  expect(mageEvent.drawAnimation).toMatchObject({type:"blade-animation-flight", cardId:"S000004", fromZone:"deck", toZone:"hand", reason:"mage-spell-deck-to-hand", visible:true, halo:"undead-purple"});
  expect(state.events.some(event => event.type === "blade-animation-flight" && event.cardId === "S000004" && event.fromZone === "deck" && event.toZone === "hand" && event.reason === "mage-spell-deck-to-hand" && event.visible && event.halo === "undead-purple")).toBe(true);
  expect(state.player1.hand.length).toBe(before.player1.hand.length);
  expect(state.player1.hand).toContain("S000004");
  const statuses = await page.evaluate(() => batch11bEnemyServants(player1).map(fc => ({id:fc.dataset.id, cdg:fc.dataset.frozen_cdg || "", gel:fc.dataset.frozen || ""})));
  expect(statuses.some(entry => entry.cdg === "1")).toBe(true);
  expect(statuses.some(entry => entry.gel === "3")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Forgeron doubles Echo gains and creates the correct Blade card in deck", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page);
  await placeFriendlySupport(page, "MV000019");
  const before = await audit(page);
  const gain = await page.evaluate(() => addSoulToAppro(player1, 2, 'batch12a-test-gain'));
  expect(gain.success).toBe(true);
  expect(gain.delta).toBe(4);
  let state = await audit(page);
  expect(state.player1.souls).toBe(before.player1.souls + 4);
  expect(state.events.some(event => event.type === "forgeron-echo-gain-doubled" && event.appliedDelta === 4)).toBe(true);

  await setOpponentServants(page, [{id:"H000001", atk:3, pdv:4, pdvMax:4}]);
  const beforeGeneration = await audit(page);
  const deckBefore = beforeGeneration.player1.deck;
  const handBeforeGeneration = beforeGeneration.player1.hand;
  await page.evaluate(async () => {
    const target = batch11bEnemyServants(player1).find(fc => fc.dataset.id === 'H000001');
    await sendToCemetery(target, {sourceCardId:'batch12a-test'});
  });
  await page.waitForTimeout(1800);
  state = await audit(page);
  expect(state.player1.deck.length).toBe(deckBefore.length + 1);
  expect(state.player1.deck).toContain(fixture.bladeGenerationByCost.below4);
  const forgeronEvent = state.events.find(event => event.type === "forgeron-blade-generated-to-deck" && event.generatedCardId === "MV000016");
  expect(forgeronEvent).toBeTruthy();
  expect(forgeronEvent.animation).toMatchObject({type:"blade-animation-flight", cardId:"MV000016", fromZone:"center", toZone:"deck", reason:"forgeron-blade-center-to-deck", visible:true, halo:"undead-purple"});
  expect(state.events.some(event => event.type === "blade-center-reveal" && event.cardId === "MV000016" && event.reason === "forgeron-blade-center-to-deck" && event.halo === "undead-purple")).toBe(true);
  expect(state.events.some(event => event.type === "blade-animation-flight" && event.cardId === "MV000016" && event.fromZone === "center" && event.toZone === "deck" && event.reason === "forgeron-blade-center-to-deck" && event.visible && event.halo === "undead-purple")).toBe(true);
  const countInHand = (cards, id) => cards.filter(cardId => cardId === id).length;
  expect(countInHand(state.player1.hand, "MV000016")).toBe(countInHand(handBeforeGeneration, "MV000016"));
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Scorpion de la Lame kills, captures the victim and gains doubled Echoes with Forgeron", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page);
  await placeFriendlySupport(page, "MV000019");
  await setOpponentServants(page, [{id:"H000001", atk:3, pdv:1, pdvMax:4}]);
  const before = await audit(page);
  const result = await playFromHand(page, "MV000021");
  expect(result.success).toBe(true);
  await page.waitForTimeout(1600);
  const state = await audit(page);
  expect(state.player1.hand).not.toContain("MV000021");
  expect(state.player1.servants).toEqual(expect.arrayContaining(["MV000019", "MV000021"]));
  expect(state.player2.servants).not.toContain("H000001");
  expect(state.player2.graveyard).toContain("H000001");
  expect(state.player1.souls).toBe(before.player1.souls - 5 + 2);
  expect(state.events.some(event => event.type === "scorpion-lame-initiative" && event.died && event.echoAmount === 1)).toBe(true);
  expect(state.events.some(event => event.type === "forgeron-echo-gain-doubled" && event.requestedDelta === 1 && event.appliedDelta === 2)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
