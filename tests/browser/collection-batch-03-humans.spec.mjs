import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-03-humans.json", import.meta.url), "utf8"));
const signatures = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-effect-signatures.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch03=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(100);
}

function diagnosticsFor(page) {
  return attachPageDiagnostics(page);
}

test("Batch-03 scope promotes every Human candidate and keeps direct dependencies explicit", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, fixture.scenarios[0]);
  const byId = new Map(signatures.signatures.map(signature => [signature.id, signature]));
  expect(fixture.candidateIds).toHaveLength(42);
  for (const id of fixture.candidateIds) {
    expect(byId.get(id)?.faction, id + " faction").toBe("Humain");
    expect(byId.get(id)?.implementationStatus, id + " status").toBe(fixture.expectedFinalStatus);
    expect(byId.get(id)?.missingPrimitives || [], id + " missing primitives").toEqual([]);
  }
  const runtime = await page.evaluate(({candidateIds, dependencyIds}) => {
    return [...candidateIds, ...dependencyIds].map(id => ({
      id,
      exists: !!CARDS_DATA[id],
      name: CARDS_DATA[id]?.name || "",
      type: CARDS_DATA[id]?.type || "",
      image: cardArtworkSrc(id, CARDS_DATA[id]?.assetFolder || facFolder(CARDS_DATA[id]?.fac || "sort"))
    }));
  }, {candidateIds: fixture.candidateIds, dependencyIds: fixture.directDependencyIds});
  expect(runtime.every(card => card.exists), JSON.stringify(runtime.filter(card => !card.exists))).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Human public rendering avoids obsolete cyan highlights and hides technical IDs", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, fixture.scenarios[0]);
  const audit = await page.evaluate(({ids, accent, forbidden}) => {
    const toRgb = cssColor => {
      const probe = document.createElement("span");
      probe.style.color = cssColor;
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    };
    const expectedRgb = toRgb(accent);
    const forbiddenRgb = toRgb(forbidden);
    const rendered = ids.map(id => {
      openCardPreview(id, {sourceType:"test"});
      const layer = document.querySelector("#card-preview-layer");
      const text = layer?.textContent?.replace(/\s+/g, " ").trim() || "";
      const highlights = Array.from(layer?.querySelectorAll(".canonical-keyword-inline,strong.kv,.card-keyword,.card-named-ability") || [])
        .map(node => ({text:node.textContent.trim(), color:getComputedStyle(node).color}));
      return {id, text, highlights};
    });
    return {expectedRgb, forbiddenRgb, rendered};
  }, {ids: fixture.candidateIds, accent: fixture.humanAccentColor, forbidden: fixture.forbiddenMainDescriptionColor});
  for (const card of audit.rendered) {
    expect(card.text, card.id + " public text").not.toMatch(/\b(?:AVS|H|S|B|DIV|MV)\d{6}\b|ID\s*=|effectInstanceId|linkedOccurrenceId/i);
    for (const item of card.highlights) {
      expect(item.color, card.id + " forbidden cyan").not.toBe(audit.forbiddenRgb);
    }
  }
  await attachDiagnostics(testInfo, diagnostics);
});

test("Human Initiative handlers resolve movement, damage, summons, freeze and pair effects", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-triggers");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = player => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length: 5}, () => `<div class="slot" data-player="${player.key}"></div>`).join("");
    };
    const before = auditCollectionBatch03Runtime();
    resetServants(player1);
    const h2 = await summonBatch03Servant(player1, "H000002", {triggerInitiativeEffect:true, ready:true});
    const afterH2 = auditCollectionBatch03Runtime();
    resetServants(player1);
    const h4 = await summonBatch03Servant(player1, "H000004", {triggerInitiativeEffect:true, ready:true});
    resetServants(player1);
    const h7 = await summonBatch03Servant(player1, "H000007", {triggerInitiativeEffect:true, ready:true});
    resetServants(player1);
    const h11 = await summonBatch03Servant(player1, "H000011", {triggerInitiativeEffect:true, ready:true});
    resetServants(player1);
    await summonBatch03Servant(player1, "H000016", {triggerInitiativeEffect:false, ready:true});
    const h15 = await summonBatch03Servant(player1, "H000015", {triggerInitiativeEffect:true, ready:true});
    resetServants(player1);
    const h15Ally = await summonBatch03Servant(player1, "H000015", {triggerInitiativeEffect:false, ready:true});
    const h15AllyFc = document.querySelector(`.fc[data-instance="${h15Ally.instanceId}"]`);
    if (h15AllyFc) await applyDamage(h15AllyFc, 2);
    const woundedAllies = livingServantCardsForPlayer(player1).map(fc => ({id:fc.dataset.id, pdv:Number(fc.dataset.pdv), max:Number(fc.dataset.pdvMax)}));
    const h16 = await summonBatch03Servant(player1, "H000016", {triggerInitiativeEffect:true, ready:true});
    resetServants(player1);
    const h31 = await summonBatch03Servant(player1, "H000031", {triggerInitiativeEffect:true, ready:true});
    const after = auditCollectionBatch03Runtime();
    return {before, h2, afterH2, h4, h7, h11, h15, woundedAllies, h16, h31, after};
  });
  expect(result.h2.initiative.operations[0].result.destination).toBe("hand");
  expect(result.afterH2.zones.player2.hand).toContain("H000001");
  expect(result.h4.initiative.operations.some(op => op.type === "damage")).toBe(true);
  expect(result.h7.initiative.operations.some(op => op.type === "cdg")).toBe(true);
  expect(result.h11.initiative.operations.some(op => op.cardId === "H000008" || op.type === "patrol-summon-on-attack")).toBe(true);
  expect(result.h15.initiative.operations.some(op => op.type === "vengeful-damage")).toBe(true);
  expect(result.h16.initiative.operations.some(op => op.type === "paladin-heal")).toBe(true);
  expect(result.h31.initiative.operations.filter(op => op.cardId === "DIV000006")).toHaveLength(2);
  expect(result.after.board.player1.map(card => card.id)).toEqual(expect.arrayContaining(["H000031", "DIV000006"]));
  await attachDiagnostics(testInfo, diagnostics);
});

