\# BUGS À TRAITER — Retours Léo



\## Retours issus de la dernière partie test



\### 1. Déclenchement de la musique au lancement de la partie



La musique devrait se déclencher toute seule, au lancement de la partie, sans attendre que le joueur clique une première fois sur le bouton \*\*Fin de tour\*\*.



État actuel constaté : la musique semble désormais se déclencher aussi lorsque le joueur 1 a joué son maximum de 3 cartes lors de son premier tour.



Comportement attendu : la musique devrait idéalement se déclencher dès l’écran de titre \*\*MYTHES D’ELORON\*\*.



\---



\### 2. Arrêt prématuré de la musique



La musique s’arrête parfois toute seule après un unique morceau.



Comportement attendu : la lecture doit continuer automatiquement.



\---



\### 3. Boucle musicale aléatoire continue



La musique ne devrait pas s’arrêter une fois tous les morceaux écoutés, tant que la partie n’est pas finie.



Comportement attendu : la lecture aléatoire doit continuer en boucle.



\---



\### 4. Nombre d’exemplaires de Léna, magicienne du froid



Lors de la partie, plusieurs exemplaires de \*\*Léna, magicienne du froid\*\* ont été piochés.



Problème : cette carte est supposée ne pouvoir être intégrée qu’en un seul exemplaire unique dans chaque deck.



\---



\### 5. Infobulles des cartes sur le terrain masquées



L’affichage des infobulles des cartes sur le terrain est toujours partiellement masqué par l’agrandissement desdites cartes au survol de la souris.



Comportement attendu : les infobulles devraient se situer directement à droite de la version agrandie des cartes auxquelles elles font référence.



\---



\### 6. Assassin nocturne — Vengeance incorrecte ou aléatoire



Carte concernée : \*\*Assassin nocturne\*\*

ID : `EN000002`



Problème : la capacité \*\*\[Vengeance]\*\* ne semble pas toujours se déclencher correctement. Parfois seul le message s’affiche. L’activation semble très aléatoire.



Correction de règle : certains retours précédents contredisaient la description détaillée du spreadsheet. C’est le spreadsheet qui fait foi.



Comportement attendu : ce n’est pas le serviteur qui détruit l’Assassin nocturne et ses voisins qui doivent subir les dégâts de \*\*\[Vengeance]\*\*. Les dégâts doivent être infligés au serviteur situé directement en face de l’Assassin nocturne au moment où il est détruit, ainsi qu’aux deux serviteurs directement latéraux à ce serviteur.



\---



\### 7. Druide — dégâts non doublés contre les morts-vivants



Carte concernée : \*\*Druide\*\*

ID : `EDB000001`



Problème : le montant de dégâts infligés par le Druide ne semble pas être doublé contre les morts-vivants, contrairement à ce qui est écrit dans la description de sa capacité spéciale.



État : à vérifier, pas encore retesté.



\---



\### 8. Animation de pioche avec main pleine



Quand la main est remplie, l’animation de pioche de la douzième carte continue d’apparaître chaque tour, comme si la carte venait d’être piochée.



Problème : cette carte peut potentiellement être dans la main depuis déjà plusieurs tours.



Comportement attendu : ne pas rejouer une animation de pioche pour une carte déjà présente en main.



État : à vérifier, pas encore retesté.



\---



\### 9. Bouton de fin de tour devant les infobulles



Le bouton de fin de tour passe parfois devant les infobulles des cartes les plus à droite de la main d’un joueur.



Comportement attendu : les infobulles et cartes agrandies par survol de la souris doivent toujours apparaître au premier plan.



État : à vérifier, pas encore retesté.



\---



\### 10. Après la catastrophe — effet non fonctionnel



Carte concernée : \*\*Après la catastrophe\*\*

ID : `S000015`



Problème : le sort affiche bien un message confirmant son activation, mais rien ne se produit ensuite.



Comportement attendu :



\* afficher le contenu du cimetière du joueur ;

\* permettre de sélectionner jusqu’à 3 serviteurs ;

\* renvoyer ces serviteurs dans le deck ;

\* remélanger le deck ;

\* mettre à jour le nombre de cartes affiché dans le deck.



État actuel : rien de tout cela ne se produit.



\---



\### 11. Ressource âmes — consommation incorrecte



La mécanique unique de la ressource \*\*âmes\*\* n’est pas correctement appliquée.



Règle attendue : le montant d’âmes à disposition d’un joueur doit diminuer chaque fois qu’un serviteur avec un coût en âmes est joué, du montant nécessaire à l’invocation.



Exemple : si le joueur a 1 âme disponible et invoque le \*\*Guerrier cendreux\*\* (`MV000001`), dont le coût en âmes est de 1, alors le total doit passer de 1 à 0.



