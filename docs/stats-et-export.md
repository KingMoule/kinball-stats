# Statistiques et export

La forme des données est dans `donnees.md`, la saisie dans `saisie.md`. Tout ici se calcule à la lecture, à partir de l'historique.

## Le registre des familles

Les statistiques d'un match (`#stats`) et le cumul d'une équipe (`#teamStats`) partagent une barre d'onglets et une seule famille affichée à la fois. Elle est construite depuis `STAT_SECTIONS` :

| Onglet | `match` | `team` |
|---|---|---|
| Vue d'ensemble | `sectionMatchOverall` | `sectionTeamOverall` |
| Par période | `sectionMatchEvolution` | (absent) |
| Head-to-head | `sectionMatchH2H` | `sectionTeamH2H` |
| Zones | `sectionMatchZones` | `sectionTeamZones` |
| Fautes | `sectionMatchFaults` | `sectionTeamFaults` |
| Joueurs | `sectionMatchPlayers` | `sectionTeamPlayers` |
| Heat map | `sectionMatchHeat` | `sectionTeamHeat` |

**Ajouter une famille = ajouter une entrée.** Une famille qui n'a de sens que dans un contexte omet l'autre clé : l'onglet n'apparaît alors que là. Les fonctions de rendu renvoient du HTML ; `match` lit `S`, `team` reçoit `(agg, teamId)`.

## Les tableaux, `statTable()`

Tous les tableaux (stats, classement, historique, équipes, corbeille) passent par `statTable({scope, id, rows, cols, defaultSort, note})`. Une colonne : `{key, label, short, val(row), fmt(row), strong, cls, best, detail, sub}`.

- `val()` sert au tri et à la comparaison, `fmt()` à l'affichage. Une valeur `null` (aucune tentative) finit toujours en bas, dans les deux sens, jamais comptée comme zéro.
- `best:'high'|'low'` colore la meilleure valeur en vert, et la moins bonne en rouge à partir de trois lignes. `bestMin` et `sample` écartent les lignes trop peu fournies.
- Tri : `sortTable(scope, id, key)` ; premier toucher décroissant. L'état est dans `tableSort[id]`.
- `statsRerender` mémorise le dernier rendu affiché et le rejoue après un tri ou une bascule de filtre ; toute fonction de rendu d'un écran de stats doit le mettre à jour.
- « + de détail » (`showDetails`, `toggleDetails`, global à tous les tableaux) : le comptage se glisse sous le pourcentage (`sub`), ou dans une colonne `detail:true`, sans élargir le tableau.
- Mises en page : `statCols(main, side)` (tableau et schéma du terrain côte à côte) et `statPair(a, b)`, qui repassent en une colonne sous 900 px et sur téléphone. Sur téléphone, la colonne du nom est figée et les en-têtes passent à leur libellé court.

## Les calculs

