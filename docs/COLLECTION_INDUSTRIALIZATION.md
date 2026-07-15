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

## COLLECTION-BATCH-02 - Gabar et Triangle des ténèbres

Les dix cartes importées le 10 juillet disposent désormais d'un comportement runtime et d'un test fonctionnel direct. La chaîne `H000032` à `H000036` crée puis résout automatiquement `S000057` à `S000060`, retire la forme précédente de la partie et invoque la forme suivante si un emplacement est libre.

Les Initiatives, les effets de mort alliée, les invocations de début de tour et la copie de Sort de `H000036` sont actifs. `S000055` exige exactement trois serviteurs alliés sans `Insensible`, les sacrifie, génère dix Échos et invoque `MV000024` avec `Insensible` pendant les trois prochains tours du lanceur.

Interprétations bornées et testées : `H000033` effectue deux tirages aléatoires indépendants pour le nombre de cibles et les dégâts (chacun de 0 à 4) ; l'Insensible accordé par `S000055` expire après la fin du troisième prochain tour du propriétaire. Les scénarios techniques restent cachés du sélecteur public.

### Corrections COLLECTION-BATCH-02B

- Les cartes `H000032` à `H000036`, `S000055` et `S000057` à `S000060` utilisent les assets locaux dans la partie test, y compris les aperçus et cartes liées.
- `S000055` exclut les serviteurs `Insensible` des sacrifices, affiche une condition d'invocation claire et laisse un marqueur `Insensible temporaire` visible sur Morghast pendant trois tours du propriétaire.
- Les sorts d'évolution Gabar exigent leur forme source exacte : une mauvaise forme ne déclenche plus d'évolution automatique et évite toute boucle de pioche.
- Les scénarios techniques `collection-batch-02-gabar`, `collection-batch-02-triangle` et `collection-batch-02-generated-spells` ont été enrichis pour vérifier les messages accentués, l'animation d'ajout au deck, les invocations de début de tour, la pioche sur mort alliée et la copie sélective de Sorts par Gabar maître-magicien.
- Aucun changement n'est apporté au corpus Collection, aux decks Hokhan/Uram, aux mains initiales, aux marqueurs OUI/MAYBE, aux assets ou aux exports.

### Corrections COLLECTION-BATCH-02C

- Les textes runtime de `H000032` à `H000036`, `S000055` et `S000057` à `S000060` sont réalignés sur l'export principal du 10 juillet ; les marquages visuels de variables restent limités au rendu.
- Les sorts générés de Gabar sont rendus comme des textes de capacité, pas comme du lore, et les cartes liées utilisent les assets locaux, y compris `MV000001` depuis l'aperçu de Morghast.
- L'Insensible temporaire de Morghast est visible dans l'aperçu complet de la carte, ne consomme pas le tour d'invocation et expire après trois fins de tour du propriétaire.
- Gabar affiche un feedback visuel quand il est responsable d'un ajout au deck, d'une pioche, d'une copie de Sort ou d'une invocation de début de tour.
- Aucun changement n'est apporté à `code/collection.html`, aux decks, mains initiales, marqueurs OUI/MAYBE, assets ou exports.

## COLLECTION-BATCH-03 - Humains restants

Les 42 cartes Humain canoniques qui n'etaient pas encore FONCTIONNEL_TESTE disposent maintenant d'un comportement runtime et d'un test direct dans `tests/browser/collection-batch-03-humans.spec.mjs`. Le lot couvre les avatars pseudo-serviteurs AVS Humain, les Initiatives de deplacement, degats, invocation, gel et paires de serviteurs, les soins, protections, effets de combat, effets de debut/fin de tour et Vengeances bornees.

Les dependances directes necessaires au fonctionnement sont explicites : `DIV000001`, `DIV000002`, `DIV000003`, `DIV000004`, `DIV000006`, `DIV000009`, `MV000020`, `MV000009` et `MV000016`. Les cartes deja verrouillees par les lots precedents, notamment Batch-02, restent couvertes par leurs tests de non-regression.

Scenarios techniques caches : `collection-batch-03-humans-overview`, `collection-batch-03-humans-triggers`, `collection-batch-03-humans-avatars`, `collection-batch-03-humans-ianna` et `collection-batch-03-humans-spells`.

Aucun changement n'est apporte a `code/collection.html`, aux decks Hokhan/Uram, aux mains initiales, aux marqueurs OUI/MAYBE, aux assets ou aux exports.

### Corrections COLLECTION-BATCH-03B