État actuel : ce n’est pas ce qui se produit.



\---



\### 12. Araignée géante réanimée — retrait de la partie incorrect



Carte concernée : \*\*Araignée géante réanimée\*\*

ID : `MV000008`



Problème : la capacité spéciale ne fonctionne pas comme attendu.



État actuel :



\* elle applique seulement un effet visuel à un serviteur adverse ;

\* la carte ciblée devient semi-transparente ;

\* la carte ciblée peut encore être attaquée ;

\* elle peut riposter ;

\* elle peut attaquer ;

\* elle peut utiliser sa capacité spéciale ;

\* elle occupe toujours un emplacement de serviteur sur le terrain de son propriétaire.



Comportement attendu :



\* la cible doit être retirée de la partie comme si elle n’avait jamais existé ;

\* elle ne doit plus être sur le terrain ;

\* elle ne doit pas aller au cimetière ;

\* elle ne doit pas retourner dans le deck ;

\* elle doit être stockée en mémoire ;

\* elle revient sur le terrain uniquement si l’Araignée géante réanimée est envoyée au cimetière et qu’un emplacement de serviteur est disponible pour son retour.



Règle de ciblage : comme pour toutes les capacités spéciales où les cibles ne sont pas indiquées comme choisies aléatoirement, le joueur qui déclenche l’effet doit pouvoir sélectionner la ou les cibles.



\---



\### 13. Deck vide — affichage et pioche



Quand un deck est vide, l’emplacement du deck du propriétaire ne devrait plus afficher aucune carte.



Comportement attendu :



\* supprimer aussi le message de pioche de début de tour pour ce joueur ;

\* ne pas annoncer une pioche s’il n’y a rien à piocher ;

\* si un effet renvoie une ou plusieurs cartes dans le deck, rétablir l’affichage normal.



État : à vérifier, pas encore retesté.



\---



\### 14. Main de Raith pleine à 9 cartes



Le jeu indique que la main de Raith est pleine à 9 cartes au lieu de 12.



Problème : impossible de piocher au-delà de 9 cartes.



État : à vérifier, pas encore retesté.



\---



\### 15. Druide — capacité de soin inactive



Carte concernée : \*\*Druide\*\*

ID : `EDB000001`



Problème : la capacité de soin du Druide ne se déclenche jamais.



État : à vérifier, pas encore retesté.



\---



\### 16. Point vide dans le document source



Aucun retour renseigné.



\---



\### 17. Raith ne pioche pas à chacun de ses tours



Malgré le message annonçant une pioche, Raith ne pioche pas réellement à chacun de ses tours.



État : semble encore se produire de temps en temps.



\---



\### 18. Des yeux dans le noir — blocage cassé



Carte concernée : \*\*Des yeux dans le noir\*\*



Problème : l’effet de blocage du sort ne fonctionne plus du tout, malgré la sélection de la cible.



Problème secondaire : le bouton \*\*Annuler\*\* sous la sélection ne semble pas avoir d’effet et n’a pas beaucoup d’intérêt dans l’état actuel.



État : à vérifier, pas encore retesté.



\---



\### 19. Serviteurs morts-vivants jouables sans ressource âme



Cartes concernées :



\* \*\*Araignée géante réanimée\*\* — `MV000008`

\* \*\*Spectre hurlant\*\* — `MV000002`



Problème : ces cartes peuvent être jouées sans disposer de ressources en âmes, simplement parce que le total des autres types de ressources est supérieur ou égal au nombre demandé pour l’invocation.



Observation : ce problème de comptage ne se produit pas avec tous les serviteurs morts-vivants, seulement certains d’entre eux.



\---



\### 20. Héraut ténébreux — Vengeance incorrecte



Carte concernée : \*\*Héraut ténébreux\*\*

ID : `EN000005`



Problème : quand il est détruit, sa capacité \*\*\[Vengeance]\*\* se déclenche et inflige des dégâts à un ou des serviteurs ennemis aléatoires, sans tenir compte du fait qu’il les ait effectivement affrontés et contaminés avec sa capacité spéciale.



Comportements attendus :



\* ne cibler que les serviteurs réellement concernés par l’effet ;

\* ne pas afficher le message de \*\*\[Vengeance]\*\* si aucun serviteur adverse n’est affecté, par exemple quand le plateau est vide.



État : à vérifier, pas encore retesté.



\---



\### 21. Camouflage et Vigilance — comportement incohérent



Problème : quand le joueur joue Raith, qu’il n’a pas de serviteur avec \*\*\[Vigilance]\*\* sur son terrain et que l’adversaire joue un serviteur avec \*\*\[Camouflage]\*\*, ce serviteur ne devrait pas apparaître avec le filtre visible qu’il aurait si Raith disposait de \*\*\[Vigilance]\*\*.



