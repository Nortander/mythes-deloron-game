# Conditions d'invocation

Les conditions d'invocation sont séparées en deux couches.

Le texte public reste dans les données de carte (`cond` ou `invocationConditionText`). Il sert à l'affichage et n'est jamais analysé comme du français au moment de jouer.

La règle moteur est portée par `invocationCondition`. Elle décrit explicitement les prédicats à évaluer avant paiement.

## Format

Une condition peut combiner des prédicats avec :

- `all` : toutes les branches doivent être satisfaites ;
- `any` : au moins une branche doit être satisfaite ;
- `not` : la branche doit être fausse.

Les prédicats ajoutés pour HUVU-2 sont :

- `minimum-resource-available` : vérifie une quantité minimale d'une ressource disponible ;
- `friendly-servant-count` : compte les serviteurs alliés présents sur le terrain parmi une liste d'IDs.

## Ordre de validation

La condition d'invocation est évaluée dans `validateCardActionStart()`, avant :

- la vérification finale du coût ;
- le paiement ;
- le retrait de la carte de la main ;
- le placement sur le terrain ;
- les effets, cibles, animations et journaux de résolution.

En cas de refus, la carte reste dans sa zone initiale et aucune ressource n'est consommée.

## Ajouter une condition

Pour ajouter une nouvelle condition :

1. conserver le texte public dans la donnée de carte ;
2. ajouter une règle structurée dans le registre de conditions ;
3. réutiliser un prédicat existant ou ajouter un prédicat générique ;
4. tester au moins un cas autorisé et un cas refusé.
