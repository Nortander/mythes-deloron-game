import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const NOR_EXPECTED_IDS = [
  "DIV000001", "DIV000016", "EDB000005", "EDB000014", "EDG000005", "EDG000007",
  "EDG000012", "EN000003", "EN000004", "EN000009", "EN000010", "GOB000001",
  "GOB000007", "H000020", "H000027", "H000030", "MV000029", "N000014",
  "ORC000004", "ORC000007", "ORC000017", "TRL000007"
];
const NOR_COVERAGE_SCENARIOS = [
  "collection-batch-14e-prst000003-nor-coverage-a",
  "collection-batch-14e-prst000003-nor-coverage-b",
  "collection-batch-14e-prst000003-nor-coverage-c"
];
const NOR_VISUAL_SCENARIOS = [
  "collection-batch-14b-prst000003-core-visual",
  ...NOR_COVERAGE_SCENARIOS
];
const NOR_ACTIVATION_MESSAGE = "LE DIEU DE LA NUIT INTERVIENT ET PERMET À SES ÉLUS DE DÉPLOYER PLUS SOUVENT LEURS MALÉFICES.";

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource/i.test(message));
}

async function open14EScenario(page, cardId, mode="auto") {
  const scenario = "collection-batch-14b-" + cardId.toLowerCase() + "-core-visual";
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch14e=" + mode + "&t=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout:20000});
  await page.waitForTimeout(150);
}

