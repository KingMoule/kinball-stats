# Architecture

## Fichiers du site

La racine du dépôt est le site (GitHub Pages ; voir `site.md`). Ce qui compte pour le code :

| Fichier | Rôle |
|---|---|
| `index.html` | L'app : CSS, HTML des écrans, un seul `<script>` classique. Source du code depuis la vague 3 ; l'artifact claude.ai n'évolue plus. |
| `kblocal.js` | Façade de stockage `KBLocal` sur IndexedDB : imite les capacités `db`, `user` et `downloads` qu'offrait claude.ai (voir `donnees.md`). |
| `kbsite.js` | Tout ce qui est propre au site : installation, mise à jour, sauvegarde v2 et import sûr, cartes de l'accueil, feuille « fichier prêt ». Chargé après le script de l'app ; lit les globales de l'app sans y écrire. |
| `kbcollect.js`, `config.js` | Collecte facultative des matchs terminés (voir `site.md`). |
| `sw.js` | Service worker (voir `site.md`). |
| `sim/simcore.js` | Moteur de simulation des chances de victoire, copié tel quel dans `index.html` (voir `probabilite-victoire.md`). |
| `amont/` | Dernière version venue de l'artifact claude.ai, figée ; `check-release` s'y réfère encore. |

Ordre de chargement dans `index.html` : `vendor/xlsx.full.min.js`, `kblocal.js`, le script de l'app, puis `kbsite.js`.

## Un script unique, des globales

L'app est un seul `<script>` classique avec plus de 250 fonctions globales et environ 130 `onclick=` écrits en chaînes dans le HTML généré. Conséquences :

- Pas de modules ES, pas de second `<script>` dans `index.html` : les `onclick` appellent des fonctions globales par leur nom.
- Renommer une fonction casse en silence les `onclick` en chaîne et les sélecteurs de `kbsite.js` (il repère des boutons par le texte de leur `onclick`, par exemple `startMatch(`). Après un renommage : `grep` du nom dans `index.html`, `kbsite.js` et `tests/`.
- Plusieurs `let` sont déclarés loin sous leur premier usage (`pending`, `pendingPeriodWinner`, `periodEndTimer`, les variables de la couche radiale). Une fonction qui les lit ne doit jamais s'exécuter pendant le chargement du script (zone morte temporelle). C'est pourquoi `reopenMatchSheets()` n'est appelée que par `onEnterScreen('match')`.
- Le code est réparti en zones à bandeau de commentaire (téléphone, formats, stockage, navigation, saisie, probabilité, stats, export, équipes, historique, données). `node outils/carte.mjs` les liste avec leurs fonctions.

Globales à connaître : `S` (le match courant, voir `donnees.md`), `TEAMS_DB`, `MATCHES_DB`, `DELETED_MATCHES` (alimentées seulement par les abonnements du stockage), `FORMATS`, `STAT_SECTIONS`, `SCREENS`, `WP` (état du calcul de probabilité), `pending` (événement en cours de saisie), `viewingArchive`.

## Règles de structure

En plus des invariants de `CLAUDE.md` :

- `TEAMS` (Bleu, Gris, Noir) sert au stockage : un match a toujours trois emplacements, même en duel. `ATEAMS()` (ou `matchTeams(m)` pour un match archivé) donne les équipes réellement en jeu : c'est elle qu'on utilise pour le jeu et les statistiques.
- Le rendu ne déclenche jamais `save()`. `renderScoreboard()` appelle `wpSync()` en dernière ligne, sous `try`, sans jamais rien écrire dans `S`.
- Un réglage d'affichage vit dans une variable de module ou dans `localStorage` (par exemple `kinball.saisie`), pas dans `S`. Les anciens champs `heatTeam`, `heatMode`, `heatSituation`, `heatView` et `sheetDismissable` sont encore dans `S` par héritage : n'en ajouter aucun.
- Le terrain a un seul lecteur de coordonnées, `fieldPoint()` ; `uiVec()` convertit un déplacement sous le verrou portrait (second lecteur, pour le glisser des jetons). Un nouveau geste réutilise l'un des deux.
- Les fonctions de calcul récentes reçoivent le match en paramètre (`computeOffDefByPeriod(match)`, `phaseOf(history, i, fmt)`, `heatPointsFrom(match, …)`) ; les anciennes lisent `S` (`computeH2H`, `computeFaults`, `computeOverall`). C'est la direction à suivre.

