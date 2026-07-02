# HUVU Functional Status

## Statuts

- `FONCTIONNEL_TESTE` : l'effet complet modifie reellement l'etat de jeu et possede un test direct positif et negatif.
- `FONCTIONNEL_NON_TESTE` : l'effet semble implemente, mais il manque une couverture deterministe suffisante.
- `PARTIEL` : une condition, un cout, un ciblage ou une partie de l'effet fonctionne, mais la carte depend encore d'autres primitives.
- `ABSENT` : aucun handler reel ne resout la capacite attendue.
- `SANS_EFFET_PROGRAMMABLE` : la carte ne demande pas de logique speciale au-dela des regles generiques deja testees.

## HUVU-IMPL-1

Ce premier lot couvre les conditions de jeu structurees, le refus avant paiement, le ciblage legal et les diagnostics techniques. Il ne modifie pas les compositions Hokhan/Uram.

Le panneau technique `MODE TEST - HUVU IMPL 1` est reserve aux scenarios techniques et peut etre replie puis rouvert sans perdre les diagnostics courants.

| ID | Carte | Statut avant | Statut apres | Primitive | Test direct | Limites restantes |
| --- | --- | --- | --- | --- | --- | --- |
| MV000027 | Sang-lie | PARTIEL | PARTIEL | PV minimum de l'avatar pour jouer | oui, refus et autorisation | Initiative et Vengeance non terminees dans ce lot |
| R000027 | Necropole | PARTIEL | PARTIEL | minimum de serviteurs morts-vivants dans le deck initial | oui, condition positive | production avancee, compteurs et retrait non traites |
| MV000016 | Serviteur de la Lame | PARTIEL | PARTIEL | presence alliee requise sur le terrain | oui, refus et autorisation ; panneau de condition visible | pas d'effet actif propre a terminer dans ce lot |
| MV000017 | Cauchemar de la Lame | PARTIEL | PARTIEL | presence alliee requise sur le terrain | oui, refus et autorisation | resolution de capacite hors lot |
| MV000018 | Mage de la Lame | PARTIEL | PARTIEL | presence alliee requise sur le terrain | oui, refus et autorisation | Gel, Coup de glace et pioche hors lot |
| MV000019 | Forgeron de la Lame | ABSENT | PARTIEL | presence de Hokhan Ashir sur le terrain | oui, refus et autorisation | effet permanent et manipulation de deck hors lot ; table de generation statique : cout < 4 -> Serviteur de la Lame, cout = 5 -> Scorpion de la Lame, cout = 6 ou 7 -> Mage de la Lame, cout > 7 -> Cauchemar de la Lame |
| MV000021 | Scorpion de la Lame | PARTIEL | PARTIEL | presence alliee requise sur le terrain | oui, refus et autorisation | degats et generation d'Echos hors lot |
| S000005 | Assassinat | FONCTIONNEL_NON_TESTE | FONCTIONNEL_TESTE | ciblage ennemi legal | oui, cible legale, cible illegale et absence de cible | annulation par sacrifice de 2 Approvisionnements deja conservee, non elargie |

## Cartes Reportees

`S000022`, `S000041`, `S000006`, `PRST000014`, `R000025`, `S000042`, `S000044`, `S000051` et `S000052` restent reportees, car leur resolution principale demande des primitives hors HUVU-IMPL-1 : cimetieres avances, choix joueur, effets temporaires, creation, invocation, recherche ou deplacement de cartes.

## HUVU-IMPL-1C

- `S000005` reste `FONCTIONNEL_TESTE` apres correction complete de son cycle de vie.
- Quand `Assassinat` se resout, la cible rejoint le cimetiere de son proprietaire et le Sort rejoint le cimetiere de son lanceur.
- Un refus sans cible valide ou avec cible illegale ne retire pas le Sort de la main, ne consomme pas de ressources et ne modifie pas les cimetieres.
- Les conditions d'invocation des cartes du lot sont rendues comme de vraies infobulles laterales generiques, en dehors du corps descriptif de la carte.
- `MV000019` reste `PARTIEL` : son texte et son infobulle de condition sont corrects, mais son effet complet reste hors lot.

## HUVU-IMPL-2

Ce deuxieme lot couvre les degats directs immediats, les soins immediats bornes au maximum de PV, les modifications ATK/PV permanentes sans expiration et la resolution letale vers le cimetiere. Il ne modifie pas les compositions Hokhan/Uram.

Le panneau technique `MODE TEST - HUVU IMPL 2` est reserve aux scenarios techniques et expose le diagnostic de combat sans changer les messages publics.

| ID | Carte | Statut avant | Statut apres | Primitive | Test direct | Limites restantes |
| --- | --- | --- | --- | --- | --- | --- |
| B000002 | Rhaekor enrage | FONCTIONNEL_NON_TESTE | FONCTIONNEL_TESTE | auto-degat et Rage immediate | oui, succes et cout classique valide par le diagnostic | aucune dans ce lot |
| MV000010 | Zombie nouveau-ne | FONCTIONNEL_NON_TESTE | FONCTIONNEL_TESTE | degat direct et soin de combat | oui, degat non lethal ; soin couvert par le moteur commun | aucune dans ce lot |
| MV000017 | Cauchemar de la Lame | PARTIEL | FONCTIONNEL_TESTE | degat direct ou degat avatar si aucune cible | oui, lethal et branche avatar | aucune dans ce lot |
| MV000020 | Gobelin mort-vivant | PARTIEL | FONCTIONNEL_TESTE | soin de combat immediat | oui, soin borne au maximum | aucune dans ce lot |
| MV000021 | Scorpion de la Lame | PARTIEL | PARTIEL | degat direct lethal | oui, degat et cimetiere | generation d'Echos sur destruction reportee |
| MV000027 | Sang-lie | PARTIEL | PARTIEL | degat sur son propre avatar | oui, degat avatar | Vengeance et generation d'Echos reportees |

Cartes reportees pour ce lot : `S000041`, `S000042`, `H000004`, `H000006`, `MV000003`, `MV000028`, `PRST000014`, `MV000030`, `GOB000001` et `H000019`.
