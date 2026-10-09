# Plan de la vague 3 : saisie en match (C24, C20, maquette de C21)

Écrit le 2026-10-04 en session de planification (Opus 5.5), approuvé par l'utilisateur. **Rien n'a été exécuté** : aucun fichier du dépôt modifié, aucune branche créée, rien de poussé. L'exécution revient à un autre agent (Sonnet 5.5), qui démarre à froid sur ce document.

Dépôt : `KingMoule/kinball-stats`, branche `main`, commit `78b6b9e` (« M08 : collecte facultative côté app, confidentialité »). Tous les numéros de ligne ci-dessous sont ceux d'`index.html` à ce commit (5 836 lignes) : ce sont des repères, retrouver les fonctions par `grep`.

## 1. Décisions de l'utilisateur (2026-10-04)

| Sujet | Décision |
|---|---|
| Axe et taille de la vague | Saisie en match, vague courte |
| Source du code | **Le dépôt GitHub seul.** `index.html` du dépôt devient la source ; l'artifact claude.ai n'évolue plus. `amont/` reste figé |
| Essais iPad et téléphone (Q25) | Faits, rien à signaler : les réglages par défaut des vagues 1 et 2 sont confirmés (Q14, Q16 à Q24) |
| **Q8**, indicateur attrapé / échappé | **A. Mots** : « ATTRAPÉ » / « ÉCHAPPÉ » en toutes lettres |
| **Q9**, DÉF ILL | Un petit bouton dans le bloc de chaque équipe en défense (l'équipe fautive est celle du bloc touché). **Comme un ballon échappé** : mêmes points, même reprise, le lancer compte (OFF % de l'attaquant, DÉF % de l'équipe fautive), plus la faute |
| C21 (menu radial) | Pas codé dans cette vague : une **maquette** à essayer au doigt. Q10 se tranche après l'essai |
| Livraison | **Une seule PR** pour la vague (`vague-3-saisie` → `main`). Pousser sur `main` met le site en ligne : seul l'utilisateur fusionne |

Choix par défaut du plan, acceptés avec lui :
1. **DÉF ILL sans coordonnées** : la faute survient avant la frappe, le glisser n'a pas de trajectoire réelle. Elle compte partout sauf dans les zones et la heat map.
2. **F %** reste « fautes directes / actions offensives » : une DÉF ILL s'ajoute au total « Fautes » et au tableau par type, pas à F %.
3. **+/- des joueurs** : comme un ballon échappé (−1 pour les joueurs sur le terrain de l'équipe fautive, +1 pour ceux de l'attaquant). Aucun code à écrire : c'est le comportement d'un lancer échappé.
4. **Accès à DÉF ILL** : par un glisser puis le bouton du bloc d'équipe ; l'accès direct fait partie de la maquette de C21.

## 2. Ordre d'exécution et règles

`Étape 0` → `C24` → `C20` → `audit court` → `version du site + PR`. La maquette de C21 est hors dépôt et peut se faire à tout moment.

- Série stricte sur `index.html` : un seul chantier à la fois.
- Machine à 2 cœurs, banc complet d'environ 16 minutes : jamais deux bancs à la fois ; le lancer en tâche de fond avec un délai d'au moins 20 minutes et la sortie dans un fichier journal. Entre deux passages complets : `KINBALL_ONLY=<id>`.
- Banc complet une fois avant et une fois après chaque chantier. On ne démarre pas sur un banc rouge.
- Invariants du projet (voir `claude/orchestrator.md` et `claude/chantiers.md`) : pas de migration des données, `FAULTS` ne change pas, pas d'état d'interface dans `S`, règles téléphone préfixées `.phone`, tout bouton d'annulation placé dans une feuille appelle `undo()` et non `undoTap()`.
- Chaque chantier se termine par un rapport au format du projet (STATUT, CE QUI A CHANGÉ, RISQUES, VÉRIFICATIONS FAITES, À AJOUTER AU GUIDE, QUESTIONS OUVERTES).

## 3. Étape 0 : préparation

1. Cloner le dépôt avec accès en écriture, `git fetch origin main`, créer la branche `vague-3-saisie`.
2. Référence « d'avant » : `git show origin/main:index.html` copié hors dépôt, dans le dossier désigné par `KINBALL_AVANT` (contrôles négatifs et non-régression ; convention de `tests/README.md`). Pour tester une ancienne version : `KINBALL_HTML=<copie à la racine du dépôt>`.
3. Playwright : module global sous `~/.npm-global/lib/node_modules` (ou `NODE_PATH`), Chromium préinstallé ; ne pas lancer `playwright install`. Vérifier d'abord avec `KINBALL_ONLY=smoke node tests/run.mjs`.
4. État de départ, tout doit être vert : `node tests/run.mjs` (complet), `node sim/simtest.mjs`, `node tests/local/kblocal.test.mjs`, `node tests/local/resync.test.mjs`, `node tests/local/collecte.test.mjs`, `node outils/check-release.mjs`.

## 4. Brief C24

```
CHANTIER : C24 — Feuilles de possession rouvertes à la reprise, jeton glissé non coupé, fin de période reprise
OBJECTIF : un match repris pendant « QUI COMMENCE AU BALLON ? » ou « DUEL — QUI REPREND LE BALLON ? »
  retrouve sa feuille ; le jeton glissé du terrain vers le banc reste visible.
CONTEXTE : claude/chantiers.md, fiche C24, constats F29, F35, F26, décisions D74 et D75.
```

**Défaut (F29).** `onEnterScreen('match')` (l. 1813) ne fait que `renderScoreboard()`. Quand on revient sur l'écran de match avec `S.awaitingInitial` ou `S.awaitingDuelStart` vrai, la feuille n'est rouverte nulle part : le terrain et les changements refusent tout, l'écran reste muet. Quatre chemins d'entrée : `startMatch` (l. 2219), `resumeMatch` (l. 2042), `restoreLocalBackup` (l. 1710), `navBack` (l. 1837, qui ferme la feuille juste avant).

**Périmètre.**
- **Volet A.** Nouvelle fonction `reopenMatchSheets()` à côté d'`openDuelStartSheet()` (l. 2613), appelée par `onEnterScreen('match')` après `renderScoreboard()` (une ligne). Si `S.awaitingInitial` : rouvrir la feuille du l. 2272 (`possessionChoiceHTML('QUI COMMENCE AU BALLON ?', ATEAMS(), 'chooseInitialPossession')`, non fermable). Si `S.awaitingDuelStart` : `openDuelStartSheet()`. Ne rien faire si : archive consultée (`viewingArchive`), pas de match en cours, match terminé, `pending` non nul, `periodEndTimer` non nul. Elle lit `pending` et `periodEndTimer`, déclarés par `let` plus bas (l. 2690 à 2692) : ne jamais l'appeler pendant le chargement initial du script.
- **Volet B.** `.sub-pitch{overflow:visible}` (l. 549, une valeur). Le liseré `::before` et le rond `::after` sont à l'intérieur ; vérifier que la géométrie de la feuille au repos est identique à la référence.
- **Volet C (F26), abandonnable.** Dans la même fonction, après les deux cas du volet A : format avec `periodAt`, une équipe en jeu au seuil, aucun minuteur : la fin de période n'a pas été menée à terme avant le rechargement. Si la période est déjà comptée (comparer `S.periodWins[vainqueur]` au `before.periodWins` du dernier événement, même `period`), retirer ce point, puis appeler `finishPeriod(vainqueur)` tel quel. État indécidable (historique vide, `before.period` différent) : ne rien faire. Si les deux états enregistrés ne peuvent pas être prouvés, ou si le banc rougit : retirer le volet et le rapporter ; A et B se livrent seuls.

**Hors périmètre.** `startMatch` (il rouvrira la même feuille dans la même tâche : sans effet, à prouver par `S` et le nombre de `save()` identiques à la référence), `resumeMatch`, `restoreLocalBackup`, `navBack`, `finishPeriod`, `undo`, `openSheet` / `closeSheet`, `openDuelStartSheet`, `chooseInitialPossession`, `chooseDuelStart`, le JS du glisser (C19), le bloc `WP`, les fichiers du site autres qu'`index.html`.

**Critères d'acceptation.**
1. Sur les deux états (`awaitingInitial`, `awaitingDuelStart`), par les trois façons de revenir (`navHome()` puis `navTo('match')` ; retour depuis les stats ; page neuve avec l'état chargé puis « Reprendre »), la feuille est ouverte et le choix fonctionne.
2. Aucune feuille rouverte en consultation d'archive, match terminé, saisie en cours ou fenêtre de fin de période.
3. Démarrage d'un match : `S` et nombre de `save()` identiques à la référence.
4. Jeton glissé visible en entier entre le terrain et le banc, tablette et téléphone (capture regardée).
5. `diff` limité au périmètre.

**Vérifications.** `tests/scenarios/C24.mjs` (tablette et téléphone, avec et sans animation, contrôle négatif : il doit échouer sur la référence) ; banc complet avant et après ; `node tests/local/resync.test.mjs`.

**Risque connu.** `tests/local/resync.test.mjs` (cas 2, « amont façon C24 ») fabrique une fausse version amont qui touche ces mêmes lignes. S'il rougit après C24 : adapter ses lignes d'exemple à d'autres lignes d'`index.html`, sans affaiblir ce qu'il vérifie, et le signaler dans le rapport.

## 5. Brief C20

```
CHANTIER : C20 — Mots ATTRAPÉ / ÉCHAPPÉ et option DÉF ILL
OBJECTIF : la feuille « RÉSULTAT DE LA FRAPPE » décrit le fait en toutes lettres, et offre une troisième
  option plus petite, DÉF ILL, sans choix de joueur.
CONTEXTE : claude/cahier-des-charges.md (« Fonctionnalités actuelles à modifier », point 1) ;
  claude/chantiers.md, fiche C20, écart E15 ; section 1 de ce document.
```

**Interface** (`showResultMenu`, l. 2806 ; CSS `.opp-block` / `.opp-half`, l. 208 à 242, média l. 614, téléphone l. 740 et 741)
- Dans chaque bloc d'équipe adverse : « ATTRAPÉ » | « ÉCHAPPÉ » à la place de ✓ et ✕, plus un troisième segment étroit « DÉF ILL », visiblement plus petit, séparé par un trait. La couleur du bloc reste celle de l'équipe visée ; le voile de la moitié « échappé » (`.opp-half.miss`) est conservé, y compris sa variante du bloc Noir.
- Les appels `pickResult('<équipe>',true|false)` ne changent pas : le banc s'y accroche. Le nouveau segment appelle `pickDefIll('<équipe>')`, avec une étiquette d'accessibilité « Défensive illégale ».
- Zone d'appui de DÉF ILL d'au moins 44 px dans les deux sens ; rien ne déborde de la feuille sur téléphone (deux blocs à 3 équipes, un seul en duel).

**Saisie** (à côté de `pickResult`, l. 2828 ; `applyResult`, l. 2835)
- `pickDefIll(team)` : mêmes gardes que `pickResult` (`pending`, équipe éliminée), **aucun appel à `askPlayer`**, puis le chemin « échappé » d'`applyResult` avec un paramètre supplémentaire.
- Points, possession (`S.possession = team`), `S.stopped = true`, élimination, fin de période, Annuler : chemins existants d'`applyResult`, inchangés.
- Message éclair « ÉQUIPE • DÉF ILL » ; pas de question du receveur en mode avancé.

**Forme de la donnée** (aucune migration)
- Un événement `lancer` : `attacker`, `result:'échappé'`, `target` = équipe fautive, `situation`, `fault_type:'DÉF ILL'`. Ni `attacker_player_id` / `attacker_player_name`, ni `start_norm` / `end_norm`.
- Pourquoi : tout ce qui lit un lancer échappé le compte déjà correctement (`computeH2H`, `computeOverall`, `computeOffDefByPeriod`, `accumulatePlayerStats` pour le +/-, `wpCountK`, `wpPack`, le moteur, `situationOf`, `phaseOf`), et tous les lecteurs de coordonnées sont déjà gardés par `if(d.start_norm)` / `if(d.end_norm)` (`computeOverall`, `computeZoneStats`, `heatPointsFrom`, cumul d'équipe, `zoneAt`). `sim/simcore.js` et sa copie embarquée ne changent pas. L'export affiche déjà `fault_type` dans la colonne « Type de faute ».
- `FAULTS` (8 codes, grille de la feuille de faute) ne change pas. Ajouts : constante `DEF_ILL = 'DÉF ILL'`, son libellé « Défensive illégale » dans `FAULT_LABELS`, et une liste d'affichage `FAULTS` + `DEF_ILL` pour les tableaux.
- La collecte (`kbcollect.js`, `collecte/Logique.gs`) ne filtre que les noms de joueurs : le nouveau champ passe tel quel, rien à y changer.

**Stats des fautes**
- `computeFaults` (l. 3666) : une DÉF ILL s'ajoute à `faults` et à `types['DÉF ILL']` de l'équipe **fautive** (`details.target`), sous le même filtre de phase ; F % continue de ne compter que les fautes directes au numérateur (compteur séparé).
- Tableaux par type : `sectionMatchFaults` (l. 4474), `openFaultDetail` (l. 4501), `faultTypeAoa` (l. 5136), cumul d'équipe (initialisation l. 5438, comptage vers l. 5497), `sectionTeamFaults` (l. 5589). Sous-titre de l'onglet Fautes complété d'une phrase sur la DÉF ILL.
- `accumulatePlayerStats` (l. 4066) : une DÉF ILL ne gonfle pas le compteur des lancers sans joueur.
- Zones de fautes : une DÉF ILL n'a pas de position, elle n'y figure pas.

**Hors périmètre.** `FAULTS`, `showFaultMenu`, `askPlayer`, `commitEvent`, `checkPeriodState`, `finishPeriod`, `undo`, `openSheet` / `closeSheet`, le bloc `WP`, `sim/`, les fichiers du site autres qu'`index.html`, toute refonte de la chaîne de saisie (C21).

**Critères d'acceptation.**
1. Plus de ✓ ni de ✕ dans la feuille ; libellés lisibles sur les trois couleurs de bloc, tablette et téléphone.
2. DÉF ILL : +1 à chaque autre équipe en jeu, possession à l'équipe fautive, situation arrêtée, événement de la forme ci-dessus, aucune feuille de joueur même avec alignements.
3. Annuler restaure exactement l'état d'avant.
4. Une DÉF ILL qui élimine ouvre la feuille du duel ; une DÉF ILL qui termine la période la termine une seule fois.
5. Stats : OFF %, DÉF %, head-to-head comptent la DÉF ILL comme un échappé ; « Fautes » et « Par type » la montrent pour l'équipe fautive ; F %, zones et heat map inchangés.
6. Export : ligne « Lancer », résultat « Échappé », type de faute « DÉF ILL », zones vides.
7. Un match scénarisé **sans** DÉF ILL donne `S`, les feuilles d'export et le nombre de `save()` identiques à la référence ; un ancien match s'ouvre sans erreur.
8. `diff` limité au périmètre.

**Vérifications.** `tests/scenarios/C20.mjs` (tablette et téléphone, contrôle négatif sur la référence) ; `tests/lib.mjs` : un geste `defIll({from, to, target})` ; `tests/fuzz.mjs` tire aussi des DÉF ILL (le modèle `tests/model.mjs` les traite comme `lancer(target, false)`) ; `tests/README.md` ; banc complet avant et après ; `KINBALL_ONLY=C20,C22,C13B` avec `KINBALL_ANIM=1` puis `KINBALL_ANIM=1 KINBALL_TIMESCALE=1` ; `node sim/simtest.mjs`.

## 6. Brief de la maquette de C21

```
CHANTIER : C21-M — Maquette du menu radial près du doigt
OBJECTIF : une page autonome à essayer au doigt sur iPad et téléphone, pour trancher Q10 avant de
  refondre la saisie. Hors dépôt : rien dans index.html, rien dans la PR.
CONTEXTE : claude/cahier-des-charges.md (« Fonctionnalités actuelles à modifier », point 5) ;
  claude/chantiers.md, fiche C21, Q10, écart E14.
```

- Une page HTML autonome, publiée comme artifact privé (pas sur le site).
- Terrain carré avec la grille 3×3 ; glisser = lancer, appui = faute ; données factices (3 équipes, 4 joueurs chacune).
- Menu radial au point de contact : 4 joueurs autour, « ? » au centre ; puis les zones d'équipe « ATTRAPÉ / ÉCHAPPÉ » juste à côté du dernier contact.
- Variantes à comparer par un sélecteur : accès à DÉF ILL sans passer par le menu (bouton fixe sur l'écran, ou dans les zones d'équipe) ; menu radial aussi pour « qui a fait la faute ? » (avec FAUTE D'ÉQUIPE) ; comportement près des bords de l'écran.
- Un compteur de gestes et de temps par saisie, et le mode actuel (feuille du bas) pour comparer.
- Livrable : le lien de la page et la liste des questions de Q10 auxquelles l'essai doit répondre. Le brief de C21 s'écrit après le retour de l'utilisateur.

## 7. Audit court, version du site et PR

1. **Audit** par un agent distinct, qui ne modifie rien : critères de C24 et de C20 revérifiés ; non-régression des données contre la référence sur 9/11, 11/13 et Duel 11 (`S`, événements, `computeOverall` / `H2H` / `Faults`, feuilles d'export, nombre de `save()`) ; suites touchées avec animation et vrais délais ; captures tablette et téléphone regardées. Verdict LIVRABLE / NON LIVRABLE ; un bloquant ouvre un correctif avant la PR.
2. **Version** : `node outils/check-release.mjs --ecrire`, puis `node outils/check-release.mjs` doit passer (le déploiement Pages le relance).
3. **PR** : commits « C24 : … », « C20 : … », « Version du site » ; `git fetch origin main` avant de pousser ; une PR `vague-3-saisie` → `main` avec le résumé, les résultats des bancs et les points à confirmer. Jamais `--force`, jamais de poussée directe sur `main`. **L'utilisateur fusionne.**

## 8. Vérification de bout en bout

- Banc complet vert avant et après chaque chantier ; `simtest`, `kblocal.test`, `resync.test`, `collecte.test`, `check-release` verts.
- Contrôles négatifs : `C24.mjs` et `C20.mjs` échouent sur la référence là où il faut.
- `git diff origin/main -- index.html` limité aux zones déclarées.
- Après la fusion : l'action Pages passe ; sur l'iPad, l'accueil propose « Mise à jour prête ».

## 9. Documents à mettre à jour en fin de vague

- Projet : `claude/chantiers.md` rév. 9 (Q8 et Q9 résolues, Q25 close, source = dépôt, C24 et C20 terminés, PUB-2 / PUB-3 sans objet depuis la migration, nouveaux constats), `claude/handoff.md`, sections du guide touchées.
- Dépôt : `MIGRATION.md` (le dépôt est la source ; `amont/` reste figé comme dernière version issue de l'artifact, `check-release` continue de s'y référer ; `resync` ne sert plus qu'en secours).

## 10. Ce qui reste hors de cette vague

- C21 (refonte de la saisie), après l'essai de la maquette.
- Transition de fin de période (F26 reste, F33, F38), à regrouper avant C21.
- Nom d'équipe non échappé dans l'étiquette de colonne de `sectionMatchFaults` (défaut signalé par la migration) : désormais corrigeable directement dans le dépôt ; à prendre avec C12 lot 1.
- Calibration du % de victoire (F7), fiche joueur (C04), export multi-matchs (C08), contrôles non faits par AUD-2 (F37).
