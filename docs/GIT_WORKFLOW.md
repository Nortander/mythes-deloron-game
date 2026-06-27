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
