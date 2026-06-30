import { expect, test } from "@playwright/test";
import { attachDiagnostics, attachPageDiagnostics, waitForVisibleHandStable } from "./helpers/eloron-ui.mjs";

const GENERIC_RESOURCE_MESSAGE = "Vous manquez de ressources pour jouer cette carte.";
const AMALGAM_ZERO_ECHOES_SCENARIO = "huvu-amalgam-zero-echoes";
const AMALGAM_THREE_ECHOES_SCENARIO = "huvu-amalgam-three-echoes";
const HOKHAN_COST_INSUFFICIENT_SCENARIO = "huvu-hokhan-cost-insufficient";
const HOKHAN_COST_EXACT_SCENARIO = "huvu-hokhan-cost-exact";
const URAM_ARIA_INSUFFICIENT_SCENARIO = "huvu-uram-aria-insufficient";
const URAM_ECHO_INSUFFICIENT_SCENARIO = "huvu-uram-echo-insufficient";
const URAM_COST_EXACT_SCENARIO = "huvu-uram-cost-exact";
const ALTERNATIVE_COST_INSUFFICIENT_SCENARIO = "huvu-alternative-cost-insufficient";

const AMALGAMS = [
  {id: "MV000004", name: "Amalgame terrifiant"},
  {id: "MV000005", name: "Amalgame rageur"},
  {id: "MV000006", name: "Amalgame erratique"}
];

const HUVU_TARGET_IDS = ["AVS000007", "AVS000008", ...AMALGAMS.map(card => card.id)];

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

function totalResources(resources) {
  return Object.values(resources.classical || {}).reduce((sum, value) => sum + Number(value || 0), 0) + Number(resources.souls || 0);
}

async function openScenario(page, scenario) {
  const params = new URLSearchParams({scenario, huvu2c: `${Date.now()}-${Math.random()}`});
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
    const affordability = getCardAffordabilityResult(id, player);
    return {
      scenarioId: selectedScenarioId(),
      scenario: {
        label: activeScenario?.label || "",
        participants: activeScenario?.participants || [],
        hasTop: !!activeScenario?.top,
        hasBottom: !!activeScenario?.bottom,
        topName: activeScenario?.top?.name || "",
        bottomName: activeScenario?.bottom?.name || "",
        hidden: !!activeScenario?.hidden,
        showTestResourcePanel: !!activeScenario?.showTestResourcePanel
      },
      currentPlayer,
      condition,
      affordability,
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
      errorClass: document.querySelector("#errMsg")?.className || "",
      errorDurationMs: Number(document.querySelector("#errMsg")?.dataset.messageDurationMs || 0),
      decisionOpen: !!document.querySelector(".decision-modal-overlay,.sort-choice-overlay"),
      testPanel: typeof getHuvuTestResourcePanelSnapshot === "function" ? getHuvuTestResourcePanelSnapshot() : null,
      selectScenarioValues: Array.from(document.querySelectorAll("#scenarioSelect option")).map(option => option.value)
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
  await page.waitForTimeout(250);
  return result;
}

function expectGenericResourceMessage(snapshot) {
  expect(snapshot.errorText).toBe(GENERIC_RESOURCE_MESSAGE);
  expect(snapshot.errorText).not.toMatch(/requis|disponible|minimum|total|Aria|Écho|Échos|\+| ou |\{|\}|insufficient-resources/i);
}

function expectInsufficientDiagnostic(snapshot, cardId) {
  expect(snapshot.testPanel?.visible).toBe(true);
  expect(snapshot.testPanel?.last?.cardId).toBe(cardId);
  expect(snapshot.testPanel?.last?.code).toBe("insufficient-resources");
  expect(snapshot.testPanel?.last?.publicMessage).toBe(GENERIC_RESOURCE_MESSAGE);
  expect(snapshot.testPanel?.last?.failedRequirements?.length).toBeGreaterThan(0);
}

test("Hokhan Ashir Vs Uram keeps its detailed scenario definition", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "hokhan-uram");
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
  await openScenario(page, AMALGAM_ZERO_ECHOES_SCENARIO);
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
  }), HUVU_TARGET_IDS);
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

test("technical HUVU resource panel is absent from public scenarios and public select", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "hokhan-uram");
  const snapshot = await ruleSnapshot(page, "MV000006");
  await page.screenshot({path: "test-results/huvu-public-no-test-panel.png", fullPage: true});
  await attachDiagnostics(testInfo, diagnostics);

  expect(snapshot.testPanel?.visible).toBe(false);
  await expect(page.getByTestId("test-resource-panel")).toHaveCount(0);
  expect(snapshot.selectScenarioValues.filter(value => value.startsWith("huvu-"))).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

