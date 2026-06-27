Version : 1.2.1
Date : 2026-06-26
Statut : norme permanente

# Contrat canonique de rendu des cartes — Mythes d’Eloron

**Fichier :** `docs/CARD_RENDERING_CONTRACT.md`
**Version initiale :** 1.0
**Version actuelle :** 1.2.1
**Date :** 2026-06-26
**Statut :** norme permanente du projet

---

# 1. Objet du document

Le présent document définit les règles permanentes applicables à l’affichage de toutes les cartes de **Mythes d’Eloron**.

Il concerne notamment :

* les cartes affichées dans la Collection ;
* les cartes affichées dans une partie test ;
* les cartes présentes dans une main ;
* les cartes présentes sur le terrain ;
* les cartes affichées dans une fenêtre de choix ;
* les fiches détaillées ;
* les prévisualisations ouvertes au clic ou au survol ;
* les cartes liées par l’attribut `related` ;
* les coûts ;
* les productions ;
* les statistiques ;
* les descriptions ;
* les mots-clés ;
* le lore ;
* les infobulles.

Ce document constitue une norme durable.

Les lots futurs ne doivent pas redéfinir ces règles. Ils doivent s’y conformer.

---

# Historique de version

* 1.0 — contrat canonique initial du rendu des cartes.
* 1.1 — noyau partagé et séparation stricte des registres.
* 1.2 — migration canonique des textes, annotations, mots-clés, infobulles, cartes liées et fenêtres de choix.
* 1.2.1 — suppression des infobulles génériques de type et modèle final des Approvisionnements.

---

# Noyau canonique partagé

À partir de la version 1.1, les règles communes de rendu canonique résident dans :

```text
code/card-rendering-core.js
```

Ce fichier expose un noyau pur, sans dépendance directe au DOM. Il peut être chargé par :

* `code/partie-test-1.html` ;
* `code/collection.html` ;
* un test JavaScript minimal hors navigateur.

Les pages peuvent conserver des adaptateurs locaux pour convertir leurs structures embarquées (`CARDS_DATA`, `CARDS`) en entrée canonique. Ces adaptateurs ne doivent pas redéfinir les registres, la reconnaissance des mots-clés, le parseur des textes joueur ou la logique des ressources.

---

# Registres séparés

Les registres suivants sont distincts et ne doivent pas se recouvrir :

* mots-clés mécaniques ;
* types de cartes ;
* ressources ;
* capacités spéciales nommées.

`Approvisionnement` est un type de carte, pas un mot-clé.

Les types de cartes (`Serviteur`, `Sort`, `Approvisionnement`, `Serviteur (pseudo avatar)`) servent à classifier, thématiser et auditer les cartes. Ils ne doivent jamais générer automatiquement une infobulle joueur générique. Leurs définitions documentaires peuvent rester dans le registre, mais doivent porter `generatePlayerTooltip: false` ou un équivalent.

Les ressources (`Aria`, `Bois`, `Fer`, `Lenya`, `Nourriture`, `Pierre`, `Sélène`, `Écho`) appartiennent au registre des ressources. Elles ne doivent pas produire d’infobulle générique de mot-clé dans un texte de carte.

`Écho` est le nom public canonique de la ressource spéciale historiquement appelée `Âme`. Les clés techniques déjà utilisées par le moteur peuvent rester inchangées pour éviter de modifier les règles, mais aucun texte destiné au joueur ne doit afficher `Âme` ou `Âmes` comme nom de ressource. Les anciennes formes sont des alias historiques d’audit, pas des entrées canoniques du registre public.

---

# Migration canonique des textes et panneaux

À partir de la version 1.2, tout texte visible de carte doit passer par le parseur commun :

```text
formatPlayerFacingCardText(...)
```

Ce parseur applique le pipeline canonique :

```text
texte source
→ normalisation typographique française
→ résolution des IDs publics
→ masquage des annotations techniques
→ conversion des anciens noms publics de ressources
→ reconnaissance stricte des mots-clés et capacités nommées
→ sortie HTML sûre
```

Les renderers ne doivent plus maintenir leur propre liste de définitions de mots-clés, leur propre règle de suppression d’IDs ou leur propre conversion de marqueurs entre crochets.

