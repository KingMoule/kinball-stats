# Revue 4 : outillage et banc (lecture seule)

Dépôt relu à `261a11b` (main, PR #17 fusionnée). Rien n'a été modifié.

## Ce qui a été lancé

| Commande | Résultat | Durée |
|---|---|---|
| `node outils/check-release.mjs` | OK, version 2026-10-12.5, amont cce95ad2, 20 entrées | < 1 s |
| `node tests/rapide.mjs --liste` | 0 fichier modifié, plan smoke + undo | < 1 s |
| `bash .claude/hooks/test-hooks.sh` | 26 réussis, 0 échec | 1 s |
| `node sim/simtest.mjs` | TOUT PASSE (9 cas) | 5 s |
| `node tests/local/collecte.test.mjs` | 18/18 | 1 s |
| `node tests/local/kblocal.test.mjs` | 63 PASS | 16 s |
| `node tests/local/resync.test.mjs` | 11 PASS (avec `NODE_PATH=$(npm root -g)`) ; 10 PASS, 1 FAIL (cas 8, « Playwright introuvable ») avec le `NODE_PATH` de CLAUDE.md | 6 s |

Remarque d'environnement : dans ce conteneur, Playwright 1.56.1 est sous `/opt/node22/lib/node_modules`, pas sous `/home/claude/.npm-global` comme le disent CLAUDE.md et `kinball-banc`. `tests/lib.mjs:19-23` ne tente que `NODE_PATH` puis `~/.npm-global` : ajouter `npm root -g` en dernier essai éviterait ce faux échec (voir P-6).

## Chiffres du banc

- **638 vérifications, 18 KNOWN** (CI de la PR #15, `docs/chantiers.md:27`), **979 à 1 036 s** de passage complet (17 à 20 min). Deux processus (un par gabarit), puis la phase au calme.
- Somme des poids tablette (`tests/rapide.json`) : 1 166 s. Six suites font 58 % du temps : C21 155 s, C23 138 s, C13B 135 s, C22 96 à 161 s, fuzz 75 s, TFP1 75 s. Ce sont les suites « vrais délais » ou à gestes chronométrés.
- Code de test : 11 120 lignes (banc) + 1 953 (local, simtest), pour environ 8 800 lignes de site (index.html + kb*.js + sw.js). Le ratio est d'environ 1,5.
- **Proportionné ?** Oui pour la couverture : saisie en direct, annulation et perte de données justifient un banc à vrais gestes. **Le temps est à revoir** sur trois postes (R-1 à R-3) : environ 4 min récupérables sans perdre de critère. Le cache par empreinte rend déjà le coût nul pour la documentation et les relances.

---

## 1. Le banc

### B-1 · important · Vérifications à durée réelle non marquées `{ calme: true }`
Seules deux vérifications portent `calme` (`C13B.mjs:522`, `LIS1.mjs:146`). Plusieurs autres affirment une **borne haute de temps réel** et tournent dans la phase parallèle, avec 2 processus (Node + Chromium chacun) sur 2 cœurs :
- `TFP1.mjs:72-74, 91-92, 103` (TFP1·1a/1b/1c) : `L.debut <= 800`, `L.reset <= 2300`, `L.reset - L.debut <= 1700`.
- `TFP1.mjs:133` (TFP1·2a) : `dt >= 1100 && dt <= 1700`.
- `TFP1.mjs:267-276` (TFP1·3e) : un appui « à ≈ 330 ms » doit tomber **dans** la fenêtre de 400 ms. Avec une charge qui retarde le `until` de plus de 70 ms, l'appui tombe après 400 ms, défait la fin de période, et la vérification échoue.
- `C23.mjs:153` (C23·2) : `t >= 600 && t <= 1300` après `atMs(700)` et `tapUndo`.
- `C22.mjs:258` (C22·6b) : un second appui « à d ms » doit tomber dans la fenêtre de double appui. Si la charge l'en fait sortir, ↶ défait une action. C22·4 a déjà échoué sous charge (`run.mjs:89-90`).
- `C21.mjs:340-362` (C21·6b) : `m.click` immédiatement après `m.up`, qui doit être avalé comme double appui. Même sensibilité.

Scénario : sur un exécuteur GitHub partagé, un ralentissement de 100 ms fait rougir TFP1·3e ou C23·2. L'agent relance (« Re-run failed jobs »), ce qui coûte 17 à 20 min parce que le cache n'est pas écrit sur un passage rouge.
Correction : ajouter `{ calme: true }` à TFP1·1a-c, 2a, 3e et C23·2. Chacune ouvre sa propre page dans la vérification (`un()`, `open()`) : le report est sans risque. Pour C22·6b et C21·6b, qui partagent une `app` entre vérifications, il faut d'abord rendre la vérification autonome (voir B-4), puis la marquer.

### B-2 · mineur · ~85 `waitForTimeout` (attentes fixes)
Répartition : C21 27, TFP1 14, C23 12, LIS1 8, C26 7, C24 4, M03 3, C13B 2, C25 2, puis 1 dans C20, C22 (via `sleep`), C27 et `lib.mjs:310` (`tick`).
- **Fragiles dans le sens « trop court »** (l'état attendu peut ne pas être atteint) : `M03.mjs:110,119,158` (300 ms avant de relire la base), `C25.mjs:179` (400 ms « les premiers instantanés sont passés »), `C25.mjs:414` (800 ms), `C26.mjs:139-141`, `C20.mjs:175` (150 ms pour une sauvegarde différée), `C13B.mjs:498`. Le commentaire de ce dernier le dit lui-même : « sous charge, 300 ms ne suffisaient pas toujours ». À remplacer par `waitForFunction` sur une condition observable (compteur de `save()`, `WP.inFlight`, nombre de documents en base).
- **Volontaires** (« rien ne se passe pendant N s ») : `C23.mjs:94` (2 000 ms ×8 par vérification), `TFP1.mjs:118` (3 000), `TFP1.mjs:161` (3 000), `C26.mjs:231,258` (1 800), `C23.mjs:203` (2 300). Ces attentes sont légitimes, mais elles coûtent cher : C23 fait environ 16 attentes de 2 s par gabarit. Avec l'horloge de Playwright (`page.clock.install()` puis `runFor`), on ferait la même preuve en quelques millisecondes. Sinon, on peut réduire le « 2 s plus tard » à « fin du plus long minuteur + 200 ms ».
- `LIS1.mjs:11`, `TFP1.mjs:241`, `C21.mjs:531` : 300 ms après `setViewportSize`. Il faut plutôt attendre `fieldStable()`.

### B-3 · mineur · Redondances qui coûtent du temps
- `C21.mjs:668` rejoue **tout le fuzz** (3 parties, 370 actions) en saisie radiale, sur les deux gabarits : environ 75 s par gabarit, soit la moitié de C21. Proposition : le jouer sur la tablette seulement, ou une seule partie (`duel11`) sur le téléphone.
- C23 §1-2 et TFP1·2c/3a prouvent tous deux « ↶ pendant la fin de période rend l'état exact et stable 2 s », en vrais délais, avec et sans animation pour C23. Une seule suite devrait porter ce critère (TFP1 est la plus récente). C23·1/2 garderait un cas.
- Deux tables de durées : `POIDS` dans `run.mjs:84` (sans C08, C25 à C29, LIS1, R15, R16, TFP1 : 30 s par défaut) et `poids_s` dans `rapide.json`. Il vaut mieux une seule table (`rapide.json`), lue par les deux scripts.

### B-4 · mineur · La phase au calme rejoue tout le module de la suite
`lib.mjs:483-484` : en phase `calme`, les vérifications non `calme` renvoient `true` **sans exécuter `fn`**, mais tout le code hors vérification de la suite se rejoue (lancement du navigateur, préparation). Une vérification `calme` qui dépend de l'état laissé par une vérification précédente (une `app` partagée, comme dans C22 ou C21) s'exécute donc sur un état faux. Le défaut est muet tant que seuls C13B·13 et LIS1 sont marqués.
Correction : documenter la règle « une vérification `calme` prépare elle-même son état » dans `lib.mjs` et `tests/docs/lib.md`. On peut aussi faire échouer bruyamment une vérification `calme` dans une suite qui n'a pas de « `launch` dans la vérification ».

### B-5 · mineur · `rapide.json` incomplet (au-delà de C20, déjà connu)
Vérifié par croisement des imports et usages dans les scénarios :
- Section `JOUEUR DE L'ACTION` (`index.html:3162-3553`). Elle contient le cœur du pointage : `pickFault`, `pickResult`, `awardFaultPoints`, `checkPeriodState`, `finishPeriod`, `undo`. Il y manque **C26** (↶ pendant la fin de période, `C26.mjs:222-258`), **C14** (fondu de l'équipe éliminée) et **C19**.
- Section `CHOIX DU FORMAT` : `renderScoreboard` y vit (`index.html:2519`) mais la règle ne déclenche ni C14, ni C24, ni C23, ni TFP1.
- Section `FORMATS DE MATCH` : `FAULTS` et `faultLabel` y vivent (`index.html:1264`). C08, C15 et C20 manquent (C20 est déjà connu).
- `carte.mjs:43` écarte les sections sans fonction (`MODE DE PRISE DE STATS` 2296, `Constantes` 3578, `REGISTRE DES FAMILLES DE STATISTIQUES` 4581, `HEATMAP` 5341). Leurs lignes sont alors attribuées à la section précédente. Exemple : un diff dans le registre des familles de stats ne déclenche que C16 et C29 (via « Phases d'une période »), pas C15, C18 ni C23. Correction : `rapide.mjs` devrait lire les titres de section lui-même, ou bien `carte.mjs` devrait garder les sections vides avec `--sections`.
- Fichiers : `sim/` → ajouter **C23** (qui vérifie `SIMCORE_SHA`, `C23.mjs:13`). `kbsite.js` → ajouter C25, C27, C28, M05, M11, C13B. `kblocal.js` → ajouter M04, M08. `kbcollect.js|config.js` → ajouter C25, C28, M04. `vendor/` → ajouter C08, C29. `tests/local/*`, `outils/ci-banc.mjs` et `tests/rapide.json` lui-même sont absents de la table (« fichier absent »).
- Un diff de site ne propose jamais `node outils/check-release.mjs` en commande annexe. C'est pourtant la cause n°1 d'un M04·8 rouge en CI (rappelée dans CLAUDE.md et `kinball-banc`). Ajouter `"commandes": ["node outils/check-release.mjs"]` aux règles des fichiers du site et à `index.html`.

### B-6 · mineur · `rapide.mjs` compare à la pointe de `origin/main`, pas au point de départ
`rapide.mjs:41-43` : `git diff --name-only origin/main` compare l'arbre de travail à la **pointe** de main. Si main a avancé depuis la création de la branche, les fichiers changés sur main entrent dans le plan, et les numéros de ligne d'`index.html` sont faux. Correction : `git diff $(git merge-base origin/main HEAD)`.

### B-7 · mineur · Ni `tests/local/*.test.mjs` ni `sim/simtest.mjs` ne tournent en CI
Ils sont verts et rapides (environ 30 s à eux quatre), mais seulement « si tu as touché ce qu'ils couvrent » (`codeur.md:15`). Scénario : un changement de `kblocal.js` casse le cas E6 de `kblocal.test.mjs` (connexion fermée) sans casser M03 ou C27. La CI est verte, l'agent n'a pas lancé le test local, et la régression arrive sur main.
Correction : une étape `banc.yml` après Chromium, hors cache (ou dans l'empreinte, ce qui revient au même) : `node sim/simtest.mjs && node tests/local/kblocal.test.mjs && node tests/local/collecte.test.mjs`.

### B-8 · mineur · 18 KNOWN permanents en CI (sauvegardes « d'avant »)
Les suites C08, C13B, C19 à C29, R15 et R16 cherchent une vingtaine de fichiers `*.avant.*` dans `KINBALL_AVANT`, qui n'existe pas en CI. Les « d'avant » sont pourtant des versions passées d'`index.html` (et de `kblocal.js`, `kbsite.js`, `kbcollect.js`), présentes dans l'historique git.
Correction : une table `tests/avant.json` (`{ "kinball.C23.avant.html": "<sha>:index.html", … }`) et une étape CI `git show` (avec `fetch-depth: 0`) qui remplit `$RUNNER_TEMP/avant`. Les 18 KNOWN deviennent alors des contrôles négatifs automatiques, et C24·6 (connu) est forcé d'être nettoyé.

### B-9 · propreté · Instables connues
C08·3 / C08·8 (course `onSnapshot` / `rebuildMatches`), M02·2 (`config.js net::ERR_ABORTED`), C24·6 (5 clés sorties de `S`, KNOWN en CI) : connues, non réexaminées.

### B-10 · propreté · Petites choses du lanceur
- `run.mjs:171-177` écrit `<empreinte>.json` et `durees.json` même pour un passage **rouge ou interrompu**. En local, `KINBALL_CACHE=1` rend alors ce rouge pour toujours, même si c'était un échec instable. Les durées d'un processus interrompu faussent aussi la répartition. Correction : n'écrire que si `r.code === 0`, et ne pas écrire `durees.json` s'il y a des `interrompus`. La CI n'est pas touchée : elle ne range qu'après `success()`.
- `fuzz.mjs:5-9` : graines fixes. C'est un test de régression déterministe, pas un fuzz. On pourrait ajouter un `workflow_dispatch` ou un passage nocturne avec une graine du jour, affichée dans le nom de la vérification.

---

## 2. La CI

### C-1 · important · Une branche poussée sans PR n'a **aucun** passage, mais trois documents disent le contraire
`banc.yml:7-25` ne se déclenche que sur `pull_request` vers main et sur `push` sur main. Or :
- `CLAUDE.md:18` : « Tu pousses ta branche, puis `node outils/ci-banc.mjs --branche <b>` donne le résultat ».
- `.claude/agents/codeur.md:16` : « pousse-la : la CI joue alors le banc complet […] N'ouvre la PR que si le brief le demande ».
- `docs/processus.md:10` : « À chaque push | Le banc complet joue en CI ».

Seul `kinball-banc/SKILL.md:21` dit la vérité (« une branche poussée sans PR donne « aucun passage » »).
Scénario : un codeur dont le brief ne demande pas de PR pousse, puis rend « CI : commit abc poussé ». L'Orchestrator lance `ci-banc --attendre`, qui rend au bout de 90 s « AUCUN PASSAGE CI […] changement limité à la documentation ? ». La mauvaise piste est suggérée, et le chantier est livré sans banc complet.
Correction (au choix) : (a) le codeur ouvre toujours une PR brouillon (`gh pr create --draft --base main`) et les trois documents le disent ; (b) ajouter `push: branches-ignore: [main]` à `banc.yml`. Avec (b), une branche qui a aussi une PR jouerait deux fois, sur `refs/heads/b` et sur `refs/pull/N/merge` : (a) est plus simple.

### C-2 · mineur · Empreinte : sûre pour le code, mais aveugle à l'environnement
Couverture vérifiée (`tests/empreinte.mjs:14-54`) : chaque fichier du dépôt par chemin et sha256 (renommage et suppression compris), sauf `docs/`, `.claude/`, `tests/docs/`, `tests/README.md` et `CLAUDE.md`. Aucun test ne lit ces dossiers (grep). L'empreinte couvre aussi `KINBALL_HTML`, le contenu de `KINBALL_AVANT`, les versions de Playwright et de Chromium, et les variables `KINBALL_*` / `*_ONLY`. **Je n'ai trouvé aucun changement de code du dépôt qui laisse l'empreinte inchangée.** Restent hors empreinte :
- **La version de Node** : `setup-node` `node-version: 22` flotte sur la dernière 22.x (`banc.yml:63`). Elle n'est pas dans `OUTIL`.
- **L'image `ubuntu-latest`** et les paquets posés par `playwright install --with-deps` (polices, bibliothèques). Un passage de 24.04 à 26.04 change le rendu, mais le cache resservirait l'ancien vert.
- **La date et le fuseau** : un défaut qui n'apparaît qu'à une date donnée (heure d'été, fin de mois, rang de version du jour dans M04·8) reste masqué tant que l'empreinte ne bouge pas.
- Les liens symboliques sont ignorés (`isFile()` est faux sur un lien). Il n'y en a aucun aujourd'hui.

Correction : ajouter `process.version` et `os.release()` (ou `ImageOS` / `ImageVersion` en CI) à `OUTIL`, et épingler `node-version: 22.x.y`. Une semaine de validité au plus (numéro de semaine dans la clé), pour rejouer au moins une fois par semaine.

### C-3 · mineur · Le cache d'une PR ne sert pas à main
Les caches d'une exécution `pull_request` sont rangés sous `refs/pull/N/merge`, et main ne les lit pas. Après la fusion, le `push` sur main rejoue donc 17 à 20 min, même si l'arbre est identique au commit de fusion testé par la PR. Ce n'est pas un défaut de justesse, c'est du temps perdu. Options : accepter ce coût ; ou ne jouer sur main que `workflow_dispatch` plus un passage planifié (la PR a déjà prouvé l'arbre fusionné).

### C-4 · mineur · Déploiement Pages
- **R24 (connu)** : `pages.yml:39` publie `path: .`. Sont donc en ligne `docs/` (handoff, chantiers, décisions), `tests/`, `amont/` (335 Ko), `MIGRATION.md`, `CLAUDE.md`, et `.claude/` : `upload-pages-artifact@v3` n'exclut que `.git` et `.github`. Correction : une étape qui copie dans `_site/` la liste de `check-release` (fichiers du site + `sw.js` + `confidentialite.html`, par une option `--lister` à ajouter), puis `path: _site`.
- `pages.yml:4-6` déploie à **chaque** push sur main **sans attendre le banc**. Il ne vérifie que `check-release`. Si une PR est fusionnée rouge, ou si le banc de main rougit après la fusion (C-3), le site part quand même. Correction : `on: workflow_run: workflows: ["Banc d'essai"], types: [completed]` avec `if: github.event.workflow_run.conclusion == 'success'`. Un push de documentation seule ne déclenche pas le banc : il faut alors garder un `workflow_dispatch`, ou déployer aussi quand `paths` ne touche que la doc.
- `pages.yml:35` `enablement: true` : sans effet avec `GITHUB_TOKEN` (activer Pages demande un jeton administrateur). Il est sans danger une fois Pages actif, mais trompeur ; à retirer.

### C-5 · mineur · Versions et permissions
- Permissions **minimales et correctes** : `banc.yml` `contents: read` ; `pages.yml` `contents: read`, `pages: write`, `id-token: write`. Il n'y a ni `pull_request_target` ni secret, et les entrées `workflow_dispatch` passent par `env:`, pas par `${{ }}` dans le script (bonne pratique).
- Les actions sont épinglées par **majeure** (`@v4`, `@v5`, `@v3`), pas par SHA. C'est acceptable pour des actions `actions/*` de GitHub. `checkout`, `setup-node`, `cache`, `upload-artifact` et `deploy-pages` en v4 tournent sur Node 20, qui est déprécié sur les exécuteurs. À vérifier : passer à `checkout@v5`, `setup-node@v5` et `upload-pages-artifact@v4`. Attention, la v4 exclut les fichiers cachés, ce qui est ici souhaitable (`.claude/`), mais elle exclut aussi `.nojekyll`, qui ne sert à rien avec un déploiement par Actions.
- `PLAYWRIGHT_VERSION: '1.56.0'` (`banc.yml:50`) : le commentaire dit « même version que celle du banc en local ». Le conteneur cloud a la 1.56.1. Sans gravité, puisque les caches local et CI sont séparés, mais le commentaire est faux.
- `banc.yml:76-79` : une entrée `suites` contenant un saut de ligne écrirait une ligne arbitraire dans `$GITHUB_ENV`. Seuls les membres avec droit d'écriture peuvent lancer le workflow, donc le risque est faible. Valider par `[[ "$SUITES" =~ ^[A-Za-z0-9,]*$ ]]`. `gabarit` devrait être `type: choice` (tablette, telephone, vide) : une faute de frappe donne aujourd'hui `GABARITS[g]` indéfini et un contexte par défaut, donc un passage dénué de sens.

---

## 3. Outils hérités de la période claude.ai

### H-1 · mineur · `outils/resync.mjs`, `tests/local/resync.test.mjs`, `MIGRATION.md` §2 et §5 : du code mort
L'artifact amont n'évolue plus (`MIGRATION.md:9`). `index.html` a divergé de `amont/kinball.amont.html` de 56 Ko (391 243 contre 334 966 octets, vagues 3 à 5, C21 radial…). Une fusion à trois voies depuis cette base produirait des conflits partout. Pourtant ces fichiers sont dans l'empreinte (chaque retouche rejoue 20 min de banc) et dans `rapide.json:20`. `resync.test.mjs` (cas 9) **exécute les commandes de MIGRATION.md**, ce qui lie les trois.
`MIGRATION.md` contredit aussi les règles actuelles :
- `:59` lance `node tests/run.mjs` complet en local ;
- `:65` et `:77` font `git push origin main` (CLAUDE.md : « un agent ne committe jamais sur main »).

Il est aussi doublé presque mot pour mot par `docs/archive/migration-site-github-pages.md` (seule la ligne 9 diffère).

### H-2 · mineur · `check-release` dépend d'`amont/`
`check-release.mjs:105-112` exige `amont/kinball.amont.html` (sinon « introuvable », code 1) et compare son sha256 à `VERSION_AMONT` de `kbsite.js:108`. La valeur `cce95ad2` s'affiche dans l'app (`kbsite.js:191`, « app amont … ») et part dans chaque sauvegarde (`kbsite.js:489`). Elle est vérifiée par M04 (`M04.mjs:306`, regex de la ligne de version) et par M06 (`M06.mjs:180`, `site.amont` en 8 hex). Le contrôle est une tautologie, puisque le fichier ne change plus.

### H-3 · Ce qu'on peut supprimer sans risque (un seul chantier, une seule PR)
1. Supprimer `outils/resync.mjs`, `tests/local/resync.test.mjs` et la règle `rapide.json:20`.
2. Supprimer `MIGRATION.md` (le contenu vit déjà dans `docs/archive/`). Reporter dans `docs/README.md` les seules sections encore utiles : §3 « Mettre en ligne », réécrite en PR, §4 « Revenir en arrière », et le paragraphe « Allumer la collecte ».
3. `amont/` : garder `VERSION_AMONT = 'cce95ad2'` comme **constante figée** dans `kbsite.js`. Le format de version, M04 et M06 ne changent pas, et les sauvegardes restent compatibles. Retirer la vérification amont de `check-release.mjs` (lignes 106, 111 et 125, plus le `replace(RE_AMONT_KB…)` de la ligne 135). Supprimer ensuite `amont/` (335 Ko de moins sur Pages, R24). Mettre à jour `README.md:5`, `paths-ignore` (`MIGRATION.md`) et `M04.mjs:462` (le mot « amont » de la liste interdite peut rester).
4. Retirer les marqueurs `MIGRATION <chantier>` de `index.html` (31 occurrences) : non nécessaire, ce sont des commentaires, et c'est hors de mon périmètre.

Comme tout cela touche `kbsite.js` et `check-release`, il faut ensuite `check-release --ecrire`, puis le banc complet en CI (M04, M06).

---

## 4. `.claude/` (hooks, skills, agents)

### K-1 · important · Les hooks sous Windows : ils échouent en « laisser passer »
`docs/processus.md:59` le dit (« scripts bash (macOS ou Linux) »), mais le PC de l'utilisateur est sous Windows. Claude Code pour Windows exécute les commandes de hook par Git Bash (à confirmer sur le poste). Dans Git Bash :
- **`pgrep` n'existe pas** (procps absent de Git for Windows). Dans `garde-banc.sh:23`, `actifs` est toujours vide, donc la règle « un seul banc » est **désactivée sans message**.
- `jq` est absent par défaut, d'où le repli `node -e` : il fonctionne, mais trois démarrages de Node par commande Bash (trois hooks) coûtent environ 0,5 à 1 s par commande sous Windows. **`test-hooks.sh` exige `jq`** : sans lui, les 26 cas échouent.
- `garde-lecture.sh:30` : la regex `cat … index.html` n'accepte que `/` comme séparateur. `cat C:\…\index.html` passe.
- Un hook introuvable ou en erreur (code ≠ 2) **n'arrête rien** : tout échec d'environnement laisse passer.
- Si la session Windows utilise l'outil PowerShell, le matcher `"Bash"` ne voit rien : `Get-Content index.html` n'est pas filtré.
- Sous Windows, `tests/rapide.mjs:103` et `tests/attendre.mjs:19` (lecture de `/proc`) rendent toujours « aucun banc actif » ; `run.mjs:103` (`/proc/self/fd/1`) ne trouve pas le journal ; `run.mjs:119` (`detached: true` sans `windowsHide`) ouvre une console par processus fils ; `process.kill(-pid)` n'existe pas (repli sur `p.kill`, ce qui laisse des Chromium orphelins). CLAUDE.md conseille `(setsid nohup … &)`, qui n'existe pas sous Windows.

Correction : réécrire les trois gardes en **un seul hook Node** (`node "$CLAUDE_PROJECT_DIR/.claude/hooks/garde.mjs"`), portable et lancé une fois par appel. La détection de banc actif passerait par un fichier verrou (`en-cours.json` avec le pid, déjà écrit par `run.mjs:105-107` et testé par `process.kill(pid, 0)`, qui marche partout) plutôt que par `/proc` ou `pgrep`. `attendre.mjs` et `rapide.mjs` réutiliseraient ce verrou. `test-hooks.sh` deviendrait `test-hooks.mjs`.

### K-2 · important (sous Windows) · `outils/ci-banc.mjs` ne marche pas sous Windows, et pas non plus avec un espace dans le chemin
- `ci-banc.mjs:20` : `path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')`. Sous Windows, cela donne `\C:\Users\…` (vérifié avec `path.win32`), un dossier de travail invalide, donc `git` et `gh` échouent (code 3 « Impossible de lire les passages »). Sur tout système, un espace dans le chemin donne `%20` et le même échec. Correction : `fileURLToPath(import.meta.url)`, comme les autres scripts.
- `ci-banc.mjs:50` : `sh('sleep', ['20'])`. Sans `sleep` dans le PATH (Windows hors Git Bash), `spawnSync` échoue aussitôt et `--attendre` **martèle l'API GitHub** pendant 9 min (limite de débit). Correction : `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20000)` ou une boucle `async` avec `setTimeout`.

### K-3 · important (sous Windows) · Pas de `.gitattributes` : CRLF casse `check-release` et le déploiement
Git for Windows extrait par défaut en CRLF (`core.autocrlf=true`). `check-release` hache les octets du disque (`check-release.mjs:56-58`). Sous Windows, l'empreinte calculée diffère donc de celle de `sw.js`, d'où un ÉCART. Si l'agent lance alors `--ecrire`, il écrit une version et une empreinte **CRLF**. Après le commit, git renormalise en LF, et `pages.yml:31` échoue (empreinte différente) : le site n'est plus déployable tant que quelqu'un sous Linux n'a pas refait `--ecrire`. `resync.mjs` refuse déjà le CRLF (cas 5) : le problème est connu, mais il n'est pas traité pour le reste.
Correction : `.gitattributes` avec `* text=auto eol=lf` (et `*.woff2 *.png binary`).

### K-4 · mineur · Agents
- `auditeur.md:6` (`tools: Bash, Read, Grep, Glob, Write`) et `relecteur.md:6` n'ont **pas l'outil `Skill`**. Or `kinball-audit` se dit « à utiliser par tout agent d'audit ou de relecture », et renvoie lui-même à `kinball-banc`. Ces agents ne peuvent pas charger les skills ; ils peuvent seulement les lire comme fichiers, si on le leur dit. Correction : ajouter `Skill` à `tools`, ou écrire dans la définition « lis `.claude/skills/kinball-audit/SKILL.md` ».
- `relecteur.md` n'a pas `Write`, et sa consigne interdit d'écrire, alors que `processus.md:43` veut « le détail dans son rapport sur disque ». Il faut ajouter `Write` (rapport hors dépôt) ou exempter le relecteur.
- `effort: high` / `xhigh` dans l'en-tête des agents : à vérifier que la version de Claude Code de l'utilisateur lit ce champ. Sinon il est ignoré sans message.
- `codeur.md` n'a pas de `tools`, il hérite donc de tout. Cela convient.

### K-5 · mineur · Skills incohérents avec CLAUDE.md et `processus.md`
- `kinball-banc/SKILL.md:14` : « `--tel` ajoute le téléphone ». En réalité `--tel` **remplace** la tablette par le téléphone, et c'est `--tous` qui joue les deux (`rapide.mjs:6,32`).
- `kinball-audit/SKILL.md:14` : un audit léger = « §2 points 2 et 5 » (contrôle négatif et non-régression des données). `processus.md:24` et `auditeur.md:10` disent : résultat CI, contrôle négatif, invariants. Le point 5 n'y est pas.
- `kinball-audit/SKILL.md:27` : mode animé « tablette et téléphone ». `processus.md:29` dit « sur la tablette, seulement pour l'audit d'une publication », et `auditeur.md:15` « tablette sauf si la mise en page du téléphone est en jeu ».
- `kinball-banc/SKILL.md:33` (« `rapide.mjs` ne couvre pas C20 ») : il vaudrait mieux corriger `rapide.json` (B-5) que garder la note.
- La règle 1 de `kinball-banc` (« un agent ne lance jamais `node tests/run.mjs` sans filtre ») n'est **pas gardée par un hook**, alors que c'est l'erreur la plus coûteuse (20 min sur 2 cœurs). `garde-banc` pourrait refuser `node … tests/run.mjs` quand la commande ne contient ni `KINBALL_ONLY=` ni `KINBALL_CACHE=`.

### K-6 · propreté · Hooks
- `test-hooks.sh:2` ne teste que `garde-lecture` et `garde-pr` : **`garde-banc` n'a aucun cas** (pkill refusé, `node tests/run.mjs` refusé pendant un passage, `node --check run.mjs` accepté).
- `garde-lecture.sh` : `cat index.html kbsite.js`, `head -c 400000 index.html` et `sed -n 1,9999p index.html` passent. C'est acceptable (garde contre l'accident, pas contre la malveillance), mais il faut le dire dans le commentaire.
- `.gitignore` : ajouter `.claude/settings.local.json` (réglages personnels de Claude Code).

---

## Ce que je n'ai pas pu vérifier
- Le comportement réel des hooks sous Claude Code pour Windows (shell utilisé, présence de `pgrep` et `jq` sur le poste) : déduit de Git for Windows, pas observé.
- Une exécution GitHub Actions réelle (journaux, durée du cas « cache trouvé », protection de branche exigeant le contrôle « banc », qui bloquerait les PR de doc ignorées par `paths-ignore`).
- La présence du champ `effort` dans le format des agents de la version installée.
- La justesse de chaque attente fixe : seules les plus suspectes sont citées, sans passage sous charge (banc complet interdit ici).
