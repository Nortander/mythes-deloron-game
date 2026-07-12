# CODEX_WORKFLOW_GUARDRAILS — Règles de travail Cody pour Mythes d’Eloron

## 1. Principe général

Ce document est le référentiel commun des règles récurrentes de travail avec Cody sur Mythes d’Eloron.

Il doit être appliqué par défaut pour toute commande future, sauf instruction contraire explicite. Une commande peut donc simplement indiquer :

```text
Appliquer docs/CODEX_WORKFLOW_GUARDRAILS.md.
```

Le but est de raccourcir les commandes, réduire les répétitions, éviter les erreurs d’environnement, améliorer la reprise après interruption et rendre les lots plus faciles à publier.

## 2. Workspace et chemins

Workspace actif :

```text
G:\Mythes-d-Eloron-Workspace\
```

Source historique ou miroir non actif :

```text
F:\Clément Wymiens\Mes Créations\Mythes-d-Eloron\
```

Règles :

- ne jamais basculer une implémentation sur `F:` ;
- ne jamais considérer `F:` comme dépôt actif ;
- si `G:` refuse l’écriture, demander l’autorisation d’écriture sur `G:` ;
- ne pas chercher Git ou Node sur tout le disque ;
- utiliser les chemins fiables déjà connus ;
- si le contexte courant pointe vers `F:`, vérifier explicitement que les commandes projet sont exécutées dans `G:\Mythes-d-Eloron-Workspace\`.

## 3. Git fiable et baseline

Git fiable :

```text
C:\Users\Clément Wymiens\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe
```

Avant toute modification, vérifier :

- branche courante ;
- `HEAD` ;
- `origin/main` ;
- working tree propre ;
- commits locaux déjà présents ;
- écart local/distant attendu par la commande.

Commandes types :

```text
git branch --show-current
git rev-parse HEAD
git status --short
git branch -vv
git ls-remote origin refs/heads/main
git log --reverse --format="%H %s" origin/main..HEAD
```

Arrêter si l’état réel ne correspond pas à la commande. Ne jamais supposer que le dépôt est déjà dans l’état attendu.

## 4. Interdits Git

Ne pas utiliser sauf demande explicite et contrôlée :

```text
reset
rebase
cherry-pick
commit --amend
stash
restore
clean
git add .
git add -A
push --force
```

Règles :

- pas de push sauf commande de publication explicite ;
- pas de `commit --amend` ;
- pas de réécriture d’historique ;
- pas de suppression silencieuse de changements ;
- ajouter explicitement les fichiers réellement modifiés ;
- si un fichier suivi est modifié accidentellement, arrêter et signaler.

## 5. Gestion du serveur local

Port projet :

```text
4173
```

Règles :

- vérifier le port avant les tests ;
- arrêter uniquement le serveur Node lié au workspace ;
- ne pas tuer tous les processus Node ;
- vérifier le port après arrêt ;
- ne jamais lancer plusieurs serveurs projet concurrents sur le port `4173` ;
- laisser le serveur actif seulement si la commande demande une validation visuelle ;
- arrêter le serveur après publication si la commande le demande.

## 6. Tests et validations

Règles générales :

- tests séquentiels uniquement ;
- jamais de suites Playwright en parallèle ;
- lancer les suites ciblées avant la suite complète ;
- lancer la suite complète une seule fois après suites ciblées vertes ;
- lancer le mode headed une seule fois à la fin si demandé ;
- ne pas relancer une suite en boucle sans diagnostic.

Rappels :

- `check-project.cmd` avant ou après lot selon la nature de la commande ;
- `run-browser-tests.cmd` pour les suites ciblées ;
- suite complète seulement quand nécessaire ;
- pour les images, attendre explicitement `naturalWidth > 0` ;
- comparer les decks mélangés comme multiensembles ;
- ne pas dépendre d’un ordre après mélange ;
- diagnostiquer avant correction.

Catégories de diagnostic :

- bug moteur ;
- bug données ;
- bug scénario ;
- bug test ;
- bug rendu ;
- bug attente image ;
- serveur résiduel.

## 7. Scripts temporaires et outillage

Règles :

- utiliser Node pour les lectures et écritures structurées ;
- créer des scripts temporaires `.cjs` dans `.local` ;
- éviter les gros scripts Node inline dans PowerShell ;
- éviter les one-liners PowerShell complexes ;
- éviter les patchs gigantesques ;
- préférer les patchs petits et ciblés ;
- préférer des ancres ASCII ;
- éviter les ancres sur textes accentués ;
- ne pas dépendre de numéros de lignes après modifications ;
- si `rg` est refusé ou indisponible, utiliser `git grep` ou un script Node `.cjs` ;
- utiliser Python/openpyxl uniquement pour lire les XLSX si nécessaire ;
- ne rien installer ;
- ne pas modifier le PATH système ;
- modifier le PATH uniquement pour le processus courant si nécessaire.

PowerShell reste acceptable pour des opérations Windows simples : lecture courte, statut de port, lancement d’un serveur ou ouverture d’Edge. Il ne doit pas servir à réécrire de longs fichiers HTML, JavaScript, JSON ou Markdown.

## 8. Encodage et textes publics

Règles :

- préserver les accents ;
- éviter le mojibake ;
- produire de l’UTF-8 sans BOM ;
- ne pas introduire de texte public non accentué ;
- ne pas utiliser les textes français comme logique runtime ;
- ne pas insérer d’IDs techniques dans les textes publics ;
- réserver les IDs, `effectInstanceId`, `linkedOccurrenceId` et diagnostics détaillés au panneau de test ou aux logs techniques.

Le texte public doit rester lisible pour le joueur. Le diagnostic technique doit rester dans le mode test.

## 9. WORK_STATE.json et reprise après compactage

Au début de tout lot non trivial, créer :

```text
.local\<LOT>\WORK_STATE.json
```

Le fichier doit contenir :

- `lotId` ;
- phase courante ;
- baseline Git vérifiée ;
- `origin/main` vérifié ;
- working tree initial ;
- serveur arrêté ou actif ;
- validations déjà passées ;
- fichiers suivis modifiés ;
- cartes verrouillées ;
- cartes à traiter ;
- cartes reportées ;
- décisions de périmètre ;
- dernier point stable ;
- prochain travail à faire.

Après compactage automatique du contexte :

- relire `WORK_STATE.json` ;
- refaire seulement :

```text
git status --short
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