Les anciens marqueurs de mots-clés en `<em>Mot-clé</em>` peuvent être reconnus par le parseur uniquement lorsque le contenu correspond exactement à une entrée d’un registre canonique. Le vrai lore en italique doit rester en italique.

Les annotations de rich text provenant du spreadsheet vivant doivent être converties en structures par :

```text
normalizeFormattingAnnotations(...)
```

Lorsque les exports locaux ne portent pas toutes les informations de rich text, le modèle doit signaler la limite au lieu d’inventer des annotations.

---

# Infobulles, cartes liées et décisions

Les panneaux d’informations doivent être construits depuis :

```text
buildCanonicalCardTooltips(...)
resolveRelatedCards(...)
```

L’ordre canonique reste :

1. capacités spéciales ;
2. mots-clés ;
3. lore ;
4. cartes liées sur le côté gauche lorsque le contexte le permet.

Aucun panneau joueur ne doit afficher d’ID technique, d’`instanceId`, d’`occurrenceId`, de `stackId` ou de `ownerId`.

Les fenêtres de choix qui affichent des cartes doivent utiliser un renderer de carte de décision canonique. Si la carte rendue contient déjà son nom, le conteneur de choix ne doit pas ajouter un second nom sous la carte. Les occurrences identiques restent distinguées par des attributs internes, jamais par un texte visible.

Les infobulles anciennes intégrées dans les cartes ne doivent pas coexister avec le calque de prévisualisation canonique. Un seul panneau d’information doit être visible pour une carte donnée.

Une capacité nommée comme `Colère divine` doit être placée dans le registre des capacités nommées tant que la source ne démontre pas qu’il s’agit d’un mot-clé canonique.

---

# Reconnaissance exacte des tokens

La normalisation autorisée pour comparer un token à un registre est limitée à :

* normalisation Unicode NFC ;
* suppression des espaces de début et de fin ;
* réduction des espaces répétés ;
* casse uniquement si le registre le prévoit explicitement.

Sont interdits :

* fuzzy matching ;
* distance de Levenshtein ;
* rapprochement phonétique ;
* suppression automatique des accents ;
* stemming ;
* lemmatisation ;
* correction orthographique automatique ;
* correspondance par préfixe ;
* correspondance par sous-chaîne.

Les formes suivantes ne sont pas équivalentes :

```text
Gel
Gèle

Vengeance
Vegeance

Vigilance
Vigilant
```

Une variante ne peut être reconnue que si elle est déclarée explicitement dans `aliases`.

---

# Serviteur de la rune

`Serviteur de la rune` est un mot-clé canonique.

Sa définition publique est :

```text
Ce serviteur revient dans votre main quand il devrait être envoyé au cimetière. Vous pouvez le rejouer sans tenir compte des prérequis.
```

Le fait que la mécanique ne soit pas encore activée dans la partie test est une information technique distincte :

```js
implementationStatus: "dormant"
```

Ce statut ne doit jamais remplacer la définition publique dans une infobulle destinée au joueur.

Le parseur canonique doit transformer :

```text
[Serviteur de la rune]
```

en :

```html
<strong class="card-keyword" data-keyword="Serviteur de la rune">Serviteur de la rune</strong>
```

Les crochets ne doivent pas subsister pour un mot-clé reconnu.

---

# Lore et heuristiques

La règle `Effet détaillé vide ou /` peut servir de signal d’audit, mais elle ne constitue pas à elle seule une preuve absolue de lore.

Le rôle du texte doit être déterminé dans cet ordre :

1. colonne ou annotation dédiée dans la source ;
2. type de carte et règle explicitement documentée ;
3. métadonnée canonique ;
4. heuristique uniquement pour audit ;
5. aucun classement inventé.

Toute classification obtenue par heuristique doit rester identifiable dans le modèle :

```js
loreClassification: {
  value,
  source,
  confidence,
  heuristicUsed
}
```

---

# 2. Principes fondamentaux

## 2.1. Une seule donnée, plusieurs vues

Une carte possède une seule identité sémantique.

Ses différentes représentations peuvent adapter :

* leur taille ;
* leur échelle ;
* leurs retours à la ligne ;
* la taille de leurs icônes ;
* la quantité de scroll disponible ;
* leur disposition spatiale.

