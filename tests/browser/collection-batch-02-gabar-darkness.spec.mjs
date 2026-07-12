import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/collection-batch-02-gabar-darkness.json", import.meta.url), "utf8"));

async function openScenario(page, scenario) {
  await page.goto('/code/partie-test-1.html?scenario=' + scenario + '&batch02=' + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForTimeout(500);
}

function diagnosticsFor(page) {
  return attachPageDiagnostics(page);
}

function normalizeCardTextForComparison(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\*/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function expectImagesLoaded(page, ids) {
  const results = await page.evaluate(async ids => {
    return Promise.all(ids.map(async id => {
      const folder = id.startsWith('H') ? 'humains' : id.startsWith('S') ? 'sorts' : id.startsWith('MV') ? 'morts-vivants' : 'autres';
      const image = new Image();
      image.src = '/assets/' + folder + '/' + id + '.png';
      await image.decode();
      return {id, width: image.naturalWidth, height: image.naturalHeight, src: image.src};
    }));
  }, ids);
  for (const result of results) {
    expect(result.width, result.id + ' image width').toBeGreaterThan(0);
    expect(result.height, result.id + ' image height').toBeGreaterThan(0);
  }
}

test("Batch-02 runtime data, local assets, previews and linked cards render images", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, fixture.scenarios[0]);
  const audit = await page.evaluate(ids => ids.map(id => ({id, data: CARDS_DATA[id] || null})), [...fixture.cardIds, ...fixture.dependencyIds]);
  expect(audit.every(item => item.data), JSON.stringify(audit.filter(item => !item.data))).toBe(true);
  await expectImagesLoaded(page, [...fixture.cardIds, ...fixture.dependencyIds]);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Batch-02 public texts match the 2026-07-10 export and generated spells are not lore", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, 'collection-batch-02-triangle');
  const texts = await page.evaluate(ids => Object.fromEntries(ids.map(id => [id, {
    name: CARDS_DATA[id]?.name || '',
    cap: CARDS_DATA[id]?.cap || '',
    detail: CARDS_DATA[id]?.detail || '',
    cond: CARDS_DATA[id]?.cond || '',
    loreOnly: isLoreOnlyCard(CARDS_DATA[id]),
    rendered: renderZoomDescription(CARDS_DATA[id], facColor(CARDS_DATA[id]?.fac || 'sort'))
  }])), [...fixture.cardIds, ...fixture.dependencyIds]);
  for (const [id, expected] of Object.entries(fixture.canonicalTexts)) {
    expect(normalizeCardTextForComparison(texts[id].cap), id + ' public text').toBe(normalizeCardTextForComparison(expected));
    if (fixture.cardIds.includes(id) || ['DIV000005','DIV000008'].includes(id)) {
      expect(normalizeCardTextForComparison(texts[id].detail), id + ' detail text').toBe(normalizeCardTextForComparison(expected));
    }
  }
  expect(texts.S000055.cond).toBe('Vous devez posséder au moins 3 serviteurs de votre côté du terrain, hors serviteurs ayant la capacité spéciale [Insensible].');
  expect(texts.H000033.cap).toContain('*0 à 4*');
  expect(texts.H000033.cap).toContain('« Grimoire du maître »');
  expect(texts.S000055.cap).toContain('*10 Échos*');
  for (const id of ['S000057','S000058','S000059','S000060']) {
    expect(texts[id].loreOnly, id + ' should render as a playable spell text').toBe(false);
    expect(texts[id].rendered, id + ' should not be lore italic').not.toContain('card-lore-text');
  }
  expect(JSON.stringify(texts)).not.toMatch(/tenebres|Echos|evolue|maitre|devoue|cimetiere/i);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Triangle preview tooltips keep condition, ability and Insensible readable", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, 'collection-batch-02-triangle');
  const tooltipAudit = await page.evaluate(() => {
    openCardPreview('S000055', {sourceType:'test'});
    const tips = Array.from(document.querySelectorAll('#card-preview-layer .canonical-keyword-tooltip'));
    return tips.map(tip => {
      const title = tip.querySelector(':scope > strong');
      const body = tip.querySelector(':scope > span');
      return {
        kind: tip.dataset.tooltipKind || '',
        title: title?.textContent?.trim() || '',
        titleDisplay: title ? getComputedStyle(title).display : null,
        bodyText: body?.textContent?.replace(/\s+/g, ' ').trim() || '',
        bodyStrongDisplays: Array.from(body?.querySelectorAll('strong') || []).map(node => getComputedStyle(node).display),
        bodyStrongTexts: Array.from(body?.querySelectorAll('strong') || []).map(node => node.textContent.trim())
      };
    });
  });
  expect(tooltipAudit).toHaveLength(3);
  expect(tooltipAudit[0].kind).toBe('invocation-condition');
  expect(tooltipAudit[0].title).toMatch(/condition/i);
  expect(tooltipAudit[1].kind).toBe('ability');
  expect(tooltipAudit[1].title).toMatch(/capacit/i);
  expect(tooltipAudit[2].title).toMatch(/insensible/i);
  for (const tip of tooltipAudit) {
    expect(tip.title).not.toMatch(/^(3|3 serviteurs alli[eé]s|10 [eé]chos)$/i);
    expect(tip.titleDisplay).toBe('block');
    expect(tip.bodyText).not.toMatch(/^\s*(3|10)\s*$/);
    for (const display of tip.bodyStrongDisplays) expect(display).toBe('inline');
  }
  expect(tooltipAudit.flatMap(tip => tip.bodyStrongTexts).join(' ')).toMatch(/3 serviteurs alli|10|3 prochains tours|Insensible/i);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Human cards render every main-description mechanical highlight in dark blue", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, 'collection-batch-02-gabar');
  const audit = await page.evaluate(({resources, color, forbiddenColor, ids}) => {
    const costHtml = renderCostHTML('H000032', player1);
    const costResources = Array.from(resourceKeysRenderedByCostHTML(costHtml)).sort();
    const toRgb = cssColor => {
      const probe = document.createElement('span');
      probe.style.color = cssColor;
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    };
    const expectedRgb = toRgb(color);
    const forbiddenRgb = toRgb(forbiddenColor);
    const highlightSelectors = ['.canonical-keyword-inline', 'strong.kv', '.card-keyword', '.card-named-ability'];
    const scopedSelector = root => highlightSelectors.map(selector => root + ' ' + selector).join(',');
    const cards = ids.map(id => {
      const mount = document.createElement('div');
      mount.style.position = 'absolute';
      mount.style.left = '-9999px';
      mount.innerHTML = buildHC(id, id === 'H000011' ? 'player2' : 'player1');
      document.body.appendChild(mount);
      openCardPreview(id, {sourceType:'test'});
      const handNodes = Array.from(mount.querySelectorAll(scopedSelector('.hc-desc-text')));
      const previewNodes = Array.from(document.querySelectorAll(scopedSelector('#card-preview-layer .fz-desc-text')));
      const handColors = handNodes.map(node => ({text:node.textContent.trim(), color:getComputedStyle(node).color, inline:node.getAttribute('style') || ''}));
      const previewColors = previewNodes.map(node => ({text:node.textContent.trim(), color:getComputedStyle(node).color, inline:node.getAttribute('style') || ''}));
      mount.remove();
      return {id, handColors, previewColors};
    });
    return {
      costHtml,
      costResources,
      expectedRgb,
      forbiddenRgb,
      resources,
      factionColor: facColor('hum'),
      descAccent: humanDescriptionAccentColor(CARDS_DATA.H000032, facColor('hum')),
      cards
    };
  }, {
    resources: fixture.h000032CostResources,
    color: fixture.humanAccentColor,
    forbiddenColor: fixture.humanForbiddenMainDescriptionColor,
    ids: fixture.humanMainDescriptionCardIds
  });
  expect(audit.costResources).toEqual([...fixture.h000032CostResources].sort());
  expect(audit.costHtml).toContain('OU');
  expect(audit.costHtml).toContain('&ge;');
  expect(audit.factionColor).toBe(fixture.humanForbiddenMainDescriptionColor);
  expect(audit.descAccent).toBe(fixture.humanAccentColor);
  for (const card of audit.cards) {
    const allColors = [...card.handColors, ...card.previewColors];
    expect(allColors.length, card.id + ' highlighted elements').toBeGreaterThan(0);
    for (const item of allColors) {
      expect(item.color, `${card.id} ${item.text}`).toBe(audit.expectedRgb);
      expect(item.color, `${card.id} must not use border cyan`).not.toBe(audit.forbiddenRgb);
    }
  }
  await attachDiagnostics(testInfo, diagnostics);
});