- **Définition de l'OFF % (D85, D86).** Tentative offensive = lancer résolu (attrapé ou échappé, DÉF ILL comprise) **ou faute directe** de l'équipe qui avait le ballon (`before.possession`). Réussite = échappé seulement ; une faute n'est jamais une réussite. OFF % = échappés / (lancers + fautes directes). DÉF % et F % ne changent pas. Le head-to-head (grille d'un match, tableau « par adversaire » du cumul, détail par zone d'un duel) reste sur les lancers seuls : une faute n'a pas de cible et n'entre jamais dans un adversaire ni dans DÉF %. Les autres endroits la comptent par la règle ci-dessus ; leur ligne dit seulement ce qui s'écarte.
- `computeOverall()` : par équipe, toutes cibles confondues. Offensive = voir la définition ci-dessus ; défensive = part des ballons reçus qui ont été attrapés. Les totaux sont ventilés par case 3×3 (départ pour l'offensive, arrivée pour la défensive). Les champs `offAttempts`, `offSuccesses` et `offZones` restent sur les lancers seuls (l'export ancien les lit) ; `offTentatives` (lancers + fautes), `offZonesF` (la faute compte dans la case de sa `position_norm`, aucune case si elle n'en a pas) et `fautes` portent le total que lisent les écrans.
- `computeH2H(phase)` : attaquant → cible, avec le détail arrêtée ou continue.
- `computeFaults(phase)` : actions, fautes et types par équipe, plus les DÉF ILL.
- `computeOffDefByPeriod(match)` : offensive et défensive par période, lues sur `before.period` ; une faute est une tentative de l'équipe en possession dans sa période (une période qui n'a que des fautes est listée).
- `computeSituations(match)` : comptes par situation, à l'attaque et à la défense. `off_<situation>` reste sur les lancers seuls ; `offF_<situation>` y ajoute les fautes, rangées par `situationOfFaute` (la situation de l'équipe en possession, lue sur `before.stopped`, sinon reconstituée comme pour un lancer).
- `computeTeamAggregate(teamId)` : le cumul d'une équipe sur tous ses matchs, en traduisant la couleur du jour vers l'équipe permanente par `teamIds`. `teamGlobals(agg)` additionne les head-to-head (un lancer sans coordonnées compte quand même) et ajoute `agg.faults` aux tentatives, rien aux réussites ; `agg.situationTotal` et `agg.zoneOff` comptent aussi les fautes, `agg.h2h` et `agg.situations` non ; `computeLeaderboard()` s'appuie dessus, pour que classement et fiche d'équipe montrent les mêmes pourcentages.
- `accumulatePlayerStats(match, slot, acc)` : par joueur, lancers, OFF % (non attrapés sur lancers identifiés et fautes attribuées, une faute étant un lancer raté, aussi par situation ; une faute « ? » ou d'équipe ne touche aucun joueur ; `throws` reste sur les lancers seuls, `throwsF` y ajoute les fautes), fautes, +/-, actions. Le +/- ne concerne que les joueurs impliqués : ballon échappé, +1 sur le terrain de l'équipe qui lance, −1 sur celui de l'équipe qui a échappé (la troisième équipe gagne son point mais pas de +/-) ; faute directe attribuée, −1 pour ce joueur seulement ; faute d'équipe, faute « ? » ou ballon attrapé, aucun +/-. Les « actions » donnent l'échelle du +/-.

## Situation, phases, zones

- **Situation** (`situationOf(history, i)`) : lit `details.situation`, et reconstitue la valeur pour les matchs d'avant sa saisie en remontant à l'événement précédent. La bascule Tout / Arrêtée / Continue (`situationFilterHTML`) sert le head-to-head et la heat map. L'onglet Fautes n'a pas de filtre de situation.
- **Phases** (`phaseOf(history, i, fmt)`) : Début (jusqu'à ce qu'une équipe atteigne `phaseAt`, 5 en 9/11), Pré-duel (jusqu'à l'élimination), Duel. L'action qui fait atteindre le seuil, ou qui élimine, compte dans la phase qu'elle termine : la phase se lit sur `before`. `phaseOf` renvoie `null` pour un format sans `phaseAt` (11/13, libre, duels) : aucune bascule, colonne « Phase » vide à l'export. La bascule (`phaseFilterHTML`) existe sur le head-to-head et les fautes d'un match seulement, pas sur le cumul, la heat map ni l'onglet Joueurs.
- **Zones** : une seule grille 3×3, `ZONES` = `z1` à `z9` numérotées de gauche à droite puis de haut en bas, `ZONE_LABEL` (« Haut gauche » à « Bas droite », `z5` = « Centre »). `zoneIndex(nx, ny)` et `classifyZone` sont le seul classement, utilisé par la vue d'ensemble, le détail d'un duel (`computeZoneStats(attacker, target, phase, situation)`), les fautes (`computeFaultZones`), le cumul, la heat map (`heatCellCounts`) et l'export (`zoneAt`, `zoneAoa`). Les coordonnées sont bornées à [0,1] au classement (un glisser qui finit hors du terrain compte dans une case de bord ou de coin) ; les données stockées ne sont pas modifiées. Dans les tableaux, le numéro de case (`zoneBadge`) relie la ligne au schéma `zoneDiagramSVG`.
- **Par période** : `evoChartSVG`, un SVG en ligne sans bibliothèque ; OFF en trait plein et rond, DÉF en tireté et carré, la couleur porte l'équipe. Sous `EVO_MIN` (5) lancers, le point est pâle et pointillé. Le tableau chiffré dessous fait foi quand deux courbes se confondent.

## Heat map

C'est un onglet de statistiques, disponible pour un match en cours, un match archivé et le cumul d'une équipe. `heatPointsFrom(match, slot, mode, situation, point)` récolte les points ; `slot` est l'emplacement de l'équipe dans ce match-là, ce qui permet de balayer tous ses matchs même sous une autre couleur. Le paramètre `point` vaut `'start'` ou `'end'` : par défaut offensive = départ, défensive = arrivée, et une bascule DÉPART / ARRIVÉE (état par mode, séparé pour un match et pour le cumul, en variables de module) regarde les mêmes lancers par l'autre bout. Les totaux ne dépendent pas du point choisi.

Vue par défaut : la grille d'efficacité (`heatGridSVG`), 3×3 fixe. Échelle divergente autour de la moyenne de l'équipe pour ce mode (vert `#1FA96B` mieux qu'elle-même, rouge `#D8383D` moins bien, gris neutre), chaque case porte son pourcentage et son nombre de lancers (la couleur n'est jamais seule), une case sous `HEAT_MIN` (3) lancers est hachurée sans pourcentage. L'autre vue, POINTS (`heatDotsSVG`), ne borne pas les coordonnées : un lancer fini hors terrain y est dessiné hors du cadre.

Les filtres de module (`h2hPhase`, `faultPhase`, `h2hSituation`, `heatPoint`, `teamHeatPoint`) gardent leur valeur d'un match à l'autre tant que la page n'est pas rechargée.

## DÉF ILL dans les statistiques

Stockée comme un lancer échappé, elle compte comme tel dans OFF %, DÉF %, head-to-head, par période, arrêté ou continu et +/-. Dans l'onglet Fautes, « Fautes » l'inclut pour l'équipe fautive, F % ne l'inclut pas (F % = fautes directes sur actions offensives), le tableau « Par type » l'inclut, « Où elles sont commises » non (elle n'a pas de position ; le détail d'équipe l'écrit sous le tableau, et son sous-titre sépare « N faute(s) directe(s) + M défensive(s) illégale(s) »). Elle n'est ni dans les zones ni dans la heat map, et ne gonfle pas le compteur de lancers sans joueur.