## Navigation

Une pile d'écrans, `navStack`, dont le bas est toujours l'accueil. `showOnly(id)` est le seul endroit qui affiche ou masque un écran. `navTo(id)` empile, `navBack()` dépile, `navHome()` vide la pile, `navTab(fn)` repart de l'accueil vers une grande destination, `navSwap` remplace l'écran courant.

`onEnterScreen(id)` rafraîchit le contenu d'un écran chaque fois qu'il redevient visible ; un nouvel écran s'y ajoute en une ligne. Le rendu est séparé de la navigation (`openStats()` navigue, `renderStats()` dessine). `SCREEN_META` donne titre, onglet actif et actions de la barre d'app des écrans de consultation ; `NAV_TABS` liste les cinq grandes destinations (Équipes, Classement, Stats, Historique, Données).

Un nouvel écran touche quatre endroits : le `<div id>` du HTML, `SCREENS`, `SCREEN_META` (s'il porte la barre d'app) et `onEnterScreen`.

Écrans : `home` (tableau de bord et bannières de reprise ou de récupération), `newMatch`, `match`, `stats`, `zoneDetail`, `teamManager`, `teamEditor`, `matchHistory`, `teamOverview` (classement), `teamStatsPicker`, `teamStats` (cumul d'une équipe), `backup` (écran « Sauvegarde », nommé Données dans les onglets). La heat map n'a plus d'écran : c'est un onglet de statistiques.

L'écran de match n'a volontairement pas de barre d'app : toute sa surface sert à tracer les lancers, et un bouton de navigation à portée de pouce serait une sortie accidentelle en plein point. Il garde quatre contrôles délibérés (↶, TERMINER, ⌂, STATS) ; ⌂ demande confirmation si un match est en cours.

Consultation d'un match archivé : `viewArchivedMatchStats()` met une copie du match dans `S` et passe `viewingArchive` à vrai, ce qui bloque `save()`. `navBack()` ne quitte ce mode qu'une fois sorti de tous les écrans qui affichent ces données (`stats`, `zoneDetail`).

## Téléphone

`IS_PHONE` (plus petit côté d'écran sous 600 px et écran tactile) ajoute la classe `phone` sur `<html>`. Toutes les règles propres au téléphone sont préfixées `.phone` : une classe, pas une media query, parce qu'avec le verrou portrait une media query verrait la largeur paysage. Sur téléphone, les contrôles du match passent dans `#matchBar` en bas d'écran.

Verrou portrait (`applyPhoneOrientation`) : un site ne peut pas bloquer la rotation sur iPhone ; quand le téléphone est couché, l'interface est tournée de ±90° à l'inverse (classes `rot-neg`, `rot-pos`, variables `--ui-w` et `--ui-h`) et `uiRotation` vaut -90, 0 ou 90. `fieldPoint()` et `uiVec()` convertissent les coordonnées. Limites : un bref effet de rotation du système, et le clavier ou les listes natives qui s'affichent en paysage.

## Capacités et mode hors claude.ai

`capabilityEntry(nom)` est la porte d'entrée des capacités `db`, `user`, `downloads` : `window.claude` s'il existe, sinon `KBLocal`, sinon rien. Sans aucun stockage, l'app joue en mémoire et affiche un bandeau « stockage indisponible ». Le banc tourne ainsi (voir `tests/README.md`).

## Identité visuelle

Sombre et contrastée, typographie condensée (Barlow Condensed, polices embarquées dans `fonts/`), accents bleu `#2F6BFF` et rouge `#FF5A5F`. Deux palettes d'équipe : `TEAM_BG` pour les fonds pleins (l'équipe Noire y est un vrai noir, cerclé de blanc par la classe `is-noir`) et `TEAM_INK` pour le texte posé sur fond sombre (Noire y est blanche). Les pastilles des périodes gagnées héritent de `currentColor`.
