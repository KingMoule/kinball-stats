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

- `computeOverall()` : par équipe, toutes cibles confondues. Offensive = part des lancers non attrapés ; défensive = part des ballons reçus qui ont été attrapés. Les totaux sont ventilés par case 3×3 (départ pour l'offensive, arrivée pour la défensive).
- `computeH2H(phase)` : attaquant → cible, avec le détail arrêtée ou continue.
- `computeFaults(phase)` : actions, fautes et types par équipe, plus les DÉF ILL.
- `computeOffDefByPeriod(match)` : offensive et défensive par période, lues sur `before.period`.
- `computeSituations(match)` : comptes par situation, à l'attaque et à la défense.
- `computeTeamAggregate(teamId)` : le cumul d'une équipe sur tous ses matchs, en traduisant la couleur du jour vers l'équipe permanente par `teamIds`. `teamGlobals(agg)` additionne les head-to-head (un lancer sans coordonnées compte quand même) ; `computeLeaderboard()` s'appuie dessus, pour que classement et fiche d'équipe montrent les mêmes pourcentages.
- `accumulatePlayerStats(match, slot, acc)` : par joueur, lancers, OFF % (non attrapés sur lancers identifiés, aussi par situation), fautes, +/-, actions. Le +/- ne concerne que les joueurs impliqués : ballon échappé, +1 sur le terrain de l'équipe qui lance, −1 sur celui de l'équipe qui a échappé (la troisième équipe gagne son point mais pas de +/-) ; faute directe attribuée, −1 pour ce joueur seulement ; faute d'équipe, faute « ? » ou ballon attrapé, aucun +/-. Les « actions » donnent l'échelle du +/-.

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

Stockée comme un lancer échappé, elle compte comme tel dans OFF %, DÉF %, head-to-head, par période, arrêté ou continu et +/-. Dans l'onglet Fautes, « Fautes » l'inclut pour l'équipe fautive, F % ne l'inclut pas (F % = fautes directes sur actions offensives), le tableau « Par type » l'inclut, « Où elles sont commises » non (elle n'a pas de position). Elle n'est ni dans les zones ni dans la heat map, et ne gonfle pas le compteur de lancers sans joueur.

## Export

Quatre sorties depuis STATS → EXPORTER, toutes pour **un** match :

- **Excel** (`exportXLSX`) : feuilles Match, Actions, Équipes, Joueurs, Arrêté-continu, Reprises de jeu, Zones, Head-to-head, Types de fautes, Données brutes.
- **CSV — actions** (`exportCSV`) : la feuille Actions.
- **CSV — données brutes** (`exportRawCSV`).
- **JSON** (`exportJSON`) : `S` tel quel.

La feuille **Actions** (`buildActionRows`) est en format long : une ligne par événement, des colonnes catégorielles, `Réussite offensive` et `Arrêt défensif` valent 1 ou 0 (la moyenne de la colonne dans un tableau croisé donne le pourcentage). Un événement `fin_periode` y a sa ligne (type « Fin de période », `Résultat` « Période gagnée par … » ou « Période sans vainqueur »). Colonnes : numéro, période, type d'action, équipes (en possession, attaquante, ciblée), résultat, situation, phase, joueur, type de faute, faute d'équipe, zones et coordonnées de départ et d'arrivée, score de chaque équipe avant l'action, joueurs sur le terrain, équipe qui repart, joueur sortant et entrant, « Saisi par », duel en cours, équipe éliminée. Les colonnes portent le nom des équipes. Les feuilles de synthèse reprennent les chiffres de l'écran. Pour une DÉF ILL : type « Lancer », résultat « Échappé », type de faute « DÉFENSIVE ILLÉGALE », zones vides ; la feuille « Types de fautes » a toujours une ligne pour elle, et la feuille « Équipes » n'a pas de colonne DÉF ILL.

Les **données brutes** sont dynamiques : `buildRawRows` découvre toutes les clés de `before` et `details` de l'historique et en fait des colonnes, avec `EXPORT_EXPANDERS` pour déplier les structures (`lineups` devient une colonne par équipe). Un nouveau champ d'événement y apparaît donc sans toucher au code d'export. La feuille Actions, elle, a des colonnes écrites à la main : un nouveau champ à analyser demande une colonne de plus dans `buildActionRows`.

Format du CSV : séparateur `;`, décimales avec un point, BOM UTF-8 en tête, retour de ligne `\r\n`. Le fichier est remis par `saveFile` (feuille de partage sur appareil tactile, sinon téléchargement). Le XLSX range les textes comme du texte, jamais comme des formules.

**Limites connues** (revue de code du 2026-10-09 ; détail et suites dans le registre) :
- ni identifiant ni date de match dans les exports, aucune heure sur les événements, et des noms de colonnes qui changent d'un match à l'autre (noms d'équipes) : les fichiers de plusieurs matchs ne s'empilent pas sans retouche ;
- deux équipes de même nom écrasent leurs colonnes ; le nom d'une équipe contenant `;` ou `"` décale l'en-tête du CSV (l'en-tête n'est pas échappé) ;
- « Type de faute » exporte le libellé affiché, pas le code stable ; « Saisi par » exporte un identifiant d'appareil quand aucun nom n'est connu ;
- dans le CSV, un texte commençant par `=`, `+`, `-` ou `@` serait pris pour une formule par Excel ; les décimales avec un point risquent d'être lues comme du texte dans un Excel réglé en français (non vérifié, pas d'Excel ici).
