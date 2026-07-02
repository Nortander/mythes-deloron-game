import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { attachDiagnostics, attachPageDiagnostics } from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/huvu-impl-2-cards.json", import.meta.url), "utf8"));

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

async function openScenario(page, scenario) {
  const params = new URLSearchParams({scenario, impl2: `${Date.now()}-${Math.random()}`});
  await page.goto(`/code/partie-test-1.html?${params.toString()}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForTimeout(350);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const board = (playerKey) => Array.from(qs(playerZoneSelector(playerKey, "servants"))?.querySelectorAll(".fc:not([data-dead])") || []).map(fc => ({
      id: fc.dataset.id || "",
      instance: fc.dataset.instance || "",
      atk: Number(fc.dataset.atk || 0),
      pdv: Number(fc.dataset.pdv || 0),
      pdvMax: Number(fc.dataset.pdvMax || 0),
      exhausted: fc.dataset.exhausted === "1"
    }));
    const avatarHp = (playerKey) => Number(qs(playerZoneSelector(playerKey, "avatar"))?.querySelector(".av-stat:nth-child(2) span")?.textContent || 0);
    return {
      scenarioId: selectedScenarioId(),
      currentPlayer,
      hand: [...playerState(currentPlayer).hand],
      resources: {
        classical: {...playerState(currentPlayer).resourceState.classical},
        souls: playerState(currentPlayer).resourceState.souls
      },
      board: board("player1"),
      opponentBoard: board("player2"),
      graveyard: [...playerState("player1").graveyard],
      opponentGraveyard: [...playerState("player2").graveyard],
      avatarHp: avatarHp("player1"),
      opponentAvatarHp: avatarHp("player2"),
      panel: typeof getHuvuTestResourcePanelSnapshot === "function" ? getHuvuTestResourcePanelSnapshot() : null,
      publicScenarioValues: Array.from(document.querySelectorAll("#scenarioSelect option")).map(option => option.value),
      errorText: document.querySelector("#errMsg")?.innerText || ""
    };
  });
}

async function playServant(page, cardId) {
  const result = await page.evaluate(async (id) => {
    const player = playerState(currentPlayer);
    const slot = qs(playerZoneSelector(player, "servants"))?.querySelector(".slot");
    return playCard(id, slot);
  }, cardId);
  await page.waitForTimeout(250);
  return result;
}

async function clearOpponentServants(page) {
  await page.evaluate(() => {
    const zone = qs(playerZoneSelector("player2", "servants"));
    Array.from(zone?.querySelectorAll(".fc") || []).forEach(fc => {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.dataset.player = "player2";
      fc.replaceWith(slot);
    });
  });
}

async function resolveCombatById(page, attackerId, targetId) {
  const result = await page.evaluate(async ({attackerCard, targetCard}) => {
    const attacker = qs(playerZoneSelector("player1", "servants"))?.querySelector(`.fc[data-id="${attackerCard}"]:not([data-dead])`);
    const target = qs(playerZoneSelector("player2", "servants"))?.querySelector(`.fc[data-id="${targetCard}"]:not([data-dead])`);
    await resolveCombat(attacker, target);
    return {attacker: attacker ? {...attacker.dataset} : null, target: target ? {...target.dataset} : null};
  }, {attackerCard: attackerId, targetCard: targetId});
  await page.waitForTimeout(250);
  return result;
}

test("HUVU IMPL 2 scope is explicit and technical scenarios stay hidden", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-2-damage");
  const state = await snapshot(page);
  await attachDiagnostics(testInfo, diagnostics);

  expect(fixture.cards.map(card => card.id)).toEqual(["B000002", "MV000010", "MV000017", "MV000020", "MV000021", "MV000027"]);
  expect(fixture.cards.length).toBeLessThanOrEqual(8);
  expect(state.panel?.visible).toBe(true);
  await expect(page.getByTestId("test-resource-panel")).toContainText("MODE TEST — HUVU IMPL 2");
  expect(state.publicScenarioValues.filter(value => value.startsWith("huvu-"))).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("B000002 applies self damage and immediate Rage attack update", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-2-stats");

  const before = await snapshot(page);
  const result = await playServant(page, "B000002");
  const after = await snapshot(page);
  await testInfo.attach("b000002-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  const rhaekor = after.board.find(card => card.id === "B000002");
  expect(result.success).toBe(true);
  expect(rhaekor).toMatchObject({id: "B000002", pdv: 2, atk: 7});
  expect(after.hand).not.toContain("B000002");
  expect(after.panel.last.code).toBe("affordable");
  expect(after.panel.last.costDefinition).toMatchObject({total: 3, allowedForTotal: ["nourriture"]});
  expect(after.panel.combat.code).toBe("immediate-effect-resolved");
  expect(after.panel.combat.operations[0]).toMatchObject({targetType: "servant", amount: 1, before: 3, after: 2, died: false});
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("direct Initiative damage handles non-lethal, exact lethal and overkill cases", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openScenario(page, "huvu-impl-2-damage");
  let result = await playServant(page, "MV000010");
  let after = await snapshot(page);
  expect(result.success).toBe(true);
  expect(after.opponentBoard.find(card => card.id === "H000005")?.pdv).toBe(4);
  expect(after.panel.combat.operations[0]).toMatchObject({amount: 1, before: 5, after: 4, died: false});

  await openScenario(page, "huvu-impl-2-damage");
  result = await playServant(page, "MV000021");
  after = await snapshot(page);
  expect(result.success).toBe(true);
  expect(after.opponentBoard.map(card => card.id)).not.toContain("H000005");
  expect(after.opponentGraveyard.filter(id => id === "H000005")).toHaveLength(1);
  expect(after.panel.combat.operations[0]).toMatchObject({amount: 5, before: 5, after: 0, died: true});
  expect(after.panel.combat.deferred).toContain("echo-generation-on-kill");

  await openScenario(page, "huvu-impl-2-damage");
  result = await playServant(page, "MV000017");
  after = await snapshot(page);
  expect(result.success).toBe(true);
  expect(after.opponentBoard.map(card => card.id)).not.toContain("H000005");
  expect(after.opponentGraveyard.filter(id => id === "H000005")).toHaveLength(1);
  expect(after.panel.combat.operations[0]).toMatchObject({amount: 8, before: 5, after: 0, died: true});

  await testInfo.attach("direct-damage-state", {contentType: "application/json", body: Buffer.from(JSON.stringify(after, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("MV000017 falls back to avatar damage when no enemy servant exists", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-2-damage");
  await clearOpponentServants(page);

  const before = await snapshot(page);
  const result = await playServant(page, "MV000017");
  const after = await snapshot(page);
  await testInfo.attach("avatar-fallback-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result.success).toBe(true);
  expect(before.opponentAvatarHp).toBe(10);
  expect(after.opponentAvatarHp).toBe(6);
  expect(after.panel.combat.code).toBe("immediate-effect-avatar-fallback");
  expect(after.panel.combat.operations[0]).toMatchObject({targetType: "avatar", amount: 4, before: 10, after: 6});
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("target-required immediate effects refuse before payment when no legal target exists", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-2-damage");
  await clearOpponentServants(page);

  const before = await snapshot(page);
  const result = await playServant(page, "MV000021");
  const after = await snapshot(page);
  await testInfo.attach("no-target-refusal-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result).toBeUndefined();
  expect(after.hand).toEqual(before.hand);
  expect(after.resources).toEqual(before.resources);
  expect(after.board).toEqual(before.board);
  expect(after.opponentBoard).toEqual(before.opponentBoard);
  expect(after.graveyard).toEqual(before.graveyard);
  expect(after.opponentGraveyard).toEqual(before.opponentGraveyard);
  expect(after.errorText).toContain("Aucune cible valide");
  expect(after.panel.play.code).toBe("no-valid-target");
  expect(after.panel.play.immediateEffectResult.code).toBe("no-valid-target");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("MV000027 damages its own avatar without resolving deferred Vengeance resource generation", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-2-damage");

  const before = await snapshot(page);
  const result = await playServant(page, "MV000027");
  const after = await snapshot(page);
  await testInfo.attach("mv000027-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result.success).toBe(true);
  expect(before.avatarHp).toBe(10);
  expect(after.avatarHp).toBe(7);
  expect(after.board.map(card => card.id)).toContain("MV000027");
  expect(after.panel.combat.operations[0]).toMatchObject({targetType: "avatar", targetPlayer: "player1", amount: 3, before: 10, after: 7});
  expect(after.panel.combat.deferred).toContain("vengeance-echo-generation");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("combat healing is real, capped, and recorded for MV000020", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-2-healing");

  const before = await snapshot(page);
  await resolveCombatById(page, "MV000020", "H000005");
  const after = await snapshot(page);
  await testInfo.attach("mv000020-healing-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  const goblin = after.board.find(card => card.id === "MV000020");
  expect(before.board.find(card => card.id === "MV000020")).toMatchObject({pdv: 1, pdvMax: 3});
  expect(goblin).toMatchObject({pdv: 3, pdvMax: 3, exhausted: true});
  expect(after.opponentBoard.find(card => card.id === "H000005")?.pdv).toBe(3);
  expect(after.panel.combat.code).toBe("combat-healing-resolved");
  expect(after.panel.combat.healing[0].result).toMatchObject({success: true, requested: 2, gained: 2, before: 1, after: 3, max: 3});
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
