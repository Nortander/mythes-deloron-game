import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { attachDiagnostics, attachPageDiagnostics, waitForVisibleHandStable } from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/huvu-impl-1-cards.json", import.meta.url), "utf8"));
const canonicalDecks = JSON.parse(fs.readFileSync(new URL("../fixtures/huvu-canonical-decks.json", import.meta.url), "utf8"));

const CONDITION_BLOCKED_SCENARIO = "huvu-impl-1-play-conditions";
const CONDITION_ALLOWED_SCENARIO = "huvu-impl-1-play-conditions-satisfied";
const TARGETING_SCENARIO = "huvu-impl-1-targeting";
const NO_TARGET_SCENARIO = "huvu-impl-1-targeting-no-valid";

const CARD_CASES = [
  {id: "MV000027", name: "Sang-lié", primitive: "PV avatar minimum", positive: true, negative: true, completeEffect: false, expectedStatus: "PARTIEL"},
  {id: "R000027", name: "Nécropole", primitive: "deck initial faction minimum", positive: true, negative: false, completeEffect: false, expectedStatus: "PARTIEL"},
  {id: "MV000016", name: "Serviteur de la Lame", primitive: "présence alliée requise", positive: true, negative: true, completeEffect: false, expectedStatus: "PARTIEL"},
  {id: "MV000017", name: "Cauchemar de la Lame", primitive: "présence alliée requise", positive: true, negative: true, completeEffect: false, expectedStatus: "PARTIEL"},
  {id: "MV000018", name: "Mage de la Lame", primitive: "présence alliée requise", positive: true, negative: true, completeEffect: false, expectedStatus: "PARTIEL"},
  {id: "MV000019", name: "Forgeron de la Lame", primitive: "présence alliée requise", positive: true, negative: true, completeEffect: false, expectedStatus: "PARTIEL"},
  {id: "MV000021", name: "Scorpion de la Lame", primitive: "présence alliée requise", positive: true, negative: true, completeEffect: false, expectedStatus: "PARTIEL"},
  {id: "S000005", name: "Assassinat", primitive: "ciblage ennemi légal", positive: true, negative: true, completeEffect: true, expectedStatus: "FONCTIONNEL_TESTE"}
];

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

