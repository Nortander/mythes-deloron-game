import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics, waitForVisibleHandStable} from "./helpers/eloron-ui.mjs";

const scenarios = [
  "collection-batch-15b-destroy-target-a",
  "collection-batch-15b-duel-overflow-b",
  "collection-batch-15b-troll-chain-c",
  "collection-batch-15b-eternal-fire-d"
];

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

async function openBatch15BScenario(page, scenario) {
  await page.addInitScript(() => {
    const sequence = [0, 0.2, 0.4, 0.6, 0.8, 0.1, 0.3, 0.5, 0.7, 0.9];
    const nativeRandom = Math.random.bind(Math);
    let index = 0;
    Math.random = () => (index < sequence.length ? sequence[index++] : nativeRandom());
  });
  await page.goto(`/code/partie-test-1.html?scenario=${scenario}&batch15b=${Date.now()}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await waitForVisibleHandStable(page);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
}

test("Batch 15B scenarios stay hidden and spell texts are synchronized", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  for (const scenario of scenarios) {
    await openBatch15BScenario(page, scenario);
    const audit = await page.evaluate(() => ({
      publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length,
      cards:["S000001","S000005","S000025","S000031","S000032","S000046","S000063"].map(id => {
        const node = document.createElement("div");
        node.innerHTML = fmtDesc((CARDS_DATA[id]?.detail || CARDS_DATA[id]?.cap || ""));
        return {id, exists:!!CARDS_DATA[id], type:CARDS_DATA[id]?.type || null, highlights:[...node.querySelectorAll("strong.kv")].map(strong => strong.textContent), keywords:CARDS_DATA[id]?.kws || []};
      })
    }));
    expect(audit.publicOptionCount).toBe(0);
    for (const card of audit.cards) {
      expect(card.exists, card.id).toBe(true);
      expect(card.type, card.id).toBe("Sort");
    }
    expect(audit.cards.find(card => card.id === "S000001").highlights).toEqual(["5", "1"]);
    expect(audit.cards.find(card => card.id === "S000005").highlights).toEqual(["8", "2"]);
    expect(audit.cards.find(card => card.id === "S000025").keywords).toContain("Insensible");
    expect(audit.cards.find(card => card.id === "S000031").highlights).toEqual(["2"]);
    expect(audit.cards.find(card => card.id === "S000031").keywords).toContain("Insensible");
    expect(audit.cards.find(card => card.id === "S000032").highlights).toEqual(["10"]);
    expect(audit.cards.find(card => card.id === "S000046").highlights).toEqual(["1", "1", "1", "4 PDV"]);
    expect(audit.cards.find(card => card.id === "S000063").highlights).toEqual(["1", "2", "6"]);
    expect(audit.cards.find(card => card.id === "S000063").keywords).toContain("Insensible");
  }
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000001 destroys only a legal low-attack enemy and steals one supply", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15BScenario(page, "collection-batch-15b-destroy-target-a");
  const result = await page.evaluate(async () => {
    const events = [];
    window.__collectionBatch15BEvents = events;
    const legalBefore = legalTargetsForRequirement("S000001", player1).map(target => target.dataset.id);
    const target = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000001");
    const resolved = await resolveEmbuscadeElfique(player1, {selectedTargetIds:[target.dataset.instance]});
    return {
      resolved,
      legalBefore,
      player1Hand:player1.hand.map(getRuntimeCardId),
      player2Deck:player2.drawPile.map(getRuntimeCardId),
      player2Graveyard:player2.graveyard.map(getRuntimeCardId),
      targetConnected:target.isConnected,
      events
    };
  });
  expect(result.legalBefore).toEqual(["H000001"]);
  expect(result.resolved.success).toBe(true);
  expect(result.resolved.steal.success).toBe(true);
  expect(result.resolved.steal.stolen).toBe("R000010");
  expect(result.player1Hand).toContain("R000010");
  expect(result.player2Deck).not.toContain("R000010");
  expect(result.player2Graveyard).toContain("H000001");
  expect(result.targetConnected).toBe(false);
  expect(result.events.some(event => event.type === "embuscade-supply-stolen")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000005 may be cancelled by exactly two supply cards from the defender hand", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15BScenario(page, "collection-batch-15b-destroy-target-a");
  const result = await page.evaluate(async () => {
    ensureBatch03HandOccurrences(player2);
    const target = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000005");
    const handSupplies = batch15BHandSupplyEntries(player2).slice(0, 2);
    const resolved = await resolveAssassinat(player1, {
      selectedTargetIds:[target.dataset.instance],
      assassinationDecision:{action:"sacrifice", instanceIds:handSupplies.map(entry => entry.occurrenceId)}
    });
    return {
      resolved,
      targetStillAlive:target.isConnected && !target.dataset.dead,
      player2Hand:player2.hand.map(getRuntimeCardId),
      player2Graveyard:player2.graveyard.map(getRuntimeCardId),
      player2SupplyBoard:player2.supplies.map(instance => getRuntimeCardId(instance.cardId))
    };
  });
  expect(result.resolved.success).toBe(true);
  expect(result.resolved.cancelled).toBe(true);
  expect(result.targetStillAlive).toBe(true);
  expect(result.player2Hand).not.toContain("R000001");
  expect(result.player2Hand).not.toContain("R000002");
  expect(result.player2Graveyard).toEqual(expect.arrayContaining(["R000001", "R000002"]));
  expect(result.player2SupplyBoard.length).toBeGreaterThan(0);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000031 duels through Insensible and sends destroyed combatants to caster cemetery", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15BScenario(page, "collection-batch-15b-duel-overflow-b");
  const result = await page.evaluate(async () => {
    const first = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000001");
    const second = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000006");
    const resolved = await resolveDuel(player1, {selectedTargetIds:[first.dataset.instance, second.dataset.instance]});
    return {
      resolved,
      firstPdv:Number(first.dataset.pdv || 0),
      secondConnected:second.isConnected,
      player1Graveyard:player1.graveyard.map(getRuntimeCardId),
      player2Graveyard:player2.graveyard.map(getRuntimeCardId)
    };
  });
  expect(result.resolved.success).toBe(true);
  expect(result.firstPdv).toBe(2);
  expect(result.secondConnected).toBe(false);
  expect(result.player1Graveyard).toContain("H000006");
  expect(result.player2Graveyard).not.toContain("H000006");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000032 propagates overflow to the right and stops on Insensible", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15BScenario(page, "collection-batch-15b-duel-overflow-b");
  const result = await page.evaluate(async () => {
    const target = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000005");
    const insensible = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000029");
    const resolved = await resolveSavoirTribal(player1, {selectedTargetIds:[target.dataset.instance]});
    return {
      resolved,
      targetConnected:target.isConnected,
      insensiblePdv:Number(insensible.dataset.pdv || 0),
      insensibleConnected:insensible.isConnected
    };
  });
  expect(result.resolved.success).toBe(true);
  expect(result.targetConnected).toBe(false);
  expect(result.resolved.hits.map(hit => hit.blocked || null)).toContain("Insensible");
  expect(result.insensibleConnected).toBe(true);
  expect(result.insensiblePdv).toBe(8);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000046 repeats troll attacks until no enemy servants remain or the troll dies", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15BScenario(page, "collection-batch-15b-troll-chain-c");
  const result = await page.evaluate(async () => {
    window.__collectionBatch09RandomQueue = [0, 0, 0, 0, 0, 0];
    const troll = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000006");
    const resolved = await resolveBatch09CaPasseOuCaCasse(player1, {selectedTargetIds:[troll.dataset.instance]});
    return {
      resolved,
      trollAlive:troll.isConnected && !troll.dataset.dead,
      enemiesLeft:document.querySelectorAll('.board-j2-servants .fc:not([data-dead])').length,
      player2Graveyard:player2.graveyard.map(getRuntimeCardId)
    };
  });
  expect(result.resolved.success).toBe(true);
  expect(result.resolved.rounds).toBeGreaterThanOrEqual(1);
  expect(result.trollAlive).toBe(true);
  expect(result.enemiesLeft).toBe(0);
  expect(result.player2Graveyard.length).toBeGreaterThanOrEqual(3);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000025 destroys servants, supplies, decks and avatars despite Insensible", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15BScenario(page, "collection-batch-15b-eternal-fire-d");
  const result = await page.evaluate(async () => {
    const resolved = await resolveFeuEternelDechaine(player1);
    return {
      resolved,
      servantsLeft:document.querySelectorAll('.zone-servants .fc:not([data-dead])').length,
      player1Supplies:player1.supplies.length,
      player2Supplies:player2.supplies.length,
      player1Deck:player1.drawPile.length,
      player2Deck:player2.drawPile.length,
      player1Avatar:batch09AvatarHp(player1),
      player2Avatar:batch09AvatarHp(player2),
      player1Graveyard:player1.graveyard.map(getRuntimeCardId),
      player2Graveyard:player2.graveyard.map(getRuntimeCardId)
    };
  });
  expect(result.resolved.success).toBe(true);
  expect(result.servantsLeft).toBe(0);
  expect(result.player1Supplies).toBe(0);
  expect(result.player2Supplies).toBe(0);
  expect(result.player1Deck).toBe(0);
  expect(result.player2Deck).toBe(0);
  expect(result.player1Avatar).toBe(0);
  expect(result.player2Avatar).toBe(0);
  expect(result.player1Graveyard).toEqual(expect.arrayContaining(["H000001", "H000029"]));
  expect(result.player2Graveyard).toEqual(expect.arrayContaining(["H000006", "H000005"]));
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