test("Human AVS handlers resolve Insensible, summons, turn skip and spell echo", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-avatars");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = player => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length: 5}, () => `<div class="slot" data-player="${player.key}"></div>`).join("");
    };
    resetServants(player1);
    const avs1 = await summonBatch03Servant(player1, "AVS000001", {triggerInitiativeEffect:true, ready:true});
    const avs2 = await summonBatch03Servant(player1, "AVS000002", {triggerInitiativeEffect:true, ready:true});
    resetServants(player1);
    await summonBatch03Servant(player1, "AVS000003", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "AVS000001", {triggerInitiativeEffect:false, ready:true});
    const ally = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "AVS000003");
    const healTarget = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "AVS000001");
    if (healTarget) await applyDamage(healTarget, 1);
    if (!player1.hand.includes("S000010")) player1.hand.push("S000010");
    refreshHand(player1);
    const spell = await playCard("S000010", null, {selectedTargetIds:[healTarget?.dataset.instance]});
    resetServants(player1);
    const avs4 = await summonBatch03Servant(player1, "AVS000004", {triggerInitiativeEffect:true, ready:true});
    resetServants(player1);
    const avs7 = await summonBatch03Servant(player1, "AVS000007", {triggerInitiativeEffect:true, ready:true});
    resetServants(player1);
    const avs14 = await summonBatch03Servant(player1, "AVS000014", {triggerInitiativeEffect:true, ready:true});
    const after = auditCollectionBatch03Runtime();
    return {avs1, avs2, avs3:targetSummary(ally), avs4, avs7, avs14, spell, after};
  });
  expect(result.avs1.initiative.operations.some(op => op.type === "cdg")).toBe(true);
  expect(result.avs2.initiative.operations.some(op => op.type === "damage-dot")).toBe(true);
  expect(result.avs4.initiative.operations.map(op => op.cardId)).toEqual(expect.arrayContaining(["DIV000003", "DIV000004"]));
  expect(result.avs7.initiative.operations.map(op => op.cardId)).toContain("DIV000001");
  expect(result.after.state.events.some(event => event.type === "spell-echo" && event.cardId === "S000010")).toBe(true);
  expect(result.after.state.events.some(event => event.type === "initiative" && event.cardId === "AVS000014")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Human spells heal, protect and apply blessed-sword combat without zone loss", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-spells");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    for (const id of ["S000010", "S000028", "S000033"]) {
      if (!player1.hand.includes(id)) player1.hand.push(id);
    }
    refreshHand(player1);
    const allies = livingServantCardsForPlayer(player1);
    const target = allies[1];
    const before = auditCollectionBatch03Runtime();
    const heal = await playCard("S000010", null, {selectedTargetIds:[target.dataset.instance]});
    const auraTarget = livingServantCardsForPlayer(player1)[0];
    const aura = await playCard("S000028", null, {selectedTargetIds:[auraTarget.dataset.instance]});
    const blessed = await playCard("S000033", null);
    const attacker = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000005");
    const undead = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "MV000020");
    delete attacker.dataset.new;
    await resolveCombat(attacker, undead);
    const after = auditCollectionBatch03Runtime();
    return {before, heal, aura, blessed, after, auraTarget:targetSummary(auraTarget)};
  });
  expect(result.heal.spellResolution.success).toBe(true);
  expect(result.aura.spellResolution.success).toBe(true);
  expect(result.auraTarget.insensible).toBe(true);
  expect(result.blessed.spellResolution.success).toBe(true);
  const blessedHook = result.after.state.events.find(event => event.type === "combat-hook" && JSON.stringify(event).includes("blessed-swords-divine-wrath"));
  expect(blessedHook).toBeTruthy();
  const undeadAfter = result.after.board.player2.find(card => card.id === "MV000020");
  expect(undeadAfter?.divineWrathTurns).toBe("3");
  expect(result.after.zones.player1.graveyard).toEqual(expect.arrayContaining(["S000010", "S000028", "S000033"]));
  await attachDiagnostics(testInfo, diagnostics);
});