Comportement attendu :



\* sans \*\*\[Vigilance]\*\*, le serviteur camouflé ne doit pas être ciblable ;

\* il ne doit être atteignable que par attaque de zone, capacité de ciblage aléatoire ou sort adapté ;

\* les filtres liés au camouflage doivent être cohérents dès l’invocation.



État : comportement des filtres lié au camouflage jugé assez aléatoire, à retester avec vigilance.



\---



\### 22. Lecteur de musique — bugs visuels



Problèmes visuels sur le bouton du lecteur de musique :



\* la barre de son fait parfois apparaître deux curseurs au lieu d’un ;

\* le clic sur l’icône pour activer ou mettre en pause la musique ne donne pas le résultat attendu ;

\* deux icônes différentes semblent se superposer.



\---



\### 23. Main initiale de Raith



Raith, en tant que joueur 2, devrait commencer avec 5 cartes et piocher une sixième carte lors de son premier tour.



État actuel : Raith commence avec 5 cartes seulement.



\---



\### 24. Capacités non aléatoires — choix des cibles



Certaines cartes possèdent une capacité spéciale à cible unique ou à cibles multiples dont le ciblage n’est pas marqué comme aléatoire.



Règle attendue : si la description de la capacité spéciale ne dit pas implicitement que le choix est aléatoire, le joueur propriétaire de la carte produisant l’effet doit pouvoir choisir sur qui ou quoi l’appliquer.



\---



\### 25. Guérisseur — calcul du soin incorrect



Carte concernée : \*\*Guérisseur\*\*



Problème : la capacité spéciale de guérison ne fonctionne pas comme prévu.



État actuel : elle semble rendre 1 point de vie par carte d’approvisionnement fournissant du Lenya.



Comportement attendu : elle doit rendre 1 point de vie par ressource de Lenya présente sur le plateau du propriétaire.



État : à vérifier, pas encore retesté.



\---



\### 26. Assassinat — option de sacrifice absente



Carte concernée : \*\*Assassinat\*\*

ID : `S000005`



Problème : contrairement à la description du sort, le joueur adverse n’a pas la possibilité de choisir de sacrifier deux cartes approvisionnement de son terrain pour annuler l’activation de l’effet de destruction d’Assassinat.



\---



\### 27. Spectre hurlant — carte RAME0 et compteur d’âmes



Carte concernée : \*\*Spectre hurlant\*\*

ID : `MV000002`



Comportement attendu :



\* le Spectre hurlant devrait placer la carte `RAME0` sur le terrain si aucune des cartes `RAME0`, `RAME5`, `RAME10`, `RAME15`, `RAME20` ou `RAME21` ne se trouve déjà sur le terrain ;

\* cela doit se produire même quand la capacité du Spectre hurlant ne détruit aucun serviteur ;

\* si l’une des cartes `RAME0`, `RAME5`, `RAME10`, `RAME15`, `RAME20` ou `RAME21` se trouve déjà sur le terrain et que la capacité du Spectre hurlant détruit bien un serviteur, alors le compteur d’âmes doit augmenter de +1 ;

\* la carte d’approvisionnement en âmes doit évoluer si le total d’âmes collectées le permet.



État : à vérifier, pas encore retesté.



\---



\### 28. Faucheur d’âmes — capacité inactive



Carte concernée : \*\*Faucheur d’âmes\*\*

ID : `MV000009`



Problème : la capacité spéciale du Faucheur d’âmes ne s’active pas quand il détruit un serviteur.



État : à vérifier, pas encore retesté.



\---



\### 29. Guerrier cendreux — texte de lore en doublon



Carte concernée : \*\*Guerrier cendreux\*\*

ID : `MV000001`



Problème : le texte de lore s’affiche deux fois dans le champ de description, l’un en dessous de l’autre.



Problème secondaire : le doublon est difficile à lire, car il apparaît en noir sur violet sombre.



Comportement attendu : ne conserver que la première itération du texte.



\---



\### 30. Murmures divins — pioche et choix absents



Carte concernée : \*\*Murmures divins\*\*



Problème : le sort affiche correctement un message lorsqu’il est joué, mais ne fait pas piocher comme prévu.



Comportement attendu :



\* faire piocher les cartes prévues ;

\* permettre de choisir, parmi les cartes piochées, celle qui doit être renvoyée dans le deck.



\---



\### 31. Amasseur — Initiative inactive



Carte concernée : \*\*Amasseur\*\*



Problème : l’Amasseur ne fait pas piocher de carte approvisionnement.



Comportement attendu : sa capacité spéciale d’initiative doit se déclencher.



