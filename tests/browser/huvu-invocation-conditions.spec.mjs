import { expect, test } from "@playwright/test";
import { attachDiagnostics, attachPageDiagnostics, waitForVisibleHandStable } from "./helpers/eloron-ui.mjs";

const BLOCKED_SCENARIO = "huvu-conditions-blocked";
const ALLOWED_SCENARIO = "huvu-conditions-allowed";

const TARGET_CARDS = [
  {
    id: "AVS000007",
    name: "Mage du Cercle – Uram le Rouge",
    blockedCode: "missing-required-resource",
    blockedMessage: "6 ressources Aria",
    expectedSoulPayment: 0,
    expectedDeckDelta: 0
  },
  {
    id: "AVS000008",
    name: "Mage du Cercle – Hokhan Ashir",
    blockedCode: "missing-required-resource",
    blockedMessage: "6 ressources Aria",
    expectedSoulPayment: 8,
    expectedDeckDelta: 0
  },
  {
    id: "MV000004",
    name: "Amalgame terrifiant",
    blockedCode: "missing-required-board-presence",
    blockedMessage: "deux autres serviteurs amalgamés",
    expectedSoulPayment: 3,
    expectedDeckDelta: 0
  },
  {
    id: "MV000005",
    name: "Amalgame rageur",
    blockedCode: "missing-required-board-presence",
    blockedMessage: "deux autres serviteurs amalgamés",
    expectedSoulPayment: 3,
    expectedDeckDelta: 0
  },
  {
    id: "MV000006",
    name: "Amalgame erratique",
    blockedCode: "missing-required-board-presence",
    blockedMessage: "deux autres serviteurs amalgamés",
    expectedSoulPayment: 3,
    expectedDeckDelta: -3
  }
];

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

