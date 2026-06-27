# Organisation des dépôts Mythes d’Eloron

## Dépôt game

Le dépôt `Nortander/mythes-deloron-game` contient :

- le code du jeu ;
- la documentation publique ;
- les tests automatisés ;
- les scripts de développement ;
- les fichiers de configuration nécessaires.

URL publique : https://github.com/Nortander/mythes-deloron-game

## Dépôt assets

Le dépôt `Nortander/mythes-deloron-assets` contient :

- les illustrations ;
- les effets visuels ;
- les sons et musiques ;
- les autres ressources audiovisuelles publiées.

URL publique : https://github.com/Nortander/mythes-deloron-assets

## Workspace local

Le dossier `assets/` peut être présent localement dans le workspace afin de permettre :

- le fonctionnement hors ligne ;
- le serveur local ;
- les tests ;
- les sauvegardes locales complètes.

Il est ignoré par le dépôt `game` afin d’éviter la duplication des assets sur GitHub.

Le dossier `data/` contient actuellement des exports locaux et des fichiers de travail volumineux. Il n’est pas publié dans le premier historique du dépôt `game`.

Une procédure reproductible de récupération ou de synchronisation des assets et données locales sera documentée dans une phase ultérieure.