Elles ne doivent pas modifier :

* son nom ;
* son type ;
* sa description ;
* son effet détaillé ;
* ses mots-clés ;
* son lore ;
* son coût de base ;
* sa production de base ;
* ses relations avec d’autres cartes ;
* ses annotations typographiques ;
* la signification de ses données.

## 2.2. Modèle canonique unique

Toutes les vues doivent dériver d’un modèle canonique commun.

Chaîne attendue :

```text
source de vérité
→ enregistrement source
→ modèle canonique normalisé
→ modèle d’affichage
→ Collection / partie / prévisualisation / fenêtre de choix
```

Aucun renderer ne doit reconstruire indépendamment le contenu métier d’une carte.

## 2.3. Aucune interprétation silencieuse

Le code ne doit jamais :

* inventer une description ;
* reformuler une phrase ;
* corriger silencieusement une donnée métier ;
* déduire la nature d’une variable à partir de sa seule apparence ;
* remplacer un coût par une approximation ;
* choisir une autre carte parce qu’un ID est inconnu ;
* afficher une ancienne chaîne embarquée à la place de la source canonique.

Toute incohérence doit être signalée par un audit.

---

# 3. Sources de vérité

## 3.1. Source principale

Le spreadsheet en ligne :

```text
Jeu de cartes fantasy « Mythes d’Eloron »
```

est l’unique source de vérité vivante concernant les données des cartes.

Il prévaut sur :

* les exports locaux ;
* les données embarquées dans les fichiers HTML ;
* les chaînes historiques ;
* les anciennes constantes ;
* les handlers de mécaniques ;
* les textes déjà présents dans le DOM.

## 3.2. Exports locaux

Les fichiers :

```text
Jeu de cartes fantasy « Mythes d’Eloron » - export *.xlsx
```

sont des instantanés datés de la source en ligne.

Ils servent :

* de source de secours ;
* de référence hors connexion ;
* de base de comparaison ;
* de support pour les audits automatisés.

En cas de divergence entre un export et le spreadsheet en ligne :

```text
la version en ligne prévaut
```

## 3.3. Indisponibilité de la source en ligne

Si l’environnement de travail ne permet pas d’accéder au spreadsheet en ligne :

* le signaler explicitement ;
* utiliser l’export local le plus récent comme fallback ;
* ne pas prétendre avoir validé la parité avec la source vivante ;
* ne pas corriger silencieusement une divergence supposée.

## 3.4. Ordre de priorité

```text
1. spreadsheet en ligne
2. export local le plus récent
3. données embarquées vérifiées comme identiques
4. aucun fallback inventé
```

---

# 4. Modèle canonique de carte

Toute carte doit pouvoir être représentée par un objet canonique équivalent à :

```js
{
  id,
  publicName,
  faction,
  type,
  subtype,
  artwork,
  description,
  detailedEffect,
  lore,
  keywords,
  relatedCardIds,
  baseAttack,
  baseHealth,
  baseAbilityPower,
  baseCost,
  baseProduction,
  minimumResourceThreshold,
  formattingAnnotations,
  theme
}
```

Les noms exacts peuvent être adaptés au code existant.

Les concepts doivent toutefois rester identifiables.

## 4.1. Données standard et données runtime

La Collection affiche toujours les valeurs standard.

La partie peut afficher des valeurs runtime modifiées.

Exemples :

```text
Collection :
attaque de base
points de vie de base
coût de base
production de base

Partie :
attaque actuelle
points de vie actuels
coût actuel
production actuelle
puissance actuelle
```

Le renderer ne doit pas confondre :

```js
baseValue
```

et :

```js
currentValue
```

---

# 5. Parité entre les vues

## 5.1. Données sémantiques

Pour un même état de carte, les vues doivent afficher les mêmes données sémantiques.

Cela concerne :

* le nom ;
* le type ;
* la description ;
* les mots-clés ;
* le lore ;
* les cartes liées ;
* le coût ;
* la production ;
* le seuil minimal ;
* les statistiques ;
* les capacités.

## 5.2. Mise en forme sémantique

Les annotations suivantes doivent être conservées :

