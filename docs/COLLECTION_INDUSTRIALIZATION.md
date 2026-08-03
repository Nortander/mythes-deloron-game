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

## COLLECTION-SYNC-02 - correction ciblée Collection / runtime / export

L'audit `COLLECTION-SYNC-01` a confirmé que la Collection devait recevoir trois sorts présents dans l'export principal du 30 juillet 2026 : `S000061` - Bouclier de glace, `S000062` - Déferlante de flammes et `S000063` - Choc mental.

La correction ciblée porte le corpus suivi à 331 cartes canoniques, dont 313 obtenables et 18 non obtenables. `TRL000020` - Ump est corrigé en 9/9. `AV000006` reste l'avatar Collection de Gor le Changeforme ; `AVS000006` reste la carte pseudo-serviteur, et `AVP000006` reste uniquement l'illustration portrait de partie. `B000018`, présent dans l'export du 30 juillet mais hors périmètre validé de cette synchronisation, est documenté comme reporté.

Cette synchronisation ne modifie ni `code/partie-test-1.html`, ni les decks Hokhan/Uram, ni les mains initiales, ni les marqueurs OUI/MAYBE, ni les assets.

Corrections de reprise `COLLECTION-SYNC-02B` :

- tous les Sorts de la Collection utilisent la palette visuelle `Sort`, même lorsqu'ils portent une faction imprimée comme Troll ou Gobelin ; l'icône de faction reste affichée ;
- `S000046` - Ça passe ou ça casse affiche maintenant le soin validé `1 à 4 PDV` au lieu d'un soin fixe à 4 points de vie ;
- `EN000005` répercute le mot-clef `[Pestilence]` et son infobulle générique validée ;
- `GOB000003` répercute `[Colère divine]` sans durée parasite dans le texte de carte, avec une infobulle générique complète ;
- les valeurs numériques des descriptions, conditions et infobulles des cartes touchées sont rendues comme valeurs mécaniques ;
- les mots-clefs suivis de deux-points passent par une espace insécable.

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

## COLLECTION-BATCH-09 - Trolls

Les cartes canoniques de la faction Troll disposent maintenant d'un comportement runtime et d'un test fonctionnel direct dans `tests/browser/collection-batch-09-trolls.spec.mjs`.

Le lot couvre les Faveurs `PRST000004` / `PRST000005`, l'Approvisionnement `R000026`, les sorts `S000046`, `S000048` et `S000055`, les Initiatives trolls, les effets de combat, les effets de debut et fin de tour, les Vengeances de `TRL000013` / `TRL000014`, la reduction de degats de `TRL000010`, la reduction progressive de cout de `TRL000019`, et le mode attachement de `TRL000015`.

`TRL000001` et `TRL000003` restent des serviteurs sans effet programmable propre au-dela des regles generiques, mais sont invoques par la Vengeance de `TRL000014`.

Scenarios techniques caches : `collection-batch-09-trolls`, `collection-batch-09-initiatives`, `collection-batch-09-combat`, `collection-batch-09-magic`, `collection-batch-09-protectroll`, `collection-batch-09-tempo`, `collection-batch-09-vengeance` et `collection-batch-09-faveurs-sorts`.
### Corrections COLLECTION-BATCH-09B

- Les scenarios Batch09 sont repartis par mecanisme pour rendre toutes les cartes Trolls testables sans terrain plein : cartes simples, Initiatives, combat, magie directe, Protectroll, tempo, Vengeance et Faveurs/sorts.
- Les descriptions publiques des cartes Trolls touchees renforcent les donnees numeriques importantes, sans exposer d'identifiants techniques.
- Les corrections fonctionnelles couvrent notamment Devore-magie limite aux sorts directs, Protectroll sur les degats d'avatar, les buffs persistants de Sang-furieux/Peau-de-pierre/Amasseur, l'attachement de Troll-nain, le delai de Vengeance du Troll premier-ne et Faveur de Mugwa qui fixe reellement le cout des Trolls a 1.
- `PRST000005` conserve son cout de lancement canonique a 3 selon l'export 2026-07-19 ; la valeur 1 concerne son effet permanent sur les Trolls allies.

### Corrections COLLECTION-BATCH-09C

