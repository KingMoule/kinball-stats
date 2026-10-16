# Revue de code, volet 1 : saisie en direct (index.html, lignes ~1706 à ~3554)

Revue en lecture seule, le 2026-10-16, sur le clone du dépôt. Je n'ai lancé aucun test : tout ce qui suit vient de la lecture du code, et « supposé » marque ce que je n'ai pas vérifié en exécution. Les numéros de ligne renvoient à `index.html`, sauf mention contraire.

Périmètre lu : SAUVEGARDE (1706-1912), NAVIGATION (1913-2108), `checkResume`, `resumeMatch`, `goHome`, `startMatch`, `finishMatchNow`, mode avancé (2364-2438), changements et glisser-déposer (2578-2735), garde-fous (2737-2786), SHEET (2788-2835), MENU RADIAL (2837-3018), FIELD DRAG (3020-3140), REPRISE, JOUEUR DE L'ACTION, fin de période, TERMINER, jeter le match, `undo` (3141-3552).

## Synthèse

| # | Gravité | Constat | Lieu |
|---|---|---|---|
| N1 | important | Une écriture réussie efface `pendingSaveId` et la copie locale d'une sauvegarde postérieure encore en file : si cette dernière échoue, aucun réessai, aucune copie locale, aucune alerte à la fermeture | 1763-1776 |
| N2 | important (à décider) | Un double appui sur ↶ (ou un rebond du doigt) défait deux actions : rien ne réarme ↶ après ↶ | 3538-3541 |
| N3 | mineur | Toucher le bandeau `#syncBadge` pendant une saisie radiale laisse un `pending` orphelin : ↶, FIN PÉRIODE et les changements ne répondent plus, et « Annuler » du message de fin de période ne fait rien | 1801, 2805, 3543 |
| N4 | mineur | FIN PÉRIODE (`endPeriodByLeader`) n'a pas la garde `undoBlockedUntil` de F28 : le second appui parasite d'un « Annuler » termine la période sans confirmation | 3512-3521 |
| N5 | mineur | Pas de `pointercancel` sur le terrain : `dragging`, `dragGeom` et la flèche restent après un geste interrompu par le système | 3062-3093 |
| N6 | mineur | `restoreLocalBackup` remplace `S` sans la protection R19 de `resumeMatch`, ni `abandonPeriodEndWait`, ni remise à zéro de `pending` | 1868-1882 |
| N7 | mineur | Récupération au démarrage : une annulation (↶) non écrite n'est jamais proposée, car l'historique local est plus court que celui de la base | 1848-1849 |
| N8 | mineur | REPRENDRE juste après TERMINER LE MATCH, quand l'écriture n'est pas confirmée : `resumeMatch` garde le `S` terminé et ouvre un écran de match mort | 2267, 2083 |
| P1 à P9 | propreté | Code mort, doublons, gardes dispersées, invariant mal formulé | voir plus bas |

Constats déjà connus, confirmés ici : F26 (reste), E5, F42, D2 et les quatre constats de l'audit de #13 (section « Déjà connus »).

Risques pour les chantiers suivants : REDO (section R) et TERRAIN (section T).

---

## Constats nouveaux

### N1 (important) : `pendingSaveId` et la copie locale effacés par l'écriture précédente

**Lieu** : `save()`, 1758-1785, en particulier 1763-1764 et 1775-1776 ; `scheduleRetry()`, 1756.

**Mécanisme vérifié** :
1. `save()` A (match X) : `pendingSaveId = X`, copie locale A, la tâche A part dans `saveChain`. Après `await dbReady`, A prend `payload = S` à cet instant, puis attend `writeMatchDoc`.
2. Pendant cette attente, une nouvelle action appelle `save()` B : `pendingSaveId = X` (même valeur), `writeLocalBackup(B)`, la tâche B attend derrière A.
3. A réussit. Comme `pendingSaveId === payload.id`, on obtient `pendingSaveId = null` et `retryStep = 0`, puis **`markLocalBackupSynced(X)` supprime la copie locale B**, alors que A ne contenait pas l'action B.
4. B échoue : `setSyncState('error')` puis `scheduleRetry()`. Quand le minuteur se déclenche, il trouve `if(pendingSaveId) save(true)` faux : **aucun réessai**.

