\# Mythes d’Eloron — contexte projet



Projet : jeu de cartes fantasy virtuel pour ordinateur.



Sources de vérité :
\- Les fichiers Drive sont la source vivante.

\- Les fichiers du dossier data/ sont l’export de référence utilisé pour la session de correction en cours.

\- Le spreadsheet "Jeu de cartes fantasy « Mythes d'Eloron » - export 2026-06-05" fait foi pour les règles, cartes, IDs, coûts, effets et textes.

\- Le spreadsheet "Decks de test - export 2026-06-05" fait foi pour la composition des decks utilisés dans la partie test.

\- Le repo GitHub `Nortander/mythes-deloron-assets` contient les assets visuels et audio appelés par le code.

\- Les dossiers "assets/0_ARCHIVES" et "assets/1_EN ATTENTE DE TRIAGE" sont des dossiers personnels de travail. Codex ne doit pas les utiliser, les modifier, les renommer ou y chercher des assets pour le jeu, sauf demande explicite.

\- L’arborescence du dossier assets/ suit presque celle du dépôt GitHub `mythes-deloron-assets`. Les chemins d’assets utilisés par le code doivent respecter cette structure. Ne pas renommer les fichiers d’assets : leurs noms correspondent aux IDs de la Bible du jeu.


## Règle absolue — données issues des spreadsheets

Les spreadsheets de référence font foi.
Lorsqu’une carte, un deck, une musique, un dos de carte, un effet ou tout autre item est intégré depuis un spreadsheet, ses données doivent être recopiées exactement.

Il est interdit de :
- résumer une description ;
- reformuler une capacité spéciale ;
- simplifier une mécanique ;
- modifier un coût, une faction, un type, une valeur ou une limitation ;
- inventer une donnée manquante ;
- “améliorer” un texte sans demande explicite.

Si une donnée semble trop longue, ambiguë, incohérente ou difficile à intégrer, Codex doit la signaler au lieu de la modifier.

Convention importante :
- une cellule vide signifie “champ vide” ;
- une cellule contenant uniquement `/` signifie également “champ vide” ;
- le caractère `/` ne doit donc jamais être affiché seul dans le jeu ;
- en revanche, si `/` apparaît dans un texte plus long, il doit être conservé.


## Règle de rendu des cartes

Le spreadsheet fait foi pour le contenu, les valeurs et les mécaniques.
Cependant, l’affichage dans `collection.html` doit respecter les conventions HTML déjà présentes dans la Collection.

Les mots-clefs entre crochets dans le spreadsheet, par exemple `[Initiative]`, servent d’indication interne. Ils ne doivent pas forcément être affichés avec les crochets si les cartes existantes affichent ces mots-clefs autrement.

Les variables, chiffres importants ou valeurs mises en gras dans le spreadsheet doivent conserver une mise en valeur équivalente dans la Collection.

Une cellule contenant uniquement `/` équivaut à un champ vide.

Les champs techniques utiles comme `related` ne doivent pas être supprimés simplement parce qu’ils ne correspondent pas à une colonne brute du spreadsheet. Si une carte mentionne explicitement une autre carte, `related` doit être conservé ou recréé selon la convention existante.

La ponctuation française doit respecter les espaces insécables : `« texte »`, espace insécable avant `:`, `;`, `?`, `!`.


## Référence visuelle des cartes

La page `collection.html` fait foi pour le rendu visuel des cartes : thèmes de factions, couleurs, templates, apparence des cartes dans la grille et dans la modale.

La partie test doit s’aligner sur la logique visuelle de la Collection. Si une carte change de thème ou de couleurs entre la main et le plateau en partie test, c’est la partie test qui doit être corrigée.


## Différence avatar / pseudo-avatar

Les avatars et les pseudo-avatars sont liés, mais leurs textes ne sont pas interchangeables. Les pseudo-avatars `AVS...` constituent un type spécifique de serviteurs. Ils ne doivent pas être assimilés à de simples serviteurs classiques dans les données de référence. La distinction `Serviteur (pseudo avatar)` doit être conservée et clarifiée dans le code si nécessaire, pas supprimée.