* gras ;
* italique ;
* soulignement ;
* couleur de faction ;
* couleur de variation runtime ;
* séparation entre capacité et lore ;
* relations entre mots-clés et infobulles.

## 5.3. Adaptations autorisées

Une miniature et une carte agrandie peuvent différer par :

* la taille ;
* l’échelle ;
* les espacements ;
* le nombre de lignes ;
* la présence d’un scroll ;
* la taille des icônes ;
* la disposition responsive.

Elles ne doivent pas différer par le sens ou les données.

---

# 6. Français et typographie

## 6.1. Fidélité de la source

Le renderer doit reproduire fidèlement le texte canonique.

Il ne doit pas corriger librement :

* l’orthographe ;
* la conjugaison ;
* la grammaire ;
* le vocabulaire.

Une erreur présente dans la source doit être signalée, pas corrigée silencieusement dans le renderer.

## 6.2. Normalisation typographique autorisée

Le renderer peut normaliser sans modifier le sens :

* les espaces insécables ;
* les espaces avant `:`, `;`, `?`, `!` ;
* les guillemets français ;
* les apostrophes typographiques ;
* les espaces autour de `+`, `OU`, `ET`, `≥` ;
* les retours à la ligne techniques inutiles.

## 6.3. Espaces insécables

Employer notamment des espaces insécables :

* avant les signes doubles de ponctuation ;
* entre une valeur et son unité éventuelle ;
* autour des expressions de coût qui ne doivent pas être séparées ;
* entre `≥` et la valeur qui suit ;
* dans les groupes typographiques indivisibles.

---

# 7. IDs techniques

## 7.1. Interdiction d’affichage

Les IDs techniques ne doivent jamais être visibles pour le joueur.

Cela comprend notamment :

```text
S000035
DIV000006
EDG000001
R000014
ID =
cardId
internalId
```

Ils sont interdits dans :

* les descriptions ;
* les infobulles ;
* le lore ;
* les titres ;
* les fenêtres de choix ;
* les cartes liées ;
* les messages de partie ;
* les erreurs visibles par le joueur.

## 7.2. Références internes

Lorsqu’un texte source contient un ID reconnu :

* résoudre cet ID vers le nom public ;
* afficher le nom public ;
* conserver la structure grammaticale de la phrase.

Si l’ID est inconnu :

* ne pas l’afficher ;
* signaler l’anomalie dans un audit ;
* ne pas inventer un nom.

---

# 8. Mots-clés

## 8.1. Syntaxe interne

Les crochets peuvent être utilisés dans la source comme marqueurs internes :

```text
[Embrasement]
[Gel]
[Coup de glace]
[Serviteur de la rune]
```

## 8.2. Affichage joueur

Lorsqu’un contenu entre crochets correspond à une entrée connue du glossaire :

* supprimer les crochets visibles ;
* afficher le mot-clé en gras ;
* le souligner ;
* appliquer la couleur thématique de la faction ;
* associer l’infobulle correspondante.

Exemple :

```html
<strong
  class="card-keyword"
  data-keyword="Embrasement"
>
  Embrasement
</strong>
```

## 8.3. Contextes linguistiques

Le parseur doit reconnaître notamment :

```text
[Embrasement]
d’[Embrasement]
d'[Embrasement]
[Gel] et [Coup de glace]
avec [Rempart].
[Initiative],
[Serviteur de la rune]
```

## 8.4. Crochets littéraux

Un contenu entre crochets qui ne correspond pas à une entrée connue du glossaire ne doit pas être altéré automatiquement.

## 8.5. Glossaire unique

Il doit exister un seul glossaire canonique.

Aucune page ne doit maintenir sa propre petite liste concurrente de mots-clés.

---

# 9. Fragments mis en valeur dans la source

## 9.1. Emphase typographique

Les éléments mis en gras dans la source doivent conserver :

* leur gras ;
* leur couleur thématique ;
* leur rôle visuel.

## 9.2. Variables runtime

Un fragment en gras ne devient une variable runtime que si cette correspondance est explicitement définie dans :

* les données ;
* une métadonnée ;
* le modèle canonique ;
* le handler de la carte.

Le renderer ne doit jamais déduire la nature d’une variable à partir du seul gras.

## 9.3. Couleur des variations runtime

En partie :

