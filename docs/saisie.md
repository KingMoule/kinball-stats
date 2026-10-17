# Saisie en match

Tout ce qui se passe entre un geste sur le terrain et un événement dans l'historique. La forme des données est dans `donnees.md`, les calculs de statistiques dans `stats-et-export.md`.

## Le geste de base

Sur `#field`, trois écouteurs (`pointerdown`, `pointermove`, `pointerup`). Un glisser de plus de 15 px est un lancer ; moins, c'est une faute directe. Pendant le glisser, `drawDrag` trace la flèche à la couleur de l'équipe en possession (`TEAM_BG`, Noir cernée de blanc). Le geste ouvre un événement en attente, `pending` = `{type, details, before}`, où `before` est `snapshotBefore()` (pointages, possession, période, périodes gagnées, éliminée, duel, attentes, situation, alignements). Aucun point n'est attribué à ce stade : l'utilisateur peut encore abandonner. `commitEvent()` pousse `pending` dans `S.history` puis appelle `save()`.

Le terrain refuse tout geste tant qu'une feuille est ouverte, qu'une couche radiale est ouverte ou en fermeture, que le match attend un choix de possession (`awaitingInitial`, `awaitingDuelStart`) ou que la fenêtre de fin de période est ouverte (`periodEndBusy()` : éclair, feuille des détails, message). Le rectangle du terrain et la rotation (`fieldGeom()`) sont figés au `pointerdown` et servent à `pointermove` et `pointerup` du même geste : la mise en page peut bouger sur une image après ↶ sans transformer une faute directe en lancer (F43, D93). Le terrain affiche aussi la grille 3×3 des zones (`#gridLayer`, inerte), la période, le duel, la situation (ARRÊTÉ ou CONTINU) et « MODE AVANCÉ ».

## Deux présentations : radiale ou feuille

Le réglage « Saisie en match (cet appareil) » est dans l'écran Nouveau match. Valeur dans `localStorage`, clé `kinball.saisie` : `radiale` (défaut) ou `feuille`. Elle est lue à l'ouverture de chaque menu, donc changer de réglage ne casse aucune saisie. Le banc d'essai utilise `feuille` par défaut (voir `tests/README.md`).

Les deux présentations appellent exactement les mêmes fonctions de règles : `pickResult(team, caught)`, `pickDefIll(team)`, `pickFault(code)`, `pickReprise()`, `applyReprise(team)`, `choosePlayer(id)`, `cancelPendingEvent()`. Seules `showResultMenu`, `showFaultMenu` et `askPlayer` changent de présentation. Les boutons radiaux portent les mêmes `onclick` que ceux des feuilles.

Déroulé d'un **lancer**, en mode radial :
1. Près du point de relâchement, une rangée par équipe adverse encore en jeu : `ATTRAPÉ | ÉCHAPPÉ | DÉF ILL` (en duel, une seule rangée), puis « Annuler ».
2. Pour ATTRAPÉ ou ÉCHAPPÉ seulement : le menu des joueurs de l'équipe qui lance, quatre disques en diagonale autour d'un « ? » central, centré sur le bouton touché. « ? » enregistre l'action sans joueur : comptée pour l'équipe, pas pour un joueur. DÉF ILL se termine sans joueur.
3. Une équipe dont l'alignement n'a pas exactement 4 joueurs n'a pas de menu des joueurs (`askPlayer` passe directement à la suite).

Déroulé d'une **faute directe** : près du doigt, la grille des 8 types (`FAULTS`, libellés par `faultLabel`), « REPRISE DE JEU » et « Annuler » ; puis le menu des joueurs de l'équipe en possession, avec en plus « FAUTE D'ÉQUIPE » (comptée pour l'équipe, attribuée à personne, `fault_scope:'equipe'`).

Les menus radiaux sont dans la couche `#radial`, enfant de `#field` : ils partagent le repère de `fieldPoint()`, y compris sous le verrou portrait du téléphone, et sont ramenés entiers dans le cadre du terrain. En mode `feuille`, les mêmes choix sont des feuilles du bas. Restent des feuilles dans les deux modes : « QUI REPART AU BALLON ? » (reprise de jeu), « DUEL — QUI REPREND LE BALLON ? », la question du receveur (mode avancé), la fin de période, TERMINER et les changements de joueurs.

