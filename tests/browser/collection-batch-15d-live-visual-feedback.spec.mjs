import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

test.setTimeout(90000);

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

async function openBatch15DScenario(page, scenario, extra = "") {
  await page.addInitScript(() => {
    const sequence = [0, 0.18, 0.36, 0.54, 0.72, 0.9, 0.08, 0.26, 0.44, 0.62, 0.8];
    const nativeRandom = Math.random.bind(Math);
    let index = 0;
    Math.random = () => (index < sequence.length ? sequence[index++] : nativeRandom());
  });
  await page.goto(`/code/partie-test-1.html?scenario=${scenario}${extra}&batch15d2=${Date.now()}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.querySelector("#btnEndTurn")?.classList.contains("vis") === true), {timeout:15000}).toBe(true);
  await installBatch15D2Observer(page);
}

async function installBatch15D2Observer(page) {
  await page.evaluate(() => {
    window.__batch15d2Observed = [];
    const readNode = node => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
      const element = node;
      const matches = element.matches?.("[data-batch15d-transfer],[data-batch15d-nain-pulse],[data-batch15d-hand-halo],[data-batch15d-deck-pulse],.batch15d-transfer-clone,.batch15d-nain-board-pulse,.batch15d-nain-hand-halo,.batch15d-nain-deck-pulse");
      if (!matches) return null;
      return {
        className:element.className || "",
        dataset:{...element.dataset},
        text:element.textContent?.trim() || ""
      };
    };
    const remember = node => {
      const direct = readNode(node);
      if (direct) window.__batch15d2Observed.push(direct);
      if (node?.querySelectorAll) {
        node.querySelectorAll("[data-batch15d-transfer],[data-batch15d-nain-pulse],[data-batch15d-hand-halo],[data-batch15d-deck-pulse],.batch15d-transfer-clone,.batch15d-nain-board-pulse,.batch15d-nain-hand-halo,.batch15d-nain-deck-pulse").forEach(child => {
          const item = readNode(child);
          if (item) window.__batch15d2Observed.push(item);
        });
      }
    };
    window.__batch15d2Observer?.disconnect?.();
    window.__batch15d2Observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(remember);
        if (mutation.type === "attributes") remember(mutation.target);
      }
    });
    window.__batch15d2Observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:["class", "data-batch15d-transfer", "data-batch15d-nain-pulse", "data-batch15d-hand-halo", "data-batch15d-deck-pulse"]});
  });
}

async function playSpellFromHand(page, cardId, waitMs = 5600) {
  await expect(page.locator(`.hc[data-id="${cardId}"]`).first()).toBeVisible();
  await page.evaluate(id => {
    const card = document.querySelector(`.hc[data-id="${id}"]`);
    const target = document.querySelector(".board-bg");
    if (!card || !target) throw new Error(`Unable to drag ${id}`);
    const dataTransfer = new DataTransfer();
    card.dispatchEvent(new DragEvent("dragstart", {bubbles:true, cancelable:true, dataTransfer}));
    target.dispatchEvent(new DragEvent("dragover", {bubbles:true, cancelable:true, dataTransfer}));
    target.dispatchEvent(new DragEvent("drop", {bubbles:true, cancelable:true, dataTransfer}));
  }, cardId);
  await page.waitForTimeout(waitMs);
}

async function state(page) {
  return page.evaluate(() => ({
    notification:document.querySelector("#notif")?.textContent || "",
    error:document.querySelector("#errMsg")?.textContent || "",
    observed:window.__batch15d2Observed || [],
    hand:playerHand(player1).map(getRuntimeCardId),
    deck:playerDrawPile(player1).map(getRuntimeCardId),
    board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id),
    runtimeMaxS000014:CARDS_DATA.S000014?.max ?? null
  }));
}

function transferCount(result, transferName) {
  return new Set(result.observed
    .filter(event => event.dataset.batch15dTransfer === transferName)
    .map(event => event.dataset.batch15dTransferSeq || `${event.dataset.batch15dCardId}-${event.dataset.batch15dSourceZone}-${event.dataset.batch15dTransfer}`)).size;
}

test("S000009 uses the exact Batch 15D2 message and visible deck-to-board transfers", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-invocation");
  await playSpellFromHand(page, "S000009");
  const result = await state(page);
  expect(result.notification).toBe("LA RÉUNION EST UN SUCCÈS ! LES GOBELINS AFFLUENT DE TOUS CÔTÉS !");
  expect(result.board.filter(id => id.startsWith("GOB"))).toEqual(["GOB000002", "GOB000001", "GOB000002"]);
  expect(transferCount(result, "deck-to-board")).toBe(3);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000013 highlights upgraded Nains in board, hand and deck with the exact Batch 15D2 message", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-replacement");
  await playSpellFromHand(page, "S000013");
  const result = await state(page);
  expect(result.notification).toBe("L'EXPÉRIENCE DU COMBAT CHANGE LES SIMPLES GUERRIERS EN REDOUTABLES VÉTÉRANS ET COMBATTANTS D'ÉLITE !");
  expect(result.board).toContain("N000008");
  expect(result.hand).toContain("N000008");
  expect(result.deck).toContain("N000008");
  expect(result.observed.some(event => event.dataset.batch15dNainPulse === "board")).toBe(true);
  expect(result.observed.some(event => event.dataset.batch15dHandHalo === "N000008")).toBe(true);
  expect(result.observed.some(event => event.dataset.batch15dDeckPulse === "N000008")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000014 uses the full active Orc pool, maxOwned 2, no generated Initiative, and exact message", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-invocation");
  await playSpellFromHand(page, "S000014");
  const result = await state(page);
  const summonedOrcs = result.board.filter(id => id.startsWith("ORC"));
  const allowedOrcs = new Set(["ORC000001", "ORC000002", "ORC000004", "ORC000005", "ORC000008", "ORC000009", "ORC000013", "ORC000017"]);
  expect(result.notification).toBe("AUCUNE TRIBU ORC NE PEUT RÉSISTER À L'APPEL D'UN PILLAGE FACILE ET SANGLANT !");
  expect(result.runtimeMaxS000014).toBe(2);
  expect(summonedOrcs.every(id => allowedOrcs.has(id))).toBe(true);
  expect(result.observed.some(event => /initiative/i.test(`${event.className} ${event.text}`))).toBe(false);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000023 and S000052 expose source-specific transfers and exact Batch 15D2 messages", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-pact-revenants");
  await playSpellFromHand(page, "S000023");
  const pacte = await state(page);
  expect(pacte.notification).toBe("UN REJETON DU TISSEUR DE GIVRE RÉPOND À VOTRE APPEL !");
  expect(pacte.observed.some(event => event.dataset.batch15dTransfer === "hand-to-board")).toBe(true);

  await openBatch15DScenario(page, "collection-batch-15d-pact-revenants");
  await playSpellFromHand(page, "S000052");
  const revenants = await state(page);
  expect(revenants.notification).toBe("UN SOMBRE RITUEL RAPPELLE DES SERVITEURS DE LA TOMBE !");
  expect(transferCount(revenants, "deck-to-board")).toBe(3);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000038, S000047 and normal Gabar draws use the exact Batch 15D2 messages", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-replacement");
  await playSpellFromHand(page, "S000038");
  const codeCouleurs = await state(page);
  expect(codeCouleurs.notification).toBe("VOUS CONNAISSEZ L'EXPRESSION, « DERRIÈRE CHAQUE GOBELIN S'EN CACHE UN ENCORE PLUS RETORS ? »");
  expect(transferCount(codeCouleurs, "copy-to-hand")).toBe(2);

  await openBatch15DScenario(page, "collection-batch-15d-invocation");
  await playSpellFromHand(page, "S000047");
  const volee = await state(page);
  expect(volee.notification).toBe("ATTENTION ! LES GOBELINS ONT ENVOYÉ DES SURINEURS TRANCHER DES TENDONS ET EXPOSER DES ENTRAILLES !");

  await openBatch15DScenario(page, "collection-batch-15d-gabar");
  await page.locator("#btnEndTurn").click();
  await expect.poll(() => page.evaluate(() => document.querySelector("#btnEndTurn")?.disabled === false)).toBe(true);
  await page.locator("#btnEndTurn").click();
  await expect.poll(() => page.evaluate(() => currentPlayer === "player1" && document.querySelector("#btnEndTurn")?.disabled === false)).toBe(true);
  const gabar = await state(page);
  expect(gabar.notification).toBe("LE GRIMOIRE MAGIQUE DU MAÎTRE N'A PLUS DE SECRETS POUR GABAR !");
  expect(gabar.hand).toContain("H000034");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