## Export

Quatre sorties depuis STATS → EXPORTER, toutes pour **un** match :

- **Excel** (`exportXLSX`) : feuilles Match, Actions, Équipes, Joueurs, Arrêté-continu, Reprises de jeu, Zones, Head-to-head, Types de fautes, Données brutes.
- **CSV — actions** (`exportCSV`) : la feuille Actions.
- **CSV — données brutes** (`exportRawCSV`).
- **JSON** (`exportJSON`) : `S` tel quel.

La feuille **Actions** (`buildActionRows`) est en format long : une ligne par événement, des colonnes catégorielles, `Réussite offensive` et `Arrêt défensif` valent 1 ou 0 (la moyenne de la colonne dans un tableau croisé donne le pourcentage). Un événement `fin_periode` y a sa ligne (type « Fin de période », `Résultat` « Période gagnée par … » ou « Période sans vainqueur »). Colonnes : numéro, période, type d'action, équipes (en possession, attaquante, ciblée), résultat, situation, phase, joueur, type de faute, faute d'équipe, zones et coordonnées de départ et d'arrivée, score de chaque équipe avant l'action, joueurs sur le terrain, équipe qui repart, joueur sortant et entrant, « Saisi par », duel en cours, équipe éliminée. Les colonnes portent le nom des équipes. Les feuilles de synthèse reprennent les chiffres de l'écran.

