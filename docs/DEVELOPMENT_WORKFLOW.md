# Workflow de développement

## 1. Prérequis

- Node.js 18 ou supérieur.
- Git pour les opérations de versionnement.
- Le dossier local `assets/` pour le rendu complet du jeu.
- Le dossier local `data/` pour les exports et données de travail.

npm n’est pas requis pour le serveur statique actuel. Il reste un raccourci facultatif et deviendra probablement utile pour une future couche de tests navigateur, traitée séparément dans ENV-1F.

## 2. Organisation game/assets

Le dépôt `mythes-deloron-game` contient le code, la documentation, les outils et les tests.

Le dossier `assets/` reste physiquement présent dans le workspace, mais il n’est pas suivi dans le dépôt `game`. Il provient du dépôt séparé `mythes-deloron-assets`.

Le serveur local peut servir normalement `assets/` et `data/`, même si ces dossiers restent ignorés par Git dans le dépôt `game`.

## 3. Démarrage du serveur

Méthode universelle Node :

```text
start-dev.cmd
```

ou :

```bash
node tools/dev-server.mjs
```

Raccourci facultatif avec npm :

```bash
npm run dev
```

Adresses utiles :

- Collection : http://127.0.0.1:4173/code/collection.html
- Partie test : http://127.0.0.1:4173/code/partie-test-1.html

Le serveur écoute uniquement sur `127.0.0.1`.

## 4. Arrêt du serveur

Dans le terminal du serveur :

```text
Ctrl+C
```

## 5. Vérification automatique

Méthode universelle Node :

```text
check-project.cmd
```

ou :

```bash
node tools/verify-workspace.mjs
node tools/smoke-test.mjs
```

Raccourci facultatif avec npm :

```bash
npm run check
```

L’absence de npm ne doit pas invalider les vérifications ENV-1E si les commandes Node directes réussissent.

## 6. Workflow avant modification

```bash
git status
check-project.cmd
```

ou, si npm est disponible :

```bash
npm run check
```

Le workspace doit être compris avant toute modification.

## 7. Workflow après modification

```bash
check-project.cmd
git diff --check
git diff
git status
```

ou, si npm est disponible :

```bash
npm run check
git diff --check
git diff
git status
```

Relire les changements avant de préparer un commit.

## 8. Commits

Ajouter explicitement les fichiers voulus :

```bash
git add <fichiers explicites>
git diff --cached
git commit -m "<message>"
```

Éviter `git add .` par défaut afin de ne pas inclure de fichiers locaux ou générés par accident.

## 9. Push

Le push intervient après validation du commit local et relecture de son contenu.

Avant de pousser :

```bash
git status
git log -1 --oneline --decorate
git show --stat --oneline HEAD
```

## 10. Fichiers locaux ignorés

Les dossiers suivants restent locaux dans le workspace et ne doivent pas être supprimés :

- `assets/`
- `data/`

Ils sont nécessaires au travail local, même s’ils ne sont pas suivis dans le dépôt `game`.

## 11. Résolution des problèmes courants

Si `start-dev.cmd` ou `check-project.cmd` ne démarre pas, vérifier que Node.js 18 ou supérieur est disponible :

```bash
node --version
```

Si une page n’affiche pas les images ou effets visuels, vérifier que le dossier `assets/` est présent localement.

Si npm est absent, utiliser les commandes Node directes ou les lanceurs Windows. Les raccourcis npm restent optionnels pour ENV-1E.

## 12. Prochaine couche de tests

La couche actuelle vérifie le serveur et les principales URLs HTTP. Une future installation locale de Playwright pourra être traitée dans ENV-1F, avec npm si nécessaire.