* valeur inchangée : blanc ;
* valeur améliorée : vert ;
* valeur dégradée : rouge.

Cela concerne notamment :

* attaque ;
* points de vie ;
* coût ;
* production ;
* puissance de capacité ;
* seuil minimal ;
* valeur numérique explicitement reliée au runtime.

---

# 10. Lore

## 10.1. Affichage

Le lore doit être affiché en italique.

## 10.2. Approvisionnements

Pour une carte d’Approvisionnement :

* le champ principal de description contient uniquement le lore ;
* ce champ est intégralement en italique ;
* les capacités techniques sont affichées dans les infobulles ;
* la production est affichée dans le pied de ressources.

## 10.3. Autres cartes

Pour les Serviteurs et Sorts :

* la description mécanique reste dans la carte ;
* un éventuel lore distinct peut être affiché dans une infobulle dédiée en italique.

---

# 11. Cartes liées

## 11.1. Position

Les cartes déclarées dans l’attribut `related` sont affichées à gauche de la carte agrandie.

## 11.2. Ordre

Respecter l’ordre fourni par la source.

## 11.3. Absence de doublons

Un même ID lié ne doit apparaître qu’une seule fois.

## 11.4. IDs inconnus

Un ID lié inconnu :

* ne doit pas être affiché en clair ;
* doit être signalé par un audit.

---

# 12. Prévisualisations

## 12.1. Deux interactions distinctes

### Survol en partie

La prévisualisation au survol est :

* temporaire ;
* non interactive ;
* en `pointer-events: none` ;
* fermée immédiatement à la sortie de la carte source ;
* fermée immédiatement au `pointerdown` ;
* suspendue pendant un drag ;
* suspendue pendant une fenêtre de choix.

### Clic dans la Collection

La fiche au clic est :

* persistante ;
* fermée explicitement ;
* interactive ;
* éventuellement défilable ;
* autorisée à afficher des panneaux connexes.

Les deux interactions utilisent le même modèle canonique, mais pas nécessairement le même cycle de vie.

## 12.2. Centrage

Toute carte agrandie doit être centrée précisément dans le viewport.

Le centrage porte sur la carte principale, sans inclure :

* les infobulles ;
* les cartes liées.

## 12.3. Stabilité

Une prévisualisation doit être stable.

Elle ne doit pas :

* trembler ;
* alterner entre plusieurs positions ;
* être reconstruite en boucle ;
* rester visible sans source valide ;
* réapparaître après un ancien timer.

## 12.4. Premier plan

La carte agrandie, ses infobulles et ses cartes liées passent devant tous les éléments d’interface ordinaires.

Exception :

```text
les fenêtres de choix bloquantes
```

Une fenêtre de choix doit fermer ou suspendre la prévisualisation.

## 12.5. Glisser-déposer

Une prévisualisation au survol ne doit jamais bloquer :

* la carte source ;
* le début du drag ;
* une zone de dépôt ;
* une zone située visuellement sous la prévisualisation ;
* une zone située sous une infobulle.

Pendant un drag :

```text
la prévisualisation est fonctionnellement absente
```

## 12.6. Complétude

Une carte agrandie doit afficher toutes les informations pertinentes :

* illustration ;
* nom ;
* type ;
* attaque ;
* endurance ;
* description ;
* coût ;
* production ;
* seuil minimal ;
* statistiques ;
* annotations typographiques.

Les infobulles ne remplacent jamais le contenu normal de la carte.

---

# 13. Infobulles

## 13.1. Position à droite

À droite de la carte agrandie, afficher dans cet ordre :

1. capacités spéciales nommées ;
2. définitions des mots-clés, dans l’ordre de première apparition ;
3. lore distinct, en italique, s’il existe.

## 13.2. Position à gauche

À gauche de la carte agrandie :

1. cartes liées `related` ;
2. dans l’ordre fourni par la source ;
3. sans duplication.

## 13.3. Capacités multiples

Lorsqu’une carte possède plusieurs capacités spéciales nommées :

* afficher un panneau distinct par capacité ;
* conserver l’ordre de la source.

## 13.4. Structure d’une infobulle

Une infobulle comporte :

### Titre