for (const card of AMALGAMS) {
  test(`${card.id}: 0 Echo refuses by simple cost with generic public message`, async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openScenario(page, AMALGAM_ZERO_ECHOES_SCENARIO);

    const before = await ruleSnapshot(page, card.id);
    expect(before.condition.code).toBe("no-condition");
    expect(before.resources.souls).toBe(0);
    expect(before.testPanel?.visible).toBe(true);
    expect(before.boardIds.filter(id => AMALGAMS.some(amalgam => amalgam.id === id))).toEqual([]);

    await playCardThroughGameEntryPoint(page, card.id);
    const after = await ruleSnapshot(page, card.id);

    await testInfo.attach(`${card.id}-zero-echoes-state`, {contentType: "application/json", body: Buffer.from(JSON.stringify({before, after}, null, 2), "utf8")});
    if (card.id === "MV000006") await page.screenshot({path: "test-results/huvu-amalgam-zero-echoes-blocked.png", fullPage: true});
    await attachDiagnostics(testInfo, diagnostics);

    expect(after.hand).toEqual(before.hand);
    expect(after.boardIds).toEqual(before.boardIds);
    expect(after.resources).toEqual(before.resources);
    expect(after.graveyard).toEqual(before.graveyard);
    expect(after.deckCount).toBe(before.deckCount);
    expect(after.cardsPlayedThisTurn).toBe(before.cardsPlayedThisTurn);
    expect(after.decisionOpen).toBe(false);
    expectGenericResourceMessage(after);
    expectInsufficientDiagnostic(after, card.id);
    expect(after.testPanel.last.technicalMessage).toMatch(/Écho|Échos/);
    expect(after.testPanel.last.technicalMessage).not.toMatch(/autres? serviteurs? amalgamés|deux autres/i);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });

  test(`${card.id}: 3 Echoes and no allied Amalgam allows invocation`, async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openScenario(page, AMALGAM_THREE_ECHOES_SCENARIO);

    const before = await ruleSnapshot(page, card.id);
    expect(before.condition.code).toBe("no-condition");
    expect(before.resources.souls).toBe(3);
    expect(before.boardIds.filter(id => AMALGAMS.some(amalgam => amalgam.id === id))).toEqual([]);

    await playCardThroughGameEntryPoint(page, card.id);
    const after = await ruleSnapshot(page, card.id);

    await testInfo.attach(`${card.id}-three-echoes-state`, {contentType: "application/json", body: Buffer.from(JSON.stringify({before, after}, null, 2), "utf8")});
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
    expect(after.testPanel?.last?.code).toBe("affordable");
    expect(after.testPanel?.last?.paymentPlan?.soulsToConsume).toBe(3);
    expect(after.decisionOpen).toBe(false);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });
}

