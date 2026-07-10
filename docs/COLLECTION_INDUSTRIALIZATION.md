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
- 308 cartes obtenables, seules prises en compte par la progression ;
- 10 cartes non obtenables, consultables via le filtre POSSESSION `NON OBTENABLES`.

Les 14 avatars historiques restent dans le catalogue runtime, mais ne sont pas des cartes : ils sont classes `catalogKind = AVATAR` et `obtainability = NOT_APPLICABLE`. Ils sont exclus du numerateur et du denominateur de progression, tout en restant consultables via `TOUTES` et le filtre PERSONNAGE `AVATAR`.

Le compteur global affiche :

`cartes obtenables possedees au moins une fois / cartes obtenables`

Il ne depend ni de la recherche, ni de la page, ni du filtre POSSESSION actif, ni de la visibilite DOM courante.

La section POSSESSION contient quatre choix mutuellement exclusifs :

- `TOUTES` : cartes obtenables et avatars autorises par les autres filtres ;
- `POSSEDEES` : cartes obtenables possedees ;
- `MANQUANTES` : cartes obtenables non possedees ;
- `NON OBTENABLES` : cartes `GENERATED_ONLY`, `TRANSFORMATION_ONLY` ou `SPECIAL_UNOBTAINABLE`.

Les dix cartes non obtenables sont : `B000003`, `B000004`, `B000005`, `EDG000011`, `EDG000012`, `EN000011`, `MV000025`, `S000008`, `S000025` et `S000054`.

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

Corrections COLLECTION-BATCH-01C :

- `S000043` possede maintenant les donnees runtime statiques de `B000015`, `B000016` et `B000017`, ce qui evite les cartes fantomes apres pioche visible des Minotaures.
- `S000007` conserve le slot adverse reellement vise par le joueur et le scenario technique valide le blocage puis la liberation de ce slot par la Clef liee.
- La correction Collection de `S000008` en carte non obtenable reste reportee au futur lot `COLLECTION-DATAFIX-1`.

Corrections COLLECTION-BATCH-01D :

- Le marqueur visuel de `S000007` est maintenant un verrou carre arrondi, sans ATK/PV, sans cout et sans libelle technique superpose.
- Le survol du verrou ouvre un apercu technique propre de type `Zone barree`, avec texte joueur lisible et carte liee `S000008` visible.
- `S000008` affiche une animation d'ajout au deck adverse, puis une animation d'ouverture lorsque la Clef liee est piochee.
- La Clef piochee rejoint visuellement le cimetiere du piocheur avec son image, et la Porte liee disparait avec une breve animation d'ouverture.
- Les messages publics n'exposent pas d'ID technique et distinguent l'ajout de la Clef de l'ouverture de la Porte.
- La correction Collection de `S000008` en carte non obtenable reste reportee au futur lot `COLLECTION-DATAFIX-1`.

Corrections COLLECTION-BATCH-01E :

- Le duo `S000007` / `S000008` utilise une file d'animations bornee au micro-systeme Porte/Clef, avec phases DOM observables pour les tests.
- Au lancement de `S000007`, le message joueur apparait seul avant le marqueur puis avant l'animation de la Clef vers le deck adverse.
- A la pioche de `S000008`, le message de pioche reste lisible avant l'apparition de la Clef, puis le message d'ouverture apparait sans etre masque.
- Le texte de l'apercu de zone parle maintenant d'une `porte monumentale` et ne contient aucun ID technique.
- Le contour du marqueur Porte est legerement renforce pour ameliorer sa lisibilite sans changer son format carre arrondi.
- La correction Collection de `S000008` en carte non obtenable reste reportee au futur lot `COLLECTION-DATAFIX-1`.

Correction COLLECTION-DATAFIX-1 :

- `S000008` est classee `GENERATED_ONLY` : elle reste canonique et consultable via `NON OBTENABLES`, ainsi que comme carte liee de `S000007`, mais elle ne compte plus dans les cartes obtenables.
- La progression Collection passe a 308 cartes obtenables et 10 cartes non obtenables.

## Import dormant du 10 juillet 2026

L'export principal `Jeu de cartes fantasy « Mythes d'Eloron » - export 2026-07-10.xlsx` (SHA-256 `d874b8d2f6260765aa241dab396cc35d1d42fd8d5a95bd0b3d3c6eb173e1b62f`) ajoute 10 cartes canoniques à la Collection : `H000032` à `H000036`, `S000055` et `S000057` à `S000060`.

Les cartes `H000032` et `S000055` sont obtenables. Les huit autres maillons de la chaîne Gabar sont classés `GENERATED_ONLY`. Tous leurs effets restent dormants et portent le statut déclaratif `ABSENT` : aucun handler ni comportement de partie n'est ajouté.

Le corpus passe à 328 cartes canoniques, dont 310 obtenables et 18 non obtenables. Les 14 avatars historiques restent hors corpus.
