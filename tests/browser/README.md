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
