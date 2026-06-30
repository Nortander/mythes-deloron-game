# Conditions d'invocation

Les conditions d'invocation sont séparées en deux couches.

Le texte public reste dans les données de carte (`cond` ou `invocationConditionText`). Il sert à l'affichage et n'est jamais analysé comme du français au moment de jouer.

La règle moteur est portée par `invocationCondition`. Elle décrit explicitement les prédicats à évaluer avant paiement.

## Distinguer coût, condition d'invocation et déclenchement de capacité

Un coût insuffisant relève toujours du validateur de ressources. Par exemple, une carte qui demande `Écho (3)` doit être refusée par le contrôle de coût lorsque le joueur possède `0 Écho`, sans passer par une condition d'invocation.

Une condition d'invocation est une exigence supplémentaire qui bloque la carte avant paiement, indépendamment du coût. Elle doit provenir d'une colonne canonique dédiée ou d'une règle explicite non ambiguë.

Une condition de déclenchement de capacité est évaluée seulement lorsque la capacité tente de se résoudre. Une phrase placée dans un texte `[Initiative]`, `[Vengeance]`, de ciblage ou d'effet ne doit pas empêcher de jouer la carte. Elle appartient au registre ou au futur moteur de capacités, pas au validateur d'invocation.

Les colonnes du Spreadsheet doivent donc être lues séparément : coût chiffré, ressource obligatoire, condition supplémentaire pour jouer, description en jeu et effet détaillé. Un test vert ne prouve pas que la règle métier a été correctement interprétée si le test valide une mauvaise classification.

## Format

Une condition peut combiner des prédicats avec :

- `all` : toutes les branches doivent être satisfaites ;
- `any` : au moins une branche doit être satisfaite ;
- `not` : la branche doit être fausse.

Les prédicats disponibles pour de vraies conditions d'invocation sont :

- `minimum-resource-available` : vérifie une quantité minimale d'une ressource disponible ;
- `friendly-servant-count` : compte les serviteurs alliés présents sur le terrain parmi une liste d'IDs.

Ces prédicats ne doivent être utilisés que si la source canonique classe explicitement la règle comme condition de jeu. Ils ne doivent pas servir à convertir automatiquement un coût ou une condition d'Initiative en condition d'invocation.

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

## Message public, diagnostic technique et scénarios de test

Un refus pour coût insuffisant affiche toujours le même message public :

```text
Vous manquez de ressources pour jouer cette carte.
```

Le bandeau public ne doit pas exposer les ressources requises, les ressources disponibles, une équation de coût, un nom de prédicat, un ID technique ou un objet de diagnostic. Ces détails restent dans le résultat structuré du validateur de coût : code stable, réserves disponibles, coût effectif, exigences non satisfaites, branches alternatives et plan de paiement lorsqu'il existe.

Les scénarios techniques peuvent activer un panneau réservé au test avec `showTestResourcePanel: true`. Ce panneau affiche explicitement `MODE TEST — RESSOURCES`, lit l'état moteur réel du joueur actif, montre la carte testée, le coût structuré, le dernier code de validation et les déficits techniques. Il ne doit jamais apparaître dans les scénarios publics ni dans le sélecteur normal.

Les messages importants restent visibles environ `4000 ms` afin de permettre une validation visuelle. Les tests de coût doivent couvrir les frontières : juste insuffisant, exactement suffisant, coût simple, coût composé avec `+` et coût compatible/alternatif avec `ou`.