**Ajouts de STAT-1 (D85, D86).** Aucune colonne existante ne change de valeur, de nom ni de place : elles restent calculées sur les lancers seuls. Colonnes neuves en fin de ligne, au nom suffixé « (avec fautes) » : Équipes (attaques, attaques réussies, efficacité offensive), Zones (tentatives, réussites, efficacité ; pour la défensive, la même valeur que l'ancienne colonne), Joueurs (lancers, réussis et efficacité, au total puis arrêtés puis continus), Arrêté-continu (comme Zones) et, dans Actions, `Réussite offensive (avec fautes)` (1 pour un échappé, 0 pour un attrapé ou une faute directe, vide sinon ; sa moyenne par équipe attaquante égale l'OFF % de l'écran). Head-to-head : aucun changement. Pour une DÉF ILL : type « Lancer », résultat « Échappé », type de faute « DÉFENSIVE ILLÉGALE », zones vides ; la feuille « Types de fautes » a toujours une ligne pour elle (comme pour chacun des huit autres types, même à 0), et la feuille « Équipes » a une dernière colonne « Défensives illégales » (« Fautes directes » et « Fautes (%) » ne la comptent pas).

Les **données brutes** sont dynamiques : `buildRawRows` découvre toutes les clés de `before` et `details` de l'historique et en fait des colonnes, avec `EXPORT_EXPANDERS` pour déplier les structures (`lineups` devient une colonne par équipe). Un nouveau champ d'événement y apparaît donc sans toucher au code d'export. La feuille Actions, elle, a des colonnes écrites à la main : un nouveau champ à analyser demande une colonne de plus dans `buildActionRows`.

Format du CSV (C28) : séparateur de colonnes `;`, BOM UTF-8 en tête (gardé), retour de ligne `\r\n`. Pour un Excel réglé en français, les **nombres décimaux s'écrivent avec une virgule** (`0,45`) ; les entiers n'en ont pas ; les listes de coordonnées de l'export brut aussi (`0,3|0,7`) ; les dates ISO gardent leur point. Une cellule (`csvEscape`, aussi pour l'en-tête) est mise entre guillemets si elle contient `;`, `"`, un saut de ligne ou un retour chariot, et un **texte** qui commence par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot est précédé d'une apostrophe (jamais un nombre ni une liste de nombres, négatifs compris : `-1` et `-0,042|0,4` restent tels quels). Le fichier est remis par `saveFile` (feuille de partage sur appareil tactile, sinon téléchargement). Le XLSX range les textes comme du texte, sans apostrophe, jamais comme des formules, et garde de vrais nombres.

**Ajouts de C28 (décision « ajouts sûrs » du 2026-10-09).** Aucune colonne existante n'est renommée, retirée ni déplacée. La feuille Actions (CSV et XLSX) a **quatre colonnes de plus, en fin de ligne** : `ID du match` (`S.id`), `Date du match` (création, ISO 8601 UTC), `Heure de l’action` (le champ `at` de l'événement, ISO 8601 UTC ; vide pour les événements d'avant, qui n'en ont pas) et `Code de faute` (le code stable de `FAULTS`, ou `DÉF ILL`, à côté du libellé existant « Type de faute »). La feuille « Match » du XLSX reçoit `ID du match` et `Date du match` en dernières lignes. Seule exception de forme : deux équipes de même nom se distinguent par un suffixe (« Laval », « Laval (2) », « Laval (3) », dans l'ordre des équipes en jeu ; le suffixe saute tout nom déjà porté par une autre équipe, par exemple « Laval », « Laval », « Laval (2) » donne « Laval », « Laval (3) », « Laval (2) ») dans les en-têtes (`Score Laval (2) avant`, `Sur le terrain — Laval (2)`) comme dans les colonnes d'équipe et les autres feuilles (`nm(slot)`). Les données brutes gardent leur en-tête (`at` n'y figure pas, il reste dans le JSON).

**`at`** : champ de l'événement (comme `by`), posé par `horodatage()` à l'enregistrement d'un nouvel événement (`commitEvent`, `applySub`, `commitLineupDefinition`, fin de période manuelle). Jamais dans `before` ni dans `details`, donc ni `snapshotBefore`, ni ↶, ni WP, ni les statistiques ne le voient ; `kbcollect.js` le retire de la copie épurée envoyée (le contenu partagé et son empreinte ne changent pas). Pas de migration. Les suites du banc qui comparent deux parties retirent `at` (et les quatre colonnes ajoutées) comme elles retirent `ts` et `by`.

**Limites connues** (revue de code du 2026-10-09 ; détail et suites dans le registre) :
- les noms de colonnes de la feuille Actions contiennent encore les noms des équipes (fixes seulement pour le préfixe) : les fichiers de plusieurs matchs ne s'empilent qu'avec l'`ID du match` et un renommage des colonnes de score ; pas d'export « tous les matchs » au format long ;
- « Saisi par » exporte un identifiant d'appareil quand aucun nom n'est connu ;
- le comportement d'Excel (décimales à la virgule, apostrophe, texte en tête de formule) n'est pas vérifié, faute d'Excel ici : les fichiers ont été relus par un lecteur CSV du banc.
