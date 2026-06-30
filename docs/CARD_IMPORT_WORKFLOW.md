# Import de nouvelles cartes

Ce document décrit le workflow actuel d'import contrôlé des cartes de Mythes d'Eloron. Le premier import reste supervisé par Cody ; une automatisation plus complète pourra être ajoutée plus tard.

## 1. Modifier le Spreadsheet en ligne

La source vivante reste le Spreadsheet Google `Jeu de cartes fantasy « Mythes d'Eloron »`, feuille `Cartes et description`.

Chaque nouvelle carte doit disposer d'un ID unique, d'un nom public, d'un type, d'une faction, d'un coût, d'une description, d'un effet détaillé lorsque nécessaire, des mots-clés, des relations et du maximum possédé.

## 2. Exporter le classeur complet

Depuis Google Sheets, exporter le classeur complet au format Microsoft Excel :

```text
Fichier > Télécharger > Microsoft Excel (.xlsx)
```

Nom recommandé :

```text
Jeu de cartes fantasy « Mythes d'Eloron » - export YYYY-MM-DD.xlsx
```

Le fichier doit être placé dans :

```text
data/
```

## 3. Conserver les anciens exports

Les exports datés précédents sont conservés comme points de comparaison. Ils ne doivent pas être supprimés pendant un import.

## 4. Placer l'asset final

L'image finale de la carte doit être disponible dans `assets/` selon la convention du type ou de la faction :

```text
assets/elfes-des-bois/
assets/sorts/
assets/approvisionnement/
```

Les assets restent locaux dans le dépôt `game` et sont ignorés par Git. Leur publication relève du dépôt séparé `mythes-deloron-assets`.

## 5. Synchroniser les données dans le jeu

Pour l'instant, Cody synchronise explicitement les données nécessaires dans :

```text
code/collection.html
code/partie-test-1.html
```

Les champs doivent reprendre les valeurs du Spreadsheet sans inventer de capacité, de relation ou de correction de donnée.

## 6. Lancer les tests

Exécuter :

```text
check-project.cmd
run-browser-tests.cmd
```

Pour un import de cartes, ajouter ou mettre à jour des tests Playwright dédiés.

Chaque import doit aussi vérifier que les textes importés ne contiennent aucune séquence Excel visible du type `_xHHHH_`, que les caractères de contrôle interdits sont normalisés avant rendu, et que le formatage sémantique des variables reste cohérent entre la Collection et la partie.

## 7. Valider visuellement

Avant commit définitif ou push, ouvrir la Collection et le scénario de test dédié pour vérifier les images, les textes, les panneaux, les cartes liées et la fermeture des fiches.

## 8. Commit et push

Après validation :

```text
git status
git diff --check
git diff
git add <fichiers explicites>
git diff --cached
git commit -m "<message>"
```

Le push intervient seulement après validation explicite.