* majuscules ;
* gras ;
* couleur thématique ;
* aucun ID technique ;
* aucun crochet technique.

### Corps

* un paragraphe sémantique unique ;
* sans `<br>` artificiel ;
* sans séparation arbitraire ;
* retours à la ligne naturels autorisés ;
* mots-clés en gras ;
* aucune explication générique sur le fonctionnement des ressources.

## 13.5. Types de ressources

Les infobulles ne doivent jamais expliquer génériquement :

* ce qu’est l’Eau ;
* ce qu’est la Lenya ;
* ce que sont les Âmes ;
* ce qu’est la Pierre ;
* le fonctionnement général d’une icône de ressource.

## 13.6. Approvisionnement

Règle 1.2.1 : aucune infobulle générique de type ne doit être produite pour `Approvisionnement`.

La capacité technique de production doit apparaître dans une infobulle principale unique intitulée :

```text
APPROVISIONNEMENT
```

et non dans un panneau `CAPACITÉ`, `CONDITION D’INVOCATION` ou une définition générique du type de carte.

Le lore reste dans la carte centrale. La production reste dans le pied de ressources. Le type `Approvisionnement` ne peut jamais servir de texte de remplacement lorsque le lore est absent.

Pour une carte de type Approvisionnement, l’infobulle de type doit porter le titre :

```text
APPROVISIONNEMENT
```

et non :

```text
CONDITION D’INVOCATION
```

---

# 14. Fenêtres de choix

## 14.1. Nom affiché une seule fois

Dans une fenêtre telle que Murmures divins :

* le nom de la carte est déjà affiché dans le cadre de la carte ;
* aucune légende extérieure ne doit répéter ce même nom.

Règle :

```text
une carte présentée dans une décision
→ un seul affichage de son nom
```

## 14.2. Prévisualisations

L’ouverture d’une fenêtre de choix bloquante :

* ferme les prévisualisations ;
* annule leurs timers ;
* suspend leur réouverture ;
* conserve la priorité fonctionnelle de la décision.

---

# 15. Modèle structuré des ressources

## 15.1. Interdiction des chaînes plates

Un coût ou une production ne doit pas être traité uniquement comme une chaîne HTML ou une suite libre d’icônes.

Il doit être représenté par une structure logique.

Exemple indicatif :

```js
{
  groups: [
    {
      relation: "AND",
      resources: [
        { resourceId: "water", amount: 2 },
        { resourceId: "lenya", amount: 1 }
      ]
    },
    {
      relation: "OR",
      resources: [
        { resourceId: "souls", amount: 3 }
      ]
    }
  ],
  minimumThreshold: 5
}
```

Les noms peuvent être adaptés.

## 15.2. Renderer commun

Le même modèle structuré doit alimenter :

* la miniature ;
* la carte agrandie ;
* la Collection ;
* la partie ;
* les audits.

## 15.3. Variations de contexte

Les renderers peuvent adapter :

* l’échelle ;
* l’espacement ;
* le nombre de lignes ;
* la taille des icônes.

Ils ne doivent pas modifier :

* les valeurs ;
* l’ordre ;
* les relations `+`, `ET`, `OU` ;
* le seuil `≥`.

---

# 16. Productions des Approvisionnements

## 16.1. Valeur standard dans la Collection

La Collection affiche toujours la production initiale.

Elle ne doit pas afficher :

* une production runtime ;
* une production augmentée ;
* une production réduite ;
* une ancienne valeur historique.

## 16.2. Représentation

Chaque ressource produite est représentée par :

* son icône ;
* un chiffre blanc superposé à l’icône.

Pour plusieurs ressources :

```text
icône + icône + icône
```

Ajouter un symbole `+` entre les groupes.

## 16.3. Alignement

Tous les éléments doivent être :

* contenus dans le pied de carte ;
* centrés horizontalement ;
* centrés verticalement ;
* alignés sur une même ligne de base visuelle.

## 16.4. Quatre types ou plus

À partir de quatre types de ressources :

* deux lignes sont autorisées ;
* les lignes doivent être équilibrées ;
* la seconde ligne doit être alignée avec la première ;
* aucun élément ne doit sortir du conteneur.

---

# 17. Coûts des Serviteurs et Sorts

## 17.1. Représentation