test("Capitaine des patrouilleurs public text keeps linked name but hides technical IDs", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, 'collection-batch-02-gabar');
  const audit = await page.evaluate(({cardId}) => {
    const d = CARDS_DATA[cardId];
    openCardPreview(cardId, {sourceType:'test'});
    const previewText = document.querySelector('#card-preview-layer')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const rendered = renderZoomDescription(d, facColor(d.fac)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return {cap:d.cap || '', detail:d.detail || '', rendered, previewText};
  }, {cardId: fixture.captainPublicTextCardId});
  const publicText = [audit.cap, audit.detail, audit.rendered, audit.previewText].join('\n');
  expect(publicText).toContain('Patrouilleur du village');
  expect(publicText).not.toMatch(/\bH000008\b/);
  expect(publicText).not.toMatch(/\(ID\b|ID\s*carte\s*=/i);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Triangle UI excludes Insensible sacrifices and resolves with roleplay feedback", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, 'collection-batch-02-triangle');
  const result = await page.evaluate(async () => {
    const before = auditCollectionBatch02Runtime();
    const beforeSouls = player1.resourceState.souls;
    const options = livingServantCardsForPlayer(player1).filter(fc => !targetSummary(fc).insensible).map(targetSummary);
    const excluded = livingServantCardsForPlayer(player1).filter(fc => targetSummary(fc).insensible).map(targetSummary);
    const success = await playCard('S000055', null, {selectedTargetIds: options.slice(0, 3).map(card => card.instance)});
    await new Promise(resolve => setTimeout(resolve, 60));
    const after = auditCollectionBatch02Runtime();
    const morghast = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === 'MV000024');
    return {
      before, options, excluded, success, after,
      publicLog: Array.from(document.querySelectorAll('.log-entry, #notif')).map(node => node.textContent).join('\n'),
      beforeSouls,
      afterSouls: player1.resourceState.souls,
      morghast: morghast ? {...targetSummary(morghast), temporary: morghast.dataset.temporaryInsensibleTurns || null, badge: morghast.querySelector('[data-testid="batch02-temporary-insensible"]')?.textContent || '', tooltipTitle: morghast.title || ''} : null
    };
  });
  expect(result.options).toHaveLength(3);
  expect(result.excluded.map(card => card.id)).toContain('H000036');
  expect(result.success.spellResolution.success).toBe(true);
  expect(result.after.zones.player1.graveyard).toEqual(expect.arrayContaining(['H000001', 'H000005', 'H000018', 'S000055']));
  expect(result.after.zones.player1.hand).toHaveLength(0);
  expect(result.afterSouls).toBe(result.beforeSouls + 10);
  expect(result.after.board.player1.map(card => card.id)).toEqual(expect.arrayContaining(['H000036', 'MV000024']));
  expect(result.morghast.temporary).toBe('3');
  expect(result.morghast.badge).toBe('');
  expect(result.morghast.tooltipTitle).toBe('Insensible temporaire');
  expect(result.publicLog).toContain(fixture.triangle.publicMessage);
  const previewText = await page.evaluate(() => {
    const morghast = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === 'MV000024');
    openCardPreview(morghast, {sourceType:'board', playerId:'player1', sourceElement:morghast});
    return document.querySelector('#card-preview-layer')?.textContent || '';
  });
  expect(normalizeCardTextForComparison(previewText)).toContain(normalizeCardTextForComparison(fixture.morghastTemporaryInsensibleText));
  expect(previewText).toContain('Insensible');
  await expect.poll(() => page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('#card-preview-layer .canonical-related-mini img'));
    return imgs.length > 0 && imgs.every(img => {
      const src = img.getAttribute('src') || '';
      return src && !src.includes('githubusercontent') && img.naturalWidth > 0;
    });
  }), {timeout: 3000}).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Triangle refuses when fewer than three non-Insensible allies exist without mutation", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, 'collection-batch-02-triangle');
  const result = await page.evaluate(async () => {
    const zone = document.querySelector(playerZoneSelector(player1, 'servants'));
    zone.innerHTML = buildFC('H000001', 'player1') + buildFC('H000036', 'player1') + '<div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div>';
    player1.hand = ['S000055'];
    player1.graveyard = [];
    const before = auditCollectionBatch02Runtime();
    const beforeSouls = player1.resourceState.souls;
    const eligible = livingServantCardsForPlayer(player1).filter(fc => !targetSummary(fc).insensible).map(fc => fc.dataset.instance);
    const refused = await playCard('S000055', null, {selectedTargetIds: eligible});
    const after = auditCollectionBatch02Runtime();
    return {before, refused, after, errorText: document.querySelector('#errMsg')?.textContent || '', beforeSouls, afterSouls: player1.resourceState.souls};
  });
  expect((result.refused && result.refused.success) || result.refused?.spellResolution?.success || false).toBe(false);
  expect(result.errorText || JSON.stringify(result.refused || {})).toMatch(/conditions|sacrifier|cible|serviteurs|target|invalid/i);
  expect(result.after.zones.player1.hand).toEqual(result.before.zones.player1.hand);
  expect(result.after.zones.player1.graveyard).toEqual(result.before.zones.player1.graveyard);
  expect(result.afterSouls).toBe(result.beforeSouls);
  expect(result.after.board.player1.map(card => card.id)).toEqual(result.before.board.player1.map(card => card.id));
  await attachDiagnostics(testInfo, diagnostics);
});

