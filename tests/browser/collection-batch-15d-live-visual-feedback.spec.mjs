import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

test.setTimeout(90000);

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

async function openBatch15DScenario(page, scenario, extra = "") {
  await page.addInitScript(() => {
    const sequence = [0, 0.18, 0.36, 0.54, 0.72, 0.9, 0.08, 0.26, 0.44, 0.62, 0.8];
    const nativeRandom = Math.random.bind(Math);
    let index = 0;
    Math.random = () => (index < sequence.length ? sequence[index++] : nativeRandom());
  });
  const suffix = extra ? `${extra}&batch15d2=${Date.now()}` : `&batch15d2=${Date.now()}`;
  await page.goto(`/code/partie-test-1.html?scenario=${scenario}${suffix}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.querySelector("#btnEndTurn")?.classList.contains("vis") === true), {timeout:15000}).toBe(true);
  await installBatch15D2Observer(page);
}

async function installBatch15D2Observer(page) {
  await page.evaluate(() => {
    window.__batch15d2Observed = [];
    window.__batch15d4Evidence = {transfers:[], slotCounts:[], notifications:[], gabarTimeline:[]};
    window.__batch15d4NextTurnCalls = 0;
    if (!window.__batch15d4OriginalNextTurn && typeof window.nextTurn === "function") {
      window.__batch15d4OriginalNextTurn = window.nextTurn;
      window.nextTurn = function batch15d4TrackedNextTurn(...args) {
        window.__batch15d4NextTurnCalls += 1;
        return window.__batch15d4OriginalNextTurn.apply(this, args);
      };
    }
    const gabarZoneSnapshot = () => ({
      currentPlayer,
      turnSequence,
      actionsLeft:player1?.actionsLeft ?? null,
      nextTurnCalls:window.__batch15d4NextTurnCalls,
      hand:playerHand(player1).map(getRuntimeCardId),
      deck:playerDrawPile(player1).map(getRuntimeCardId),
      graveyard:player1.graveyard.map(getRuntimeCardId),
      board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id),
      notifications:[...(window.__batch15d4Evidence?.notifications || [])].map(item => item.text)
    });
    const recordGabar = (type, detail = {}) => {
      window.__batch15d4Evidence.gabarTimeline.push({type, at:performance.now(), ...gabarZoneSnapshot(), ...detail});
    };
    const rectSnapshot = element => {
      const rect = element?.getBoundingClientRect?.();
      if (!rect) return null;
      return {left:rect.left, top:rect.top, right:rect.right, bottom:rect.bottom, width:rect.width, height:rect.height, cx:rect.left + rect.width / 2, cy:rect.top + rect.height / 2};
    };
    const zoneRect = (playerKey, zone) => {
      const player = playerState(playerKey);
      if (!player) return null;
      const selector = zone === "deck" ? playerSelectors(player).deckBack : playerZoneSelector(player, zone === "graveyard" ? "cemetery" : "servants");
      return rectSnapshot(qs(selector));
    };
    const distance = (a, b) => a && b ? Math.hypot(a.cx - b.cx, a.cy - b.cy) : null;
    const slotSnapshot = () => {
      for (const playerKey of ["player1", "player2"]) {
        const player = playerState(playerKey);
        const zone = player ? qs(playerZoneSelector(player, "servants")) : null;
        const count = zone ? zone.querySelectorAll(":scope > .slot, :scope > .fc").length : 0;
        window.__batch15d4Evidence.slotCounts.push({playerKey, count, at:performance.now()});
      }
    };
    slotSnapshot();
    const readNode = node => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
      const element = node;
      const matches = element.matches?.("[data-batch15d-transfer],[data-batch15d-nain-pulse],[data-batch15d-hand-halo],[data-batch15d-deck-pulse],.batch15d-transfer-clone,.batch15d-nain-board-pulse,.batch15d-nain-hand-halo,.batch15d-nain-deck-pulse");
      if (!matches) return null;
      if (element.classList?.contains("batch15d-transfer-clone")) {
        const sourceOwner = element.dataset.batch15dSourceOwner;
        const sourceZone = element.dataset.batch15dSourceZone;
        const opponentKey = sourceOwner === "player1" ? "player2" : "player1";
        const fromCenter = {
          cx:parseFloat(element.style.getPropertyValue("--from-x")) + 46,
          cy:parseFloat(element.style.getPropertyValue("--from-y")) + 64
        };
        const ownerRect = zoneRect(sourceOwner, sourceZone);
        const opponentRect = zoneRect(opponentKey, sourceZone);
        window.__batch15d4Evidence.transfers.push({
          dataset:{...element.dataset},
          fromCenter,
          ownerRect,
          opponentRect,
          distanceToOwner:distance(fromCenter, ownerRect),
          distanceToOpponent:distance(fromCenter, opponentRect),
          at:performance.now()
        });
      }
      if (element.matches?.(".batch02-gabar-spell-presentation,[data-batch02-gabar-stage]")) {
        const rect = rectSnapshot(element);
        const viewport = {width:window.innerWidth, height:window.innerHeight, cx:window.innerWidth / 2, cy:window.innerHeight / 2};
        recordGabar(element.dataset.batch02GabarStage || "gabar-visual-node", {dataset:{...element.dataset}, className:element.className || "", text:element.textContent || "", rect, viewport});
      }
      if (element.matches?.(".batch02-responsibility-pulse,[data-batch02-responsibility-active]")) {
        recordGabar("old-gabar-pulse-start", {dataset:{...element.dataset}, cardId:element.dataset.id || null});
      }
      if (element.matches?.("[data-batch02-new-gabar-arrival]")) {
        recordGabar(element.dataset.batch02NewGabarArrival === "end" ? "new-gabar-arrival-end" : "new-gabar-arrival-start", {dataset:{...element.dataset}, cardId:element.dataset.id || null});
      }
      return {
        className:element.className || "",
        dataset:{...element.dataset},
        text:element.textContent?.trim() || ""
      };
    };
    const remember = node => {
      const direct = readNode(node);
      if (direct) window.__batch15d2Observed.push(direct);
      if (node?.querySelectorAll) {
        node.querySelectorAll("[data-batch15d-transfer],[data-batch15d-nain-pulse],[data-batch15d-hand-halo],[data-batch15d-deck-pulse],.batch15d-transfer-clone,.batch15d-nain-board-pulse,.batch15d-nain-hand-halo,.batch15d-nain-deck-pulse").forEach(child => {
          const item = readNode(child);
          if (item) window.__batch15d2Observed.push(item);
        });
      }
    };
    window.__batch15d2Observer?.disconnect?.();
    window.__batch15d2Observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        slotSnapshot();
        mutation.addedNodes.forEach(remember);
        if (mutation.type === "attributes") remember(mutation.target);
      }
    });
    window.__batch15d2Observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:["class", "data-batch15d-transfer", "data-batch15d-nain-pulse", "data-batch15d-hand-halo", "data-batch15d-deck-pulse", "data-batch02-gabar-stage", "data-batch02-responsibility-active", "data-batch02-new-gabar-arrival"]});
    document.body.addEventListener("batch02-gabar-visual-phase", event => recordGabar(event.detail?.phase || "custom-event", event.detail || {}));
    const notif = document.querySelector("#notif");
    window.__batch15d4NotificationObserver?.disconnect?.();
    window.__batch15d4NotificationObserver = new MutationObserver(() => {
      const text = notif?.textContent || "";
      if (text) {
        const last = window.__batch15d4Evidence.notifications.at(-1);
        if (last?.text !== text) {
          window.__batch15d4Evidence.notifications.push({text, at:performance.now()});
          recordGabar("resolution-message", {text});
        }
      }
    });
    if (notif) window.__batch15d4NotificationObserver.observe(notif, {childList:true, characterData:true, subtree:true, attributes:true});
  });
}

async function playSpellFromHand(page, cardId, waitMs = 5600) {
  await expect(page.locator(`.hc[data-id="${cardId}"]`).first()).toBeVisible();
  await page.evaluate(id => {
    const card = document.querySelector(`.hc[data-id="${id}"]`);
    const target = document.querySelector(".board-bg");
    if (!card || !target) throw new Error(`Unable to drag ${id}`);
    const dataTransfer = new DataTransfer();
    card.dispatchEvent(new DragEvent("dragstart", {bubbles:true, cancelable:true, dataTransfer}));
    target.dispatchEvent(new DragEvent("dragover", {bubbles:true, cancelable:true, dataTransfer}));
    target.dispatchEvent(new DragEvent("drop", {bubbles:true, cancelable:true, dataTransfer}));
  }, cardId);
  await page.waitForTimeout(waitMs);
}

async function dragHandCardToSelector(page, cardId, selector, waitMs = 1200) {
  await expect(page.locator(`.hc[data-id="${cardId}"]`).first()).toBeVisible();
  await page.evaluate(({cardId, selector}) => {
    const card = document.querySelector(`.hc[data-id="${cardId}"]`);
    const target = document.querySelector(selector);
    if (!card || !target) throw new Error(`Unable to drag ${cardId} to ${selector}`);
    const dataTransfer = new DataTransfer();
    card.dispatchEvent(new DragEvent("dragstart", {bubbles:true, cancelable:true, dataTransfer}));
    target.dispatchEvent(new DragEvent("dragover", {bubbles:true, cancelable:true, dataTransfer}));
    target.dispatchEvent(new DragEvent("drop", {bubbles:true, cancelable:true, dataTransfer}));
  }, {cardId, selector});
  await page.waitForTimeout(waitMs);
}

async function collapseTestPanelIfVisible(page) {
  await page.evaluate(() => document.querySelector('[data-testid="test-resource-panel-collapse"]')?.click());
}

async function state(page) {
  return page.evaluate(() => ({
    notification:document.querySelector("#notif")?.textContent || "",
    error:document.querySelector("#errMsg")?.textContent || "",
    observed:window.__batch15d2Observed || [],
    hand:playerHand(player1).map(getRuntimeCardId),
    deck:playerDrawPile(player1).map(getRuntimeCardId),
    graveyard:player1.graveyard.map(getRuntimeCardId),
    board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id),
    runtimeMaxS000014:CARDS_DATA.S000014?.max ?? null
  }));
}

async function waitForLastGabarDrawPromise(page) {
  const result = await page.evaluate(async () => {
    const pending = window.__batch15d6LastGabarDrawPromise;
    if (!pending || typeof pending.then !== "function") return {hasPromise:false};
    return {hasPromise:true, result:await pending};
  });
  expect(result.hasPromise).toBe(true);
  expect(result.result?.success).toBe(true);
  return result.result;
}

async function clickPlayer1DeckAtVisibleCenter(page) {
  const clickInfo = await page.evaluate(() => {
    const deck = document.querySelector(playerSelectors(player1).deckBack);
    if (!deck) return {ok:false, reason:"missing-deck"};
    const rect = deck.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const topElement = document.elementFromPoint(cx, cy);
    return {
      ok:true,
      cx,
      cy,
      deckRect:{left:rect.left, top:rect.top, right:rect.right, bottom:rect.bottom, width:rect.width, height:rect.height},
      topElement:{
        tag:topElement?.tagName || null,
        id:topElement?.id || null,
        className:String(topElement?.className || ""),
        testid:topElement?.dataset?.testid || null,
        cardId:topElement?.dataset?.id || topElement?.dataset?.cardId || null,
        closestPlayer1Deck:!!topElement?.closest?.(playerSelectors(player1).deckBack)
      }
    };
  });
  expect(clickInfo.ok, JSON.stringify(clickInfo)).toBe(true);
  await page.mouse.click(clickInfo.cx, clickInfo.cy);
  return clickInfo;
}

async function clearGabarPreClickNotifications(page) {
  await page.evaluate(() => {
    const notif = document.querySelector("#notif");
    if (notif) notif.textContent = "";
    if (window.__batch15d4Evidence) {
      window.__batch15d4Evidence.notifications = [];
      window.__batch15d4Evidence.gabarTimeline = [];
    }
  });
}

const GABAR_DRAW_CASES = [
  {
    variant:"s000057",
    spell:"S000057",
    oldGabar:"H000032",
    newGabar:"H000033",
    message:"AVEC L'AUBE DE SOIE DE LUMIÈRE, GABAR PREND CONFIANCE !",
    destination:"hand"
  },
  {
    variant:"s000058",
    spell:"S000058",
    oldGabar:"H000033",
    newGabar:"H000034",
    message:"LE GRIMOIRE MAGIQUE DU MAÎTRE N'A PLUS DE SECRETS POUR GABAR !",
    destination:"hand"
  },
  {
    variant:"s000059",
    spell:"S000059",
    oldGabar:"H000034",
    newGabar:"H000035",
    message:"L'APPRENTISSAGE DE GABAR SE TERMINE AVEC L'OBTENTION DE SA PROPRE PLUME ENCHANTÉE !",
    destination:"hand"
  },
  {
    variant:"s000060",
    spell:"S000060",
    oldGabar:"H000035",
    newGabar:"H000036",
    message:"DÉSORMAIS PARFAITEMENT ÉQUIPÉ ET INSTRUIT, GABAR DEVIENT UN MAÎTRE-MAGICIEN ET UN INVOCATEUR DE RENOM.",
    destination:"hand"
  },
  {
    variant:"full-hand",
    spell:"S000057",
    oldGabar:"H000032",
    newGabar:"H000033",
    message:"AVEC L'AUBE DE SOIE DE LUMIÈRE, GABAR PREND CONFIANCE !",
    destination:"deck-top"
  }
];

function firstTimelineEvent(evidence, type) {
  return evidence.gabarTimeline.find(item => item.type === type);
}

function expectGabarIntermediatePhases(evidence, testCase) {
  const expectedOrder = [
    "draw-click",
    "spell-centered-start",
    "spell-centered-end",
    "old-gabar-pulse-start",
    "old-gabar-pulse-end",
    "old-gabar-removed",
    "new-gabar-arrival-start",
    "new-gabar-arrival-end",
    "resolution-message",
    "draw-action-complete"
  ];
  const timelineTypes = evidence.gabarTimeline.map(item => item.type);
  const indexes = expectedOrder.map(type => timelineTypes.indexOf(type));
  expect(indexes.every(index => index >= 0), JSON.stringify({timelineTypes})).toBe(true);
  expect(indexes).toEqual([...indexes].sort((a, b) => a - b));

  const drawClick = firstTimelineEvent(evidence, "draw-click");
  expect(drawClick.board).toContain(testCase.oldGabar);
  expect(drawClick.deck).toContain(testCase.spell);
  expect(drawClick.hand).not.toContain(testCase.newGabar);
  expect(drawClick.notifications).toEqual([]);

  const centered = firstTimelineEvent(evidence, "spell-centered-start");
  expect(centered.className).toContain("batch02-gabar-spell-presentation");
  expect(centered.deck).not.toContain(testCase.spell);
  expect(centered.board).toContain(testCase.oldGabar);
  expect(centered.hand).not.toContain(testCase.newGabar);
  expect(centered.notifications).toEqual([]);
  expect(centered.rect?.width).toBeGreaterThan(80);
  expect(centered.rect?.height).toBeGreaterThan(100);
  expect(Math.abs(centered.rect.cx - centered.viewport.cx)).toBeLessThan(centered.viewport.width * 0.18);
  expect(Math.abs(centered.rect.cy - centered.viewport.cy)).toBeLessThan(centered.viewport.height * 0.18);

  const pulse = firstTimelineEvent(evidence, "old-gabar-pulse-start");
  expect(pulse.board).toContain(testCase.oldGabar);
  expect(pulse.hand).not.toContain(testCase.newGabar);
  expect(pulse.notifications).toEqual([]);

  const removed = firstTimelineEvent(evidence, "old-gabar-removed");
  expect(removed.board).not.toContain(testCase.oldGabar);
  expect(removed.hand).not.toContain(testCase.newGabar);
  expect(removed.notifications).toEqual([]);

  const arrival = firstTimelineEvent(evidence, "new-gabar-arrival-start");
  expect(arrival.board).not.toContain(testCase.oldGabar);
  if (testCase.destination === "deck-top") {
    expect(arrival.deck.at(-1)).toBe(testCase.newGabar);
    expect(arrival.hand).not.toContain(testCase.newGabar);
  } else {
    expect(arrival.hand).toContain(testCase.newGabar);
  }
  expect(arrival.notifications).toEqual([]);

  const message = firstTimelineEvent(evidence, "resolution-message");
  expect(message.text).toBe(testCase.message);
  expect(message.notifications).toEqual([testCase.message]);
  expect(message.currentPlayer).toBe(drawClick.currentPlayer);
  expect(message.turnSequence).toBe(drawClick.turnSequence);
  expect(message.nextTurnCalls).toBe(0);
}

function expectFrenchNoBreakSpaces(text) {
  expect(text).not.toMatch(/ [:\;\?\!»]/);
  expect(text).not.toMatch(/« /);
  expect(text).not.toContain("&nbsp;");
}

function transferCount(result, transferName) {
  return new Set(result.observed
    .filter(event => event.dataset.batch15dTransfer === transferName)
    .map(event => event.dataset.batch15dTransferSeq || `${event.dataset.batch15dCardId}-${event.dataset.batch15dSourceZone}-${event.dataset.batch15dTransfer}`)).size;
}

function expectOwnerGeometry(transfer, expectedTransfer, expectedZone) {
  expect(transfer?.dataset?.batch15dTransfer).toBe(expectedTransfer);
  expect(transfer?.dataset?.batch15dSourceZone).toBe(expectedZone);
  expect(transfer?.distanceToOwner).not.toBeNull();
  expect(transfer?.distanceToOpponent).not.toBeNull();
  expect(transfer.distanceToOwner).toBeLessThan(80);
  expect(transfer.distanceToOpponent).toBeGreaterThan(transfer.distanceToOwner + 120);
}

test("S000009 uses owner deck transfers, alternate branches and no-break punctuation", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-invocation");
  await playSpellFromHand(page, "S000009");
  const result = await state(page);
  expect(result.notification).toBe("LA RÉUNION EST UN SUCCÈS ! LES GOBELINS AFFLUENT DE TOUS CÔTÉS !");
  expectFrenchNoBreakSpaces(result.notification);
  expect(result.board.filter(id => id.startsWith("GOB"))).toEqual(["GOB000002", "GOB000001", "GOB000002"]);
  expect(transferCount(result, "deck-to-board")).toBe(3);
  expect(result.observed.filter(event => event.dataset.batch15dTransfer === "deck-to-board").every(event => event.dataset.batch15dSourceOwner === "player1")).toBe(true);

  await openBatch15DScenario(page, "collection-batch-15d-invocation", "&case=summit-none");
  await playSpellFromHand(page, "S000009");
  const none = await state(page);
  expect(none.notification).toBe("LES GOBELINS N'ONT JAMAIS ÉTÉ CONNUS POUR LEUR FIABILITÉ. AUCUN N'EST VENU !");
  expectFrenchNoBreakSpaces(none.notification);
  expect(transferCount(none, "deck-to-board")).toBe(0);

  await openBatch15DScenario(page, "collection-batch-15d-invocation", "&case=summit-one");
  await playSpellFromHand(page, "S000009");
  const one = await state(page);
  expect(one.notification).toBe("UN SEUL GOBELIN A RÉPONDU À L'APPEL. LES AUTRES SE SONT PEUT-ÊTRE PERDUS EN CHEMIN ?");
  expectFrenchNoBreakSpaces(one.notification);
  expect(transferCount(one, "deck-to-board")).toBe(1);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000009 summit-one starts from the caster deck and never creates a seventh servant slot", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-invocation", "&case=summit-one");
  await playSpellFromHand(page, "S000009");
  const evidence = await page.evaluate(() => window.__batch15d4Evidence);
  const transfer = evidence.transfers.find(item => item.dataset.batch15dTransfer === "deck-to-board");
  expectOwnerGeometry(transfer, "deck-to-board", "deck");
  const player1MaxSlots = Math.max(...evidence.slotCounts.filter(item => item.playerKey === "player1").map(item => item.count));
  expect(player1MaxSlots).toBeLessThanOrEqual(6);
  await attachDiagnostics(testInfo, diagnostics);
  await testInfo.attach("s000009-source-geometry", {contentType:"application/json", body:Buffer.from(JSON.stringify({transfer, slotCounts:evidence.slotCounts}, null, 2), "utf8")});
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("generic spell drops add no servant slot and servant drops still use a real slot", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-invocation", "&case=summit-one");
  await playSpellFromHand(page, "S000009");
  const spellEvidence = await page.evaluate(() => window.__batch15d4Evidence);
  expect(Math.max(...spellEvidence.slotCounts.filter(item => item.playerKey === "player1").map(item => item.count))).toBeLessThanOrEqual(6);

  await openBatch15DScenario(page, "collection-batch-15d-invocation", "&case=summit-none");
  await page.evaluate(() => {
    player1.hand = ["H000001"];
    player1.servants = [];
    refreshRuntimeZone(player1, "hand");
    refreshRuntimeZone(player1, "servants");
    window.__batch15d4Evidence.slotCounts = [];
  });
  await dragHandCardToSelector(page, "H000001", "#yriaServants .slot");
  const servant = await state(page);
  const servantEvidence = await page.evaluate(() => window.__batch15d4Evidence);
  expect(servant.board).toContain("H000001");
  expect(Math.max(...servantEvidence.slotCounts.filter(item => item.playerKey === "player1").map(item => item.count))).toBeLessThanOrEqual(6);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000013 highlights upgraded Nains in board, hand and deck with the exact Batch 15D2 message", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-replacement");
  await playSpellFromHand(page, "S000013");
  const result = await state(page);
  expect(result.notification).toBe("L'EXPÉRIENCE DU COMBAT CHANGE LES SIMPLES GUERRIERS EN REDOUTABLES VÉTÉRANS ET COMBATTANTS D'ÉLITE !");
  expect(result.board).toContain("N000008");
  expect(result.hand).toContain("N000008");
  expect(result.deck).toContain("N000008");
  expect(result.observed.some(event => event.dataset.batch15dNainPulse === "board")).toBe(true);
  expect(result.observed.some(event => event.dataset.batch15dHandHalo === "N000008")).toBe(true);
  expect(result.observed.some(event => event.dataset.batch15dDeckPulse === "N000008")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000014 uses the full active Orc pool, maxOwned 2, no generated Initiative, and exact message", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-invocation");
  await playSpellFromHand(page, "S000014");
  const result = await state(page);
  const summonedOrcs = result.board.filter(id => id.startsWith("ORC"));
  const allowedOrcs = new Set(["ORC000001", "ORC000002", "ORC000004", "ORC000005", "ORC000008", "ORC000009", "ORC000013", "ORC000017"]);
  expect(result.notification).toBe("AUCUNE TRIBU ORC NE PEUT RÉSISTER À L'APPEL D'UN PILLAGE FACILE ET SANGLANT !");
  expect(result.runtimeMaxS000014).toBe(2);
  expect(summonedOrcs.every(id => allowedOrcs.has(id))).toBe(true);
  expect(result.observed.some(event => /initiative/i.test(`${event.className} ${event.text}`))).toBe(false);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000023 and S000052 expose source-specific transfers and exact Batch 15D2 messages", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-pact-revenants");
  await playSpellFromHand(page, "S000023");
  const pacte = await state(page);
  expect(pacte.notification).toBe("UN REJETON DU TISSEUR DE GIVRE RÉPOND À VOTRE APPEL !");
  expect(pacte.observed.some(event => event.dataset.batch15dTransfer === "hand-to-board")).toBe(true);

  await openBatch15DScenario(page, "collection-batch-15d-revenants-deck");
  await playSpellFromHand(page, "S000052");
  const revenants = await state(page);
  expect(revenants.notification).toBe("UN SOMBRE RITUEL RAPPELLE DES SERVITEURS DE LA TOMBE !");
  expect(revenants.observed.filter(event => event.dataset.batch15dTransfer === "deck-to-board").every(event => event.dataset.batch15dSourceOwner === "player1")).toBe(true);
  expect(transferCount(revenants, "deck-to-board")).toBe(3);

  await openBatch15DScenario(page, "collection-batch-15d-revenants-echo");
  await playSpellFromHand(page, "S000052");
  const echo = await state(page);
  expect(echo.notification).toBe("UN SOMBRE RITUEL PUISE DANS LES ÂMES DES DISPARUS ET EN TIRE DE L'ÉCHO À OUTRANCE !");
  expectFrenchNoBreakSpaces(echo.notification);
  expect(transferCount(echo, "deck-to-board")).toBe(0);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000023 and S000052 positive branches start from the caster deck or graveyard geometry", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openBatch15DScenario(page, "collection-batch-15d-pact-revenants", "&case=pact-deck");
  await playSpellFromHand(page, "S000023");
  const pactDeck = await page.evaluate(() => window.__batch15d4Evidence);
  const dragonTransfer = pactDeck.transfers.find(item => item.dataset.batch15dTransfer === "deck-to-hand");
  expectOwnerGeometry(dragonTransfer, "deck-to-hand", "deck");

  await openBatch15DScenario(page, "collection-batch-15d-revenants-deck");
  await playSpellFromHand(page, "S000052");
  const revenantsDeck = await page.evaluate(() => window.__batch15d4Evidence);
  const deckTransfer = revenantsDeck.transfers.find(item => item.dataset.batch15dTransfer === "deck-to-board");
  expectOwnerGeometry(deckTransfer, "deck-to-board", "deck");

  await openBatch15DScenario(page, "collection-batch-15d-revenants-graveyard");
  await playSpellFromHand(page, "S000052");
  const revenantsGraveyard = await page.evaluate(() => window.__batch15d4Evidence);
  const graveyardTransfer = revenantsGraveyard.transfers.find(item => item.dataset.batch15dTransfer === "graveyard-to-board");
  expectOwnerGeometry(graveyardTransfer, "graveyard-to-board", "graveyard");

  await attachDiagnostics(testInfo, diagnostics);
  await testInfo.attach("source-geometry", {contentType:"application/json", body:Buffer.from(JSON.stringify({dragonTransfer, deckTransfer, graveyardTransfer}, null, 2), "utf8")});
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000038, S000047 and normal Gabar draws use the exact Batch 15D2 messages", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-replacement");
  await playSpellFromHand(page, "S000038");
  const codeCouleurs = await state(page);
  expect(codeCouleurs.notification).toBe("VOUS CONNAISSEZ L'EXPRESSION, « DERRIÈRE CHAQUE GOBELIN S'EN CACHE UN ENCORE PLUS RETORS ? »");
  expect(transferCount(codeCouleurs, "copy-to-hand")).toBe(2);

  await openBatch15DScenario(page, "collection-batch-15d-invocation");
  await playSpellFromHand(page, "S000047");
  const volee = await state(page);
  expect(volee.notification).toBe("ATTENTION ! LES GOBELINS ONT ENVOYÉ DES SURINEURS TRANCHER DES TENDONS ET EXPOSER DES ENTRAILLES !");

  await openBatch15DScenario(page, "collection-batch-15d-invocation", "&case=volley-none");
  await playSpellFromHand(page, "S000047");
  const volleyNone = await state(page);
  expect(volleyNone.notification).toBe("DES GOBELINS ONT BIEN ÉTÉ CATAPULTÉS QUELQUE PART, MAIS APPAREMMENT PAS SUR LE CHAMP DE BATAILLE. OUPS !");
  expect(transferCount(volleyNone, "generated-to-board")).toBe(0);

  await openBatch15DScenario(page, "collection-batch-15d-gabar");
  await page.locator("#btnEndTurn").click();
  await expect.poll(() => page.evaluate(() => document.querySelector("#btnEndTurn")?.disabled === false)).toBe(true);
  await page.locator("#btnEndTurn").click();
  await expect.poll(() => page.evaluate(() => currentPlayer === "player1" && document.querySelector("#btnEndTurn")?.disabled === false)).toBe(true);
  const gabar = await state(page);
  expect(gabar.notification).toBe("LE GRIMOIRE MAGIQUE DU MAÎTRE N'A PLUS DE SECRETS POUR GABAR !");
  expect(gabar.hand).toContain("H000034");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

for (const gabarCase of GABAR_DRAW_CASES) {
  test(`${gabarCase.spell} Gabar ${gabarCase.variant} follows the visible deck click and strict A-F chronology`, async ({page}, testInfo) => {
    const diagnostics = attachPageDiagnostics(page);
    await openBatch15DScenario(page, "collection-batch-15d-gabar", `&case=${gabarCase.variant}`);
    const before = await state(page);
    expect(before.deck.at(-1)).toBe(gabarCase.spell);
    expect(before.board).toContain(gabarCase.oldGabar);
    expect(before.hand).not.toContain(gabarCase.newGabar);
    await clearGabarPreClickNotifications(page);

    const clickInfo = await clickPlayer1DeckAtVisibleCenter(page);
    expect(clickInfo.topElement.closestPlayer1Deck, JSON.stringify(clickInfo)).toBe(true);
    const resolution = await waitForLastGabarDrawPromise(page);
    const after = await state(page);
    const evidence = await page.evaluate(() => window.__batch15d4Evidence);
    expect(resolution.evolutionResolution?.success).toBe(true);
    expect(resolution.evolutionResolution?.destination).toBe(gabarCase.destination);
    expect(after.board).not.toContain(gabarCase.oldGabar);
    if (gabarCase.destination === "deck-top") {
      expect(after.hand).toEqual(before.hand);
      expect(after.deck.at(-1)).toBe(gabarCase.newGabar);
    } else {
      expect(after.hand).toContain(gabarCase.newGabar);
    }
    expect(after.deck).not.toContain(gabarCase.spell);
    expect(after.graveyard).not.toContain(gabarCase.spell);
    expect(after.notification).toBe(gabarCase.message);
    expect(evidence.notifications.map(item => item.text)).toEqual([gabarCase.message]);
    expect(evidence.notifications.some(item => item.text.startsWith("SORT JOUÉ :"))).toBe(false);
    expectGabarIntermediatePhases(evidence, gabarCase);
    await attachDiagnostics(testInfo, diagnostics);
    expect(blockingConsoleErrors(diagnostics)).toEqual([]);
  });
}
