# Brief C21 — Saisie près du doigt : menu radial (vague 4)

Codeur : agent Sonnet 5.5, seul sur `index.html`. Dépôt `/home/claude/kinball-stats`, branche `vague-4-c21` (créée depuis `main`, après la fusion de la vague 3, site 2026-10-04.11). Ne pousse rien, ne touche pas `main`. Lis d'abord `tests/README.md`, puis les fonctions citées ci-dessous (`grep`). Écris ton rapport dans `rapports/C21-rapport.md` (hors dépôt : `/home/claude/rapports/`).

## Ce que l'utilisateur a validé (maquette essayée au doigt le 2026-10-05)
Maquette de référence (à ouvrir : `/tmp/claude-0/-home-claude/18ae718e-95c9-510e-a4b7-2aa9373dcea9/scratchpad/maquette-c21.html`, ou l'artifact privé `https://claude.ai/artifact/52kjtsmTHmh8B664DbvYRe`) : le mode « Radiale », DÉF ILL « dans les zones d'équipe », type de faute « près du doigt » est **exactement** le comportement voulu.

**Lancer** (glisser) :
1. Glisser sur le terrain (frappe et direction) : inchangé (`pointerdown` / `pointermove` / `pointerup` du terrain).
2. Au relâchement, **près du point où le doigt s'est levé** (pas en feuille du bas), une rangée par équipe adverse encore en jeu : `ATTRAPÉ | ÉCHAPPÉ | DÉF ILL` (DÉF ILL plus étroit, à côté). Mêmes couleurs d'équipe qu'aujourd'hui, liseré blanc pour Noir, voile sur ÉCHAPPÉ et DÉF ILL. En duel : une seule rangée.
3. **ATTRAPÉ ou ÉCHAPPÉ seulement** : menu radial des joueurs de l'équipe qui attaque : 4 disques en diagonale (−135°, −45°, 45°, 135°, rayon ≈ 84 px, disques ≥ 56 px) autour d'un « ? » central (joueur inconnu), **centré sur le bouton touché** à l'étape 2. **DÉF ILL termine sans joueur** (comme aujourd'hui).
4. Équipe sans alignement complet (`players.length !== LINEUP_SIZE`) : **aucun menu radial des joueurs** ; la saisie se termine au choix du résultat, comme `askPlayer` le fait déjà (`cont(null)`).

