import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { attachDiagnostics, attachPageDiagnostics } from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/huvu-impl-3-cards.json", import.meta.url), "utf8"));

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

function counts(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

async function openScenario(page, scenario) {
  const params = new URLSearchParams({scenario, impl3: `${Date.now()}-${Math.random()}`});
  await page.goto(`/code/partie-test-1.html?${params.toString()}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForTimeout(350);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const zone = (playerKey) => {
      const player = playerState(playerKey);
      return {
        hand: [...player.hand],
        deck: [...player.drawPile].map(getRuntimeCardId),
        graveyard: [...(player.graveyard || [])].map(getRuntimeCardId),
        resources: {
          classical: {...player.resourceState.classical},
          souls: player.resourceState.souls
        }
      };
    };
    return {
      scenarioId: selectedScenarioId(),
      currentPlayer,
      player1: zone("player1"),
      player2: zone("player2"),
      panel: typeof getHuvuTestResourcePanelSnapshot === "function" ? getHuvuTestResourcePanelSnapshot() : null,
      publicScenarioValues: Array.from(document.querySelectorAll("#scenarioSelect option")).map(option => option.value),
      errorText: document.querySelector("#errMsg")?.innerText || ""
    };
  });
}

async function playSpell(page, cardId, zoneSelection = null) {
  const result = await page.evaluate(async ({id, selection}) => playCard(id, null, selection ? {zoneSelection: selection} : {}), {id: cardId, selection: zoneSelection});
  await page.waitForTimeout(250);
  return result;
}

test("HUVU IMPL 3 scope is explicit and scenarios stay hidden", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-3-draw-discard");
  const state = await snapshot(page);
  await attachDiagnostics(testInfo, diagnostics);

  expect(fixture.cards.map(card => card.id)).toEqual(["S000006", "S000022", "S000051"]);
  expect(fixture.cards.length).toBeLessThanOrEqual(8);
  expect(state.panel?.visible).toBe(true);
  await expect(page.getByTestId("test-resource-panel")).toContainText("MODE TEST — HUVU IMPL 3");
  expect(state.publicScenarioValues.filter(value => value.startsWith("huvu-"))).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000006 draws four cards and returns the selected revealed card to the deck bottom", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-3-draw-discard");

  const before = await snapshot(page);
  const result = await playSpell(page, "S000006", {selectedCardId: "MV000002"});
  const after = await snapshot(page);
  await testInfo.attach("s000006-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result.success).toBe(true);
  expect(result.spellMovedToGraveyard).toBe(true);
  expect(result.spellResolution).toMatchObject({code: "murmures-divins-resolved", returnedCardId: "MV000002", keptCount: 3});
  expect(after.player1.hand).toEqual(["S000017", "MV000003", "MV000001"]);
  expect(after.player1.deck).toEqual(["MV000002", "R000010"]);
  expect(after.player1.graveyard).toEqual(["S000006"]);
  expect(result.paymentResult).toMatchObject({success: true});
  expect(after.panel.last.code).toBe("affordable");
  expect(after.panel.zone).toMatchObject({code: "murmures-divins-resolved", returnedCardId: "MV000002"});
  expect(counts([...after.player1.hand, ...after.player1.deck, ...after.player1.graveyard])).toMatchObject(counts([...before.player1.hand, ...before.player1.deck, ...before.player1.graveyard]));
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000006 refuses before payment when the deck is empty", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-3-draw-discard");
  await page.evaluate(() => {
    playerState("player1").drawPile = [];
    updateDeckCount(playerState("player1"));
  });

  const before = await snapshot(page);
  const result = await playSpell(page, "S000006", {selectedCardId: "MV000002"});
  const after = await snapshot(page);
  await testInfo.attach("s000006-empty-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result).toBeUndefined();
  expect(after.player1.hand).toEqual(before.player1.hand);
  expect(after.player1.deck).toEqual(before.player1.deck);
  expect(after.player1.graveyard).toEqual(before.player1.graveyard);
  expect(after.player1.resources).toEqual(before.player1.resources);
  expect(after.errorText).toContain("deck");
  expect(after.panel.play.code).toBe("own-deck-has-card");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000022 refuses before payment when the opposing graveyard has no legal servant", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-3-graveyard-selection");
  await page.evaluate(() => {
    playerState("player2").graveyard = ["R000001", "H000029"];
    refreshCemeteryVisual(playerState("player2"));
  });

  const before = await snapshot(page);
  const result = await playSpell(page, "S000022", {selectedCardIds: ["H000001"]});
  const after = await snapshot(page);
  await testInfo.attach("s000022-refusal-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result).toBeUndefined();
  expect(after.player1.hand).toEqual(before.player1.hand);
  expect(after.player1.deck).toEqual(before.player1.deck);
  expect(after.player1.graveyard).toEqual(before.player1.graveyard);
  expect(after.player2.graveyard).toEqual(before.player2.graveyard);
  expect(after.player1.resources).toEqual(before.player1.resources);
  expect(after.errorText).toContain("Aucune cible valide");
  expect(after.panel.play.code).toBe("opponent-graveyard-has-servant");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000022 transfers selected legal servants from opposing graveyard into deck and shuffles", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-3-graveyard-selection");

  const before = await snapshot(page);
  const result = await playSpell(page, "S000022", {selectedCardIds: ["H000001", "H000005"]});
  const after = await snapshot(page);
  await testInfo.attach("s000022-success-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result.success).toBe(true);
  expect(result.spellMovedToGraveyard).toBe(true);
  expect(result.spellResolution).toMatchObject({code: "galerie-des-horreurs-resolved", shuffled: true});
  expect(result.spellResolution.moved.map(entry => entry.cardId).sort()).toEqual(["H000001", "H000005"]);
  expect(after.player1.hand).not.toContain("S000022");
  expect(after.player1.graveyard).toContain("S000022");
  expect(counts(after.player1.deck)).toMatchObject({...counts(before.player1.deck), H000001: 1, H000005: 1});
  expect(after.player2.graveyard).toEqual(["R000001", "H000018", "H000029"]);
  expect(after.panel.zone).toMatchObject({code: "galerie-des-horreurs-resolved", shuffled: true});
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000051 steals the entire opposing graveyard into the current player's graveyard", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-3-graveyard-theft");

  const before = await snapshot(page);
  const result = await playSpell(page, "S000051");
  const after = await snapshot(page);
  await testInfo.attach("s000051-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result.success).toBe(true);
  expect(result.spellMovedToGraveyard).toBe(true);
  expect(result.spellResolution).toMatchObject({code: "rituel-occulte-resolved", moved: ["H000001", "R000001", "H000005"]});
  expect(after.player2.graveyard).toEqual([]);
  expect(after.player1.graveyard).toEqual(["MV000001", "H000001", "R000001", "H000005", "S000051"]);
  expect(after.player1.hand).not.toContain("S000051");
  expect(result.paymentResult).toMatchObject({success: true});
  expect(after.panel.last.code).toBe("affordable");
  expect(after.panel.zone).toMatchObject({code: "rituel-occulte-resolved"});
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