test("Each Gabar evolution spell requires its exact source form and avoids loops", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, 'collection-batch-02-generated-spells');
  const result = await page.evaluate(async evolution => {
    const stages = [];
    for (const step of evolution) {
      const wrongZone = document.querySelector(playerZoneSelector(player1, 'servants'));
      const wrongSource = ['H000032', 'H000033', 'H000034', 'H000035', 'H000036'].find(id => id !== step.source && id !== step.create);
      wrongZone.innerHTML = buildFC(wrongSource, 'player1') + '<div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div>';
      player1.drawPile = [step.spellId];
      const wrong = drawCardFromRuntimeDeck(player1, {predicate: id => id === step.spellId});
      await wrong.evolutionResolution;
      const afterWrong = auditCollectionBatch02Runtime();

      const zone = document.querySelector(playerZoneSelector(player1, 'servants'));
      zone.innerHTML = buildFC(step.source, 'player1') + '<div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div>';
      player1.drawPile = [step.spellId];
      player1.hand = [];
      player1.graveyard = [];
      const right = drawCardFromRuntimeDeck(player1, {predicate: id => id === step.spellId});
      const rightEvolution = await right.evolutionResolution;
      const afterRight = auditCollectionBatch02Runtime();
      stages.push({step, wrong, afterWrong, right, rightEvolution, afterRight});
    }
    return stages;
  }, fixture.evolution);
  for (const stage of result) {
    expect(stage.wrong.evolutionResolution.success).toBe(false);
    expect(stage.afterWrong.board.player1.map(card => card.id)).not.toContain(stage.step.create);
    expect(stage.afterWrong.zones.player1.hand).toContain(stage.step.spellId);
    expect(stage.rightEvolution.success).toBe(true);
    expect(stage.afterRight.board.player1.map(card => card.id)).toEqual([stage.step.create]);
    expect(stage.afterRight.zones.player1.graveyard).toEqual([stage.step.spellId]);
    expect(stage.afterRight.state.removedFromGame.map(item => item.cardId)).toContain(stage.step.remove);
  }
  await attachDiagnostics(testInfo, diagnostics);
});

