# Revue 3 : statistiques, exports, probabilité de victoire

Revue en lecture seule du 2026-10-16, faite sur le commit `261a11b` (fusion de la PR #17).
Périmètre : `index.html` 1207-1290, 3554-4120 (% de victoire), 4120-6037 (stats, tableaux, situation, phases, joueurs, sections, par période, zones, heat map, export), 6233-6504 (cumul, classement), `sim/simcore.js`.

Preuves exécutées :
- `node sim/simtest.mjs` : TOUT PASSE.
- Le texte de `KBSimFactory` est identique dans `index.html` et dans `sim/simcore.js` (11 777 caractères, comparaison stricte).
- Deux scripts Playwright dans le dossier de travail (`preuve/zones.mjs`, `zones2.mjs`, `evo.mjs`), qui posent un `S` à la main puis appellent les fonctions de rendu. Le dépôt n'a pas été touché.

Les constats déjà connus ne sont pas repris comme nouveaux. Ceux que j'ai recroisés : C08-B et C08-C (export « tous les matchs »), R15-B (`history.length`, lignes d'un match qui n'a que l'alignement), Q11 (hypothèses du moteur), F7 (calibration).

## Résumé

| # | Gravité | Constat | Statut |
|---|---|---|---|
| S1 | important | Onglet Zones d'un match : TypeError dans un duel sans Bleu | reproduit (Playwright) |
| S2 | important | « Par période » : sur téléphone, les en-têtes affichent du balisage brut ; nom d'équipe échappé deux fois | reproduit (Playwright) |
| S3 | important (analyse) | XLSX « Équipes », colonne « Score final », et feuille « Match », lignes « Score … » : c'est le score de la période en cours, souvent 0 | vérifié par lecture |
| S4 | mineur (analyse) | Actions : « Situation » est vide pour une faute directe, alors que l'écran range la faute dans OFF arrêtée ou continue | vérifié par lecture |
| S5 | mineur | Zones des fautes : le dénominateur du % diffère entre un match et le cumul | vérifié par lecture |
| S6 | mineur (analyse) | Aucun identifiant d'équipe permanente dans les exports CSV et XLSX | vérifié (grep) |
| S7 | mineur | Feuille « Match » : l'équipe absente d'un duel y figure, et « Partants Bleu » est nommé par la couleur | vérifié par lecture |
| S8 | mineur | Détail du % de victoire : « N victoires sur r.n », mais le % se calcule sur `n - unfinished` | vérifié par lecture |
| S9 | propreté | Deux styles d'API (`S` global ou match en paramètre), donc le cumul réimplémente le calcul d'un match | vérifié |
| S10 | propreté | Code mort et commentaires périmés | vérifié |
| S11 | supposé | `rebuildMatches` peut garder dans `MATCHES_DB` un match qui est aussi dans `DELETED_MATCHES` | supposé, hors périmètre |
| S12 | supposé | Le cumul et le classement lisent la copie du match en cours dans `MATCHES_DB`, pas `S` | supposé |

Cohérence du moteur et de l'app : aucune divergence nouvelle trouvée (détail en fin de rapport).

---

## S1 — Onglet Zones : TypeError dans un duel qui exclut Bleu
- **Gravité** : important
- **Où** : `index.html:5111` (`let matchZoneTeam = 'Bleu'`), `5115` (`computeOverall()[matchZoneTeam]`), `5118` (`o.offZonesF`).
- **Ce qui se passe** : `computeOverall()` ne construit une entrée que pour `ATEAMS()`. Or un duel peut exclure n'importe quelle couleur (`2492` et `pendingExcludedTeam`, choix « Gris contre Noir » sur l'écran du format). Dans ce duel, `matchZoneTeam` vaut `'Bleu'` au premier affichage, ou `'Noir'` s'il a été choisi dans un match précédent à trois équipes. On a alors `o === undefined`, et `TypeError: Cannot read properties of undefined (reading 'offZonesF')`.
- **Scénario** : nouveau match en Duel 11, Gris contre Noir. Un lancer, puis STATS, puis l'onglet « Zones ». Rien ne s'affiche : l'ancien contenu reste, avec une erreur en console. `statTab.match` reste à `'zones'`, si bien que rouvrir STATS relance la même erreur. L'utilisateur s'en sort en touchant un autre onglet (la barre d'onglets de l'ancien rendu est encore là), ou une ligne de la Vue d'ensemble (`showMatchZonesFor`). Reproduit : `preuve/zones2.mjs` donne `zones` en erreur, `reopen` en erreur, puis `overallOk: true`.
- **Correction** : lire l'équipe comme R16 le fait pour la heat map (`5522`) : `const team = ATEAMS().includes(matchZoneTeam) ? matchZoneTeam : ATEAMS()[0];`, puis utiliser `team` aux lignes 5115 à 5118 (bouton actif et couleur compris). Ajouter une vérification au banc : onglet Zones d'un duel Gris contre Noir.