Chaque ressource demandée est représentée par :

* son icône ;
* un chiffre blanc superposé.

Les relations sont affichées selon les données :

```text
+
ET
OU
```

## 17.2. Alignement

Les éléments doivent être :

* centrés horizontalement ;
* centrés verticalement ;
* contenus dans le pied ;
* alignés sur une ligne visuelle commune.

## 17.3. Quatre types ou plus

À partir de quatre types :

* deux lignes sont autorisées ;
* les lignes doivent rester cohérentes ;
* les symboles relationnels restent attachés à leurs groupes ;
* aucun débordement n’est permis.

## 17.4. Seuil minimal

Lorsqu’un seuil existe, la ligne se termine par :

```text
 ≥ valeur
```

Le symbole et la valeur doivent rester ensemble.

Exemple :

```text
Eau 2 + Lenya 3  ≥ 5
```

---

# 18. Taille proportionnelle des ressources

## 18.1. Adaptation

Plus le nombre de groupes est élevé, plus la taille peut être réduite.

## 18.2. Réduction uniforme

La réduction doit être proportionnelle et identique pour :

* les icônes ;
* les chiffres ;
* les symboles ;
* les séparateurs ;
* le seuil.

Il est interdit de réduire seulement les icônes ou seulement le texte.

## 18.3. Lisibilité minimale

Aucun élément ne doit devenir illisible.

La réduction doit être limitée par une taille minimale définie en CSS.

---

# 19. Modifications runtime des coûts et productions

## 19.1. Valeurs modifiées

En partie, les valeurs modifiées doivent être calculées depuis :

* la valeur de base ;
* les modificateurs runtime explicites ;
* les règles de la carte ou de l’effet.

## 19.2. Couleurs

```text
valeur inchangée → blanc
valeur améliorée → vert
valeur dégradée → rouge
```

## 19.3. Seuil minimal

Lorsqu’un coût possède un seuil minimal, toute modification doit être déterminée par une règle métier explicite.

Le renderer ne doit pas décider seul comment recalculer ce seuil.

## 19.4. Réductions globales ou partielles

Une réduction peut concerner :

* tous les types de ressources ;
* un seul type ;
* plusieurs types particuliers ;
* le seuil minimal ;
* une combinaison explicitement définie.

Le résultat doit venir du modèle runtime.

Il ne doit pas être déduit par le renderer.

## 19.5. Cas non définis

Tant que les règles exactes d’une réduction de seuil ne sont pas définies par les données ou la mécanique :

* ne pas inventer un calcul ;
* conserver la valeur runtime fournie ;
* signaler les incohérences par audit.

---

# 20. Mains

## 20.1. Capacité

La capacité maximale est :

```text
12 cartes
```

La seule règle métier est :

```js
player.hand.length >= 12
```

## 20.2. Disposition compacte

Une disposition compacte peut apparaître avant 12 cartes.

Elle ne doit jamais être confondue avec l’état métier :

```text
main pleine
```

## 20.3. Cartes visibles et interactives

Toute portion visible d’une carte doit être interactive.

Cela concerne notamment :

* la première carte ;
* la dernière carte ;
* leurs bords extérieurs ;
* leur illustration ;
* leur pied ;
* leur zone de texte.

## 20.4. Main vide

Une main runtime vide doit afficher :

```text
0 carte
0 dos
0 placeholder
0 clone
0 élément temporaire permanent
```

---

# 21. Deck vide

## 21.1. Visuel

Lorsqu’un deck est vide :

```text
VFX000013
```

est utilisé comme visuel de remplacement.

## 21.2. Libellé unique

Le libellé doit apparaître une seule fois.

Rendu attendu :

```text
DECK VIDE
```

à la place du compteur habituel.

Ne pas afficher simultanément :

```text
0 CARTE
```

et :

```text
DECK VIDE
```

## 21.3. Texte intégré à l’asset

Si `DECK VIDE` est déjà intégré visuellement à l’asset :

* ne pas ajouter une seconde occurrence DOM ;
* utiliser un texte accessible hors écran si nécessaire pour l’accessibilité.

---

# 22. Fallbacks et erreurs

## 22.1. Donnée absente

En cas de donnée absente :