test("Gabar Initiative deck animation and accented evolution messages are visible", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, 'collection-batch-02-gabar');
  const result = await page.evaluate(async () => {
    const zone = document.querySelector(playerZoneSelector(player1, 'servants'));
    zone.innerHTML = buildFC('H000033', 'player1') + '<div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div>';
    const initiative = await resolveBatch02Initiative('H000033', player1);
    await new Promise(resolve => setTimeout(resolve, 40));
      const responsibleCard = document.querySelector('.fc[data-id="H000033"]');
      const pulseStyle = responsibleCard ? getComputedStyle(responsibleCard) : null;
      return {
        initiative,
        deck: [...player1.drawPile],
        animation: document.querySelector('.batch02-deck-addition-vfx')?.textContent || '',
        responsibility: {
          ribbon: document.querySelector('[data-testid="batch02-gabar-responsibility"]')?.textContent || '',
          reason: responsibleCard?.dataset.batch02Responsibility || '',
          active: responsibleCard?.dataset.batch02ResponsibilityActive || '',
          pulse: responsibleCard?.classList.contains('batch02-responsibility-pulse') || false,
          animationDuration: pulseStyle?.animationDuration || '',
          boxShadow: pulseStyle?.boxShadow || '',
          outlineWidth: pulseStyle?.outlineWidth || '',
          outlineColor: pulseStyle?.outlineColor || ''
        },
        events: auditCollectionBatch02Runtime().state.events
      };
  });
  expect(result.initiative.addedToDeck).toBe('S000058');
  expect(result.deck).toContain('S000058');
  expect(result.animation).toContain('Grimoire du maître');
  expect(result.events.some(event => event.type === 'initiative' && event.cardId === 'H000033')).toBe(true);
  expect(result.responsibility.ribbon).toBe('');
  expect(result.responsibility.reason).toBe('initiative');
  expect(result.responsibility.active).toBe('1');
  expect(result.responsibility.pulse).toBe(true);
  expect(parseFloat(result.responsibility.animationDuration)).toBeGreaterThanOrEqual(1.8);
  expect(result.responsibility.boxShadow).toContain('38, 196, 236');
  expect(result.responsibility.outlineWidth).not.toBe('0px');
  expect(result.responsibility.outlineColor).toContain('38, 196, 236');
  const draw = await page.evaluate(async () => {
    const result = drawCardFromRuntimeDeck(player1, {predicate: id => id === 'S000058'});
    const evolution = await result.evolutionResolution;
    return {result, evolution, log: Array.from(document.querySelectorAll('.notif')).map(node => node.textContent).join('\n')};
  });
  expect(draw.evolution.success).toBe(true);
  expect(draw.log).toMatch(/Grimoire.*Gabar/);
  const visualPhases = await page.evaluate(() => auditCollectionBatch02Runtime().state.events.filter(event => event.type === 'visual-phase').map(event => event.phase));
  expect(visualPhases).toEqual(expect.arrayContaining(['draw-evolution-spell','transform-remove-source','next-form-created','spell-to-graveyard','next-spell-to-deck']));
  expect(visualPhases.indexOf('draw-evolution-spell')).toBeLessThan(visualPhases.indexOf('transform-remove-source'));
  expect(visualPhases.indexOf('transform-remove-source')).toBeLessThan(visualPhases.indexOf('spell-to-graveyard'));
  expect(visualPhases.indexOf('spell-to-graveyard')).toBeLessThan(visualPhases.indexOf('next-form-created'));
  expect(visualPhases.indexOf('next-form-created')).toBeLessThan(visualPhases.lastIndexOf('next-spell-to-deck'));
  await attachDiagnostics(testInfo, diagnostics);
});

