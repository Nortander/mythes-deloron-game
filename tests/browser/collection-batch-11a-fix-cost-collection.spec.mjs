import { expect, test } from "@playwright/test";
import {
  attachDiagnostics,
  attachPageDiagnostics,
  openCollection
} from "./helpers/eloron-ui.mjs";

const TARGET_IDS = ["AVS000008", "MV000009", "MV000025", "R000021", "R000027"];

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message =>
    !/Failed to load resource: the server responded with a status of 404/i.test(message)
    && !/Failed to load resource: net::ERR_(NETWORK_CHANGED|NAME_NOT_RESOLVED)/i.test(message)
  );
}

async function openBatch11aEchoScenario(page) {
  await page.goto("/code/partie-test-1.html?scenario=collection-batch-11a-echos&fix11a=" + Date.now());
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe("collection-batch-11a-echos");
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect(page.getByText("MODE TEST — COLLECTION BATCH 11A")).toBeVisible();
  await page.waitForSelector(".history.vis", { timeout: 20000 });
  await page.waitForTimeout(150);
}

test("MV000009 uses the real two-Echo structured runtime cost", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch11aEchoScenario(page);

  const oneEchoAttempt = await page.evaluate(async () => {
    const p = player1;
    const before = auditCollectionBatch11aRuntime().players.find(player => player.playerId === p.key);
    const slot = qs(playerZoneSelector(p, "servants"))?.querySelector(".slot");
    const play = await playCard("MV000009", slot, { returnValidation: true });
    const after = auditCollectionBatch11aRuntime().players.find(player => player.playerId === p.key);
    return { play: play || null, before, after };
  });

  expect(oneEchoAttempt.before.souls).toBe(1);
  expect(oneEchoAttempt.play).toBeNull();
  expect(oneEchoAttempt.after.souls).toBe(1);
  expect(oneEchoAttempt.after.hand).toContain("MV000009");
  expect(oneEchoAttempt.after.servants.filter(card => card.id === "MV000009")).toHaveLength(1);

  await openBatch11aEchoScenario(page);
  const twoEchoAttempt = await page.evaluate(async () => {
    const p = player1;
    changeSouls(p, 1, "test-exact-two-echo-cost");
    const before = auditCollectionBatch11aRuntime().players.find(player => player.playerId === p.key);
    const slot = qs(playerZoneSelector(p, "servants"))?.querySelector(".slot");
    const play = await playCard("MV000009", slot, { returnValidation: true });
    const after = auditCollectionBatch11aRuntime().players.find(player => player.playerId === p.key);
    return { play, before, after };
  });

  expect(twoEchoAttempt.before.souls).toBe(2);
  expect(twoEchoAttempt.play).toMatchObject({ success: true, cardId: "MV000009" });
  expect(twoEchoAttempt.play.paymentPlan.soulsToConsume).toBe(2);
  expect(twoEchoAttempt.play.paymentResult).toMatchObject({ success: true, soulsConsumed: 2, soulsRemaining: 0 });
  expect(twoEchoAttempt.after.souls).toBe(0);
  expect(twoEchoAttempt.after.hand).not.toContain("MV000009");
  expect(twoEchoAttempt.after.servants.filter(card => card.id === "MV000009")).toHaveLength(2);

  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("Collection exposes the five 11A Echo cards without obsolete public technical text", async ({ page }, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openCollection(page);

  const audit = await page.evaluate((ids) => {
    const publicFields = card => [card?.desc, card?.detail, card?.cond].filter(Boolean).join("\n");
    return Object.fromEntries(ids.map(id => {
      const card = CARDS.find(entry => entry.id === id);
      const publicText = publicFields(card);
      return [id, {
        exists: Boolean(card),
        name: card?.name || "",
        keywords: [...(card?.kw || [])],
        cost: card?.cost ?? null,
        resType: card?.resType || "",
        production: (card?.prod || []).map(item => ({ amount: Number(item.n || 0), icon: item.i || "" })),
        costDefinition: collectionCostDefinition(id),
        publicText,
        formattedText: formatPlayerFacingCardText(publicText, card),
        related: resolveRelatedCards(id).resolvedCards.map(entry => entry.id)
      }];
    }));
  }, TARGET_IDS);

  for (const id of TARGET_IDS) {
    expect(audit[id].exists, id).toBe(true);
    expect(audit[id].publicText, id + " no old mechanical resource").not.toMatch(/\bÂmes?\b/);
    expect(audit[id].publicText, id + " no visible RAME internals").not.toMatch(/RAME0|RAME21|RAME\*/);
    expect(audit[id].publicText, id + " no visible linked IDs").not.toMatch(/\[ID\s*=/);
    expect(audit[id].formattedText, id + " formatted no visible linked IDs").not.toMatch(/\[ID\s*=/);
  }

  expect(audit.AVS000008.publicText).toContain("1</strong> Écho");
  expect(audit.MV000009.keywords).toEqual(expect.arrayContaining(["Vengeance", "Écho", "Approvisionnement"]));
  expect(audit.MV000009.resType).toBe("Écho");
  expect(audit.MV000009.costDefinition).toEqual({ total: 2, groups: [{ op: null, resources: [{ key: "soul", amount: 2, explicit: true }] }] });
  expect(audit.MV000009.publicText).toContain("pile d’Échos");
  expect(audit.R000021.keywords).toContain("Écho");
  expect(audit.R000021.production.map(item => item.amount)).toEqual([5]);
  expect(audit.R000021.publicText).toContain("Fournit 5");
  expect(audit.R000027.publicText).toContain("occupe 2 emplacements");
  expect(audit.R000027.publicText).toContain("Esprits dérangés");
  expect(audit.R000027.related).toContain("MV000025");
  expect(audit.MV000025.publicText).toContain("Nécropole");
  expect(audit.MV000025.publicText).toContain("Vengeance");

  await attachDiagnostics(testInfo, diagnostics);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