\---



\### 32. Sorcier venimeux — coût affiché incorrect



Carte concernée : \*\*Sorcier venimeux\*\*



Problème : le coût affiché ne correspond pas à sa valeur du spreadsheet.



Comportement attendu : il devrait exiger du Lenya ET du Bois.



\---



\### 33. Sorcier venimeux — Initiative inactive



Carte concernée : \*\*Sorcier venimeux\*\*



Problème : il n’utilise pas sa capacité d’initiative quand il est joué depuis la main.



\---



\### 34. Pierres de communication — pioche et état de main incohérents



Carte concernée : \*\*Pierres de communication\*\*



Problème : le sort ne semble pas faire piocher comme prévu après quelques tours.



Problème secondaire : le tour après avoir joué ce sort, la main retrouvée était exactement la même qu’au tour précédent, y compris avec les cartes qui avaient pourtant été posées sur le terrain.



\---



\### 35. Prêtresse de l’Hiver — mauvais effet appliqué



Carte concernée : \*\*Prêtresse de l’Hiver\*\*



Problème : elle semble désormais infliger \*\*\[Gel]\*\* au lieu du \*\*\[Coup de glace]\*\* attendu.



\---



\### 36. Avatar de destruction — cible alliée à tort



Carte concernée : \*\*Avatar de destruction\*\*



Problème : sa capacité de fin de tour se déclenche parfois contre des serviteurs alliés, à tort.



\---



\### 37. Pacte millénaire — effet non fonctionnel



Carte concernée : \*\*Pacte millénaire\*\*



Problème : le sort affiche correctement un message lorsqu’il est joué, mais rien ne se produit ensuite.



\---



\### 38. Règle n°25 — défausse volontaire d’approvisionnement non implémentée



Règle concernée : règle du jeu n°25, concernant l’approvisionnement.



Rappel de la règle : un joueur peut, pendant son tour, choisir d’envoyer 1 carte de type approvisionnement de son terrain à son cimetière s’il souhaite récupérer un emplacement d’approvisionnement. Cette action ne peut être effectuée qu’une fois par tour, en faisant un glisser-déposer de la carte depuis le terrain jusqu’au cimetière du propriétaire.



Problème : cette règle ne semble pas avoir été implémentée.



\---



\### 39. Forestier — Initiative inactive



Carte concernée : \*\*Forestier\*\*



Problème : le Forestier ne fait pas piocher de carte.



Comportement attendu : sa capacité spéciale d’initiative doit se déclencher.



\---



\### 40. Orcs — couleurs de faction incorrectes



Problème : les serviteurs de la faction des Orcs n’ont pas le set de couleurs attendu, tel que défini dans la collection.



\---



\### 41. Bassin de divination — effet non fonctionnel



Carte concernée : \*\*Bassin de divination\*\*



Problème : le sort affiche correctement un message lorsqu’il est joué, mais rien ne se produit ensuite.



\---



\### 42. Embuscade elfique — effet non fonctionnel



Carte concernée : \*\*Embuscade elfique\*\*



Problème : le sort affiche correctement un message lorsqu’il est joué, mais rien ne se produit ensuite.



\---



\### 43. Collecteur des impôts débordé — affichage des ressources



Carte concernée : \*\*Collecteur des impôts débordé\*\*



Problème : la carte fournit de nombreux types de ressources comme demandé, mais l’affichage déborde sur les ressources des cartes approvisionnement adjacentes.



Nouvelle règle d’affichage attendue : pour les cartes approvisionnement sur le terrain, une même ligne ne peut contenir que 3 types de ressources différents au maximum. Au-delà, les autres types de ressources doivent être affichés sur une ou plusieurs lignes en dessous.
---

## Corrections validées par le Lot 9.3.8f

Les huit régressions de rendu caractérisées par Playwright dans ENV-1F2 sont corrigées par le lot 9.3.8f, sans suppression de l'historique ci-dessus :

* clics des fiches Collection restaurés pour Approvisionnement, Serviteur possédé, Serviteur manquant et Sort ;
* erreur `isLoreFromSource is not defined` supprimée ;
* lore réel des Approvisionnements restauré dans le corps central des prévisualisations de partie ;
* capacité technique des Approvisionnements restaurée dans un panneau unique `APPROVISIONNEMENT` ;
* panneaux génériques `CAPACITÉ` supprimés pour les Serviteurs testés ;
* panneaux utiles de conditions, mots-clés et Sorts conservés ;
* cartes liées résolues et affichées sans ID technique brut ;
* huit `test.fail()` de caractérisation retirés après passage réel des tests.

État : corrigé localement par `fix: normalize card detail rendering`, à valider visuellement avant push.