- `H000012` applique des marqueurs de `Colere divine` periodiques aux serviteurs morts-vivants adverses : 2, puis 3, puis 4 degats aux debuts de tour concernes, avec retrait d'un Echo adverse si Randall reste en jeu et que la cible meurt sous cet effet.
- Le mot-clef `Serviteur de la rune` renvoie le serviteur detruit dans la main de son proprietaire, sans doublon terrain/cimetiere.
- `H000027` affiche ses bonus de main en vert et les conserve visuellement apres invocation.
- `AVS000004` invoque les Gorgones canoniques `DIV000003` et `DIV000004`.
- `AVS000011` utilise le nom corrige `miroirs` et redirige 75 % des attaques/ciblages vers un autre serviteur eligible.
- `AVS000010`, `AVS000007` et `AVS000014` ont ete renforces pour le vol de pioche, la production de `DIV000002` par `DIV000001` et le saut reel du tour adverse.
- `S000028` et `S000033` exposent leurs statuts dynamiques dans les apercus et `S000033` applique `Colere divine` au combat sans degats directs factices.
- Les messages publics generiques `Initiative resolue` sont retires au profit d'une impulsion visuelle.

### Corrections COLLECTION-BATCH-03C

- Renforcement visuel de Colère divine : éclair blanc initial et arcs électriques périodiques distincts, chacun avec classe et état testable.
- Serviteur de la rune vérifié sur destruction par dégâts directs et par combat, avec retour visible en main et absence de doublon.
- Randall Mainblanche affiche `1 Écho` comme valeur mécanique Humain en bleu #002fa7 dans le texte principal.
- Les cartes bloquées en main reçoivent un voile, un cadenas, un contour de blocage et une source publique correcte jusqu'à expiration.
- Hallebardier est audité sur l'adjacence gauche/droite, la non-adjacence et les bords de ligne.
- H000028 est confirmé comme Rempart sans capacité spéciale supplémentaire ; H000029 et H000030 restent visibles et testés. L'ID exact de Nécrâne est H000030.
- Main d'argent est borné à 75 % de redirection avec RNG injectable et aperçu long non croppé.
- Undergast rejoue chaque sort une seule fois sans boucle.
- Ianna vole uniquement la vraie carte effectivement piochée par l'adversaire avec 50 % de chance.
- Main guérisseuse et Aura de protection ouvrent une sélection de cible avant paiement et appliquent leurs effets réels.

### Corrections COLLECTION-BATCH-03D

- `H000012` conserve un seul statut dynamique de `Colère divine`, applique les dégâts périodiques 2, 3 puis 4, et n'affecte pas les Avatars.
- Le retour `Serviteur de la rune` expose une animation terrain vers main avec marqueur technique testable, sans duplication terrain/cimetière/main.
- `H000002` bloque immédiatement la carte renvoyée en main et le blocage expire à la fin du tour effectif du propriétaire.
- `H000030` (`Nécrâne, Mage des ténèbres`) se déclenche à la fin du tour de son propriétaire, conformément au texte canonique, et non au début du tour.
- `AVS000003` (`Undergast`) rejoue le Sort ciblé sans créer de copie en main et sans ajouter un second exemplaire du Sort au cimetière.
- `AVS000010` (`Ianna la Chanteuse`) dispose d'un scénario technique caché dédié, avec séquence visible de carte piochée puis volée.
- `S000028` garde les PV en vert uniquement quand le bonus de PV maximum ne laisse pas la cible blessée ; une cible encore blessée reste affichée en rouge.

### Corrections COLLECTION-BATCH-03E

- `H000012` affiche un compteur unique et dynamique de `Colère divine`, synchronisé sur les dégâts restants et les ticks 2, 3 puis 4.
- `H000002` bloque uniquement l'occurrence runtime renvoyée par le Mage ermite ; une autre copie du même ID reste jouable si elle n'est pas celle qui a été renvoyée.
- Le retour du `Serviteur de la rune` utilise une animation terrain vers main plus lisible, distincte d'une simple impulsion.
- `AVS000010` applique une séquence déterministe : pioche visible, impulsion d'Ianna, révélation centrale, puis transfert main adverse vers main d'Ianna ; les échecs ne produisent pas cette séquence.
- `AVS000003` rejoue réellement le Sort une seconde fois, sans copie en main, sans boucle, avec reciblage uniquement si une autre cible légale existe.
- Le scénario technique caché `collection-batch-03-humans-undergast` isole les cas de rejeu et de reciblage d'Undergast.
- Les règles générales d'impulsion, mouvement et non-feedback en cas d'échec sont centralisées dans `docs/CODEX_WORKFLOW_GUARDRAILS.md`.
