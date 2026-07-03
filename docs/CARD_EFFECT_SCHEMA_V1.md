# CARD_EFFECT_SCHEMA_V1

Ce document décrit la cartographie déclarative utilisée pour inventorier les effets du corpus Collection 2026-07-03. Elle ne remplace pas les handlers de jeu : elle sert à classer les règles, les primitives requises et les lots d'implémentation futurs.

## Séparation des données

Le texte public reste la source d'affichage. La signature d'effet est une donnée d'audit qui sépare :

- le moment de déclenchement ;
- les opérations mécaniques ;
- les indices de cible ;
- la durée ;
- les primitives moteur requises ;
- les primitives déjà disponibles ;
- le statut d'implémentation.

## Champs principaux

Chaque entrée de `collection-effect-signatures.json` contient `id`, `name`, `type`, `timing`, `operations`, `requiredPrimitives`, `supportedPrimitives`, `missingPrimitives`, `familyKey`, `implementationStatus`, `industrialReadiness` et `confidence`.

## Statuts

Les statuts sont volontairement prudents : `FONCTIONNEL_TESTE`, `FONCTIONNEL_NON_TESTE`, `PARTIEL`, `ABSENT` et `SANS_EFFET_PROGRAMMABLE`. Une présence dans la Collection ou dans `CARDS_DATA` ne suffit pas à rendre une carte fonctionnelle.

## Ajout futur

Pour industrialiser une nouvelle carte, on ajoute d'abord sa donnée canonique, puis sa signature déclarative, puis seulement ensuite un handler fonctionnel testé si une primitive moteur existe ou est créée.