* ne pas afficher `undefined` ;
* ne pas afficher `null` ;
* ne pas afficher l’ID ;
* ne pas inventer de texte ;
* utiliser un fallback neutre uniquement si nécessaire ;
* journaliser l’anomalie.

## 22.2. Mot-clé inconnu

Un mot-clé entre crochets inconnu :

* reste textuellement inchangé ;
* est signalé par un audit ;
* ne reçoit pas une infobulle inventée.

## 22.3. Carte liée inconnue

Une carte liée inconnue :

* n’est pas affichée ;
* est signalée ;
* ne provoque pas d’erreur bloquante.

---

# 23. Variables CSS canoniques

Les couleurs sémantiques doivent provenir de variables CSS centralisées.

Structure attendue, à adapter :

```css
--faction-color;
--faction-color-strong;
--faction-background;
--faction-border;
--value-improved-color;
--value-degraded-color;
--value-neutral-color;
```

Le renderer ne doit pas deviner une couleur à partir de l’image ou d’une capture.

---

# 24. Audits obligatoires

Le projet doit exposer progressivement des audits couvrant :

```js
auditCardSourceParity(cardId)
auditCanonicalCardModel(cardId)
auditCardDataParity(cardId)
auditCardFormattingParity(cardId)
auditCardKeywordRendering(cardId)
auditCardRelatedRendering(cardId)
auditCardResourceModel(cardId)
auditCardResourceRendering(cardId, context)
auditCardPreviewCompleteness(cardId, context)
auditCardPreviewGeometry(cardId, context)
auditCardTooltipStructure(cardId, context)
auditHandCapacityPaths()
auditAllHandProjections()
auditDeckProjection(player)
auditChoiceWindowCardRendering()
auditAllCardRenderingContracts()
```

Les noms peuvent être adaptés, mais les contrôles doivent exister.

---

# 25. Matrice minimale de cartes de référence

Les tests doivent couvrir au minimum :

## Texte

* description courte ;
* description longue ;
* lore seul ;
* mécanique seule ;
* mécanique + lore ;
* mot-clé avec apostrophe ;
* plusieurs mots-clés ;
* référence à un ID ;
* carte `related`.

## Ressources

* aucun coût ;
* une ressource ;
* plusieurs ressources avec `+` ;
* alternatives `OU` ;
* combinaison `ET/OU` ;
* quatre types ou plus ;
* seuil `≥` ;
* production simple ;
* production multiple ;
* production sur deux lignes ;
* coût runtime modifié ;
* production runtime modifiée.

## Statistiques

* attaque inchangée ;
* attaque augmentée ;
* attaque réduite ;
* points de vie modifiés ;
* coût réduit ;
* production augmentée ;
* puissance de capacité modifiée.

## Contextes

* Collection normale ;
* Collection détaillée ;
* main haute ;
* main basse ;
* terrain haut ;
* terrain bas ;
* fenêtre de choix ;
* prévisualisation ;
* carte liée.

---

# 26. Règles de modification

Tout lot modifiant le rendu d’une carte doit :

1. citer le présent contrat ;
2. indiquer les sections concernées ;
3. distinguer données, modèle et rendu ;
4. ne pas corriger plusieurs couches sans diagnostic ;
5. fournir les audits avant et après ;
6. signaler toute règle encore indéterminée ;
7. ne pas déclarer une correction visuelle validée sans test navigateur.

---

# 27. Points nécessitant encore une décision métier

Les éléments suivants ne doivent pas être inventés par le renderer :

* calcul exact d’un seuil `≥` après réduction globale ;
* calcul exact d’un seuil `≥` après réduction partielle ;
* plancher minimal d’un coût réduit ;
* répartition exacte des groupes sur deux lignes ;
* comportement des réductions ciblant une faction ou un sous-ensemble de ressources.

Ces points doivent être définis dans les données ou dans une règle métier explicite avant implémentation complète.

---

# 28. Résumé normatif

Une carte doit être :

```text
fidèle à sa source
cohérente entre toutes ses vues
sans ID technique visible
sans texte inventé
correctement typographiée
correctement thématisée
complète lorsqu’elle est agrandie
non bloquante pendant les interactions
alimentée par un modèle canonique unique
rendue par des composants communs
auditable
```