test("Gabar dévoué draws a spell on allied death only while present", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, 'collection-batch-02-generated-spells');
  const result = await page.evaluate(async () => {
    const zone = document.querySelector(playerZoneSelector(player1, 'servants'));
    zone.innerHTML = buildFC('H000034', 'player1') + buildFC('H000001', 'player1') + '<div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div>';
    player1.drawPile = ['R000010', 'S000004'];
    player1.hand = [];
    player1.graveyard = [];
    await sendToCemetery(zone.querySelector('[data-id="H000001"]'));
    const responsibility = {
      ribbon: zone.querySelector('[data-testid="batch02-gabar-responsibility"]')?.textContent || '',
      reason: zone.querySelector('[data-id="H000034"]')?.dataset.batch02Responsibility || '',
      active: zone.querySelector('[data-id="H000034"]')?.dataset.batch02ResponsibilityActive || ''
    };
    const withDevoted = auditCollectionBatch02Runtime();
    zone.innerHTML = buildFC('H000001', 'player1') + '<div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div>';
    player1.drawPile = ['R000010', 'S000006'];
    player1.hand = [];
    player1.graveyard = [];
    await sendToCemetery(zone.querySelector('[data-id="H000001"]'));
    return {withDevoted, withoutDevoted: auditCollectionBatch02Runtime(), responsibility};
  });
  expect(result.withDevoted.zones.player1.hand).toEqual(['S000004']);
  expect(result.withDevoted.zones.player1.deck).toEqual(['R000010']);
  expect(result.withDevoted.state.events.some(event => event.type === 'allied-death-draw')).toBe(true);
  expect(result.responsibility.ribbon).toBe('');
  expect(result.responsibility.reason).toBe('allied-death-draw');
  expect(result.responsibility.active).toBe('1');
  expect(result.withoutDevoted.zones.player1.hand).toEqual([]);
  expect(result.withoutDevoted.zones.player1.deck).toEqual(['R000010', 'S000006']);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Gabar maître-magicien copies only eligible opposing spells", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, 'collection-batch-02-generated-spells');
  const result = await page.evaluate(async () => {
    const ownerZone = document.querySelector(playerZoneSelector(player1, 'servants'));
    const casterZone = document.querySelector(playerZoneSelector(player2, 'servants'));
    ownerZone.innerHTML = buildFC('H000036', 'player1') + buildFC('H000001', 'player1') + buildFC('H000005', 'player1') + buildFC('H000018', 'player1') + '<div class="slot" data-player="player1"></div>';
    casterZone.innerHTML = buildFC('H000033', 'player2') + buildFC('ORC000017', 'player2') + buildFC('H000005', 'player2') + '<div class="slot" data-player="player2"></div><div class="slot" data-player="player2"></div>';
    player1.hand = [];
    refreshRuntimeZone(player1, 'hand');
    player2.hand = ['S000005', 'S000055'];
    refreshRuntimeZone(player2, 'hand');
    currentPlayer = 'player2';
    activePlayer = player2;
    const before = auditCollectionBatch02Runtime();
    const assassinatTarget = ownerZone.querySelector('[data-id="H000001"]').dataset.instance;
    const eligiblePlay = await playCard('S000005', null, {selectedTargetIds:[assassinatTarget]});
    const afterEligible = auditCollectionBatch02Runtime();
    const copyPulse = {
      ribbon: document.querySelector('[data-testid="batch02-gabar-responsibility"]')?.textContent || '',
      reason: document.querySelector('.fc[data-id="H000036"]')?.dataset.batch02Responsibility || '',
      active: document.querySelector('.fc[data-id="H000036"]')?.dataset.batch02ResponsibilityActive || ''
    };
    player2.hand = ['S000055'];
    refreshRuntimeZone(player2, 'hand');
    const echoTargets = livingServantCardsForPlayer(player2).filter(fc => !targetSummary(fc).insensible).slice(0, 3).map(fc => fc.dataset.instance);
    const echoPlay = await playCard('S000055', null, {selectedTargetIds: echoTargets});
    const afterEchoSpell = auditCollectionBatch02Runtime();
    const handVisibility = (() => {
      currentPlayer = 'player1';
      activePlayer = player1;
      refreshRuntimeZone(player1, 'hand');
      const handZone = document.querySelector(playerZoneSelector(player1, 'hand'));
      const copied = handZone?.querySelector('.hc[data-id="S000005"]');
      const copiedTriangle = handZone?.querySelector('.hc[data-id="S000055"]');
      const image = copied?.querySelector('img');
      const triangleImage = copiedTriangle?.querySelector('img');
      return {
        visible:!!copied,
        imageLoaded:!!image && image.naturalWidth > 0,
        count:handZone?.querySelectorAll('.hc[data-id="S000005"]').length || 0,
        triangleVisible:!!copiedTriangle,
        triangleImageLoaded:!!triangleImage && triangleImage.naturalWidth > 0,
        triangleCount:handZone?.querySelectorAll('.hc[data-id="S000055"]').length || 0,
        triangleName: CARDS_DATA.S000055?.name || '',
        triangleType: CARDS_DATA.S000055?.type || ''
      };
    })();

    const testIds = {
      faction: '__BATCH02_TEST_FACTION_SPELL',
      echoOnly: '__BATCH02_TEST_ECHO_ONLY_SPELL',
      echoText: '__BATCH02_TEST_ECHO_TEXT_SPELL'
    };
    CARDS_DATA[testIds.faction] = {name:'Sort technique de faction',type:'Sort',fac:'sort',cost:0,resType:'any',kws:['Humains'],cap:'Sort technique de faction.'};
    CARDS_DATA[testIds.echoOnly] = {name:'Sort technique Ã‰chos seuls',type:'Sort',fac:'sort',cost:3,resType:'Ã‰cho',kws:[],cap:'Sort technique Ã  coÃ»t structurÃ© exclusivement Ã‰chos.'};
    CARDS_DATA[testIds.echoText] = {name:'Sort technique mention Ã‰chos',type:'Sort',fac:'sort',cost:0,resType:'any',kws:[],cap:'Mentionne les Ã‰chos dans le texte sans les exiger en coÃ»t.'};
    EXTRA_CARD_COST_DEFINITIONS[testIds.faction] = createCostDefinition(0, COST_RESOURCE_ORDER, [], []);
    EXTRA_CARD_COST_DEFINITIONS[testIds.echoOnly] = createCostDefinition(3, ['soul'], [{resource:'soul', amount:3}], []);
    EXTRA_CARD_COST_DEFINITIONS[testIds.echoText] = createCostDefinition(0, COST_RESOURCE_ORDER, [], []);
    const factionCopy = handleBatch02OpposingSpellResolved(testIds.faction, player2, {success:true});
    const echoOnlyCopy = handleBatch02OpposingSpellResolved(testIds.echoOnly, player2, {success:true});
    const echoTextEligible = isBatch02SpellCopyEligible(testIds.echoText);
    const afterEligibilityProbes = auditCollectionBatch02Runtime();

    player1.hand = [];
    refreshRuntimeZone(player1, 'hand');
    ownerZone.innerHTML = buildFC('H000001', 'player1') + '<div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div>';
    player2.hand = ['S000005'];
    refreshRuntimeZone(player2, 'hand');
    currentPlayer = 'player2';
    activePlayer = player2;
    const noGabarTarget = ownerZone.querySelector('[data-id="H000001"]').dataset.instance;
    const noGabarPlay = await playCard('S000005', null, {selectedTargetIds:[noGabarTarget]});
    const afterNoGabar = auditCollectionBatch02Runtime();
    return {before, eligiblePlay, afterEligible, echoPlay, afterEchoSpell, copyPulse, handVisibility, factionCopy, echoOnlyCopy, echoTextEligible, afterEligibilityProbes, noGabarPlay, afterNoGabar};
  });
  expect(result.eligiblePlay.success).toBe(true);
  expect(result.eligiblePlay.spellResolution.success).toBe(true);
  expect(result.afterEligible.zones.player1.hand).toContain('S000005');
  expect(result.afterEligible.zones.player2.hand).not.toContain('S000005');
  expect(result.afterEligible.zones.player2.graveyard).toContain('S000005');
  expect(result.afterEligible.state.events.some(event => event.type === 'spell-copy' && event.copiedCardId === 'S000005')).toBe(true);
  expect(result.copyPulse.ribbon).toBe('');
  expect(result.copyPulse.reason).toBe('spell-copy');
  expect(result.copyPulse.active).toBe('1');
  expect(result.handVisibility.visible).toBe(true);
  expect(result.handVisibility.imageLoaded).toBe(true);
  expect(result.handVisibility.count).toBe(1);
  expect(result.echoPlay.success).toBe(true);
  expect(result.afterEchoSpell.zones.player1.hand.filter(id => id === 'S000055')).toHaveLength(1);
  expect(result.afterEchoSpell.state.events.some(event => event.type === 'spell-copy' && event.copiedCardId === 'S000055')).toBe(true);
  expect(result.handVisibility.triangleVisible).toBe(true);
  expect(result.handVisibility.triangleImageLoaded).toBe(true);
  expect(result.handVisibility.triangleCount).toBe(1);
  expect(result.handVisibility.triangleName).toContain('Triangle');
  expect(result.handVisibility.triangleType).toBe('Sort');
  expect(result.factionCopy).toEqual(expect.objectContaining({copied:false, reason:'not-eligible'}));
  expect(result.echoOnlyCopy).toEqual(expect.objectContaining({copied:false, reason:'not-eligible'}));
  expect(result.echoTextEligible).toBe(true);
  expect(result.afterEligibilityProbes.zones.player1.hand).not.toContain(fixture.copyEligibility.testFactionSpell);
  expect(result.afterEligibilityProbes.zones.player1.hand).not.toContain(fixture.copyEligibility.testEchoOnlySpell);
  expect(result.afterEligibilityProbes.zones.player1.hand).not.toContain(fixture.copyEligibility.testEchoTextSpell);
  expect(result.noGabarPlay.success).toBe(true);
  expect(result.afterNoGabar.zones.player1.hand.filter(id => id === 'S000005')).toHaveLength(0);
  expect(result.afterNoGabar.state.events.filter(event => event.type === 'spell-copy' && event.copiedCardId === 'S000005')).toHaveLength(1);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Gabar prodige and maître summons, temporary Insensible expiry, and generated scenario attack readiness", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, 'collection-batch-02-generated-spells');
  const result = await page.evaluate(async () => {
    const zone = document.querySelector(playerZoneSelector(player1, 'servants'));
    zone.innerHTML = buildFC('H000035', 'player1') + '<div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div><div class="slot" data-player="player1"></div>';
    const first = await applyBatch02StartTurnAbilities(player1);
    const firstPulse = {
      ribbon: zone.querySelector('[data-testid="batch02-gabar-responsibility"]')?.textContent || '',
      reason: zone.querySelector('[data-id="H000035"]')?.dataset.batch02Responsibility || '',
      active: zone.querySelector('[data-id="H000035"]')?.dataset.batch02ResponsibilityActive || ''
    };
    zone.querySelector('[data-id="H000035"]').outerHTML = buildFC('H000036', 'player1');
    const second = await applyBatch02StartTurnAbilities(player1);
    const elemental = zone.querySelector('[data-id="DIV000005"]');
    const attackProbe = {canAttack: !!elemental && !elemental.dataset.new && !elemental.dataset.frozen && !elemental.dataset.frozen_cdg && !elemental.dataset.dead};
    return {first, second, firstPulse, attackProbe, board: livingServantCardsForPlayer(player1).map(targetSummary)};
  });
  expect(result.first[0].cardId).toBe('DIV000005');
  expect(result.second[0].cardId).toBe('DIV000008');
  expect(result.firstPulse.ribbon).toBe('');
  expect(result.firstPulse.reason).toBe('start-turn');
  expect(result.firstPulse.active).toBe('1');
  expect(result.board.map(card => card.id)).toEqual(expect.arrayContaining(['H000036', 'DIV000005', 'DIV000008']));
  expect(result.attackProbe.canAttack).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
});