test("Batch 14E2 PRST000003 Nor covers the 22 V9 servant ids and resolves twice per source", async ({page}, testInfo) => {
  test.setTimeout(120000);
  const diagnostics = attachPageDiagnostics(page);
  await open14EScenario(page, "PRST000003");
  const result = await page.evaluate(async expectedIds => {
    function resetBoard(player, slots=28) {
      const zone = qs(playerZoneSelector(player, "servants"));
      zone.innerHTML = "";
      for (let i = 0; i < slots; i++) zone.insertAdjacentHTML("beforeend", `<div class="slot" data-player="${player.key}"></div>`);
    }
    function place(player, cardId, state={}) {
      const zone = qs(playerZoneSelector(player, "servants"));
      const slot = zone.querySelector(".slot");
      slot.outerHTML = buildFC(cardId, player.key);
      const fc = Array.from(zone.querySelectorAll(`.fc[data-id="${cardId}"]`)).at(-1);
      applyScenarioServantState(fc, {prepared:true, ...state});
      return fc;
    }
    function count(player, cardId) {
      return livingServantCardsForPlayer(player).filter(fc => fc.dataset.id === cardId).length;
    }
    function hp(player) {
      return livingServantCardsForPlayer(player).reduce((sum, fc) => sum + Number(fc.dataset.pdv || 0), 0);
    }
    async function activateTwice(source) {
      collectionBatch14EState().events = [];
      const first = await resolveBatch14ENorSingleSource(player1, source, 1);
      const second = await resolveBatch14ENorSingleSource(player1, source, 2);
      return {first, second, events:[...collectionBatch14EState().events]};
    }
    async function runCase(cardId) {
      resetBoard(player1);
      resetBoard(player2);
      player1.hand = [];
      player2.hand = [];
      player1.graveyard = [];
      player2.graveyard = [];
      player1.drawPile = ["H000001", "H000005", "H000006", "MV000001", "MV000003", "N000001", "N000002"];
      player2.drawPile = ["MV000001", "MV000003", "H000001"];
      player1.resourceState.classical = {aria:100, lenya:4, selene:100, fer:100, bois:100, pierre:100, nourriture:100};
      player1.resourceState.souls = 10;
      player2.resourceState.souls = 10;
      player1.prstFavors = {PRST000003:{cardId:"PRST000003"}};
      collectionBatch14EState().autoResolveChoices = true;
      collectionBatch14EState().randomQueue = Array(80).fill(0);
      let source = cardId === "H000027" ? {cardId:"H000027", zone:"hand", index:0} : {cardId, zone:"board", fc:place(player1, cardId, {atk:cardId === "GOB000001" ? 4 : undefined, pdv:8, pdvMax:12})};
      const evidence = {cardId};
      if (cardId === "H000027") {
        player1.hand = ["H000027"];
        ensureBatch03HandOccurrences(player1);
      }
      if (cardId === "DIV000001") evidence.before = count(player1, "DIV000002");
      if (cardId === "DIV000016") source.fc.dataset.batch14eXyallahMarks = "1";
      if (cardId === "EDB000005") {
        const ally = place(player1, "H000001", {pdv:1, pdvMax:8});
        evidence.beforeHp = hp(player1);
        evidence.ally = ally.dataset.instance;
      }
      if (cardId === "EDB000014") {
        const ally = place(player1, "EDB000001", {pdv:1, pdvMax:8});
        evidence.beforeHp = hp(player1);
        evidence.ally = ally.dataset.instance;
      }
      if (cardId === "EDG000005") evidence.before = count(player1, "DIV000007");
      if (cardId === "EDG000007") {
        place(player1, "H000001", {pdv:1, pdvMax:10});
        place(player1, "H000006", {pdv:1, pdvMax:10});
        evidence.beforeHp = hp(player1);
      }
      if (cardId === "EDG000012") {
        place(player2, "H000001", {pdv:8, pdvMax:8});
        place(player2, "H000006", {pdv:8, pdvMax:8});
      }
      if (["EN000004", "EN000009", "EN000010", "GOB000001"].includes(cardId)) {
        place(player2, "H000001", {pdv:30, pdvMax:30});
        evidence.beforeEnemyHp = hp(player2);
        if (cardId === "EN000009") evidence.beforeSummon = count(player1, "MV000002");
      }
      if (cardId === "EN000003") evidence.before = count(player1, "MV000007");
      if (cardId === "GOB000007") {
        place(player1, "GOB000001", {pdv:1, pdvMax:10});
        evidence.beforeHp = hp(player1);
      }
      if (cardId === "H000020") evidence.before = count(player1, "H000021");
      if (cardId === "H000030") evidence.beforeRunes = count(player1, "MV000020") + count(player1, "MV000009") + count(player1, "MV000016");
      if (cardId === "MV000029") evidence.beforeSouls = player1.resourceState.souls;
      if (cardId === "N000014") {
        player1.hand = ["N000001", "N000002"];
        ensureBatch03HandOccurrences(player1);
        renderAllHands(player1.key);
        player1.costModifierState = {sequence:0, active:[]};
      }
      if (cardId === "ORC000004") {
        place(player2, "H000001", {pdv:10, pdvMax:10});
        place(player2, "H000006", {pdv:10, pdvMax:10});
        evidence.beforeEnemyHp = hp(player2);
      }
      if (cardId === "ORC000007") {
        source.fc.dataset.atk = "4";
        place(player2, "H000001", {pdv:1, pdvMax:4});
        place(player2, "H000006", {pdv:1, pdvMax:4});
        evidence.beforeGraveyard = player2.graveyard.length;
      }
      if (cardId === "ORC000017") {
        place(player2, "H000001", {pdv:8, pdvMax:8});
        place(player2, "H000006", {pdv:8, pdvMax:8});
      }
      if (cardId === "TRL000007") {
        source.fc.dataset.pdv = "2";
        place(player1, "H000001", {pdv:4, pdvMax:4});
        evidence.beforeHp = hp(player1);
      }
      const resolution = await activateTwice(source);
      if (cardId === "DIV000001") evidence.after = count(player1, "DIV000002");
      if (cardId === "DIV000016") evidence.after = {marks:source.fc.dataset.batch14eXyallahMarks || "0", golems:count(player1, "DIV000008"), counters:Array.from(source.fc.querySelectorAll('[data-batch03-status-counter]')).map(node => ({kind:node.dataset.batch03StatusCounter, right:node.style.getPropertyValue('--status-counter-right'), bottom:node.style.getPropertyValue('--status-counter-bottom'), hidden:node.hidden}))};
      if (["EDB000005", "EDB000014", "EDG000007", "GOB000007", "TRL000007"].includes(cardId)) evidence.afterHp = hp(player1);
      if (cardId === "EDG000005") evidence.after = count(player1, "DIV000007");
      if (cardId === "EDG000012") evidence.affected = livingServantCardsForPlayer(player2).filter(fc => fc.dataset.frozen || fc.dataset.frozen_cdg).length;
      if (["EN000004", "EN000009", "EN000010", "GOB000001", "ORC000004"].includes(cardId)) evidence.afterEnemyHp = hp(player2);
      if (cardId === "EN000009") evidence.afterSummon = count(player1, "MV000002");
      if (cardId === "EN000003") evidence.after = count(player1, "MV000007");
      if (cardId === "H000020") evidence.after = count(player1, "H000021");
      if (cardId === "H000027") evidence.buff = player1.batch03HandBuffs?.H000027;
      if (cardId === "H000030") evidence.afterRunes = count(player1, "MV000020") + count(player1, "MV000009") + count(player1, "MV000016");
      if (cardId === "MV000029") evidence.afterSouls = player1.resourceState.souls;
      if (cardId === "N000014") evidence.modifiers = player1.costModifierState.active.filter(mod => mod.sourceId === "N000014").length;
      if (cardId === "ORC000007") evidence.afterGraveyard = player2.graveyard.length;
      if (cardId === "ORC000017") evidence.burning = livingServantCardsForPlayer(player2).filter(fc => fc.dataset.burning).length;
      const ok = (
        (cardId === "DIV000001" && evidence.after - evidence.before === 2) ||
        (cardId === "DIV000016" && evidence.after.marks === "0" && evidence.after.golems === 1) ||
        (cardId === "EDB000005" && evidence.afterHp > evidence.beforeHp) ||
        (cardId === "EDB000014" && evidence.afterHp > evidence.beforeHp) ||
        (cardId === "EDG000005" && evidence.after - evidence.before === 2) ||
        (cardId === "EDG000007" && evidence.afterHp > evidence.beforeHp) ||
        (cardId === "EDG000012" && evidence.affected >= 2) ||
        (cardId === "EN000003" && evidence.after - evidence.before === 2) ||
        (cardId === "EN000004" && evidence.afterEnemyHp < evidence.beforeEnemyHp) ||
        (cardId === "EN000009" && evidence.afterSummon - evidence.beforeSummon === 2 && evidence.afterEnemyHp < evidence.beforeEnemyHp) ||
        (cardId === "EN000010" && evidence.afterEnemyHp < evidence.beforeEnemyHp) ||
        (cardId === "GOB000001" && evidence.afterEnemyHp < evidence.beforeEnemyHp) ||
        (cardId === "GOB000007" && evidence.afterHp > evidence.beforeHp) ||
        (cardId === "H000020" && evidence.after - evidence.before === 2) ||
        (cardId === "H000027" && evidence.buff?.atk === 2 && evidence.buff?.pdv === 2) ||
        (cardId === "H000030" && evidence.afterRunes - evidence.beforeRunes === 2) ||
        (cardId === "MV000029" && evidence.afterSouls - evidence.beforeSouls === 2) ||
        (cardId === "N000014" && evidence.modifiers === 2) ||
        (cardId === "ORC000004" && evidence.afterEnemyHp === evidence.beforeEnemyHp - 4) ||
        (cardId === "ORC000007" && evidence.afterGraveyard - evidence.beforeGraveyard === 2) ||
        (cardId === "ORC000017" && evidence.burning >= 2) ||
        (cardId === "TRL000007" && evidence.afterHp > evidence.beforeHp)
      );
      return {cardId, ok, evidence, operations:[...resolution.first.operations, ...resolution.second.operations], activationEvents:resolution.events.filter(event => event.type === "nor-source-activation").map(event => event.activation)};
    }
    const cases = [];
    for (const id of expectedIds) cases.push(await runCase(id));
    resetBoard(player1);
    place(player1, "TRL000017", {pdv:6, pdvMax:6});
    const trollInstableSources = batch14EEndTurnServantSources(player1).map(source => source.cardId);
    return {
      cases,
      expectedIds,
      text:COLLECTION_BATCH_14E_NOR_TEXT,
      trollInstableInContract:COLLECTION_BATCH_14E_END_TURN_CARD_IDS.has("TRL000017"),
      trollInstableSources
    };
  }, NOR_EXPECTED_IDS);
  expect(result.text).toContain("une deuxième fois");
  expect(result.cases.map(item => item.cardId)).toEqual(NOR_EXPECTED_IDS);
  expect(result.trollInstableInContract).toBe(false);
  expect(result.trollInstableSources).not.toContain("TRL000017");
  for (const item of result.cases) {
    expect(item.operations.length, item.cardId).toBeGreaterThan(0);
    expect(item.activationEvents, item.cardId).toEqual([1, 2]);
    expect(item.ok, JSON.stringify(item.evidence)).toBe(true);
  }
  const xyallah = result.cases.find(item => item.cardId === "DIV000016");
  expect(xyallah.evidence.after.counters).toEqual([]);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14E2 PRST000003 Nor aggregate order is left-to-right and double-before-next", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14EScenario(page, "PRST000003");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const play = await playCard("PRST000003", null, {returnValidation:true});
    collectionBatch14EState().events = [];
    collectionBatch14EState().autoResolveChoices = true;
    collectionBatch14EState().randomQueue = Array(20).fill(0);
    const extra = await resolveBatch14ENorExtraEndTurn(player1);
    return {
      play,
      sourceIds:extra.sourceIds,
      activations:extra.activations.map(item => item.sourceId),
      eventActivations:collectionBatch14EState().events.filter(event => event.type === "nor-source-activation").map(event => event.sourceId),
      parasite:collectionBatch14EState().events.some(event => /NOR FAIT RÉSONNER/i.test(JSON.stringify(event)))
    };
  });
  expect(result.play.success).toBe(true);
  expect(result.sourceIds.slice(0, 2)).toEqual(["H000020", "GOB000001"]);
  expect(result.activations.slice(0, 4)).toEqual(["H000020", "H000020", "GOB000001", "GOB000001"]);
  expect(result.eventActivations.slice(0, 4)).toEqual(["H000020", "H000020", "GOB000001", "GOB000001"]);
  expect(result.parasite).toBe(false);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14F2 PRST000003 Nor visual variants expose the 22 V13 end-turn servants without overload", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14EScenario(page, "PRST000003", "manual");
  const result = await page.evaluate(({expectedIds, scenarioIds}) => {
    const scenarios = scenarioIds.map(id => {
      const setup = SCENARIOS[id]?.testSetup?.player1 || {};
      const hand = [...(setup.hand || [])];
      const deck = [...(setup.drawPile || [])];
      const board = [...(setup.servants || [])].map(entry => typeof entry === "string" ? entry : entry?.id).filter(Boolean);
      return {id, hand, deck, board};
    });
    const allHand = new Set(scenarios.flatMap(scenario => scenario.hand));
    const allDeck = new Set(scenarios.flatMap(scenario => scenario.deck));
    const allBoard = new Set(scenarios.flatMap(scenario => scenario.board));
    const duplicateAssignments = expectedIds.filter(id => scenarios.filter(scenario => scenario.hand.includes(id) || scenario.deck.includes(id) || scenario.board.includes(id)).length > 1);
    return {
      scenarios,
      missingFromHand:expectedIds.filter(id => !allHand.has(id)),
      missingFromDeck:expectedIds.filter(id => !allDeck.has(id)),
      terrainCounts:scenarios.map(scenario => scenario.board.length),
      duplicateAssignments,
      xyallahScenario:scenarios.find(scenario => scenario.hand.includes("DIV000016") && scenario.deck.includes("DIV000016") && scenario.board.includes("DIV000016"))?.id || null,
      h000027InHand:scenarios.some(scenario => scenario.hand.includes("H000027")),
      trollInstablePresent:scenarios.some(scenario => [...scenario.hand, ...scenario.deck, ...scenario.board].includes("TRL000017")),
      hidden:scenarioIds.map(id => SCENARIOS[id]?.hidden === true)
    };
  }, {expectedIds:NOR_EXPECTED_IDS, scenarioIds:NOR_COVERAGE_SCENARIOS});
  expect(result.hidden).toEqual([true, true, true]);
  expect(result.missingFromHand).toEqual([]);
  expect(result.missingFromDeck).toEqual([]);
  expect(result.terrainCounts.every(count => count <= 3)).toBe(true);
  expect(result.duplicateAssignments).toEqual([]);
  expect(result.xyallahScenario).toBe("collection-batch-14e-prst000003-nor-coverage-a");
  expect(result.h000027InHand).toBe(true);
  expect(result.trollInstablePresent).toBe(false);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14F2 DIV000016 Xyallah visual scenario lays out mark counters without overlap", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  const scenario = "collection-batch-14e-prst000003-nor-coverage-a";
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch14e=manual&t=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout:20000});
  const result = await page.evaluate((scenario) => {
    const xyallah = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "DIV000016");
    const counters = Array.from(xyallah?.querySelectorAll(".fc-burn-badge,[data-batch03-status-counter]") || []).map(node => {
      const rect = node.getBoundingClientRect();
      return {
        kind:node.dataset.batch03StatusCounter || node.dataset.statusCounterKind || "unknown",
        value:node.textContent,
        hidden:node.hidden,
        right:node.style.getPropertyValue("--status-counter-right"),
        bottom:node.style.getPropertyValue("--status-counter-bottom"),
        rect:{left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom}
      };
    });
    const overlaps = [];
    for (let i = 0; i < counters.length; i++) {
      for (let j = i + 1; j < counters.length; j++) {
        const a = counters[i].rect;
        const b = counters[j].rect;
        if (!(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)) overlaps.push([counters[i].kind, counters[j].kind]);
      }
    }
    const setup = SCENARIOS[scenario].testSetup.player1;
    return {
      scenario:selectedScenarioId(),
      board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id),
      setupHand:setup.hand,
      setupDeck:setup.drawPile,
      counters,
      overlaps,
      marks:xyallah?.dataset.batch14eXyallahMarks || null,
      burning:xyallah?.dataset.burning || null
    };
  }, scenario);
  expect(result.scenario).toBe(scenario);
  expect(result.board.length).toBeLessThanOrEqual(3);
  expect(result.board).toContain("DIV000016");
  expect(result.setupHand).toContain("DIV000016");
  expect(result.setupDeck).toContain("DIV000016");
  expect(result.marks).toBe("1");
  expect(result.burning).toBe("2");
  expect(result.counters.map(counter => counter.kind)).toEqual(expect.arrayContaining(["embrasement", "xyallah-marques"]));
  expect(result.overlaps).toEqual([]);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14F3 PRST000003 Nor launch message is deterministic once across visual scenarios", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  const results = [];
  for (const scenario of NOR_VISUAL_SCENARIOS) {
    await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch14e=manual&t=" + Date.now());
    await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
    await expect(page.getByTestId("test-resource-panel")).toBeVisible();
    await page.waitForSelector(".history.vis", {timeout:20000});
    results.push(await page.evaluate(async expectedMessage => {
      currentPlayer = player1.key;
      collectionBatch14EState().events = [];
      const play = await playCard("PRST000003", null, {returnValidation:true});
      const activationEvents = collectionBatch14EState().events.filter(event => event.type === "prst-activation-message-shown");
      const duplicate = activatePrstFavorCore("PRST000003", player1, {source:"manual"});
      const duplicateEvents = collectionBatch14EState().events.filter(event => event.type === "prst-activation-message-shown");
      collectionBatch14EState().events = [];
      collectionBatch14EState().autoResolveChoices = true;
      await resolveBatch14ENorExtraEndTurn(player1);
      const replayEvents = collectionBatch14EState().events.filter(event => event.type === "prst-activation-message-shown");
      return {
        scenario:selectedScenarioId(),
        playMessage:play.spellResolution?.activationMessage || null,
        state:player1.prstFavors?.PRST000003 || null,
        lastMessage:window.__lastPrstActivationMessage || null,
        activationEvents,
        duplicate,
        duplicateEvents,
        replayEvents,
        expectedMessage
      };
    }, NOR_ACTIVATION_MESSAGE));
  }
  for (const result of results) {
    expect(result.playMessage.shown, result.scenario).toBe(true);
    expect(result.playMessage.message, result.scenario).toBe(NOR_ACTIVATION_MESSAGE);
    expect(result.lastMessage.message, result.scenario).toBe(NOR_ACTIVATION_MESSAGE);
    expect(result.state.activationMessageShown, result.scenario).toBe(true);
    expect(result.activationEvents, result.scenario).toHaveLength(1);
    expect(result.duplicate.duplicateIgnored, result.scenario).toBe(true);
    expect(result.duplicateEvents, result.scenario).toHaveLength(1);
    expect(result.replayEvents, result.scenario).toHaveLength(0);
  }
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14F3 DIV000016 Xyallah uses burn-style brown marker and pulses summoned Golem", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  const scenario = "collection-batch-14e-prst000003-nor-coverage-a";
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch14e=manual&t=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout:20000});
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const xyallah = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "DIV000016");
    xyallah.dataset.batch14eXyallahMarks = "1";
    syncBatch14EXyallahMarksCounter(xyallah);
    const burn = xyallah.querySelector(".fc-burn-badge");
    const mark = xyallah.querySelector('[data-batch03-status-counter="xyallah-marques"]');
    const styleOf = node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {height:style.height, borderRadius:style.borderRadius, fontSize:style.fontSize, rect:{width:rect.width, height:rect.height}, hidden:node.hidden};
    };
    const initial = {burn:styleOf(burn), mark:styleOf(mark)};
    xyallah.dataset.batch14eXyallahMarks = "2";
    syncBatch14EXyallahMarksCounter(xyallah);
    const operation = await resolveBatch14EXyallahEndTurn(player1, xyallah, {activation:1, nor:true, pulse:false});
    const golem = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "DIV000008");
    return {
      initial,
      operation,
      golem:{exists:!!golem, lastPulse:golem?.dataset.batch03LastPulseReason || "", pulseColor:golem?.dataset.batch04PulseColor || ""}
    };
  });
  expect(result.initial.mark.height).toBe(result.initial.burn.height);
  expect(result.initial.mark.borderRadius).toBe(result.initial.burn.borderRadius);
  expect(result.initial.mark.fontSize).toBe(result.initial.burn.fontSize);
  expect(Math.round(result.initial.mark.rect.height)).toBe(Math.round(result.initial.burn.rect.height));
  expect(result.operation.type).toBe("xyallah-summon");
  expect(result.operation.golemPulse).toBe(true);
  expect(result.golem.exists).toBe(true);
  expect(result.golem.lastPulse).toBe("batch14e-xyallah-golem-summon");
  expect(result.golem.pulseColor).toBeTruthy();
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14F3 DIV000001 Porte démoniaque cannot attack or counter but keeps Nor end-turn summon", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await page.goto("/code/partie-test-1.html?scenario=collection-batch-14e-prst000003-nor-coverage-a&batch14e=manual&t=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe("collection-batch-14e-prst000003-nor-coverage-a");
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout:20000});
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    player1.prstFavors = {PRST000003:{cardId:"PRST000003"}};
    syncBatch14EPrstFavorEffects();
    const gate = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "DIV000001");
    const target = livingServantCardsForPlayer(player2)[0];
    const tryBefore = attackingFC;
    tryAttack(gate);
    const tryAfter = attackingFC;
    const refusedCombat = await resolveCombat(gate, target);
    gate.dataset.atk = "9";
    const attacker = livingServantCardsForPlayer(player2)[0];
    attacker.dataset.pdv = "12";
    attacker.dataset.pdvMax = "12";
    currentPlayer = player2.key;
    const beforeCounterHp = Number(attacker.dataset.pdv || 0);
    const combatIntoGate = await resolveCombat(attacker, gate);
    const afterCounterHp = Number(attacker.dataset.pdv || 0);
    currentPlayer = player1.key;
    const beforeDemons = livingServantCardsForPlayer(player1).filter(fc => fc.dataset.id === "DIV000002").length;
    collectionBatch14EState().events = [];
    const first = await resolveBatch14ENorSingleSource(player1, {cardId:"DIV000001", zone:"board", fc:gate}, 1);
    const second = await resolveBatch14ENorSingleSource(player1, {cardId:"DIV000001", zone:"board", fc:gate}, 2);
    const afterDemons = livingServantCardsForPlayer(player1).filter(fc => fc.dataset.id === "DIV000002").length;
    return {
      tryBefore:!!tryBefore,
      tryAfter:!!tryAfter,
      refusedCombat,
      beforeCounterHp,
      afterCounterHp,
      combatIntoGateSuccess:combatIntoGate?.success !== false,
      beforeDemons,
      afterDemons,
      operations:[...first.operations, ...second.operations]
    };
  });
  expect(result.tryBefore).toBe(false);
  expect(result.tryAfter).toBe(false);
  expect(result.refusedCombat).toMatchObject({success:false, reason:"demonic-gate-cannot-attack"});
  expect(result.combatIntoGateSuccess).toBe(true);
  expect(result.afterCounterHp).toBe(result.beforeCounterHp);
  expect(result.afterDemons - result.beforeDemons).toBe(2);
  expect(result.operations.filter(operation => operation.type === "summon")).toHaveLength(2);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14E2 PRST000010 Tiara modal excludes Insensible enemies and keeps the exact V9 wording", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14EScenario(page, "PRST000010", "manual");
  const setup = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const play = await playCard("PRST000010", null, {returnValidation:true});
    collectionBatch14EState().autoResolveChoices = false;
    const allEnemies = livingServantCardsForPlayer(player2).map(targetSummary);
    const candidates = batch14ETiaraCandidates(player1).map(targetSummary);
    resolveBatch14EStartTurnEffects(player1);
    return {play, allEnemies, candidates};
  });
  expect(setup.play.success).toBe(true);
  expect(setup.allEnemies.some(target => target.id === "EDG000012" && target.insensible)).toBe(true);
  expect(setup.candidates.map(target => target.id)).not.toContain("EDG000012");
  await expect(page.locator(".decision-modal-title", {hasText:"FAVEUR DE TIARA"})).toBeVisible();
  await expect(page.getByText("L'amour paralyse un adversaire... Mais de qui s'agit-il ?")).toBeVisible();
  await expect(page.locator('[data-testid="board-target-choice"][data-target-id="EDG000012"]')).toHaveCount(0);
  await page.locator('[data-testid="board-target-choice"]').first().click();
  await page.getByTestId("board-target-confirm").click();
  await expect.poll(() => page.evaluate(() => collectionBatch14EState().events.some(event => event.type === "tiara-entrave-applied"))).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14E2 PRST000011 Ulm balances avatars, pulses both portraits, and uses the corrected DIV000012 data", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14EScenario(page, "PRST000011");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const play = await playCard("PRST000011", null, {returnValidation:true});
    const giant = findBoardCard(player1, "DIV000012");
    const before = {p1:avatarHitPoints(player1), p2:avatarHitPoints(player2), giant:targetSummary(giant), data:CARDS_DATA.DIV000012};
    const pending = resolveBatch14EUlmEndTurn(player1);
    const pulsing = {
      p1:batch14EAvatarNode(player1)?.classList.contains("batch14e-avatar-pulse") || false,
      p2:batch14EAvatarNode(player2)?.classList.contains("batch14e-avatar-pulse") || false
    };
    const balance = await pending;
    const after = {p1:avatarHitPoints(player1), p2:avatarHitPoints(player2)};
    return {play, before, after, balance, pulsing, events:window.__collectionBatch14E?.events || []};
  });
  expect(result.play.success).toBe(true);
  expect(result.before.p1).toBe(7);
  expect(result.before.p2).toBe(28);
  expect(result.before.giant).toMatchObject({id:"DIV000012", atk:8, pdv:8, pdvMax:8});
  expect(result.before.data.name).toBe("Géant des colines");
  expect(result.before.data.kws).toContain("Rempart");
  expect(result.before.data.kws).not.toContain("Rage");
  expect(result.after).toEqual({p1:17, p2:18});
  expect(result.balance.rounding).toBe("floor-ceil-total-preserved-lower-hp-receives-floor");
  expect(result.pulsing).toEqual({p1:true, p2:true});
  expect(result.events.some(event => event.type === "ulm-avatar-balance")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14E2 PRST000012 Zerbo supports wait, two-step modal wording, Insensible hand choice, and spaced theft", async ({page}, testInfo) => {
  test.setTimeout(90000);
  const diagnostics = attachPageDiagnostics(page);
  await open14EScenario(page, "PRST000012", "manual");
  await page.evaluate(async () => {
    currentPlayer = player1.key;
    await playCard("PRST000012", null, {returnValidation:true});
    player1.hand.push("EDG000012");
    batch03RegisterHandCard(player1, player1.hand.length - 1);
    renderAllHands(player1.key);
    collectionBatch14EState().autoResolveChoices = false;
    collectionBatch14EState().randomQueue = [0, 0.5];
    resolveBatch14EZerboEndTurn(player1);
  });
  await expect(page.locator(".decision-modal-title", {hasText:"FAVEUR DE ZERBO"})).toBeVisible();
  await expect(page.getByText("Jugerez-vous le pari trop risqué ou irez-vous saisir l'opportunité ?")).toBeVisible();
  await expect(page.getByText("ATTENDRE UNE OPPORTUNITÉ")).toBeVisible();
  await expect(page.getByText("PASSER À L'ACTE")).toBeVisible();
  const initialModalAudit = await page.evaluate(() => {
    const panel = document.querySelector(".batch14e-zerbo-choice");
    const buttons = Array.from(document.querySelectorAll('[data-testid="batch14e-zerbo-action"]'));
    return {
      panelOverflow:panel ? getComputedStyle(panel).overflow : null,
      buttonCount:buttons.length,
      buttons:buttons.map(button => ({
        className:button.className,
        background:getComputedStyle(button).backgroundImage || getComputedStyle(button).backgroundColor,
        color:getComputedStyle(button).color,
        width:button.getBoundingClientRect().width
      }))
    };
  });
  expect(initialModalAudit.panelOverflow).toBe("visible");
  expect(initialModalAudit.buttonCount).toBe(2);
  for (const button of initialModalAudit.buttons) {
    expect(button.className).toContain("batch14e-zerbo-action");
    expect(button.background).not.toBe("none");
    expect(button.width).toBeGreaterThan(150);
  }
  await page.locator('[data-choice="act"]').click();
  await expect(page.getByText("Sacrifiez 1 carte de votre main pour faire diversion.")).toBeVisible();
  await expect(page.getByTestId("batch14e-zerbo-card-list").locator(".sort-choice-item")).toHaveCount(3);
  const sacrificeAuditBefore = await page.evaluate(() => {
    const list = document.querySelector('[data-testid="batch14e-zerbo-card-list"]');
    const confirm = document.querySelector('[data-testid="batch14e-zerbo-confirm"]');
    return {
      listOverflow:getComputedStyle(list).overflow,
      confirmDisabled:confirm.disabled,
      confirmBackground:getComputedStyle(confirm).backgroundImage || getComputedStyle(confirm).backgroundColor,
      confirmMarginLeft:getComputedStyle(confirm).marginLeft,
      cards:Array.from(list.querySelectorAll(".selection-card")).map(card => card.getBoundingClientRect().height)
    };
  });
  expect(sacrificeAuditBefore.listOverflow).toBe("visible");
  expect(sacrificeAuditBefore.confirmDisabled).toBe(true);
  expect(sacrificeAuditBefore.confirmBackground).not.toBe("none");
  expect(sacrificeAuditBefore.cards.every(height => height >= 180)).toBe(true);
  await page.getByTestId("batch14e-zerbo-card-list").locator(".sort-choice-item").nth(2).click();
  const sacrificeAuditAfter = await page.evaluate(() => ({
    selectedCount:document.querySelectorAll('[data-testid="batch14e-zerbo-card-list"] .sort-choice-item.is-selected').length,
    confirmDisabled:document.querySelector('[data-testid="batch14e-zerbo-confirm"]').disabled
  }));
  expect(sacrificeAuditAfter).toEqual({selectedCount:1, confirmDisabled:false});
  await page.getByTestId("batch14e-zerbo-confirm").click();
  const manual = await page.waitForFunction(() => {
    const events = collectionBatch14EState().events;
    return events.find(event => event.type === "zerbo-discard-and-steal") || null;
  });
  expect(await manual.jsonValue()).toMatchObject({success:true, discarded:"EDG000012", stolenCount:2});
  const manualEvents = await page.evaluate(() => collectionBatch14EState().events.map(event => ({type:event.type, at:event.at || event.timestamp || 0})));
  expect(manualEvents.findIndex(event => event.type === "zerbo-discard-flight")).toBeGreaterThan(-1);
  expect(manualEvents.findIndex(event => event.type === "zerbo-discard-flight")).toBeLessThan(manualEvents.findIndex(event => event.type === "zerbo-discard-visual"));
  expect(manualEvents.findIndex(event => event.type === "zerbo-discard-visual")).toBeLessThan(manualEvents.findIndex(event => event.type === "zerbo-card-flight"));

  await open14EScenario(page, "PRST000012");
  const automated = await page.evaluate(async () => {
    currentPlayer = player1.key;
    const play = await playCard("PRST000012", null, {returnValidation:true});
    collectionBatch14EState().autoResolveChoices = true;
    collectionBatch14EState().forcedZerboChoice = "wait";
    const wait = await resolveBatch14EZerboEndTurn(player1);
    delete collectionBatch14EState().forcedZerboChoice;
    collectionBatch14EState().forcedZerboDiscardIndex = 0;
    collectionBatch14EState().randomQueue = [0, 0.5];
    const before = {hand:player1.hand.length, graveyard:player1.graveyard.length, opponentTotal:player2.hand.length + player2.drawPile.length + player2.graveyard.length};
    const act = await resolveBatch14EZerboEndTurn(player1);
    const flights = collectionBatch14EState().events.filter(event => event.type === "zerbo-card-flight");
    const discardFlight = collectionBatch14EState().events.find(event => event.type === "zerbo-discard-flight") || null;
    return {
      play,
      wait,
      before,
      act,
      after:{hand:player1.hand.length, graveyard:player1.graveyard.length, opponentTotal:player2.hand.length + player2.drawPile.length + player2.graveyard.length},
      discardFlight,
      flightSpacing:flights.length >= 2 ? flights[1].at - flights[0].at : null,
      events:collectionBatch14EState().events
    };
  });
  expect(automated.play.success).toBe(true);
  expect(automated.wait.skipped).toBe(true);
  expect(automated.act).toMatchObject({success:true, discarded:"H000001", stolenCount:2});
  expect(automated.after.graveyard).toBe(automated.before.graveyard + 1);
  expect(automated.after.hand).toBe(automated.before.hand + 1);
  expect(automated.after.opponentTotal).toBe(automated.before.opponentTotal - 2);
  expect(automated.discardFlight).toMatchObject({type:"zerbo-discard-flight", cardId:"H000001"});
  expect(automated.flightSpacing).toBeGreaterThanOrEqual(450);
  expect(automated.events.some(event => event.type === "zerbo-wait")).toBe(true);
  expect(automated.events.some(event => event.type === "zerbo-discard-visual")).toBe(true);
  expect(automated.events.some(event => event.type === "zerbo-discard-and-steal" && event.stolenCount === 2)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch 14E2 PRST000013 Kerona uses exact extra-turn message and never chains", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await open14EScenario(page, "PRST000013");
  const result = await page.evaluate(async () => {
    currentPlayer = player1.key;
    activePlayer = player1;
    const play = await playCard("PRST000013", null, {returnValidation:true});
    collectionBatch14EState().randomQueue = [0.2, 0.8];
    const messages = [];
    const nativeShowNotif = showNotif;
    showNotif = async (message, duration) => {
      messages.push(String(message));
      return nativeShowNotif(message, duration);
    };
    await endTurn();
    const afterSuccess = {currentPlayer, activePlayer:activePlayer.key, noChain:!!player1.batch14eKeronaNoChainNextCheck, notif:document.getElementById("notif")?.textContent || ""};
    await endTurn();
    const afterNoChain = {currentPlayer, activePlayer:activePlayer.key, noChain:!!player1.batch14eKeronaNoChainNextCheck};
    const directFailure = await resolveBatch14EKeronaEndTurn(player1);
    showNotif = nativeShowNotif;
    const expectedNotif = `${playerName(player1).toUpperCase()} OBTIENT UN TOUR SUPPLÉMENTAIRE, PAR LA GRÂCE DE KERONA.`;
    return {play, expectedNotif, messageCount:messages.filter(message => message === expectedNotif).length, messages, afterSuccess, afterNoChain, directFailure, events:window.__collectionBatch14E?.events || []};
  });
  expect(result.play.success).toBe(true);
  expect(result.afterSuccess.currentPlayer).toBe("player1");
  expect(result.afterSuccess.activePlayer).toBe("player1");
  expect(result.afterSuccess.noChain).toBe(true);
  expect(result.messageCount).toBe(1);
  expect(result.messages).toContain(result.expectedNotif);
  expect(result.afterNoChain.currentPlayer).toBe("player2");
  expect(result.afterNoChain.noChain).toBe(false);
  expect(result.directFailure.extraTurn).toBe(false);
  expect(result.events.some(event => event.type === "kerona-extra-turn-success")).toBe(true);
  expect(result.events.some(event => event.type === "kerona-no-chain-skip")).toBe(true);
  expect(result.events.some(event => event.type === "kerona-extra-turn-failure")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