- Les retours visuels Batch09B sont limites au perimetre Trolls et associes ; l'ancien classeur contenant des feuilles Elfes est ignore.
- Les textes publics de `S000046`, `S000048`, `TRL000005`, `TRL000015`, `TRL000017`, `TRL000018` et `TRL000020` mettent en valeur les valeurs variables attendues sans exposer de donnees techniques.
- `PRST000005` fixe maintenant le cout des serviteurs Trolls a 3 ressources tout en preservant les prerequis non-Nourriture pertinents ; le message public de Mugwa et celui de `PRST000004` sont exacts.
- Les bonus Trolls persistants ou temporaires utilisent le rendu de statistiques vertes et les compteurs visuels structures pour Sang-furieux et Devore-magie.
- Les scenarios techniques Batch09 rendent verifiables les pulsations, deplacements, soins d'avatar, retours Rune, Clef de pierre liee, effets de combat, modalite de `S000046` et reduction de cout de Mugwa.



### Corrections COLLECTION-BATCH-10C

- Les modales de choix Gobelins affichent desormais le bouton `REDUIRE` sur une ligne separee au-dessus du titre centre, avec cartes non rognees au survol.
- Les effets de fin de tour `GOB000001` / `GOB000007` se resolvent dans l'ordre gauche-droite du plateau, avec feedback avant la mutation reelle.
- `GOB000015` copie aussi les passifs runtime de sa cible : copier `GOB000013` ajoute une seconde source de reduction de degats, puis la retire quand Faux jumeau quitte le terrain.
- `GOB000019` se declenche par sacrifice volontaire d'un autre Gobelin allie, ouvre `DECRET ROYAL`, refuse l'auto-sacrifice et applique pioche, degats cibles ou bonus selon le choix.
- Les sorts `S000009`, `S000037`, `S000038`, `S000047` et l'Initiative de `GOB000014` exposent des animations sequentielles d'arrivee en main ou sur le terrain ; `S000049` retrouve son message public initial unique.
- Aucun changement n'est apporte a `code/collection.html`, aux decks Hokhan/Uram, aux mains initiales, aux marqueurs OUI/MAYBE, aux assets ou aux exports.

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

## COLLECTION-BATCH-04 - Polish statuts, pulsations et scenarios dedies

Ce lot ne cree pas une nouvelle famille de cartes : il renforce les contrats visuels et runtime issus des lots Batch-02 et Batch-03.

- `Colere divine` affiche un compteur unique directement sur la carte, synchronise avec les ticks 2, 3 puis 4 degats.
- `Hypnose` dispose d'une animation verte en boucle, d'un compteur numerique ou infini, et se retire des qu'une cible subit des degats.
- Le retour `Serviteur de la rune` expose une trajectoire terrain vers main du proprietaire avec attributs techniques testables.
- Les pulsations de capacite utilisent une couleur par faction, restent absentes en cas d'echec, et distinguent les passifs immobiles.
- `AVS000003` (`Undergast`) est renforce sur les cas sans cible, cible encore legale, reciblage et cout en Echos rejoue sans paiement supplementaire.
- `DIV000004` (`Gorgone seductrice`) applique maintenant `Hypnose` apres une attaque contre un serviteur adverse survivant et legalement affectable.
- Les scenarios techniques Batch-04 exposent des plateaux adverses plus robustes pour rendre `Colere divine`, `Hypnose` et les pulsations verifiables visuellement.

## COLLECTION-BATCH-10 - Gobelins

Les cartes canoniques de la faction Gobelin disposent maintenant d'un comportement runtime et d'un test fonctionnel direct dans `tests/browser/collection-batch-10-goblins.spec.mjs`.

Le lot couvre les Initiatives gobelines, les effets de fin de tour, la Vengeance, les passifs de plateau, les copies et transferts de mots-clefs, les manipulations de deck/main/cimetiere, la redirection de `Casse-cou`, les attaques speciales de `Gitzo`, ainsi que les sorts `S000009`, `S000037`, `S000038`, `S000047` et `S000049`.

`GOB000002` (`Surineur`) et `GOB000004` (`Globeminator`) restent documentees comme `SANS_EFFET_PROGRAMMABLE`.

Scenarios techniques caches : `collection-batch-10-gobelins`, `collection-batch-10-combat`, `collection-batch-10-sorts` et `collection-batch-10-special`.

Aucun changement n'est apporte a `code/collection.html`, aux decks Hokhan/Uram, aux mains initiales, aux marqueurs OUI/MAYBE, aux assets ou aux exports.

Corrections COLLECTION-BATCH-04C :

