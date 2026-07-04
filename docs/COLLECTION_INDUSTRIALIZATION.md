# Industrialisation de la Collection

COLLECTION-INDUS-1 synchronise le corpus public avec l'export principal du 3 juillet 2026 et ajoute une cartographie déclarative des 318 cartes.

## Sources

- Export principal : `Jeu de cartes fantasy « Mythes d'Eloron » - export 2026-07-03.xlsx`, feuille `Cartes et description`, SHA-256 `892a0fe51dde030944dab165a21e77657a303548aa350eea7edd7a1eb2843883`.
- Export decks : `Decks de test - export 2026-07-03.xlsx`, feuille `Hokhan Ashir Vs Uram`, SHA-256 `90811b81fc240b2ea50140f7385612f927f970671e958c02459de44ebe573da7`.

## Corpus

Le corpus suivi contient 318 lignes de cartes et 318 IDs uniques. Les trois cartes absentes de la Collection avant ce lot sont :

- `MV000025` - Esprit dérangé ;
- `N000015` - Windjalf, l'Ancien ;
- `S000054` - Boute-flammes.

## Cartographie déclarative

Les fixtures sous `tests/fixtures/collection-*.json` décrivent le corpus, les signatures d'effets, les primitives moteur, les mots-clés et les dépendances entre cartes. Elles ne créent aucun effet de jeu.

## Limites

Les effets de Windjalf et de Boute-flammes restent non implémentés fonctionnellement dans ce lot. La relation Windjalf -> Boute-flammes est déclarée pour préparer un futur lot de création de carte et d'effets persistants liés à Sang ardent / Embrasement.

## Progression et possession

La Collection distingue maintenant trois ensembles :

- 318 cartes canoniques issues de l'export principal du 3 juillet 2026 ;
- 309 cartes obtenables, seules prises en compte par la progression ;
- 9 cartes non obtenables, consultables via le filtre POSSESSION `NON OBTENABLES`.

Les 14 avatars historiques restent dans le catalogue runtime, mais ne sont pas des cartes : ils sont classes `catalogKind = AVATAR` et `obtainability = NOT_APPLICABLE`. Ils sont exclus du numerateur et du denominateur de progression, tout en restant consultables via `TOUTES` et le filtre PERSONNAGE `AVATAR`.

Le compteur global affiche :

`cartes obtenables possedees au moins une fois / cartes obtenables`

Il ne depend ni de la recherche, ni de la page, ni du filtre POSSESSION actif, ni de la visibilite DOM courante.

La section POSSESSION contient quatre choix mutuellement exclusifs :

- `TOUTES` : cartes obtenables et avatars autorises par les autres filtres ;
- `POSSEDEES` : cartes obtenables possedees ;
- `MANQUANTES` : cartes obtenables non possedees ;
- `NON OBTENABLES` : cartes `GENERATED_ONLY`, `TRANSFORMATION_ONLY` ou `SPECIAL_UNOBTAINABLE`.

Les neuf cartes non obtenables sont : `B000003`, `B000004`, `B000005`, `EDG000011`, `EDG000012`, `EN000011`, `MV000025`, `S000025` et `S000054`.

## COLLECTION-BATCH-01 - Sorts de zones et duo Porte / Clef

Le premier lot fonctionnel industriel couvre les sorts immediats de pioche et de deplacement de zones, plus le micro-systeme borne `S000007` / `S000008`.

Cartes protegees par non-regression, sans recodage fonctionnel : `S000004`, `S000006`, `S000017`, `S000022`, `S000051`.

Cartes nouvellement implementees et testees : `S000007`, `S000008`, `S000015`, `S000029`, `S000037`, `S000040`, `S000043`.

Carte reportee : `S000016`, car son texte demande un effet persistant pendant le reste de la partie et une reaction aux pioches adverses.

Primitives reutilisees : validation de cout, conditions de jeu, selection legale dans une zone, pioche controlee, deplacement main/deck/cimetiere, melange, cycle de vie des Sorts et inventaires runtime.

Primitive bornee ajoutee : `Porte infranchissable` bloque un emplacement libre de Serviteur adverse avec l'asset `S000007`. Une occurrence liee de `Clef de pierre` est ajoutee au deck adverse. Quand cette occurrence est piochee, elle libere uniquement son emplacement lie et rejoint le cimetiere du joueur qui l'a piochee.

Scenarios techniques caches : `collection-batch-01-zone-spells` et `collection-batch-01-door-key`.

Corrections COLLECTION-BATCH-01B :

- `S000040` conserve le texte public accentue `cimetiere` dans le runtime visuel sous sa forme correcte `cimetière`.
- `S000043` annonce uniquement le nombre reel de cartes ajoutees a la main.
- `GOB000002` affiche son lore en italique et ne traite plus ce texte comme une capacite programmable.
- `S000037` compte la main apres retrait du Sort et pioche les Serviteurs Gobelins jusqu'a 8 cartes si le deck le permet.
- `S000007` garde un texte public sans IDs techniques ; les details de lien Porte/Clef restent dans le panneau de test.
- La correction Collection de `S000008` en carte non obtenable est reportee au futur lot `COLLECTION-DATAFIX-1`.