- ne pas relancer toutes les validations déjà passées si aucun fichier suivi n’a changé depuis ;
- ne pas repartir de zéro ;
- reprendre depuis la phase indiquée dans `WORK_STATE.json` ;
- mettre `WORK_STATE.json` à jour après chaque grande phase.

## 10. Rapports locaux

Règles :

- tous les rapports doivent être dans `.local\<LOT>-YYYYMMDD-HHMMSS\` ;
- `.local` ne doit jamais être suivi par Git ;
- les rapports JSON doivent être valides, déterministes et UTF-8 sans BOM ;
- éviter les chemins personnels absolus dans les rapports suivis ;
- les rapports locaux peuvent contenir des chemins locaux si nécessaire, mais ne doivent pas être commités.

Pour chaque lot, produire au minimum :

- rapport principal Markdown ;
- fichier `LOCAL_READY` ou `PUBLISHED` selon le cas ;
- audits JSON selon le besoin ;
- `WORK_STATE.json` pour les lots non triviaux.

## 11. Distinction analyse / implémentation / publication

Analyse :

- lecture seule ;
- rapports dans `.local` ;
- aucun fichier suivi modifié ;
- aucun commit ;
- aucun push.

Implémentation :

- modifications ciblées ;
- tests ;
- commit local ;
- aucun push ;
- serveur actif si validation visuelle demandée.

Publication :

- aucun changement de code ;
- audit des commits locaux ;
- vérification du distant juste avant push ;
- push simple, jamais forcé ;
- vérification finale ;
- serveur arrêté si demandé.

## 12. Protection des cartes verrouillées

Une carte verrouillée peut être :

- auditée ;
- testée en non-régression ;
- documentée.

Elle ne doit pas être :

- recodée ;
- réinterprétée ;
- simplifiée ;
- modifiée fonctionnellement ;
- utilisée comme prétexte pour changer une primitive validée.

Si une régression est détectée sur une carte verrouillée :

- arrêter ;
- produire un rapport dédié ;
- ne pas corriger sans instruction explicite.

## 13. Données, scénarios et tests

Règles :

- ne pas compenser un scénario imprécis dans un test ;
- corriger le scénario si le problème vient du scénario ;
- corriger le test si le problème vient du test ;
- corriger le moteur si le problème vient du moteur ;
- corriger les données si le problème vient des données ;
- ne jamais masquer un bug en affaiblissant une assertion ;
- ne jamais annoncer un résultat public non réellement produit.

Exemple : si un Sort annonce 3 cartes piochées, la main doit réellement recevoir 3 occurrences, sauf si le message indique explicitement un autre nombre.

## 14. Règles de zones et occurrences

Règles :

- une occurrence ne doit jamais être présente dans deux zones ;
- une carte ne doit jamais être copiée par erreur ;
- une carte ne doit jamais être perdue ;
- comparer les inventaires avant / après ;
- un Sort résolu rejoint le cimetière du lanceur sauf modèle explicitement différent ;
- un Sort refusé reste en main ;
- aucune mutation ne doit avoir lieu en cas de refus avant résolution ;
- aucun coût ne doit être payé en cas de refus avant résolution ;
- distinguer propriétaire et contrôleur si le moteur le permet.

## 15. UI, rendu et validation visuelle

Règles :

- ne pas modifier les assets sans demande explicite ;
- ne pas dupliquer les assets ;
- vérifier les images avec `naturalWidth > 0` ;
- vérifier la lisibilité des textes publics ;
- vérifier les états réduits / agrandis des panneaux ;
- le panneau test réduit ne doit pas cacher les zones interactives ;
- les messages publics doivent être simples et exacts ;
- les diagnostics techniques doivent rester dans le mode test.


### Charte couleur Humain

Pour les cartes de faction Humain, le champ de description principal doit utiliser le bleu humain sombre `#002fa7` pour les mots-clefs, chiffres, variables et valeurs mécaniques. Le bleu céleste `#26c4ec` reste réservé aux liserés, overlays lumineux, titres et éléments de mise en valeur hors corps principal, notamment les infobulles.