## Garde-fous de saisie

La saisie en direct passe avant tout : un ajout ne doit ni retarder un geste, ni créer un appui involontaire, ni laisser une action absente de l'historique.

- **Une feuille qui descend est inerte.** `closeSheet()` pose la classe `closing` pendant `SHEET_CLOSE_MS` (240 ms, un peu plus que la transition CSS) ; `#sheet.closing *` n'a plus de `pointer-events`. `openSheet()` la retire. Le drapeau « cette feuille se ferme d'un appui à côté » (`sheetDismissable`, lu par `closeSheetIfDismissable`) est une variable de module posée par `openSheet(html, dismissable)`, pas un champ de `S` (R27).
- **Gardes d'état.** Les fonctions de saisie vérifient l'état qu'elles supposent : `pickFault`, `pickResult`, `pickDefIll`, `applyFault`, `applyResult` demandent `pending` ; `chooseInitialPossession` demande `awaitingInitial` ; `chooseDuelStart` demande `awaitingDuelStart` ; `renderLineupSheet` et `commitLineupDefinition` demandent la feuille des changements ouverte. Ainsi aucun point, aucune possession, aucune élimination ne change sans événement.
- **Premier appui gagne.** `sheetTapGuard` (écouteur `click` en capture sur `#sheet`, partagé avec `#radial`) avale un appui à moins de `SHEET_DOUBLE_MS` (300 ms) et `SHEET_DOUBLE_PX` (32 px) du précédent. Aucun autre délai : un appui ailleurs passe tout de suite.
- **↶ réarmé.** Tout appui reçu par une feuille, le fond ou la couche radiale bloque ↶ du ruban et de la barre du téléphone pendant `UNDO_REARM_MS` (400 ms) : ces deux boutons appellent `undoTap()`. `undo()` n'a aucune garde de temps ; un bouton d'annulation placé dans une feuille appelle `undo()`, sauf à l'étage « joueurs » d'une saisie en cours, où il appelle `cancelPendingEvent()` (`undo()` refuse tant que `pending` existe).
- **⌂ Accueil et TERMINER réarmés (LIS-1, D92).** La même fenêtre `UNDO_REARM_MS` refuse aussi `goHome()` et `finishBarTap()` (le bouton TERMINER du ruban et de `#matchBar`) : un second appui juste après « Annuler » (feuille ou couche radiale) ne doit pas ouvrir la feuille de ⌂ ni de TERMINER. Aucun nouveau délai. La fenêtre de 400 ms bloque ⌂ et TERMINER après tout appui reçu par une feuille, le fond ou la couche radiale, pas seulement après Annuler. Les appels de code (`navHome`, `openFinishMenu` depuis RETOUR / « Garder le match », tests) ne sont pas gardés ; la couche radiale refusait déjà ⌂ et TERMINER pendant sa fermeture (`radialBusy`).
- **Garde commune (T-FP robustesse, D98).** `barreLibre()` garde les boutons du ruban et de `#matchBar` : ↶ (`undoTap`), ⌂ (`goHome`), TERMINER (`finishBarTap`) et FIN PÉRIODE (`endPeriodByLeader`). Le bandeau `#syncBadge` (`openSyncSheet`, qui sert aussi hors du match) refuse seulement pendant une couche radiale (saisie N3). Elle refuse pendant la fenêtre de fin de période (`periodEndBusy()`), pendant une couche radiale ouverte ou en fermeture (`radialBusy()`) et avant `undoBlockedUntil`. ↶ arme lui-même `undoBlockedUntil` pour `UNDO_REBOND_MS` (120 ms) après son action : un rebond du doigt ne défait qu'une action ; des ↶ voulus en rafale (150 ms d'écart, C22 · 6c) passent tous (saisie N2). Le terrain a sa propre variante, `fieldDoubleTap` : la règle de `sheetTapGuard` (`SHEET_DOUBLE_MS`, `SHEET_DOUBLE_PX`) comptée depuis le dernier abandon (`abandonTap` : « Annuler cette saisie », le voile de la couche, le fond de la feuille). Le second appui d'un double appui sur Annuler ne démarre donc pas de geste (D2), tandis qu'un geste ailleurs, même 140 ms après (C21 · 6l), juste après ↶ ou après un vrai choix reste immédiat. `pointercancel` sur le terrain efface le geste en cours (saisie N5). `openStats` et les pastilles d'équipe gardent leurs gardes propres.
- **Armement différé et appui maintenu.** Les confirmations lourdes (terminer le match, mise à la corbeille) restent inertes `ARM_MS` (500 ms) après l'ouverture (`armSheet`) ; jeter un match demande de maintenir le doigt `HOLD_MS` (1 300 ms, `holdStart`). Les deux confirmations montrent le récapitulatif du match (`matchRecapHTML`).
- **Couche radiale.** Elle ne passe pas par `#sheet` : elle reprend ces protections à elle (classe `closing`, anti-double-appui, gardes `pending`). Un appui sur le voile annule la saisie (aucun point, aucun événement) aux étages « résultat » et « type de faute » ; à l'étage des joueurs il ne fait rien, car le résultat est déjà choisi (on passe par « ? ») ; ce même étage a son bouton « Annuler » (LIS-1), sur la rangée du bas, loin du « ? » : seul et centré pour un lancer, à gauche de FAUTE D'ÉQUIPE pour une faute directe (même rangée, pour tenir dans un terrain de 300 px). Annuler et le voile ferment en 120 ms. Un redimensionnement ou une rotation avec une couche ouverte annule la saisie. Au retour sur l'écran de match, `reopenMatchSheets()` jette une saisie orpheline de la couche.
- **Règle pour toute nouvelle couche ou feuille** : reprendre ces protections, ne recouvrir ni ↶ ni le ruban de pointage ni `#matchBar`, vérifier l'état supposé en première ligne de chaque bouton, tester `pending`, `awaitingInitial`, `awaitingDuelStart`, `periodEndTimer` avant de s'ouvrir.