- `Hypnose` bloque maintenant réellement l'attaque et la riposte ; l'etat se retire apres degat sans effacer un epuisement preexistant.
- `GOB000001` (`Mageobelin lance-cailloux`) declenche son effet de fin de tour, inflige son ATK a un serviteur adverse legal et ne pulse pas si aucune cible valide n'existe.
- `AVS000005` (`Mage du Cercle - Yria de la lumiere`) expose un passif immobile : soins allies doubles dans la limite des PV max et pioche supplementaire au debut du tour du controleur.
- Le scenario `collection-batch-04-pulses` couvre les couleurs de pulsation des familles `edb`, `hum`, `orc`, `edg`, `nain`, `mvs`, `edn`, `trl`, `gob`, `div` et `bet`.
- Les scenarios techniques Batch-04 ne contiennent plus d'exemple `R000010`.
- Corrections 04E : le halo passif de `AVS000005` est fluide, `TRL000020` utilise le rendu terrain Troll complet, `AVS000009` et `AVS000012` disposent de passifs de debut de tour testes. `AVS000013` etait encore reporte dans Batch-04E, puis a ete implemente dans COLLECTION-BATCH-07.
- Corrections COLLECTION-BATCH-04F : le rendu Troll de `TRL000020` reprend la palette brun/or Collection, les halos passifs permanents sont generiques pour `AVS000005`, `AVS000003`, `H000024` et `EDG000008` sans assimiler `Rempart` seul a un passif, et les pulsations de `B000002`, `H000006`, `GOB000001` et `MV000020` ne se declenchent qu'apres une mutation effective. `AVS000006`, `AVS000009` et `AVS000012` sont presents dans le scenario visuel de pulsations.
- Corrections COLLECTION-BATCH-04G : les halos passifs permanents conservent leur boucle fluide mais avec une portee environ divisee par deux, la pulsation Elfe de glace utilise le blanc givre `#d8f7ffcc`, et la Vengeance de `AVS000006` invoque `B000003` avec impulsion et mouvement quand l'effet se resout reellement.

Scenarios techniques caches : `collection-batch-04-status-counters`, `collection-batch-04-hypnose`, `collection-batch-04-rune-return`, `collection-batch-04-pulses` et `collection-batch-04-undergast-cases`.

Aucun changement n'est apporte a `code/collection.html`, aux decks Hokhan/Uram, aux mains initiales, aux marqueurs OUI/MAYBE, aux assets ou aux exports.
## COLLECTION-BATCH-04H - Chaine de Vengeance de Gor

- `AVS000006` declenche maintenant toute la chaine canonique `B000003 -> B000004 -> B000005` par Vengeance.
- `B000003` et `B000004` sont des formes generees avec Vengeance fonctionnelle ; `B000005` est la forme finale avec Rempart uniquement.
- Chaque transformation reussie produit une pulsation de Vengeance avec la couleur de faction de la source et conserve l'inventaire des zones sans duplication fantome.
- Les donnees Collection ne sont pas modifiees dans ce lot.


## COLLECTION-BATCH-05 - Elfes des bois et Elfes de glace

Les cartes canoniques des factions Elfe des bois et Elfe de glace disposent maintenant d'un comportement runtime et d'un test fonctionnel direct dans `tests/browser/collection-batch-05-forest-ice-elves.spec.mjs`.

Le lot couvre les passifs de faction, les Initiatives, les soins, les pioches, les invocations generees, les effets de combat, les Vengeances et les sorts de zone des deux familles. Les cartes sans effet programmable propre restent documentees comme `SANS_EFFET_PROGRAMMABLE` : `EDB000004`, `EDB000006` et `EDG000002`.

Scenarios techniques caches : `collection-batch-05-elfes-des-bois` et `collection-batch-05-elfes-de-glace`.

Aucun changement n'est apporte a `code/collection.html`, aux decks Hokhan/Uram, aux mains initiales, aux marqueurs OUI/MAYBE, aux assets ou aux exports.

### Corrections COLLECTION-BATCH-05B

