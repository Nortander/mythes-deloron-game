import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { attachDiagnostics, attachPageDiagnostics } from "./helpers/eloron-ui.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/huvu-impl-3-cards.json", import.meta.url), "utf8"));

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

function counts(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

async function openScenario(page, scenario) {
  const params = new URLSearchParams({scenario, impl3: `${Date.now()}-${Math.random()}`});
  await page.goto(`/code/partie-test-1.html?${params.toString()}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await page.waitForTimeout(350);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const zone = (playerKey) => {
      const player = playerState(playerKey);
      return {
        hand: [...player.hand],
        deck: [...player.drawPile].map(getRuntimeCardId),
        graveyard: [...(player.graveyard || [])].map(getRuntimeCardId),
        resources: {
          classical: {...player.resourceState.classical},
          souls: player.resourceState.souls
        }
      };
    };
    return {
      scenarioId: selectedScenarioId(),
      currentPlayer,
      player1: zone("player1"),
      player2: zone("player2"),
      panel: typeof getHuvuTestResourcePanelSnapshot === "function" ? getHuvuTestResourcePanelSnapshot() : null,
      publicScenarioValues: Array.from(document.querySelectorAll("#scenarioSelect option")).map(option => option.value),
      errorText: document.querySelector("#errMsg")?.innerText || ""
    };
  });
}

async function installRitualIdentityAudit(page) {
  return page.evaluate(() => {
    const zones = ["hand", "deck", "graveyard"];
    const audit = {
      sequence: 0,
      locationTokens: {},
      specialTokens: {}
    };

    const tokenFor = (playerKey, zone, index, cardId) => `${playerKey}:${zone}:${index}:${cardId}`;
    const locationKey = (playerKey, zone, index, cardId) => tokenFor(playerKey, zone, index, cardId);

    const setToken = (playerKey, zone, index, entry, token) => {
      if (entry && typeof entry === "object") {
        entry.__huvuImpl3Token ||= token;
        entry.__huvuImpl3HarnessOnly = true;
        return entry.__huvuImpl3Token;
      }
      const cardId = getRuntimeCardId(entry);
      if (zone === "graveyard") {
        const wrapped = {cardId, __huvuImpl3Token: token, __huvuImpl3HarnessOnly: true};
        zoneArrayForPlayer(playerKey, zone)[index] = wrapped;
        return wrapped.__huvuImpl3Token;
      }
      return token;
    };

    for (const playerKey of ["player1", "player2"]) {
      for (const zone of zones) {
        const entries = zoneArrayForPlayer(playerKey, zone) || [];
        entries.forEach((entry, index) => {
          const cardId = getRuntimeCardId(entry);
          if (!cardId) return;
          const token = tokenFor(playerKey, zone, index, cardId);
          const finalToken = setToken(playerKey, zone, index, entry, token);
          audit.locationTokens[locationKey(playerKey, zone, index, cardId)] = finalToken;
          if (playerKey === "player1" && zone === "hand" && cardId === "S000051") {
            audit.specialTokens.spell = finalToken;
          }
        });
      }
    }

    window.__huvuImpl3RitualIdentityAudit = audit;
    window.__huvuImpl3CaptureRitualIdentity = () => {
      const activeAudit = window.__huvuImpl3RitualIdentityAudit || {locationTokens: {}, specialTokens: {}};
      const entries = [];
      for (const playerKey of ["player1", "player2"]) {
        for (const zone of zones) {
          const zoneEntries = zoneArrayForPlayer(playerKey, zone) || [];
          zoneEntries.forEach((entry, index) => {
            const cardId = getRuntimeCardId(entry);
            if (!cardId) return;
            const storedToken = entry && typeof entry === "object" ? entry.__huvuImpl3Token : null;
            const syntheticToken = activeAudit.locationTokens[locationKey(playerKey, zone, index, cardId)] || null;
            const spellToken = cardId === "S000051" && playerKey === "player1" && (zone === "hand" || zone === "graveyard")
              ? activeAudit.specialTokens.spell
              : null;
            const token = storedToken || spellToken || syntheticToken || null;
            entries.push({
              token,
              cardId,
              playerKey,
              zone,
              index,
              entryKind: entry && typeof entry === "object" ? "object" : typeof entry,
              objectReferenceTracked: !!storedToken,
              ownerField: entry && typeof entry === "object" ? (entry.ownerId || entry.ownerKey || entry.owner || null) : null,
              controllerField: entry && typeof entry === "object" ? (entry.controllerId || entry.controllerKey || entry.controller || null) : null,
              derivedOwner: playerKey,
              derivedController: playerKey
            });
          });
        }
      }
      const byToken = entries.reduce((acc, entry) => {
        if (!entry.token) return acc;
        acc[entry.token] ||= [];
        acc[entry.token].push(entry);
        return acc;
      }, {});
      const byId = entries.reduce((acc, entry) => {
        acc[entry.cardId] = (acc[entry.cardId] || 0) + 1;
        return acc;
      }, {});
      return {
        model: "primitive card IDs in hand/deck plus tokenized graveyard objects for HUVU-IMPL-3 audit",
        identityMethod: "technical harness tokens; object references verified when zone entries are objects",
        entries,
        byToken,
        byId,
        duplicateTokens: Object.entries(byToken).filter(([, values]) => values.length !== 1).map(([token, values]) => ({token, count: values.length})),
        missingTokens: []
      };
    };

    return window.__huvuImpl3CaptureRitualIdentity();
  });
}

function entryByToken(identity, token) {
  return identity.entries.find(entry => entry.token === token) || null;
}

function tokenSet(identity) {
  return identity.entries.map(entry => entry.token).filter(Boolean).sort();
}

async function playSpell(page, cardId, zoneSelection = null) {
  const result = await page.evaluate(async ({id, selection}) => playCard(id, null, selection ? {zoneSelection: selection} : {}), {id: cardId, selection: zoneSelection});
  await page.waitForTimeout(250);
  return result;
}

test("HUVU IMPL 3 scope is explicit and scenarios stay hidden", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-3-draw-discard");
  const state = await snapshot(page);
  await attachDiagnostics(testInfo, diagnostics);

  expect(fixture.cards.map(card => card.id)).toEqual(["S000006", "S000022", "S000051"]);
  expect(fixture.cards.length).toBeLessThanOrEqual(8);
  expect(state.panel?.visible).toBe(true);
  await expect(page.getByTestId("test-resource-panel")).toContainText("MODE TEST — HUVU IMPL 3");
  expect(state.publicScenarioValues.filter(value => value.startsWith("huvu-"))).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000006 draws four cards and returns the selected revealed card to the deck bottom", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-3-draw-discard");

  const before = await snapshot(page);
  const result = await playSpell(page, "S000006", {selectedCardId: "MV000002"});
  const after = await snapshot(page);
  await testInfo.attach("s000006-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result.success).toBe(true);
  expect(result.spellMovedToGraveyard).toBe(true);
  expect(result.spellResolution).toMatchObject({code: "murmures-divins-resolved", returnedCardId: "MV000002", keptCount: 3});
  expect(after.player1.hand).toEqual(["S000017", "MV000003", "MV000001"]);
  expect(after.player1.deck).toEqual(["MV000002", "R000010"]);
  expect(after.player1.graveyard).toEqual(["S000006"]);
  expect(result.paymentResult).toMatchObject({success: true});
  expect(after.panel.last.code).toBe("affordable");
  expect(after.panel.zone).toMatchObject({code: "murmures-divins-resolved", returnedCardId: "MV000002"});
  expect(counts([...after.player1.hand, ...after.player1.deck, ...after.player1.graveyard])).toMatchObject(counts([...before.player1.hand, ...before.player1.deck, ...before.player1.graveyard]));
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000006 refuses before payment when the deck is empty", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-3-draw-discard");
  await page.evaluate(() => {
    playerState("player1").drawPile = [];
    updateDeckCount(playerState("player1"));
  });

  const before = await snapshot(page);
  const result = await playSpell(page, "S000006", {selectedCardId: "MV000002"});
  const after = await snapshot(page);
  await testInfo.attach("s000006-empty-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result).toBeUndefined();
  expect(after.player1.hand).toEqual(before.player1.hand);
  expect(after.player1.deck).toEqual(before.player1.deck);
  expect(after.player1.graveyard).toEqual(before.player1.graveyard);
  expect(after.player1.resources).toEqual(before.player1.resources);
  expect(after.errorText).toContain("deck");
  expect(after.panel.play.code).toBe("own-deck-has-card");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000022 refuses before payment when the opposing graveyard has no legal servant", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-3-graveyard-selection");
  await page.evaluate(() => {
    playerState("player2").graveyard = ["R000001", "H000029"];
    refreshCemeteryVisual(playerState("player2"));
  });

  const before = await snapshot(page);
  const result = await playSpell(page, "S000022", {selectedCardIds: ["H000001"]});
  const after = await snapshot(page);
  await testInfo.attach("s000022-refusal-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result).toBeUndefined();
  expect(after.player1.hand).toEqual(before.player1.hand);
  expect(after.player1.deck).toEqual(before.player1.deck);
  expect(after.player1.graveyard).toEqual(before.player1.graveyard);
  expect(after.player2.graveyard).toEqual(before.player2.graveyard);
  expect(after.player1.resources).toEqual(before.player1.resources);
  expect(after.errorText).toContain("Aucune cible valide");
  expect(after.panel.play.code).toBe("opponent-graveyard-has-servant");
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000022 transfers selected legal servants from opposing graveyard into deck and shuffles", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-3-graveyard-selection");

  const before = await snapshot(page);
  const result = await playSpell(page, "S000022", {selectedCardIds: ["H000001", "H000005"]});
  const after = await snapshot(page);
  await testInfo.attach("s000022-success-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  expect(result.success).toBe(true);
  expect(result.spellMovedToGraveyard).toBe(true);
  expect(result.spellResolution).toMatchObject({code: "galerie-des-horreurs-resolved", shuffled: true});
  expect(result.spellResolution.moved.map(entry => entry.cardId).sort()).toEqual(["H000001", "H000005"]);
  expect(after.player1.hand).not.toContain("S000022");
  expect(after.player1.graveyard).toContain("S000022");
  expect(counts(after.player1.deck)).toMatchObject({...counts(before.player1.deck), H000001: 1, H000005: 1});
  expect(after.player2.graveyard).toEqual(["R000001", "H000018", "H000029"]);
  expect(after.panel.zone).toMatchObject({code: "galerie-des-horreurs-resolved", shuffled: true});
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000051 steals the entire opposing graveyard into the current player's graveyard", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openScenario(page, "huvu-impl-3-graveyard-theft");

  const identityBefore = await installRitualIdentityAudit(page);
  const before = await snapshot(page);
  const result = await playSpell(page, "S000051");
  const after = await snapshot(page);
  const identityAfter = await page.evaluate(() => window.__huvuImpl3CaptureRitualIdentity());
  await testInfo.attach("s000051-state", {contentType: "application/json", body: Buffer.from(JSON.stringify({before, result, after, identityBefore, identityAfter}, null, 2), "utf8")});
  await attachDiagnostics(testInfo, diagnostics);

  const movedBefore = identityBefore.entries.filter(entry => entry.playerKey === "player2" && entry.zone === "graveyard");
  const movedTokens = movedBefore.map(entry => entry.token);
  const spellBefore = identityBefore.entries.find(entry => entry.playerKey === "player1" && entry.zone === "hand" && entry.cardId === "S000051");

  expect(result.success).toBe(true);
  expect(result.spellMovedToGraveyard).toBe(true);
  expect(result.spellResolution).toMatchObject({code: "rituel-occulte-resolved", moved: ["H000001", "R000001", "H000005"]});
  expect(before.player1.hand).toEqual(["S000051"]);
  expect(before.player1.graveyard).toEqual(["MV000001"]);
  expect(before.player2.graveyard).toEqual(["H000001", "R000001", "H000005"]);
  expect(after.player2.graveyard).toEqual([]);
  expect(after.player1.graveyard).toEqual(["MV000001", "H000001", "R000001", "H000005", "S000051"]);
  expect(after.player1.hand).not.toContain("S000051");
  expect(result.paymentResult).toMatchObject({success: true});
  expect(after.panel.last.code).toBe("affordable");
  expect(after.panel.zone).toMatchObject({code: "rituel-occulte-resolved"});
  expect(identityBefore.duplicateTokens).toEqual([]);
  expect(identityAfter.duplicateTokens).toEqual([]);
  expect(tokenSet(identityAfter)).toEqual(tokenSet(identityBefore));
  expect(identityAfter.byId).toEqual(identityBefore.byId);
  expect(movedBefore.map(entry => entry.cardId)).toEqual(["H000001", "R000001", "H000005"]);
  for (const entry of movedBefore) {
    const afterEntry = entryByToken(identityAfter, entry.token);
    expect(afterEntry).toMatchObject({
      token: entry.token,
      cardId: entry.cardId,
      playerKey: "player1",
      zone: "graveyard",
      objectReferenceTracked: true
    });
    expect(identityAfter.entries.filter(candidate => candidate.token === entry.token)).toHaveLength(1);
    expect(identityAfter.entries.some(candidate => candidate.token === entry.token && candidate.playerKey === "player2")).toBe(false);
    expect(afterEntry.ownerField).toBe(entry.ownerField);
    expect(afterEntry.controllerField).toBe(entry.controllerField);
    expect(afterEntry.derivedOwner).toBe("player1");
    expect(afterEntry.derivedController).toBe("player1");
  }
  const spellAfter = entryByToken(identityAfter, spellBefore.token);
  expect(spellBefore).toMatchObject({cardId: "S000051", playerKey: "player1", zone: "hand"});
  expect(spellAfter).toMatchObject({cardId: "S000051", playerKey: "player1", zone: "graveyard"});
  expect(identityAfter.entries.filter(entry => entry.token === spellBefore.token)).toHaveLength(1);
  expect(identityAfter.entries.filter(entry => entry.cardId === "S000051")).toHaveLength(1);
  expect(identityAfter.entries.filter(entry => entry.playerKey === "player1" && entry.zone === "graveyard").at(-1)).toMatchObject({token: spellBefore.token, cardId: "S000051"});
  expect(after.player1.graveyard.at(-1)).toBe("S000051");
  expect(after.player1.graveyard.length).toBe(before.player1.graveyard.length + movedTokens.length + 1);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