## 16. Collection

État canonique publié :

- 318 cartes canoniques ;
- 309 cartes obtenables avant correction future de `S000008` ;
- 9 cartes non obtenables avant correction future de `S000008` ;
- 14 avatars historiques hors corpus ;
- compteur publié avant datafix `S000008` :

```text
63 / 309 cartes obtenables
```

- filtre POSSESSION :

```text
TOUTES / POSSÉDÉES / MANQUANTES / NON OBTENABLES
```

Note : `S000008 — Clef de pierre` doit être corrigée dans un futur lot `COLLECTION-DATAFIX-1` pour devenir non obtenable, après correction du Spreadsheet principal.

Ne pas appliquer cette correction dans un lot process ou documentaire.

## 17. Publication

Règles :

- vérifier `origin/main` immédiatement avant push ;
- arrêter si `origin/main` a changé ;
- pousser uniquement la branche demandée ;
- ne pousser aucun tag ;
- ne pousser aucune autre branche ;
- vérifier après push que `HEAD` local = `origin/main` ;
- vérifier le working tree propre ;
- arrêter le serveur si demandé.

## 18. Retention des exports Spreadsheet

Quand Daddy signale qu'un nouvel export Spreadsheet a ete place dans `data`, Cody doit appliquer une retention par famille d'export.

Regle canonique :

- identifier uniquement les fichiers qui respectent le motif `<nom> - export YYYY-MM-DD.xlsx` ;
- regrouper les exports par `<nom>` ;
- conserver seulement les deux versions les plus recentes par famille ;
- si une famille ne contient qu'un ou deux exports, les conserver ;
- si deux exports d'une meme famille portent la meme date, arreter avec `DUPLICATE_EXPORT_DATE` ;
- archiver une copie de securite des versions retirees dans `.local/<lot>/archived-data-exports/` avant suppression ;
- calculer et documenter les SHA-256 des sources, des copies archivees et des exports conserves ;
- supprimer du dossier `data` uniquement apres confirmation que le SHA-256 source correspond au SHA-256 de la copie archivee ;
- ne jamais importer automatiquement le nouvel export dans les fixtures ou le code sans commande explicite distincte ;
- ne jamais modifier les XLSX eux-memes ;
- ne jamais supprimer de fichier qui ne correspond pas au motif d'export ;
- documenter les fichiers conserves et retires dans le rapport local du lot.
