import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-09-trolls.json", import.meta.url), "utf8"));
const signatures = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-effect-signatures.json", import.meta.url), "utf8"));

const SCENARIOS = [
  "collection-batch-09-trolls",
  "collection-batch-09-initiatives",
  "collection-batch-09-combat",
  "collection-batch-09-magic",
  "collection-batch-09-protectroll",
  "collection-batch-09-tempo",
  "collection-batch-09-ossements",
  "collection-batch-09-instabilite",
  "collection-batch-09-amasseur",
  "collection-batch-09-vengeance",
  "collection-batch-09-faveurs-sorts"
];

async function openScenario(page, scenario) {
  await page.goto("/code/partie-test-1.html?scenario=" + scenario + "&batch09=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForSelector(".history.vis", {timeout: 20000});
  await page.waitForTimeout(150);
}

function diagnosticsFor(page) { return attachPageDiagnostics(page); }
function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message =>
    !/Failed to load resource: the server responded with a status of 404/i.test(message)
    && !/Failed to load resource: net::ERR_(NETWORK_CHANGED|NAME_NOT_RESOLVED)/i.test(message)
  );
}
function byId(items) { return new Map(items.map(item => [item.id, item])); }

async function playFromHand(page, cardId) {
  return page.evaluate(async (id) => {
    const slot = qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot");
    return await playCard(id, slot, {returnValidation:true});
  }, cardId);
}