test("Batch-02 scenarios give the opponent visible R000020 x15 cheat resources", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  for (const scenario of fixture.scenarios) {
    await openScenario(page, scenario);
    const audit = await page.evaluate(expectedIds => ({
      scenarioId:selectedScenarioId(),
      supplies: player2.supplies.map(item => ({cardId:item.cardId, currentProduction:item.currentProduction})),
      resources: {...player2.resourceState.classical, souls:player2.resourceState.souls},
      opponentIds:[
        ...player2.hand,
        ...player2.drawPile,
        ...livingServantCardsForPlayer(player2).map(fc => fc.dataset.id)
      ],
      missingOpponentIds: expectedIds.filter(id => ![
        ...player2.hand,
        ...player2.drawPile,
        ...livingServantCardsForPlayer(player2).map(fc => fc.dataset.id)
      ].includes(id))
    }), fixture.opponentEnrichmentIds);
    expect(audit.supplies.some(item => item.cardId === 'R000020')).toBe(true);
    for (const key of ['aria','lenya','selene','fer','bois','pierre','nourriture']) expect(audit.resources[key]).toBeGreaterThanOrEqual(15);
    expect(audit.resources.souls).toBeGreaterThanOrEqual(15);
    expect(audit.missingOpponentIds, scenario).toEqual([]);
  }
  await attachDiagnostics(testInfo, diagnostics);
});