test("Randall applies periodic Colère divine instead of lethal placeholder damage", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-triggers");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = player => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length: 5}, () => `<div class="slot" data-player="${player.key}"></div>`).join("");
    };
    resetServants(player1);
    resetServants(player2);
    await summonBatch03Servant(player2, "MV000020", {triggerInitiativeEffect:false, ready:true});
    const undead = livingServantCardsForPlayer(player2)[0];
    batch03UpdateStats(undead, {pdvMax:12, pdv:12});
    const avatarBefore = player2.avatarHp;
    const randall = await summonBatch03Servant(player1, "H000012", {triggerInitiativeEffect:true, ready:true});
    const afterApply = auditCollectionBatch03Runtime();
    const statusCount = batch03DynamicStatusTexts(undead).filter(text => text.includes("[Colère divine]") && text.startsWith("Subit")).length;
    player2.resourceState.souls = 3;
    const tick1 = await applyBatch03StartTurnAbilities(player2);
    const afterTick1 = auditCollectionBatch03Runtime();
    const tick2 = await applyBatch03StartTurnAbilities(player2);
    const afterTick2 = auditCollectionBatch03Runtime();
    const tick3 = await applyBatch03StartTurnAbilities(player2);
    const afterTick3 = auditCollectionBatch03Runtime();
    return {randall, afterApply, statusCount, tick1, afterTick1, tick2, afterTick2, tick3, afterTick3, avatarBefore, avatarAfter:player2.avatarHp, errText:document.querySelector("#errMsg")?.textContent || "", notifText:document.querySelector("#notif")?.textContent || ""};
  });
  const targetAfterApply = result.afterApply.board.player2.find(card => card.id === "MV000020");
  expect(targetAfterApply?.divineWrathTurns).toBe("3");
  expect(targetAfterApply?.pdv).toBe(12);
  expect(result.statusCount).toBe(1);
  const targetAfterTick1 = result.afterTick1.board.player2.find(card => card.id === "MV000020");
  expect(targetAfterTick1?.pdv).toBe(10);
  expect(targetAfterTick1?.divineWrathTurns).toBe("2");
  const targetAfterTick2 = result.afterTick2.board.player2.find(card => card.id === "MV000020");
  expect(targetAfterTick2?.pdv).toBe(7);
  expect(targetAfterTick2?.divineWrathTurns).toBe("1");
  const targetAfterTick3 = result.afterTick3.board.player2.find(card => card.id === "MV000020");
  expect(targetAfterTick3?.pdv).toBe(3);
  expect(targetAfterTick3?.divineWrathTurns).toBeNull();
  expect(result.avatarAfter).toBe(result.avatarBefore);
  expect(result.afterTick2.state.events.some(event => event.type === "divine-wrath-applied" && event.sourceCardId === "H000012")).toBe(true);
  expect(result.notifText).not.toMatch(/INITIATIVE R[ÉE]SOLUE|Initiative resolue/i);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Serviteur de la rune returns the destroyed occurrence to its owner's hand", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-triggers");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const zone = document.querySelector(playerZoneSelector(player1, "servants"));
    zone.innerHTML = Array.from({length: 5}, () => `<div class="slot" data-player="${player1.key}"></div>`).join("");
    player1.hand = [];
    refreshHand(player1);
    const summon = await summonBatch03Servant(player1, "H000031", {triggerInitiativeEffect:false, ready:true});
    const fc = document.querySelector(`.fc[data-instance="${summon.instanceId}"]`);
    const before = auditCollectionBatch03Runtime();
    await applyDamage(fc, 99);
    const after = auditCollectionBatch03Runtime();
    return {before, after, summon};
  });
  expect(result.after.zones.player1.hand).toContain("H000031");
  expect(result.after.zones.player1.graveyard).not.toContain("H000031");
  expect(result.after.board.player1.map(card => card.id)).not.toContain("H000031");
  expect(result.after.state.events.some(event => event.type === "rune-return-to-hand" && event.cardId === "H000031")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Mage ermite blocked cards are visible, named and refused without mutation", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-triggers");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = player => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length: 5}, () => `<div class="slot" data-player="${player.key}"></div>`).join("");
    };
    resetServants(player1);
    resetServants(player2);
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "H000002", {triggerInitiativeEffect:true, ready:true});
    currentPlayer = player2.key;
    activePlayer = player2;
    refreshHand(player2);
    const blockedNode = document.querySelector('.hc-blocked-temporary[data-id="H000001"]');
    const before = auditCollectionBatch03Runtime();
    const slot = document.querySelector(playerZoneSelector(player2, "servants"))?.querySelector(".slot");
    await playCard("H000001", slot);
    const after = auditCollectionBatch03Runtime();
    return {
      blockedVisible:!!blockedNode,
      blockedSource:blockedNode?.dataset.blockedSource || "",
      message:document.querySelector("#errMsg")?.textContent?.replace(/\s+/g, " ").trim() || "",
      before,
      after
    };
  });
  expect(result.blockedVisible).toBe(true);
  expect(result.blockedSource).toBe("Mage ermite");
  expect(result.message).toContain("Mage ermite");
  expect(result.after.zones.player2.hand).toEqual(result.before.zones.player2.hand);
  expect(result.after.resources.player2).toEqual(result.before.resources.player2);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Arcaniste sans âge shows accumulated hand stats and keeps them green on the board", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-overview");
  const result = await page.evaluate(async () => {
    const zone = document.querySelector(playerZoneSelector(player1, "servants"));
    zone.innerHTML = Array.from({length: 5}, () => `<div class="slot" data-player="${player1.key}"></div>`).join("");
    player1.hand = ["H000027"];
    player1.batch03HandBuffs = {};
    refreshHand(player1);
    await applyBatch03EndTurnAbilities(player1);
    refreshHand(player1);
    const handNode = document.querySelector('.hc[data-id="H000027"]');
    const handStats = Array.from(handNode?.querySelectorAll(".hc-sb span") || []).map(el => ({text:el.textContent, green:el.classList.contains("grn")}));
    const slot = document.querySelector(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    await playCard("H000027", slot);
    const board = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000027");
    const boardStats = {
      atk:board?.dataset.atk,
      pdv:board?.dataset.pdv,
      atkGreen:!!board?.querySelector(".fc-atk-val.grn"),
      pdvGreen:!!board?.querySelector(".fc-pdv-val.grn")
    };
    return {handStats, boardStats};
  });
  expect(result.handStats.some(stat => stat.text === "3" && stat.green)).toBe(true);
  expect(result.boardStats).toEqual({atk:"3", pdv:"3", atkGreen:true, pdvGreen:true});
  await attachDiagnostics(testInfo, diagnostics);
});