**Faute** (appui sans glisser, < 15 px) :
1. Près du doigt : les 8 types de faute (grille 2 × 4, `FAULTS`, libellés `faultLabel`) plus **REPRISE DE JEU** (aucun point, qui repart : choix d'équipe, comme `pickReprise`) et **Annuler**.
2. Puis le menu radial des joueurs de l'équipe en possession, avec **FAUTE D'ÉQUIPE** en plus du « ? » (bouton large sous le « ? », comme dans la maquette). Sans alignement : pas de menu radial.

Les menus restent **entiers dans le terrain** : le centre est ramené dans le cadre (marge = rayon + moitié d'un disque ; les rangées d'équipe et la grille de fautes sont décalées pour rester entières), comme dans la maquette.

## Principes d'architecture (obligatoires)
- **Aucune règle du jeu ne change.** Les boutons radiaux appellent **les mêmes fonctions** qu'aujourd'hui : `pickResult(team, caught)`, `pickDefIll(team)`, `pickFault(f)`, `pickReprise()`, `applyReprise(team)`, `choosePlayer(id)`, `cancelPendingEvent()`. `applyResult`, `applyFault`, `commitEvent`, `snapshotBefore`, `checkPeriodState`, `finishPeriod`, `undo`, le bloc `WP` ne sont **pas modifiés**. Seule la **présentation** de `showResultMenu`, `showFaultMenu` et `askPlayer` change (un affichage radial à la place de la feuille du bas) ; les messages éclair, la feuille « qui reprend le ballon » (duel), « qui repart au ballon » (reprise : peut rester une feuille ou devenir radiale, au choix du codeur, mais **justifie-le**), la question du receveur en mode avancé, la fin de période, TERMINER restent des feuilles.
- **Un couche radiale unique** : un élément `#radial` enfant du **conteneur du terrain** (pas de `body`), donc dans le **même repère que `fieldPoint()`** y compris sous le verrou portrait du téléphone (`uiRotation` ±90°). Le centre se calcule avec `fieldPoint(e)` (`x`, `y` locaux au terrain), **jamais** avec un nouveau lecteur de `clientX/clientY`. Le centre du menu des joueurs est le centre du bouton touché, lu dans ce repère (pas dans l'écran).
- **Réglage d'appareil, hors `S`** : « Saisie en match : Radiale (près du doigt) / Feuille du bas ». Valeur dans `localStorage` (clé `kinball.saisie`, valeurs `radiale` | `feuille`, lecture et écriture sous `try/catch`), **défaut `radiale`**. Le choix est fait à l'ouverture du menu (donc changer de réglage ne casse aucune saisie). `S`, `snapshotBefore`, `freshState`, `save()`, l'export ne reçoivent aucun champ. Où le placer : à côté du réglage existant du mode de saisie (direct / avancé, `setCaptureMode`) ou, à défaut, dans l'écran Sauvegarde / Données : le plus petit changement qui reste trouvable ; dis lequel et pourquoi.
- **Mode `feuille` = comportement actuel à l'identique** (octet pour octet des feuilles : mêmes `onclick`, mêmes classes). C'est ce mode que le banc existant utilise : `tests/lib.mjs` ajoute un script d'initialisation qui écrit `kinball.saisie = 'feuille'` avant le chargement de la page, sauf si `launch(gabarit, { saisie: 'radiale' })`. Ainsi **les 380 vérifications existantes ne changent pas**.
- **Les boutons radiaux portent le même attribut `onclick`** que leurs équivalents de feuille (`pickResult('Gris',false)`, `pickDefIll('Gris')`, `pickFault('APPEL')`, `choosePlayer('Bleu_p1')`, `choosePlayer('')`, `choosePlayer('__equipe__')`, `pickReprise()`, `cancelPendingEvent()`), pour que les aides du banc (`clickSheet(call)`) puissent les trouver : adapte `clickSheet` / `settle` / `_pickPlayer` pour accepter `#radial` en plus de `#sheet`.

## Garde-fous de saisie (le piège de ce chantier)
La saisie en direct passe avant tout. Les couches radiales **ne sont pas** `#sheet` : elles n'héritent donc d'aucune protection de C22B. Reprends-les **explicitement** :
1. **Aucun appui fantôme sur une couche qui se ferme** : classe `closing` sur `#radial` (même durée que `SHEET_CLOSE_MS`, contenu `pointer-events:none`) ; gardes `if(!pending) return` déjà présentes dans les fonctions appelées.
2. **Anti-double-appui** : le menu apparaît **sous le doigt qui vient de se lever** ; un second appui au même endroit en moins de `SHEET_DOUBLE_MS` (300 ms) et `SHEET_DOUBLE_PX` (32 px) est avalé, d'un étage à l'autre aussi (le menu des joueurs apparaît centré sur le bouton qu'on vient de toucher : un double appui ne doit pas choisir un joueur). Réutilise les constantes et la même fenêtre glissante que l'écouteur de `#sheet` ; ne duplique pas la logique si tu peux la partager sans modifier le comportement de `#sheet`.
3. **Appui sur le fond de la couche (voile)** = `cancelPendingEvent()` (aucun point, aucun événement), **sauf** à l'étage des joueurs, où le voile ne fait rien (une action a déjà un résultat choisi : on passe par « ? » ; ↶ reste atteignable). Un bouton « Annuler » explicite aux étages « résultat » et « type de faute ». Dis dans le rapport si ce choix te paraît mauvais.
4. **↶ doit rester atteignable** : la couche radiale ne recouvre que le terrain (pas le ruban de pointage, pas `#matchBar` du téléphone). Si elle les recouvre, c'est un défaut.
5. **Verrous existants** : le `pointerdown` du terrain refuse déjà pendant une feuille ouverte, `awaitingInitial` / `awaitingDuelStart` et `periodEndTimer` ; il doit aussi **refuser pendant qu'une couche radiale est ouverte** (sinon un glisser sous la couche ouvre un second événement). `openLineupSheet` ne doit pas s'ouvrir pendant une saisie radiale.
6. **Entrée dans l'écran** : `reopenMatchSheets()` (C24) ne doit pas laisser une couche radiale orpheline : au retour sur l'écran de match, une couche radiale ouverte est fermée ou nettoyée avec son `pending` (décide et prouve : l'état d'une saisie en cours n'est de toute façon pas enregistré).
7. **Aucun point sans événement** (F20) : aucun appel à `awardFaultPoints` en dehors de `applyResult` / `applyFault`.

## Détails de présentation
- Boutons d'équipe : hauteur ≥ 56 px sur tablette, ≥ 48 px sur téléphone ; largeur totale d'une rangée ≈ 300 px (tablette), ≤ largeur du terrain − 16 px (téléphone) ; DÉF ILL ≥ 56 px de large ; texte sans débordement (même vérification que C20·1).
- Disques de joueurs : nom du joueur (tronqué proprement, `escapeHtml` partout), couleur d'équipe, liseré blanc pour Noir ; « ? » gris avec `aria-label="Joueur inconnu"`.
- Voile sombre translucide sur le terrain pendant la couche ; animation d'apparition courte, désactivée si `prefers-reduced-motion`.
- La rangée DÉF ILL garde le contraste de C20 ; ne règle pas F41 ici sauf si tu le mesures.

## Tests (obligatoires)
`tests/scenarios/C21.mjs` (tablette et téléphone, mode radial, avec et sans animation) :
1. Lancer : rangées d'équipe près du point de relâchement, dans le cadre du terrain, y compris relâchement près de chaque bord et coin ; libellés, appels, tailles, aucun débordement ; duel (une rangée) ; Noir (liseré).
2. ATTRAPÉ / ÉCHAPPÉ avec alignement : menu radial centré sur le bouton touché, 4 disques + « ? » dans le terrain, joueurs corrects ; le résultat final (S, joueur, points, possession) est **identique** à celui du mode feuille pour les mêmes gestes (comparaison profonde contre le mode `feuille`, en retirant `ts`/`by`).
3. DÉF ILL : aucun menu de joueurs, événement identique à celui du mode feuille.
4. Sans alignement : aucun menu radial des joueurs.
5. Faute : grille des 8 types, REPRISE DE JEU, Annuler ; puis menu radial avec FAUTE D'ÉQUIPE ; `fault_scope:'equipe'` correct ; reprise de jeu : même événement que le mode feuille.
6. Garde-fous : (a) appui sur un bouton pendant la fermeture (animation, vrais appuis aux coordonnées) : aucun effet ; (b) double appui au point de relâchement et au centre du menu des joueurs : un seul choix ; (c) voile : annule sans événement aux étages résultat et faute, sans effet à l'étage des joueurs ; (d) un `pointerdown` sur le terrain pendant la couche ne crée rien ; (e) ↶ atteignable par un vrai appui pendant chaque étage ; (f) fin de période et élimination par un lancer saisi en radial : mêmes états qu'en feuille (`periodWins` une fois, duel proposé) ; (g) retour accueil → match pendant une couche radiale : aucun état résiduel.
7. Verrou portrait du téléphone (`uiRotation` ±90°, viewport simulé) : menus placés au bon endroit (rectangles comparés au rectangle du terrain), clics aux coordonnées réelles.
8. **Contrôle négatif** : `KINBALL_HTML=<fichier d'avant>` (copie de `index.html` avant ton travail, dans `KINBALL_AVANT`, nom `kinball.C21.avant.html`) doit faire échouer C21.
9. **Non-régression** : un match scénarisé en mode `feuille` donne le même `S`, la même export et le même nombre de `save()` que la référence ; **mêmes gestes en mode radial** : `S` et export identiques à ceux du mode feuille.
10. `tests/fuzz.mjs` : une exécution supplémentaire en mode radial (mêmes graines que le mode feuille, mêmes invariants, DÉF ILL comprises) ; `smoke`, `undo` et `C20` rejoués en mode radial.
11. README : section C21 (réglage, variable `saisie`, commande du contrôle négatif).

## Vérifications avant de rendre
- **Machine à 2 cœurs : un seul banc à la fois ; une commande d'outil dure au plus 10 minutes.** Lance le banc complet **en arrière-plan** (`(KINBALL_AVANT=/home/claude/avant setsid nohup node tests/run.mjs > /home/claude/banc-C21.log 2>&1 < /dev/null &)`, jamais `pkill -f tests/run.mjs` qui tue ton propre shell) et lis le journal par `sleep` + `tail` de moins de 10 minutes. Banc complet **une fois avant** ton travail (la référence : 397/400 attendu, `M04·8` rouge tant que la version n'est pas écrite, C13B·11 et ·13 rouges sous charge : les rejouer seuls) et **une fois après**. `KINBALL_ONLY=C21,C20,C22,C23,C24` avec `KINBALL_ANIM=1`, puis avec `KINBALL_ANIM=1 KINBALL_TIMESCALE=1`. `node sim/simtest.mjs`, `tests/local/*.test.mjs` (kblocal, resync, collecte). **Ne lance pas `check-release --ecrire`** (je le ferai) ; lance `node outils/check-release.mjs` pour voir l'écart, attendu.
- `git diff main -- index.html` doit rester dans : CSS de la couche radiale, `showResultMenu` / `showFaultMenu` / `askPlayer` (présentation), le `pointerdown` du terrain (une garde), `openLineupSheet` (une garde), `reopenMatchSheets` (nettoyage), le réglage d'appareil. Tout autre bloc modifié est à justifier dans le rapport.
- Regarde toi-même des captures tablette et téléphone (mode radial) à chaque étage, près du centre et près d'un coin, Noir inclus.
- Commit : **un seul commit** « C21 : menu radial près du doigt » avec les lignes finales :
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` et `Claude-Session: https://claude.ai/code/session_01JNevmYUrD9KGj65WkY4pR4`. Ne pousse pas.

## Rapport (`/home/claude/rapports/C21-rapport.md`)
Résultat de chaque critère, résultats du banc avant / après, du contrôle négatif, des modes animés, `diff` par bloc, choix faits (emplacement du réglage, feuille de reprise, voile), écarts au brief, captures regardées, limites (essais iPad restants), questions pour l'utilisateur.

## Hors périmètre
Règles du jeu, fin de période (F26, F33, F38), mode avancé (question du receveur), feuille des changements, calibration du % de victoire, DÉF ILL en bouton fixe (écarté par l'utilisateur), F39 à F42.