## Règles du jeu telles que codées

- **Faute directe** de l'équipe en possession (`before.possession`) : +1 à chaque autre équipe en jeu ; elle garde le ballon ; situation arrêtée. `awardFaultPoints` est le seul endroit qui attribue des points, appelé par `applyFault` et `applyResult`.
- **Lancer ATTRAPÉ** : aucun point ; la cible prend le ballon en situation continue (`S.stopped = false`). **ÉCHAPPÉ** : +1 à chaque équipe en jeu sauf la cible ; la cible prend le ballon, situation arrêtée.
- **DÉF ILL** (défensive illégale) : stockée comme un lancer échappé (`result:'échappé'`, `target` = l'équipe fautive, `fault_type:'DÉF ILL'`), sans joueur ni coordonnées. Mêmes points, même reprise ; le lancer compte, la faute aussi (voir `stats-et-export.md`). `DEF_ILL` n'est pas dans `FAULTS` (grille de saisie) mais dans `FAULT_TYPES` (tableaux).
- **Reprise de jeu** (`pickReprise`, `applyReprise`) : aucun point ; l'équipe choisie repart, situation arrêtée. Événement de type `reprise`, ni faute ni lancer : hors fautes, hors actions offensives, hors +/-.
- **Situation arrêtée ou continue** : `S.stopped` est vrai au début de match ou de période, après une faute, une reprise ou un ballon échappé ; faux après un ballon attrapé. La valeur est copiée dans `before` et figée dans `details.situation` de chaque lancer.
- **Élimination** (3 équipes, hors duel, `eliminationAt` atteint) : l'équipe au plus bas pointage est éliminée, le duel commence et la feuille non fermable « DUEL — QUI REPREND LE BALLON ? » s'ouvre (`openDuelStartSheet`, avec « ↶ Annuler la dernière action » en dernier élément). Une égalité au plus bas est impossible : les points avancent par pas de 2 et les seuils sont impairs. Aucune règle de départage n'existe ; la branche héritée prendrait la première équipe dans l'ordre Bleu, Gris, Noir sans jamais être atteinte.
- **Fin de période sur seuil** (`periodAt`) : par `finishPeriod(vainqueur, false, true)` depuis `checkPeriodState`, pendant l'action (faute directe ou ballon échappé) ; l'action applique ensuite la remise à zéro avant son enregistrement (voir plus bas).
- **Match sans action (R15, D91)** : retour à l'accueil (⌂, retour, onglets) avec un match en cours sans lancer, faute directe ni fin de période (alignement et changements ne comptent pas) : le match part à la corbeille sans confirmation (`corbeilleSiMatchVide`). Dès une action, ⌂ garde la feuille « QUITTER LE MATCH EN COURS ? ». Jamais un match terminé, une archive consultée ni pendant la saisie d'un événement.
- **Fin de match** : aucune fin automatique, même à 4 périodes gagnées. Le menu TERMINER (`openFinishMenu`) propose de terminer la période en désignant le vainqueur ou non, de terminer le match (`finishMatchNow`, statut `completed`) ou de ne pas l'enregistrer (corbeille, voir `donnees.md`).

### Formats

Table `FORMATS`, deux axes indépendants. Ajouter un format = ajouter une entrée ; `checkPeriodState()` lit les seuils.

| Format | Équipes | Élimination | Période | Phases (`phaseAt`) |
|---|---|---|---|---|
| 9 / 11 | 3 | 9 | 11 | 5 |
| 11 / 13 | 3 | 11 | 13 | non |
| Libre (3 équipes) | 3 | jamais | à la main | non |
| Duel 11 | 2 | jamais | 11 | non |
| Duel 13 | 2 | jamais | 13 | non |
| Libre (duel) | 2 | jamais | à la main | non |

Un match stocke toujours trois emplacements d'équipe ; `S.activeTeams` dit lesquels jouent. En duel direct, `duelActive` est vrai dès le départ et reste vrai d'une période à l'autre. `getFormat(m)` relit la table par `id` : les matchs enregistrés avant l'ajout d'un champ du format en profitent sans migration, et un match sans `format` est lu comme un 9/11.

### Fin de période : le message de 1,4 s

**La remise à zéro est appliquée à `S` tout de suite ; seul l'affichage attend (T-FP robustesse, F26, E5, D98).** `finishPeriod(vainqueur)` compte la période gagnée, pose `periodEndWait` (`{winner, eliminated, period, phase}`) puis `appliquerFinPeriode()` met `S` dans la période suivante : période + 1, pointages à zéro, départ arrêté, possession (l'éliminée repart en format à trois équipes ; en duel, le perdant), fin du duel sauf format à deux équipes. Avant de le faire, elle garde dans `periodEndView` ce que le ruban affiche encore (pointages au seuil, possession, période qui finit, élimination, situation) : `renderScoreboard` lit `periodEndView || S`. Ainsi tout `save()` de la fenêtre (celui de l'action, `setAdvancedPlayer`, un réessai) écrit un état cohérent, et un rechargement n'a rien à rejouer. `showPeriodEnd(vainqueur, période)` affiche « PÉRIODE N TERMINÉE » avec un bouton « Annuler » ; à la fin de `periodEndTimer` (1 400 ms pleines), `periodEndView` repasse à `null` et le ruban rejoint `S` (aucune écriture). Trois chemins :

- **fin à la main** : `finishPeriod(vainqueur, true)` applique la remise à zéro, `save()`, puis le message (1,4 s) ;
- **faute directe au seuil** : `checkPeriodState` appelle `finishPeriod(vainqueur, false, true)` ; `applyFault` appelle `appliquerFinPeriode()` juste avant `commitEvent` (qui enregistre), puis le message tout de suite ;
- **ballon échappé au seuil (lancer, DÉF ILL comprise)** (R14, F33, D93) : même appel ; `applyResult` pose la possession du receveur, appelle `appliquerFinPeriode()` puis `commitEvent`, affiche l'éclair « ÉCHAPPÉ » (550 ms, `flashTimer`), puis `afterFlashPeriodEnd` ouvre le message : l'écran change ≈ 1,95 s après le geste ;
- **mode avancé** : à la fin de l'éclair s'ouvre la feuille « DÉTAILS AVANCÉS » comme avant (sauf DÉF ILL ou aucun alignement) ; le message attend (`periodEndWait.phase === 'detail'`) et reprend dans `closeSheet()` quand la feuille est validée, fermée d'un appui à côté ou refermée par le code. Aucun minuteur ne ferme une feuille ouverte par la personne.

`periodEndWait`, `periodEndView`, `periodEndTimer` et `flashTimer` sont des variables de module, jamais dans S, déclarées avant `navHome` ; `periodEndBusy()` = `periodEndTimer` ou `periodEndWait`. Tant que la fenêtre est ouverte (éclair, feuille des détails, message) :

- `finishPeriod` ne fait rien (une seule fin de période à la fois) ;
- le terrain, `openLineupSheet`, la garde commune (↶, ⌂, TERMINER, FIN PÉRIODE, bandeau), `openFinishMenu`, `openStats`, `endPeriodManually` et `reopenMatchSheets` refusent : le geste est ignoré, jamais mis en file (Q14, F38) ;
- `undo()` annule `periodEndTimer`, `periodEndWait`, `periodEndView` et `flashTimer` avant de défaire le dernier événement : `before` ramène aussi la période qui venait de finir. Pour une fin de période automatique (seuil), cet événement est l'action qui l'a provoquée : ↶ défait la fin de période et cette action. Pour une fin manuelle, voir plus bas ;
- la feuille du message recouvre ↶ : le bouton « Annuler » du message (≥ 44 px) passe par `undoPeriodEnd()` puis `undo()`, le même chemin que ↶ (à inclure dans tout balayage des boutons d'annulation). Il n'est pas retenu par `undoBlockedUntil`, mais `undoPeriodEnd` ignore tout appui reçu moins de `UNDO_REARM_MS` (400 ms) après l'ouverture du message (`periodMsgAt`) : c'est le rebond du bouton qui l'a ouvert (TERMINÉ de la feuille des détails rebondit à ≈ 330 ms, hors de `SHEET_DOUBLE_MS`) ;
- `navHome`, `navBack`, `navTab`, `startMatch` et `resumeMatch` appellent `abandonPeriodEndWait()` (avant `closeSheet()`) : attente, éclair, minuteur du message et affichage différé sont coupés sans rien afficher (audit #13 : le minuteur ne referme plus la feuille d'un autre écran) ; `S` est déjà dans la période suivante, la reprise ne rejoue rien.

État enregistré par une version d'avant T-FP robustesse dans cette fenêtre (pointage au seuil, période pas avancée) : `reopenMatchSheets()` rejoue la fin de période une seule fois (retire d'abord le point de période s'il était déjà compté). Elle le fait si le dernier événement est un lancer ou une faute directe de la même période, ou une `fin_periode` de la même période (F42) ; sinon l'état est indécidable et rien n'est fait.

Fin de période décidée à la main (TERMINER, ou le bouton FIN PÉRIODE des formats libres, `endPeriodByLeader` : le meneur l'emporte, une égalité ouvre une feuille de choix) : `endPeriodManually` et `endPeriodByLeader` appellent `finishPeriod(vainqueur, true)`, qui pousse d'abord un événement `fin_periode` (`before` = `snapshotBefore()`, `details:{winner}`, vainqueur ou `null`) puis compte la période comme d'habitude (C26 · R6). ↶ défait cette fin de période seule, pendant le message comme après, et ramène exactement l'état d'avant, sans toucher à la dernière action ; un second ↶ défait cette action. Les fins automatiques (seuil) ne produisent pas d'événement. Tous les lecteurs de l'historique filtrent par `type` et ignorent `fin_periode` comme `changement` et `alignement` (stats, WP, `situationOf` — qui le traite comme un départ arrêté —, `phaseOf`, +/-, compteurs d'actions) ; l'export Actions en fait une ligne « Fin de période » (période terminée, résultat « Période gagnée par … » ou « Période sans vainqueur »), l'export brut une colonne `winner`.

### Match terminé

Un match dont `status !== 'in_progress'` refuse tout geste de saisie (C26 · R7) : appui et glisser sur le terrain (`pointerdown` du terrain), `openLineupSheet`, `applySub`, `commitLineupDefinition`, `setAdvancedPlayer`, `openAdvancedDetailSheet`, `undo` (le bouton ↶ est aussi désactivé), `openFinishMenu`, `endPeriodByLeader`, `endPeriodManually`. La feuille « Et maintenant ? » de `finishMatchNow` n'est pas refermable d'un appui à côté : on en sort par VOIR LES STATS, NOUVEAU MATCH ou ACCUEIL.

### Reprise à l'entrée de l'écran

`onEnterScreen('match')` appelle `renderScoreboard()` puis `reopenMatchSheets()`. Quatre chemins y passent : `startMatch`, `resumeMatch`, `restoreLocalBackup` et `navBack`. La fonction rouvre « QUI COMMENCE AU BALLON ? » ou « DUEL — QUI REPREND LE BALLON ? » si le match les attend, et ne fait rien en consultation d'archive, match terminé, saisie en cours ou fenêtre de fin de période. Règle : tout nouvel état d'attente du match doit pouvoir être repris depuis `S` seul.

## Alignements et changements de joueurs

Une équipe sans alignement joue normalement mais n'a aucune statistique individuelle. Un alignement compte exactement 4 joueurs (`LINEUP_SIZE`) ou aucun ; entre les deux, `startMatch` refuse de lancer. `S.lineups[équipe]` donne les 4 joueurs sur le terrain en ce moment, `S.startingLineups` les partants (ils préremplissent le prochain match de l'équipe). Chaque événement fige `lineups` dans son `before`, ce qui rend possibles le +/- et les statistiques de présence.

Toucher le bloc d'une équipe dans le ruban (hors de la zone des barres de probabilité) ouvre sa feuille : un petit terrain avec les 4 joueurs en carré 2×2, un bandeau « BANC » à la couleur de l'équipe, des jetons de 64 px (56 px sur téléphone).

- Glisser un jeton du banc sur un jeton du terrain, ou l'inverse, échange les deux joueurs ; tout autre lâcher ne fait rien. On enchaîne autant d'échanges qu'on veut.
- Le repli : toucher le sortant (`pickSubOut`), puis l'entrant (`pickSubIn`).
- Un seul chemin applique un échange : `applySub(team, outId, inId)` prend `snapshotBefore()`, modifie `S.lineups`, pousse un événement `changement` puis rend. « ↶ Annuler le dernier changement » (`undoLineupChange`) n'est visible que si le dernier événement est un changement de cette équipe.
- Mécanique du glisser : Pointer Events délégués sur `#sheet`, `setPointerCapture`, `touch-action:none` sur les jetons, seuil `SUB_DRAG_PX` (10 px) entre toucher et glisser, cible trouvée par `elementFromPoint` puis `closest('[data-pid]')`. Pas de glisser-déposer HTML5 (il ne marche pas au doigt sur iPad). L'état du glisser est en variables de module. Le `click` qui suit un glisser est avalé par un écouteur enregistré avant celui du double appui.
- Définir un alignement oublié en cours de match produit un événement `alignement`.

## Mode avancé

Réglage de l'écran Nouveau match, « EN DIRECT » ou « AVANCÉ (différé) » (`S.advancedMode`, désactivé par défaut), pensé pour saisir un match filmé. Après un lancer ATTRAPÉ ou ÉCHAPPÉ (pas après une DÉF ILL ni une faute), le message éclair est suivi d'une feuille facultative « DÉTAILS AVANCÉS » où l'on peut noter le receveur (`target_player_id`, `target_player_name`) parmi les joueurs sur le terrain à ce moment. Pour ajouter un futur champ avancé, passer par `openAdvancedDetailSheet` et `setAdvancedPlayer` : le champ suit l'export dynamique (voir `stats-et-export.md`).

## Annulation

`undo()` retire le dernier événement et fait `Object.assign(S, ev.before)`, ferme la feuille, rend, sauvegarde ; elle ne fait rien pendant une saisie en cours, si l'historique est vide ou si le match est terminé. L'annulation d'un changement de joueur est la même opération. Abandonner une saisie à l'étage « joueurs » (QUI A LANCÉ ? / QUI A FAIT LA FAUTE ?) se fait par « Annuler cette saisie » (feuille) ou « Annuler » (couche radiale) : `cancelPendingEvent()` jette `pending` sans rien écrire (l'action n'est appliquée qu'après le choix du joueur, donc ni point ni événement), comme aux autres étages (LIS-1, D92). Elle ne relance un calcul de probabilité que par l'effet normal de `wpSync` (voir `probabilite-victoire.md`).
