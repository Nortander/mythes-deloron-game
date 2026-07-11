import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-02-gabar-darkness.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto(`/code/partie-test-1.html?scenario=${scenario}&batch02=${Date.now()}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForTimeout(500);
}

function diagnosticsFor(page, testInfo) {
  const diagnostics = attachPageDiagnostics(page);
  testInfo.attachments ||= [];
  return diagnostics;
}

test("les dix cartes et leurs assets sont disponibles dans le runtime", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page, testInfo);
  await openScenario(page, fixture.scenarios[0]);
  const audit = await page.evaluate(ids => ids.map(id => ({id, data:CARDS_DATA[id] || null})), fixture.cardIds);
  expect(audit.every(item => item.data)).toBe(true);
  for (const id of fixture.cardIds) {
    const folder = id.startsWith("H") ? "humains" : "sorts";
    const result = await page.evaluate(async ({id, folder}) => {
      const image = new Image(); image.src = `/assets/${folder}/${id}.png`;
      await image.decode(); return {width:image.naturalWidth,height:image.naturalHeight};
    }, {id, folder});
    expect(result.width).toBeGreaterThan(0);
  }
  await attachDiagnostics(testInfo, diagnostics);
});

test("Gabar maladroit amorce la chaine et Aube fait evoluer la meme ligne", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page, testInfo);
  await openScenario(page, "collection-batch-02-gabar");
  const result = await page.evaluate(async () => {
    const slot = document.querySelector(playerZoneSelector(player1, 'servants') + ' .slot');
    const played = await playCard('H000032', slot);
    const afterPlay = auditCollectionBatch02Runtime();
    const draw = drawCardFromRuntimeDeck(player1,{predicate:id => id === 'S000057'});
    await draw.evolutionResolution;
    await new Promise(resolve => setTimeout(resolve, 50));
    return {played, draw, afterPlay, final:auditCollectionBatch02Runtime()};
  });
  expect(result.afterPlay.zones.player1.deck).toContain('S000057');
  expect(result.final.board.player1.map(card => card.id)).toContain('H000033');
  expect(result.final.board.player1.map(card => card.id)).not.toContain('H000032');
  expect(result.final.zones.player1.graveyard).toContain('S000057');
  expect(result.final.state.removedFromGame.some(item => item.cardId === 'H000032')).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("la chaine genere successivement les quatre Sorts et les cinq formes", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page, testInfo);
  await openScenario(page, "collection-batch-02-generated-spells");
  const result = await page.evaluate(async evolution => {
    const stages = [];
    for (const step of evolution) {
      const draw = drawCardFromRuntimeDeck(player1,{predicate:id => id === step.spellId});
      await draw.evolutionResolution;
      stages.push(auditCollectionBatch02Runtime());
    }
    return stages;
  }, fixture.evolution);
  expect(result.map(stage => stage.board.player1.map(card => card.id))).toEqual([
    ['H000033'], ['H000034'], ['H000035'], ['H000036']
  ]);
  expect(result.at(-1).zones.player1.graveyard).toEqual(['S000057','S000058','S000059','S000060']);
  expect(result.at(-1).state.removedFromGame.map(item => item.cardId)).toEqual(['H000032','H000033','H000034','H000035']);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Triangle refuse les cibles illegales sans mutation puis resout trois sacrifices", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page, testInfo);
  await openScenario(page, "collection-batch-02-triangle");
  const result = await page.evaluate(async () => {
    const before = auditCollectionBatch02Runtime();
    const eligible = livingServantCardsForPlayer(player1).filter(fc => fc.dataset.id !== 'MV000030');
    const illegal = await playCard('S000055', null, {selectedTargetIds:[eligible[0].dataset.instance,eligible[1].dataset.instance]});
    const afterRefusal = auditCollectionBatch02Runtime();
    const success = await playCard('S000055', null, {selectedTargetIds:eligible.map(fc => fc.dataset.instance)});
    return {before, illegal, afterRefusal, success, after:auditCollectionBatch02Runtime()};
  });
  expect(result.afterRefusal.zones.player1.hand).toEqual(result.before.zones.player1.hand);
  expect(result.afterRefusal.zones.player1.graveyard).toEqual(result.before.zones.player1.graveyard);
  expect(result.success.spellResolution.success).toBe(true);
  expect(result.after.zones.player1.graveyard).toEqual(expect.arrayContaining(['H000001','H000005','H000018','S000055']));
  expect(result.after.zones.player1.counts.graveyard).toBeTruthy();
  expect(result.after.board.player1.map(card => card.id)).toEqual(expect.arrayContaining(['MV000030','MV000024']));
  expect(result.after.zones.player1.sizes.hand).toBe(0);
  expect(result.after.state.triangleEffects[0].remainingOwnerTurns).toBe(3);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Gabar prodige et maitre invoquent leurs dependances au debut du tour", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page, testInfo);
  await openScenario(page, "collection-batch-02-generated-spells");
  const result = await page.evaluate(async () => {
    const zone = document.querySelector(playerZoneSelector(player1, 'servants'));
    zone.innerHTML = buildFC('H000035','player1') + '<div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div>';
    const first = await applyBatch02StartTurnAbilities(player1);
    zone.querySelector('[data-id="H000035"]').outerHTML = buildFC('H000036','player1');
    const second = await applyBatch02StartTurnAbilities(player1);
    return {first,second,board:livingServantCardsForPlayer(player1).map(targetSummary)};
  });
  expect(result.first[0].cardId).toBe('DIV000005');
  expect(result.second[0].cardId).toBe('DIV000008');
  expect(result.board.map(card => card.id)).toEqual(expect.arrayContaining(['H000036','DIV000005','DIV000008']));
  await attachDiagnostics(testInfo, diagnostics);
});

test("le maitre copie seulement les Sorts adverses eligibles", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page, testInfo);
  await openScenario(page, "collection-batch-02-generated-spells");
  const result = await page.evaluate(async () => {
    const zone = document.querySelector(playerZoneSelector(player2, 'servants'));
    zone.querySelector('.slot').outerHTML = buildFC('H000036','player2');
    const before = [...player2.hand];
    await triggerSort('S000004', player1, {});
    return {before,after:[...player2.hand],events:auditCollectionBatch02Runtime().state.events};
  });
  expect(result.after.length).toBe(result.before.length + 1);
  expect(result.after).toContain('S000004');
  expect(result.events.some(event => event.type === 'spell-copy' && event.copiedCardId === 'S000004')).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("les Initiatives timoree et devouee utilisent un aleatoire controlable", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page, testInfo);
  await openScenario(page, "collection-batch-02-gabar");
  const result = await page.evaluate(async () => {
    const rolls = [0.6, 0.8, 0.1, 0.9, 0, 0.4, 0.8];
    window.__mythesRandom = () => rolls.shift() ?? 0;
    const timoree = await resolveBatch02Initiative('H000033', player1);
    const devouee = await resolveBatch02Initiative('H000034', player1);
    delete window.__mythesRandom;
    return {timoree,devouee,enemy:livingServantCardsForPlayer(player2).map(fc => ({...targetSummary(fc),hypno:fc.dataset.hypno||null,cdg:fc.dataset.frozen_cdg||null,burning:fc.dataset.burning||null}))};
  });
  expect(result.timoree.addedToDeck).toBe('S000058');
  expect(result.timoree.affected.length).toBeGreaterThan(0);
  expect(result.devouee.addedToDeck).toBe('S000059');
  expect(result.devouee.affected.length).toBeGreaterThan(0);
  expect(result.devouee.affected.every(item => ['hypnose','cdg','embrasement'].includes(item.status))).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("une mort alliee fait piocher un Sort sans dupliquer les zones", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page, testInfo);
  await openScenario(page, "collection-batch-02-generated-spells");
  const result = await page.evaluate(async () => {
    const zone = document.querySelector(playerZoneSelector(player1, 'servants'));
    zone.innerHTML = buildFC('H000034','player1') + buildFC('H000001','player1') + '<div class="slot"></div><div class="slot"></div><div class="slot"></div>';
    player1.drawPile = ['R000010','S000004']; player1.hand = []; player1.graveyard = [];
    await sendToCemetery(zone.querySelector('[data-id="H000001"]'));
    return auditCollectionBatch02Runtime();
  });
  expect(result.zones.player1.hand).toEqual(['S000004']);
  expect(result.zones.player1.deck).toEqual(['R000010']);
  expect(result.zones.player1.graveyard).toEqual(['H000001']);
  expect(result.state.events.some(event => event.type === 'allied-death-draw')).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("l Insensible temporaire de Morghast expire apres trois tours du proprietaire", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page, testInfo);
  await openScenario(page, "collection-batch-02-triangle");
  const result = await page.evaluate(async () => {
    const eligible = livingServantCardsForPlayer(player1).filter(fc => fc.dataset.id !== 'MV000030');
    await playCard('S000055', null, {selectedTargetIds:eligible.map(fc => fc.dataset.instance)});
    const morghast = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === 'MV000024');
    const states = [{turns:morghast.dataset.temporaryInsensibleTurns,insensible:morghast.dataset.insensible}];
    for (let index=0; index<3; index++) { resolveBatch02OwnerTurnExpiration(player1); states.push({turns:morghast.dataset.temporaryInsensibleTurns,insensible:morghast.dataset.insensible||null}); }
    return states;
  });
  expect(result).toEqual([
    {turns:'3',insensible:'1'}, {turns:'2',insensible:'1'}, {turns:'1',insensible:'1'}, {turns:'0',insensible:null}
  ]);
  await attachDiagnostics(testInfo, diagnostics);
});
