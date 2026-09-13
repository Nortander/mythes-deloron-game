import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics, waitForVisibleHandStable} from "./helpers/eloron-ui.mjs";

const scenarios = [
  "collection-batch-15d-invocation",
  "collection-batch-15d-replacement",
  "collection-batch-15d-pact-revenants",
  "collection-batch-15d-gabar"
];

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

async function openBatch15DScenario(page, scenario) {
  await page.addInitScript(() => {
    const sequence = [0, 0.2, 0.4, 0.6, 0.8, 0.1, 0.3, 0.5, 0.7, 0.9];
    const nativeRandom = Math.random.bind(Math);
    let index = 0;
    Math.random = () => (index < sequence.length ? sequence[index++] : nativeRandom());
  });
  await page.goto(`/code/partie-test-1.html?scenario=${scenario}&batch15d=${Date.now()}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await waitForVisibleHandStable(page);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
}

test("Batch 15D scenarios stay hidden and spell texts use synchronized Sort rendering", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  for (const scenario of scenarios) {
    await openBatch15DScenario(page, scenario);
    const audit = await page.evaluate(() => ({
      publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length,
      cards:["S000009","S000013","S000014","S000023","S000038","S000047","S000052","S000057","S000058","S000059","S000060"].map(id => {
        const node = document.createElement("div");
        node.innerHTML = fmtDesc(CARDS_DATA[id]?.cap || "");
        const text = `${CARDS_DATA[id]?.cap || ""} ${CARDS_DATA[id]?.detail || ""}`;
        return {
          id,
          exists:!!CARDS_DATA[id],
          type:CARDS_DATA[id]?.type || null,
          fac:CARDS_DATA[id]?.fac || null,
          highlights:[...node.querySelectorAll("strong.kv")].map(strong => strong.textContent),
          hasTechnicalId:/\[ID\s*=/.test(text),
          protectedFromStealDestroyDiscard:!!CARDS_DATA[id]?.protectedFromStealDestroyDiscard
        };
      })
    }));
    expect(audit.publicOptionCount).toBe(0);
    for (const card of audit.cards) {
      expect(card.exists, card.id).toBe(true);
      expect(card.type, card.id).toBe("Sort");
      expect(card.fac, card.id).toBe("sort");
      expect(card.hasTechnicalId, card.id).toBe(false);
    }
    expect(audit.cards.find(card => card.id === "S000009").highlights).toEqual(["3", "3"]);
    expect(audit.cards.find(card => card.id === "S000014").highlights).toEqual(["4"]);
    expect(audit.cards.find(card => card.id === "S000023").highlights).toEqual(["2", "+1"]);
    expect(audit.cards.find(card => card.id === "S000038").highlights).toEqual(["1"]);
    expect(audit.cards.find(card => card.id === "S000047").highlights).toEqual(["3"]);
    expect(audit.cards.find(card => card.id === "S000052").highlights).toEqual(["3", "2", "5"]);
    for (const id of ["S000057","S000058","S000059","S000060"]) {
      expect(audit.cards.find(card => card.id === id).protectedFromStealDestroyDiscard).toBe(true);
    }
  }
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000009 scans the deck and summons the first three eligible low-cost Goblins", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-invocation");
  const result = await page.evaluate(async () => {
    const resolved = await resolveBatch10ReunionAuSommet(player1);
    return {
      resolved,
      board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id),
      deck:playerDrawPile(player1).map(getRuntimeCardId)
    };
  });
  expect(result.resolved.success).toBe(true);
  expect(result.resolved.summoned.filter(entry => entry.success).map(entry => entry.cardId)).toEqual(["GOB000002", "GOB000001", "GOB000002"]);
  expect(result.board.filter(id => id.startsWith("GOB"))).toEqual(["GOB000002", "GOB000001", "GOB000002"]);
  expect(result.deck).toEqual(["R000010", "GOB000003", "H000001", "GOB000004"]);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000014 and S000047 generate servants and trigger summoned initiatives", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-invocation");
  const pillage = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    batch05VisualDelay = async () => {};
    waitBatch05BeforeEffect = async () => false;
    chooseBatch08ChamanOption = async () => "burn";
    chooseBoardTargets = async ({targets, maxCount=1}) => targets.slice(0, maxCount);
    const resolved = await resolvePillageEnRegle(player1);
    return {
      resolved,
      board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id)
    };
  });
  expect(pillage.resolved.success).toBe(true);
  expect(pillage.resolved.summons.filter(entry => entry.success)).toHaveLength(4);
  expect(pillage.board.filter(id => /^ORC/.test(id))).toHaveLength(4);

  await openBatch15DScenario(page, "collection-batch-15d-invocation");
  const volee = await page.evaluate(async () => {
    batch05VisualDelay = async () => {};
    waitBatch05BeforeEffect = async () => false;
    chooseBatch08ChamanOption = async () => "burn";
    chooseBoardTargets = async ({targets, maxCount=1}) => targets.slice(0, maxCount);
    const resolved = await resolveBatch10VoleeDeGobelins(player1);
    return {
      resolved,
      board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id)
    };
  });
  expect(volee.resolved.success).toBe(true);
  expect(volee.resolved.summoned.filter(entry => entry.success).map(entry => entry.cardId)).toEqual(["GOB000002", "GOB000002", "GOB000002"]);
  expect(volee.board.filter(id => id === "GOB000002")).toHaveLength(3);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000013 replaces allied Warriors only and S000038 copies unique Goblins from hand", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-replacement");
  const result = await page.evaluate(async () => {
    const experience = resolveBatch07ExperienceCombat(player1);
    const codeCouleurs = await resolveBatch10CodeCouleurs(player1);
    const allPlayer1Zones = [
      ...playerDrawPile(player1).map(getRuntimeCardId),
      ...playerHand(player1).map(getRuntimeCardId),
      ...player1.graveyard.map(getRuntimeCardId),
      ...livingServantCardsForPlayer(player1).map(fc => fc.dataset.id)
    ];
    const allPlayer2Zones = [
      ...playerDrawPile(player2).map(getRuntimeCardId),
      ...playerHand(player2).map(getRuntimeCardId),
      ...player2.graveyard.map(getRuntimeCardId),
      ...livingServantCardsForPlayer(player2).map(fc => fc.dataset.id)
    ];
    return {
      experience,
      codeCouleurs,
      player1Zones:allPlayer1Zones,
      player2Zones:allPlayer2Zones,
      hand:playerHand(player1).map(getRuntimeCardId)
    };
  });
  expect(result.experience.success).toBe(true);
  expect(result.experience.total).toBe(4);
  expect(result.player1Zones).not.toContain("N000007");
  expect(result.player1Zones.filter(id => id === "N000008")).toHaveLength(4);
  expect(result.player2Zones.filter(id => id === "N000007")).toHaveLength(4);
  expect(result.codeCouleurs.unique).toEqual(["GOB000001", "GOB000002"]);
  expect(result.codeCouleurs.added).toEqual(["GOB000001", "GOB000002"]);
  expect(result.hand.filter(id => id === "GOB000001")).toHaveLength(2);
  expect(result.hand.filter(id => id === "GOB000002")).toHaveLength(3);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000023 enforces the starting-deck dragon condition and resolves its three branches", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-pact-revenants");
  const blocked = await page.evaluate(async () => {
    player1.startingDeckCardIds = [];
    return resolvePacteMillenaireCostEffects(player1);
  });
  expect(blocked.success).toBe(false);
  expect(blocked.reason).toBe("starting-deck-missing-EDG000006");

  await openBatch15DScenario(page, "collection-batch-15d-pact-revenants");
  const handBranch = await page.evaluate(async () => {
    const resolved = await resolvePacteMillenaireCostEffects(player1);
    return {
      resolved,
      hand:playerHand(player1).map(getRuntimeCardId),
      board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id)
    };
  });
  expect(handBranch.resolved.success).toBe(true);
  expect(handBranch.resolved.mode).toBe("hand-invocation");
  expect(handBranch.hand).not.toContain("EDG000006");
  expect(handBranch.board).toContain("EDG000006");

  await openBatch15DScenario(page, "collection-batch-15d-pact-revenants");
  const deckBranch = await page.evaluate(async () => {
    player1.hand = ["S000023"];
    player1.drawPile = ["H000001", "EDG000006"];
    player1.graveyard = [];
    refreshRuntimeZone(player1, "hand");
    refreshRuntimeZone(player1, "deck");
    const resolved = await resolvePacteMillenaireCostEffects(player1);
    return {
      resolved,
      hand:playerHand(player1).map(getRuntimeCardId),
      deck:playerDrawPile(player1).map(getRuntimeCardId)
    };
  });
  expect(deckBranch.resolved.success).toBe(true);
  expect(deckBranch.resolved.mode).toBe("deck-draw-reduction");
  expect(deckBranch.resolved.drawn.map(entry => entry.cardId)).toEqual(["EDG000006"]);
  expect(deckBranch.hand).toContain("EDG000006");
  expect(deckBranch.deck).not.toContain("EDG000006");

  await openBatch15DScenario(page, "collection-batch-15d-pact-revenants");
  const fallback = await page.evaluate(async () => {
    player1.hand = ["S000023"];
    player1.drawPile = ["H000001"];
    player1.graveyard = ["EDG000006"];
    player1.startingDeckCardIds = ["EDG000006"];
    refreshRuntimeZone(player1, "hand");
    refreshRuntimeZone(player1, "deck");
    refreshRuntimeZone(player1, "graveyard");
    return resolvePacteMillenaireCostEffects(player1);
  });
  expect(fallback.success).toBe(true);
  expect(fallback.mode).toBe("graveyard-atk-buff");
  expect(fallback.amount).toBe(1);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000052 summons distinct cheap undead from deck, then graveyard, then grants fallback Echoes", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-pact-revenants");
  const deckBranch = await page.evaluate(async () => {
    const resolved = await resolveRetourDesRevenants(player1);
    return {
      resolved,
      board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id)
    };
  });
  expect(deckBranch.resolved.sourceZone).toBe("deck");
  expect(deckBranch.resolved.operation.summoned.map(entry => entry.cardId)).toEqual(["MV000025", "MV000002", "MV000001"]);
  expect(deckBranch.board).toEqual(expect.arrayContaining(["MV000001", "MV000002", "MV000025"]));

  await openBatch15DScenario(page, "collection-batch-15d-pact-revenants");
  const graveyardBranch = await page.evaluate(async () => {
    player1.drawPile = ["H000001", "R000001"];
    player1.graveyard = ["MV000001", "MV000002", "MV000025", "MV000004"];
    refreshRuntimeZone(player1, "deck");
    refreshRuntimeZone(player1, "graveyard");
    return resolveRetourDesRevenants(player1);
  });
  expect(graveyardBranch.sourceZone).toBe("graveyard");
  expect(graveyardBranch.operation.summoned.map(entry => entry.cardId)).toEqual(["MV000001", "MV000002", "MV000025"]);

  await openBatch15DScenario(page, "collection-batch-15d-pact-revenants");
  const fallback = await page.evaluate(async () => {
    const before = player1.resourceState.souls;
    player1.drawPile = ["H000001", "R000001"];
    player1.graveyard = ["R000001"];
    refreshRuntimeZone(player1, "deck");
    refreshRuntimeZone(player1, "graveyard");
    const resolved = await resolveRetourDesRevenants(player1);
    return {resolved, before, after:player1.resourceState.souls};
  });
  expect(fallback.resolved.fallbackEcho).toBeTruthy();
  expect(fallback.resolved.fallbackEcho.delta).toBe(5);
  expect(fallback.after - fallback.before).toBe(5);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000057-S000060 evolve Gabar to hand or deck top and cannot be stolen or discarded", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-gabar");
  const handEvolution = await page.evaluate(async () => {
    const resolved = await resolveBatch02EvolutionDraw(player1, "S000057");
    return {
      resolved,
      hand:playerHand(player1).map(getRuntimeCardId),
      board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id),
      graveyard:player1.graveyard.map(getRuntimeCardId)
    };
  });
  expect(handEvolution.resolved.success).toBe(true);
  expect(handEvolution.resolved.destination).toBe("hand");
  expect(handEvolution.resolved.autoSummoned).toBe(false);
  expect(handEvolution.hand).toContain("H000033");
  expect(handEvolution.board).not.toContain("H000032");
  expect(handEvolution.board).not.toContain("H000033");
  expect(handEvolution.graveyard).toContain("S000057");

  await openBatch15DScenario(page, "collection-batch-15d-gabar");
  const fullHandEvolution = await page.evaluate(async () => {
    const fillers = ["H000001","H000002","H000003","H000004","H000005","H000006","H000007","H000008","H000009","H000010","H000011","H000012"];
    player1.hand = fillers.slice(0, MAX_HAND);
    player1.drawPile = [];
    refreshRuntimeZone(player1, "hand");
    refreshRuntimeZone(player1, "deck");
    const resolved = await resolveBatch02EvolutionDraw(player1, "S000058");
    return {
      resolved,
      hand:playerHand(player1).map(getRuntimeCardId),
      deck:playerDrawPile(player1).map(getRuntimeCardId)
    };
  });
  expect(fullHandEvolution.resolved.success).toBe(true);
  expect(fullHandEvolution.resolved.destination).toBe("deck-top");
  expect(fullHandEvolution.hand).not.toContain("H000034");
  expect(fullHandEvolution.deck.at(-1)).toBe("H000034");

  const protection = await page.evaluate(() => {
    player1.hand = ["S000057", "H000001"];
    player2.hand = ["S000058", "H000002"];
    player2.drawPile = ["S000059", "H000003"];
    player2.graveyard = ["S000060", "H000004"];
    refreshRuntimeZone(player1, "hand");
    refreshRuntimeZone(player2, "hand");
    refreshRuntimeZone(player2, "deck");
    refreshRuntimeZone(player2, "graveyard");
    return {
      zerbo:batch14EZerboDiscardCandidates(player1).map(item => item.cardId),
      stealable:batch14EStealableOpponentCards(player1).map(item => item.cardId)
    };
  });
  expect(protection.zerbo).toEqual(["H000001"]);
  expect(protection.stealable).toEqual(["H000003", "H000002", "H000004"]);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