- `EDB000013` (`Kyra`) est realignee sur l'export 2026-07-17 : 6 ATK / 3 PV, texte court en carte et quatre comportements detailles en infobulles techniques.
- Les halos passifs Batch-05 sont limites aux vrais passifs continus et a `Vigilance` ; les effets de fin de tour, de combat, `Initiative`, `Vengeance`, `Camouflage`, `Rempart` et mots-clefs purs ne creent plus de halo permanent.
- `Camouflage` utilise les VFX differencies proprietaire/adversaire (`VFX000010` / `VFX000009`, hover `VFX000012` / `VFX000011`) sans halo passif.
- `R000003` empile sous `S000045` avec la production canonique : trois `Buissons a baies` ou plus produisent 5 Nourriture.
- `EDB000001` soigne un autre allie non mort-vivant apres avoir inflige des degats et conserve les degats doubles contre les morts-vivants.
- `EDG000012` (`Le Tisseur de Givre`) dispose de ses donnees runtime, de son invocation par `S000026`, de son verrou de pioche/invocation, de son refus d'attaque avatar, de son invocation defensive et de son effet de fin de tour.
- `S000026`, `S000027`, `S000029` et `S000034` sont raccordees au runtime et couvertes par tests directs.
- Nouveaux scenarios caches : `collection-batch-05-druide`, `collection-batch-05-kyra`, `collection-batch-05-dryade-solo`, `collection-batch-05-dryade-cleanse`, `collection-batch-05-pacte-millenaire` et `collection-batch-05-anciens-givre`.
- Aucun changement n'est apporte a `code/collection.html`, aux decks Hokhan/Uram, aux mains initiales, aux marqueurs OUI/MAYBE, aux assets ou aux exports.

## COLLECTION-BATCH-07 - Nains

Les cartes canoniques de la faction Nain disposent maintenant d'un comportement runtime et d'un test fonctionnel direct dans `tests/browser/collection-batch-07-dwarves.spec.mjs`.

Le lot couvre `AVS000013` (`Isgrimm`), les Initiatives de degats de zone, pioche, meule, copie de terrain et creation de `S000054`, les passifs nains `N000003` / `N000005`, la reduction de degats et la Vengeance de `N000009`, les soins de combat de `N000011`, les degats adjacents et reduction de cout de `N000014`, ainsi que les sorts `S000012`, `S000013` et `S000024`.

`AVS000013` choisit un serviteur dans un cimetiere, le place dans le deck du lanceur avec le statut dynamique `Serviteur de la rune`, puis le melange. Quand cette occurrence est jouee puis detruite, elle retourne dans la main du proprietaire et ne peut pas etre rejouee.

`N000013` reste documente comme `SANS_EFFET_PROGRAMMABLE`.

Scenarios techniques caches : `collection-batch-07-nains` et `collection-batch-07-isgrimm`.

Aucun changement n'est apporte a `code/collection.html`, aux decks Hokhan/Uram, aux mains initiales, aux marqueurs OUI/MAYBE, aux assets ou aux exports.

## COLLECTION-BATCH-06 - Elfes noirs

Les cartes canoniques de la faction Elfe noir disposent maintenant d'un comportement runtime et d'un test fonctionnel direct dans `tests/browser/collection-batch-06-dark-elves.spec.mjs`.

Le lot couvre les pseudo-avatars `AVS000009` et `AVS000012`, les Initiatives, les effets de debut et fin de tour, le contournement de `Rempart` par `EN000006`, les soins de combat, la maladie cumulative de `EN000005`, les Vengeances sombres, l'invocation de serviteurs generes et les sorts `S000039` / `S000056`.

`S000039` prepare les serviteurs elfes allies a une seconde attaque pendant le tour courant. `S000056` marque un serviteur allie et, lors de sa prochaine destruction, le renvoie dans la main de son proprietaire avec un cout de 0 pour sa prochaine invocation ; si la carte possede `Vengeance`, cette Vengeance est resolue avant le retour en main.

La carte generee `EN000011` reste documentee comme `SANS_EFFET_PROGRAMMABLE`.

Scenarios techniques caches : `collection-batch-06-elfes-noirs` et `collection-batch-06-mobilite-elfique`.

Aucun changement n'est apporte a `code/collection.html`, aux decks Hokhan/Uram, aux mains initiales, aux marqueurs OUI/MAYBE, aux assets ou aux exports.

### Corrections COLLECTION-BATCH-06B

- Les textes publics et marquages de variables de `EN000001`, `EN000002`, `EN000005`, `EN000007` et `EN000012` sont alignes sur l'export du 19 juillet et sur les retours visuels.
- Le mot-clef `Pestilence` est documente et rendu comme etat persistant : `EN000005` marque les serviteurs touches, les degats de debut de tour sont visibles, le soin retire la maladie et la Vengeance double les marqueurs deja presents.
- `EN000003` et `EN000009` produisent leurs invocations avec le theme mort-vivant et les halos passifs `Vigilance` attendus ; les halos passifs d'autres lots, notamment Yria, sont preserves par le resync.
- `EN000008` soigne aussi apres destruction d'un attaquant pendant sa defense, avec feedback seulement si le soin modifie reellement les PV.
- `S000049` est confirme comme la carte canonique `Machiavelisme` ; la mention `S000037 — Machiavelisme` etait une ambiguite de retour visuel, car `S000037` reste `Chemins de Ley`.
- `S000056` protege uniquement l'occurrence marquee : une autre copie du meme ID conserve son cout imprime et n'est pas sauvee par erreur.
- Aucun changement n'est apporte a `code/collection.html`, aux decks Hokhan/Uram, aux mains initiales, aux marqueurs OUI/MAYBE, aux assets ou aux exports.