test("Human avatar corrections cover mirror redirect, Ianna steal, Uram door and Flute skip", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-avatars");
  const result = await page.evaluate(async () => {
    const resetServants = player => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length: 5}, () => `<div class="slot" data-player="${player.key}"></div>`).join("");
    };
    window.__mythesRandom = () => 0;
    resetServants(player1);
    resetServants(player2);
    await summonBatch03Servant(player1, "AVS000011", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    const mirror = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "AVS000011");
    const attacker = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000005");
    delete attacker.dataset.new;
    await resolveCombat(attacker, mirror);
    const afterMirror = auditCollectionBatch03Runtime();

    resetServants(player1);
    resetServants(player2);
    await summonBatch03Servant(player1, "AVS000010", {triggerInitiativeEffect:false, ready:true});
    player2.drawPile = ["H000001", "H000005"];
    player2.hand = [];
    player1.hand = [];
    player2.firstTurnStarted = true;
    player2.turnState = {turnId:-1};
    turnSequence += 1;
    const iannaSuccessDraw = await startTurn(player2);
    const iannaSuccessTrace = getLastStartTurnTrace();
    window.__mythesRandom = () => 0.9;
    player2.drawPile = ["H000018"];
    player2.turnState = {turnId:-1};
    turnSequence += 1;
    const iannaFailureDraw = await startTurn(player2);
    const iannaFailureTrace = getLastStartTurnTrace();

    window.__mythesRandom = () => 0;
    resetServants(player1);
    const uram = await summonBatch03Servant(player1, "AVS000007", {triggerInitiativeEffect:true, ready:true});
    const doorEnd = await applyBatch03EndTurnAbilities(player1);

    resetServants(player1);
    resetServants(player2);
    activePlayer = player1;
    currentPlayer = player1.key;
    player1.firstTurnStarted = true;
    player2.firstTurnStarted = true;
    await summonBatch03Servant(player1, "AVS000014", {triggerInitiativeEffect:true, ready:true});
    await endTurnRuntime();
    const afterSkip = auditCollectionBatch03Runtime();
    return {afterMirror, iannaSuccessDraw, iannaSuccessTrace, iannaFailureDraw, iannaFailureTrace, uram, doorEnd, afterSkip, activePlayerKey:activePlayer.key};
  });
  const redirect = result.afterMirror.state.events.find(event => event.type === "mirror-redirect");
  expect(redirect?.redirected).toBe(true);
  expect(result.iannaSuccessDraw).toBe("H000005");
  expect(result.iannaSuccessTrace.ianna?.success).toBe(true);
  expect(result.iannaFailureDraw).toBe("H000018");
  expect(result.iannaFailureTrace.ianna?.reason).toBe("rng-miss");
  expect(result.uram.initiative.operations.map(op => op.cardId)).toContain("DIV000001");
  expect(result.doorEnd.demonDoorSummons.some(item => item.cardId === "DIV000002" && item.success)).toBe(true);
  expect(result.afterSkip.state.events.some(event => event.type === "turn-skipped" && event.playerId === "player2")).toBe(true);
  expect(result.activePlayerKey).toBe("player1");
  await attachDiagnostics(testInfo, diagnostics);
});



