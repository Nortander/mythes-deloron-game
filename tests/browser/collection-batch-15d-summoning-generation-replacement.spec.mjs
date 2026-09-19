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

async function openBatch15DScenario(page, scenario, extra = "") {
  await page.addInitScript(() => {
    const sequence = [0, 0.2, 0.4, 0.6, 0.8, 0.1, 0.3, 0.5, 0.7, 0.9];
    const nativeRandom = Math.random.bind(Math);
    let index = 0;
    Math.random = () => (index < sequence.length ? sequence[index++] : nativeRandom());
  });
  const suffix = extra ? `${extra}&batch15d=${Date.now()}` : `&batch15d=${Date.now()}`;
  await page.goto(`/code/partie-test-1.html?scenario=${scenario}${suffix}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await waitForVisibleHandStable(page);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.evaluate(() => {
    window.__batch15d2Observed = [];
    const readNode = node => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
      const element = node;
      if (!element.matches?.("[data-batch15d-transfer],.batch15d-transfer-clone")) return null;
      return {dataset:{...element.dataset}, className:element.className || "", text:element.textContent?.trim() || ""};
    };
    const remember = node => {
      const direct = readNode(node);
      if (direct) window.__batch15d2Observed.push(direct);
      node?.querySelectorAll?.("[data-batch15d-transfer],.batch15d-transfer-clone").forEach(child => {
        const item = readNode(child);
        if (item) window.__batch15d2Observed.push(item);
      });
    };
    window.__batch15d2Observer?.disconnect?.();
    window.__batch15d2Observer = new MutationObserver(mutations => mutations.forEach(mutation => mutation.addedNodes.forEach(remember)));
    window.__batch15d2Observer.observe(document.body, {childList:true, subtree:true});
  });
}

function expectFrenchNoBreakSpaces(text) {
  expect(text).not.toMatch(/ [:\;\?\!»]/);
  expect(text).not.toMatch(/« /);
  expect(text).not.toContain("&nbsp;");
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

test("S000009 exposes zero/one Goblin branches and owner-scoped transfer diagnostics", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-invocation", "&case=summit-none");
  const none = await page.evaluate(async () => {
    batch05VisualDelay = async () => {};
    const resolved = await resolveBatch10ReunionAuSommet(player1);
    return {
      resolved,
      notification:document.querySelector("#notif")?.textContent || "",
      board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id),
      transfers:[...(window.__batch15d2Observed || [])].filter(event => event.dataset?.batch15dTransfer === "deck-to-board")
    };
  });
  expect(none.resolved.success).toBe(true);
  expect(none.resolved.summoned.filter(entry => entry.success)).toHaveLength(0);
  expect(none.board.filter(id => id.startsWith("GOB"))).toHaveLength(0);
  expect(none.transfers).toHaveLength(0);
  expect(none.notification).toBe("LES GOBELINS N'ONT JAMAIS ÉTÉ CONNUS POUR LEUR FIABILITÉ. AUCUN N'EST VENU !");
  expectFrenchNoBreakSpaces(none.notification);

  await openBatch15DScenario(page, "collection-batch-15d-invocation", "&case=summit-one");
  const one = await page.evaluate(async () => {
    window.__batch15d2Observed = [];
    batch05VisualDelay = async () => {};
    const resolved = await resolveBatch10ReunionAuSommet(player1);
    return {
      resolved,
      notification:document.querySelector("#notif")?.textContent || "",
      board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id),
      transfers:[...(window.__batch15d2Observed || [])].filter(event => event.dataset?.batch15dTransfer === "deck-to-board")
    };
  });
  expect(one.resolved.summoned.filter(entry => entry.success).map(entry => entry.cardId)).toEqual(["GOB000002"]);
  expect(one.transfers).toHaveLength(1);
  expect(one.transfers[0].dataset.batch15dSourceOwner).toBe("player1");
  expect(one.transfers[0].dataset.batch15dDestinationOwner).toBe("player1");
  expect(one.notification).toBe("UN SEUL GOBELIN A RÉPONDU À L'APPEL. LES AUTRES SE SONT PEUT-ÊTRE PERDUS EN CHEMIN ?");
  expectFrenchNoBreakSpaces(one.notification);

  await openBatch15DScenario(page, "collection-batch-15d-invocation");
  const player2Owner = await page.evaluate(async () => {
    window.__batch15d2Observed = [];
    batch05VisualDelay = async () => {};
    player2.hand = ["S000009"];
    player2.drawPile = ["H000001", "GOB000002"];
    player2.servants = [];
    refreshRuntimeZone(player2, "hand");
    refreshRuntimeZone(player2, "deck");
    refreshRuntimeZone(player2, "servants");
    const resolved = await resolveBatch10ReunionAuSommet(player2);
    return {
      resolved,
      transfers:[...(window.__batch15d2Observed || [])].filter(event => event.dataset?.batch15dTransfer === "deck-to-board")
    };
  });
  expect(player2Owner.resolved.summoned.filter(entry => entry.success)).toHaveLength(1);
  expect(player2Owner.transfers[0].dataset.batch15dSourceOwner).toBe("player2");
  expect(player2Owner.transfers[0].dataset.batch15dDestinationOwner).toBe("player2");
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

  await openBatch15DScenario(page, "collection-batch-15d-invocation", "&case=volley-none");
  const voleeNone = await page.evaluate(async () => {
    window.__batch15d2Observed = [];
    batch05VisualDelay = async () => {};
    const resolved = await resolveBatch10VoleeDeGobelins(player1);
    return {
      resolved,
      notification:document.querySelector("#notif")?.textContent || "",
      board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id),
      transfers:[...(window.__batch15d2Observed || [])].filter(event => event.dataset?.batch15dTransfer === "generated-to-board")
    };
  });
  expect(voleeNone.resolved.success).toBe(true);
  expect(voleeNone.resolved.summoned).toHaveLength(0);
  expect(voleeNone.board).not.toContain("GOB000002");
  expect(voleeNone.transfers).toHaveLength(0);
  expect(voleeNone.notification).toBe("DES GOBELINS ONT BIEN ÉTÉ CATAPULTÉS QUELQUE PART, MAIS APPAREMMENT PAS SUR LE CHAMP DE BATAILLE. OUPS !");
  expectFrenchNoBreakSpaces(voleeNone.notification);
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

  await openBatch15DScenario(page, "collection-batch-15d-pact-revenants", "&case=pact-deck");
  const visualDeckBranch = await page.evaluate(async () => {
    const resolved = await resolvePacteMillenaireCostEffects(player1);
    return {
      resolved,
      hand:playerHand(player1).map(getRuntimeCardId),
      board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id),
      notification:document.querySelector("#notif")?.textContent || ""
    };
  });
  expect(visualDeckBranch.resolved.mode).toBe("deck-draw-reduction");
  expect(visualDeckBranch.hand.filter(id => id === "EDG000006")).toHaveLength(2);
  expect(visualDeckBranch.board).not.toContain("EDG000006");
  expect(visualDeckBranch.notification).toBe("LES DRAGONS VIENNENT HONORER LEUR PACTE SACRÉ.");

  await openBatch15DScenario(page, "collection-batch-15d-pact-revenants", "&case=pact-exhausted");
  const visualExhaustedBranch = await page.evaluate(async () => {
    const before = livingServantCardsForPlayer(player1).filter(fc => CARDS_DATA[fc.dataset.id]?.fac === "edg").map(fc => ({id:fc.dataset.id, atk:Number(fc.dataset.atk)}));
    const resolved = await resolvePacteMillenaireCostEffects(player1);
    const after = livingServantCardsForPlayer(player1).filter(fc => CARDS_DATA[fc.dataset.id]?.fac === "edg").map(fc => ({id:fc.dataset.id, atk:Number(fc.dataset.atk)}));
    return {resolved, before, after, notification:document.querySelector("#notif")?.textContent || ""};
  });
  expect(visualExhaustedBranch.resolved.mode).toBe("graveyard-atk-buff");
  expect(visualExhaustedBranch.after.length).toBeGreaterThanOrEqual(2);
  expect(visualExhaustedBranch.after.every((entry, index) => entry.atk === visualExhaustedBranch.before[index].atk + 1)).toBe(true);
  expect(visualExhaustedBranch.notification).toBe("LE CHAMP DE BATAILLE SE REFROIDIT SOUDAINEMENT, AMPLIFIANT LE POUVOIR DES ELFES DE GLACE.");
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

  await openBatch15DScenario(page, "collection-batch-15d-pact-revenants", "&case=revenants-echo");
  const visualEcho = await page.evaluate(async () => {
    window.__batch15d2Observed = [];
    const before = player1.resourceState.souls;
    const resolved = await resolveRetourDesRevenants(player1);
    return {
      resolved,
      before,
      after:player1.resourceState.souls,
      notification:document.querySelector("#notif")?.textContent || "",
      transfers:[...(window.__batch15d2Observed || [])].filter(event => /to-board$/.test(event.dataset?.batch15dTransfer || ""))
    };
  });
  expect(visualEcho.resolved.fallbackEcho.delta).toBe(5);
  expect(visualEcho.after - visualEcho.before).toBe(5);
  expect(visualEcho.transfers).toHaveLength(0);
  expect(visualEcho.notification).toBe("UN SOMBRE RITUEL PUISE DANS LES ÂMES DES DISPARUS ET EN TIRE DE L'ÉCHO À OUTRANCE !");
  expectFrenchNoBreakSpaces(visualEcho.notification);
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

test("S000057-S000060 resolve immediately from real draws with no generic launch notification", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  const cases = [
    ["S000057", "H000032", "H000033", "AVEC L'AUBE DE SOIE DE LUMIÈRE, GABAR PREND CONFIANCE !"],
    ["S000058", "H000033", "H000034", "LE GRIMOIRE MAGIQUE DU MAÎTRE N'A PLUS DE SECRETS POUR GABAR !"],
    ["S000059", "H000034", "H000035", "L'APPRENTISSAGE DE GABAR SE TERMINE AVEC L'OBTENTION DE SA PROPRE PLUME ENCHANTÉE !"],
    ["S000060", "H000035", "H000036", "DÉSORMAIS PARFAITEMENT ÉQUIPÉ ET INSTRUIT, GABAR DEVIENT UN MAÎTRE-MAGICIEN ET UN INVOCATEUR DE RENOM."]
  ];
  for (const [spellId, oldGabar, newGabar, message] of cases) {
    await openBatch15DScenario(page, "collection-batch-15d-gabar");
    const result = await page.evaluate(async ({spellId, oldGabar}) => {
      const beforeTurn = turnSequence;
      const beforePlayer = currentPlayer;
      player1.hand = [];
      player1.drawPile = [spellId];
      player1.graveyard = [];
      player1.servants = [{id:oldGabar, atk:1, pdv:2, pdvMax:2, prepared:true}];
      refreshRuntimeZone(player1, "hand");
      refreshRuntimeZone(player1, "deck");
      refreshRuntimeZone(player1, "graveyard");
      refreshRuntimeZone(player1, "servants");
      const draw = drawCardFromRuntimeDeck(player1);
      return {
        draw,
        beforeTurn,
        afterTurn:turnSequence,
        beforePlayer,
        afterPlayer:currentPlayer,
        hand:playerHand(player1).map(getRuntimeCardId),
        deck:playerDrawPile(player1).map(getRuntimeCardId),
        board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id),
        notification:document.querySelector("#notif")?.textContent || ""
      };
    }, {spellId, oldGabar});
    expect(result.afterTurn).toBe(result.beforeTurn);
    expect(result.afterPlayer).toBe(result.beforePlayer);
    expect(result.draw.evolutionResolution?.success).toBe(true);
    expect(result.board).not.toContain(oldGabar);
    expect(result.hand).toContain(newGabar);
    expect(result.notification).toBe(message);
    expect(result.notification).not.toContain("SORT JOUÉ");
    expectFrenchNoBreakSpaces(result.notification);
  }

  await openBatch15DScenario(page, "collection-batch-15d-gabar");
  const fullHand = await page.evaluate(async () => {
    player1.hand = ["H000001","H000002","H000003","H000004","H000005","H000006","H000007","H000008","H000009","H000010","H000011","H000012"];
    player1.drawPile = ["S000057"];
    player1.servants = [{id:"H000032", atk:1, pdv:2, pdvMax:2, prepared:true}];
    refreshRuntimeZone(player1, "hand");
    refreshRuntimeZone(player1, "deck");
    refreshRuntimeZone(player1, "servants");
    const draw = drawCardFromRuntimeDeck(player1);
    return {
      draw,
      hand:playerHand(player1).map(getRuntimeCardId),
      deck:playerDrawPile(player1).map(getRuntimeCardId),
      board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id)
    };
  });
  expect(fullHand.draw.evolutionResolution?.destination).toBe("deck-top");
  expect(fullHand.hand).not.toContain("H000033");
  expect(fullHand.deck.at(-1)).toBe("H000033");
  expect(fullHand.board).not.toContain("H000032");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("French notification typography uses NBSP codepoints and keeps punctuation attached", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-invocation");
  const audit = await page.evaluate(() => {
    const samples = [
      normalizeFrenchNotificationText("SORT JOUÉ : EXEMPLE"),
      normalizeFrenchNotificationText("QUI EST LÀ ?"),
      normalizeFrenchNotificationText("ATTENTION !"),
      normalizeFrenchNotificationText("« TEXTE ENTRE GUILLEMETS »")
    ];
    const container = document.querySelector("#notif");
    container.style.width = "46px";
    container.style.whiteSpace = "normal";
    container.textContent = samples[1];
    const textNode = container.firstChild;
    const rangeWord = document.createRange();
    const rangePunctuation = document.createRange();
    const text = textNode.textContent;
    rangeWord.setStart(textNode, text.indexOf("LÀ"));
    rangeWord.setEnd(textNode, text.indexOf("LÀ") + 2);
    rangePunctuation.setStart(textNode, text.indexOf("?"));
    rangePunctuation.setEnd(textNode, text.indexOf("?") + 1);
    const wordRect = rangeWord.getBoundingClientRect();
    const punctuationRect = rangePunctuation.getBoundingClientRect();
    container.removeAttribute("style");
    return {
      samples,
      sameLine:Math.abs(wordRect.top - punctuationRect.top) < 1,
      noAsciiBeforePunctuation:samples.every(text => !/ [:\;\?\!»]/.test(text)),
      noAsciiAfterOpenQuote:samples.every(text => !/« /.test(text)),
      hasNbsp:samples.every(text => /[\u00a0]/.test(text)),
      literalNbsp:samples.some(text => text.includes("&nbsp;"))
    };
  });
  for (const sample of audit.samples) expectFrenchNoBreakSpaces(sample);
  expect(audit.noAsciiBeforePunctuation).toBe(true);
  expect(audit.noAsciiAfterOpenQuote).toBe(true);
  expect(audit.hasNbsp).toBe(true);
  expect(audit.literalNbsp).toBe(false);
  expect(audit.sameLine).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