**Résultat** : l'action B n'existe plus qu'en mémoire. `hasUnsavedWork()` vaut faux, donc pas d'alerte `beforeunload` et la garde R19 de `resumeMatch` ne joue pas. Il n'y a plus de copie locale à récupérer au démarrage. Le badge rouge reste affiché ; « RÉESSAYER MAINTENANT » ou l'action suivante rattrapent B, mais une fermeture de l'app à ce moment perd B.

**Probabilité** : en mode local (KBLocal / IndexedDB, écritures de quelques ms), la course est très rare. Avec le stockage serveur (centaines de ms, wifi de gymnase), elle devient plausible, si ce mode est encore livré (supposé : je n'ai pas vérifié quelles versions utilisent encore `DB` serveur).

**Correction** : un compteur `saveSeq` incrémenté à chaque `save()` et capturé par la tâche. On ne remet `pendingSaveId` à `null` et on n'appelle `markLocalBackupSynced` que si `seq === saveSeq` à la fin de l'écriture. Dans le `catch`, poser `pendingSaveId = payload.id` (ou ne jamais l'effacer en cas d'échec). Ce correctif touche le même code que « minuteur de réessai perdu en consultation d'archive » et « NOUVEAU match non protégé » (audit #13) : à traiter ensemble dans T-FP robustesse.

### N2 (important, à décider) : double appui sur ↶

**Lieu** : `undoTap()`, 3538-3541 ; `undo()`, 3542-3552.

`undoBlockedUntil` n'est armé que par un appui reçu par une feuille, le fond ou la couche radiale (2830, 2834). ↶ lui-même ne l'arme pas. Le viewport porte `user-scalable=no` (ligne 5), donc iOS livre les deux `click` d'un double appui. `renderScoreboard()` remplace le bouton, mais le second appui tombe sur le nouveau ↶, qui est actif.

**Scénario** : un rebond du doigt ou un double appui sur ↶ défait deux actions. La seconde action défaite était juste et il n'existe aujourd'hui aucun moyen de la rétablir (pas de ↷). Il faut la ressaisir de mémoire.

**Correction** : dans `undoTap`, ignorer un second ↶ arrivé moins de `SHEET_DOUBLE_MS` (300 ms) après le précédent, par exemple avec `undoBlockedUntil = Date.now() + SHEET_DOUBLE_MS` après `undo()`. C'est à faire valider par l'utilisateur : quelqu'un peut vouloir enchaîner des ↶ volontairement, mais 300 ms suffisent pour garder ce geste. REDO (↷) réduira le coût de l'erreur sans la supprimer.

### N3 (mineur) : `pending` orphelin après un appui sur `#syncBadge` pendant une saisie radiale

**Lieu** : `openSyncSheet()`, 1801 ; `openSheet()` → `hideRadial()`, 2805 ; `undo()`, 3543 ; `endPeriodByLeader()`, 3513 ; `openLineupSheet()`, 2585.

Le bandeau `#syncBadge` (ligne 903) est dans le flux, au-dessus de l'écran de match, et sans `z-index`. La couche radiale ne couvre que `#field` (lignes 250 et 1137). En mode feuille, le fond (`position:fixed; z-index:40`) recouvre le bandeau ; en mode radial, rien ne le recouvre. Le bandeau rouge « Non enregistré — touchez pour en savoir plus » est justement fait pour être touché.

**Scénario** :
1. La couche radiale attend « QUI A LANCÉ ? ».
2. La personne touche le bandeau rouge : `openSheet` cache la couche, mais `pending` reste.
3. « Fermer » ferme la feuille de synchronisation.
4. ↶ ne fait rien (`undo()` sort si `pending`), FIN PÉRIODE non plus (3513), les pastilles des changements non plus (2585).
5. Pire : TERMINER reste possible, car `openFinishMenu` ne teste que `radialBusy()`, désormais faux. On peut donc terminer la période à la main, et « Annuler » du message (`undoPeriodEnd` → `undo`) ne fait alors rien.

L'état se répare au geste suivant sur le terrain (`beginEvent` écrase `pending`) ou en revenant sur l'écran de match (`reopenMatchSheets`, car `radialPendingRef === pending`). Aucune donnée enregistrée n'est fausse, mais l'action saisie est perdue en silence.

**Correction** : dans `openSyncSheet`, `if(radialBusy()) return;`, comme `openNavMenu` (2064). Variante plus générale : `openSheet` appelle `cancelPendingEvent()` quand il cache une couche radiale qui servait `pending` et que la feuille ouverte n'appartient pas à la saisie. C'est plus risqué, car `pickReprise` et `openDuelStartSheet` ouvrent légitimement une feuille par-dessus.

### N4 (mineur) : FIN PÉRIODE sans garde contre le second appui

**Lieu** : `endPeriodByLeader()`, 3512-3521 ; bouton `mb-periode` du téléphone, 2554 ; bouton `.icon-btn.periode` de la tablette, 2540.

LIS-1 (F28) a posé `undoBlockedUntil` sur ↶ (`undoTap`), ⌂ (`goHome`, 2281) et TERMINER (`finishBarTap`, 3404). FIN PÉRIODE (formats libres) n'a pas cette garde. Quand un seul meneur se détache, la période se termine immédiatement, sans feuille de confirmation (3517-3520).

**Scénario** : sur téléphone, en format libre et en mode feuille, la personne appuie sur « Annuler cette saisie » (le registre note que ce bouton occupe la zone de la barre). Le second appui tombe sur « Fin pér. » et la période se termine. C'est rattrapable avec « Annuler » du message, après 400 ms, ou avec ↶ plus tard ; aucune perte. Je n'ai pas mesuré si le bouton tombe exactement sous « Annuler cette saisie » (supposé).

**Correction** : une ligne en tête de `endPeriodByLeader` : `if(Date.now() < undoBlockedUntil || radialBusy()) return;` (ou un `periodBarTap()` sur le modèle de `finishBarTap`).

### N5 (mineur) : le terrain ne traite pas `pointercancel`

**Lieu** : 3062-3093. Il n'y a d'écouteur `pointercancel` que sur la feuille (2716) et sur le bouton à maintenir (2782).

Quand iOS interrompt un geste (balayage depuis le bord, rejet de paume, alerte système), `dragging` reste vrai, `dragGeom` reste figé et la flèche reste dessinée jusqu'au `pointerdown` suivant. Je n'ai vu aucun cas qui crée un événement faux : le `pointerup` suivant passe toujours par un `pointerdown` du terrain, et le `pointerdown` de la couche radiale est stoppé (2889). Avec un trackpad ou un Apple Pencil en survol, en revanche, `pointermove` continue de redessiner la flèche (supposé).

**Correction** : `field.addEventListener('pointercancel', ()=>{ dragging=false; dragGeom=null; dragLayer.innerHTML=''; })`. À faire avant TERRAIN, qui touchera ce bloc.

### N6 (mineur) : `restoreLocalBackup` remplace `S` sans garde

**Lieu** : 1868-1882.

Contrairement à `resumeMatch` (2249-2260) :
- pas de test `hasUnsavedWork()` sur le match vivant (R19) ;
- pas d'`abandonPeriodEndWait()` ;
- `pending` n'est pas remis à zéro.

`backupChecked` empêche de recalculer l'encart, si bien que « Récupérer ce match » peut rester affiché à l'accueil après qu'on a joué un autre match.

**Scénario** : le match X est joué alors que le stockage est en erreur, et son écriture n'est pas confirmée. Retour à l'accueil, puis « Récupérer » du match Y : `S = Y`, et le réessai de X écrit désormais Y. La copie locale de X n'est pas effacée (elle ne l'est qu'après un succès), donc X se récupère au redémarrage suivant : pas de perte définitive, mais c'est la situation que R19 voulait éviter pendant la session.

**Correction** : sortir de `resumeMatch` une fonction `peutRemplacerS()` (garde R19, `abandonPeriodEndWait`, `pending = null`) et l'appeler depuis `resumeMatch`, `restoreLocalBackup` et `startMatch`. `startMatch` n'est pas protégé non plus : c'est le constat connu « NOUVEAU match » de l'audit #13.

### N7 (mineur) : une annulation non écrite n'est jamais proposée au démarrage

**Lieu** : `checkLocalBackups`, 1848-1849 : `history.length >= serveur.history.length`.

**Scénario** : ↶ (historique de 10 à 9), l'écriture échoue, puis l'app est fermée. La copie locale est plus récente mais plus courte : elle n'est pas proposée. Au rechargement, l'action annulée réapparaît. La copie reste gardée sans être proposée (même famille que R15-C). REDO multipliera ces cas (↶ ↶ ↷).

**Correction** : comparer seulement `updatedAt`, et afficher l'écart signé (« 1 action de moins que la version enregistrée »).

### N8 (mineur) : REPRENDRE sur un match tout juste terminé

**Lieu** : `resumeMatch`, 2267 ; `findResumableMatch` (2102) lit `MATCHES_DB`.

`finishMatchNow` pose `S.status = 'completed'` puis appelle `save()`. Tant que l'écriture n'est pas confirmée (stockage en erreur), le match reste `in_progress` dans `MATCHES_DB` (supposé : la base n'est mise à jour qu'à la confirmation de l'écriture). La bannière REPRENDRE s'affiche donc. `resumeMatch` garde `S`, parce que `S.id === record.id`, et ouvre l'écran d'un match terminé : terrain inerte, ↶ désactivé, aucune explication.

**Correction** : dans `resumeMatch`, `if(S && S.id === record.id && S.status !== 'in_progress') return;`, ou faire lire à `findResumableMatch` le `S` vivant quand c'est le même identifiant.

---

## Déjà connus, confirmés (une ligne chacun)

- **F26 (reste) et E5** : `finishPeriod` compte la période (3349) et `fin_periode` entre dans l'historique (3348) **avant** la remise à zéro différée (3365-3376). Tout `save()` dans la fenêtre (`setAdvancedPlayer` 2418 en phase « detail », minuteur de réessai, `online`) écrit l'état intermédiaire. Pour `fin_periode`, `reopenMatchSheets` ne répare rien (3008) : la période reste comptée sans avoir avancé. **Correction simple** : dans `reopenMatchSheets`, traiter aussi `last.type === 'fin_periode' && b.period === S.period` en appelant `showPeriodEnd(details.winner, S.eliminated)` sans recompter. **Correction de fond** : appliquer la remise à zéro à `S` tout de suite (période, scores, possession) et ne différer que l'affichage, avec les valeurs capturées. Tout `save()` écrit alors un état cohérent, ↶ marche toujours par `before`, et le bloc F26 de `reopenMatchSheets` ne sert plus qu'aux anciens états enregistrés.
- **F42** : à la lecture, Annuler pendant la fenêtre d'une reprise C24 restaure `before.periodWins`, ce qui est juste malgré la décrémentation de 3009 (supposé : non joué). L'état suspendu d'avant C24 n'est réparé que pour `lancer` et `faute_directe` (3008).
- **Audit #13, minuteur de fin de période qui modifie le `S` courant** : `abandonPeriodEndWait` (1963) ne coupe pas `periodEndTimer`. Correction : y ajouter `clearTimeout(periodEndTimer); periodEndTimer = null;`. Attention à `navHome`, qui l'appelle ; le message est de toute façon refermé par `closeSheet`.
- **Audit #13, réessai perdu en consultation d'archive** : `save()` sort à 1759 avant d'avoir rien écrit, puis `scheduleRetry` n'est plus rappelé. Voir N1 pour un correctif commun.
- **Audit #13, NOUVEAU match non protégé** : `startMatch` (2466) remplace `S` sans garde R19. Voir N6.
- **Audit #13 et D2, second appui d'un double appui sur le terrain** : le `pointerdown` du terrain (3064) teste `classList.contains('open')`, mais pas `closing` ni `undoBlockedUntil` ; la couche radiale se ferme en 120 ms après Annuler ou le voile (2868). **Correction simple** : ajouter `if(Date.now() < undoBlockedUntil) return;` au `pointerdown` du terrain (400 ms après tout appui de feuille, de fond ou de couche). Cela couvre D2 et le constat #13 en une ligne. Il faut vérifier que C21 6(d) et 6(l) et le fuzz restent verts : un geste légitime moins de 400 ms après un choix serait ignoré, mais l'éclair de 550 ms le bloque déjà.
- **F43-B** : le geste est figé par `fieldGeom` ; le dessin de la flèche (`drawDrag`) reste décalé si le bandeau apparaît pendant le geste. C'est connu et consigné.

---

## Propreté

- **P1** : code mort dans `commitEvent`, 3119-3124 (un `if` vide, « h2h derived on read »).
- **P2** : `save(isRetry)` : le paramètre n'est jamais lu (1758). `playerPickTeam` est écrit (3179) et jamais lu, ni dans l'app ni dans `tests/`.
- **P3** : `checkPeriodState` 3323-3325 et 3337. `awardFaultPoints` n'est appelé que depuis `applyFault` et `applyResult`, toujours avec `pending`. Donc `finishPeriod(winner)` à 3337 est inatteignable, et `openDuelStartSheet()` à 3324 (lancer éliminant) est rouvert aussitôt par `applyResult` (3276) : double rendu, avec un ↶ calculé avant le `push`.
- **P4** : ouvertures en double. `startMatch` ouvre « QUI COMMENCE AU BALLON ? » deux fois (2501 par `reopenMatchSheets`, puis 2503). `restoreLocalBackup` appelle `renderScoreboard()` après `navTo('match')`, qui le fait déjà.
- **P5** : gardes dispersées et inégales. Chaque point d'entrée compose sa propre liste parmi `status`, `viewingArchive`, `pending`, `awaitingInitial`, `awaitingDuelStart`, `periodEndBusy()`, `radialBusy()` et `undoBlockedUntil` :
  - `goHome` : périodes, rebond, radial ;
  - `openFinishMenu` : statut, périodes, radial, sans rebond (porté par `finishBarTap`) ;
  - `endPeriodByLeader` : sans radial ni rebond (N4) ;
  - `openStats` : périodes seulement ;
  - `openLineupSheet` : sans rebond.
  
  N3 et N4 viennent de là. Proposition : une seule fonction `barreLibre({rebond:true})` appelée par chaque bouton du ruban et de `#matchBar`. C'est le prérequis le plus utile pour ↷.
- **P6** : `lineupSheetTeam` reste posé quand la feuille des joueurs est fermée par le fond (`closeSheetIfDismissable` → `closeSheet`, pas `closeLineupSheet`). C'est sans effet aujourd'hui (seule cette feuille a des `.sub-tok`), mais c'est un piège pour qui lira `lineupSheetTeam` comme « la feuille est ouverte ».
- **P7** : `matchRecapHTML` (3429) compte `reprise` comme une action et ignore `fin_periode`, alors que `TYPES_ACTION` (2088) fait l'inverse. Le récapitulatif « Actions enregistrées » ne suit pas la définition unique de R15 (proche de R15-B).
- **P8** : invariant de navigation. `resumeMatch` (2268) et `startMatch` (2500) écrivent `navStack = ['home']` directement, et `navSwap` existe hors de la liste de CLAUDE.md. L'affichage passe bien par `showOnly`, donc l'invariant tient pour l'écran visible. Il vaut mieux écrire « pile modifiée seulement dans la section NAVIGATION » ou ajouter un `navReset()`.
- **P9** : invariant sur le bouton d'annulation. Aux étages « résultat » et « faute » (feuilles 3139, 3227, 3151 ; couche 2919, 2935), « Annuler cette saisie » appelle aussi `cancelPendingEvent()`, ce qui est correct puisque `pending` existe. CLAUDE.md et `docs/saisie.md` (§ ↶ réarmé) ne citent que l'étage « joueurs ». Formulation à corriger : « tant qu'une saisie est en cours (`pending`), tout bouton d'annulation appelle `cancelPendingEvent()` ».

Les autres invariants sont respectés dans le périmètre :
- `S` : aucun état d'interface. Toutes les affectations `S.x =` sont des champs de jeu ou de méta du match ; `periodEndWait`, `flashTimer`, `pending`, `subDrag` et `radial*` sont des variables de module.
- Points : aucun point sans événement. Le seul chemin est `awardFaultPoints`, suivi de `commitEvent` ; `chooseInitialPossession` et `chooseDuelStart` changent la possession sans point.
- Suppressions : elles s'écrivent toutes `deleted:true`.
- `escapeHtml` : appliqué aux noms dans les feuilles, la couche radiale et les attributs (`data-pid`, `title`, `aria-label`).
- `FAULTS` : inchangé, affiché par `faultLabel`.

---

## R. Risques pour REDO (pile ↷)

1. **L'état « après » n'est stocké nulle part.** `undo()` restaure `ev.before`, mais plusieurs transitions changent `S` hors de l'historique : `chooseInitialPossession`, `chooseDuelStart`, la remise à zéro de période dans le minuteur (3367-3375), et `setAdvancedPlayer`, qui modifie `ev.details` en place. Rejouer l'événement ne redonne donc pas l'état d'avant ↶. Il faut empiler `{ev, after: snapshotBefore()}` **avant** le `pop` et rétablir par `S.history.push(ev); Object.assign(S, after)`.
2. **↶ pendant la fenêtre de fin de période** (éclair, détails, message) coupe les minuteurs dans un état intermédiaire : période comptée, scores au seuil. Un ↷ qui restaure cet « after » laisse un match au seuil sans minuteur, que seul `reopenMatchSheets` répare au prochain retour sur l'écran. Il faut, soit appliquer la remise à zéro tout de suite (voir F26/E5 ci-dessus, et c'est la vraie simplification), soit relancer `showPeriodEnd` après ↷ quand l'« after » est au seuil.
3. **Vider la pile à chaque action** demande de toucher cinq endroits qui écrivent l'historique (`commitEvent`, `applySub`, `commitLineupDefinition`, `finishPeriod(manual)`, et `setAdvancedPlayer` si on le traite comme une action), plus `chooseInitialPossession` et `chooseDuelStart`. Je conseille de centraliser l'écriture de l'historique dans une fonction `pushHistory(ev)` qui vide la pile ↷.
4. **Gardes** : ↷ aura besoin exactement des gardes de ↶, plus `pending`, et du réarmement contre le rebond (N2) : il faut passer par une fonction de garde commune (P5). La pile doit aussi être vidée par `resumeMatch`, `startMatch`, `restoreLocalBackup`, `discardMatch` et `viewArchivedMatchStats` (remplacement de `S`), pas seulement au rechargement.
5. `undoLineupChange` appelle `undo()` puis rouvre la feuille : un ↷ dans cette feuille devra suivre le même schéma.

## T. Risques pour TERRAIN (nouveau tracé)

1. Les coordonnées normalisées viennent de la boîte de `#field` (`fieldGeom` : `getBoundingClientRect` pour le centre, `offsetWidth` et `offsetHeight` pour la taille ; `fieldPoint` : `nx = x/w`). Les zones et la heat map, qui ne changent pas, découpent [0,1] en tiers (`zoneIndex`, 5221). Le carré dessiné, sa grille aux tiers et son liseré doivent donc couvrir **exactement** la boîte de `#field`. Pas de `padding`, de `border` ni de `transform: scale` sur `#field` : `offsetWidth` inclut la bordure, alors que le dessin serait à l'intérieur. Dessiner dans le SVG existant (1123), avec `preserveAspectRatio="none"` et le `viewBox` 400×400, ou dans `#gridLayer`.
2. L'ancien SVG trace des lignes à 72/400 (0,18) et 328/400 (0,82) qui ne sont **pas** les tiers des zones (0,333 et 0,667). Le nouveau tracé aux tiers corrige donc un écart visuel avec les zones des statistiques ; à signaler à l'utilisateur, car les lancers ne « tombent » plus visuellement dans les mêmes cases qu'avant.
3. Les enfants de `#field` (`#gridLayer`, `#dragLayer`, les étiquettes, `#radial`) et les menus radiaux, placés avec `field.offsetWidth` et `offsetHeight` et bornés à 8 px des bords, supposent que la couche couvre toute la boîte. Des coins arrondis avec `overflow:hidden` sur `#field` couperaient les menus dans les coins : C21 vérifie les quatre coins.
4. Traiter N5 (`pointercancel`) avant, puisque TERRAIN touche le même bloc.

## Ce qui n'a pas été vérifié

- Aucun banc ni aucune suite joués.
- N1 : je n'ai pas vérifié quelles versions publiées utilisent encore le stockage serveur.
- N4 : la position exacte de « Fin pér. » sous « Annuler cette saisie » n'a pas été mesurée.
- N8 : je n'ai pas vérifié quand `MATCHES_DB` est mis à jour en mode local.
