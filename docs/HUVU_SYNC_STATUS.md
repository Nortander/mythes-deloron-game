# HUVU Sync Status

## Statuts distincts

- Donnée synchronisée : la carte existe dans les données statiques de la Collection et/ou de la partie avec son nom, type, faction, coût, statistiques, texte, mots-clefs, cartes liées et chemin d'asset.
- Deck synchronisé : la composition codée du scénario correspond à la source canonique `Decks de test`.
- Handler fonctionnel : la capacité, le sort ou l'approvisionnement possède une implémentation moteur qui modifie réellement l'état de jeu.
- Audit fonctionnel : la carte a été rejouée et classée après synchronisation des données et des decks.

## HUVU-SYNC-1

HUVU-SYNC-1 synchronise uniquement les données statiques des cartes canoniques Hokhan/Uram. Ce lot n'est pas une synchronisation des decks et ne rend pas les capacités manquantes fonctionnelles.

Les galeries techniques non publiques `huvu-sync-gallery-a` et `huvu-sync-gallery-b` servent uniquement à valider le rendu en partie des cartes ajoutées ou complétées.

## HUVU-SYNC-2

HUVU-SYNC-2 aligne les compositions directes de Hokhan Ashir et d'Uram sur le classeur canonique `Decks de test`. Les 60 occurrences de chaque joueur sont réconciliées comme `main initiale + pioche`, tandis que l'avatar affiché reste une zone visuelle séparée.

Une seule occurrence de chaque ligne marquée `OUI` est forcée en main initiale et retirée de la pioche. Les lignes marquées `MAYBE` restent documentées dans la fixture canonique, mais ne sont pas forcées en main initiale par ce lot.

Les handlers de capacité, de sort et d'approvisionnement restent non audités lorsqu'ils ne l'étaient pas déjà.

## Prochaines étapes

- HUVU-FONC-2 : relancer l'audit fonctionnel exhaustif depuis les decks synchronisés.
- HUVU-IMPL : implémenter les capacités par primitives moteur communes.