test("Batch-03C visual states expose distinct divine wrath, rune and blocked-card feedback", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-triggers");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = player => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = "";
      for (let i = 0; i < 5; i++) { const slot = document.createElement("div"); slot.className = "slot"; slot.dataset.player = player.key; zone.appendChild(slot); }
    };
    resetServants(player1); resetServants(player2);
    await summonBatch03Servant(player2, "MV000020", {triggerInitiativeEffect:false, ready:true});
    const undead = livingServantCardsForPlayer(player2)[0];
    batch03UpdateStats(undead, {pdvMax:6, pdv:6});
    await summonBatch03Servant(player1, "H000012", {triggerInitiativeEffect:true, ready:true});
    const applyState = {classApplied:undead.classList.contains("batch03-divine-wrath-applied"), animation:undead.dataset.batch03DivineWrathApplyAnimation, turns:undead.dataset.batch03DivineWrathTurns};
    await applyBatch03StartTurnAbilities(player2);
    const tickState = {classApplied:undead.classList.contains("batch03-divine-wrath-tick"), animation:undead.dataset.batch03DivineWrathTickAnimation, next:undead.dataset.batch03DivineWrathNextDamage, turns:undead.dataset.batch03DivineWrathTurns};
    resetServants(player1); player1.hand = []; refreshHand(player1);
    const summon = await summonBatch03Servant(player1, "H000031", {triggerInitiativeEffect:false, ready:true});
    await applyDamage(document.querySelector('.fc[data-instance="' + summon.instanceId + '"]'), 99);
    const handRune = document.querySelector('.hc[data-id="H000031"][data-batch03-rune-returned="1"]');
    const runeImage = handRune?.querySelector('img.hc-art');
    if (runeImage && (!runeImage.complete || runeImage.naturalWidth <= 0)) {
      await new Promise(resolve => {
        const done = () => resolve();
        runeImage.addEventListener("load", done, {once:true});
        runeImage.addEventListener("error", done, {once:true});
        setTimeout(done, 1000);
      });
    }
    const afterRune = auditCollectionBatch03Runtime();
    resetServants(player1); resetServants(player2);
    await summonBatch03Servant(player2, "H000001", {triggerInitiativeEffect:false, ready:true});
    await summonBatch03Servant(player1, "H000002", {triggerInitiativeEffect:true, ready:true});
    currentPlayer = player2.key; activePlayer = player2; player1.firstTurnStarted = true; player2.firstTurnStarted = true; refreshHand(player2);
    const blocked = document.querySelector('.hc-blocked-temporary[data-id="H000001"]');
    const blockedBefore = {exists:!!blocked, attr:blocked?.dataset.blockedCard, source:blocked?.dataset.blockedSource, aria:blocked?.getAttribute('aria-disabled')};
    await endTurnRuntime();
    await endTurnRuntime();
    refreshHand(player2);
    const blockedAfterExpiry = !!document.querySelector('.hc-blocked-temporary[data-id="H000001"]');
    const runeEvent = afterRune.state.events.find(event => event.type === "rune-return-to-hand" && event.cardId === "H000031");
    return {applyState, tickState, afterRune, runeEvent, runeHand:{exists:!!handRune, imageReady:!!runeImage && runeImage.complete && runeImage.naturalWidth > 0}, blockedBefore, blockedAfterExpiry};
  });
  expect(result.applyState).toMatchObject({classApplied:true, animation:"lightning-bolt", turns:"3"});
  expect(result.tickState).toMatchObject({classApplied:true, animation:"electric-arcs", next:"3", turns:"2"});
  expect(result.applyState.animation).not.toBe(result.tickState.animation);
  expect(result.afterRune.zones.player1.hand).toContain("H000031");
  expect(result.afterRune.zones.player1.graveyard).not.toContain("H000031");
  expect(result.afterRune.board.player1.map(card => card.id)).not.toContain("H000031");
  expect(result.runeEvent).toMatchObject({boardAnimation:true, boardEffect:"serviteur-rune-return", handAnimation:true});
  expect(result.runeHand).toEqual({exists:true, imageReady:true});
  expect(result.blockedBefore).toEqual({exists:true, attr:"1", source:"Mage ermite", aria:"true"});
  expect(result.blockedAfterExpiry).toBe(false);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Batch-03C rune servants return after combat and direct damage without duplicates", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-triggers");
  const result = await page.evaluate(async () => {
    const resetServants = player => { const zone = document.querySelector(playerZoneSelector(player, "servants")); zone.innerHTML = ""; for (let i = 0; i < 5; i++) { const slot = document.createElement("div"); slot.className = "slot"; slot.dataset.player = player.key; zone.appendChild(slot); } };
    resetServants(player1); resetServants(player2); player1.hand = []; refreshHand(player1);
    const direct = await summonBatch03Servant(player1, "H000031", {triggerInitiativeEffect:false, ready:true});
    await applyDamage(document.querySelector('.fc[data-instance="' + direct.instanceId + '"]'), 99);
    const afterDirect = auditCollectionBatch03Runtime();
    resetServants(player1); resetServants(player2); player1.hand = []; refreshHand(player1);
    const rune = await summonBatch03Servant(player1, "H000031", {triggerInitiativeEffect:false, ready:true});
    const attacker = await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    const runeFc = document.querySelector('.fc[data-instance="' + rune.instanceId + '"]');
    const attackerFc = document.querySelector('.fc[data-instance="' + attacker.instanceId + '"]');
    batch03UpdateStats(runeFc, {pdvMax:1, pdv:1}); delete attackerFc.dataset.new;
    await resolveCombat(attackerFc, runeFc);
    const afterCombat = auditCollectionBatch03Runtime();
    return {afterDirect, afterCombat};
  });
  for (const snapshot of [result.afterDirect, result.afterCombat]) {
    expect(snapshot.zones.player1.hand.filter(id => id === "H000031")).toHaveLength(1);
    expect(snapshot.zones.player1.graveyard).not.toContain("H000031");
    expect(snapshot.board.player1.map(card => card.id)).not.toContain("H000031");
  }
  await attachDiagnostics(testInfo, diagnostics);
});

test("Batch-03C Randall highlights 1 Écho and Human main text keeps the dark-blue emphasis", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-triggers");
  const audit = await page.evaluate(() => {
    openCardPreview("H000012", {sourceType:"test"});
    const layer = document.querySelector("#card-preview-layer");
    const echoNode = Array.from(layer.querySelectorAll("strong.kv,.canonical-keyword-inline,.card-keyword,.card-named-ability")).find(node => /1\s*Écho/.test(node.textContent));
    const toRgb = cssColor => { const probe = document.createElement("span"); probe.style.color = cssColor; document.body.appendChild(probe); const rgb = getComputedStyle(probe).color; probe.remove(); return rgb; };
    return {text:layer.textContent.replace(/\s+/g, " "), echoText:echoNode?.textContent || "", echoColor:echoNode ? getComputedStyle(echoNode).color : "", expected:toRgb("#002fa7"), forbidden:toRgb("#26c4ec")};
  });
  expect(audit.text).toContain("1 Écho");
  expect(audit.text).not.toMatch(/ressource me/i);
  expect(audit.echoText).toMatch(/1\s*Écho/);
  expect(audit.echoColor).toBe(audit.expected);
  expect(audit.echoColor).not.toBe(audit.forbidden);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Batch-03C Hallebardier damages only adjacent servants around the attacked target", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-overview");
  const result = await page.evaluate(async () => {
    const resetServants = player => { const zone = document.querySelector(playerZoneSelector(player, "servants")); zone.innerHTML = ""; for (let i = 0; i < 5; i++) { const slot = document.createElement("div"); slot.className = "slot"; slot.dataset.player = player.key; zone.appendChild(slot); } };
    resetServants(player1); resetServants(player2);
    const halberdier = await summonBatch03Servant(player1, "H000019", {triggerInitiativeEffect:false, ready:true});
    for (const id of ["H000001", "H000005", "H000018", "H000021"]) await summonBatch03Servant(player2, id, {triggerInitiativeEffect:false, ready:true});
    for (const card of livingServantCardsForPlayer(player2)) batch03UpdateStats(card, {pdvMax:8, pdv:8});
    const attacker = document.querySelector('.fc[data-instance="' + halberdier.instanceId + '"]');
    const targets = livingServantCardsForPlayer(player2);
    const center = targets[1]; delete attacker.dataset.new;
    const before = targets.map(card => ({id:card.dataset.id, pdv:Number(card.dataset.pdv)}));
    await resolveCombat(attacker, center);
    const after = livingServantCardsForPlayer(player2).map(card => ({id:card.dataset.id, pdv:Number(card.dataset.pdv)}));
    const hooks = collectionBatch03State.events.filter(event => event.type === "combat-hook");
    return {before, after, hook:hooks[hooks.length - 1]};
  });
  const beforeById = Object.fromEntries(result.before.map(card => [card.id, card.pdv]));
  const afterById = Object.fromEntries(result.after.map(card => [card.id, card.pdv]));
  expect(afterById.H000001).toBe(beforeById.H000001 - 1);
  expect(afterById.H000018).toBe(beforeById.H000018 - 1);
  expect(afterById.H000021).toBe(beforeById.H000021);
  const adjacentHits = result.hook.results.filter(item => item.type === "adjacent-damage").map(item => item.target.id);
  expect(adjacentHits).toEqual(expect.arrayContaining(["H000001", "H000018"]));
  expect(adjacentHits).not.toContain("H000021");
  await attachDiagnostics(testInfo, diagnostics);
});

