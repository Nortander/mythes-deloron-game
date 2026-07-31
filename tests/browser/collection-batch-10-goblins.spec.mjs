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
          globeminatorPreview:buildCanonicalCardPreview("GOB000004"),
          dompteurHandHtml:buildHC("GOB000011", player1),
          tyranHandHtml:buildHC("GOB000019", player1),
          larronHandHtml:buildHC("H000001", player1),
          fantassinHandHtml:buildHC("H000005", player1),
          styleProbe:(() => {
            const host = document.createElement("div");
            host.style.position = "absolute";
            host.style.left = "-9999px";
            host.innerHTML = buildHC("GOB000011", player1) + buildHC("GOB000019", player1) + buildHC("H000001", player1) + buildHC("H000005", player1);
            document.body.appendChild(host);
            const colorOf = selector => { const el = host.querySelector(selector); return el ? getComputedStyle(el).color : ""; };
            const styleOf = selector => { const el = host.querySelector(selector); return el ? getComputedStyle(el).fontStyle : ""; };
            const textOf = selector => host.querySelector(selector)?.textContent || "";
            const probe = {
              gobKeywordColor:colorOf('.hc[data-id="GOB000011"] .card-keyword'),
              gobValueColor:colorOf('.hc[data-id="GOB000011"] strong.kv'),
              gobTooltipColor:facColor('gob'),
              larronLoreStyle:styleOf('.hc[data-id="H000001"] .card-lore-text'),
              larronLoreColor:colorOf('.hc[data-id="H000001"] .card-lore-text'),
              larronLoreText:textOf('.hc[data-id="H000001"] .card-lore-text'),
              fantassinKeywordStyle:styleOf('.hc[data-id="H000005"] .canonical-keyword-inline'),
              fantassinLoreStyle:styleOf('.hc[data-id="H000005"] .card-lore-text'),
              fantassinLoreText:textOf('.hc[data-id="H000005"] .card-lore-text')
            };
            host.remove();
            return probe;
          })()
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
    expect(audit.rendered.styleProbe.gobKeywordColor).toBe("rgb(255, 210, 63)");
    expect(audit.rendered.styleProbe.gobValueColor).toBe("rgb(255, 210, 63)");
    expect(audit.rendered.styleProbe.gobTooltipColor).toBe("#e6b93f");
    expect(audit.rendered.larronHandHtml).toContain("sombre...");
    expect(audit.rendered.larronHandHtml).not.toContain("”¦");
    expect(audit.rendered.styleProbe.larronLoreStyle).toBe("italic");
    expect(audit.rendered.styleProbe.larronLoreColor).not.toBe("rgb(0, 47, 167)");
    expect(audit.rendered.fantassinHandHtml).toContain("card-lore-text");
    expect(audit.rendered.styleProbe.fantassinKeywordStyle).not.toBe("italic");
    expect(audit.rendered.styleProbe.fantassinLoreStyle).toBe("italic");
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