- Les infobulles d’avatars doivent utiliser les textes de l’onglet `Avatars et description`.
- Les cartes pseudo-avatars `AVS...` doivent utiliser les textes de l’onglet `Cartes et description`.
- Ne jamais remplir une infobulle d’avatar avec la description de sa carte pseudo-avatar, sauf demande explicite.


## Convention de rendu des mots-clefs et variables

Dans les cartes et infobulles :
- les mots-clefs de capacité doivent être affichés en gras, sans crochets ;
- les variables, chiffres et valeurs importantes doivent être affichés avec une mise en valeur forte, idéalement `<strong class="kv">…</strong>` ;
- l’italique est réservé aux textes de lore ou aux citations d’ambiance, pas aux mots-clefs de gameplay.


## Règle canonique — mains de départ et premier joueur

Dans les fichiers de decks de test, chaque deck dispose d’une colonne indiquant le statut de chaque carte pour la main de départ.

Cette colonne peut contenir trois valeurs :
- `OUI` : la carte est dans la main de départ.
- `NON` : la carte reste dans le deck et n’est pas dans la main de départ.
- `MAYBE` : la carte est piochée automatiquement au premier tour uniquement si ce deck est joueur 2 ; si ce deck est joueur 1, la carte reste dans le deck.

Au lancement d’un scénario, le joueur qui commence est tiré au sort.

Règles de départ :
- Le joueur 1 commence avec exactement ses 5 cartes marquées `OUI`.
- Le joueur 1 ne pioche pas au début de son premier tour.
- Le joueur 2 commence avec exactement ses 5 cartes marquées `OUI`.
- Le joueur 2 pioche automatiquement sa carte `MAYBE` au début de son premier tour, si une carte `MAYBE` est définie pour son deck.
- La carte `MAYBE` ne doit jamais être ajoutée à la main au lancement de la partie.
- Si le deck devient joueur 1, sa carte `MAYBE` reste simplement dans le deck.

Règle d’affichage :
- Le joueur 1 est toujours affiché en bas de l’écran.
- Le joueur 2 est toujours affiché en haut de l’écran.
- Après le tirage au sort, un message doit annoncer quel avatar commence la partie.
- Le message doit utiliser le nom de l’avatar, pas seulement “joueur 1” ou “joueur 2”.


## Règle canonique — Insensible

Nouvelle définition du mot-clef `Insensible` :

Un serviteur doté de ce mot-clef ne peut pas être la cible de sorts ni de capacités spéciales adverses.

Les sorts lancés par le propriétaire du serviteur avec `Insensible`, ainsi que les capacités spéciales des serviteurs alliés, affectent normalement le serviteur `Insensible`.

Un serviteur possédant `Insensible` ne peut être atteint par une capacité spéciale ou un sort adverse que si la carte adverse mentionne explicitement qu’elle passe outre la protection du mot-clef `Insensible`.

Conséquence importante :
- `Insensible` protège désormais aussi contre les capacités spéciales adverses.
- Les anciennes exceptions liées aux effets de zone ou aux effets aléatoires ne sont plus valables par défaut.
- Si une carte doit passer outre `Insensible`, cela doit être écrit explicitement dans son texte.


État actuel :

\- `collection.html` contient la page Collection.

\- `partie-test-1.html` contient la partie test où l’utilisateur joue les deux adversaires.

\- `le dossier assets/ARCHIVES contient d’anciennes références et ne doit pas être utilisé par défaut. Ne l’explorer que si l’utilisateur le demande explicitement.



Menu actuel :

\- Partie contre l’ordinateur

\- Partie multijoueur

\- Campagne

\- Collection

\- Paramètres

\- Statistiques



Pour le moment, seuls "Partie contre l’ordinateur" et "Collection" doivent être cliquables.



Règle de travail :

\- Ne pas réécrire tout le projet sans demande explicite.

\- Corriger par petites étapes.

\- Après chaque correction, documenter ce qui a été modifié dans `CHANGELOG\_CODEX.md`.

\- Ne jamais modifier les IDs de cartes/assets sans demande explicite.

\- Ne pas changer la direction artistique ou les URLs d’assets sans vérification.