test("Batch-03C H000028, H000029 and Nécrâne are visible and correctly classified", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-overview");
  const result = await page.evaluate(() => ["H000028", "H000029", "H000030"].map(id => ({id, inHand:!!document.querySelector('.hc[data-id="' + id + '"]'), data:{name:CARDS_DATA[id]?.name, faction:CARDS_DATA[id]?.fac, type:CARDS_DATA[id]?.type, cap:CARDS_DATA[id]?.cap || ""}})));
  expect(result.find(card => card.id === "H000028")).toMatchObject({inHand:true, data:{name:"Soldat inféodé", faction:"hum", type:"Serviteur", cap:"[Rempart]"}});
  expect(result.find(card => card.id === "H000029")).toMatchObject({inHand:true, data:{name:"Colosse de bronze", faction:"hum", type:"Serviteur"}});
  expect(result.find(card => card.id === "H000030")).toMatchObject({inHand:true, data:{name:"Nécrâne, Mage des ténèbres", faction:"hum", type:"Serviteur"}});
  await attachDiagnostics(testInfo, diagnostics);
});

test("Batch-03C Main d'argent uses a bounded 75 percent redirect and keeps its long preview readable", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-avatars");
  const result = await page.evaluate(async () => {
    const resetServants = player => { const zone = document.querySelector(playerZoneSelector(player, "servants")); zone.innerHTML = ""; for (let i = 0; i < 5; i++) { const slot = document.createElement("div"); slot.className = "slot"; slot.dataset.player = player.key; zone.appendChild(slot); } };
    const setup = async roll => { resetServants(player1); resetServants(player2); let calls = 0; window.__mythesRandom = () => (calls++ === 0 ? roll : 0); const mirror = await summonBatch03Servant(player1, "AVS000011", {triggerInitiativeEffect:false, ready:true}); await summonBatch03Servant(player1, "H000001", {triggerInitiativeEffect:false, ready:true}); const attacker = await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true}); return maybeRedirectBatch03MirrorTarget(document.querySelector('.fc[data-instance="' + attacker.instanceId + '"]'), document.querySelector('.fc[data-instance="' + mirror.instanceId + '"]')).result; };
    const r010 = await setup(0.10), r074 = await setup(0.74), r075 = await setup(0.75), r090 = await setup(0.90);
    resetServants(player1); resetServants(player2); window.__mythesRandom = () => 0.1;
    const mirror = await summonBatch03Servant(player1, "AVS000011", {triggerInitiativeEffect:false, ready:true});
    const attacker = await summonBatch03Servant(player2, "H000005", {triggerInitiativeEffect:false, ready:true});
    const noAlt = maybeRedirectBatch03MirrorTarget(document.querySelector('.fc[data-instance="' + attacker.instanceId + '"]'), document.querySelector('.fc[data-instance="' + mirror.instanceId + '"]')).result;
    openCardPreview("AVS000011", {sourceType:"test"});
    const layer = document.querySelector("#card-preview-layer"), preview = layer.querySelector(".canonical-card-preview"), title = layer.querySelector(".fz-name");
    return {r010, r074, r075, r090, noAlt, name:CARDS_DATA.AVS000011.name, titleText:title?.textContent || "", titleRect:title?.getBoundingClientRect().toJSON(), previewRect:preview?.getBoundingClientRect().toJSON(), whiteSpace:getComputedStyle(title).whiteSpace};
  });
  expect(result.r010.redirected).toBe(true);
  expect(result.r074.redirected).toBe(true);
  expect(result.r075.redirected).toBe(false);
  expect(result.r090.redirected).toBe(false);
  expect(result.noAlt.redirected).toBe(false);
  expect(result.noAlt.reason).toBe("no-alternative-target");
  expect(result.name).toContain("miroirs");
  expect(result.name).not.toMatch(/mirroirs/i);
  expect(result.titleText).toContain("miroirs");
  expect(result.whiteSpace).not.toBe("nowrap");
  expect(result.titleRect.right).toBeLessThanOrEqual(result.previewRect.right + 1);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Batch-03C Undergast echoes targeted spells exactly once", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-avatars");
  const result = await page.evaluate(async () => {
    const resetServants = player => { const zone = document.querySelector(playerZoneSelector(player, "servants")); zone.innerHTML = ""; for (let i = 0; i < 5; i++) { const slot = document.createElement("div"); slot.className = "slot"; slot.dataset.player = player.key; zone.appendChild(slot); } };
    const run = async withUndergast => { resetServants(player1); resetServants(player2); player1.hand = ["S000010"]; player1.graveyard = []; refreshHand(player1); if (withUndergast) await summonBatch03Servant(player1, "AVS000003", {triggerInitiativeEffect:false, ready:true}); const target = await summonBatch03Servant(player1, "AVS000001", {triggerInitiativeEffect:false, ready:true}); const targetFc = document.querySelector('.fc[data-instance="' + target.instanceId + '"]'); batch03UpdateStats(targetFc, {pdvMax:13, pdv:1}); const before = targetSummary(targetFc); const play = await playCard("S000010", null, {selectedTargetIds:[targetFc.dataset.instance]}); const after = targetSummary(targetFc); return {before, after, play, hand:[...player1.hand], graveyard:[...player1.graveyard], events:collectionBatch03State.events.slice()}; };
    return {echoed:await run(true), single:await run(false)};
  });
  expect(result.echoed.after.pdv).toBe(13);
  expect(result.single.after.pdv).toBe(7);
  expect(result.echoed.play.batch03SpellEcho.echoed).toBe(true);
  expect(result.echoed.events.filter(event => event.type === "spell-echo" && event.cardId === "S000010")).toHaveLength(1);
  expect(result.echoed.hand).not.toContain("S000010");
  expect(result.echoed.graveyard.filter(id => id === "S000010")).toHaveLength(1);
  expect(result.echoed.play.batch03SpellEcho.echoedResolution?.success).not.toBe(false);
  expect(result.single.play.batch03SpellEcho.echoed).toBe(false);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Batch-03C Ianna steals only the real drawn card after the opponent draws", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-ianna");
  const result = await page.evaluate(async () => {
    const resetServants = player => { const zone = document.querySelector(playerZoneSelector(player, "servants")); zone.innerHTML = ""; for (let i = 0; i < 5; i++) { const slot = document.createElement("div"); slot.className = "slot"; slot.dataset.player = player.key; zone.appendChild(slot); } };
    resetServants(player1); resetServants(player2); await summonBatch03Servant(player1, "AVS000010", {triggerInitiativeEffect:false, ready:true});
    player1.hand = []; player2.hand = []; player2.drawPile = ["R000010", "H000005"]; player2.firstTurnStarted = true; window.__mythesRandom = () => 0.25;
    const stolenDraw = await startTurn(player2); const afterSteal = auditCollectionBatch03Runtime();
    const stolenNodeAfterSteal = !!document.querySelector('.hc[data-id="H000005"][data-batch03-ianna-transfer="stolen"]');
    player2.drawPile = ["H000018"]; window.__mythesRandom = () => 0.75; player2.turnState.normalDrawResolved = false;
    const keptDraw = await startTurn(player2); const afterMiss = auditCollectionBatch03Runtime();
    resetServants(player1); player2.drawPile = ["H000001"]; player2.hand = []; player1.hand = []; player2.turnState.normalDrawResolved = false; window.__mythesRandom = () => 0.1;
    const noIannaDraw = await startTurn(player2); const afterNoIanna = auditCollectionBatch03Runtime();
    return {stolenDraw, afterSteal, keptDraw, afterMiss, noIannaDraw, afterNoIanna, stolenNodeAfterSteal, events:collectionBatch03State.events.filter(event => event.type === "ianna-draw-steal")};
  });
  expect(result.stolenDraw).toBe("H000005");
  expect(result.afterSteal.zones.player1.hand).toContain("H000005");
  expect(result.afterSteal.zones.player2.hand).not.toContain("H000005");
  expect(result.afterSteal.zones.player1.hand).not.toContain("R000001");
  expect(result.keptDraw).toBe("H000018");
  expect(result.afterMiss.zones.player2.hand).toContain("H000018");
  expect(result.afterNoIanna.zones.player2.hand).toContain("H000001");
  expect(result.events.some(event => event.success && event.stolenCardId === "H000005" && event.roll === 0.25)).toBe(true);
  expect(result.events.find(event => event.success && event.stolenCardId === "H000005")?.visualSequence).toEqual(expect.arrayContaining(["drawn-card-highlighted", "stolen-card-highlighted"]));
  expect(result.stolenNodeAfterSteal).toBe(true);
  expect(result.events.some(event => event.reason === "rng-miss" && event.roll === 0.75)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Batch-03D Ianna scenario uses a unique drawn sentinel and keeps the transfer visible", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-ianna");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0.1;
    player1.hand = [];
    player2.hand = [];
    player2.drawPile = ["R000010", "H000005"];
    player2.firstTurnStarted = true;
    const before = {
      iannaHand:[...player1.hand],
      drawerHand:[...player2.hand],
      drawerDeck:[...player2.drawPile]
    };
    const drawn = await startTurn(player2);
    const after = auditCollectionBatch03Runtime();
    return {
      before,
      drawn,
      after,
      stolenNode:!!document.querySelector('.hc[data-id="H000005"][data-batch03-ianna-transfer="stolen"]'),
      events:collectionBatch03State.events.filter(event => event.type === "ianna-draw-steal")
    };
  });
  expect(result.before.iannaHand).not.toContain("H000005");
  expect(result.before.drawerDeck).toContain("H000005");
  expect(result.drawn).toBe("H000005");
  expect(result.after.zones.player1.hand.filter(id => id === "H000005")).toHaveLength(1);
  expect(result.after.zones.player2.hand).not.toContain("H000005");
  expect(result.stolenNode).toBe(true);
  expect(result.events.find(event => event.success && event.stolenCardId === "H000005")?.visualSequence).toEqual(expect.arrayContaining(["drawn-card-highlighted", "stolen-card-highlighted"]));
  await attachDiagnostics(testInfo, diagnostics);
});