test("Goblin choice modals keep the minimize control above a centered title", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-10-gobelins");
  await page.evaluate(() => {
    window.__batch10ModalPromise = (async () => {
      const summon = await summonBatch03Servant(player1, "GOB000010", {sourceCardId:"test", triggerInitiativeEffect:false, ready:true});
      const source = summon.instanceId ? document.querySelector('.fc[data-instance="' + summon.instanceId + '"]') : livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000010");
      return await triggerInitiative("GOB000010", player1, {sourceInstanceId:source.dataset.instance});
    })();
  });
  const overlay = page.locator(".decision-modal-overlay");
  await expect(overlay).toBeVisible();
  const layout = await page.evaluate(() => {
    const overlay = document.querySelector(".decision-modal-overlay");
    const panel = overlay?.querySelector(".sort-choice-panel");
    const topline = overlay?.querySelector(".decision-modal-topline");
    const title = overlay?.querySelector(".decision-modal-title");
    const item = overlay?.querySelector(".sort-choice-item");
    item?.dispatchEvent(new MouseEvent("mouseover", {bubbles:true}));
    const pr = panel?.getBoundingClientRect();
    const tr = topline?.getBoundingClientRect();
    const titleRect = title?.getBoundingClientRect();
    const ir = item?.getBoundingClientRect();
    return {
      topBeforeTitle:!!tr && !!titleRect && tr.bottom <= titleRect.top + 2,
      titleCentered:!!pr && !!titleRect && Math.abs((titleRect.left + titleRect.right) / 2 - (pr.left + pr.right) / 2) < 24,
      itemVisible:!!ir && ir.left >= 0 && ir.right <= window.innerWidth && ir.top >= 0 && ir.bottom <= window.innerHeight
    };
  });
  expect(layout.topBeforeTitle).toBe(true);
  expect(layout.titleCentered).toBe(true);
  expect(layout.itemVisible).toBe(true);
  await page.locator(".sort-choice-item").first().click();
  await page.getByTestId("zone-card-confirm").click();
  const result = await page.evaluate(() => window.__batch10ModalPromise);
  expect(result.success).toBe(true);
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
  expect(spells.audit.state.events.filter(event => event.type === "card-arrival-animation" && event.reason === "code-couleurs-copy").length).toBe(2);
  expect(spells.reunion.summoned.filter(item => item.success).length).toBeGreaterThan(0);
  expect(spells.afterReunion.servants).toBeGreaterThan(spells.initial.servants);
  expect(spells.audit.state.events.some(event => event.type === "summon-arrival-pulse" && event.reason === "reunion-arrival")).toBe(true);

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
  expect(vollee.result.summoned.every(item => item.success)).toBe(true);

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
  expect(ley.result.after.hand).toEqual(ley.after.handIds);
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
  expect(result.notices.join(" ")).toContain("MACHIAVÉLISME RENFORCE VOS VENGEANCES JUSQU'À LA FIN DU TOUR");
  expect(result.notices.join(" ")).not.toContain("ajoute 2 dégâts à la Vengeance");
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
    const reductionTarget = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000002");
    batch03UpdateStats(reductionTarget, {pdvMax:8, pdv:8});
    const reductionBefore = Number(reductionTarget.dataset.pdv || 0);
    await tryApplyAbilityDamage({sourcePlayer:player1, targetFC:reductionTarget, sourceCardId:"test", amount:3, bypassInsensitive:true});
    const reductionAfterCopy = Number(reductionTarget.dataset.pdv || 0);
    const firstReduction = [...collectionBatch10State.events].reverse().find(event => event.type === "damage-reduced");
    await sendToCemetery(fauxCard, {suppressVengeance:true});
    const postReleaseTarget = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000016");
    batch03UpdateStats(postReleaseTarget, {pdvMax:8, pdv:8});
    const reductionBeforeRelease = Number(postReleaseTarget.dataset.pdv || 0);
    await tryApplyAbilityDamage({sourcePlayer:player1, targetFC:postReleaseTarget, sourceCardId:"test", amount:3, bypassInsensitive:true});
    const reductionAfterRelease = Number(postReleaseTarget.dataset.pdv || 0);
    const secondReduction = [...collectionBatch10State.events].reverse().find(event => event.type === "damage-reduced" && event !== firstReduction);
    const trollRempart = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "TRL000010");
    if (!trollRempart) throw new Error("missing trollRempart TRL000010");
    const master = await summonBatch03Servant(player1, "GOB000017", {sourceCardId:"test", triggerInitiativeEffect:false, ready:true});
    const masterCard = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000017");
    if (!masterCard) throw new Error("missing master GOB000017");
    const masterInitiative = await triggerInitiative("GOB000017", player1, {sourceInstanceId:masterCard.dataset.instance, selectedTargetIds:[trollRempart.dataset.instance]});
    const stolen = masterCard.dataset.batch10StolenKeywords || "";
    const targetAfterSteal = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "TRL000010");
    const enemyTopBefore = player2.drawPile.slice(-4);
    const clever = await summonBatch03Servant(player1, "GOB000018", {sourceCardId:"test", triggerInitiativeEffect:false, ready:true});
    const cleverCard = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000018");
    if (!cleverCard) throw new Error("missing clever GOB000018");
    const cleverInitiative = await triggerInitiative("GOB000018", player1, {sourceInstanceId:cleverCard.dataset.instance, zoneSelection:{selectedIndex:player2.drawPile.length - 4}});
    const enemyBottomAfter = player2.drawPile[0];
    const target = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000002") || livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000013");
    const decoy = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000016");
    if (!target) throw new Error("missing allied Goblin target for Casse-cou");
    if (!decoy) throw new Error("missing decoy GOB000016");
    batch03UpdateStats(target, {pdvMax:1, pdv:1});
    const targetBefore = Number(target.dataset.pdv || 0);
    const decoyBefore = Number(decoy.dataset.pdv || 0);
    await tryApplyAbilityDamage({sourcePlayer:player2, targetFC:target, sourceCardId:"H000001", amount:2, bypassInsensitive:true});
    const redirectState = {targetAfter:Number(target.dataset.pdv || 0), decoyAfter:Number(decoy.dataset.pdv || 0), used:decoy.dataset.batch10CasseCouUsedTurn === String(turnSequence)};
    const mageDeGuerre = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000007");
    if (!mageDeGuerre) throw new Error("missing Mage de guerre H000007");
    const secondMaster = await summonBatch03Servant(player1, "GOB000017", {sourceCardId:"test", triggerInitiativeEffect:false, ready:true});
    const secondMasterCard = secondMaster.instanceId ? document.querySelector('.fc[data-instance="' + secondMaster.instanceId + '"]') : livingServantCardsForPlayer(player1).filter(fc => fc.dataset.id === "GOB000017").at(-1);
    const mageBeforeKeywords = batch10LinkedKeywordList(mageDeGuerre);
    const secondMasterInitiative = await triggerInitiative("GOB000017", player1, {sourceInstanceId:secondMasterCard.dataset.instance, selectedTargetIds:[mageDeGuerre.dataset.instance]});
    const mageAfterKeywords = batch10LinkedKeywordList(mageDeGuerre);
    openCardPreview("H000007", {sourceElement:mageDeGuerre, sourceType:"board"});
    const suppressedVisual = Array.from(document.querySelectorAll('.batch10-stolen-keyword')).map(el => ({text:el.textContent.trim(), decoration:getComputedStyle(el).textDecorationLine, color:getComputedStyle(el).color}));
    openCardPreview("GOB000017", {sourceElement:secondMasterCard, sourceType:"board"});
    const stolenVisual = Array.from(document.querySelectorAll('.batch10-goblin-keyword')).map(el => ({text:el.textContent.trim(), color:getComputedStyle(el).color}));
    return {faux, fauxInitiative, fauxState, fauxMouleReduction:{reductionBefore, reductionAfterCopy, reductionBeforeRelease, reductionAfterRelease, firstReduction, secondReduction}, master, masterInitiative, stolen, targetAfterSteal:targetSummary(targetAfterSteal), mageTheft:{secondMaster, secondMasterInitiative, beforeKeywords:mageBeforeKeywords, afterKeywords:mageAfterKeywords, stolen:secondMasterCard.dataset.batch10StolenKeywords || "", suppressed:mageDeGuerre.dataset.batch10SuppressedKeywords || "", suppressedVisual, stolenVisual}, enemyTopBefore, clever, cleverInitiative, enemyBottomAfter, targetBefore, decoyBefore, redirectState, audit:auditCollectionBatch10Runtime()};
  });
  await openScenario(page, "collection-batch-10-special");
  const tyranResult = await page.evaluate(async () => {
    const tyranSummon = await summonBatch03Servant(player1, "GOB000019", {sourceCardId:"test", triggerInitiativeEffect:false, ready:true});
    const tyranBefore = {hand:player1.hand.length, deck:player1.drawPile.length, grave:player1.graveyard.length, servants:livingServantCardsForPlayer(player1).length};
    const tyran = await resolveBatch10TyranDePoche(player1, "draw");
    const tyranAfter = {hand:player1.hand.length, deck:player1.drawPile.length, grave:player1.graveyard.length, servants:livingServantCardsForPlayer(player1).length};
    return {tyranSummon, tyranBefore, tyran, tyranAfter, audit:auditCollectionBatch10Runtime()};
  });
  await openScenario(page, "collection-batch-10-special");
  const tyranDamage = await page.evaluate(async () => {
    const tyranSummon = await summonBatch03Servant(player1, "GOB000019", {sourceCardId:"test", triggerInitiativeEffect:false, ready:true});
    const tyran = tyranSummon.instanceId ? document.querySelector('.fc[data-instance="' + tyranSummon.instanceId + '"]') : livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000019");
    const sacrifice = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000002");
    const enemy = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000001");
    batch03UpdateStats(enemy, {pdvMax:8, pdv:8});
    const before = {enemyPdv:Number(enemy.dataset.pdv || 0), grave:player1.graveyard.length, servants:livingServantCardsForPlayer(player1).length};
    const result = await resolveBatch10TyranDePoche(player1, "damage", {sourceInstanceId:tyran.dataset.instance, sacrificeInstanceId:sacrifice.dataset.instance, targetInstanceId:enemy.dataset.instance});
    const after = {enemyPdv:Number(enemy.dataset.pdv || 0), grave:player1.graveyard.length, servants:livingServantCardsForPlayer(player1).length};
    return {tyranSummon, before, result, after, audit:auditCollectionBatch10Runtime()};
  });
  await openScenario(page, "collection-batch-10-special");
  const tyranBuff = await page.evaluate(async () => {
    const tyranSummon = await summonBatch03Servant(player1, "GOB000019", {sourceCardId:"test", triggerInitiativeEffect:false, ready:true});
    const tyran = tyranSummon.instanceId ? document.querySelector('.fc[data-instance="' + tyranSummon.instanceId + '"]') : livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000019");
    const sacrifice = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000002");
    const before = {atk:Number(tyran.dataset.atk || 0), pdv:Number(tyran.dataset.pdv || 0), pdvMax:Number(tyran.dataset.pdvMax || 0), grave:player1.graveyard.length, servants:livingServantCardsForPlayer(player1).length};
    const result = await resolveBatch10TyranDePoche(player1, "buff", {sourceInstanceId:tyran.dataset.instance, sacrificeInstanceId:sacrifice.dataset.instance});
    const after = {atk:Number(tyran.dataset.atk || 0), pdv:Number(tyran.dataset.pdv || 0), pdvMax:Number(tyran.dataset.pdvMax || 0), rempart:tyran.dataset.rempart === "1", text:batch03DynamicStatusTexts(tyran).join(" ")};
    cleanTurnState(player1);
    syncBatch05Passives();
    const afterCleanup = {atk:Number(tyran.dataset.atk || 0), pdv:Number(tyran.dataset.pdv || 0), pdvMax:Number(tyran.dataset.pdvMax || 0), rempart:tyran.dataset.rempart === "1", text:batch03DynamicStatusTexts(tyran).join(" ")};
    return {tyranSummon, before, result, after, afterCleanup, audit:auditCollectionBatch10Runtime()};
  });
  await openScenario(page, "collection-batch-10-special");
  const tyranNoTargetRefusal = await page.evaluate(async () => {
    const tyranSummon = await summonBatch03Servant(player1, "GOB000019", {sourceCardId:"test", triggerInitiativeEffect:false, ready:true});
    const tyran = tyranSummon.instanceId ? document.querySelector('.fc[data-instance="' + tyranSummon.instanceId + '"]') : livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000019");
    for (const fc of [...livingServantCardsForPlayer(player1)]) if (fc !== tyran) await sendToCemetery(fc, {suppressVengeance:true});
    const before = {grave:player1.graveyard.length, servants:livingServantCardsForPlayer(player1).length, hand:player1.hand.length, deck:player1.drawPile.length, resources:JSON.parse(JSON.stringify(player1.resources || {}))};
    const result = await resolveBatch10TyranDePoche(player1, "buff", {sourceInstanceId:tyran.dataset.instance});
    const after = {grave:player1.graveyard.length, servants:livingServantCardsForPlayer(player1).length, hand:player1.hand.length, deck:player1.drawPile.length, resources:JSON.parse(JSON.stringify(player1.resources || {}))};
    return {tyranSummon, before, result, after, audit:auditCollectionBatch10Runtime()};
  });
  await openScenario(page, "collection-batch-10-special");
  const tyranRefusal = await page.evaluate(async () => {
    const tyranSummon = await summonBatch03Servant(player1, "GOB000019", {sourceCardId:"test", triggerInitiativeEffect:false, ready:true});
    const tyran = tyranSummon.instanceId ? document.querySelector('.fc[data-instance="' + tyranSummon.instanceId + '"]') : livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000019");
    const before = {grave:player1.graveyard.length, servants:livingServantCardsForPlayer(player1).length, hand:player1.hand.length, deck:player1.drawPile.length};
    const result = await resolveBatch10TyranDePoche(player1, "draw", {sourceInstanceId:tyran.dataset.instance, sacrificeInstanceId:tyran.dataset.instance});
    const after = {grave:player1.graveyard.length, servants:livingServantCardsForPlayer(player1).length, hand:player1.hand.length, deck:player1.drawPile.length};
    return {tyranSummon, before, result, after, audit:auditCollectionBatch10Runtime()};
  });
  expect(result.faux.success).toBe(true);
  expect(result.fauxInitiative.success).toBe(true);
  expect(result.fauxState.atk).toBeGreaterThanOrEqual(1);
  expect(result.fauxState.rempart).toBe(true);
  expect(result.fauxState.granted).toContain("Rempart");
  expect(result.fauxMouleReduction.reductionAfterCopy).toBe(result.fauxMouleReduction.reductionBefore - 1);
  expect(result.fauxMouleReduction.firstReduction.reduction).toBe(2);
  expect(result.fauxMouleReduction.reductionAfterRelease).toBe(result.fauxMouleReduction.reductionBeforeRelease - 2);
  expect(result.fauxMouleReduction.secondReduction.reduction).toBe(1);
  expect(result.master.success).toBe(true);
  expect(result.masterInitiative.success).toBe(true);
  expect(result.stolen).toContain("Rempart");
  expect(result.targetAfterSteal.rempart).not.toBe(true);
  expect(result.audit.players[1].servants.find(card => card.id === "TRL000010").suppressed).toContain("Rempart");
  expect(result.mageTheft.secondMaster.success).toBe(true);
  expect(result.mageTheft.secondMasterInitiative.success).toBe(true);
  expect(result.mageTheft.beforeKeywords).toContain("Initiative");
  expect(result.mageTheft.stolen).not.toContain("Initiative");
  expect(result.mageTheft.suppressed).not.toContain("Initiative");
  expect(result.mageTheft.afterKeywords).toContain("Initiative");
  expect(result.mageTheft.stolen).toContain("Coup de glace");
  expect(result.mageTheft.stolen).toContain("Embrasement");
  expect(result.mageTheft.afterKeywords).not.toContain("Coup de glace");
  expect(result.mageTheft.afterKeywords).not.toContain("Embrasement");
  expect(result.mageTheft.suppressedVisual.map(item => item.text)).toEqual(expect.arrayContaining(["Coup de glace", "Embrasement"]));
  expect(result.mageTheft.suppressedVisual.every(item => item.decoration.includes("line-through"))).toBe(true);
  expect(result.mageTheft.stolenVisual.some(item => item.color === "rgb(255, 210, 63)")).toBe(true);
  expect(result.audit.state.events.some(event => event.type === "feedback-before-effect" && event.reason === "indiscretion-keyword-theft")).toBe(true);
  expect(result.audit.state.events.some(event => event.type === "linked-effects-released" && event.released?.some(item => item.type === "faux-jumeau"))).toBe(true);
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
  expect(tyranDamage.result.success).toBe(true);
  expect(tyranDamage.after.enemyPdv).toBe(tyranDamage.before.enemyPdv - 5);
  expect(tyranDamage.after.grave).toBe(tyranDamage.before.grave + 1);
  expect(tyranDamage.audit.state.events.some(event => event.type === "feedback-before-effect" && event.reason === "tyran-sacrifice")).toBe(true);
  expect(tyranBuff.result.success).toBe(true);
  expect(tyranBuff.after.atk).toBe(tyranBuff.before.atk + 1);
  expect(tyranBuff.after.pdvMax).toBe(tyranBuff.before.pdvMax + 3);
  expect(tyranBuff.after.rempart).toBe(true);
  expect(tyranBuff.after.text).toContain("Décret royal");
  expect(tyranBuff.after.text).not.toContain("temporairement");
  expect(tyranBuff.afterCleanup.atk).toBe(tyranBuff.after.atk);
  expect(tyranBuff.afterCleanup.pdvMax).toBe(tyranBuff.after.pdvMax);
  expect(tyranBuff.afterCleanup.rempart).toBe(true);
  expect(tyranNoTargetRefusal.result.success).toBe(false);
  expect(tyranNoTargetRefusal.result.reason).toBe("missing-sacrifice");
  expect(tyranNoTargetRefusal.after).toEqual(tyranNoTargetRefusal.before);
  expect(tyranRefusal.result.success).toBe(false);
  expect(tyranRefusal.result.reason).toBe("self-sacrifice-forbidden");
  expect(tyranRefusal.after).toEqual(tyranRefusal.before);
  expect(result.audit.state.events.some(event => event.type === "faux-jumeau-copy")).toBe(true);
  expect(result.audit.state.events.some(event => event.type === "indiscretion-keywords")).toBe(true);
  expect(result.audit.state.events.some(event => event.type === "petit-fute-deck-order")).toBe(true);
  expect(result.audit.state.events.some(event => event.type === "casse-cou-redirect")).toBe(true);
  expect(tyranResult.audit.state.events.some(event => event.type === "tyran-de-poche")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
