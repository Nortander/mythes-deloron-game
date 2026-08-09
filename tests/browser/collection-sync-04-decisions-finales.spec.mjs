import { test, expect } from '@playwright/test';
import { collectionCard, openCollection } from './helpers/eloron-ui.mjs';
import canonical from '../fixtures/collection-canonical-cards.json' assert { type: 'json' };
import signatures from '../fixtures/collection-effect-signatures.json' assert { type: 'json' };
import dependencies from '../fixtures/collection-card-dependencies.json' assert { type: 'json' };

const PAGE = '/code/collection.html';
const byId = (list, id) => list.find((entry) => entry.id === id || entry.sourceId === id);

test.describe('COLLECTION-SYNC-04 décisions finales', () => {
  test('fixtures alignent les décisions finales validées', async () => {
    expect(canonical.cardCount).toBe(332);
    expect(canonical.uniqueIdCount).toBe(332);
    expect(canonical.obtainableCount).toBe(314);

    expect(byId(canonical.cards, 'B000018')).toMatchObject({ name: 'Rampant caustique', type: 'Serviteur', faction: 'Bête', attack: 2, health: 4, costTotal: 3 });
    expect(byId(canonical.cards, 'B000018').keywords).toEqual(expect.arrayContaining(['Nourriture', 'Pestilence']));
    expect(byId(canonical.cards, 'AVS000004').related).toEqual(['DIV000003', 'DIV000004']);
    expect(byId(canonical.cards, 'AVS000011').name).toBe("Mage du Cercle - Main d'argent, maître des miroirs");
    expect(byId(canonical.cards, 'EDB000005').costTotal).toBe(2);
    expect(byId(canonical.cards, 'EDB000007').costTotal).toBe(5);
    expect(byId(canonical.cards, 'EDB000013')).toMatchObject({ attack: 6, health: 3 });
    expect(byId(canonical.cards, 'EDB000014').keywords).toEqual(expect.arrayContaining(['Pestilence']));
    expect(byId(canonical.cards, 'EDB000014').detailedEffect).toContain('[Pestilence]');
    expect(byId(canonical.cards, 'EDG000007').displayText).toContain('moitié de ses PV maximums');
    expect(byId(canonical.cards, 'EDG000013').faction).toBe('Elfe de glace');
    expect(byId(canonical.cards, 'EN000002').displayText).toContain("au serviteur qui l'envoie au cimetière");
    expect(byId(canonical.cards, 'EN000002').displayText).toContain('traverse [Insensible]');
    expect(byId(canonical.cards, 'H000012').displayText).toContain('retire 1 Écho des réserves adverses');
    expect(byId(canonical.cards, 'MV000003').health).toBe(8);
    expect(byId(canonical.cards, 'MV000007').costTotal).toBe(1);
    expect(byId(canonical.cards, 'MV000009')).toMatchObject({ attack: 4, health: 4, costTotal: 2 });
    expect(byId(canonical.cards, 'MV000011').costTotal).toBe(6);
    expect(byId(canonical.cards, 'MV000013').costTotal).toBe(4);
    expect(byId(canonical.cards, 'MV000020').costTotal).toBe(1);
    expect(byId(canonical.cards, 'MV000023')).toMatchObject({ attack: 8, health: 6, costTotal: 6 });
    expect(byId(canonical.cards, 'MV000024').costTotal).toBe(9);

    expect(signatures.cardCount).toBe(332);
    expect(byId(signatures.signatures, 'B000018').requiredPrimitives).toEqual(expect.arrayContaining(['pestilence-status']));
    expect(byId(signatures.signatures, 'AVS000004').referencedCardIds).toEqual(['DIV000003', 'DIV000004']);
    expect(JSON.stringify(dependencies)).toContain('DIV000003');
    expect(JSON.stringify(dependencies)).toContain('DIV000004');
    expect(JSON.stringify(dependencies)).not.toContain('B000006');
    expect(JSON.stringify(dependencies)).not.toContain('B000007');
  });

  test('Collection affiche les décisions finales sans infobulles Approvisionnement parasites', async ({ page }) => {
    await openCollection(page);
    await page.locator('#searchInput').fill('B000018');
    await expect(collectionCard(page, 'B000018')).toBeVisible();
    await page.locator('#searchInput').fill('');
    const audit = await page.evaluate(() => {
      const readFromData = (id) => {
        const source = typeof CARDS !== 'undefined' ? CARDS : [];
        const card = source.find((entry) => entry.id === id);
        return card ? { text: [card.id, card.name, card.desc, card.detail].filter(Boolean).join(' '), html: [card.desc, card.detail].filter(Boolean).join(' ') } : null;
      };
      const read = readFromData;
      return {
        b000018: read('B000018'),
        av000008: read('AV000008'),
        av000011: read('AV000011'),
        avs000011: read('AVS000011'),
        edb000014: read('EDB000014'),
        h000012: read('H000012'),
        badSupply: ['MV000026','MV000027','MV000029','MV000030','S000052'].map((id) => ({ id, hasParasiticSupply: /APPROVISIONNEMENT/.test(read(id)?.text || '') }))
      };
    });
    expect(audit.b000018?.text).toContain('Rampant caustique');
    expect(audit.b000018?.text).toContain('Pestilence');
    expect(audit.av000008?.text).toContain('Vous commencez la partie avec');
    expect(audit.av000008?.html).toContain('<strong class="kv">5</strong> Échos en réserve');
    expect(audit.av000011?.text).toContain('maître des miroirs');
    expect(audit.avs000011?.text).toContain('maître des miroirs');
    expect(audit.edb000014?.text).toContain('Pestilence');
    expect(audit.h000012?.html).toContain('retire <strong class="kv">1</strong> Écho des réserves adverses');
    expect(audit.badSupply.every((item) => item.hasParasiticSupply === false)).toBe(true);
  });

  test('runtime partie-test expose B000018 et les textes techniques corrigés', async ({ page }) => {
    await page.goto('/code/partie-test-1.html?scenario=collection-batch-10-goblins');
    const audit = await page.evaluate(() => {
      const get = (id) => (typeof CARDS_DATA !== 'undefined' ? CARDS_DATA[id] : null) || null;
      return {
        b000018: get('B000018'),
        avs000011: get('AVS000011'),
        edb000014: get('EDB000014'),
        h000012: get('H000012'),
        sync04: Boolean(window.COLLECTION_SYNC_04_FINAL_DECISIONS_APPLIED)
      };
    });
    expect(audit.sync04).toBe(true);
    expect(audit.b000018).toMatchObject({ id: 'B000018', name: 'Rampant caustique', atk: 2, maxHp: 4, cost: 3 });
    expect(audit.b000018.keywords).toEqual(expect.arrayContaining(['Nourriture', 'Pestilence']));
    expect(audit.avs000011.name).toContain('maître des miroirs');
    expect(audit.edb000014.text).toContain('[Pestilence]');
    expect(audit.h000012.text).toContain('retire 1 Écho des réserves adverses');
  });
});