test("Batch-03C S000010 and S000028 open target selection and resolve real effects", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-spells");
  await page.evaluate(() => { player1.hand = ["S000010", "S000028"]; refreshHand(player1); const ally = livingServantCardsForPlayer(player1)[0]; batch03UpdateStats(ally, {pdvMax:8, pdv:2}); });
  await page.evaluate(() => { window.__batch03PendingPlay = playCard("S000010", null); });
  await expect(page.getByTestId("board-target-choice-list")).toBeVisible();
  await page.getByTestId("board-target-choice").first().click();
  await page.getByTestId("board-target-confirm").click();
  const afterHeal = await page.evaluate(async () => { await window.__batch03PendingPlay; delete window.__batch03PendingPlay; const target = livingServantCardsForPlayer(player1)[0]; return {target:targetSummary(target), graveyard:[...player1.graveyard]}; });
  expect(afterHeal.target.pdv).toBe(8);
  expect(afterHeal.graveyard).toContain("S000010");
  await page.evaluate(() => { window.__batch03PendingPlay = playCard("S000028", null); });
  await expect(page.getByTestId("board-target-choice-list")).toBeVisible();
  await page.getByTestId("board-target-choice").first().click();
  await page.getByTestId("board-target-confirm").click();
  const afterAura = await page.evaluate(async () => { await window.__batch03PendingPlay; delete window.__batch03PendingPlay; const target = livingServantCardsForPlayer(player1)[0]; openCardPreview(target.dataset.id, {sourceElement:target}); return {target:targetSummary(target), graveyard:[...player1.graveyard], pdvClass:target.querySelector(".fc-pdv-val")?.className || "", previewText:document.querySelector("#card-preview-layer")?.textContent?.replace(/\s+/g, " ") || ""}; });
  expect(afterAura.target.insensible).toBe(true);
  expect(afterAura.target.auraProtection).toBe(true);
  expect(afterAura.target.pdvMax).toBe(11);
  expect(afterAura.pdvClass).toContain("grn");
  expect(afterAura.graveyard).toEqual(expect.arrayContaining(["S000010", "S000028"]));
  expect(afterAura.previewText).toContain("Insensible");
  const woundedAura = await page.evaluate(async () => {
    player1.hand = ["S000028"];
    refreshHand(player1);
    const target = livingServantCardsForPlayer(player1)[1];
    batch03UpdateStats(target, {pdvMax:8, pdv:2});
    await playCard("S000028", null, {selectedTargetIds:[target.dataset.instance]});
    return {target:targetSummary(target), pdvClass:target.querySelector(".fc-pdv-val")?.className || ""};
  });
  expect(woundedAura.target.pdv).toBe(5);
  expect(woundedAura.target.pdvMax).toBe(11);
  expect(woundedAura.pdvClass).toContain("red");
  await attachDiagnostics(testInfo, diagnostics);
});