async function openHiddenScenario(page, scenario) {
  const params = new URLSearchParams({scenario, huvu2: `${Date.now()}-${Math.random()}`});
  await page.goto(`/code/partie-test-1.html?${params.toString()}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await waitForVisibleHandStable(page);
}

async function conditionSnapshot(page, cardId) {
  return page.evaluate((id) => {
    const player = playerState(currentPlayer);
    const servantZone = qs(playerZoneSelector(player, "servants"));
    const handZone = qs(playerZoneSelector(player, "hand"));
    const condition = auditInvocationCondition(id, player);
    return {
      scenarioId: selectedScenarioId(),
      scenario: {
        label: activeScenario?.label || "",
        participants: activeScenario?.participants || [],
        hasTop: !!activeScenario?.top,
        hasBottom: !!activeScenario?.bottom,
        topName: activeScenario?.top?.name || "",
        bottomName: activeScenario?.bottom?.name || "",
        hidden: !!activeScenario?.hidden
      },
      currentPlayer,
      condition,
      hand: [...player.hand],
      handDomIds: Array.from(handZone?.querySelectorAll(".hc[data-id]") || []).map(card => card.dataset.id),
      boardIds: Array.from(servantZone?.querySelectorAll(".fc:not([data-type='appro']):not([data-dead])") || []).map(card => card.dataset.id),
      servantCount: servantZone?.querySelectorAll(".fc:not([data-type='appro']):not([data-dead])").length || 0,
      availableSlotCount: servantZone?.querySelectorAll(".slot").length || 0,
      resources: {
        classical: {...player.resourceState.classical},
        souls: player.resourceState.souls,
        revision: player.resourceState.revision
      },
      graveyard: [...player.graveyard],
      deckCount: player.drawPile.length,
      cardsPlayedThisTurn,
      errorText: document.querySelector("#errMsg")?.innerText || "",
      decisionOpen: !!document.querySelector(".decision-modal-overlay,.sort-choice-overlay")
    };
  }, cardId);
}

async function playCardThroughGameEntryPoint(page, cardId) {
  const card = page.locator(`.hc[data-id="${cardId}"]`).first();
  await expect(card, `Expected ${cardId} in the visible hand`).toBeVisible();
  const slot = page.locator(`[data-player="player1"][data-zone="servants"] .slot`).first();
  await expect(slot, "Expected an available servant slot").toBeVisible();
  await page.evaluate(async (id) => {
    const player = playerState(currentPlayer);
    const targetSlot = qs(playerZoneSelector(player, "servants"))?.querySelector(".slot");
    await playCard(id, targetSlot);
  }, cardId);
  await page.waitForTimeout(500);
}

test("Hokhan Ashir Vs Uram keeps its detailed scenario definition", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openHiddenScenario(page, "hokhan-uram");
  const snapshot = await conditionSnapshot(page, "MV000006");
  await attachDiagnostics(testInfo, diagnostics);

  expect(snapshot.scenarioId).toBe("hokhan-uram");
  expect(snapshot.scenario.label).toBe("Hokhan Ashir Vs Uram");
  expect(snapshot.scenario.participants).toEqual(["hokhan", "uram"]);
  expect(snapshot.scenario.hasTop).toBe(true);
  expect(snapshot.scenario.hasBottom).toBe(true);
  expect(snapshot.scenario.topName).toBe("Hokhan Ashir");
  expect(snapshot.scenario.bottomName).toBe("Uram le Rouge");
});

for (const card of TARGET_CARDS) {
  test(`${card.id}: invocation condition blocks before payment and mutation`, async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openHiddenScenario(page, BLOCKED_SCENARIO);

    const before = await conditionSnapshot(page, card.id);
    expect(before.condition.allowed).toBe(false);
    expect(before.condition.code).toBe(card.blockedCode);

    await playCardThroughGameEntryPoint(page, card.id);
    const after = await conditionSnapshot(page, card.id);

    await testInfo.attach(`${card.id}-blocked-state`, {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({before, after}, null, 2), "utf8")
    });
    if (card.id === "MV000006") await page.screenshot({path: "test-results/huvu-condition-blocked.png", fullPage: true});
    if (card.id === "AVS000007") await page.screenshot({path: "test-results/huvu-condition-blocked-message.png", fullPage: true});
    await attachDiagnostics(testInfo, diagnostics);

    expect(after.condition.allowed).toBe(false);
    expect(after.hand).toEqual(before.hand);
    expect(after.boardIds).toEqual(before.boardIds);
    expect(after.resources).toEqual(before.resources);
    expect(after.graveyard).toEqual(before.graveyard);
    expect(after.deckCount).toBe(before.deckCount);
    expect(after.cardsPlayedThisTurn).toBe(before.cardsPlayedThisTurn);
    expect(after.decisionOpen).toBe(false);
    expect(after.errorText).toContain(card.blockedMessage);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });

  test(`${card.id}: invocation condition allows the normal play flow`, async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openHiddenScenario(page, ALLOWED_SCENARIO);

    const before = await conditionSnapshot(page, card.id);
    expect(before.condition.allowed).toBe(true);

    await playCardThroughGameEntryPoint(page, card.id);
    const after = await conditionSnapshot(page, card.id);

    await testInfo.attach(`${card.id}-allowed-state`, {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({before, after}, null, 2), "utf8")
    });
    if (card.id === "MV000006") await page.screenshot({path: "test-results/huvu-condition-allowed.png", fullPage: true});
    if (card.id === "AVS000008") await page.screenshot({path: "test-results/huvu-scenario-initialized.png", fullPage: true});
    await attachDiagnostics(testInfo, diagnostics);

    expect(after.condition.allowed).toBe(true);
    expect(after.hand).not.toContain(card.id);
    expect(after.servantCount).toBe(before.servantCount + 1);
    expect(after.cardsPlayedThisTurn).toBe(before.cardsPlayedThisTurn + 1);
    expect(after.graveyard).toEqual(before.graveyard);
    expect(after.deckCount).toBe(before.deckCount + card.expectedDeckDelta);
    expect(after.resources.souls).toBe(before.resources.souls - card.expectedSoulPayment);
    expect(after.decisionOpen).toBe(false);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });
}