### Corrections COLLECTION-BATCH-07B

- `AVS000013` ouvre désormais une sélection explicite dans les deux cimetières ; aucune cible n'est choisie automatiquement.
- `S000054` (`Boute-flammes`) applique réellement `Sang ardent` aux Nains déjà en jeu, retire `Embrasement` et protège les Nains futurs des dégâts périodiques de feu.
- `N000003` (`Vénérable`) donne son bonus de +2 ATK à tous les autres alliés et le retire proprement quand la source quitte le terrain.
- `N000014` (`Glamrig`) et `S000024` réduisent à la fois le coût total et les prérequis structurés des serviteurs nains concernés.
- Les textes publics et le rendu des sorts nains `S000012`, `S000013` et `S000024` sont réalignés ; `N000001` et `N000009` sont présents dans les scénarios visuels.
- Nouveau scénario caché : `collection-batch-07-boute-flammes`.
- Aucun changement n'est apporté à `code/collection.html`, aux decks Hokhan/Uram, aux mains initiales, aux marqueurs OUI/MAYBE, aux assets ou aux exports.

## COLLECTION-BATCH-08 - Orcs

Les cartes canoniques de la faction Orc disposent maintenant d'un comportement runtime et d'un test fonctionnel direct dans `tests/browser/collection-batch-08-orcs.spec.mjs`.

Le lot couvre `AVS000006` (Gor le Changeforme), les Initiatives orcs, les passifs de faction, la Rage distribuee par `ORC000014`, les effets de combat, les effets de debut et fin de tour, les Vengeances, les invocations de `S000014` et les degats en chaine de `S000032`.

`ORC000002`, `ORC000005` et `ORC000006` restent documentees comme `SANS_EFFET_PROGRAMMABLE`.

Scenarios techniques caches : `collection-batch-08-orcs`, `collection-batch-08-sorts-orcs` et `collection-batch-08-avatar-orc`.

Retours visuels Batch-08B :

- `ORC000001` ouvre un choix explicite entre soin allié et Embrasement adverse, puis une sélection de cible légale.
- `ORC000008` et `ORC000017` sont visibles dans les scénarios techniques Orcs.
- `ORC000018` mélange effectivement les positions des deux lignes avant les attaques face à face.
- `ORC000019` crée une occurrence en main rendue comme Orc et jouée avec un coût réduit d'une ressource.
- `ORC000020` applique le blocage de rejeu des Serviteurs de la rune après son retour en main.
- `S000032` arrête sa chaîne au premier emplacement vide à droite et ne saute plus les trous.
- Les textes publics Orcs renforcent les valeurs importantes et retirent les identifiants techniques de `S000014`.

Aucun changement n'est apporte a `code/collection.html`, aux decks Hokhan/Uram, aux mains initiales, aux marqueurs OUI/MAYBE, aux assets ou aux exports.

### Corrections COLLECTION-BATCH-10B

- Les retours visuels Daddy du scénario Gobelins sont intégrés sans modification de `code/collection.html`.
- Les feedbacks visuels de `GOB000001`, `GOB000007`, `GOB000008`, `GOB000011`, `GOB000012`, `GOB000014`, `S000009`, `S000037`, `S000038` et `S000047` sont séquencés avant ou pendant la mutation réelle, avec délais visibles bornés.
- `GOB000005` ne part plus au cimetière lorsqu'aucun Approvisionnement adverse n'existe dans le deck ; son échec destructeur reste limité au vrai raté de vol.
- `GOB000010`, `GOB000015`, `GOB000017` et `GOB000018` utilisent des choix explicites ou des sélections déterministes de test, avec diagnostics exploitables.
- `GOB000017` transfère réellement les mots-clefs volables, en excluant `Insensible` et `Serviteur de la rune`, et restitue l'état quand le lien quitte le terrain.
- `GOB000003` est vérifié contre un mort-vivant assez robuste pour prouver les dégâts triplés et l'application de `Colère divine`.
- Le message répété de `S000049` après Vengeance est retiré ; le message initial reste le seul feedback public de Machiavélisme.
- Aucun changement n'est apporté aux decks Hokhan/Uram, aux mains initiales, aux marqueurs OUI/MAYBE, aux assets ou aux exports.
