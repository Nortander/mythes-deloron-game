# HUVU Sync Status

## Statuts distincts

- Donnée synchronisée : la carte existe dans les données statiques de la Collection et/ou de la partie avec son nom, type, faction, coût, statistiques, texte, mots-clefs, cartes liées et chemin d'asset.
- Deck synchronisé : la composition codée du scénario correspond à la source canonique `Decks de test`.
- Handler fonctionnel : la capacité, le sort ou l'approvisionnement possède une implémentation moteur qui modifie réellement l'état de jeu.
- Audit fonctionnel : la carte a été rejouée et classée après synchronisation des données et des decks.

## HUVU-SYNC-1

HUVU-SYNC-1 synchronise uniquement les données statiques des cartes canoniques Hokhan/Uram. Ce lot n'est pas une synchronisation des decks et ne rend pas les capacités manquantes fonctionnelles.

Les galeries techniques non publiques `huvu-sync-gallery-a` et `huvu-sync-gallery-b` servent uniquement à valider le rendu en partie des cartes ajoutées ou complétées.

## Prochaines étapes

- HUVU-SYNC-2 : synchroniser les compositions de decks et les zones.
- HUVU-FONC-2 : relancer l'audit fonctionnel exhaustif depuis les decks synchronisés.
- HUVU-IMPL : implémenter les capacités par primitives moteur communes.
