# Workflow Git Mythes d’Eloron

- Branche principale : `main`
- Remote principal : `origin`
- Dépôt distant : `Nortander/mythes-deloron-game`
- Les assets sont ignorés dans le dépôt `game`.
- Le dossier `data/` est ignoré dans le premier historique.
- Aucun sous-module n’est configuré actuellement.
- Git LFS n’est pas activé actuellement.
- Les tests et scripts futurs seront suivis par le dépôt `game` lorsqu’ils seront ajoutés.

## Flux de travail simple

1. Vérifier `git status`.
2. Modifier les fichiers nécessaires.
3. Relire `git diff`.
4. Ajouter explicitement les fichiers voulus.
5. Créer un commit descriptif.
6. Pousser seulement après validation explicite.

Ne jamais stocker de jeton ou de secret dans le dépôt.

## Vérification avant commit

Avant de préparer un commit, lancer les vérifications avec la méthode Node universelle :

```bash
check-project.cmd
```

ou, si npm est disponible :

```bash
npm run check
```

Puis relire :

```bash
git diff --check
git diff
git status
```

Ajouter ensuite uniquement les fichiers explicites nécessaires :

```bash
git add <fichiers explicites>
git diff --cached
```

Ne pas utiliser `git add .` par défaut. Les dossiers locaux ignorés, notamment `assets/` et `data/`, ne doivent pas être supprimés. La branche principale reste `main`.