test("Triangle temporary Insensible starts after invocation turn and then expires after three owner turns", async ({page}, testInfo) => {
  const diagnostics = diagnosticsFor(page);
  await openScenario(page, 'collection-batch-02-triangle');
  const result = await page.evaluate(async () => {
    const selected = livingServantCardsForPlayer(player1).filter(fc => !targetSummary(fc).insensible).slice(0, 3).map(fc => fc.dataset.instance);
    await playCard('S000055', null, {selectedTargetIds: selected});
    const morghast = () => livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === 'MV000024');
    const legalSelfTargetIds = () => evaluateTargetRequirement('S000055', {player:player1, selectedTargetIds:[]}).legalTargets.map(card => card.instance);
    const states = [];
    states.push({label:'created', turnSequence, turns:morghast()?.dataset.temporaryInsensibleTurns || null, insensible:morghast()?.dataset.insensible || null, legal:legalSelfTargetIds().includes(morghast()?.dataset.instance)});
    resolveBatch02OwnerTurnExpiration(player1);
    states.push({label:'same-turn-owner-end', turnSequence, turns:morghast()?.dataset.temporaryInsensibleTurns || null, insensible:morghast()?.dataset.insensible || null, legal:legalSelfTargetIds().includes(morghast()?.dataset.instance)});
    for (const label of ['owner-1','owner-2','owner-3']) {
      turnSequence += 1;
      resolveBatch02OwnerTurnExpiration(player2);
      turnSequence += 1;
      resolveBatch02OwnerTurnExpiration(player1);
      states.push({label, turnSequence, turns:morghast()?.dataset.temporaryInsensibleTurns || null, insensible:morghast()?.dataset.insensible || null, legal:legalSelfTargetIds().includes(morghast()?.dataset.instance)});
    }
    return {states, board: livingServantCardsForPlayer(player1).map(targetSummary), effects: collectionBatch02State.triangleEffects};
  });
  expect(result.states.map(state => [state.label, state.turns, state.insensible, state.legal])).toEqual([
    ['created', '3', '1', false],
    ['same-turn-owner-end', '3', '1', false],
    ['owner-1', '2', '1', false],
    ['owner-2', '1', '1', false],
    ['owner-3', '0', null, true]
  ]);
  expect(result.effects[0].createdTurnSequence).toBe(1);
  expect(result.effects[0].remainingOwnerTurns).toBe(0);
  await attachDiagnostics(testInfo, diagnostics);
});
