import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics, waitForVisibleHandStable} from "./helpers/eloron-ui.mjs";

const scenarios = ["collection-batch-15a-hand-info-a", "collection-batch-15a-draw-choice-b", "collection-batch-15a-faction-draw-c", "collection-batch-15a-delayed-recycle-d"];

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}
async function openBatch15AScenario(page, scenario) {
  await page.addInitScript(() => {
    const sequence = [0, 0.2, 0.4, 0.6, 0.8];
    const nativeRandom = Math.random.bind(Math);
    let index = 0;
    Math.random = () => (index < sequence.length ? sequence[index++] : nativeRandom());
  });
  await page.goto(`/code/partie-test-1.html?scenario=${scenario}&batch15a=${Date.now()}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await waitForVisibleHandStable(page);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
}

test("Batch 15A scenarios stay hidden and runtime data is synchronized", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  for (const scenario of scenarios) {
    await openBatch15AScenario(page, scenario);
    const audit = await page.evaluate(() => ({
      publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length,
      cards:["S000002","S000004","S000006","S000017","S000019","S000020","S000029","S000030","S000037","S000043","S000044"].map(id => {
        const node = document.createElement("div");
        node.innerHTML = fmtDesc(CARDS_DATA[id]?.cap || "");
        return {id, exists:!!CARDS_DATA[id], type:CARDS_DATA[id]?.type || null, fac:CARDS_DATA[id]?.fac || null, highlights:[...node.querySelectorAll("strong.kv")].map(strong => strong.textContent)};
      })
    }));
    expect(audit.publicOptionCount).toBe(0);
    for (const card of audit.cards) {
      expect(card.exists, card.id).toBe(true);
      expect(card.type, card.id).toBe("Sort");
      expect(card.fac, card.id).toBe("sort");
    }
    expect(audit.cards.find(card => card.id === "S000002").highlights).toEqual(["3", "1"]);
    expect(audit.cards.find(card => card.id === "S000004").highlights).toEqual(["3", "2", "Approvisionnement"]);
    expect(audit.cards.find(card => card.id === "S000006").highlights).toEqual(["4", "1"]);
    expect(audit.cards.find(card => card.id === "S000017").highlights).toEqual(["2"]);
    expect(audit.cards.find(card => card.id === "S000020").highlights).toEqual(["1"]);
  }
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000002 reveals three opponent cards and blocks one occurrence", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15AScenario(page, "collection-batch-15a-hand-info-a");
  const result = await page.evaluate(() => {
    ensureBatch03HandOccurrences(player2);
    const revealed = player2.hand.slice(0, 3).map((cardId, index) => ({cardId, index, occurrenceId:batch03HandOccurrenceAt(player2, index)}));
    const selected = revealed[1];
    const resolved = resolveDesYeuxDansLeNoir(player1, {selected, revealed});
    const partialFaceCount = document.querySelectorAll('.hand-j2 [data-batch15a-hand-reveal="S000002"]').length;
    batch03ArmBlockedHandOccurrences(player2);
    const blockedWhileArmed = isBatch03HandCardBlocked(selected.cardId, player2, selected.index);
    const expired = batch03ExpireBlockedHandOccurrences(player2);
    const blockedAfterExpire = isBatch03HandCardBlocked(selected.cardId, player2, selected.index);
    const notification = document.querySelector("#notif")?.textContent || "";
    return {resolved, partialFaceCount, blockedWhileArmed, expired, blockedAfterExpire, selected, notification};
  });
  expect(result.resolved.success).toBe(true);
  expect(result.resolved.revealed).toHaveLength(3);
  expect(result.partialFaceCount).toBe(3);
  expect(result.blockedWhileArmed).toBe(true);
  expect(result.expired).toBe(true);
  expect(result.blockedAfterExpire).toBe(false);
  expect(result.notification).toBe("DES ESPIONS HABILES MANOEUVRENT DEPUIS LES OMBRES ET MINENT L'ADVERSAIRE DE L'INTÉRIEUR !");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000002 selection modal uses the spell cancel button style", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15AScenario(page, "collection-batch-15a-hand-info-a");
  const modal = await page.evaluate(() => {
    window.__batch15aEyesPromise = new Promise(resolve => {
      showEyesInDarkSelection(player1, {onSelect:payload => resolve(payload), onCancel:() => resolve(null)});
    });
    const button = document.querySelector(".sort-choice-cancel-button");
    const style = button ? getComputedStyle(button) : null;
    return {
      exists:!!button,
      text:button?.textContent?.trim() || "",
      fontFamily:style?.fontFamily || "",
      borderRadius:style?.borderRadius || "",
      backgroundImage:style?.backgroundImage || "",
      borderColor:style?.borderColor || ""
    };
  });
  expect(modal.exists).toBe(true);
  expect(modal.text).toMatch(/Annuler/i);
  expect(modal.fontFamily).toMatch(/Cinzel/i);
  expect(parseFloat(modal.borderRadius)).toBeGreaterThan(0);
  expect(modal.backgroundImage).toMatch(/gradient/i);
  expect(modal.borderColor).not.toBe("buttonborder");
  await page.locator(".sort-choice-cancel-button").click();
  await expect.poll(() => page.evaluate(() => window.__batch15aEyesPromise)).toBeNull();
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000004 supports draw-three and deck-then-graveyard supplies", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15AScenario(page, "collection-batch-15a-draw-choice-b");
  const result = await page.evaluate(async () => {
    const events = [];
    window.__collectionBatch15AEvents = events;
    player1.hand = [];
    player1.drawPile = ["H000001", "R000004", "S000003", "R000011"];
    player1.graveyard = ["R000001", "H000005", "R000010"];
    const drawThree = await resolveCommerceAvecLesLegendes(player1, "draw3");
    const afterDrawThree = [...player1.hand];
    player1.hand = [];
    player1.drawPile = ["H000001", "S000003", "R000011"];
    player1.graveyard = ["R000001", "H000005", "R000010"];
    const supplies = await resolveCommerceAvecLesLegendes(player1, "supplies");
    return {drawThree, afterDrawThree, supplies, hand:[...player1.hand], graveyard:player1.graveyard.map(getRuntimeCardId), events};
  });
  expect(result.drawThree.drawn).toHaveLength(3);
  expect(result.afterDrawThree).toEqual(["R000011", "S000003", "R000004"]);
  expect(result.supplies.drawn).toEqual(["R000011", "R000010"]);
  expect(result.supplies.results.map(entry => entry.sourceZone)).toEqual(["deck", "graveyard"]);
  expect(result.hand).toEqual(["R000011", "R000010"]);
  expect(result.graveyard).toEqual(["R000001", "H000005"]);
  expect(result.events.filter(event => event.type === "draw-flight" && event.reason === "S000004-draw3")).toHaveLength(3);
  expect(result.events.filter(event => event.type === "draw-flight" && event.reason === "S000004-supplies").map(event => event.sourceZone)).toEqual(["deck", "graveyard"]);
  expect(result.events.filter(event => event.type === "hand-glow" && event.reason === "batch15a-S000004-gold")).toHaveLength(5);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000006 keeps three revealed cards and returns one under deck", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15AScenario(page, "collection-batch-15a-draw-choice-b");
  const result = await page.evaluate(async () => {
    player1.hand = [];
    player1.drawPile = ["H000001", "S000003", "R000011", "S000043", "R000010"];
    const events = [];
    window.__collectionBatch15AEvents = events;
    const resolved = await resolveMurmuresDivins(player1, {zoneSelection:{selectedIndex:1}});
    const notification = document.querySelector("#notif")?.textContent || "";
    return {resolved, hand:[...player1.hand], deck:player1.drawPile.map(getRuntimeCardId), occurrences:[...ensureBatch03HandOccurrences(player1)], events, notification};
  });
  expect(result.resolved.revealed).toEqual(["R000010", "S000043", "R000011", "S000003"]);
  expect(result.resolved.returnedCardId).toBe("S000043");
  expect(result.resolved.animations).toHaveLength(3);
  expect(result.resolved.deckPulse).toBe(true);
  expect(result.deck[0]).toBe("S000043");
  expect(result.hand).toEqual(["R000010", "R000011", "S000003"]);
  expect(result.occurrences).toHaveLength(result.hand.length);
  expect(result.events.filter(event => event.type === "draw-flight" && event.reason === "S000006-draw")).toHaveLength(3);
  expect(result.events.filter(event => event.type === "hand-glow" && event.reason === "batch15a-S000006-gold")).toHaveLength(3);
  expect(result.events.filter(event => event.type === "deck-pulse" && event.reason === "S000006-return-under-deck")).toHaveLength(1);
  expect(result.notification).toBe("CEUX QUI PARVIENNENT À SAISIR LES MURMURES DES DIEUX SONT BÉNIS ENTRE TOUS.");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000006 choice modal keeps enlarged cards unclipped", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15AScenario(page, "collection-batch-15a-draw-choice-b");
  const modal = await page.evaluate(() => {
    window.__batch15aMurmuresPromise = chooseMurmuresDivinsReturnCard(player1, [
      {cardId:"R000010", revealOccurrenceId:"modal-0", entry:"R000010"},
      {cardId:"S000043", revealOccurrenceId:"modal-1", entry:"S000043"},
      {cardId:"R000011", revealOccurrenceId:"modal-2", entry:"R000011"},
      {cardId:"S000003", revealOccurrenceId:"modal-3", entry:"S000003"}
    ]);
    const panel = document.querySelector(".murmures-divins-choice-panel");
    const cards = panel?.querySelector(".sort-choice-cards");
    const items = [...(panel?.querySelectorAll(".sort-choice-item") || [])];
    return {
      panelOverflow:panel ? getComputedStyle(panel).overflow : null,
      cardsOverflow:cards ? getComputedStyle(cards).overflow : null,
      itemOverflow:items.map(item => getComputedStyle(item).overflow),
      itemCount:items.length
    };
  });
  expect(modal.itemCount).toBe(4);
  expect(modal.panelOverflow).toBe("visible");
  expect(modal.cardsOverflow).toBe("visible");
  expect(modal.itemOverflow.every(value => value === "visible")).toBe(true);
  await page.locator(".murmures-divins-choice-panel .sort-choice-item").first().click();
  await page.locator("#murmures-confirm").click();
  await expect.poll(() => page.evaluate(() => window.__batch15aMurmuresPromise.then(value => value !== null))).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000017 draws cheapest and priciest spells", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15AScenario(page, "collection-batch-15a-draw-choice-b");
  const result = await page.evaluate(async () => {
    const events = [];
    window.__collectionBatch15AEvents = events;
    player1.hand = [];
    player1.drawPile = ["H000001", "S000002", "S000043", "S000004", "R000010"];
    const resolved = await resolveQueteMagique(player1);
    const firstHand = [...player1.hand];
    player1.hand = [];
    player1.drawPile = ["H000001", "S000004", "R000010"];
    const single = await resolveQueteMagique(player1);
    return {resolved, single, firstHand, hand:[...player1.hand], deck:player1.drawPile.map(getRuntimeCardId), events, notification:document.querySelector("#notif")?.textContent || ""};
  });
  expect(result.resolved.drawn.sort()).toEqual(["S000002", "S000043"].sort());
  expect(result.firstHand.sort()).toEqual(["S000002", "S000043"].sort());
  expect(result.single.drawn).toEqual(["S000004"]);
  expect(result.hand).toEqual(["S000004"]);
  expect(result.events.filter(event => event.type === "draw-flight" && event.reason === "S000017-draw")).toHaveLength(3);
  expect(result.events.filter(event => event.type === "hand-glow" && event.reason === "batch15a-S000017-gold")).toHaveLength(3);
  expect(result.notification).toBe("L'ÉTERNELLE QUÊTE DE CONNAISSANCE DES MAGES PRODUIT TOUJOURS DES RÉSULTATS, QUOIQUE PAS TOUJOURS CEUX QU'ILS ESPÈRENT.");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000019 replaces the third later owner draw with four cards", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15AScenario(page, "collection-batch-15a-delayed-recycle-d");
  const result = await page.evaluate(async () => {
    player1.hand = [];
    player1.drawPile = ["H000001", "H000005", "S000003", "R000010", "S000017", "R000011"];
    turnSequence = 10; const armed = resolvePierresDeCommunication(player1);
    turnSequence = 12; const first = await resolveBatch15APierresCommunicationStartTurn(player1);
    turnSequence = 14; const second = await resolveBatch15APierresCommunicationStartTurn(player1);
    turnSequence = 16; const third = await resolveBatch15APierresCommunicationStartTurn(player1);
    return {armed, first, second, third, hand:[...player1.hand], remainingEffects:player1.batch15aPierresCommunication || []};
  });
  expect(result.armed.success).toBe(true);
  expect(result.first).toBeNull();
  expect(result.second).toBeNull();
  expect(result.third.replacesNormalDraw).toBe(true);
  expect(result.third.drawn).toHaveLength(4);
  expect(result.hand).toHaveLength(4);
  expect(result.remainingEffects).toEqual([]);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000020 draws one and permanently reveals only opponent hand", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15AScenario(page, "collection-batch-15a-hand-info-a");
  const result = await page.evaluate(async () => {
    const events = [];
    window.__collectionBatch15AEvents = events;
    player1.hand = [];
    player1.drawPile = ["H000001", "S000003"];
    const beforeOpponentFace = document.querySelectorAll('.hand-j2 .hc[data-id]').length;
    const resolved = await resolveBassinDeDivination(player1);
    const afterOpponentFace = document.querySelectorAll('.hand-j2 [data-batch15a-hand-reveal="S000020"]').length;
    addCardToHand(player2, "H000005", {refresh:true});
    const afterNewCard = document.querySelectorAll('.hand-j2 [data-batch15a-hand-reveal="S000020"]').length;
    const ownReveal = document.querySelectorAll('.hand-j1 [data-batch15a-hand-reveal="S000020"]').length;
    return {beforeOpponentFace, resolved, afterOpponentFace, afterNewCard, ownReveal, player1Hand:[...player1.hand], player2Hand:[...player2.hand], events, notification:document.querySelector("#notif")?.textContent || "", playerName:playerName(player1)};
  });
  expect(result.beforeOpponentFace).toBe(0);
  expect(result.resolved.success).toBe(true);
  expect(result.player1Hand).toContain("S000003");
  expect(result.afterNewCard).toBe(result.player2Hand.length);
  expect(result.ownReveal).toBe(0);
  expect(result.events.filter(event => event.type === "draw-flight" && event.reason === "S000020-draw")).toHaveLength(1);
  expect(result.events.filter(event => event.type === "hand-glow" && event.reason === "batch15a-S000020-gold")).toHaveLength(1);
  expect(result.notification).toBe(`${result.playerName.toLocaleUpperCase("fr-FR")} A TROUVÉ LE CHEMIN DU LÉGENDAIRE BASSIN DE DIVINATION ! SON ADVERSAIRE NE POURRA PLUS LUI CACHER SES INTENTIONS.`);
  expect(result.notification).not.toContain("<NOM_AVATAR_JOUEUR>");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000030 exchanges hands and restores current remaining hands", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15AScenario(page, "collection-batch-15a-hand-info-a");
  const result = await page.evaluate(() => {
    const events = [];
    window.__collectionBatch15AEvents = events;
    player1.hand = ["H000001", "S000017"];
    player2.hand = ["R000010", "B000015", "S000004"];
    ensureBatch03HandOccurrences(player1); ensureBatch03HandOccurrences(player2);
    const exchange = resolveSombreAffaire(player1);
    const afterExchange = {p1:[...player1.hand], p2:[...player2.hand]};
    player1.hand.pop(); batch03RemoveHandOccurrenceAt(player1, player1.hand.length);
    const restore = resolveBatch15ASombreAffaireEndTurn(player1);
    return {exchange, afterExchange, restore, final:{p1:[...player1.hand], p2:[...player2.hand]}, events, notification:document.querySelector("#notif")?.textContent || ""};
  });
  expect(result.exchange.success).toBe(true);
  expect(result.afterExchange.p1).toEqual(["R000010", "B000015", "S000004"]);
  expect(result.afterExchange.p2).toEqual(["H000001", "S000017"]);
  expect(result.restore.success).toBe(true);
  expect(result.final.p1).toEqual(["H000001", "S000017"]);
  expect(result.final.p2).toEqual(["R000010", "B000015"]);
  expect(result.exchange.flashCount).toBe(2);
  expect(result.restore.flashCount).toBe(2);
  expect(result.events.filter(event => event.type === "hand-flash" && event.reason === "sombre-affaire-exchange")).toEqual([expect.objectContaining({count:2})]);
  expect(result.events.filter(event => event.type === "hand-flash" && event.reason === "sombre-affaire-restore")).toEqual([expect.objectContaining({count:2})]);
  expect(result.notification).toBe("AU MARCHÉ NOIR, IL N'Y A PAS D'AFFAIRES SANS RISQUE, QUE DES PARIS DANGEREUX.");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000029 S000037 S000043 draw only expected cards", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15AScenario(page, "collection-batch-15a-faction-draw-c");
  const result = await page.evaluate(async () => {
    player1.hand = [];
    player1.drawPile = ["S000027", "EDG000005", "S000029", "EDG000006", "EDG000007", "R000010"];
    const ice = await resolvePatrouilleGlaciale(player1);
    player1.hand = ["H000001", "H000005", "S000004", "R000010", "S000017"];
    player1.drawPile = ["S000038", "GOB000001", "GOB000002", "S000037", "GOB000003"];
    const ley = await resolveCheminsDeLey(player1);
    player1.hand = [];
    player1.drawPile = ["B000001", "B000015", "B000016", "H000001", "B000017"];
    const taureau = await resolveTaureauParLesCornes(player1);
    return {ice, ley, taureau};
  });
  expect(result.ice.drawn).toEqual(["EDG000007", "EDG000006", "EDG000005"]);
  expect(result.ice.drawn).not.toContain("S000029");
  expect(result.ley.drawn).toEqual(["GOB000003", "GOB000002", "GOB000001"]);
  expect(result.ley.handSizeAfterDraw).toBe(8);
  expect(result.taureau.drawn.sort()).toEqual(["B000015", "B000016", "B000017"].sort());
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000044 Recyclage non regression", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15AScenario(page, "collection-batch-15a-delayed-recycle-d");
  const result = await page.evaluate(async () => {
    player1.hand = [];
    player1.drawPile = ["H000024", "S000003", "R000010"];
    player1.graveyard = ["R000001", "H000005"];
    const armed = resolveBatch11eRecyclage(player1);
    await summonBatch03Servant(player1, "H000001", {triggerInitiativeEffect:false, ready:true});
    return {armed, hand:[...player1.hand], deck:player1.drawPile.map(getRuntimeCardId), graveyard:player1.graveyard.map(getRuntimeCardId)};
  });
  expect(result.armed.success).toBe(true);
  expect(result.hand).toContain("R000010");
  expect(result.deck).toContain("H000005");
  expect(result.graveyard).toEqual(["R000001"]);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