function countById(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

async function openScenario(page, scenario) {
  const params = new URLSearchParams({scenario, impl1: `${Date.now()}-${Math.random()}`});
  await page.goto(`/code/partie-test-1.html?${params.toString()}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await waitForVisibleHandStable(page);
}

async function snapshot(page, cardId) {
  return page.evaluate((id) => {
    const player = playerState(currentPlayer);
    const opponent = opponentOf(player);
    const boardIds = (p) => Array.from(qs(playerZoneSelector(p, "servants"))?.querySelectorAll(".fc:not([data-dead])") || []).map(fc => ({
      id: fc.dataset.id || "",
      instance: fc.dataset.instance || "",
      atk: Number(fc.dataset.atk || 0),
      pdv: Number(fc.dataset.pdv || 0)
    }));
    const avatarHp = (p) => Number(qs(playerZoneSelector(p, "avatar"))?.querySelector(".av-stat:nth-child(2) span")?.textContent || 0);
    return {
      scenarioId: selectedScenarioId(),
      currentPlayer,
      hand: [...player.hand],
      board: boardIds(player),
      opponentBoard: boardIds(opponent),
      resources: {
        classical: {...player.resourceState.classical},
        souls: player.resourceState.souls,
        revision: player.resourceState.revision
      },
      graveyard: [...player.graveyard],
      opponentGraveyard: [...opponent.graveyard],
      deckCount: player.drawPile.length,
      opponentDeckCount: opponent.drawPile.length,
      cardsPlayedThisTurn,
      avatarHp: avatarHp(player),
      condition: auditInvocationCondition(id, player),
      target: auditTargetRequirement(id, player),
      affordability: getCardAffordabilityResult(id, player),
      errorText: document.querySelector("#errMsg")?.innerText || "",
      errorCode: document.querySelector("[data-testid='impl1-legality-diagnostic']")?.dataset.code || "",
      panel: typeof getHuvuTestResourcePanelSnapshot === "function" ? getHuvuTestResourcePanelSnapshot() : null,
      publicScenarioValues: Array.from(document.querySelectorAll("#scenarioSelect option")).map(option => option.value)
    };
  }, cardId);
}

async function playServant(page, cardId) {
  const result = await page.evaluate(async (id) => {
    const player = playerState(currentPlayer);
    const slot = qs(playerZoneSelector(player, "servants"))?.querySelector(".slot");
    return playCard(id, slot);
  }, cardId);
  await page.waitForTimeout(300);
  return result;
}

async function playSpell(page, cardId, selectedTargetInstance = null) {
  const result = await page.evaluate(async ({id, selected}) => {
    const options = selected ? {selectedTargetIds: [selected]} : {};
    return playCard(id, null, options);
  }, {id: cardId, selected: selectedTargetInstance});
  await page.waitForTimeout(900);
  return result;
}

async function boardInstance(page, cardId, playerKey = "player2") {
  return page.evaluate(({id, key}) => {
    const fc = qs(playerZoneSelector(key, "servants"))?.querySelector(`.fc[data-id="${id}"]:not([data-dead])`);
    return fc?.dataset.instance || "";
  }, {id: cardId, key: playerKey});
}

function rectsOverlap(a, b) {
  if (!a || !b) return false;
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

async function elementRect(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height};
  }, selector);
}

async function assertDecisionModalOpenContract(page) {
  const overlay = page.locator(".decision-modal-overlay[data-decision-id='board-target-selection']");
  await expect(overlay).toBeVisible();
  await expect(overlay.locator(".decision-modal-minimize")).toBeVisible();
  await expect(overlay.locator(".decision-modal-expand")).toHaveCount(0);
  await expect(page.locator(".decision-compact-bar")).toHaveCount(0);
  const title = await elementRect(page, ".decision-modal-overlay[data-decision-id='board-target-selection'] .sort-choice-title");
  const minimize = await elementRect(page, ".decision-modal-overlay[data-decision-id='board-target-selection'] .decision-modal-minimize");
  expect(rectsOverlap(title, minimize)).toBe(false);
}

function occurrenceCount(values, id) {
  return values.filter(value => value === id).length;
}

async function zoneRect(page, playerKey, zone) {
  return page.evaluate(({key, zoneName}) => {
    const el = qs(playerZoneSelector(key, zoneName));
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height};
  }, {key: playerKey, zoneName: zone});
}

async function openManualTargetSelection(page) {
  await page.evaluate(() => { window.__impl1bPendingPlay = playCard("S000005"); });
  await expect(page.locator(".decision-modal-overlay[data-decision-id='board-target-selection']")).toBeVisible();
}

test("HUVU-IMPL-1 scope is explicit and technical scenarios stay hidden", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, CONDITION_BLOCKED_SCENARIO);
  const state = await snapshot(page, "MV000027");
  await attachDiagnostics(testInfo, diagnostics);

  expect(fixture.cards.map(card => card.id)).toEqual(CARD_CASES.map(card => card.id));
  expect(fixture.cards.length).toBeLessThanOrEqual(12);
  expect(CARD_CASES.filter(card => card.completeEffect).map(card => card.id)).toEqual(["S000005"]);
  expect(state.panel?.visible).toBe(true);
  await expect(page.getByTestId("test-resource-panel")).toContainText("MODE TEST — HUVU IMPL 1");
  expect(state.publicScenarioValues.filter(value => value.startsWith("huvu-"))).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("HUVU IMPL 1 technical panel collapses without blocking core zones", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, TARGETING_SCENARIO);

  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect(page.getByTestId("test-resource-panel")).toContainText("MODE TEST — HUVU IMPL 1");
  const expandedDiagnostic = await page.getByTestId("test-cost-diagnostic").textContent();

  await page.getByTestId("test-resource-panel-collapse").click();
  await expect(page.getByTestId("test-resource-panel")).toHaveCount(0);
  await expect(page.getByTestId("test-resource-panel-restore")).toBeVisible();

  const compact = await elementRect(page, "[data-testid='test-resource-panel-restore']");
  const cemetery = await zoneRect(page, "player1", "graveyard");
  const endTurn = await elementRect(page, "#btnEndTurn");
  expect(rectsOverlap(compact, cemetery)).toBe(false);
  expect(rectsOverlap(compact, endTurn)).toBe(false);

  await page.getByTestId("test-resource-panel-restore").click();
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect(page.getByTestId("test-cost-diagnostic")).toContainText(JSON.parse(expandedDiagnostic || "{}").cardId || "S000005");

  await openScenario(page, CONDITION_BLOCKED_SCENARIO);
  await expect(page.getByTestId("test-resource-panel")).toContainText("MODE TEST — HUVU IMPL 1");
  await page.getByTestId("test-resource-panel-collapse").click();
  await expect(page.getByTestId("test-resource-panel-restore")).toBeVisible();

  await openScenario(page, "hokhan-uram");
  expect(await page.locator("[data-testid='test-resource-panel'],[data-testid='test-resource-panel-restore']").count()).toBe(0);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("play conditions refuse before payment and keep state unchanged", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, CONDITION_BLOCKED_SCENARIO);

  const blockedIds = ["MV000027", "MV000016", "MV000017", "MV000018", "MV000019", "MV000021"];
  const audits = {};
  for (const id of blockedIds) audits[id] = (await snapshot(page, id)).condition;
  expect(audits.MV000027.allowed).toBe(false);
  expect(audits.MV000027.code).toBe("own-avatar-hp-too-low");
  for (const id of ["MV000016", "MV000017", "MV000018", "MV000019", "MV000021"]) {
    expect(audits[id].allowed, `${id} should be blocked without Hokhan or Forgeron`).toBe(false);
    expect(audits[id].code).toBe("missing-required-board-presence");
  }

  const before = await snapshot(page, "MV000027");
  await playServant(page, "MV000027");
  const after = await snapshot(page, "MV000027");
  await testInfo.attach("condition-refusal-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, after, audits}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(after.hand).toEqual(before.hand);
  expect(after.board).toEqual(before.board);
  expect(after.resources).toEqual(before.resources);
  expect(after.graveyard).toEqual(before.graveyard);
  expect(after.deckCount).toBe(before.deckCount);
  expect(after.cardsPlayedThisTurn).toBe(before.cardsPlayedThisTurn);
  expect(after.errorText).toBe("Vous ne remplissez pas les conditions pour jouer cette carte.");
  expect(after.errorCode).toBe("own-avatar-hp-too-low");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("satisfied play conditions allow the card to enter the board without changing deck composition", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, CONDITION_ALLOWED_SCENARIO);

  for (const id of ["MV000027", "R000027", "MV000016", "MV000017", "MV000018", "MV000019", "MV000021"]) {
    const condition = (await snapshot(page, id)).condition;
    expect(condition.allowed, `${id} condition`).toBe(true);
  }

  const before = await snapshot(page, "MV000027");
  const result = await playServant(page, "MV000027");
  const after = await snapshot(page, "MV000027");
  await testInfo.attach("condition-allowed-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, after, result}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result?.success).toBe(true);
  expect(before.hand).toContain("MV000027");
  expect(after.hand).not.toContain("MV000027");
  expect(after.board.map(card => card.id)).toContain("MV000027");
  expect(after.resources.souls).toBe(before.resources.souls);
  expect(after.deckCount).toBe(before.deckCount);
  expect(after.cardsPlayedThisTurn).toBe(before.cardsPlayedThisTurn + 1);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Blade servant previews expose invocation condition panels without losing abilities", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, CONDITION_ALLOWED_SCENARIO);

  for (const id of ["MV000016", "MV000017", "MV000018", "MV000021"]) {
    await page.evaluate(cardId => openCardPreview(cardId, {origin: "impl1c-test", sourceType: "test"}), id);
    const conditionPanel = page.locator(".canonical-keyword-tooltip[data-tooltip-kind='invocation-condition']");
    await expect(conditionPanel).toBeVisible();
    await expect(page.locator(".fz-desc-inner .fc-zoom-condition-panel")).toHaveCount(0);
    const placement = await page.evaluate(() => {
      const layer = document.querySelector("#card-preview-layer");
      const panel = layer?.querySelector(".canonical-keyword-tooltip[data-tooltip-kind='invocation-condition']");
      const preview = layer?.querySelector(".canonical-card-preview");
      const body = layer?.querySelector(".fz-desc-inner");
      return {
        outsidePreview: !!panel && !!preview && !preview.contains(panel),
        outsideBody: !!panel && !!body && !body.contains(panel),
        bodyText: body?.innerText || ""
      };
    });
    expect(placement.outsidePreview).toBe(true);
    expect(placement.outsideBody).toBe(true);
    expect(placement.bodyText).not.toContain("CONDITION");
    const previewText = await page.locator("#card-preview-layer").innerText();
    expect(previewText).toContain("CONDITION");
    expect(previewText).toContain("Forgeron de la Lame");
    expect(previewText).toContain("Mage du Cercle");
    expect(previewText).toContain("Hokhan Ashir");
    expect(previewText).not.toMatch(/MV000019|AVS000008/);
    if (id !== "MV000016") expect(previewText).toContain("Initiative");
    await page.evaluate(() => closeCardPreview("impl1c-test"));
  }

  await page.evaluate(cardId => openCardPreview(cardId, {origin: "impl1c-test", sourceType: "test"}), "MV000019");
  const forgeronConditionPanel = page.locator(".canonical-keyword-tooltip[data-tooltip-kind='invocation-condition']");
  await expect(forgeronConditionPanel).toBeVisible();
  const forgeronConditionText = await forgeronConditionPanel.innerText();
  expect(forgeronConditionText).toContain("Hokhan Ashir");
  expect(forgeronConditionText).not.toContain("Forgeron de la Lame");
  const forgeronText = await page.locator("#card-preview-layer").innerText();
  expect(forgeronText).toContain("Scorpion de la Lame");
  expect(forgeronText).toContain("Serviteur de la Lame");
  expect(forgeronText).toContain("Mage de la Lame");
  expect(forgeronText).toContain("Cauchemar de la Lame");
  expect(forgeronText).not.toMatch(/MV000016|MV000017|MV000018|MV000021/);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Forgeron de la Lame mapping is visible in Collection without raw generated IDs", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await page.goto("/code/collection.html");
  await page.evaluate(() => openModal("MV000019"));
  await expect(page.locator("#modalOverlay.open")).toBeVisible();
  const modalText = await page.locator("#modalOverlay").innerText();
  const source = await page.evaluate(() => {
    const card = CARDS.find(c => c.id === "MV000019");
    return {related: card.related, detail: card.detail || "", desc: card.desc || "", keywords: card.kw || []};
  });
  await testInfo.attach("forgeron-collection-source", {contentType: "application/json", body: Buffer.from(JSON.stringify(source, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(modalText).toContain("Scorpion de la Lame");
  expect(modalText).toContain("Serviteur de la Lame");
  expect(modalText).toContain("Mage de la Lame");
  expect(modalText).toContain("Cauchemar de la Lame");
  expect(modalText).toContain("Insensible");
  expect(modalText).not.toMatch(/MV000016|MV000017|MV000018|MV000021/);
  expect(source.related).toEqual(expect.arrayContaining(["MV000016", "MV000021", "MV000018", "MV000017"]));
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Assassinat refuses an explicitly illegal target before payment", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, TARGETING_SCENARIO);

  const illegalTarget = await boardInstance(page, "H000029");
  expect(illegalTarget).toBeTruthy();
  const invalidAudit = await page.evaluate((instance) => auditTargetRequirement("S000005", currentPlayer, [instance]), illegalTarget);
  expect(invalidAudit.allowed).toBe(false);
  expect(invalidAudit.code).toBe("invalid-target");

  const before = await snapshot(page, "S000005");
  await playSpell(page, "S000005", illegalTarget);
  const after = await snapshot(page, "S000005");
  await testInfo.attach("illegal-target-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, after, invalidAudit}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(after.hand).toEqual(before.hand);
  expect(after.board).toEqual(before.board);
  expect(after.opponentBoard).toEqual(before.opponentBoard);
  expect(after.resources).toEqual(before.resources);
  expect(after.graveyard).toEqual(before.graveyard);
  expect(after.opponentGraveyard).toEqual(before.opponentGraveyard);
  expect(after.cardsPlayedThisTurn).toBe(before.cardsPlayedThisTurn);
  expect(after.errorText).toBe("Cette cible n’est pas valide.");
  expect(after.errorCode).toBe("invalid-target");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Assassinat refuses when no legal target exists", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, NO_TARGET_SCENARIO);

  const before = await snapshot(page, "S000005");
  expect(before.target.allowed).toBe(false);
  expect(before.target.code).toBe("no-valid-target");
  await playSpell(page, "S000005");
  const after = await snapshot(page, "S000005");
  await attachDiagnostics(testInfo, diagnostics);

  expect(after.hand).toEqual(before.hand);
  expect(after.opponentBoard).toEqual(before.opponentBoard);
  expect(after.resources).toEqual(before.resources);
  expect(after.graveyard).toEqual(before.graveyard);
  expect(after.opponentGraveyard).toEqual(before.opponentGraveyard);
  expect(after.cardsPlayedThisTurn).toBe(before.cardsPlayedThisTurn);
  expect(after.errorText).toBe("Aucune cible valide n’est disponible.");
  expect(after.errorCode).toBe("no-valid-target");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Assassinat destroys the selected legal enemy servant and pays exactly once", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, TARGETING_SCENARIO);

  const legalTarget = await boardInstance(page, "H000001");
  expect(legalTarget).toBeTruthy();
  const before = await snapshot(page, "S000005");
  expect(before.target.allowed).toBe(true);
  expect(before.target.legalTargets.map(target => target.id)).toContain("H000001");
  expect(before.target.legalTargets.map(target => target.id)).not.toContain("H000029");

  const result = await playSpell(page, "S000005", legalTarget);
  const after = await snapshot(page, "S000005");
  await page.screenshot({path: "test-results/huvu-impl-1-targeting.png", fullPage: true});
  await testInfo.attach("assassination-success-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, after, result}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result?.success).toBe(true);
  expect(result?.spellResolution?.reason).toBe("target-destroyed");
  expect(result?.spellMovedToGraveyard).toBe(true);
  expect(before.hand).toContain("S000005");
  expect(after.hand).not.toContain("S000005");
  expect(before.resources.classical.aria).toBe(5);
  expect(before.affordability.classicalContribution).toEqual({aria: 5});
  expect(before.affordability.paymentPlan.soulsToConsume).toBe(0);
  expect(after.resources.classical.aria).toBe(5);
  expect(after.resources.souls).toBe(before.resources.souls);
  expect(result.paymentResult.soulsConsumed).toBe(0);
  expect(after.opponentBoard.map(card => card.id)).not.toContain("H000001");
  expect(after.opponentBoard.map(card => card.id)).toContain("H000029");
  expect(occurrenceCount(after.graveyard, "S000005")).toBe(occurrenceCount(before.graveyard, "S000005") + 1);
  expect(after.opponentGraveyard).toContain("H000001");
  expect(occurrenceCount(after.opponentGraveyard, "H000001")).toBe(occurrenceCount(before.opponentGraveyard, "H000001") + 1);
  expect(after.cardsPlayedThisTurn).toBe(before.cardsPlayedThisTurn + 1);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Assassinat target choice uses one open control and one compact restore control", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await page.setViewportSize({width: 1280, height: 720});
  await openScenario(page, TARGETING_SCENARIO);
  await page.getByTestId("test-resource-panel-collapse").click();
  await expect(page.getByTestId("test-resource-panel-restore")).toBeVisible();

  const before = await snapshot(page, "S000005");
  await openManualTargetSelection(page);
  await assertDecisionModalOpenContract(page);
  await expect(page.getByTestId("board-target-confirm")).toBeDisabled();
  expect(await page.getByTestId("board-target-choice").count()).toBeGreaterThan(0);

  const legalChoice = page.locator("[data-testid='board-target-choice'][data-target-id='H000001']");
  await legalChoice.click();
  await expect(page.getByTestId("board-target-confirm")).toBeEnabled();
  await page.locator(".decision-modal-minimize").click();
  await expect(page.locator(".decision-modal-overlay[data-decision-id='board-target-selection']")).toHaveCount(0);
  await expect(page.locator(".decision-compact-bar")).toBeVisible();
  await expect(page.locator(".decision-compact-bar button")).toHaveText("AGRANDIR");
  await expect(page.locator(".decision-modal-minimize")).toHaveCount(0);
  await page.locator(".decision-compact-bar button").click();
  await assertDecisionModalOpenContract(page);
  await expect(legalChoice).toHaveClass(/is-selected/);

  await expect(page.getByTestId("board-target-confirm")).toBeEnabled();
  await page.getByTestId("board-target-confirm").click();
  const abandon = page.locator("#assassination-abandon");
  if (await abandon.isVisible({timeout: 1000}).catch(() => false)) {
    await abandon.click();
  }
  const result = await page.evaluate(() => window.__impl1bPendingPlay);

  const after = await snapshot(page, "S000005");
  const cemetery = await zoneRect(page, "player2", "graveyard");
  const compact = await elementRect(page, "[data-testid='test-resource-panel-restore']");
  await testInfo.attach("assassination-modal-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, after, result, cemetery, compact}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(before.hand).toContain("S000005");
  expect(after.hand).not.toContain("S000005");
  expect(result?.success).toBe(true);
  expect(result?.spellMovedToGraveyard).toBe(true);
  expect(after.opponentBoard.map(card => card.id)).not.toContain("H000001");
  expect(after.graveyard).toContain("S000005");
  expect(after.opponentGraveyard).toContain("H000001");
  expect(rectsOverlap(compact, cemetery)).toBe(false);
  await page.getByTestId("test-resource-panel-restore").click();
  await expect(page.getByTestId("impl1-legality-diagnostic")).toHaveAttribute("data-code", "play-legal");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Assassinat target choice keeps title and controls separated on a wide viewport", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await page.setViewportSize({width: 1600, height: 900});
  await openScenario(page, TARGETING_SCENARIO);
  await openManualTargetSelection(page);
  await assertDecisionModalOpenContract(page);

  const legalChoice = page.locator("[data-testid='board-target-choice'][data-target-id='H000001']");
  await legalChoice.click();
  await page.getByTestId("board-target-confirm").click();
  const abandon = page.locator("#assassination-abandon");
  if (await abandon.isVisible({timeout: 1000}).catch(() => false)) await abandon.click();
  await page.evaluate(() => window.__impl1bPendingPlay);

  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("canonical Hokhan/Uram deck invariants remain unchanged", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "hokhan-uram");

  const runtime = await page.evaluate(() => ({
    deckHokhan: [...DECK_HOKHAN],
    deckUram: [...DECK_URAM],
    startOuiHokhan: [...START_OUI_HOKHAN],
    startMaybeHokhan: [...START_MAYBE_HOKHAN],
    startOuiUram: [...START_OUI_URAM],
    startMaybeUram: [...START_MAYBE_URAM],
    avatars: {hokhan: DECK_HOKHAN[0], uram: DECK_URAM[0]},
    publicScenarioValues: Array.from(document.querySelectorAll("#scenarioSelect option")).map(option => option.value),
    publicTestPanelCount: document.querySelectorAll("[data-testid='test-resource-panel']").length
  }));
  await attachDiagnostics(testInfo, diagnostics);

  expect(runtime.deckHokhan.length).toBe(60);
  expect(Object.keys(countById(runtime.deckHokhan)).length).toBe(45);
  expect(runtime.deckUram.length).toBe(60);
  expect(Object.keys(countById(runtime.deckUram)).length).toBe(37);
  expect(runtime.deckHokhan).toEqual(canonicalDecks.participants.hokhan.expandedDeck);
  expect(runtime.deckUram).toEqual(canonicalDecks.participants.uram.expandedDeck);
  expect(runtime.startOuiHokhan).toEqual(["MV000001", "MV000026", "MV000027", "R000021", "R000027"]);
  expect(runtime.startMaybeHokhan).toEqual(["R000010"]);
  expect(runtime.startOuiUram).toEqual(["GOB000002", "H000001", "ORC000003", "R000001", "R000013"]);
  expect(runtime.startMaybeUram).toEqual(["DIV000002"]);
  expect(runtime.avatars).toEqual({hokhan: "AVS000008", uram: "AVS000007"});
  expect(runtime.publicScenarioValues.filter(value => value.startsWith("huvu-"))).toEqual([]);
  expect(runtime.publicTestPanelCount).toBe(0);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