test("Human combat, end-turn and Vengeance hooks preserve inventories", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-03-humans-overview");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const resetServants = player => {
      const zone = document.querySelector(playerZoneSelector(player, "servants"));
      zone.innerHTML = Array.from({length: 5}, () => `<div class="slot" data-player="${player.key}"></div>`).join("");
    };
    const before = auditCollectionBatch03Runtime();
    resetServants(player1);
    await summonBatch03Servant(player1, "H000026", {triggerInitiativeEffect:false, ready:true});
    const guard = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000026");
    await applyDamage(guard, 1);
    resetServants(player1);
    await summonBatch03Servant(player1, "H000020", {triggerInitiativeEffect:false, ready:true});
    const wolf = await applyBatch03EndTurnAbilities(player1);
    player1.hand.push("H000027");
    await applyBatch03EndTurnAbilities(player1);
    resetServants(player1);
    const necrane = await summonBatch03Servant(player1, "H000030", {triggerInitiativeEffect:false, ready:true});
    const necraneStart = await applyBatch03StartTurnAbilities(player1);
    const afterNecraneStart = auditCollectionBatch03Runtime();
    const necraneEnd = await applyBatch03EndTurnAbilities(player1);
    const afterNecraneEnd = auditCollectionBatch03Runtime();
    const necraneFc = document.querySelector(`.fc[data-instance="${necrane.instanceId}"]`);
    necraneFc._killer = livingServantCardsForPlayer(player2)[0] || null;
    await sendToCemetery(necraneFc);
    resetServants(player1);
    const h29 = await summonBatch03Servant(player1, "H000029", {triggerInitiativeEffect:false, ready:true});
    const h29fc = document.querySelector(`.fc[data-instance="${h29.instanceId}"]`);
    const victim = livingServantCardsForPlayer(player2)[0];
    batch03UpdateStats(victim, {pdv:1});
    delete h29fc.dataset.new;
    await resolveCombat(h29fc, victim);
    const after = auditCollectionBatch03Runtime();
    return {before, after, wolf, necraneStart, afterNecraneStart, necraneEnd, afterNecraneEnd};
  });
  expect(result.after.board.player2.map(card => card.id)).toContain("H000001");
  expect(result.wolf.wolfSummons.some(summon => summon.cardId === "H000021" && summon.success)).toBe(true);
  expect(result.necraneStart.necraneSummons).toEqual([]);
  expect(result.afterNecraneStart.board.player1.map(card => card.id)).not.toContain("MV000020");
  expect(result.necraneEnd.necraneSummons.some(summon => summon.cardId === "MV000020" && summon.success)).toBe(true);
  expect(result.afterNecraneEnd.board.player1.map(card => card.id)).toContain("MV000020");
  expect(result.after.handBuffs.player1.H000027?.atk).toBeGreaterThanOrEqual(1);
  expect(result.after.state.events.some(event => event.type === "vengeance-necrane")).toBe(true);
  expect(result.after.state.events.some(event => event.type === "combat-hook" && JSON.stringify(event).includes("bronze-colossus-discard"))).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});
