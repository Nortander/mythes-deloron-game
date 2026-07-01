import fs from "node:fs";
import { expect, test } from "@playwright/test";
import {
  attachDiagnostics,
  attachPageDiagnostics,
  waitForVisibleHandStable
} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/huvu-canonical-decks.json", import.meta.url), "utf8"));

function countById(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function removeOnePerStartOui(expandedDeck, startOui) {
  const remaining = [...expandedDeck];
  for (const id of startOui) {
    const index = remaining.indexOf(id);
    if (index === -1) throw new Error(`Missing start OUI card ${id} in expanded deck`);
    remaining.splice(index, 1);
  }
  return remaining;
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

async function openHokhanUram(page) {
  const params = new URLSearchParams({ scenario: "hokhan-uram", deckSync: `${Date.now()}-${Math.random()}` });
  await page.goto(`/code/partie-test-1.html?${params.toString()}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe("hokhan-uram");
  await waitForVisibleHandStable(page);
}

test("canonical deck fixture preserves the XLSX multiset contract", async () => {
  expect(fixture.sourceFile).toBe("data/Decks de test - export 2026-06-24.xlsx");
  expect(fixture.sourceSha256).toBe("de325182ba548254eb1450b3e20987636300377234625a5c63eb5961b5f8be5a");
  expect(fixture.sheet).toBe("Hokhan Ashir Vs Uram");

  for (const [key, expected] of Object.entries(fixture.expectedTotals)) {
    const participant = fixture.participants[key];
    expect(participant.totalCopies, `${key} total`).toBe(expected.totalCopies);
    expect(participant.uniqueIds, `${key} unique IDs`).toBe(expected.uniqueIds);
    expect(participant.expandedDeck.length, `${key} expanded length`).toBe(expected.totalCopies);
    expect(Object.keys(countById(participant.expandedDeck)).length, `${key} counted unique IDs`).toBe(expected.uniqueIds);
  }

  expect(fixture.participants.hokhan.avatar).toBe("AVS000008");
  expect(fixture.participants.uram.avatar).toBe("AVS000007");
  expect(fixture.participants.hokhan.startOui).toEqual(["MV000001", "MV000026", "MV000027", "R000021", "R000027"]);
  expect(fixture.participants.hokhan.startMaybe).toEqual(["MV000002", "R000010"]);
  expect(fixture.participants.uram.startOui).toEqual(["GOB000002", "H000001", "ORC000003", "R000001", "R000013"]);
  expect(fixture.participants.uram.startMaybe).toEqual(["DIV000002"]);
});

test("runtime deck definitions match canonical Hokhan and Uram multisets", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openHokhanUram(page);

  const runtime = await page.evaluate(() => ({
    deckHokhan: [...DECK_HOKHAN],
    deckUram: [...DECK_URAM],
    startOuiHokhan: [...START_OUI_HOKHAN],
    startMaybeHokhan: [...START_MAYBE_HOKHAN],
    startOuiUram: [...START_OUI_URAM],
    startMaybeUram: [...START_MAYBE_URAM],
  }));

  expect(runtime.deckHokhan).toEqual(fixture.participants.hokhan.expandedDeck);
  expect(runtime.deckUram).toEqual(fixture.participants.uram.expandedDeck);
  expect(runtime.startOuiHokhan).toEqual(fixture.participants.hokhan.startOui);
  expect(runtime.startMaybeHokhan).toEqual(fixture.participants.hokhan.startMaybe);
  expect(runtime.startOuiUram).toEqual(fixture.participants.uram.startOui);
  expect(runtime.startMaybeUram).toEqual(fixture.participants.uram.startMaybe);

  for (const id of fixture.removedObsoleteDirectCards.hokhan) expect(runtime.deckHokhan).not.toContain(id);
  for (const id of fixture.removedObsoleteDirectCards.uram) expect(runtime.deckUram).not.toContain(id);
  for (const id of fixture.addedDirectCards.hokhan) expect(runtime.deckHokhan).toContain(id);
  for (const id of fixture.addedDirectCards.uram) expect(runtime.deckUram).toContain(id);
  for (const id of fixture.correctedQuantityIds) {
    const expectedCount = countById(fixture.participants.hokhan.expandedDeck)[id] ?? countById(fixture.participants.uram.expandedDeck)[id] ?? 0;
    const runtimeCount = countById(runtime.deckHokhan)[id] ?? countById(runtime.deckUram)[id] ?? 0;
    expect(runtimeCount, `${id} corrected quantity`).toBe(expectedCount);
  }

  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("hokhan-uram initialization partitions each canonical deck into hand and draw pile once", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openHokhanUram(page);

  const snapshot = await page.evaluate(() => {
    const players = [player1, player2].filter(Boolean);
    return Object.fromEntries(players.map(player => [player.characterId, {
      key: player.key,
      name: player.name,
      deck: [...player.deck],
      startingDeckCardIds: [...player.startingDeckCardIds],
      drawPile: [...player.drawPile],
      hand: [...player.hand],
      startOui: [...player.startOui],
      startMaybe: [...player.startMaybe],
      portrait: player.portrait,
      drawPileTypes: player.drawPile.map(entry => typeof entry),
      handTypes: player.hand.map(entry => typeof entry),
      unknownIds: [...player.drawPile, ...player.hand].filter(id => !CARDS_DATA[id]),
    }]));
  });

  for (const key of ["hokhan", "uram"]) {
    const expected = fixture.participants[key];
    const player = snapshot[key];
    expect(player, `${key} runtime player`).toBeTruthy();
    expect(player.deck).toEqual(expected.expandedDeck);
    expect(player.startingDeckCardIds).toEqual(expected.expandedDeck);
    expect(player.startOui).toEqual(expected.startOui);
    expect(player.startMaybe).toEqual(expected.startMaybe);
    expect(player.hand).toEqual(expected.startOui);
    expect(countById(player.drawPile)).toEqual(countById(removeOnePerStartOui(expected.expandedDeck, expected.startOui)));
    expect([...player.hand, ...player.drawPile].sort()).toEqual([...expected.expandedDeck].sort());
    expect(player.hand.length + player.drawPile.length, `${key} direct runtime total`).toBe(60);
    expect(player.drawPile.length, `${key} draw pile size`).toBe(55);
    expect(player.unknownIds).toEqual([]);
    expect(player.drawPileTypes.every(type => type === "string")).toBe(true);
    expect(player.handTypes.every(type => type === "string")).toBe(true);
  }

  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("HUVU technical scenarios remain reachable while hidden from the public selector", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openHokhanUram(page);
  const publicAudit = await page.evaluate(() => ({
    technicalOptions: Array.from(document.querySelectorAll("#scenarioSelect option"))
      .map(option => option.value)
      .filter(value => value.startsWith("huvu-")),
    testPanelVisible: !!document.querySelector('[data-testid="test-resource-panel"]'),
  }));
  expect(publicAudit.technicalOptions).toEqual([]);
  expect(publicAudit.testPanelVisible).toBe(false);

  for (const scenario of ["huvu-sync-gallery-a", "huvu-sync-gallery-b", "huvu-amalgam-zero-echoes", "huvu-hokhan-cost-exact"]) {
    await page.goto(`/code/partie-test-1.html?scenario=${scenario}&deckSync=${Date.now()}-${Math.random()}`);
    await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
    await waitForVisibleHandStable(page);
  }

  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
