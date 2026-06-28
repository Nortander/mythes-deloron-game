# Tests navigateur

Ces tests vérifient que les pages principales du jeu se chargent dans un vrai navigateur piloté par Playwright.

## Outillage local

Le bootstrap installe un Node/npm portable dans `.toolchain/node/` puis installe Playwright localement dans `node_modules/`.

```text
bootstrap-browser-tests.cmd
```

Aucun navigateur Playwright supplémentaire n’est téléchargé. Les tests utilisent Microsoft Edge installé sur le système avec le canal Playwright `msedge`.

## Exécution

```text
run-browser-tests.cmd
run-browser-tests.cmd --headed
run-browser-tests.cmd --debug
```

Le mode par défaut est headless. Le mode headed ouvre le navigateur système.

## Résultats locaux

- Captures : `test-results/`
- Traces et pièces jointes : `test-results/`
- Rapport HTML : `playwright-report/`

Ces dossiers sont ignorés par Git.

## Caractérisation ENV-1F2

La suite `characterization.spec.mjs` documente les anomalies d'interface encore ouvertes sans modifier le jeu.
Elle utilise des échecs attendus Playwright (`test.fail`) pour les comportements confirmés comme défectueux.

```text
run-browser-tests.cmd tests/browser/characterization.spec.mjs
```

Les cas couverts incluent :

- ouverture Collection selon le type de carte ;
- séparation lore / infobulle / production des Approvisionnements ;
- panneaux d'infobulles génériques ;
- mots-clés dans les prévisualisations ;
- cartes liées et diagnostics `related`.

## Couverture future

Les futurs tests couvriront :

- ouverture Collection selon le type de carte ;
- lore des Approvisionnements ;
- infobulles ;
- conditions d’invocation ;
- mots-clés ;
- cartes related ;
- drag-and-drop ;
- mains pleines et vides ;
- deck vide ;
- fenêtres de choix.
