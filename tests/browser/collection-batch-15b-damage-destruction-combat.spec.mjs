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
  await expect(page.locator(".hc[data-id], .fc[data-id]").first()).toBeVisible();
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
    expect(audit.cards.find(card => card.id === "S000001").highlights).toEqual(["5", "1", "Approvisionnement"]);
    expect(audit.cards.find(card => card.id === "S000005").highlights).toEqual(["8", "2", "Approvisionnement"]);
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
      message:window.COLLECTION_BATCH_15B_MESSAGES.S000001,
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
  expect(result.message).toBe("L'EMBUSCADE EST UN SUCCÈS, L'ADVERSAIRE N'A RIEN VU VENIR.");
  expect(result.events.some(event => event.type === "embuscade-supply-stolen")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000001 and S000005 expose Daddy target modal copy and styled controls", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15BScenario(page, "collection-batch-15b-destroy-target-a");
  await page.evaluate(() => {
    window.__batch15bTargetCopyPromise = playCard("S000001", document.querySelector(`${playerZoneSelector(player1, "hand")} .hc[data-id="S000001"]`));
  });
  await expect(page.getByTestId("board-target-prompt")).toHaveText("Choisissez votre proie.");
  await expect(page.getByTestId("board-target-confirm")).toHaveText("LANCER L'EMBUSCADE");
  const embuscadeButtonStyle = await page.getByTestId("board-target-confirm").evaluate(button => ({
    backgroundImage:getComputedStyle(button).backgroundImage,
    borderRadius:getComputedStyle(button).borderRadius
  }));
  expect(embuscadeButtonStyle.backgroundImage).toContain("linear-gradient");
  expect(embuscadeButtonStyle.borderRadius).not.toBe("0px");
  await page.getByTestId("board-target-choice").first().click();
  await page.getByTestId("board-target-confirm").click();
  const embuscade = await page.evaluate(() => window.__batch15bTargetCopyPromise);
  expect(embuscade.success).toBe(true);
  expect(embuscade.spellResolution || embuscade).toEqual(expect.objectContaining({success:true, cardId:"S000001"}));

  await openBatch15BScenario(page, "collection-batch-15b-destroy-target-a");
  await page.evaluate(() => {
    window.__batch15bTargetCopyPromise = playCard("S000005", document.querySelector(`${playerZoneSelector(player1, "hand")} .hc[data-id="S000005"]`));
  });
  await expect(page.getByTestId("board-target-prompt")).toHaveText("Indiquez une cible à votre assassin.");
  await expect(page.getByTestId("board-target-confirm")).toHaveText("ASSASSINER");
  await page.getByTestId("board-target-choice").first().click();
  await page.getByTestId("board-target-confirm").click();
  await expect(page.locator(".assassination-choice-panel")).toBeVisible();
  const assassinationLayout = await page.evaluate(() => {
    const panel = document.querySelector(".assassination-choice-panel");
    const body = document.querySelector(".assassination-body");
    const area = document.querySelector(".assassination-supply-area");
    const grid = document.querySelector(".assassination-supply-grid");
    return {
      panelOverflow:getComputedStyle(panel).overflow,
      bodyOverflow:getComputedStyle(body).overflow,
      areaOverflow:getComputedStyle(area).overflow,
      gridOverflow:getComputedStyle(grid).overflow,
      gridMaxHeight:getComputedStyle(grid).maxHeight
    };
  });
  expect(assassinationLayout).toMatchObject({
    panelOverflow:"visible",
    bodyOverflow:"visible",
    areaOverflow:"visible",
    gridOverflow:"visible",
    gridMaxHeight:"none"
  });
  await page.locator("#assassination-abandon").click();
  const assassinat = await page.evaluate(() => window.__batch15bTargetCopyPromise);
  expect(assassinat.success).toBe(true);
  expect(assassinat.spellResolution.cancelled).toBe(false);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000001 does not create a ghost supply when no opponent supply exists", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15BScenario(page, "collection-batch-15b-destroy-target-a");
  const result = await page.evaluate(async () => {
    player2.drawPile = ["H000005", "H000006"];
    player2.graveyard = ["H000001", "H000005"];
    updateDeckCount(player2);
    refreshCemeteryVisual(player2);
    const target = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000001");
    const before = player1.hand.length;
    const resolved = await resolveEmbuscadeElfique(player1, {selectedTargetIds:[target.dataset.instance]});
    return {
      before,
      after:player1.hand.length,
      resolved,
      player1Hand:player1.hand.map(getRuntimeCardId)
    };
  });
  expect(result.resolved.success).toBe(true);
  expect(result.resolved.steal.success).toBe(false);
  expect(result.resolved.steal.reason).toBe("no-opponent-supply");
  expect(result.after).toBe(result.before);
  expect(result.player1Hand).not.toContain("R000001");
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
  expect(result.resolved.reason).toBe("cancelled-by-hand-supplies");
  expect(result.targetStillAlive).toBe(true);
  expect(result.player2Hand).not.toContain("R000001");
  expect(result.player2Hand).not.toContain("R000002");
  expect(result.player2Graveyard).toEqual(expect.arrayContaining(["R000001", "R000002"]));
  expect(result.player2SupplyBoard.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.COLLECTION_BATCH_15B_MESSAGES.S000005_CANCEL)).toBe("L'ASSASSIN A TROUVÉ UNE OFFRE PLUS INTÉRESSANTE ET IMMÉDIATEMENT RETOURNÉ SA VESTE !");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000005 destroys its target when the defender does not cancel", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15BScenario(page, "collection-batch-15b-destroy-target-a");
  const result = await page.evaluate(async () => {
    const target = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000005");
    const resolved = await resolveAssassinat(player1, {
      selectedTargetIds:[target.dataset.instance],
      assassinationDecision:{action:"abandon"}
    });
    return {
      resolved,
      targetStillAlive:target.isConnected && !target.dataset.dead,
      player2Graveyard:player2.graveyard.map(getRuntimeCardId),
      message:window.COLLECTION_BATCH_15B_MESSAGES.S000005_KILL
    };
  });
  expect(result.resolved.success).toBe(true);
  expect(result.resolved.cancelled).toBe(false);
  expect(result.resolved.reason).toBe("target-destroyed");
  expect(result.targetStillAlive).toBe(false);
  expect(result.player2Graveyard).toContain("H000005");
  expect(result.message).toBe("MISSION ACCOMPLIE : CIBLE ÉLIMINÉE.");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000031 duels through Insensible and sends destroyed combatants to caster cemetery", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15BScenario(page, "collection-batch-15b-duel-overflow-b");
  const result = await page.evaluate(async () => {
    const first = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000001");
    const second = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000029");
    const resolved = await resolveDuel(player1, {selectedTargetIds:[first.dataset.instance, second.dataset.instance]});
    return {
      resolved,
      firstConnected:first.isConnected,
      secondPdv:Number(second.dataset.pdv || 0),
      secondConnected:second.isConnected,
      player1Graveyard:player1.graveyard.map(getRuntimeCardId),
      player2Graveyard:player2.graveyard.map(getRuntimeCardId)
    };
  });
  expect(result.resolved.success).toBe(true);
  expect(result.resolved.combatants.map(card => card.id)).toContain("H000029");
  expect(result.firstConnected).toBe(false);
  expect(result.secondConnected).toBe(true);
  expect(result.secondPdv).toBe(5);
  expect(result.player1Graveyard).toContain("H000001");
  expect(result.player2Graveyard).not.toContain("H000001");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000031 validates two selected modal targets without the invalid-target error", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15BScenario(page, "collection-batch-15b-duel-overflow-b");
  await page.evaluate(() => {
    window.__batch15bDuelPromise = playCard("S000031", document.querySelector(`${playerZoneSelector(player1, "hand")} .hc[data-id="S000031"]`));
  });
  await expect(page.getByTestId("board-target-choice").first()).toBeVisible();
  await page.locator('[data-testid="board-target-choice"][data-target-id="H000001"]').first().click();
  await page.locator('[data-testid="board-target-choice"][data-target-id="H000006"]').first().click();
  await expect(page.getByTestId("board-target-confirm")).toBeEnabled();
  await page.getByTestId("board-target-confirm").click();
  const result = await page.evaluate(() => window.__batch15bDuelPromise);
  expect(result.success).toBe(true);
  expect(result.spellResolution.success).toBe(true);
  expect(result.spellResolution.combatants.map(card => card.id)).toEqual(expect.arrayContaining(["H000001", "H000006"]));
  expect(result.reason || result.spellResolution.reason || "").not.toBe("invalid-target");
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
      insensibleConnected:insensible.isConnected,
      message:window.COLLECTION_BATCH_15B_MESSAGES.S000032
    };
  });
  expect(result.resolved.success).toBe(true);
  expect(result.message).toBe("LA MAGIE CHAMANIQUE EST CERTES PRIMITIVE, MAIS NÉANMOINS DANGEREUSE...");
  expect(result.targetConnected).toBe(false);
  expect(result.resolved.hits.map(hit => hit.blocked || null)).toContain("Insensible");
  expect(result.insensibleConnected).toBe(true);
  expect(result.insensiblePdv).toBe(8);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000063 Choc mental remains a simple non-regression on Insensible", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15BScenario(page, "collection-batch-15b-destroy-target-a");
  const result = await page.evaluate(async () => {
    const target = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000029");
    const before = Number(target.dataset.pdv || 0);
    const resolved = await resolveBatch09ChocMental(player1, {selectedTargetIds:[target.dataset.instance]});
    return {
      resolved,
      before,
      after:Number(target.dataset.pdv || 0),
      insensible:target.dataset.insensible === "1"
    };
  });
  expect(result.resolved.success).toBe(true);
  expect(result.insensible).toBe(true);
  expect(result.after).toBeLessThan(result.before);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000046 repeats troll attacks until no enemy servants remain or the troll dies", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15BScenario(page, "collection-batch-15b-troll-chain-c");
  await page.evaluate(() => {
    window.__batch15bTrollChoicePromise = playCard("S000046", document.querySelector(`${playerZoneSelector(player1, "hand")} .hc[data-id="S000046"]`));
  });
  await expect(page.locator(".batch09-ca-casse-choice-panel .sort-choice-title")).toHaveText("ÇA PASSE OU ÇA CASSE");
  const choiceCopy = await page.locator(".batch09-ca-casse-choice-panel").evaluate(panel => ({
    title:panel.querySelector(".sort-choice-title")?.textContent?.trim() || "",
    prompt:panel.querySelector('[data-testid="board-target-prompt"]')?.textContent?.trim() || "",
    instructionCount:(panel.textContent?.match(/Envoyer un troll tout casser !/g) || []).length
  }));
  expect(choiceCopy.title).toBe("ÇA PASSE OU ÇA CASSE");
  expect(choiceCopy.prompt).toBe("Envoyer un troll tout casser !");
  expect(choiceCopy.instructionCount).toBe(1);

  await openBatch15BScenario(page, "collection-batch-15b-troll-chain-c");
  const result = await page.evaluate(async () => {
    window.__collectionBatch09RandomQueue = [0, 0, 0, 0, 0, 0];
    const troll = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000006");
    const resolved = await resolveBatch09CaPasseOuCaCasse(player1, {selectedTargetIds:[troll.dataset.instance]});
    return {
      resolved,
      trollAlive:troll.isConnected && !troll.dataset.dead,
      enemiesLeft:livingServantCardsForPlayer(player2).length,
      player2Graveyard:player2.graveyard.map(getRuntimeCardId)
    };
  });
  expect(result.resolved.success).toBe(true);
  expect(result.resolved.rounds).toBeGreaterThanOrEqual(1);
  expect(result.trollAlive).toBe(true);
  expect(result.enemiesLeft).toBe(0);
  expect(result.resolved.roundResults.some(round => (
    round.trollBefore
    && round.trollAfterDamage
    && round.heal
    && round.trollAfterDamage.pdv < round.trollBefore.pdv
    && round.trollAfterHeal.pdv > round.trollAfterDamage.pdv
  ))).toBe(true);
  expect(result.player2Graveyard.length).toBeGreaterThanOrEqual(3);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000025 destroys servants, supplies, decks and avatars despite Insensible", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15BScenario(page, "collection-batch-15b-eternal-fire-d");
  const result = await page.evaluate(async () => {
    window.__collectionBatch15BEvents = [];
    const resolution = resolveFeuEternelDechaine(player1);
    const shakeDuring = await new Promise(resolve => {
      const startedAt = Date.now();
      const tick = () => {
        const terrain = document.querySelector(".terrain");
        const active = document.body.classList.contains("batch15b-camera-shake");
        const animationName = terrain ? getComputedStyle(terrain).animationName : "";
        if (active) {
          resolve({seen:true, bodyClass:active, terrainAnimationName:animationName});
          return;
        }
        if (Date.now() - startedAt > 5000) {
          resolve({seen:false, bodyClass:active, terrainAnimationName:animationName});
          return;
        }
        setTimeout(tick, 20);
      };
      tick();
    });
    const resolved = await resolution;
    const terrainAnimationAfter = getComputedStyle(document.querySelector(".terrain")).animationName;
    return {
      resolved,
      shakeDuring,
      events:window.__collectionBatch15BEvents,
      overlayCount:document.querySelectorAll(".batch15b-eternal-fire-prelude").length,
      cameraShake:document.body.classList.contains("batch15b-camera-shake"),
      terrainAnimationAfter,
      servantsLeft:document.querySelectorAll('.fc[data-instance]:not([data-dead])').length,
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
  const eventTypes = result.events.map(event => event.type);
  expect(result.resolved.success).toBe(true);
  expect(result.resolved.prelude.visible).toBe(true);
  expect(eventTypes.indexOf("feu-eternel-prelude-card")).toBeLessThan(eventTypes.indexOf("feu-eternel-prelude-explosion"));
  expect(eventTypes.indexOf("feu-eternel-prelude-cleared")).toBeLessThan(eventTypes.indexOf("card-transfer"));
  expect(result.shakeDuring).toEqual(expect.objectContaining({seen:true, bodyClass:true, terrainAnimationName:"batch15BCameraShake"}));
  expect(result.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type:"feu-eternel-camera-shake", active:true}),
    expect.objectContaining({type:"feu-eternel-camera-shake", active:false})
  ]));
  expect(result.overlayCount).toBe(0);
  expect(result.cameraShake).toBe(false);
  expect(result.terrainAnimationAfter).not.toBe("batch15BCameraShake");
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
