import { expect, test } from "@playwright/test";
import { attachDiagnostics, attachPageDiagnostics, waitForVisibleHandStable } from "./helpers/eloron-ui.mjs";

const AMALGAM_ZERO_ECHOES_SCENARIO = "huvu-amalgam-zero-echoes";
const AMALGAM_THREE_ECHOES_SCENARIO = "huvu-amalgam-three-echoes";
const AVS_COST_INSUFFICIENT_SCENARIO = "huvu-avs-cost-insufficient";
const AVS_COST_SUFFICIENT_SCENARIO = "huvu-avs-cost-sufficient";

const AMALGAMS = [
  {id: "MV000004", name: "Amalgame terrifiant"},
  {id: "MV000005", name: "Amalgame rageur"},
  {id: "MV000006", name: "Amalgame erratique"}
];

const AVATARS = [
  {id: "AVS000007", name: "Mage du Cercle - Uram le Rouge", expectedSoulPayment: 0},
  {id: "AVS000008", name: "Mage du Cercle - Hokhan Ashir", expectedSoulPayment: 8}
];

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

function totalResources(resources) {
  return Object.values(resources.classical || {}).reduce((sum, value) => sum + Number(value || 0), 0) + Number(resources.souls || 0);
}

async function openHiddenScenario(page, scenario) {
  const params = new URLSearchParams({scenario, huvu2b: `${Date.now()}-${Math.random()}`});
  await page.goto(`/code/partie-test-1.html?${params.toString()}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await waitForVisibleHandStable(page);
}

async function ruleSnapshot(page, cardId) {
  return page.evaluate((id) => {
    const player = playerState(currentPlayer);
    const servantZone = qs(playerZoneSelector(player, "servants"));
    const handZone = qs(playerZoneSelector(player, "hand"));
    const condition = auditInvocationCondition(id, player);
    const card = CARDS_DATA[id] || {};
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
      cardMetadata: {
        invocationCondition: card.invocationCondition || null,
        invocationConditionText: card.invocationConditionText || "",
        cost: card.cost,
        resType: card.resType || "",
        cap: card.cap || "",
        detail: card.detail || "",
        cond: card.cond || ""
      },
      hand: [...player.hand],
      handDomIds: Array.from(handZone?.querySelectorAll(".hc[data-id]") || []).map(cardElement => cardElement.dataset.id),
      boardIds: Array.from(servantZone?.querySelectorAll(".fc:not([data-type='appro']):not([data-dead])") || []).map(cardElement => cardElement.dataset.id),
      servantCount: servantZone?.querySelectorAll(".fc:not([data-type='appro']):not([data-dead])").length || 0,
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
  const result = await page.evaluate(async (id) => {
    const player = playerState(currentPlayer);
    const targetSlot = qs(playerZoneSelector(player, "servants"))?.querySelector(".slot");
    return playCard(id, targetSlot);
  }, cardId);
  await page.waitForTimeout(500);
  return result;
}

test("Hokhan Ashir Vs Uram keeps its detailed scenario definition", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openHiddenScenario(page, "hokhan-uram");
  const snapshot = await ruleSnapshot(page, "MV000006");
  await attachDiagnostics(testInfo, diagnostics);

  expect(snapshot.scenarioId).toBe("hokhan-uram");
  expect(snapshot.scenario.label).toBe("Hokhan Ashir Vs Uram");
  expect(snapshot.scenario.participants).toEqual(["hokhan", "uram"]);
  expect(snapshot.scenario.hasTop).toBe(true);
  expect(snapshot.scenario.hasBottom).toBe(true);
  expect(snapshot.scenario.topName).toBe("Hokhan Ashir");
  expect(snapshot.scenario.bottomName).toBe("Uram le Rouge");
});

test("HUVU target cards do not carry obsolete invocation-condition metadata", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openHiddenScenario(page, AMALGAM_ZERO_ECHOES_SCENARIO);
  const audit = await page.evaluate((ids) => ids.map(id => {
    const card = CARDS_DATA[id] || {};
    const result = auditInvocationCondition(id, playerState(currentPlayer));
    return {
      id,
      result,
      invocationCondition: card.invocationCondition || null,
      invocationConditionText: card.invocationConditionText || "",
      text: [card.invocationConditionText, card.cond, card.cap, card.detail].filter(Boolean).join("\n")
    };
  }), [...AMALGAMS.map(card => card.id), ...AVATARS.map(card => card.id)]);
  await attachDiagnostics(testInfo, diagnostics);

  for (const entry of audit) {
    expect(entry.result.allowed).toBe(true);
    expect(entry.result.code).toBe("no-condition");
    expect(entry.invocationCondition).toBeNull();
    expect(entry.invocationConditionText).toBe("");
    expect(entry.text).not.toContain("6 ressources Aria");
  }
  for (const amalgamId of AMALGAMS.map(card => card.id)) {
    const entry = audit.find(item => item.id === amalgamId);
    expect(entry?.text).toContain("Si deux autres serviteurs amalgamés");
  }
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

for (const card of AMALGAMS) {
  test(`${card.id}: 0 Echo refuses by cost, not by other Amalgams`, async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openHiddenScenario(page, AMALGAM_ZERO_ECHOES_SCENARIO);

    const before = await ruleSnapshot(page, card.id);
    expect(before.condition.code).toBe("no-condition");
    expect(before.resources.souls).toBe(0);
    expect(before.boardIds.filter(id => AMALGAMS.some(amalgam => amalgam.id === id))).toEqual([]);

    await playCardThroughGameEntryPoint(page, card.id);
    const after = await ruleSnapshot(page, card.id);

    await testInfo.attach(`${card.id}-zero-echoes-state`, {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({before, after}, null, 2), "utf8")
    });
    if (card.id === "MV000006") await page.screenshot({path: "test-results/huvu-amalgam-zero-echoes-blocked.png", fullPage: true});
    await attachDiagnostics(testInfo, diagnostics);

    expect(after.hand).toEqual(before.hand);
    expect(after.boardIds).toEqual(before.boardIds);
    expect(after.resources).toEqual(before.resources);
    expect(after.graveyard).toEqual(before.graveyard);
    expect(after.deckCount).toBe(before.deckCount);
    expect(after.cardsPlayedThisTurn).toBe(before.cardsPlayedThisTurn);
    expect(after.decisionOpen).toBe(false);
    expect(after.errorText).toMatch(/Écho|Échos/);
    expect(after.errorText).not.toMatch(/autres? serviteurs? amalgamés|deux autres/i);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });

  test(`${card.id}: 3 Echoes and no allied Amalgam allows invocation`, async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openHiddenScenario(page, AMALGAM_THREE_ECHOES_SCENARIO);

    const before = await ruleSnapshot(page, card.id);
    expect(before.condition.code).toBe("no-condition");
    expect(before.resources.souls).toBe(3);
    expect(before.boardIds.filter(id => AMALGAMS.some(amalgam => amalgam.id === id))).toEqual([]);

    await playCardThroughGameEntryPoint(page, card.id);
    const after = await ruleSnapshot(page, card.id);

    await testInfo.attach(`${card.id}-three-echoes-state`, {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({before, after}, null, 2), "utf8")
    });
    if (card.id === "MV000006") await page.screenshot({path: "test-results/huvu-amalgam-three-echoes-allowed.png", fullPage: true});
    await attachDiagnostics(testInfo, diagnostics);

    expect(after.hand).not.toContain(card.id);
    expect(after.boardIds).toContain(card.id);
    expect(after.servantCount).toBe(before.servantCount + 1);
    expect(after.resources.souls).toBe(0);
    expect(totalResources(after.resources)).toBe(totalResources(before.resources) - 3);
    expect(after.graveyard).toEqual(before.graveyard);
    expect(after.deckCount).toBe(before.deckCount);
    expect(after.cardsPlayedThisTurn).toBe(before.cardsPlayedThisTurn + 1);
    expect(after.errorText).not.toMatch(/autres? serviteurs? amalgamés|deux autres/i);
    expect(after.decisionOpen).toBe(false);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });
}

for (const card of AVATARS) {
  test(`${card.id}: insufficient current cost refuses without obsolete 6 Aria condition`, async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openHiddenScenario(page, AVS_COST_INSUFFICIENT_SCENARIO);

    const before = await ruleSnapshot(page, card.id);
    expect(before.condition.code).toBe("no-condition");
    expect(before.cardMetadata.invocationCondition).toBeNull();
    expect(before.cardMetadata.invocationConditionText).toBe("");

    await playCardThroughGameEntryPoint(page, card.id);
    const after = await ruleSnapshot(page, card.id);

    await testInfo.attach(`${card.id}-cost-insufficient-state`, {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({before, after}, null, 2), "utf8")
    });
    if (card.id === "AVS000007") await page.screenshot({path: "test-results/huvu-avs-current-rule-blocked.png", fullPage: true});
    await attachDiagnostics(testInfo, diagnostics);

    expect(after.hand).toEqual(before.hand);
    expect(after.boardIds).toEqual(before.boardIds);
    expect(after.resources).toEqual(before.resources);
    expect(after.deckCount).toBe(before.deckCount);
    expect(after.errorText).toMatch(/Ressources insuffisantes|ressources ne sont pas suffisantes/i);
    expect(after.errorText).not.toContain("6 ressources Aria");
    expect(after.errorText).not.toContain("Il faut au moins 6");
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });

  test(`${card.id}: sufficient current cost allows normal play`, async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openHiddenScenario(page, AVS_COST_SUFFICIENT_SCENARIO);

    const before = await ruleSnapshot(page, card.id);
    expect(before.condition.code).toBe("no-condition");
    expect(before.cardMetadata.invocationCondition).toBeNull();

    await playCardThroughGameEntryPoint(page, card.id);
    const after = await ruleSnapshot(page, card.id);

    await testInfo.attach(`${card.id}-cost-sufficient-state`, {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({before, after}, null, 2), "utf8")
    });
    if (card.id === "AVS000007") await page.screenshot({path: "test-results/huvu-avs-current-rule-allowed.png", fullPage: true});
    await attachDiagnostics(testInfo, diagnostics);

    expect(after.hand).not.toContain(card.id);
    expect(after.boardIds).toContain(card.id);
    expect(after.servantCount).toBe(before.servantCount + 1);
    expect(after.resources.souls).toBe(before.resources.souls - card.expectedSoulPayment);
    expect(after.errorText).not.toContain("6 ressources Aria");
    expect(after.decisionOpen).toBe(false);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });
}
