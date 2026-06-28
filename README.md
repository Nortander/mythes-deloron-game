# Mythes d’Eloron

Projet de jeu de cartes fantasy.

## Dépôts

- game : code, documentation, outils et tests ;
- assets : ressources audiovisuelles séparées.

Liens publics :

- [mythes-deloron-game](https://github.com/Nortander/mythes-deloron-game)
- [mythes-deloron-assets](https://github.com/Nortander/mythes-deloron-assets)

## Prérequis obligatoire

- Node.js 18 ou supérieur ;
- dossier `assets/` disponible localement pour le rendu complet.

npm est un raccourci facultatif, pas un prérequis pour le serveur et les vérifications actuels.

## Démarrage sans npm

Double-cliquer sur :

```text
start-dev.cmd
```

ou lancer :

```bash
node tools/dev-server.mjs
```

Collection :
http://127.0.0.1:4173/code/collection.html

Partie test :
http://127.0.0.1:4173/code/partie-test-1.html

## Vérification sans npm

Double-cliquer sur :

```text
check-project.cmd
```

ou lancer :

```bash
node tools/verify-workspace.mjs
node tools/smoke-test.mjs
```

## Raccourcis facultatifs avec npm

Lorsque npm est disponible :

```bash
npm run dev
npm run verify
npm run smoke
npm run check
```

## Installation

Aucune dépendance npm n’est nécessaire pour le serveur et les vérifications actuels.

## Assets et données

`assets/` et `data/` restent locaux et sont ignorés dans le dépôt `game`.

## Tests navigateur

Bootstrap local :

```text
bootstrap-browser-tests.cmd
```

Lancer les tests :

```text
run-browser-tests.cmd
run-browser-tests.cmd --headed
```

Playwright est installé localement dans le projet. Les tests utilisent Microsoft Edge déjà installé sur le système, sans téléchargement de navigateur supplémentaire.

Tests de caractérisation des anomalies d'interface :

```text
run-browser-tests.cmd tests/browser/characterization.spec.mjs
```

Ces tests peuvent contenir des échecs attendus : ils servent à figer l'état observé avant correction.