test("Batch-09 technical scenarios stay hidden, focused, and expose Troll runtime cards", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  const signaturesById = byId(signatures.signatures);
  const seen = new Set();
  for (const scenario of SCENARIOS) {
    await openScenario(page, scenario);
    const audit = await page.evaluate((input) => {
      const runtime = auditCollectionBatch09Runtime();
      const zones = runtime.players.flatMap(player => [...player.hand, ...player.deck, ...player.graveyard, ...player.servants.map(card => card.id)]);
      return {
        scenarioId:selectedScenarioId(),
        publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + input.scenario + '"]').length,
        cards:input.ids.map(id => ({id, exists:!!CARDS_DATA[id], name:CARDS_DATA[id]?.name || "", text:CARDS_DATA[id]?.cap || "", keywords:[...(CARDS_DATA[id]?.kws || [])]})),
        runtime,
        zones,
        boardSizes:runtime.players.map(player => player.servants.length),
        images:Array.from(document.querySelectorAll('.fc img,.hc img')).filter(img => (img.getAttribute('src') || '').includes('../assets/')).slice(0, 12).map(img => ({src:img.getAttribute('src') || '', width:img.naturalWidth}))
      };
    }, {scenario, ids:fixture.cardIds});
    expect(audit.scenarioId).toBe(scenario);
    expect(audit.publicOptionCount, scenario + " public option").toBe(0);
    expect(audit.cards.every(card => card.exists), JSON.stringify(audit.cards.filter(card => !card.exists))).toBe(true);
    expect(Math.max(...audit.boardSizes), scenario + " avoids full-board visual start").toBeLessThan(7);
    for (const id of audit.zones) seen.add(id);
    for (const probe of audit.images) expect(probe.width, probe.src).toBeGreaterThan(0);
  }
  for (const id of fixture.cardIds) expect(signaturesById.get(id), id + " signature").toBeTruthy();
  for (const id of ["TRL000001","TRL000002","TRL000003","TRL000004","TRL000005","TRL000006","TRL000007","TRL000008","TRL000009","TRL000010","TRL000011","TRL000012","TRL000013","TRL000014","TRL000015","TRL000016","TRL000017","TRL000018","TRL000019","TRL000020","PRST000004","PRST000005","R000026","S000046","S000048"]) expect(seen.has(id), id + " visible in at least one technical scenario").toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Troll public text uses numeric highlights and Troll instable exposes four ability tooltips", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-09-tempo");
  const result = await page.evaluate(() => ({
    devoreKeywords:CARDS_DATA.TRL000009.kws,
    twoHeads:CARDS_DATA.TRL000012.detail,
    firstBorn:CARDS_DATA.TRL000014.detail,
    instableCap:CARDS_DATA.TRL000017.cap,
    instableTooltips:CARDS_DATA.TRL000017.extraTooltips,
    zarrach:CARDS_DATA.PRST000004.cap,
    mugwa:CARDS_DATA.PRST000005.cap,
    caCasseFormatted:formatPlayerFacingCardText(CARDS_DATA.S000046.cap),
    hordeFormatted:formatPlayerFacingCardText(CARDS_DATA.S000048.cap),
    trollNainFormatted:formatPlayerFacingCardText(CARDS_DATA.TRL000015.cap),
    umpFormatted:formatPlayerFacingCardText(CARDS_DATA.TRL000020.cap)
  }));
  expect(result.devoreKeywords).not.toContain("Insensible");
  expect(result.twoHeads).toContain("serviteur adjacent choisi");
  expect(result.twoHeads).not.toContain("pricipale");
  expect(result.firstBorn).not.toMatch(/ID\s*=|TRL000001|TRL000003/);
  expect(result.instableCap).toBe("Au début de chacun de vos tours, cette carte adopte aléatoirement *1* comportement jusqu'à la fin du tour.");
  expect(result.instableTooltips.map(t => t.title)).toEqual(["COMPÉTENCE 1","COMPÉTENCE 2","COMPÉTENCE 3","COMPÉTENCE 4"]);
  expect(result.instableTooltips.map(t => t.text)).toEqual([
    "Gagne +5 ATK jusqu'à votre prochain tour.",
    "Gagne +5 PDV jusqu'à votre prochain tour.",
    "Obtient temporairement [Rempart] mais ne peut plus attaquer jusqu'à votre prochain tour.",
    "Inflige 3 points de dégâts à 1 autre serviteur allié aléatoire puis vous fait piocher 1 carte."
  ]);
  expect(result.zarrach).toContain("*1* serviteur");
  expect(result.mugwa).toContain("*3*");
  expect(result.caCasseFormatted).toContain('<strong class="kv">1</strong>');
  expect(result.caCasseFormatted).toContain('<strong class="kv">4 PDV</strong>');
  expect(result.hordeFormatted).toContain('<strong class="kv">+1 ATK</strong>');
  expect(result.hordeFormatted).toContain('<strong class="kv">+1 PDV</strong>');
  expect(result.trollNainFormatted).toContain('<strong class="kv">+2 ATK</strong>');
  expect(result.trollNainFormatted).toContain('<strong class="kv">+2 PDV</strong>');
  expect(result.umpFormatted).toContain('<strong class="kv">4 PDV</strong>');
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Faveurs, Cache de gros cailloux, Grande horde and S000046 resolve with exact public contracts", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-09-faveurs-sorts");
  const result = await page.evaluate(async () => {
    const costTotal = id => resolveCardCost({player:player1, cardId:id})?.effectiveCost?.total ?? null;
    const before = {giant:costTotal("TRL000019"), twelve:costTotal("TRL000012"), cache:supplyDefinition("R000026")?.production?.vector || {}, hand:player1.hand.length, deck:player1.drawPile.length};
    const mugwa = await triggerSort("PRST000005", player1);
    const giantCost = resolveCardCost({player:player1, cardId:"TRL000019"})?.effectiveCost;
    const twelveCost = resolveCardCost({player:player1, cardId:"TRL000012"})?.effectiveCost;
    const afterMugwa = {
      giant:costTotal("TRL000019"),
      twelve:costTotal("TRL000012"),
      giantRequirements:giantCost?.requirements || [],
      twelveRequirements:twelveCost?.requirements || [],
      foodRequirement:(twelveCost?.requirements || []).filter(req => req.resource === "nourriture").length,
      message:document.querySelector("#notif")?.textContent || ""
    };
    const horde = await triggerSort("S000048", player1);
    const hordeMessage = document.querySelector("#notif")?.textContent || "";
    const troll = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000006");
    const gob = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "GOB000001");
    const orc = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "ORC000001");
    const statClass = fc => ({atk:fc.querySelector(".fc-atk-val")?.className || "", pdv:fc.querySelector(".fc-pdv-val")?.className || ""});
    const afterHorde = {hand:player1.hand.length, deck:player1.drawPile.length, troll:targetSummary(troll), gob:targetSummary(gob), orc:targetSummary(orc), classes:{troll:statClass(troll), gob:statClass(gob), orc:statClass(orc)}, sources:{troll:troll.dataset.batch05PassiveSources || "", gob:gob.dataset.batch05PassiveSources || "", orc:orc.dataset.batch05PassiveSources || ""}};
    await triggerSort("PRST000004", player1);
    const handBeforeDeath = player1.hand.length;
    await sendToCemetery(gob);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const handAfterDeath = player1.hand.length;
    const zarrachAnimated = Array.from(document.querySelectorAll('.hc[data-batch09-hand-animation="batch09-zarrach-hand-added"]')).map(card => card.dataset.id);
    const casseTarget = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000006");
    const enemiesBefore = livingServantCardsForPlayer(player2).length;
    window.__collectionBatch09RandomQueue = [0, 0, 0.75, 0, 0.25, 0, 0.5, 0, 0.99];
    const casse = await triggerSort("S000046", player1, {selectedTargetIds:[casseTarget.dataset.instance]});
    const lastPublicMessage = document.querySelector("#notif")?.textContent || document.body.textContent;
    return {before, mugwa, afterMugwa, horde, hordeMessage, afterHorde, handBeforeDeath, handAfterDeath, zarrachAnimated, casse, enemiesBefore, enemiesAfter:livingServantCardsForPlayer(player2).length, lastPublicMessage, events:auditCollectionBatch09Runtime().state.events};
  });
  expect(result.before.cache.pierre).toBe(3);
  expect(result.before.cache.fer).toBe(2);
  expect(result.afterMugwa.giant).toBe(3);
  expect(result.afterMugwa.twelve).toBe(3);
  expect(result.afterMugwa.foodRequirement).toBe(0);
  expect(result.afterMugwa.message).toContain("Mugwa remplit le ventre de ses enfants ! Trolls, plus faim !");
  expect(result.afterMugwa.giantRequirements).toEqual(expect.arrayContaining([expect.objectContaining({resource:"pierre", amount:3})]));
  expect(result.afterMugwa.twelveRequirements).toEqual(expect.arrayContaining([expect.objectContaining({
    kind:"oneOf",
    options:expect.arrayContaining([expect.objectContaining({resource:"lenya", amount:3})])
  })]));
  expect(result.horde.drawn).toBe(2);
  expect(result.hordeMessage).toContain("Vos serviteurs trolls, orcs et gobelins se battent sous la bannière de la horde !");
  expect(result.afterHorde.hand).toBe(result.before.hand + 2);
  expect(result.afterHorde.deck).toBe(result.before.deck - 2);
  expect(result.afterHorde.troll.pdvMax).toBeGreaterThan(5);
  expect(result.afterHorde.gob.pdvMax).toBeGreaterThan(0);
  expect(result.afterHorde.orc.atk).toBeGreaterThan(0);
  expect(result.afterHorde.classes.troll.pdv).toContain("grn");
  expect(result.afterHorde.classes.gob.pdv).toContain("grn");
  expect(result.afterHorde.classes.orc.atk).toContain("grn");
  expect(result.handAfterDeath).toBe(result.handBeforeDeath + 1);
  expect(result.zarrachAnimated.length).toBeGreaterThan(0);
  expect(result.events.some(event => event.type === "zarrach-death-trigger")).toBe(true);
  expect(result.casse.success).toBe(true);
  expect(result.casse.rounds).toBeGreaterThan(0);
  expect(result.casse.roundResults.some(round => (round.followUps || []).some(item => item.type === "balayeur-adjacent"))).toBe(true);
  expect(result.casse.roundResults.filter(round => round.heal).every(round => round.heal.amount >= 1 && round.heal.amount <= 4)).toBe(true);
  expect(result.enemiesAfter).toBeLessThanOrEqual(result.enemiesBefore);
  expect(result.lastPublicMessage).not.toMatch(/attaque\(s\) résolue\(s\)/i);
  expect(result.events.some(event => event.type === "combat-feedback-before-attack" && event.forcedBy === "S000046")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Troll initiatives are played from hand and mutate board, stats, summons and graveyards", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-09-initiatives");
  const result = await page.evaluate(async () => {
    const before = {hand:[...player1.hand], enemy:livingServantCardsForPlayer(player2).length, p1Grave:player1.graveyard.length, p2Grave:player2.graveyard.length};
    window.__mythesRandom = () => 0;
    const play = async id => await playCard(id, qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot"), {returnValidation:true});
    const hoarder = await play("TRL000018");
    const hoarderFc = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000018");
    const siege = await play("TRL000004");
    player1.resourceState.classical.pierre = Math.max(Number(player1.resourceState.classical.pierre || 0), 3);
    const stone = await play("TRL000005");
    const stoneFc = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000005");
    cardsPlayedThisTurn = 0;
    const lance = await play("TRL000008");
    const stoneClasses = {atk:stoneFc.querySelector(".fc-atk-val")?.className || "", pdv:stoneFc.querySelector(".fc-pdv-val")?.className || ""};
    const hoarderClasses = {atk:hoarderFc.querySelector(".fc-atk-val")?.className || "", pdv:hoarderFc.querySelector(".fc-pdv-val")?.className || ""};
    return {before, siege, stone, stoneFc:targetSummary(stoneFc), stoneClasses, lance, goblins:livingServantCardsForPlayer(player1).filter(fc => CARDS_DATA[fc.dataset.id]?.fac === "gob").map(targetSummary), hoarder, hoarderFc:targetSummary(hoarderFc), hoarderClasses, hand:[...player1.hand], enemy:livingServantCardsForPlayer(player2).length, p1Grave:player1.graveyard.length, p2Grave:player2.graveyard.length, events:auditCollectionBatch09Runtime().state.events};
  });
  expect(result.hand).not.toContain("TRL000004");
  expect(result.hand).not.toContain("TRL000005");
  expect(result.hand).not.toContain("TRL000008");
  expect(result.hand).not.toContain("TRL000018");
  expect(result.enemy).toBeLessThan(result.before.enemy);
  expect(result.stoneFc.atk + result.stoneFc.pdvMax).toBeGreaterThan(8);
  expect(result.stoneClasses.atk + result.stoneClasses.pdv).toContain("grn");
  expect(result.goblins.length).toBeGreaterThan(0);
  expect(result.hoarderFc.atk).toBeGreaterThan(2);
  expect(result.hoarderClasses.atk).toContain("grn");
  expect(result.hoarderClasses.pdv).toContain("grn");
  expect(result.hoarder.initiativeResult.stored).toHaveLength(3);
  for (const type of ["siege-troll-initiative","stone-skin-initiative","lance-gobelin-initiative","cadaver-hoarder-initiative"]) expect(result.events.some(event => event.type === type), type).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Combat Trolls apply adjacent damage, ignore Rempart, attach Troll-nain, and heal Ump on kill", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-09-combat");
  const result = await page.evaluate(async () => {
    const snapshot = () => ({hand:[...player1.hand], servants:livingServantCardsForPlayer(player1).map(targetSummary), enemies:livingServantCardsForPlayer(player2).map(targetSummary), grave:[...player1.graveyard].map(getRuntimeCardId)});
    const balayeur = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000006");
    const brise = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000011");
    const two = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000012");
    const ump = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000020");
    const target = livingServantCardsForPlayer(player2)[1];
    const beforeBalayeur = snapshot();
    const planBalayeur = batch09CombatPlan(balayeur, target, Number(balayeur.dataset.atk || 0));
    await prepareBatch09CombatFeedback(balayeur, target, {phase:"attack", damage:planBalayeur.damage, adjacentTargets:planBalayeur.adjacentTargets, rempartBonus:planBalayeur.rempartBonus});
    target._killer = balayeur;
    const diedBalayeur = await applyDamage(target, planBalayeur.damage);
    await resolveBatch09CombatDamageDealtEffects(balayeur, target, {phase:"attack", targetDied:diedBalayeur, adjacentTargets:planBalayeur.adjacentTargets});
    const afterBalayeur = snapshot();
    const rempartTarget = livingServantCardsForPlayer(player2).find(fc => fc.dataset.rempart === "1");
    const brisePlan = batch09CombatPlan(brise, rempartTarget, Number(brise.dataset.atk || 0));
    await prepareBatch09CombatFeedback(brise, rempartTarget, {phase:"attack", damage:brisePlan.damage, adjacentTargets:brisePlan.adjacentTargets, rempartBonus:brisePlan.rempartBonus});
    rempartTarget._killer = brise;
    const briseDied = await applyDamage(rempartTarget, brisePlan.damage);
    await resolveBatch09CombatDamageDealtEffects(brise, rempartTarget, {phase:"attack", targetDied:briseDied, adjacentTargets:brisePlan.adjacentTargets});
    const attachTarget = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000012");
    const beforeAttach = targetSummary(attachTarget);
    const attach = await playCard("TRL000015", null, {selectedTargetIds:[attachTarget.dataset.instance], returnValidation:true});
    const afterAttach = targetSummary(attachTarget);
    const attachClasses = {atk:attachTarget.querySelector(".fc-atk-val")?.className || "", pdv:attachTarget.querySelector(".fc-pdv-val")?.className || ""};
    const attachPreview = batch03PreviewCardData(attachTarget.dataset.id, CARDS_DATA[attachTarget.dataset.id], {sourceElement:attachTarget}).cap;
    await sendToCemetery(attachTarget);
    const afterDeath = snapshot();
    window.__mythesRandom = () => 0;
    const weak = livingServantCardsForPlayer(player2).find(fc => fc.dataset.pdv !== "0") || livingServantCardsForPlayer(player2)[0];
    if (weak) batch03UpdateStats(weak, {pdv:1, pdvMax:Number(weak.dataset.pdvMax || 1)});
    const umpBefore = targetSummary(ump);
    if (weak) { weak._killer = ump; const died = await applyDamage(weak, Number(ump.dataset.atk || 0)); await resolveBatch09CombatDamageDealtEffects(ump, weak, {phase:"attack", targetDied:died}); }
    const umpAfterKill = targetSummary(ump);
    const handBeforeRune = [...player1.hand];
    ump._killer = livingServantCardsForPlayer(player2)[0] || null;
    const umpReturned = await applyDamage(ump, 99);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const runeBlock = (player1.batch03BlockedHandOccurrences || []).find(entry => entry.cardId === "TRL000020") || null;
    return {beforeBalayeur, afterBalayeur, brisePlan, attach, beforeAttach, afterAttach, attachClasses, attachPreview, afterDeath, umpBefore, umpAfter:umpAfterKill, handBeforeRune, umpReturned, runeHand:[...player1.hand], runeBlock, events:auditCollectionBatch09Runtime().state.events};
  });
  expect(result.afterBalayeur.enemies.some(after => {
    const before = result.beforeBalayeur.enemies.find(card => card.instance === after.instance);
    return before && after.id !== result.beforeBalayeur.enemies[1]?.id && after.pdv < before.pdv;
  })).toBe(true);
  expect(result.brisePlan.rempartBonus).toBe(true);
  expect(result.brisePlan.damage).toBe(10);
  expect(result.attach.success).toBe(true);
  expect(result.afterAttach.atk).toBe(result.beforeAttach.atk + 2);
  expect(result.afterAttach.pdvMax).toBe(result.beforeAttach.pdvMax + 2);
  expect(result.attachClasses.atk).toContain("grn");
  expect(result.attachClasses.pdv).toContain("grn");
  expect(result.attachPreview).toContain("Bénéficie du renforcement d'un Troll-nain, petit mais costaud !");
  expect(result.afterDeath.hand).toContain("TRL000015");
  expect(result.umpAfter.pdv).toBeGreaterThanOrEqual(result.umpBefore.pdv);
  expect(result.umpBefore.pdvMax).toBe(9);
  expect(result.umpReturned).toBe(true);
  expect(result.runeHand).toContain("TRL000020");
  expect(result.runeHand.length).toBe(result.handBeforeRune.length + 1);
  expect(result.runeBlock).toEqual(expect.objectContaining({cardId:"TRL000020", sourceName:"Serviteur de la rune", armed:true}));
  expect(result.events.some(event => event.type === "combat-feedback-before-attack" && event.results?.some(item => item.type === "balayeur-before-attack"))).toBe(true);
  expect(result.events.some(event => event.type === "combat-feedback-before-attack" && event.results?.some(item => item.type === "brise-rempart-before-attack"))).toBe(true);
  expect(result.events.some(event => event.type === "combat-effects")).toBe(true);
  expect(result.events.some(event => event.type === "combat-effects" && event.results?.some(item => item.type === "brise-rempart-bonus"))).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Devore-magie exposes S000056 scenario cards and reacts only to direct magical hits", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-09-magic");
  const result = await page.evaluate(async () => {
    const devore = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "TRL000009");
    const handIds = [...player1.hand];
    const before = targetSummary(devore);
    await tryApplyAbilityDamage({sourcePlayer:player1, sourceCardId:"H000001", targetFC:devore, amount:1, bypassInsensitive:true});
    const afterNonSpell = targetSummary(devore);
    applyHeal(devore, 1);
    const snapshots = [];
    for (let i = 0; i < 3; i++) {
      await tryApplyAbilityDamage({sourcePlayer:player1, sourceCardId:"S000056", targetFC:devore, amount:1, bypassInsensitive:true, directSpellDamage:true});
      snapshots.push(targetSummary(devore));
    }
    const previewData = batch03PreviewCardData("TRL000009", CARDS_DATA.TRL000009, {sourceElement:devore});
    return {handIds, before, afterNonSpell, snapshots, final:targetSummary(devore), previewText:previewData.cap, statClass:devore.querySelector(".fc-atk-val")?.className || "", counters:Array.from(devore.querySelectorAll('[data-batch03-status-counter]')).map(node => ({key:node.dataset.batch03StatusCounter, text:node.textContent, className:node.className})), events:auditCollectionBatch09Runtime().state.events};
  });
  expect(result.handIds.filter(id => id === "S000056")).toHaveLength(3);
  expect(result.afterNonSpell.batch09DevoreMagicMarkers).toBe(0);
  expect(result.snapshots.map(card => card.batch09DevoreMagicMarkers)).toEqual([1,2,3]);
  expect(result.final.batch09DevoreMagicSpent).toBe(true);
  expect(result.final.insensible).toBe(true);
  expect(result.final.atk).toBe(result.before.atk + 3);
  expect(result.statClass).toContain("grn");
  expect(result.previewText).toBe("[Insensible]");
  expect(result.counters.some(counter => counter.key === "devore-magie" && counter.text === "3")).toBe(true);
  expect(result.events.filter(event => event.type === "damage-received-hooks").some(event => event.results?.some(result => result.type === "devore-magic"))).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Protectroll, Troll Sang-furieux and Troll instable keep visual passive state coherent", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-09-protectroll");
  const protectroll = await page.evaluate(async () => {
    syncBatch05Passives();
    const protectrollCard = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000010");
    const beforeAvatar = avatarHitPoints(player1);
    const result = applyAvatarEffectDamage(player1, 4, {sourceCardId:"TEST"});
    return {beforeAvatar, afterAvatar:avatarHitPoints(player1), result, passivePulse:protectrollCard?.dataset?.batch03PassivePulse === "1", pulseReason:protectrollCard?.dataset?.batch03LastPulseReason || ""};
  });
  expect(protectroll.result.reduction).toBe(1);
  expect(protectroll.afterAvatar).toBe(protectroll.beforeAvatar - 3);
  expect(protectroll.passivePulse).toBe(true);
  expect(protectroll.pulseReason).toBe("batch05-passive");

  await openScenario(page, "collection-batch-09-tempo");
  const tempo = await page.evaluate(async () => {
    const fury = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000016");
    const instable = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000017");
    const furyBefore = targetSummary(fury);
    await resolveBatch09StartTurnEffects(player1);
    syncBatch05Passives();
    const afterOne = targetSummary(fury);
    window.__mythesRandom = () => 0.5;
    await resolveBatch09StartTurnEffects(player1);
    const previewData = batch03PreviewCardData("TRL000017", CARDS_DATA.TRL000017, {sourceElement:instable});
    const afterTwo = targetSummary(fury);
    const furyClasses = {atk:fury.querySelector(".fc-atk-val")?.className || "", counter:Array.from(fury.querySelectorAll('[data-batch03-status-counter]')).map(node => ({key:node.dataset.batch03StatusCounter, text:node.textContent, className:node.className}))};
    window.__mythesRandom = () => 0;
    await resolveBatch09StartTurnEffects(player1);
    const previewAtk = batch03PreviewCardData("TRL000017", CARDS_DATA.TRL000017, {sourceElement:instable});
    const furyCounter = fury.querySelector('[data-batch03-status-counter="sang-furieux"]');
    const furyCounterAfter = furyCounter ? getComputedStyle(furyCounter, "::after").content : "";
    return {furyBefore, afterOne, afterTwo, instable:targetSummary(instable), instableAtkClass:instable.querySelector(".fc-atk-val")?.className || "", previewText:previewData.cap, previewAtkText:previewAtk.cap, furyClasses, furyCounterAfter};
  });
  expect(tempo.afterOne.atk).toBe(tempo.furyBefore.atk + 3);
  expect(tempo.afterTwo.atk).toBe(tempo.furyBefore.atk + 6);
  expect(tempo.afterTwo.batch09FuryAtkBonus).toBe(6);
  expect(tempo.furyClasses.atk).toContain("grn");
  expect(tempo.furyClasses.counter.some(counter => counter.key === "sang-furieux" && counter.text === "2")).toBe(true);
  expect(tempo.furyClasses.counter.some(counter => counter.key === "sang-furieux" && counter.className.includes("batch03-status-counter"))).toBe(true);
  expect(["", "none", "normal", "\"\""]).toContain(tempo.furyCounterAfter);
  expect(tempo.previewText).toContain("Bénéficie temporairement de [Rempart]. Ne peut pas attaquer.");
  expect(tempo.instable.batch09InstableAtkBonus).toBe(5);
  expect(tempo.instableAtkClass).toContain("grn");
  expect(tempo.previewAtkText).toContain("Bénéficie temporairement d'un bonus d'attaque.");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Sorcier des ossements grants stable permanent max-health bonuses at full health", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-09-ossements");
  const result = await page.evaluate(async () => {
    const ids = ["H000001","TRL000007","H000005"];
    const cards = () => livingServantCardsForPlayer(player1).filter(fc => ids.includes(fc.dataset.id));
    const before = cards().map(targetSummary);
    const triggered = await resolveBatch09EndTurnEffects(player1);
    syncBatch05Passives();
    const afterFirstSync = cards().map(targetSummary);
    syncBatch05Passives();
    const afterSecondSync = cards().map(targetSummary);
    const classes = cards().map(fc => ({id:fc.dataset.id, pdv:fc.querySelector(".fc-pdv-val")?.className || ""}));
    return {before, triggered, afterFirstSync, afterSecondSync, classes, events:auditCollectionBatch09Runtime().state.events};
  });
  expect(result.triggered).toHaveLength(1);
  for (const after of result.afterFirstSync) {
    const before = result.before.find(card => card.instance === after.instance);
    expect(after.batch09BonePdvBonus, after.id).toBe(1);
    expect(after.pdvMax, after.id).toBe(before.pdvMax + 1);
  }
  expect(result.afterSecondSync).toEqual(result.afterFirstSync);
  expect(result.classes.every(card => card.pdv.includes("grn"))).toBe(true);
  expect(result.events.some(event => event.type === "bone-sorcerer-end-turn")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Troll instable exposes four behaviors, replaces previous state, and blocks attack on Rempart roll", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-09-instabilite");
  const result = await page.evaluate(async () => {
    const instable = () => livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000017");
    const ally = () => livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000001");
    const base = targetSummary(instable());
    window.__collectionBatch09RandomQueue = [0];
    await resolveBatch09StartTurnEffects(player1);
    const atkRoll = targetSummary(instable());
    window.__collectionBatch09RandomQueue = [0.26];
    await resolveBatch09StartTurnEffects(player1);
    const pdvRoll = targetSummary(instable());
    window.__collectionBatch09RandomQueue = [0.51];
    await resolveBatch09StartTurnEffects(player1);
    const rempartRoll = targetSummary(instable());
    tryAttack(instable());
    const rempartMessage = document.querySelector("#notif")?.textContent || document.body.textContent;
    window.__collectionBatch09RandomQueue = [0.76, 0];
    const handBeforeDraw = player1.hand.length;
    const allyBefore = targetSummary(ally());
    await resolveBatch09StartTurnEffects(player1);
    const drawDamageRoll = {instable:targetSummary(instable()), ally:targetSummary(ally()), hand:player1.hand.length, handBeforeDraw};
    return {base, atkRoll, pdvRoll, rempartRoll, rempartMessage, allyBefore, drawDamageRoll, preview:batch03PreviewCardData("TRL000017", CARDS_DATA.TRL000017, {sourceElement:instable()}).cap, events:auditCollectionBatch09Runtime().state.events};
  });
  expect(result.atkRoll.batch09InstableAtkBonus).toBe(5);
  expect(result.pdvRoll.batch09InstableAtkBonus).toBe(0);
  expect(result.pdvRoll.batch09InstablePdvBonus).toBe(5);
  expect(result.rempartRoll.batch09InstableNoAttack).toBe(true);
  expect(result.rempartMessage).toContain("Troll instable ne peut pas attaquer");
  expect(result.drawDamageRoll.instable.batch09InstableNoAttack).toBe(false);
  expect(result.drawDamageRoll.ally.pdv).toBeLessThan(result.allyBefore.pdv);
  expect(result.drawDamageRoll.hand).toBe(result.drawDamageRoll.handBeforeDraw + 1);
  expect(result.preview).not.toContain("Bénéficie temporairement de [Rempart]. Ne peut pas attaquer.");
  expect(result.events.filter(event => event.type === "troll-start-turn").length).toBeGreaterThanOrEqual(4);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Amasseur de cadavres moves stored cemetery cards back to owner decks without duplication", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-09-amasseur");
  const result = await page.evaluate(async () => {
    const before = {p1Deck:player1.drawPile.map(getRuntimeCardId), p2Deck:player2.drawPile.map(getRuntimeCardId), p1Grave:player1.graveyard.map(getRuntimeCardId), p2Grave:player2.graveyard.map(getRuntimeCardId)};
    window.__collectionBatch09RandomQueue = [0, 0, 0];
    const play = await playCard("TRL000018", qs(playerZoneSelector(player1, "servants"))?.querySelector(".slot"), {returnValidation:true});
    const hoarder = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000018");
    const afterStash = {summary:targetSummary(hoarder), p1Deck:player1.drawPile.map(getRuntimeCardId), p2Deck:player2.drawPile.map(getRuntimeCardId), p1Grave:player1.graveyard.map(getRuntimeCardId), p2Grave:player2.graveyard.map(getRuntimeCardId), dynamic:batch03PreviewCardData("TRL000018", CARDS_DATA.TRL000018, {sourceElement:hoarder}).cap};
    await sendToCemetery(hoarder);
    const afterRelease = {p1Deck:player1.drawPile.map(getRuntimeCardId), p2Deck:player2.drawPile.map(getRuntimeCardId), p1Grave:player1.graveyard.map(getRuntimeCardId), p2Grave:player2.graveyard.map(getRuntimeCardId), stashes:Object.keys(auditCollectionBatch09Runtime().state.stashes)};
    return {before, play, afterStash, afterRelease, events:auditCollectionBatch09Runtime().state.events};
  });
  expect(result.play.success).toBe(true);
  expect(result.afterStash.summary.batch09CadaverStashCount).toBe(3);
  expect(result.afterStash.summary.atk).toBeGreaterThan(2);
  expect(result.afterStash.summary.pdvMax).toBeGreaterThan(4);
  expect(result.afterStash.p2Grave).toEqual([]);
  expect(result.afterStash.dynamic).toContain("Conserve");
  expect(result.afterRelease.p2Deck).toEqual(expect.arrayContaining(result.before.p2Grave));
  expect(result.afterRelease.p2Deck).toHaveLength(result.before.p2Deck.length + result.before.p2Grave.length);
  expect(result.afterRelease.p1Grave).toContain("TRL000018");
  expect(result.afterRelease.stashes).toEqual([]);
  expect(result.events.filter(event => event.type === "cadaver-flight" && event.reason === "stash")).toHaveLength(3);
  expect(result.events.filter(event => event.type === "cadaver-flight" && event.reason === "release")).toHaveLength(3);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Vengeance summons linked Trolls in order and preserves graveyard lifecycle", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-09-vengeance");
  const result = await page.evaluate(async () => {
    const before = {avatar:avatarHitPoints(player1), p1:livingServantCardsForPlayer(player1).map(targetSummary), p2:livingServantCardsForPlayer(player2).map(targetSummary), grave:[...player1.graveyard].map(getRuntimeCardId)};
    const rejeton = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000013");
    const premier = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "TRL000014");
    await sendToCemetery(rejeton);
    const between = livingServantCardsForPlayer(player1).map(targetSummary);
    await sendToCemetery(premier);
    const after = {avatar:avatarHitPoints(player1), p1:livingServantCardsForPlayer(player1).map(targetSummary), p2:livingServantCardsForPlayer(player2).map(targetSummary), grave:[...player1.graveyard].map(getRuntimeCardId)};
    return {before, between, after, events:auditCollectionBatch09Runtime().state.events};
  });
  expect(result.after.avatar).toBeGreaterThanOrEqual(result.before.avatar);
  expect(result.after.p2.some(after => {
    const before = result.before.p2.find(card => card.instance === after.instance);
    return before && after.pdv < before.pdv;
  }) || result.after.p2.length < result.before.p2.length).toBe(true);
  expect(result.after.p1.map(card => card.id)).toContain("TRL000001");
  expect(result.after.p1.map(card => card.id)).toContain("TRL000003");
  expect(result.after.grave.filter(id => id === "TRL000013")).toHaveLength(1);
  expect(result.after.grave.filter(id => id === "TRL000014")).toHaveLength(1);
  expect(result.events.some(event => event.type === "mugwa-spawn-vengeance")).toBe(true);
  expect(result.events.some(event => event.type === "first-born-vengeance")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Triangle des tenebres and S000055 non-regression keep zone inventory stable", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, "collection-batch-09-faveurs-sorts");
  const result = await page.evaluate(async () => {
    const snapshot = () => ({hand:[...player1.hand], servants:livingServantCardsForPlayer(player1).map(targetSummary), graveyard:[...player1.graveyard].map(getRuntimeCardId)});
    const invalidTargets = livingServantCardsForPlayer(player1).filter(fc => fc.dataset.id !== "TRL000011").slice(0, 2);
    const beforeRefusal = snapshot();
    const refusal = await playCard("S000055", null, {selectedTargetIds:invalidTargets.map(fc => fc.dataset.instance), returnValidation:true});
    const afterRefusal = snapshot();
    while (livingServantCardsForPlayer(player1).filter(fc => !fc.dataset.insensible).length < 3) await summonBatch03Servant(player1, "H000001", {triggerInitiativeEffect:false, ready:true});
    const sacrificeTargets = livingServantCardsForPlayer(player1).filter(fc => !fc.dataset.insensible).slice(0, 3);
    const beforeSuccess = snapshot();
    const sacrificedInstances = sacrificeTargets.map(fc => fc.dataset.instance);
    const success = await playCard("S000055", null, {selectedTargetIds:sacrificedInstances, returnValidation:true});
    const afterSuccess = snapshot();
    return {beforeRefusal, refusal, afterRefusal, beforeSuccess, sacrificedInstances, success, afterSuccess};
  });
  expect(result.refusal.success).toBe(false);
  expect(result.afterRefusal.hand).toEqual(result.beforeRefusal.hand);
  expect(result.afterRefusal.servants.map(card => card.instance).sort()).toEqual(result.beforeRefusal.servants.map(card => card.instance).sort());
  expect(result.success.success).toBe(true);
  expect(result.afterSuccess.graveyard.filter(id => id === "S000055")).toHaveLength(1);
  for (const instance of result.sacrificedInstances) expect(result.afterSuccess.servants.map(card => card.instance)).not.toContain(instance);
  expect(result.afterSuccess.graveyard.length).toBe(result.beforeSuccess.graveyard.length + 4);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
