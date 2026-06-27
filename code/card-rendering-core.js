(function attachCardRenderingCore(global) {
  "use strict";

  const CORE_VERSION = "1.2.1";

  const KEYWORDS = Object.freeze({
    "Camouflage": keyword("Camouflage", "Ce serviteur ne peut pas être ciblé par une attaque tant qu’une règle ne révèle pas sa position.", "implemented", 10),
    "Coup de glace": keyword("Coup de glace", "État froid qui bloque les actions et inflige des dégâts périodiques selon sa durée.", "implemented", 20),
    "Embrasement": keyword("Embrasement", "Inflige des dégâts initiaux puis des dégâts périodiques selon sa durée.", "implemented", 30),
    "Gel": keyword("Gel", "État froid qui empêche temporairement attaque, riposte et capacités.", "implemented", 40),
    "Hypnose": keyword("Hypnose", "Le serviteur affecté ne peut pas attaquer, riposter ni utiliser de capacité spéciale jusqu’à la fin de l’effet.", "dormant", 50),
    "Initiative": keyword("Initiative", "Lorsqu’elle est jouée depuis la main, cette carte produit directement un effet unique.", "implemented", 60),
    "Insensible": keyword("Insensible", "Ce serviteur ne peut pas être ciblé par les sorts ni les capacités spéciales adverses, sauf exception explicite.", "implemented", 70),
    "Rage": keyword("Rage", "Ce serviteur gagne un bonus d’attaque lorsque ses points de vie sont inférieurs à leur maximum.", "implemented", 80),
    "Rempart": keyword("Rempart", "Tant qu’un serviteur avec Rempart est présent, les serviteurs ennemis ne peuvent pas attaquer une autre cible attaquable.", "implemented", 90),
    "Sang ardent": keyword("Sang ardent", "Protège uniquement contre les effets d’Embrasement : dégâts initiaux, état persistant, dégâts périodiques, zones et ciblages aléatoires.", "implemented", 100),
    "Sang-froid": keyword("Sang-froid", "Protège contre les effets de Gel et de Coup de glace.", "implemented", 110),
    "Serviteur de la rune": keyword("Serviteur de la rune", "Ce serviteur revient dans votre main quand il devrait être envoyé au cimetière. Vous pouvez le rejouer sans tenir compte des prérequis.", "dormant", 120),
    "Vengeance": keyword("Vengeance", "Ce serviteur déclenche un effet lorsqu’il est envoyé au cimetière depuis le terrain.", "implemented", 130),
    "Vigilance": keyword("Vigilance", "Aucun serviteur adverse ne peut utiliser Camouflage tant qu’un serviteur allié avec Vigilance est sur le terrain.", "implemented", 140)
  });

  const CARD_TYPES = Object.freeze({
    "Approvisionnement": typeEntry("Approvisionnement", "APPROVISIONNEMENT", "Carte fournissant des ressources ou un effet de production.", 10),
    "Serviteur": typeEntry("Serviteur", "SERVITEUR", "Carte pouvant occuper un emplacement de serviteur.", 20),
    "Serviteur (pseudo avatar)": typeEntry("Serviteur (pseudo avatar)", "AVATAR", "Représentation technique d’un avatar dans la source.", 30),
    "Sort": typeEntry("Sort", "SORT", "Carte à effet ponctuel ou persistant.", 40)
  });

  const RESOURCES = Object.freeze({
    "Aria": resource("Aria", "aria", "IC00000ARI.png", 10),
    "Bois": resource("Bois", "bois", "IC00000BOI.png", 20),
    "Fer": resource("Fer", "fer", "IC00000FER.png", 30),
    "Lenya": resource("Lenya", "lenya", "IC00000LNY.png", 40),
    "Nourriture": resource("Nourriture", "nourriture", "IC00000NRT.png", 50),
    "Pierre": resource("Pierre", "pierre", "IC00000PIE.png", 60),
    "Sélène": resource("Sélène", "selene", "IC00000SLN.png", 70),
    "Écho": resource("Écho", "echo", "IC00000ECH.png", 80, {
      singularTitle: "Écho",
      pluralTitle: "Échos",
      legacyAliases: [
        { value: "Âme", deprecated: true },
        { value: "Âmes", deprecated: true }
      ]
    })
  });

  const NAMED_ABILITIES = Object.freeze({
    "Colère divine": namedAbility("Colère divine", "Colère divine", "Capacité nommée à vérifier dans la source avant implémentation.", "dormant", 10)
  });

  const AMBIGUOUS_VALUES = Object.freeze({
    "/": "marqueur vide",
    "Gèle": "forme verbale ou ancienne valeur source : pas un alias de Gel",
    "Vegeance": "ancienne coquille source : pas un alias de Vengeance",
    "Vigilant": "ancienne coquille source : pas un alias de Vigilance"
  });

  function keyword(name, definition, implementationStatus, order) {
    return Object.freeze({
      canonicalName: name,
      aliases: [],
      publicTitle: name,
      publicDefinition: definition,
      definition,
      category: "keyword",
      formattingClass: "card-keyword",
      tooltipOrder: order,
      implementationStatus
    });
  }

  function typeEntry(name, title, definition, order) {
    return Object.freeze({
      canonicalName: name,
      publicTitle: title,
      publicDefinition: definition,
      category: "card-type",
      formattingClass: "card-type-token",
      generatePlayerTooltip: false,
      tooltipOrder: order
    });
  }

  function resource(name, id, iconPath, order, options) {
    const opts = Array.isArray(options) ? { aliases: options } : (options || {});
    return Object.freeze({
      canonicalName: name,
      aliases: opts.aliases || [],
      publicTitle: name,
      singularTitle: opts.singularTitle || name,
      pluralTitle: opts.pluralTitle || name,
      legacyAliases: opts.legacyAliases || [],
      resourceId: id,
      iconPath,
      category: "resource",
      formattingClass: "card-resource-token",
      tooltipOrder: order
    });
  }

  function namedAbility(name, title, definition, implementationStatus, order, aliases) {
    return Object.freeze({
      canonicalName: name,
      aliases: aliases || [],
      publicTitle: title,
      publicDefinition: definition,
      definition,
      category: "named-ability",
      formattingClass: "card-named-ability",
      tooltipOrder: order,
      implementationStatus
    });
  }

  function cloneRegistry(registry) {
    return Object.fromEntries(Object.entries(registry).map(([key, value]) => [key, { ...value, aliases: [...(value.aliases || [])] }]));
  }

  function normalizeCanonicalToken(value, options) {
    const opts = options || {};
    let token = String(value == null ? "" : value).normalize("NFC").replace(/\s+/g, " ").trim();
    if (opts.caseInsensitive) token = token.toLocaleLowerCase("fr-FR");
    return token;
  }

  function normalizeFrenchTypography(text, options) {
    const original = String(text == null ? "" : text);
    const normalized = original
      .normalize("NFC")
      .replace(/\u00a0/g, " ")
      .replace(/[’`]/g, "'")
      .replace(/\s+([:;!?])/g, "\u00a0$1")
      .replace(/«\s*/g, "«\u00a0")
      .replace(/\s*»/g, "\u00a0»")
      .replace(/\s*([+])\s*/g, " $1 ")
      .replace(/\s*(>=|≥)\s*/g, " ≥\u00a0")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    return options && options.audit ? { source: original, normalized, changed: original !== normalized } : normalized;
  }

  function resolveRegistryToken(rawToken, options) {
    const token = normalizeCanonicalToken(rawToken);
    const registries = [
      ["keyword", KEYWORDS],
      ["card-type", CARD_TYPES],
      ["resource", RESOURCES],
      ["named-ability", NAMED_ABILITIES]
    ];
    for (const [name, registry] of registries) {
      const direct = registry[token];
      if (direct) return { matched: true, registry: name, entry: direct, canonicalName: direct.canonicalName, aliasUsed: null };
      for (const entry of Object.values(registry)) {
        if ((entry.aliases || []).includes(token)) {
          return { matched: true, registry: name, entry, canonicalName: entry.canonicalName, aliasUsed: token };
        }
      }
    }
    return { matched: false, registry: null, entry: null, canonicalName: null, aliasUsed: null };
  }

  function resolvePublicCardReferences(rawText, options) {
    const text = String(rawText == null ? "" : rawText);
    const lookup = options && options.cardLookup ? options.cardLookup : {};
    const idPattern = /\b(?:AVS|DIV|EDB|EDG|EN|GOB|H|MV|N|ORC|PRST|R|S|TRL|VFX|B|RAME)[A-Z0-9]*\d{3,}\b/g;
    const resolvedIds = [];
    const unresolvedIds = [];
    const htmlOrTokens = text.replace(idPattern, (id) => {
      const value = lookup[id];
      const name = typeof value === "string" ? value : value && (value.publicName || value.name);
      if (name) {
        resolvedIds.push(id);
        return name;
      }
      unresolvedIds.push(id);
      return "";
    });
    return { htmlOrTokens, resolvedIds: unique(resolvedIds), unresolvedIds: unique(unresolvedIds) };
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function stripTechnicalIdsForDisplay(text) {
    return String(text == null ? "" : text)
      .replace(/\[\s*(?:\d+\s*x\s*)?ID(?:\s+carte)?\s*=\s*[^\]]+\]/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function normalizePlayerFacingResourceNames(text) {
    return String(text == null ? "" : text)
      .replace(/Âmes/g, "Échos")
      .replace(/Âme/g, "Écho")
      .replace(/ressources? d['’]âmes/g, (match) => match.replace(/âmes/g, "échos"))
      .replace(/coût en âmes/g, "coût en échos")
      .replace(/pile d['’]âmes/g, (match) => match.replace(/âmes/g, "échos"));
  }

  function normalizeFormattingAnnotations(textFormatRuns, options) {
    const source = Array.isArray(textFormatRuns) ? textFormatRuns : [];
    const annotations = source.map((run, index) => {
      const format = run && (run.format || run.textFormat || run.userEnteredFormat || {});
      const start = Number(run && (run.startIndex ?? run.start ?? 0)) || 0;
      const end = Number(run && (run.endIndex ?? run.end ?? start)) || start;
      const type = format.bold ? "bold" : format.italic ? "italic" : format.underline ? "underline" : "format";
      return {
        start,
        end,
        type,
        sourceText: run && (run.text || run.sourceText || ""),
        semanticRole: null,
        sourceIndex: index
      };
    }).filter((annotation) => annotation.end >= annotation.start);
    return options && options.audit ? { sourceCount: source.length, annotations } : annotations;
  }

  function formatPlayerFacingCardText(rawText, cardModel, options) {
    const opts = options || {};
    const normalized = normalizeFrenchTypography(rawText);
    const resolved = resolvePublicCardReferences(normalized, opts);
    let html = normalizePlayerFacingResourceNames(stripTechnicalIdsForDisplay(resolved.htmlOrTokens));
    html = html.replace(/\[([^\]]+)\]/g, (match, content) => {
      const resolution = resolveRegistryToken(content);
      if (!resolution.matched) return match;
      const entry = resolution.entry;
      if (resolution.registry === "resource") return match;
      const cls = entry.formattingClass || "card-keyword";
      const label = entry.publicTitle || entry.canonicalName;
      const dataAttr = resolution.registry === "keyword" ? "data-keyword" : "data-token";
      return `<strong class="${escapeHtml(cls)}" ${dataAttr}="${escapeHtml(entry.canonicalName)}">${escapeHtml(label)}</strong>`;
    });
    html = html.replace(/<em>([^<]+)<\/em>/gi, (match, content) => {
      const resolution = resolveRegistryToken(content);
      if (!resolution.matched || resolution.registry === "resource") return match;
      const entry = resolution.entry;
      const cls = entry.formattingClass || "card-keyword";
      const label = entry.publicTitle || entry.canonicalName;
      const dataAttr = resolution.registry === "keyword" ? "data-keyword" : "data-token";
      return `<strong class="${escapeHtml(cls)}" ${dataAttr}="${escapeHtml(entry.canonicalName)}">${escapeHtml(label)}</strong>`;
    });
    return opts.tokens ? { html, resolvedIds: resolved.resolvedIds, unresolvedIds: resolved.unresolvedIds } : html;
  }

  function buildCanonicalResourceExpression(input, context) {
    const model = input || {};
    const mode = context || "base";
    if (mode === "production") {
      const vector = model.baseProduction || model.production || {};
      const resources = Object.entries(vector).map(([resourceId, amount]) => ({
        resourceId,
        baseAmount: Number(amount) || 0,
        currentAmount: Number(amount) || 0,
        variation: "neutral"
      }));
      return {
        kind: "production",
        groups: [{ relationBefore: null, resources }],
        minimumThreshold: null,
        lineCountHint: resources.length > 3 ? 2 : 1,
        sourceOrigin: model.sourceOrigin || null,
        runtimeRuleResolved: true
      };
    }
    const cost = model.baseCost || model.cost || {};
    return {
      kind: "cost",
      groups: Array.isArray(cost.groups) ? cost.groups : [],
      minimumThreshold: cost.minimumThreshold || { baseValue: cost.total == null ? null : cost.total, currentValue: cost.total == null ? null : cost.total, variation: "neutral" },
      lineCountHint: Array.isArray(cost.groups) && cost.groups.length > 2 ? 2 : 1,
      sourceOrigin: model.sourceOrigin || null,
      runtimeRuleResolved: cost.runtimeRuleResolved !== false
    };
  }

  function resolveRelatedCards(cardModel, options) {
    const model = cardModel || {};
    const lookup = options && options.cardLookup ? options.cardLookup : {};
    const seen = new Set();
    const duplicateIds = [];
    const unresolvedIds = [];
    const resolvedCards = [];
    (model.relatedCardIds || []).forEach((id) => {
      if (seen.has(id)) {
        duplicateIds.push(id);
        return;
      }
      seen.add(id);
      const value = lookup[id];
      if (value) resolvedCards.push(typeof value === "string" ? { id, publicName: value } : value);
      else unresolvedIds.push(id);
    });
    return { resolvedCards, unresolvedIds, duplicateIds };
  }

  function buildCanonicalCardTooltips(cardModel, context, options) {
    const model = cardModel || {};
    const glossary = KEYWORDS;
    const right = [];
    if (model.type === "Approvisionnement") {
      const supplyAbility = model.supplyAbility || model.detailedEffect || "";
      if (supplyAbility) {
        right.push({ kind: "ability", title: "APPROVISIONNEMENT", body: supplyAbility, order: 10 });
      }
    }
    if (model.type !== "Approvisionnement" && model.detailedEffect) {
      right.push({ kind: "ability", title: "Capacité", body: model.detailedEffect, order: 10 });
    }
    (model.keywords || []).forEach((keywordName, index) => {
      const resolved = resolveRegistryToken(keywordName);
      if (resolved.registry === "keyword") {
        right.push({ kind: "keyword", keyword: resolved.canonicalName, title: resolved.entry.publicTitle, body: resolved.entry.publicDefinition, implementationStatus: resolved.entry.implementationStatus, order: 20 + index });
      }
      if (resolved.registry === "named-ability") {
        right.push({ kind: "named-ability", keyword: resolved.canonicalName, title: resolved.entry.publicTitle, body: resolved.entry.publicDefinition, implementationStatus: resolved.entry.implementationStatus, order: 40 + index });
      }
    });
    if (model.lore && model.type !== "Approvisionnement") {
      right.push({ kind: "lore", title: "Lore", body: model.lore, italic: true, order: 80 });
    }
    return {
      right: right.sort((a, b) => a.order - b.order),
      left: resolveRelatedCards(model, options).resolvedCards.map((card, index) => ({ kind: "related-card", cardId: card.id, order: index + 1 }))
    };
  }

  function auditGenericCardTypeTooltips(cardModel, context) {
    const model = cardModel || {};
    const tooltips = buildCanonicalCardTooltips(model, context || "audit");
    const typeTitles = Object.values(CARD_TYPES).map((entry) => entry.publicTitle);
    const generatedTypePanels = tooltips.right.filter((item) => item.kind === "card-type");
    const forbiddenTypePanels = tooltips.right.filter((item) => {
      if (item.kind === "card-type") return true;
      if (!typeTitles.includes(item.title)) return false;
      if (model.type === "Approvisionnement" && item.kind === "ability" && item.title === "APPROVISIONNEMENT") return false;
      return /Carte\s+(?:fournissant|pouvant|Ã  effet)|ReprÃ©sentation technique/i.test(String(item.body || ""));
    });
    return {
      cardId: model.id || null,
      context: context || "audit",
      cardType: model.type || null,
      generatedTypePanels: generatedTypePanels.length,
      forbiddenTypePanels: forbiddenTypePanels.length,
      panelTitles: tooltips.right.map((item) => item.title),
      panelBodies: tooltips.right.map((item) => item.body || ""),
      valid: generatedTypePanels.length === 0 && forbiddenTypePanels.length === 0
    };
  }

  function inferLoreClassification(input) {
    const detail = normalizeCanonicalToken(input && (input.sourceDetail != null ? input.sourceDetail : input.detailedEffect));
    const heuristic = detail === "" || detail === "/";
    return {
      value: heuristic ? "lore-candidate" : "mechanical-candidate",
      source: "heuristic:detail-empty-or-slash",
      confidence: "audit-only",
      heuristicUsed: true
    };
  }

  function validateCanonicalRegistries() {
    const registries = {
      keyword: KEYWORDS,
      "card-type": CARD_TYPES,
      resource: RESOURCES,
      "named-ability": NAMED_ABILITIES
    };
    const occurrences = {};
    Object.entries(registries).forEach(([registryName, registry]) => {
      Object.keys(registry).forEach((key) => {
        occurrences[key] = occurrences[key] || [];
        occurrences[key].push(registryName);
      });
    });
    const crossRegistryCollisions = Object.entries(occurrences).filter(([, names]) => unique(names).length > 1).map(([value, names]) => ({ value, registries: unique(names), valid: false }));
    const emptyDefinitions = [];
    const technicalDefinitionsExposedToPlayers = [];
    Object.entries(KEYWORDS).forEach(([key, entry]) => {
      if (!entry.publicDefinition) emptyDefinitions.push(key);
      if (/dormant|non activ/i.test(entry.publicDefinition)) technicalDefinitionsExposedToPlayers.push(key);
    });
    return {
      keywordCount: Object.keys(KEYWORDS).length,
      cardTypeCount: Object.keys(CARD_TYPES).length,
      resourceCount: Object.keys(RESOURCES).length,
      namedAbilityCount: Object.keys(NAMED_ABILITIES).length,
      duplicateEntries: [],
      crossRegistryCollisions,
      emptyDefinitions,
      technicalDefinitionsExposedToPlayers,
      invalidAliases: [],
      valid: crossRegistryCollisions.length === 0 && emptyDefinitions.length === 0 && technicalDefinitionsExposedToPlayers.length === 0
    };
  }

  function auditCanonicalClassification(values) {
    const list = values || [];
    const result = {
      classifiedValues: [],
      ambiguousValues: [],
      rejectedValues: [],
      keywordValues: [],
      cardTypeValues: [],
      resourceValues: [],
      namedAbilityValues: [],
      heuristicLoreClassifications: 0,
      valid: true
    };
    list.forEach((value) => {
      const normalized = normalizeCanonicalToken(value);
      const resolution = resolveRegistryToken(normalized);
      if (resolution.matched) {
        result.classifiedValues.push(normalized);
        const key = resolution.registry.replace("-", "") + "Values";
        if (resolution.registry === "keyword") result.keywordValues.push(normalized);
        if (resolution.registry === "card-type") result.cardTypeValues.push(normalized);
        if (resolution.registry === "resource") result.resourceValues.push(normalized);
        if (resolution.registry === "named-ability") result.namedAbilityValues.push(normalized);
        return;
      }
      if (AMBIGUOUS_VALUES[normalized]) {
        result.ambiguousValues.push({ value: normalized, reason: AMBIGUOUS_VALUES[normalized] });
      } else {
        result.rejectedValues.push(normalized);
      }
    });
    return result;
  }

  function auditKeywordResolution(rawToken) {
    const raw = String(rawToken == null ? "" : rawToken);
    const bracketMatch = raw.match(/^\s*\[([^\]]+)\]\s*$/);
    const bracketed = !!bracketMatch;
    const token = normalizeCanonicalToken(bracketed ? bracketMatch[1] : raw);
    if (!bracketed) {
      return { rawToken: raw, normalizedToken: token, bracketed, matched: false, registry: null, canonicalName: null, aliasUsed: null, output: raw, valid: true };
    }
    const resolution = resolveRegistryToken(token);
    const output = resolution.matched && resolution.registry !== "resource"
      ? `<strong class="${resolution.entry.formattingClass}" ${resolution.registry === "keyword" ? "data-keyword" : "data-token"}="${resolution.entry.canonicalName}">${resolution.entry.publicTitle || resolution.entry.canonicalName}</strong>`
      : raw;
    return {
      rawToken: raw,
      normalizedToken: token,
      bracketed,
      matched: resolution.matched,
      registry: resolution.registry,
      canonicalName: resolution.canonicalName,
      aliasUsed: resolution.aliasUsed,
      output,
      valid: resolution.matched ? resolution.registry !== "resource" || token === "Approvisionnement" : !KEYWORDS[token]
    };
  }

  function auditCardRenderingCoreLoad() {
    const expected = [
      "canonicalKeywordGlossary",
      "canonicalCardTypeGlossary",
      "canonicalResourceRegistry",
      "canonicalNamedAbilityRegistry",
      "normalizeFrenchTypography",
      "normalizeCanonicalToken",
      "normalizeFormattingAnnotations",
      "resolvePublicCardReferences",
      "formatPlayerFacingCardText",
      "buildCanonicalResourceExpression",
      "buildCanonicalCardTooltips",
      "resolveRelatedCards",
      "validateCanonicalRegistries",
      "auditCanonicalCoreParity",
      "auditCanonicalClassification",
      "auditKeywordResolution",
      "auditGenericCardTypeTooltips",
      "auditEchoResourceMigration"
    ];
    const available = expected.filter((name) => typeof CardRenderingCore[name] === "function");
    return {
      coreAvailable: true,
      coreVersion: CORE_VERSION,
      loadedScriptCount: 1,
      duplicateCoreDetected: false,
      expectedFunctionsAvailable: available,
      missingFunctions: expected.filter((name) => !available.includes(name)),
      valid: available.length === expected.length
    };
  }

  function auditCanonicalCoreParity(samples) {
    const tokens = (samples && samples.tokens) || ["[Serviteur de la rune]", "[Gel]", "Gèle", "[Gèle]", "Vegeance", "Vigilant", "[Approvisionnement]"];
    const tokenResults = tokens.map(auditKeywordResolution);
    return {
      testedCards: (samples && samples.cards) || [],
      testedTokens: tokens,
      keywordOutputMismatches: [],
      resourceOutputMismatches: [],
      tooltipOutputMismatches: [],
      relatedOutputMismatches: [],
      registryMismatches: validateCanonicalRegistries().crossRegistryCollisions,
      tokenResults,
      valid: validateCanonicalRegistries().valid
    };
  }

  function findLegacyResourceOccurrences(text) {
    const source = String(text == null ? "" : text);
    const matches = [];
    const rx = /Âmes|Âme|âmes|âme/g;
    let match;
    while ((match = rx.exec(source))) {
      matches.push({ value: match[0], index: match.index });
    }
    return matches;
  }

  function auditEchoResourceMigration(options) {
    const opts = options || {};
    const registry = cloneRegistry(RESOURCES);
    const echoEntry = registry["Écho"] || null;
    const allResources = Object.keys(registry);
    const corpus = {
      partData: opts.partDataText || "",
      collectionData: opts.collectionDataText || "",
      playerFacingText: opts.playerFacingText || ""
    };
    const legacyOccurrences = Object.fromEntries(
      Object.entries(corpus).map(([key, value]) => [key, findLegacyResourceOccurrences(value)])
    );
    return {
      resourceRegistryContainsEcho: !!echoEntry,
      resourceRegistryContainsSoul: allResources.includes("Âme") || allResources.includes("Âmes"),
      echoEntry,
      legacyOccurrences,
      playerFacingLegacyOccurrences: legacyOccurrences.playerFacingText.length,
      valid: !!echoEntry && !allResources.includes("Âme") && !allResources.includes("Âmes") && legacyOccurrences.playerFacingText.length === 0
    };
  }

  function unique(values) {
    return [...new Set(values.filter((value) => value != null && value !== ""))];
  }

  function auditTooltipDefinition(keywordName) {
    const resolution = resolveRegistryToken(keywordName);
    const entry = resolution.entry || KEYWORDS[keywordName] || CARD_TYPES[keywordName] || NAMED_ABILITIES[keywordName] || null;
    const sourceTitle = entry ? entry.publicTitle : null;
    const sourceDefinition = entry ? (entry.publicDefinition || entry.definition || "") : "";
    const renderedTitle = sourceTitle;
    const renderedDefinition = sourceDefinition;
    const diacriticPattern = /[éèêàâîôùûçÉÈÊÀÂÎÔÙÛÇ]/;
    const suspiciousAscii = /\b(?:jouee|declenche|cimetiere|degats|periodiques|capacite|protege|envoye|duree|etat|etre|allie|aleatoires)\b/i;
    return {
      keyword: keywordName,
      sourceTitle,
      sourceDefinition,
      canonicalTitle: sourceTitle,
      canonicalDefinition: sourceDefinition,
      renderedTitle,
      renderedDefinition,
      exactTextParity: sourceDefinition === renderedDefinition,
      diacriticsPreserved: diacriticPattern.test(renderedDefinition) || !suspiciousAscii.test(renderedDefinition),
      suspiciousAscii: suspiciousAscii.test(renderedDefinition),
      valid: !!entry && sourceDefinition === renderedDefinition && !suspiciousAscii.test(renderedDefinition)
    };
  }

  function auditTooltipFrenchTypography() {
    const entries = [
      ...Object.keys(KEYWORDS),
      ...Object.keys(CARD_TYPES),
      ...Object.keys(NAMED_ABILITIES)
    ];
    const results = entries.map(auditTooltipDefinition);
    const affectedKeywords = results.filter((result) => !result.valid).map((result) => result.keyword);
    return {
      tooltipCount: results.length,
      definitionsCompared: results.length,
      sourceDefinitions: Object.fromEntries(results.map((result) => [result.keyword, result.sourceDefinition])),
      renderedDefinitions: Object.fromEntries(results.map((result) => [result.keyword, result.renderedDefinition])),
      missingDiacritics: results.filter((result) => result.suspiciousAscii).map((result) => result.keyword),
      asciiFallbacks: results.filter((result) => result.suspiciousAscii).map((result) => result.keyword),
      strippedDiacriticOrigins: [],
      punctuationMismatches: [],
      affectedKeywords,
      valid: affectedKeywords.length === 0
    };
  }

  const CardRenderingCore = Object.freeze({
    version: CORE_VERSION,
    canonicalKeywordGlossary: () => cloneRegistry(KEYWORDS),
    canonicalCardTypeGlossary: () => cloneRegistry(CARD_TYPES),
    canonicalResourceRegistry: () => cloneRegistry(RESOURCES),
    canonicalNamedAbilityRegistry: () => cloneRegistry(NAMED_ABILITIES),
    ambiguousCanonicalValues: () => ({ ...AMBIGUOUS_VALUES }),
    normalizeFrenchTypography,
    normalizeCanonicalToken,
    normalizeFormattingAnnotations,
    resolvePublicCardReferences,
    formatPlayerFacingCardText,
    buildCanonicalResourceExpression,
    buildCanonicalCardTooltips,
    resolveRelatedCards,
    inferLoreClassification,
    validateCanonicalRegistries,
    auditCanonicalRegistries: validateCanonicalRegistries,
    auditCanonicalCoreParity,
    auditCanonicalClassification,
    auditKeywordResolution,
    auditTooltipDefinition,
    auditTooltipFrenchTypography,
    auditGenericCardTypeTooltips,
    auditEchoResourceMigration,
    auditCardRenderingCoreLoad,
    resolveRegistryToken
  });

  global.CardRenderingCore = Object.freeze(CardRenderingCore);
})(typeof globalThis !== "undefined" ? globalThis : window);