## S2 — « Par période » : balisage brut dans les en-têtes sur téléphone, nom d'équipe échappé deux fois
- **Gravité** : important sur téléphone (tableau illisible), mineur sur tablette
- **Où** : `index.html:5000` (colonnes de `sectionMatchEvolution`) et `4383` (`statTable` échappe `c.label` et `c.short`).
- **Ce qui se passe** : la colonne déclare `label:\`${lab} ${escapeHtml(S.names[t])}\`` et `short:\`${lab} <span class="evo-sw" …></span>\``. Or `statTable` échappe désormais les deux (« Les en-têtes peuvent porter un nom d'équipe : toujours échappés »). Résultat :
  - sur téléphone (`.phone .stab .sm{display:inline}`, `863`), l'en-tête affiche en clair `OFF <span class="evo-sw" style="background:#5B8CFF"></span>`. Les neuf colonnes (3 équipes × OFF, DÉF, F %) ne se distinguent plus que par un code couleur écrit en texte ;
  - partout, une équipe « A&B » s'affiche `OFF A&amp;B` (dans l'en-tête et dans le `title` « Trier par … »).
- **Preuve** : `preuve/evo.mjs` donne `lg: "OFF A&amp;B"` et `sm: "OFF <span class=\"evo-sw\" …></span>"` comme texte visible.
- **Correction** : `label:\`${lab} ${S.names[t]}\`` (non échappé, `statTable` s'en charge). Pour `short`, au choix : un champ `shortHtml` (HTML de confiance, construit par le code) que `statTable` n'échappe pas, ou un `short` texte (`OFF ` + trois premières lettres du nom) avec la pastille rendue par `statTable` à partir d'une `color`. C'est la seule colonne de la zone revue qui met du HTML dans `label` ou `short` (vérifié par grep).

## S3 — « Score final » (XLSX « Équipes ») et « Score Bleu/Gris/Noir » (feuille « Match ») : le score de la période en cours
- **Gravité** : important pour l'analyse (chiffre trompeur), sans effet sur l'écran
- **Où** : `index.html:5775` et `5782` (`S.scores[t]` sous l'en-tête `'Score final'`), `5619` (`matchInfoRows`).
- **Ce qui se passe** : `S.scores` est remis à `{Bleu:0,Gris:0,Noir:0}` à chaque fin de période (`showPeriodEnd`, `3367`). Un match qu'on termine après la fin de sa dernière période, au seuil comme à la main, exporte donc `Score final = 0` pour toutes les équipes. Un match terminé au milieu d'une période exporte le score de cette période seule. Le vrai résultat est dans « Périodes gagnées ».
- **Scénario** : un 9/11 joué jusqu'à la fin de la période 4, puis TERMINER. Dans la feuille « Équipes », toutes les équipes ont 0 en « Score final ».
- **Correction** (ajout sûr, D77) : ne pas renommer la colonne. La documenter comme « score de la période en cours au moment de l'export » dans `docs/stats-et-export.md`, et ajouter en fin de ligne des colonnes neuves, « Points marqués (match) » (la somme sur les périodes, se dérive de l'historique) et éventuellement « Score de la dernière période ». Dans `matchInfoRows`, ajouter un libellé explicite (« Score de la période en cours »).

## S4 — Actions : « Situation » vide pour une faute directe
- **Gravité** : mineur (analyse)
- **Où** : `index.html:5724` (`'Situation': lancer ? … : ''`), à comparer avec `4554-4557` (`computeSituations` range la faute par `situationOfFaute`) et `4812` (l'écran lit `offF_arretee` et `offF_continue`).
- **Ce qui se passe** : la doc affirme que la moyenne de « Réussite offensive (avec fautes) » par équipe attaquante redonne l'OFF % de l'écran. C'est vrai au total, faux par situation : dans un tableau croisé sur « Situation », les fautes tombent dans la ligne vide. Les colonnes « OFF arrêtée » et « OFF continue » de la Vue d'ensemble ne se recalculent donc pas depuis le CSV.
- **Correction** (ajout sûr) : une colonne neuve en fin de ligne, « Situation (avec fautes) », égale à `situationOf` pour un lancer et à `situationOfFaute` pour une faute directe. La reprendre dans `ALL_ACTIONS_HEADER` et `ALL_ACTIONS_DIRECT` (C08 : colonnes figées, ajout à la fin).

## S5 — Zones des fautes : dénominateur différent entre un match et le cumul
- **Gravité** : mineur
- **Où** : match `index.html:5196` (`pctVal(r.c, fz.total)`, fautes localisées seulement) ; cumul `6451` (`pctVal(r.c, agg.faults)`, toutes les fautes directes).
- **Scénario** : 10 fautes, dont 4 sans position. Dans un match, la case qui en a 3 affiche 50 % (3/6) ; dans la fiche de l'équipe, pour ces mêmes données, elle affiche 30 % (3/10). Le même chiffre a deux définitions selon l'écran.
- **Correction** : compter `faultZonesTotal` dans `computeTeamAggregate` et l'utiliser comme dénominateur, ou écrire sous le tableau du cumul « N fautes sans position ».

## S6 — Pas d'identifiant d'équipe permanente dans les exports
- **Gravité** : mineur (analyse multi-matchs)
- **Où** : `index.html:5552-6027` ; aucune lecture de `teamIds` (grep). Les colonnes d'équipe portent les noms de `nm()`, ceux du match.
- **Scénario** : dans « Exporter tous les matchs (CSV) », une équipe renommée entre deux matchs se coupe en deux groupes. Une équipe enregistrée et un nom libre identique se confondent. Le suffixe « (2) » dépend de l'ordre des emplacements dans chaque match. Seul le JSON garde `teamIds`.
- **Correction** (ajout sûr) : colonnes « ID équipe 1/2/3 » (`m.teamIds[slot]`, vide pour un nom libre) en fin de ligne de l'export « tous les matchs », et lignes « ID équipe … » dans la feuille « Match ».

## S7 — Feuille « Match » : l'équipe absente d'un duel y figure
- **Gravité** : mineur
- **Où** : `index.html:5616-5621`.
- **Ce qui se passe** : « Équipe Bleue », « Joueurs Bleu », « Score Bleu » et « Périodes gagnées Bleu » sont écrits même quand Bleu ne joue pas (son nom par défaut, un score de 0). « Partants Bleu » est nommé par la couleur alors que le reste du fichier utilise `nm()`. Le bloc « Partants », lui, suit `ATEAMS()` : la feuille mélange donc deux logiques.
- **Correction** : ajouter seulement, sans retirer de ligne (D77). Par exemple une ligne « En jeu » Oui ou Non par couleur, et documenter le comportement.

## S8 — Détail du % de victoire : deux dénominateurs
- **Gravité** : mineur (n'arrive que si une simulation atteint `MAX_ACTIONS`, ce qui reste théorique)
- **Où** : `index.html:4110` (« `${r.match[t]} victoires sur ${r.n}` ») et `4067` (`/ (r.n - r.unfinished)`).
- **Correction** : écrire `r.n - r.unfinished` dans la feuille, ou y mentionner les simulations inachevées.

## S9 — Deux styles d'API pour les calculs, donc une réimplémentation dans le cumul
- **Gravité** : propreté (risque de divergence ; S5 en est un premier exemple)
- **Où** :
  - fonctions qui lisent `S` en global : `computeH2H` (4121), `computeFaults` (4144), `computeOverall` (4175), `computeZoneStats` (5228), `computeFaultZones` (5251), `phaseOf` (4510, via `ATEAMS()`), `nm`, `playerNameIn`, `buildActionRows` ;
  - fonctions qui prennent le match en paramètre : `computeOffDefByPeriod`, `periodWinners`, `computeSituations`, `accumulatePlayerStats`, `heatPointsFrom`.
- **Conséquences** :
  - `computeTeamAggregate` (6261-6348) refait, match par match, H2H, zones, fautes, types, DÉF ILL et situations, au lieu d'additionner les fonctions d'un match ;
  - `buildAllActionRows` (5972) remplace `S` pendant le calcul (try/finally) pour réutiliser `buildActionRows`. Cela fonctionne tant que tout reste synchrone, mais c'est fragile : un `await` ajouté plus tard, ou un appel qui écrit dans `S`, casse l'export.
- **Correction** : donner un paramètre `m = S` à toutes les fonctions `compute*` et à `phaseOf` (en remplaçant `ATEAMS()` par `matchTeams(m)`), puis écrire le cumul comme une somme des résultats d'un match. C'est un refactor sans changement de valeur, que le banc peut vérifier (comparaison avant et après sur les feuilles XLSX et les écrans).

## S10 — Code mort et commentaires périmés
- `zoneSection` (`index.html:5281`) : n'est appelée nulle part (seule occurrence dans le fichier). Le commentaire au-dessus (`5279` : « utilisé par le détail d'un duel et par le cumul ») est faux.
- `commitEvent` (`3119-3124`) : un `if` vide (« h2h derived on read, nothing to store here »). Hors de ma zone, signalé au passage.
- `computeOffDefByPeriod` (`4217-4219`) : le commentaire parle de « périodes où il y a eu au moins un lancer résolu », alors qu'une période qui n'a que des fautes est listée depuis STAT-1.
- Les autres définitions de 3554-6504 sont toutes utilisées (script de comptage des occurrences).

## S11 — (supposé, hors périmètre) Un match à la fois actif et à la corbeille
- **Où** : `index.html:1501-1502`. Le dédoublonnage par id garde la première copie et ne regarde `deleted` qu'après. Une copie non supprimée dans `legacyMatches`, puis une copie `deleted` chez un propriétaire, et le match est à la fois dans `MATCHES_DB` (donc compté dans le cumul, le classement, la heat map et l'export « tous les matchs ») et dans `DELETED_MATCHES`. Je n'ai pas vérifié que ce cas peut se produire ; à confier à la revue du stockage.

## S12 — (supposé) Le cumul lit une copie du match en cours qui peut être en retard
- **Où** : `computeTeamAggregate`, `sectionTeamPlayers`, `sectionTeamHeat` et `computeLeaderboard` lisent `MATCHES_DB`, que seul l'abonnement met à jour (`1488`). L'export « tous les matchs » relit `S` pour cette raison (doc C08). Effet attendu : la fiche d'une équipe ouverte juste après une action peut ne pas encore la compter. Je ne l'ai pas mesuré.

---

## Cohérence du moteur (`sim/`) et de l'app

Vérifié, sans divergence nouvelle :
- Texte de `KBSimFactory` identique dans l'app et dans `sim/simcore.js` ; `simtest` vert.
- Faute directe : +1 à chaque autre équipe en jeu, le fautif garde le ballon (`awardFaultPoints` 3306, `applyFault` 3204-3212 ; moteur `step` kind 0).
- Ballon échappé, DÉF ILL comprise : +1 à toutes les équipes en jeu sauf la cible, qui prend le ballon (`applyResult` 3267-3283).
- Élimination de la plus basse, première dans l'ordre Bleu, Gris, Noir en cas d'égalité (`3321`, moteur `first`). Fin de période au seuil, vainqueur hors éliminée (`3331`).
- Ballon à l'éliminée, sinon au perdant du duel ; `duelActive = (fmt.teams === 2)` (`3371-3374`, moteur 88-91).
- Paramètres : `wpLaunch` n'envoie que les lancers et les fautes (avec `before.possession`) ; `params` garde P(faute) et P(échappé) séparés, comme la doc le dit pour D85.
- Signature, invalidation et repli : rien de faux trouvé. Un changement de joueur pendant un calcul change `history.length`, donc `wpSig` : la réponse est jetée et le calcul relancé. C'est un coût en trop, sans erreur.
- Restent les hypothèses connues (Q11 : 4 périodes, reprise du duel, cible à égalité) et la calibration (F7).

## Ce qui a été vérifié sans constat
- CSV (`csvEscape`, `toCSV`) : en-tête échappé, `;`, `"`, `\r` et `\n` entre guillemets, apostrophe devant un texte qui commence par `= + - @ \t \r`, nombres et listes de nombres négatifs non préfixés, virgule décimale, BOM et `\r\n`. Aucun défaut trouvé.
- XSS dans la zone : noms d'équipe et de joueur échappés dans les tableaux, la grille H2H, la heat map, le graphique et la feuille des changements. `onclick` avec `jsArg`, ou un emplacement fixe. `setScreenTitle` passe par `textContent`. Seule anomalie : le double échappement de S2.
- Annulation : tous les calculs se relisent depuis l'historique, donc ↶ est cohérent partout. Le WP recalcule sur `L < lastLen`.
- Matchs supprimés : exclus de `MATCHES_DB` (sous réserve de S11) ; le cumul et le compteur du sélecteur écartent les matchs vides (`matchVide`).
- Définitions STAT-1 (OFF avec fautes) : cohérentes entre `computeOverall`, `computeSituations`, `computeOffDefByPeriod`, `accumulatePlayerStats`, `teamGlobals` et le classement, et entre l'écran et la colonne « (avec fautes) » des feuilles. Seule exception : S4, par situation.
- `periodWinners` : fins sur seuil et à la main, dernière période, période sans événement après un TERMINER : correct.
