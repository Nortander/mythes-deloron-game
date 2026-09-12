import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics, openCollection, waitForVisibleHandStable} from "./helpers/eloron-ui.mjs";

const scenarios = [
  "collection-batch-15c-healing",
  "collection-batch-15c-protection",
  "collection-batch-15c-transformation"
];

const SORT_COLOR = "#6a3a9a";
const MIRACLE_MESSAGE = "La médecine elfique accomplit des miracles et revigore même les plus affectés.";
const MAIN_MESSAGE = "Par la grâce de la Lumière, l'imposition des mains guérit de nombreuses blessures.";
const PETRIFICATION_MESSAGE = "Une créature est magiquement pétrifiée ! Elle est désormais vulnérable... mais dure comme la pierre.";
const AURA_MESSAGE = "Un puissant enchantement protège et renforce un serviteur méritant.";
const RESCUE_READY_MESSAGE = "Une équipe de guérisseurs se tient prête à intervenir en urgence.";
const RESCUE_TRIGGER_MESSAGE = "Les guérisseurs ont sauvé un serviteur de la mort, mais son état reste critique. Espérons qu'il se retire des combats !";

function normalized(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

async function openBatch15CScenario(page, scenario) {
  await page.addInitScript(() => {
    const sequence = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
    const nativeRandom = Math.random.bind(Math);
    let index = 0;
    Math.random = () => (index < sequence.length ? sequence[index++] : nativeRandom());
  });
  await page.goto(`/code/partie-test-1.html?scenario=${scenario}&batch15c2=${Date.now()}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await waitForVisibleHandStable(page);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect(page.locator(".hc[data-id], .fc[data-id]").first()).toBeVisible();
}

async function chooseTwoTargetsInModal(page, cardId) {
  return page.evaluate(async (targetCardId) => {
    const targets = legalTargetsForRequirement(targetCardId, player1);
    const promise = chooseBoardTargets({
      title:"Test",
      prompt:"Choisissez une cible.",
      targets,
      minCount:1,
      maxCount:1
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const choices = Array.from(document.querySelectorAll('[data-testid="board-target-choice"]'));
    choices[0]?.click();
    const afterFirst = choices.map(node => node.classList.contains("is-selected"));
    choices[1]?.click();
    const afterSecond = choices.map(node => node.classList.contains("is-selected"));
    document.querySelector('[data-testid="board-target-confirm"]')?.click();
    const chosen = await promise;
    return {
      targetIds:targets.map(fc => fc.dataset.id),
      targetInstances:targets.map(fc => fc.dataset.instance || ""),
      afterFirst,
      afterSecond,
      chosen:chosen.map(fc => ({id:fc.dataset.id, instance:fc.dataset.instance || ""}))
    };
  }, cardId);
}

test("Batch 15C scenarios stay hidden and 15C2 card data/rendering is synchronized", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  for (const scenario of scenarios) {
    await openBatch15CScenario(page, scenario);
    const audit = await page.evaluate(() => ({
      publicOptionCount:document.querySelectorAll('#scenarioSelect option[value="' + selectedScenarioId() + '"]').length,
      cards:["S000003","S000010","S000021","S000028","S000034","S000061"].map(id => {
        const node = document.createElement("div");
        const model = CARDS_DATA[id];
        node.innerHTML = fmtDesc(formatPlayerFacingCardText(model?.detail || model?.cap || "", getCanonicalCardDisplayModel(id)), facColor(model?.fac));
        return {
          id,
          exists:!!model,
          type:model?.type || null,
          fac:model?.fac || null,
          sourceFaction:model?.sourceFaction || null,
          keywords:model?.kws || [],
          cost:EXTRA_CARD_COST_DEFINITIONS[id] || null,
          text:node.textContent,
          highlights:[...node.querySelectorAll("strong.kv")].map(strong => strong.textContent),
          inlineKeywords:[...node.querySelectorAll(".canonical-keyword-inline,.card-keyword")].map(strong => strong.textContent)
        };
      }),
      vfx000014:resolveVfxImageUrl("VFX000014")
    }));
    expect(audit.publicOptionCount).toBe(0);
    for (const card of audit.cards) {
      expect(card.exists, card.id).toBe(true);
      expect(card.type, card.id).toBe("Sort");
    }
    expect(audit.cards.find(card => card.id === "S000003").highlights).toEqual([]);
    expect(audit.cards.find(card => card.id === "S000010")).toMatchObject({fac:"sort", sourceFaction:"Humain"});
    expect(audit.cards.find(card => card.id === "S000010").highlights).toEqual(["6", "2"]);
    const petrification = audit.cards.find(card => card.id === "S000021");
    expect(petrification.text).toContain("0 ATK");
    expect(petrification.text).toContain("20 PDV");
    expect(petrification.text).not.toContain("0 d'attaque");
    expect(petrification.text).not.toContain("20 points de vie");
    expect(petrification.highlights).toEqual(expect.arrayContaining(["0 ATK", "20 PDV"]));
    expect(petrification.inlineKeywords).toContain("Rempart");
    expect(petrification.keywords).toEqual(expect.arrayContaining(["Aria","Lenya","Écho","Rempart"]));
    const aura = audit.cards.find(card => card.id === "S000028");
    expect(aura).toMatchObject({fac:"sort", sourceFaction:"Humain"});
    expect(aura.inlineKeywords).toContain("Insensible");
    expect(aura.highlights).toContain("+3");
    expect(audit.cards.find(card => card.id === "S000034").highlights).toContain("1");
    expect(audit.cards.find(card => card.id === "S000061").highlights).toEqual(["1", "3", "2", "1"]);
    expect(audit.vfx000014).toContain("../assets/effets-speciaux/VFX000014.png");
  }
  await openCollection(page);
  const collectionAudit = await page.evaluate(() => {
    const cards = ["S000010","S000021","S000028","S000034"].map(id => {
      const c = CARDS.find(card => card.id === id);
      const holder = document.createElement("div");
      holder.innerHTML = renderCard(c);
      const root = holder.firstElementChild;
      return {
        id,
        faction:c?.faction,
        frameClasses:Array.from(root?.querySelector(".ccard-frame")?.classList || []),
        color:root?.style.getPropertyValue("--card-faction-color") || "",
        text:root?.textContent || "",
        highlights:Array.from(root?.querySelectorAll("strong.kv")).map(node => node.textContent),
        keywords:Array.from(root?.querySelectorAll("em,.card-keyword,.canonical-keyword-inline")).map(node => node.textContent)
      };
    });
    return cards;
  });
  expect(collectionAudit.find(card => card.id === "S000010")).toMatchObject({faction:"Humain", color:SORT_COLOR});
  expect(collectionAudit.find(card => card.id === "S000010").frameClasses).toContain("sort-card");
  const collectionPetrification = collectionAudit.find(card => card.id === "S000021");
  expect(collectionPetrification.text).toContain("0 ATK");
  expect(collectionPetrification.text).toContain("20 PDV");
  expect(collectionPetrification.text).not.toContain("0 d'attaque");
  expect(collectionPetrification.text).not.toContain("20 points de vie");
  expect(collectionPetrification.highlights).toEqual(expect.arrayContaining(["0 ATK","20 PDV"]));
  expect(collectionPetrification.keywords).toContain("Rempart");
  expect(collectionAudit.find(card => card.id === "S000028")).toMatchObject({faction:"Humain", color:SORT_COLOR});
  expect(collectionAudit.find(card => card.id === "S000028").frameClasses).toContain("sort-card");
  expect(collectionAudit.find(card => card.id === "S000028").highlights).toContain("+3");
  expect(collectionAudit.find(card => card.id === "S000028").keywords).toContain("Insensible");
  expect(collectionAudit.find(card => card.id === "S000034").highlights).toContain("1");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000003 and S000010 heal allies with corrected messages, style and mono-target replacement", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15CScenario(page, "collection-batch-15c-healing");
  const selection = await chooseTwoTargetsInModal(page, "S000010");
  expect(selection.afterFirst.filter(Boolean)).toHaveLength(1);
  expect(selection.afterSecond.filter(Boolean)).toHaveLength(1);
  expect(selection.afterSecond[0]).toBe(false);
  expect(selection.afterSecond[1]).toBe(true);
  expect(selection.chosen).toHaveLength(1);
  expect(selection.chosen[0].instance).toBe(selection.targetInstances[1]);
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const summaries = () => livingServantCardsForPlayer(player1).map(targetSummary);
    const mainCard = document.querySelector('.hc[data-id="S000010"]');
    const mainStyle = {
      classList:Array.from(mainCard?.classList || []),
      color:mainCard?.style.getPropertyValue("--card-faction-color") || ""
    };
    const targets = legalTargetsForRequirement("S000010", player1);
    const promptPromise = chooseBoardTargets({
      title:"Main guérisseuse",
      prompt:"Choisissez le serviteur allié à soigner en priorité.",
      targets,
      minCount:1,
      maxCount:1
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const prompt = document.querySelector('[data-testid="board-target-prompt"]')?.textContent || "";
    document.querySelector('[data-testid="board-target-choice"]')?.click();
    document.querySelector('[data-testid="board-target-confirm"]')?.click();
    await promptPromise;
    const miraculous = await playCard("S000003", null);
    const miracleMessage = document.querySelector("#notif")?.textContent || "";
    const afterMiracle = summaries();
    const healer = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "EDB000005");
    const target = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000001");
    const rightAdjacent = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000005");
    await applyDamage(healer, 2);
    await applyDamage(target, 3);
    await applyDamage(rightAdjacent, 2);
    if (!player1.hand.includes("S000010")) player1.hand.push("S000010");
    refreshHand(player1);
    const hand = await playCard("S000010", null, {selectedTargetIds:[target.dataset.instance]});
    const mainMessage = document.querySelector("#notif")?.textContent || "";
    const afterHand = summaries();
    return {mainStyle, prompt, miraculous, miracleMessage, afterMiracle, hand, mainMessage, afterHand};
  });
  expect(result.mainStyle.classList).toContain("sort");
  expect(result.mainStyle.color).toBe(SORT_COLOR);
  expect(result.prompt).toBe("Choisissez le serviteur allié à soigner en priorité.");
  expect(result.miraculous.spellResolution.success).toBe(true);
  expect(result.miracleMessage).toBe(MIRACLE_MESSAGE);
  expect(result.afterMiracle.find(card => card.id === "EDB000005").pdv).toBe(3);
  expect(result.afterMiracle.find(card => card.id === "H000001").pdv).toBe(4);
  expect(result.afterMiracle.find(card => card.id === "H000005").pdv).toBe(5);
  expect(result.hand.spellResolution.success).toBe(true);
  expect(result.mainMessage).toBe(MAIN_MESSAGE);
  expect(result.afterHand.find(card => card.id === "EDB000005").pdv).toBe(3);
  expect(result.afterHand.find(card => card.id === "H000001").pdv).toBe(4);
  expect(result.afterHand.find(card => card.id === "H000005").pdv).toBe(5);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000028 and S000034 protect allied servants with corrected visuals and one-shot messaging", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15CScenario(page, "collection-batch-15c-protection");
  const selection = await chooseTwoTargetsInModal(page, "S000028");
  expect(selection.afterSecond.filter(Boolean)).toHaveLength(1);
  expect(selection.afterSecond[0]).toBe(false);
  expect(selection.afterSecond[1]).toBe(true);
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const auraCard = document.querySelector('.hc[data-id="S000028"]');
    const auraStyle = {
      classList:Array.from(auraCard?.classList || []),
      color:auraCard?.style.getPropertyValue("--card-faction-color") || ""
    };
    const auraTarget = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000001");
    const rescueTarget = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000005");
    const aura = await playCard("S000028", null, {selectedTargetIds:[auraTarget.dataset.instance]});
    const auraMessage = document.querySelector("#notif")?.textContent || "";
    const afterAura = targetSummary(auraTarget);
    const rescue = await playCard("S000034", null);
    const readyMessage = document.querySelector("#notif")?.textContent || "";
    const shieldAfterSpell = Number(player1.batch05RescueShield || 0);
    await applyDamage(rescueTarget, 1);
    const afterNonLethalMessage = document.querySelector("#notif")?.textContent || "";
    const shieldAfterNonLethal = Number(player1.batch05RescueShield || 0);
    const destroyed = await applyDamage(rescueTarget, 99);
    const triggerMessage = document.querySelector("#notif")?.textContent || "";
    const afterRescue = targetSummary(rescueTarget);
    const shieldAfterRescue = Number(player1.batch05RescueShield || 0);
    return {
      auraStyle,
      aura,
      auraMessage,
      afterAura,
      rescue,
      readyMessage,
      shieldAfterSpell,
      afterNonLethalMessage,
      shieldAfterNonLethal,
      destroyed,
      triggerMessage,
      afterRescue,
      shieldAfterRescue,
      stillOnBoard:rescueTarget.isConnected,
      graveyard:player1.graveyard.map(getRuntimeCardId)
    };
  });
  expect(result.auraStyle.classList).toContain("sort");
  expect(result.auraStyle.color).toBe(SORT_COLOR);
  expect(result.aura.spellResolution.success).toBe(true);
  expect(result.auraMessage).toBe(AURA_MESSAGE);
  expect(result.afterAura.insensible).toBe(true);
  expect(result.afterAura.pdvMax).toBe(7);
  expect(result.afterAura.pdv).toBe(5);
  expect(result.rescue.spellResolution.success).toBe(true);
  expect(result.readyMessage).toBe(RESCUE_READY_MESSAGE);
  expect(result.shieldAfterSpell).toBe(1);
  expect(result.afterNonLethalMessage).not.toBe(RESCUE_TRIGGER_MESSAGE);
  expect(result.shieldAfterNonLethal).toBe(1);
  expect(result.destroyed).toBe(false);
  expect(result.triggerMessage).toBe(RESCUE_TRIGGER_MESSAGE);
  expect(result.stillOnBoard).toBe(true);
  expect(result.afterRescue.pdv).toBe(1);
  expect(result.shieldAfterRescue).toBe(0);
  expect(result.graveyard).not.toContain("H000005");
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000021 rejects native and dynamic Insensible, then petrifies one occurrence with VFX and cleans on hand return", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15CScenario(page, "collection-batch-15c-transformation");
  const replacement = await chooseTwoTargetsInModal(page, "S000021");
  expect(replacement.afterSecond.filter(Boolean)).toHaveLength(1);
  expect(replacement.afterSecond[0]).toBe(false);
  expect(replacement.afterSecond[1]).toBe(true);
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const ally = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000005");
    const dynamicInsensitive = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000001");
    const nativeInsensitive = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "AVS000010");
    const target = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000006");
    const originalArt = target.querySelector(".fi")?.getAttribute("src") || "";
    const legalBefore = legalTargetsForRequirement("S000021", player1).map(targetSummary);
    const blockedNative = evaluateTargetRequirement("S000021", {player:player1, selectedTargetIds:[nativeInsensitive.dataset.instance]});
    const aura = await playCard("S000028", null, {selectedTargetIds:[dynamicInsensitive.dataset.instance]});
    if (!player1.hand.includes("S000021")) player1.hand.push("S000021");
    refreshHand(player1);
    const dynamicInstance = dynamicInsensitive.dataset.instance;
    const legalAfterAura = legalTargetsForRequirement("S000021", player1).map(targetSummary);
    const blockedDynamic = evaluateTargetRequirement("S000021", {player:player1, selectedTargetIds:[dynamicInsensitive.dataset.instance]});
    const legalForPetrification = legalTargetsForRequirement("S000021", player1).map(targetSummary);
    const resolved = await playCard("S000021", null, {selectedTargetIds:[target.dataset.instance]});
    const message = document.querySelector("#notif")?.textContent || "";
    const after = targetSummary(target);
    const petrifiedArt = target.querySelector(".fi")?.getAttribute("src") || "";
    const otherCopyTemplate = document.createElement("template");
    otherCopyTemplate.innerHTML = buildFC(target.dataset.id, target.dataset.player).trim();
    const otherCopyArt = otherCopyTemplate.content.firstElementChild?.querySelector(".fi")?.getAttribute("src") || "";
    const abilityAllowed = canResolveServantAbility(target, {triggerType:"passive"});
    const counterAllowed = canServantCounterAttack(target);
    const combatRefusal = await resolveCombat(target, ally);
    const preview = buildCanonicalCardPreview(target.dataset.id, {sourceElement:target, playerId:target.dataset.player});
    const previewText = (() => {
      const holder = document.createElement("div");
      holder.innerHTML = preview;
      return holder.textContent || "";
    })();
    const moveBack = await batch03MoveServantToOwnerHandOrGraveyard(target, {blockNextTurn:false});
    const returnedHandCard = document.querySelector('.hc[data-id="H000006"]');
    const rebuiltHandHtml = buildHC("H000006", "player2");
    const returned = {
      moveBack,
      handArt:returnedHandCard?.querySelector(".hc-art")?.getAttribute("src") || "",
      handText:returnedHandCard?.textContent || "",
      handContainsVfx:(returnedHandCard?.outerHTML || rebuiltHandHtml || "").includes("VFX000014"),
      rebuiltHandHtml,
      player2Hand:[...player2.hand]
    };
    const newTemplate = document.createElement("template");
    newTemplate.innerHTML = buildFC("H000006", "player2").trim();
    const fresh = newTemplate.content.firstElementChild;
    return {
      legalBefore,
      blockedNative,
      aura:aura.spellResolution || aura,
      dynamicInstance,
      legalAfterAura,
      blockedDynamic,
      legalForPetrification,
      resolved:resolved.spellResolution || resolved,
      message,
      after,
      originalArt,
      petrifiedArt,
      otherCopyArt,
      abilityAllowed,
      counterAllowed,
      combatRefusal,
      preview,
      previewText,
      returned,
      fresh:targetSummary(fresh),
      freshArt:fresh.querySelector(".fi")?.getAttribute("src") || ""
    };
  });
  expect(result.legalBefore.map(card => card.id)).not.toContain("AVS000010");
  expect(result.blockedNative.allowed).toBe(false);
  expect(result.aura.success).toBe(true);
  expect(result.legalAfterAura.map(card => card.instance)).not.toContain(result.dynamicInstance);
  expect(result.blockedDynamic.allowed).toBe(false);
  expect(result.legalForPetrification.map(card => card.id)).toContain("H000006");
  expect(result.resolved.success).toBe(true);
  expect(result.message).toBe(PETRIFICATION_MESSAGE);
  expect(result.after.batch15cPetrified).toBe(true);
  expect(result.after.batch15cPetrifiedVfx).toBe("VFX000014");
  expect(result.after.atk).toBe(0);
  expect(result.after.pdv).toBe(20);
  expect(result.after.pdvMax).toBe(20);
  expect(result.after.insensible).toBe(false);
  expect(result.after.rempart).toBe(true);
  expect(result.petrifiedArt).toContain("VFX000014.png");
  expect(result.otherCopyArt).toBe(result.originalArt);
  expect(result.preview).toContain("VFX000014.png");
  expect(result.previewText).toContain("Subit les effets de Pétrification");
  expect(result.previewText).toContain("Rempart");
  expect(result.abilityAllowed).toBe(false);
  expect(result.counterAllowed).toBe(false);
  expect(result.combatRefusal.success).toBe(false);
  expect(result.combatRefusal.reason).toBe("petrified-attacker");
  expect(result.returned.moveBack.destination).toBe("hand");
  expect(result.returned.player2Hand).toContain("H000006");
  expect(result.returned.handContainsVfx).toBe(false);
  expect(result.returned.rebuiltHandHtml).toContain(result.originalArt);
  expect(result.returned.handText).not.toContain("Pétrification");
  expect(result.fresh.batch15cPetrified).toBe(false);
  expect(result.fresh.atk).toBe(2);
  expect(result.fresh.pdv).toBe(4);
  expect(result.fresh.pdvMax).toBe(4);
  expect(result.fresh.rempart).toBe(false);
  expect(result.freshArt).toBe(result.originalArt);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000061 consumes three incoming attacks with protected animation before Gel", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15CScenario(page, "collection-batch-15c-transformation");
  const result = await page.evaluate(async () => {
    window.__mythesRandom = () => 0;
    const protectedAlly = livingServantCardsForPlayer(player1).find(fc => fc.dataset.id === "H000005");
    const attacker = livingServantCardsForPlayer(player2).find(fc => fc.dataset.id === "H000006");
    batch03UpdateStats(attacker, {pdvMax:20, pdv:20});
    const animationOrder = [];
    const originalPulse = pulseBatch03Ability;
    const originalGel = tryApplyGel;
    pulseBatch03Ability = (...args) => {
      animationOrder.push({kind:"pulse", reason:args[1], target:args[0]?.dataset?.id || ""});
      return originalPulse(...args);
    };
    tryApplyGel = (...args) => {
      animationOrder.push({kind:"gel", target:args[0]?.targetFC?.dataset?.id || ""});
      return originalGel(...args);
    };
    const shield = await playCard("S000061", null, {selectedTargetIds:[protectedAlly.dataset.instance]});
    const afterShield = {
      summary:targetSummary(protectedAlly),
      text:(() => {
        const holder = document.createElement("div");
        holder.innerHTML = buildCanonicalCardPreview(protectedAlly.dataset.id, {sourceElement:protectedAlly, playerId:protectedAlly.dataset.player});
        return holder.textContent || "";
      })()
    };
    await applyDamage(protectedAlly, 1);
    const afterNonAttackDamage = targetSummary(protectedAlly);
    const attacks = [];
    for (let index = 0; index < 4; index++) {
      if (index > 0) {
        delete attacker.dataset.frozen;
        delete attacker.dataset.frozenLastTurn;
        delete attacker.dataset.exhausted;
        attacker.classList.remove("fc-frozen","fc-exhausted");
        protectedAlly.classList.remove("anim-damage");
      }
      const before = {protected:targetSummary(protectedAlly), attacker:targetSummary(attacker)};
      const combat = await resolveCombat(attacker, protectedAlly);
      const after = {protected:targetSummary(protectedAlly), attacker:{...targetSummary(attacker), frozen:Number(attacker.dataset.frozen || 0)}};
      const previewText = (() => {
        const holder = document.createElement("div");
        holder.innerHTML = buildCanonicalCardPreview(protectedAlly.dataset.id, {sourceElement:protectedAlly, playerId:protectedAlly.dataset.player});
        return holder.textContent || "";
      })();
      attacks.push({before, combat, after, previewText});
    }
    pulseBatch03Ability = originalPulse;
    tryApplyGel = originalGel;
    const events = auditCollectionBatch09Runtime().state.events;
    return {shield, afterShield, afterNonAttackDamage, attacks, events, animationOrder};
  });
  expect(result.shield.spellResolution.success).toBe(true);
  expect(result.afterShield.summary.batch09IceShieldCharges).toBe(3);
  expect(normalized(result.afterShield.text)).toContain("Bénéficie de « Bouclier de glace »");
  expect(result.afterShield.text).toContain("3 prochaines attaques");
  expect(result.afterShield.text).toContain("Gel");
  expect(result.afterNonAttackDamage.batch09IceShieldCharges).toBe(3);
  expect(result.attacks[0].after.protected.batch09IceShieldCharges).toBe(2);
  expect(result.attacks[0].previewText).toContain("2 prochaines attaques");
  expect(result.attacks[1].after.protected.batch09IceShieldCharges).toBe(1);
  expect(result.attacks[1].previewText).toContain("1 prochaines attaques");
  expect(result.attacks[2].after.protected.batch09IceShieldCharges).toBe(0);
  expect(result.attacks[2].previewText).not.toContain("Bouclier de glace");
  expect(result.attacks[3].before.protected.pdv - result.attacks[3].after.protected.pdv).toBe(result.attacks[3].before.attacker.atk);
  const triggerEvents = result.events.filter(event => event.type === "ice-shield-triggered");
  expect(triggerEvents).toHaveLength(3);
  expect(triggerEvents.every(event => !!event.gelApplied)).toBe(true);
  const firstTriggeredPulse = result.animationOrder.findIndex(event => event.kind === "pulse" && event.reason === "batch09-ice-shield-trigger" && event.target === "H000005");
  const firstTriggeredGel = result.animationOrder.findIndex(event => event.kind === "gel" && event.target === "H000006");
  expect(firstTriggeredPulse).toBeGreaterThanOrEqual(0);
  expect(firstTriggeredGel).toBeGreaterThan(firstTriggeredPulse);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});
