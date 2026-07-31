import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-10-goblins.json", import.meta.url), "utf8"));
const signatures = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-effect-signatures.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch10=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(150);
}

function diagnosticsFor(page) { return attachPageDiagnostics(page); }
function byId(items) { return new Map(items.map(item => [item.id, item])); }
function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message =>
    !/Failed to load resource: the server responded with a status of 404/i.test(message)
    && !/Failed to load resource: net::ERR_(NETWORK_CHANGED|NAME_NOT_RESOLVED)/i.test(message)
  );
}

test("Batch-10 scenarios stay hidden and expose exact Goblin runtime data", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  const signaturesById = byId(signatures.signatures);
  const seen = new Set();
  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    const audit = await page.evaluate((input) => {
      const runtime = auditCollectionBatch10Runtime();
      const zones = runtime.players.flatMap(player => [...player.hand, ...player.deck, ...player.graveyard, ...player.servants.map(card => card.id)]);
      return {
        scenarioId:selectedScenarioId(),
        publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + input.scenario + '"]').length,
        cards:input.ids.map(id => ({id, exists:!!CARDS_DATA[id], name:CARDS_DATA[id]?.name || "", type:CARDS_DATA[id]?.type || "", faction:CARDS_DATA[id]?.fac || "", keywords:[...(CARDS_DATA[id]?.kws || [])], cap:CARDS_DATA[id]?.cap || "", lore:CARDS_DATA[id]?.lore || ""})),
        zones,
        runtime,
        images:Array.from(document.querySelectorAll('.fc img,.hc img')).filter(img => (img.getAttribute("src") || "").includes("../assets/")).slice(0, 16).map(img => ({src:img.getAttribute("src") || "", width:img.naturalWidth})),
        rendered:{
          mageobelin:formatPlayerFacingCardText(CARDS_DATA.GOB000001.cap),
          miniFurie:formatPlayerFacingCardText(CARDS_DATA.GOB000006.cap),
          snarff:formatPlayerFacingCardText(CARDS_DATA.GOB000014.cap),
          tyran:formatPlayerFacingCardText(CARDS_DATA.GOB000019.cap),
          codeCouleurs:formatPlayerFacingCardText(CARDS_DATA.S000038.cap),
          vollee:formatPlayerFacingCardText(CARDS_DATA.S000047.cap),
          chapardeur:formatPlayerFacingCardText(CARDS_DATA.GOB000005.cap),
          cheffaillon:formatPlayerFacingCardText(CARDS_DATA.GOB000009.cap),
          chercheurCap:formatPlayerFacingCardText(CARDS_DATA.GOB000010.cap),
          chercheurCond:formatPlayerFacingCardText(CARDS_DATA.GOB000010.cond || ''),
          chemins:formatPlayerFacingCardText(CARDS_DATA.S000037.detail || CARDS_DATA.S000037.cap),
          surineurPreview:buildCanonicalCardPreview("GOB000002"),
          globeminatorPreview:buildCanonicalCardPreview("GOB000004")
        }
      };
    }, {scenario, ids:fixture.cardIds});
    expect(audit.scenarioId).toBe(scenario);
    expect(audit.publicOptionCount, scenario + " public option").toBe(fixture.expectedHiddenScenarioOptionCount);
    expect(audit.cards.every(card => card.exists), JSON.stringify(audit.cards.filter(card => !card.exists))).toBe(true);
    for (const id of audit.zones) seen.add(id);
    for (const probe of audit.images) expect(probe.width, probe.src).toBeGreaterThan(0);
    expect(audit.rendered.mageobelin).toContain('class="kv"');
    expect(audit.rendered.miniFurie).toContain("2");
    expect(audit.rendered.snarff).toContain("2");
    expect(audit.rendered.tyran).toContain("+3 PDV");
    expect(audit.rendered.codeCouleurs).toContain("1");
    expect(audit.rendered.vollee).toContain("3");
    expect(audit.rendered.chapardeur).toContain("Approvisionnement");
    expect(audit.rendered.cheffaillon).toContain("+1 ATK");
    expect(audit.rendered.cheffaillon).toContain('class="kv"');
    expect(audit.rendered.chercheurCap).toContain("Approvisionnement");
    expect(audit.rendered.chercheurCond).toContain("cimetière");
    expect(audit.rendered.chemins).not.toContain("objectif");
    expect(audit.rendered.surineurPreview).toContain("card-lore-text");
    expect(audit.rendered.globeminatorPreview).toContain("card-lore-text");
    expect(audit.cards.find(card => card.id === "GOB000006").keywords).toContain("Sang ardent");
    expect(audit.cards.find(card => card.id === "GOB000020").keywords).toContain("Serviteur de la rune");
  }
  for (const id of fixture.cardIds) expect(signaturesById.get(id), id + " signature").toBeTruthy();
  for (const id of fixture.cardIds) expect(seen.has(id), id + " visible in at least one technical scenario").toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Goblin initiatives move cards, summon allies, heal and manipulate deck zones", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-10-gobelins");
  const nervous = await page.evaluate(async () => {
    window.__collectionBatch10RandomQueue = [0, 0, 0, 0];
    const enemyHp = () => livingServantCardsForPlayer(player2).reduce((sum, fc) => sum + Number(fc.dataset.pdv || 0), 0);
    const before = {
      p1Hand:player1.hand.length,
      p1Deck:player1.drawPile.length,
      p1Grave:[...player1.graveyard],
      p2Deck:player2.drawPile.length,
      enemyPdvTotal:enemyHp()
    };
    const initGob008 = await summonBatch03Servant(player1, "GOB000008", {sourceCardId:"test", triggerInitiativeEffect:true, ready:true});
    const afterGob008 = {enemyPdvTotal:enemyHp()};
    return {before, initGob008, afterGob008, audit:auditCollectionBatch10Runtime()};
  });

  await openScenario(page, "collection-batch-10-gobelins");
  const dompteur = await page.evaluate(async () => {
    window.__collectionBatch10RandomQueue = [0, 0, 0, 0];
    const initGob011 = await summonBatch03Servant(player1, "GOB000011", {sourceCardId:"test", triggerInitiativeEffect:true, ready:true});
    const beastOnBoard = livingServantCardsForPlayer(player1).some(fc => CARDS_DATA[fc.dataset.id]?.fac === "bet");
    return {initGob011, beastOnBoard, audit:auditCollectionBatch10Runtime()};
  });

  await openScenario(page, "collection-batch-10-gobelins");
  const searchAndHeal = await page.evaluate(async () => {
    window.__collectionBatch10RandomQueue = [0, 0, 0, 0];
    const initGob010Summon = await summonBatch03Servant(player1, "GOB000010", {sourceCardId:"test", triggerInitiativeEffect:false, ready:true});
    const chercheur = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000010");
    const initGob010 = await triggerInitiative("GOB000010", player1, {sourceInstanceId:chercheur.dataset.instance, zoneSelection:{selectedCardIds:["R000010"]}});
    const initGob014 = await summonBatch03Servant(player1, "GOB000014", {sourceCardId:"test", triggerInitiativeEffect:true, ready:true});
    const wounded = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000002");
    if (wounded) batch03UpdateStats(wounded, {pdvMax:1, pdv:1});
    const healerTarget = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000007");
    if (healerTarget) batch03UpdateStats(healerTarget, {pdvMax:3, pdv:1});
    const endTurn = await applyBatch03EndTurnAbilities(player1);
    return {
      initGob010,
      initGob010Summon,
      initGob014,
      endTurn,
      audit:auditCollectionBatch10Runtime()
    };
  });
  expect(nervous.initGob008.initiative.success).toBe(true);
  expect(nervous.afterGob008.enemyPdvTotal).toBeLessThan(nervous.before.enemyPdvTotal);
  expect(dompteur.initGob011.initiative.success).toBe(true);
  expect(dompteur.beastOnBoard).toBe(true);
  expect(searchAndHeal.initGob010.moved).toBe("R000010");
  expect(searchAndHeal.initGob014.initiative.drawn.length).toBeGreaterThan(0);
  expect(searchAndHeal.endTurn.gueribelinHeals.length).toBeGreaterThan(0);
  expect(nervous.audit.state.events.some(event => event.type === "feedback-before-effect" && event.reason === "petit-nerveux")).toBe(true);
  expect(nervous.audit.state.events.some(event => event.type === "petit-nerveux-initiative")).toBe(true);
  expect(dompteur.audit.state.events.some(event => event.type === "feedback-before-effect" && event.reason === "dompteur")).toBe(true);
  expect(dompteur.audit.state.events.some(event => event.type === "dompteur-initiative")).toBe(true);
  expect(searchAndHeal.audit.state.events.some(event => event.type === "chercheur-tresor-initiative")).toBe(true);
  expect(searchAndHeal.audit.state.events.some(event => event.type === "feedback-before-effect" && event.reason === "chercheur")).toBe(true);
  expect(searchAndHeal.audit.state.events.some(event => event.type === "feedback-before-effect" && event.reason === "snarff")).toBe(true);
  expect(searchAndHeal.audit.state.events.some(event => event.type === "snarff-initiative")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Goblin spells summon, copy hand contents, draw to eight and empower Vengeance", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-10-sorts");
  const spells = await page.evaluate(async () => {
    const initial = {hand:player1.hand.length, deck:player1.drawPile.length, servants:livingServantCardsForPlayer(player1).length};
    const code = await triggerSort("S000038", player1);
    const afterCode = {hand:player1.hand.length};
    const reunion = await triggerSort("S000009", player1);
    const afterReunion = {deck:player1.drawPile.length, servants:livingServantCardsForPlayer(player1).length, summoned:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id)};
    return {initial, code, afterCode, reunion, afterReunion, audit:auditCollectionBatch10Runtime()};
  });
  expect(spells.code.added).toEqual(["GOB000001","GOB000002"]);
  expect(spells.afterCode.hand).toBe(spells.initial.hand + 2);
  expect(spells.reunion.summoned.filter(item => item.success).length).toBeGreaterThan(0);
  expect(spells.afterReunion.servants).toBeGreaterThan(spells.initial.servants);

  await openScenario(page, "collection-batch-10-sorts");
  const vollee = await page.evaluate(async () => {
    const before = {servants:livingServantCardsForPlayer(player1).length, deck:player1.drawPile.length};
    const result = await triggerSort("S000047", player1);
    return {before, result, after:{servants:livingServantCardsForPlayer(player1).length, deck:player1.drawPile.length, surineurs:livingServantCardsForPlayer(player1).filter(fc => fc.dataset.id === "GOB000002").length}};
  });
  expect(vollee.result.summoned.filter(item => item.success).length).toBe(3);
  expect(vollee.after.servants).toBe(vollee.before.servants + 3);
  expect(vollee.after.deck).toBe(vollee.before.deck);
  expect(vollee.after.surineurs).toBe(3);

  await openScenario(page, "collection-batch-10-sorts");
  const ley = await page.evaluate(async () => {
    player1.hand = ["S000037", "GOB000001", "GOB000002", "H000001"];
    player1.drawPile = ["H000005", "GOB000005", "GOB000006", "GOB000008", "GOB000012", "GOB000016", "GOB000018"];
    removeHandCardAt(player1, 0);
    const before = {hand:player1.hand.length, deck:player1.drawPile.length};
    const result = await resolveCheminsDeLey(player1);
    return {before, result, after:{hand:player1.hand.length, deck:player1.drawPile.length, handIds:[...player1.hand]}};
  });
  expect(ley.after.hand).toBe(8);
  expect(ley.result.drawn.length).toBe(5);
  expect(ley.result.drawn.every(id => id.startsWith("GOB"))).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Goblin combat, damage reduction, Vengeance and Machiavélisme resolve as real state changes", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-10-combat");
  const result = await page.evaluate(async () => {
    window.__collectionBatch10RandomQueue = [0, 0, 0, 0, 0, 0];
    const exception = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000003");
    const undead = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "MV000020");
    batch03UpdateStats(undead, {pdvMax:20, pdv:20});
    const undeadBefore = targetSummary(undead);
    await resolveCombat(exception, undead);
    const undeadAfter = targetSummary(undead);
    const gitzo = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000020");
    const fragile = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000005");
    const gitzoBefore = {hand:player1.hand.length, deck:player1.drawPile.length, pdv:Number(gitzo.dataset.pdv || 0)};
    await resolveCombat(gitzo, fragile);
    const gitzoAfter = {hand:player1.hand.length, deck:player1.drawPile.length, pdv:Number(gitzo.dataset.pdv || 0), exhausted:gitzo.dataset.exhausted === "1", attacks:Number(gitzo.dataset.batch10GitzoAttacksThisTurn || 0)};
    const protectedGoblin = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000006");
    batch03UpdateStats(protectedGoblin, {pdvMax:2, pdv:2});
    const protectedBefore = Number(protectedGoblin.dataset.pdv || 0);
    await tryApplyAbilityDamage({sourcePlayer:player2, targetFC:protectedGoblin, sourceCardId:"H000001", amount:2, bypassInsensitive:true});
    const protectedAfter = Number(protectedGoblin.dataset.pdv || 0);
    await triggerSort("S000049", player1);
    const enemiesBeforeVengeance = livingServantCardsForPlayer(player2).map(targetSummary);
    await sendToCemetery(protectedGoblin);
    const enemiesAfterVengeance = livingServantCardsForPlayer(player2).map(targetSummary);
    return {undeadBefore, undeadAfter, gitzoBefore, gitzoAfter, protectedBefore, protectedAfter, enemiesBeforeVengeance, enemiesAfterVengeance, notices:Array.from(document.querySelectorAll('.notif,.toast,.history li')).map(el => el.textContent || ''), audit:auditCollectionBatch10Runtime()};
  });
  expect(result.undeadAfter.pdv).toBe(result.undeadBefore.pdv - 9);
  expect(result.audit.state.events.some(event => event.type === "combat-effects" && event.results?.some(item => item.type === "divine-wrath-vs-undead"))).toBe(true);
  expect(result.gitzoAfter.hand).toBe(result.gitzoBefore.hand + 1);
  expect(result.gitzoAfter.deck).toBe(result.gitzoBefore.deck - 1);
  expect(result.gitzoAfter.pdv).toBe(result.gitzoBefore.pdv);
  expect(result.gitzoAfter.exhausted).toBe(false);
  expect(result.gitzoAfter.attacks).toBe(1);
  expect(result.protectedAfter).toBe(result.protectedBefore - 1);
  expect(result.audit.state.events.some(event => event.type === "damage-reduced")).toBe(true);
  expect(result.audit.state.events.filter(event => event.type === "goblin-vengeance").length).toBeGreaterThanOrEqual(1);
  expect(result.audit.state.events.some(event => event.type === "goblin-vengeance" && event.repeat)).toBe(true);
  expect(result.notices.join(" ")).not.toContain("ajoute 2 dÃ©gÃ¢ts Ã  la Vengeance");
  expect(result.enemiesAfterVengeance.some(card => card.pdv < result.enemiesBeforeVengeance.find(before => before.instance === card.instance)?.pdv)).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Faux jumeau, Maître de l'indiscrétion, Petit futé, Tyran and Casse-cou keep zone inventories coherent", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-10-special");
  const result = await page.evaluate(async () => {
    window.__collectionBatch10RandomQueue = [0, 0, 0, 0];
    const gobRempart = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000013");
    const faux = await summonBatch03Servant(player1, "GOB000015", {sourceCardId:"test", triggerInitiativeEffect:false, ready:true});
    const fauxCard = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000015");
    const fauxInitiative = await triggerInitiative("GOB000015", player1, {sourceInstanceId:fauxCard.dataset.instance, selectedTargetIds:[gobRempart.dataset.instance]});
    const fauxState = {atk:Number(fauxCard.dataset.atk || 0), pdvMax:Number(fauxCard.dataset.pdvMax || 0), rempart:fauxCard.dataset.rempart === "1", granted:fauxCard.dataset.batch10GrantedKeywords || ""};
    const trollRempart = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "TRL000010");
    const master = await summonBatch03Servant(player1, "GOB000017", {sourceCardId:"test", triggerInitiativeEffect:false, ready:true});
    const masterCard = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000017");
    const masterInitiative = await triggerInitiative("GOB000017", player1, {sourceInstanceId:masterCard.dataset.instance, selectedTargetIds:[trollRempart.dataset.instance]});
    const stolen = masterCard.dataset.batch10StolenKeywords || "";
    const targetAfterSteal = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "TRL000010");
    const enemyTopBefore = player2.drawPile.slice(-4);
    const clever = await summonBatch03Servant(player1, "GOB000018", {sourceCardId:"test", triggerInitiativeEffect:false, ready:true});
    const cleverCard = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000018");
    const cleverInitiative = await triggerInitiative("GOB000018", player1, {sourceInstanceId:cleverCard.dataset.instance, zoneSelection:{selectedIndex:player2.drawPile.length - 4}});
    const enemyBottomAfter = player2.drawPile[0];
    const target = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000002");
    const decoy = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000016");
    batch03UpdateStats(target, {pdvMax:1, pdv:1});
    const targetBefore = Number(target.dataset.pdv || 0);
    const decoyBefore = Number(decoy.dataset.pdv || 0);
    await tryApplyAbilityDamage({sourcePlayer:player2, targetFC:target, sourceCardId:"H000001", amount:2, bypassInsensitive:true});
    const redirectState = {targetAfter:Number(target.dataset.pdv || 0), decoyAfter:Number(decoy.dataset.pdv || 0), used:decoy.dataset.batch10CasseCouUsedTurn === String(turnSequence)};
    return {faux, fauxInitiative, fauxState, master, masterInitiative, stolen, targetAfterSteal:targetSummary(targetAfterSteal), enemyTopBefore, clever, cleverInitiative, enemyBottomAfter, targetBefore, decoyBefore, redirectState, audit:auditCollectionBatch10Runtime()};
  });
  await openScenario(page, "collection-batch-10-special");
  const tyranResult = await page.evaluate(async () => {
    const tyranSummon = await summonBatch03Servant(player1, "GOB000019", {sourceCardId:"test", triggerInitiativeEffect:false, ready:true});
    const tyranBefore = {hand:player1.hand.length, deck:player1.drawPile.length, grave:player1.graveyard.length, servants:livingServantCardsForPlayer(player1).length};
    const tyran = await resolveBatch10TyranDePoche(player1, "draw");
    const tyranAfter = {hand:player1.hand.length, deck:player1.drawPile.length, grave:player1.graveyard.length, servants:livingServantCardsForPlayer(player1).length};
    return {tyranSummon, tyranBefore, tyran, tyranAfter, audit:auditCollectionBatch10Runtime()};
  });
  expect(result.faux.success).toBe(true);
  expect(result.fauxInitiative.success).toBe(true);
  expect(result.fauxState.atk).toBeGreaterThanOrEqual(1);
  expect(result.fauxState.rempart).toBe(true);
  expect(result.fauxState.granted).toContain("Rempart");
  expect(result.master.success).toBe(true);
  expect(result.masterInitiative.success).toBe(true);
  expect(result.stolen).toContain("Rempart");
  expect(result.targetAfterSteal.rempart).not.toBe(true);
  expect(result.audit.players[1].servants.find(card => card.id === "TRL000010").suppressed).toContain("Rempart");
  expect(result.audit.players[0].servants.find(card => card.id === "GOB000015").copiedFrom).toBeTruthy();
  expect(result.clever.success).toBe(true);
  expect(result.cleverInitiative.success).toBe(true);
  expect(result.enemyBottomAfter).toBe(result.enemyTopBefore[0]);
  expect(result.redirectState.targetAfter).toBe(result.targetBefore);
  expect(result.redirectState.decoyAfter).toBe(result.decoyBefore - 1);
  expect(result.redirectState.used).toBe(true);
  expect(tyranResult.tyranSummon.success).toBe(true);
  expect(tyranResult.tyran.success).toBe(true);
  expect(tyranResult.tyranAfter.hand).toBe(tyranResult.tyranBefore.hand + 2);
  expect(tyranResult.tyranAfter.deck).toBe(tyranResult.tyranBefore.deck - 2);
  expect(tyranResult.tyranAfter.grave).toBe(tyranResult.tyranBefore.grave + 1);
  expect(result.audit.state.events.some(event => event.type === "faux-jumeau-copy")).toBe(true);
  expect(result.audit.state.events.some(event => event.type === "indiscretion-keywords")).toBe(true);
  expect(result.audit.state.events.some(event => event.type === "petit-fute-deck-order")).toBe(true);
  expect(result.audit.state.events.some(event => event.type === "casse-cou-redirect")).toBe(true);
  expect(tyranResult.audit.state.events.some(event => event.type === "tyran-de-poche")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
