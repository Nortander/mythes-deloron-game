import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {
  attachDiagnostics,
  attachPageDiagnostics,
  clickCollectionCard,
  collectionCard,
  collectionModalSnapshot,
  openCollection
} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-13a-nouvelles-cartes.json", import.meta.url), "utf8"));

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message =>
    !/Failed to load resource: the server responded with a status of 404/i.test(message)
    && !/Failed to load resource: net::ERR_(NETWORK_CHANGED|NAME_NOT_RESOLVED)/i.test(message)
  );
}

async function openScenario(page) {
  await page.goto("/code/partie-test-1.html?scenario=" + fixture.scenario + "&batch13a=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(fixture.scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect(page.getByText("MODE TEST")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(150);
}

async function audit(page) {
  return page.evaluate(() => auditCollectionBatch13aRuntime());
}

async function expectImageLoaded(locator, message) {
  await expect.poll(() => locator.evaluate(img => img.naturalWidth), {message, timeout: 8000}).toBeGreaterThan(0);
  return locator.evaluate(img => img.currentSrc || img.src);
}

async function terrainStatAlignment(page, cardId) {
  return page.evaluate((cardId) => {
    const card = document.querySelector('.fc[data-id="' + cardId + '"]');
    if (!card) throw new Error('missing terrain card ' + cardId);
    return Array.from(card.querySelectorAll('.fc-stat')).map(stat => {
      const icon = stat.querySelector('img').getBoundingClientRect();
      const value = stat.querySelector('span').getBoundingClientRect();
      return {
        iconCenterX: icon.left + icon.width / 2,
        iconCenterY: icon.top + icon.height / 2,
        valueCenterX: value.left + value.width / 2,
        valueCenterY: value.top + value.height / 2,
        iconWidth: icon.width
      };
    });
  }, cardId);
}

async function playServant(page, cardId) {
  return page.evaluate(async (cardId) => {
    const slot = document.querySelector(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    if (!slot) throw new Error("missing player1 servant slot");
    return playCard(cardId, slot, {returnValidation:true});
  }, cardId);
}

async function setOpponentServants(page, servants) {
  await page.evaluate((servants) => {
    const zone = document.querySelector(playerZoneSelector(player2, "servants"));
    if (!zone) throw new Error("missing player2 servant zone");
    zone.innerHTML = "";
    servants.forEach((entry) => {
      const template = document.createElement("template");
      template.innerHTML = buildFC(entry.id, player2).trim();
      const fc = template.content.firstElementChild;
      const stats = {};
      if (entry.atk != null) stats.atk = entry.atk;
      if (entry.pdv != null) stats.pdv = entry.pdv;
      if (entry.pdvMax != null) stats.pdvMax = entry.pdvMax;
      if (Object.keys(stats).length && typeof batch03UpdateStats === "function") {
        batch03UpdateStats(fc, stats);
      } else {
        if (entry.atk != null) fc.dataset.atk = String(entry.atk);
        if (entry.pdv != null) fc.dataset.pdv = String(entry.pdv);
        if (entry.pdvMax != null) fc.dataset.pdvMax = String(entry.pdvMax);
        if (entry.atk != null) fc.querySelectorAll(".fc-atk-val").forEach(el => { el.textContent = String(entry.atk); });
        if (entry.pdv != null) fc.querySelectorAll(".fc-pdv-val").forEach(el => { el.textContent = String(entry.pdv); });
      }
      fc.dataset.prepared = "1";
      zone.appendChild(fc);
      if (entry.gel) batch05ApplyGel({sourcePlayer:player1, targetFC:fc, sourceCardId:"batch13a-test", turns:entry.gel, type:"gel"});
      if (entry.cdg) batch05ApplyGel({sourcePlayer:player1, targetFC:fc, sourceCardId:"batch13a-test", turns:entry.cdg, type:"cdg"});
    });
    for (let i = servants.length; i < 5; i++) {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.dataset.player = player2.key;
      zone.appendChild(slot);
    }
  }, servants);
}

async function resetPlayer1Servants(page) {
  await page.evaluate(() => {
    const zone = document.querySelector(playerZoneSelector(player1, "servants"));
    if (!zone) throw new Error("missing player1 servant zone");
    zone.innerHTML = Array.from({length:5}, () => '<div class="slot" data-player="' + player1.key + '"></div>').join("");
  });
}

test("Batch-13A Collection data, local dragon art and lore rendering stay clean", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openCollection(page);
  const auditData = await page.evaluate((ids) => ids.map(id => {
    const card = CARDS.find(entry => entry.id === id);
    return {
      id,
      card,
      cost: collectionCostDefinition(id),
      image: card?.img || ""
    };
  }), fixture.allCards);
  expect(auditData.map(entry => entry.id)).toEqual(fixture.allCards);
  expect(auditData.find(entry => entry.id === "B000005").image).toContain("../assets/betes/B000005.png?v=20260822");
  for (const id of fixture.cards) {
    const entry = auditData.find(item => item.id === id);
    expect(entry.card, id).toBeTruthy();
    expect(entry.card.desc + " " + entry.card.detail, id).not.toMatch(/\[ID\s*=|S000|EDG000|DIV000|B000/i);
    expect(entry.cost, id).toEqual(fixture.expectedCosts[id]);
  }

  await page.locator('[data-filter="possession"][data-value="unobtainable"]').click();
  await page.locator("#searchInput").fill("B000005");
  const dragon = collectionCard(page, "B000005");
  await expect(dragon).toBeVisible();
  const dragonSrc = await expectImageLoaded(dragon.locator("img.ccard-art"), "B000005 local Collection image loaded");
  expect(dragonSrc).toContain("/assets/betes/B000005.png?v=20260822");

  await page.locator("#btnReset").click();
  await page.locator("#searchInput").fill("DIV000017");
  const sylvenier = collectionCard(page, "DIV000017");
  await expect(sylvenier).toBeVisible();
  const sylvenierSrc = await expectImageLoaded(sylvenier.locator("img.ccard-art"), "DIV000017 local Collection image loaded");
  expect(sylvenierSrc).toContain("/assets/autres/DIV000017.png");

  await page.locator("#btnReset").click();
  for (const cardId of ["DIV000017", "EDG000014"]) {
    await page.locator("#searchInput").fill(cardId);
    await clickCollectionCard(page, cardId);
    const modal = await collectionModalSnapshot(page);
    expect(modal.open).toBe(true);
    expect(modal.cardText).toContain(cardId === "DIV000017" ? "Sylvenier" : "Gardienne hivernale");
    expect(modal.loreDescendants.some(entry => entry.tagName === "I" && entry.fontStyle === "italic")).toBe(true);
    expect(modal.loreText).not.toMatch(/\[Rage\]|\[Rempart\]|\[Vigilance\]|\[Sang-froid\]/);
    await page.keyboard.press("Escape");
  }
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Batch-13A hidden scenario exposes all new cards and plays base servants", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page);
  const optionCount = await page.evaluate(() => document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length);
  expect(optionCount).toBe(0);
  let state = await audit(page);
  expect(state.player1.hand).toEqual(fixture.expectedInitialHand);
  expect(state.player1.resources.classical).toMatchObject({aria:100, lenya:100, selene:100, fer:100, bois:100, pierre:100, nourriture:100});
  expect(state.player2.resources.classical).toMatchObject({aria:100, lenya:100, selene:100, fer:100, bois:100, pierre:100, nourriture:100});
  expect(state.cards.map(card => card.id)).toEqual(fixture.allCards);
  expect(state.cards.find(card => card.id === "DIV000017")?.assetFolder).toBe("autres");
  for (const cardId of ["B000019", "DIV000017", "EDG000014"]) {
    const result = await playServant(page, cardId);
    expect(result.success, cardId).toBe(true);
  }
  state = await audit(page);
  expect(state.player1.servants.map(card => card.id)).toEqual(expect.arrayContaining(["B000019", "DIV000017", "EDG000014"]));
  const dragonBoardSrc = await page.evaluate(() => cardArtworkSrc("B000005", "betes"));
  expect(dragonBoardSrc).toContain("../assets/betes/B000005.png?v=20260822");
  const sylvenierBoardSrc = await expectImageLoaded(page.locator('.fc[data-id="DIV000017"] img.fi'), "DIV000017 scenario image loaded");
  expect(sylvenierBoardSrc).toContain("/assets/autres/DIV000017.png");
  for (const cardId of ["B000019", "DIV000017", "EDG000014"]) {
    const alignment = await terrainStatAlignment(page, cardId);
    expect(alignment.length, cardId).toBe(2);
    for (const item of alignment) {
      expect(Math.abs(item.iconCenterX - item.valueCenterX), cardId + " stat x centered").toBeLessThanOrEqual(1.5);
      expect(Math.abs(item.iconCenterY - item.valueCenterY), cardId + " stat y centered").toBeLessThanOrEqual(1.5);
      expect(item.iconWidth, cardId + " stat icon width").toBeGreaterThanOrEqual(22);
    }
  }
  const iceHighlight = await page.evaluate(() => {
    openCardPreview("EDG000017", {sourceType:"batch13b-test", origin:"ice-highlight-audit"});
    const node = document.querySelector('.canonical-card-preview[data-preview-card-id="EDG000017"] .fz-desc-text strong.kv, .canonical-card-preview[data-preview-card-id="EDG000017"] .fz-desc-text .canonical-keyword-inline');
    return node ? getComputedStyle(node).color : "";
  });
  expect(iceHighlight).toBe("rgb(42, 143, 212)");
  expect(state.player1.hand).not.toContain("B000019");
  expect(state.player1.hand).not.toContain("DIV000017");
  expect(state.player1.hand).not.toContain("EDG000014");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Veilleuse hivernale applies Gel only after real combat damage", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page);
  await resetPlayer1Servants(page);
  await playServant(page, "EDG000015");
  await setOpponentServants(page, [{id:"H000001", atk:3, pdv:10, pdvMax:10}]);
  const damaged = await page.evaluate(async () => {
    const veilleuse = document.querySelector(playerZoneSelector(player1, "servants") + ' .fc[data-id="EDG000015"]');
    const attacker = document.querySelector(playerZoneSelector(player2, "servants") + ' .fc[data-id="H000001"]');
    currentPlayer = player2.key;
    await resolveCombat(attacker, veilleuse);
    return {attacker:{...targetSummary(attacker), gel:attacker.dataset.frozen || ""}, events:[...collectionBatch13aState.events]};
  });
  expect(damaged.attacker.gel).toBe("1");
  expect(damaged.events.some(event => event.type === "veilleuse-retaliation-gel")).toBe(true);
  const veilleuseFeedback = await page.evaluate(() => auditCollectionBatch05Runtime().state.events.filter(event => event.type === "feedback-before-effect" && event.reason === "veilleuse-retaliation-gel"));
  expect(veilleuseFeedback.at(-1)?.source?.id).toBe("EDG000015");

  await openScenario(page);
  await resetPlayer1Servants(page);
  await playServant(page, "EDG000015");
  await setOpponentServants(page, [{id:"H000001", atk:0, pdv:10, pdvMax:10}]);
  const noDamage = await page.evaluate(async () => {
    const veilleuse = document.querySelector(playerZoneSelector(player1, "servants") + ' .fc[data-id="EDG000015"]');
    const attacker = document.querySelector(playerZoneSelector(player2, "servants") + ' .fc[data-id="H000001"]');
    currentPlayer = player2.key;
    await resolveCombat(attacker, veilleuse);
    return {attacker:{...targetSummary(attacker), gel:attacker.dataset.frozen || ""}, events:[...collectionBatch13aState.events]};
  });
  expect(noDamage.attacker.gel || "").toBe("");
  expect(noDamage.events.some(event => event.type === "veilleuse-retaliation-gel")).toBe(false);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Firune resolves Initiative and Vengeance with the three cold branches", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page);
  await resetPlayer1Servants(page);
  await setOpponentServants(page, [
    {id:"H000001", atk:3, pdv:10, pdvMax:10},
    {id:"H000005", atk:5, pdv:12, pdvMax:12, gel:1},
    {id:"H000006", atk:2, pdv:10, pdvMax:10, cdg:1}
  ]);
  await page.evaluate(() => { window.__mythesRandom = () => 0; });
  const initiative = await playServant(page, "EDG000016");
  expect(initiative.success).toBe(true);
  let state = await audit(page);
  expect(state.events.some(event => event.type === "firune-initiative-embrasement" && event.success)).toBe(true);
  const burningAudit = await page.evaluate(() => Array.from(document.querySelectorAll(playerZoneSelector(player2, "servants") + " .fc")).map(fc => ({id:fc.dataset.id, burning:Number(fc.dataset.burning || 0)})));
  expect(burningAudit.some(card => card.id === "H000001" && card.burning)).toBe(true);

  await openScenario(page);
  await resetPlayer1Servants(page);
  await page.evaluate(async () => { await summonBatch03Servant(player1, "EDG000016", {triggerInitiativeEffect:false, ready:true}); });
  await setOpponentServants(page, [{id:"H000005", atk:5, pdv:12, pdvMax:12, gel:1}]);
  const gelBranch = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const firune = document.querySelector(playerZoneSelector(player1, "servants") + ' .fc[data-id="EDG000016"]');
    await sendToCemetery(firune, {sourceCardId:"batch13a-test"});
    const target = document.querySelector(playerZoneSelector(player2, "servants") + ' .fc[data-id="H000005"]');
    return {target:targetSummary(target), events:[...collectionBatch13aState.events]};
  });
  expect(gelBranch.target.pdv).toBe(9);
  expect(gelBranch.target.cdg || 0).toBe(0);
  expect(gelBranch.events.some(event => event.type === "firune-vengeance" && event.effect?.type === "gel-target-damage-only")).toBe(true);
  expect(gelBranch.events.find(event => event.type === "firune-vengeance")?.destination).toBe("graveyard");
  const firuneGelFeedback = await page.evaluate(() => auditCollectionBatch05Runtime().state.events.filter(event => event.type === "feedback-before-effect" && event.reason === "firune-vengeance"));
  expect(firuneGelFeedback.at(-1)?.source?.id).toBe("EDG000016");
  expect(firuneGelFeedback.at(-1)?.target?.id).toBe("H000005");
  const firuneDestroyFeedback = await page.evaluate(() => auditCollectionBatch03Runtime().state.events.filter(event => event.type === "vengeance-gor-feedback" && event.sourceCardId === "EDG000016"));
  expect(firuneDestroyFeedback.at(-1)).toMatchObject({
    phase: "destroy-start",
    sourceHasPulse: true,
    sourceHasMove: true,
    sourcePulseReason: "batch05-firune-vengeance"
  });

  await openScenario(page);
  await resetPlayer1Servants(page);
  await page.evaluate(async () => { await summonBatch03Servant(player1, "EDG000016", {triggerInitiativeEffect:false, ready:true}); });
  await setOpponentServants(page, [{id:"H000006", atk:2, pdv:10, pdvMax:10, cdg:1}]);
  const cdgBranch = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const firune = document.querySelector(playerZoneSelector(player1, "servants") + ' .fc[data-id="EDG000016"]');
    await sendToCemetery(firune, {sourceCardId:"batch13a-test"});
    const target = document.querySelector(playerZoneSelector(player2, "servants") + ' .fc[data-id="H000006"]');
    return {target:targetSummary(target), events:[...collectionBatch13aState.events]};
  });
  expect(cdgBranch.target.cdg).toBe(3);
  expect(cdgBranch.events.some(event => event.type === "firune-vengeance" && event.effect?.type === "cdg-reset-plus-two")).toBe(true);
  const firuneCdgFeedback = await page.evaluate(() => auditCollectionBatch05Runtime().state.events.filter(event => event.type === "feedback-before-effect" && event.reason === "firune-vengeance"));
  expect(firuneCdgFeedback.at(-1)?.source?.id).toBe("EDG000016");
  expect(firuneCdgFeedback.at(-1)?.target?.id).toBe("H000006");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Commandante Aileen creates spells and spreads cold on attack", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page);
  await resetPlayer1Servants(page);
  await setOpponentServants(page, [
    {id:"H000001", atk:0, pdv:10, pdvMax:10},
    {id:"H000005", atk:0, pdv:30, pdvMax:30, gel:1},
    {id:"H000006", atk:0, pdv:10, pdvMax:10}
  ]);
  const before = await audit(page);
  const result = await playServant(page, "EDG000017");
  expect(result.success).toBe(true);
  let state = await audit(page);
  expect(state.player1.hand).toEqual(expect.arrayContaining(fixture.generatedByAileen));
  expect(state.player1.hand.filter(id => id === "S000039")).toHaveLength(1);
  expect(state.player1.hand.filter(id => id === "S000029")).toHaveLength(1);
  expect(state.events.some(event => event.type === "aileen-initiative-add-to-hand" && event.added.length === 2)).toBe(true);
  const aileenInitiativeEvent = state.events.find(event => event.type === "aileen-initiative-add-to-hand");
  expect(aileenInitiativeEvent?.added).toEqual(fixture.generatedByAileen);
  expect(aileenInitiativeEvent?.animationSteps).toHaveLength(3);
  expect(aileenInitiativeEvent.animationSteps[0]).toMatchObject({
    phase: "after-render-S000039",
    audit: {
      totalGeneratedRendered: 1,
      totalGeneratedAnimated: 1,
      totalGeneratedAileenArrival: 1,
      totalGeneratedLegacyDrawn: 0,
      expected: {
        S000039: {rendered: 1, animated: 1, aileenArrival: 1, legacyDrawn: 0},
        S000029: {rendered: 0, animated: 0, aileenArrival: 0, legacyDrawn: 0}
      }
    }
  });
  expect(aileenInitiativeEvent.animationSteps[1]).toMatchObject({
    phase: "after-render-S000029",
    audit: {
      totalGeneratedRendered: 2,
      totalGeneratedAnimated: 1,
      totalGeneratedAileenArrival: 1,
      totalGeneratedLegacyDrawn: 0,
      totalGeneratedGlowing: 2,
      expected: {
        S000039: {rendered: 1, animated: 0, aileenArrival: 0, legacyDrawn: 0, glowing: 1},
        S000029: {rendered: 1, animated: 1, aileenArrival: 1, legacyDrawn: 0, glowing: 1}
      }
    }
  });
  expect(aileenInitiativeEvent.animationSteps.every(step => step.audit.totalGeneratedRendered <= 2)).toBe(true);
  expect(aileenInitiativeEvent.animationSteps.every(step => step.audit.totalGeneratedLegacyDrawn === 0)).toBe(true);
  expect(state.player1.hand.length).toBe(before.player1.hand.length - 1 + fixture.generatedByAileen.length);
  const aileenFeedback = await page.evaluate(() => auditCollectionBatch05Runtime().state.events.filter(event => event.type === "feedback-before-effect" && event.reason === "aileen-initiative"));
  expect(aileenFeedback.at(-1)?.source?.id).toBe("EDG000017");
  await expect.poll(() => page.locator('.fc[data-id="EDG000017"]').evaluate(fc => ({
    passive: fc.dataset.batch03PassivePulse,
    reason: fc.dataset.batch03LastPulseReason,
    color: fc.style.getPropertyValue("--batch04-pulse-color")
  }))).toMatchObject({passive:"1", reason:"batch05-passive", color:"#d8f7ffcc"});
  await expect.poll(() => page.evaluate((ids) => ids.map(id => {
    const cards = Array.from(document.querySelectorAll(playerZoneSelector(player1, "hand") + ' .hc[data-id="' + id + '"]'));
    const card = cards[cards.length - 1];
    return card?.dataset.batch13aHandAnimation || "";
  }), fixture.generatedByAileen)).toEqual(["aileen-initiative-generated", "aileen-initiative-generated"]);
  const handHaloColor = await page.evaluate((ids) => ids.map(id => {
    const cards = Array.from(document.querySelectorAll(playerZoneSelector(player1, "hand") + ' .hc[data-id="' + id + '"]'));
    const card = cards[cards.length - 1];
    return card ? getComputedStyle(card).boxShadow : "";
  }), fixture.generatedByAileen);
  expect(handHaloColor.every(value => value.includes("42, 143, 212"))).toBe(true);

  const attack = await page.evaluate(async () => {
    const aileen = document.querySelector(playerZoneSelector(player1, "servants") + ' .fc[data-id="EDG000017"]');
    const target = document.querySelector(playerZoneSelector(player2, "servants") + ' .fc[data-id="H000005"]');
    const beforeTarget = targetSummary(target);
    currentPlayer = player1.key;
    await resolveCombat(aileen, target);
    return {
      beforeTarget,
      target:targetSummary(target),
      enemies:Array.from(document.querySelectorAll(playerZoneSelector(player2, "servants") + " .fc")).map(fc => ({...targetSummary(fc), gel:fc.dataset.frozen || ""})),
      events:[...collectionBatch13aState.events]
    };
  });
  expect(attack.beforeTarget.pdv - attack.target.pdv).toBe(6);
  expect(attack.target.cdg).toBe(1);
  expect(attack.enemies.find(card => card.id === "H000001")?.gel).toBe("2");
  expect(attack.enemies.find(card => card.id === "H000006")?.gel).toBe("2");
  const aileenAttackEvent = attack.events.find(event => event.type === "aileen-attack-cold");
  expect(aileenAttackEvent?.adjacent?.map(entry => entry.target.id)).toEqual(["H000001", "H000006"]);
  expect(aileenAttackEvent?.adjacent?.every(entry => entry.applied === true)).toBe(true);

  await openScenario(page);
  await resetPlayer1Servants(page);
  await page.evaluate(async () => { await summonBatch03Servant(player1, "EDG000017", {triggerInitiativeEffect:false, ready:true}); });
  await setOpponentServants(page, [
    {id:"H000005", atk:0, pdv:30, pdvMax:30},
    {id:"H000006", atk:0, pdv:10, pdvMax:10}
  ]);
  const edgeAttack = await page.evaluate(async () => {
    const aileen = document.querySelector(playerZoneSelector(player1, "servants") + ' .fc[data-id="EDG000017"]');
    const target = document.querySelector(playerZoneSelector(player2, "servants") + ' .fc[data-id="H000005"]');
    currentPlayer = player1.key;
    await resolveCombat(aileen, target);
    return {
      target:targetSummary(target),
      enemies:Array.from(document.querySelectorAll(playerZoneSelector(player2, "servants") + " .fc")).map(fc => ({...targetSummary(fc), gel:fc.dataset.frozen || ""})),
      event:[...collectionBatch13aState.events].findLast(event => event.type === "aileen-attack-cold")
    };
  });
  expect(edgeAttack.target.cdg).toBe(1);
  expect(edgeAttack.enemies.find(card => card.id === "H000006")?.gel).toBe("2");
  expect(edgeAttack.event?.adjacent?.map(entry => entry.target.id)).toEqual(["H000006"]);
  expect(edgeAttack.event?.adjacent?.[0]?.applied).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