test("AVS000007: Hokhan boundary refuses with 9 Aria even when total resource count reaches 13", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, HOKHAN_COST_INSUFFICIENT_SCENARIO);

  const before = await ruleSnapshot(page, "AVS000007");
  expect(before.resources.classical.aria).toBe(9);
  expect(before.resources.classical.fer).toBe(4);
  expect(before.affordability.effectiveCost.total).toBe(13);
  expect(before.affordability.effectiveCost.requirements).toContainEqual(expect.objectContaining({kind: "minimum", resource: "aria", amount: 10}));
  expect(before.affordability.playable).toBe(false);

  await playCardThroughGameEntryPoint(page, "AVS000007");
  const after = await ruleSnapshot(page, "AVS000007");

  await page.screenshot({path: "test-results/huvu-hokhan-cost-insufficient-visible-resources.png", fullPage: true});
  await testInfo.attach("hokhan-cost-insufficient-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(after.hand).toEqual(before.hand);
  expect(after.resources).toEqual(before.resources);
  expect(after.boardIds).toEqual(before.boardIds);
  expectGenericResourceMessage(after);
  expectInsufficientDiagnostic(after, "AVS000007");
  expect(after.testPanel.last.failedRequirements).toContainEqual(expect.objectContaining({resource: "aria", required: 10, available: 9}));
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("AVS000007: Hokhan exact cost uses 10 Aria plus 3 flexible points without consuming Echoes", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, HOKHAN_COST_EXACT_SCENARIO);

  const before = await ruleSnapshot(page, "AVS000007");
  expect(before.resources.classical.aria).toBe(10);
  expect(before.resources.classical.fer).toBe(3);
  expect(before.resources.souls).toBe(0);
  expect(before.affordability.playable).toBe(true);
  expect(before.affordability.classicalContribution).toEqual({aria: 10, fer: 3});
  expect(before.affordability.paymentPlan.soulsToConsume).toBe(0);

  await playCardThroughGameEntryPoint(page, "AVS000007");
  const after = await ruleSnapshot(page, "AVS000007");

  await page.screenshot({path: "test-results/huvu-hokhan-cost-exact-visible-resources.png", fullPage: true});
  await testInfo.attach("hokhan-cost-exact-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(after.hand).not.toContain("AVS000007");
  expect(after.boardIds).toContain("AVS000007");
  expect(after.resources.souls).toBe(0);
  expect(after.resources.classical.aria).toBe(10);
  expect(after.resources.classical.fer).toBe(3);
  expect(after.testPanel?.last?.code).toBe("affordable");
  expect(after.testPanel?.last?.paymentPlan?.soulsToConsume).toBe(0);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

const URAM_CASES = [
  {scenario: URAM_ARIA_INSUFFICIENT_SCENARIO, screenshot: "test-results/huvu-uram-aria-insufficient.png", expectedResources: {aria: 4, souls: 8}, expectedFailure: {resource: "aria", required: 5, available: 4}},
  {scenario: URAM_ECHO_INSUFFICIENT_SCENARIO, screenshot: "test-results/huvu-uram-echo-insufficient.png", expectedResources: {aria: 5, souls: 7}, expectedFailure: {resource: "soul", required: 8, available: 7}}
];

for (const item of URAM_CASES) {
  test(`AVS000008: ${item.scenario} refuses with generic public message and precise diagnostic`, async ({ page }, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openScenario(page, item.scenario);

    const before = await ruleSnapshot(page, "AVS000008");
    expect(before.resources.classical.aria).toBe(item.expectedResources.aria);
    expect(before.resources.souls).toBe(item.expectedResources.souls);
    expect(before.affordability.playable).toBe(false);

    await playCardThroughGameEntryPoint(page, "AVS000008");
    const after = await ruleSnapshot(page, "AVS000008");

    await page.screenshot({path: item.screenshot, fullPage: true});
    await testInfo.attach(`${item.scenario}-state`, {contentType: "application/json", body: Buffer.from(JSON.stringify({before, after}, null, 2), "utf8")});
    await attachDiagnostics(testInfo, diagnostics);

    expect(after.hand).toEqual(before.hand);
    expect(after.resources).toEqual(before.resources);
    expect(after.boardIds).toEqual(before.boardIds);
    expectGenericResourceMessage(after);
    expectInsufficientDiagnostic(after, "AVS000008");
    expect(after.testPanel.last.failedRequirements).toContainEqual(expect.objectContaining(item.expectedFailure));
    expect(diagnostics.pageErrors).toEqual([]);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });
}

test("AVS000008: exact Aria plus Echoes cost pays only the Echo component", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, URAM_COST_EXACT_SCENARIO);

  const before = await ruleSnapshot(page, "AVS000008");
  expect(before.resources.classical.aria).toBe(5);
  expect(before.resources.souls).toBe(8);
  expect(before.affordability.playable).toBe(true);
  expect(before.affordability.classicalContribution).toEqual({aria: 5});
  expect(before.affordability.paymentPlan.soulsToConsume).toBe(8);

  await playCardThroughGameEntryPoint(page, "AVS000008");
  const after = await ruleSnapshot(page, "AVS000008");

  await page.screenshot({path: "test-results/huvu-uram-cost-exact.png", fullPage: true});
  await testInfo.attach("uram-cost-exact-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(after.hand).not.toContain("AVS000008");
  expect(after.boardIds).toContain("AVS000008");
  expect(after.resources.classical.aria).toBe(5);
  expect(after.resources.souls).toBe(0);
  expect(after.testPanel?.last?.code).toBe("affordable");
  expect(after.testPanel?.last?.paymentPlan?.soulsToConsume).toBe(8);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("generic resource message also covers alternative compatible-pool costs", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, ALTERNATIVE_COST_INSUFFICIENT_SCENARIO);

  const before = await ruleSnapshot(page, "DIV000002");
  expect(before.affordability.playable).toBe(false);
  expect(before.affordability.effectiveCost.requirements).toContainEqual(expect.objectContaining({kind: "compatiblePool"}));

  await playCardThroughGameEntryPoint(page, "DIV000002");
  const after = await ruleSnapshot(page, "DIV000002");

  await page.screenshot({path: "test-results/huvu-public-generic-resource-message.png", fullPage: true});
  await attachDiagnostics(testInfo, diagnostics);

  expect(after.hand).toEqual(before.hand);
  expect(after.resources).toEqual(before.resources);
  expectGenericResourceMessage(after);
  expectInsufficientDiagnostic(after, "DIV000002");
  expect(after.testPanel.last.failedRequirements.some(item => item.kind === "compatiblePool" || item.kind === "total")).toBe(true);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("resource refusal message remains readable for the configured important duration", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, ALTERNATIVE_COST_INSUFFICIENT_SCENARIO);

  await playCardThroughGameEntryPoint(page, "DIV000002");
  await expect(page.locator("#errMsg.show")).toHaveText(GENERIC_RESOURCE_MESSAGE);
  const duration = await page.locator("#errMsg").evaluate(element => Number(element.dataset.messageDurationMs));
  expect(duration).toBeGreaterThanOrEqual(3500);
  expect(duration).toBeLessThanOrEqual(4500);

  await page.waitForTimeout(2500);
  await expect(page.locator("#errMsg.show")).toHaveText(GENERIC_RESOURCE_MESSAGE);
  await page.waitForTimeout(duration - 2500 + 500);
  await expect(page.locator("#errMsg.show")).toHaveCount(0);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
