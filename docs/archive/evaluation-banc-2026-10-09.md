# Évaluation du banc d'essai Kin-Ball Stats : temps et tokens

*Évaluation extérieure, 8-9 octobre 2026, sur le commit `9452a2e` (main). Machine : 2 cœurs, 8 Go, Chromium sous Playwright.
Le dépôt n'a pas été modifié : toutes les expériences ont été faites dans une copie (`eval-tests/depot`).*

## En bref

- Un passage complet dure **22 min 42 s** (1 362 s) pour **452 vérifications**. Le README annonce encore « 7-8 minutes ».
- **La moitié du temps est de l'attente pure** : la fonction `settle()` (« attendre que l'interface soit au repos ») absorbe **51 %** du temps des deux processus. Presque toute cette attente vient d'une seule minuterie de l'app que le banc ne raccourcit pas : la fermeture de la feuille, 240 ms, attendue en temps réel environ 6 400 fois.
- **La machine est sous-employée** : en moyenne **33 %** des deux cœurs sont occupés pendant un passage. La mémoire n'est jamais un problème : il reste toujours au moins 6,6 Go libres.
- Trois prototypes mesurés, cumulés, font passer le banc de **22 min 42 s à 9 min 8 s (−60 %)** avec les **mêmes 452 vérifications**. Le premier prototype, de 5 lignes, donne à lui seul l'essentiel du gain sans risque.
- Côté tokens, la sortie complète pèse environ **17 000 tokens**. Le journal reste **vide pendant tout le passage**, parce que le lanceur garde la sortie en mémoire jusqu'à la fin. Un agent qui surveille le journal par `tail` ne voit donc rien pendant 22 minutes, et `tail -n 20` à la fin ne montre **aucun** des échecs.
- Deux vérifications instables le sont pour des raisons identifiables (C13B·13 et M04·1). Une troisième (C13B·11) est probablement instable pour une raison voisine.

Règle de conversion utilisée : **1 token ≈ 3,5 caractères** (mélange de français et de code). C'est une estimation à ±20 %, car je n'avais pas de compteur de tokens sur la machine.

---

## 1. Constat chiffré

### 1.1 Les passages mesurés

| Passage | Durée | Vérifications | Échecs | Charge des 2 cœurs (moyenne / p90) |
|---|---|---|---|---|
| Référence, banc d'origine instrumenté | **1 362 s (22 min 42)** | 452 | 2 (C13B·13 tablette, C13B·11 téléphone) | 33 % / 45 % |
| Prototypes A + C | **915 s (15 min 15)** | 452, mêmes noms | 1 (M04·1, course connue, voir 1.6) | 40 % / 58 % |
| Prototypes A + C + D (4 processus) | **548 s (9 min 08)** | 452, mêmes noms | 1 (C13B·13 téléphone, sensible à la charge) | 68 % / 88 % |

Huit vérifications sont KNOWN dans les trois passages : elles comparent l'app à une « version d'avant » que je n'ai pas pu reconstruire (C13B·12, C19·7, C23·15, C23·16, sur chaque gabarit). Voir les limites, section 5.

Les autres suites coûtent peu et ne sont pas en cause : `simtest` 4,4 s, `kblocal` 14,1 s, `resync` 7,1 s, `collecte` 1,0 s, `check-release` 0,1 s, soit **27 s au total**.

### 1.2 Où part le temps, par suite (passage de référence)

Les durées sont en secondes. La tablette et le téléphone tournent en parallèle : la durée totale est celle du plus lent des deux (le téléphone, 1 362 s).

| Suite | Vérifications (les 2 gabarits) | Tablette | Téléphone | Avec A + C (somme des 2) |
|---|---|---|---|---|
| C21 | 52 | 265 | 276 | 315 |
| C13B | 52 | 249 | 249 | 270 |
| C23 | 29 | 167 | 169 | 279 |
| fuzz | 6 | 143 | 146 | 158 |
| C22 | 27 | 96 | 161 | 257 |
| M03 | 18 | 41 | 41 | 45 |
| M08 | 34 | 41 | 39 | 72 |
| C16 | 24 | 34 | 34 | 33 |
| undo | 8 | 33 | 33 | 53 |
| M11 | 14 | 33 | 32 | 33 |
| M04 | 16 | 34 | 5 | 38 |
| C15, M06, C19, C24, M05, C18, C17, C14, C20, smoke, M02 | 162 | 194 | 179 | 225 |
| **Total** | **452** | **1 312** | **1 362** | **1 776** |

**Cinq suites (C21, C13B, C23, fuzz, C22) font 73 % du temps.** Une grande partie de ce temps vient de quatre longues séquences d'actions aléatoires jouées par vrais gestes :

| Vérification | Référence (2 gabarits) | Avec A + C |
|---|---|---|
| C13B·9 : rejeu des règles, 3 × 150 actions | 346 s | 185 s |
| C21·10 : fuzz en mode radial, 3 graines | 315 s | 170 s |
| fuzz : 3 graines, 370 actions | 288 s | 157 s |
| undo : environ 32 actions puis Annuler | 64 s | 51 s |
| **Total** | **1 013 s (38 %)** | **563 s (32 %)** |

### 1.3 Où part le temps, par nature d'attente

J'ai instrumenté la copie (`P0-instrumentation-seule.patch`) pour chronométrer chaque lancement de navigateur, chaque `settle()`, chaque `waitForTimeout` et chaque pause fixe des scénarios. Les chiffres sont des sommes sur les deux processus (2 674 s au total).

| Nature | Nombre | Temps | Part |
|---|---|---|---|
| `settle()` : attente de l'interface au repos | 6 448 | **1 374 s** | **51 %** |
| `waitForTimeout` : pauses fixes et `tick()` (C22, C23, C21 surtout) | 479 | 189 s | 7 % |
| Pauses `attendre()` de M04, M05, M06, M08 | 176 | 63 s | 2 % |
| Lancement de Chromium, page et chargement de l'app | 365 | 115 s | 4 % |
| Fermeture des navigateurs | 365 | 14 s | 0,5 % |
| Reste : gestes, lectures de l'état, attentes dans `clickSheet` et `undo` | – | ~920 s | 35 % |

**Pourquoi `settle()` coûte autant.** Une sonde dédiée (`sondes/settle.mjs`) montre qu'après une action, les minuteries raccourcies de l'app sont terminées au bout d'environ 25 ms. `settle()` attend pourtant encore **250 ms**. La cause : la classe `closing` de la feuille est retirée par `setTimeout(…, SHEET_CLOSE_MS)`, soit 240 ms (ou 120 ms pour la couche radiale). Le banc ne raccourcit que les délais compris entre 400 et 1 600 ms, et laisse donc passer ces 240 ms en temps réel. Or, hors mode animé, la feuille n'a plus d'animation à l'écran : ces 240 ms ne correspondent à rien de visible. Après correction, `settle()` tombe à environ 45 ms.

Reste un petit poste, que je n'ai pas traité : `undo()` attend le réarmement de ↶ (`UNDO_REARM_MS`, 400 ms), et `clickSheet()` attend la fin de la fenêtre de double appui (300 ms). Ces deux attentes reposent sur `Date.now()` et ne peuvent pas être raccourcies par le même moyen.

### 1.4 Charge de la machine

| Passage | Cœurs occupés (moyenne) | Médiane | p90 | Maximum | Mémoire libre minimale |
|---|---|---|---|---|---|
| Référence (2 processus) | 33 % | 32 % | 45 % | 91 % | 6 653 Mo |
| A + C (2 processus) | 40 % | 44 % | 58 % | 81 % | – |
| A + C + D (4 processus) | 68 % | 76 % | 88 % | 95 % | 6 602 Mo |

Échantillons toutes les 5 s, lus dans `/proc/stat`. Dans les deux premiers passages, la machine n'est donc pas saturée : le banc attend, il ne calcule pas. À 4 processus, elle approche de la saturation, et c'est là que la mesure de durée de C13B·13 a échoué (voir 1.6). Au départ, la charge était nulle (0,06). Je n'ai observé aucune charge anormale venant de l'autre agent.

### 1.5 Ce que lit un agent

**Sortie d'un passage complet** (hors mes lignes d'instrumentation) :

| Lecture | Lignes | Caractères | Tokens (≈) |
|---|---|---|---|
| Journal entier | 462 | 60 400 | **17 300** |
| Utile seulement : FAIL, messages, KNOWN, résumé | 13 | 2 400 | **700** |
| `tail -n 20` à la fin | 20 | ~2 600 | ~750, et **0 des 2 échecs visibles** |
| Journal pendant le passage | **1 ligne** jusqu'à la dernière seconde | – | – |

Il y a deux causes :

- `run.mjs` (processus parent) accumule la sortie de chaque processus fils dans une variable et ne l'écrit qu'à la fin des deux. Je l'ai vérifié à 9 min 30 et à 19 min : le journal contenait une seule ligne.
- La sortie est rangée gabarit par gabarit. Un échec côté tablette, ou au début du bloc téléphone, est donc loin de la fin du journal.

Conséquences :

- Chaque coup d'œil `sleep` + `tail` pendant le passage est un tour d'agent dépensé pour rien.
- À la fin, il faut lancer un `grep` de plus pour savoir ce qui a échoué.
- Si le processus meurt au démarrage, l'agent ne le découvre qu'après son attente. Cela m'est arrivé une fois au début de cette évaluation : un outil absent a fait échouer mon premier lancement en arrière-plan, et je ne l'ai su qu'après 9 minutes d'attente.

**Coût de démarrage à froid** pour un agent codeur :

| Fichier | Caractères | Tokens (≈) |
|---|---|---|
| `tests/README.md` | 17 970, dont **13 700 de notes par chantier** (C19 à M11) | 5 100, dont 3 900 de notes |
| `tests/lib.mjs` | 17 022 | 4 900 |
| `tests/model.mjs` | 7 171 | 2 000 |
| Scénario de son chantier | de 3 900 (C14) à 48 700 (C21) | de 1 100 à 13 900 |
| **Total** | – | **13 000 à 26 000** |

C'est réel mais secondaire. Le vrai coût en tokens vient du **nombre de tours** passés à attendre et des **lectures de journaux complets**, multipliés par le nombre de passages de chaque chantier.

### 1.6 Vérifications instables

| Vérification | Ce qu'on a vu | Cause | Statut de la cause |
|---|---|---|---|
| **C13B·13** (pas de calcul de plus de 50 ms sur le fil principal, aussi avec CPU ×4) | Échoue dans 2 passages complets sur 3 : 66,7 ms (tablette, ×4) et 96,9 ms (téléphone, ×1, à 4 processus). Quand elle passe, les valeurs vont de 12 à 39 ms. | Elle mesure une durée réelle (`performance.now`). Quand l'autre gabarit ou l'autre Chromium prend le cœur, la « tranche » s'allonge sans que le code de l'app y soit pour rien. Plus la machine est chargée, plus elle échoue. | Mesuré : la corrélation avec la charge a été observée |
| **C13B·11** (barres recalculées après reprise) | Échoue une fois (téléphone, référence) : « attendu 3, obtenu 0 ». | Probablement une course : `wait()` attend `!WP.inFlight && !WP.dirty`, une condition déjà vraie avant que le calcul déclenché par `resumeMatch()` ait commencé. Sous charge, la lecture arrive avant le calcul. | Déduit à la lecture du code, non reproduit |
| **M04·1** (premier chargement sans rechargement) | Échoue une fois dans le passage A + C (« événements load… obtenu 1 »). Passe 7 fois sur 7 seule ou en petite série. | `launch()` rend la main dès `domcontentloaded`, puis le scénario compte les événements `load`. Si le `load` du premier chargement arrive après, il est compté comme un rechargement. | Déduit à la lecture du code. Une session d'évaluation antérieure, dont les fichiers sont restés dans ce dossier, avait abouti au même diagnostic. |

Un rejeu de C13B seule coûte environ 2 min 15 par gabarit. Le vrai coût est ailleurs : chaque échec instable oblige un agent, puis l'auditeur, à enquêter, à rejouer et à écrire « échoue sous charge ». Cela représente plusieurs tours, chacun sur un contexte déjà gros.

### 1.7 Les modes animés de l'audit

Mesure sur un sous-ensemble (tablette ; smoke, undo, C16, C20, M03 ; code d'origine) :

| Mode | Durée | Facteur |
|---|---|---|
| Par défaut | 133 s | ×1 |
| `KINBALL_ANIM=1` | 199 s | ×1,5 |
| `KINBALL_ANIM=1 KINBALL_TIMESCALE=1` | 336 s | ×2,5 |

Le prototype A ne change rien à ces modes : il ne s'applique que lorsque l'animation est coupée.

Il faut savoir que certaines pages fixent elles-mêmes leur mode : 38 lancements sur 365 demandent l'animation, 60 demandent les vrais délais. C22 est entièrement en `anim: true`, et 30 pages sur 38 de C23 sont en `timescale: 1`. Pour ces pages, rejouer le banc dans un autre mode **refait exactement le même passage**. C22 et C23 pèsent environ 590 s de processus.

Une extrapolation au banc entier (estimation, non mesurée) donne environ **30 min en mode animé** et **45 à 55 min en vrais délais**. Un grand audit enchaîne : banc complet (23 min), deux modes (75 min), version d'avant (23 min) et contrôles négatifs. Cela fait **environ 2 h de banc**, avec autant de cycles d'attente.

---

## 2. Recommandations, classées par rapport gain / risque

Les gains « par chantier » supposent le processus actuel : le codeur lance 2 passages complets ; l'auditeur lance 1 passage complet, 1 passage sur la version d'avant et les modes animés.

### R1. Raccourcir aussi la fermeture de la feuille quand l'animation est coupée (prototype A)

- **Ce qu'on change.** Dans `lib.mjs`, la borne basse des délais raccourcis passe de 400 à 100 ms, mais seulement sans animation. Seules les minuteries de fermeture (240 et 120 ms) sont concernées : j'ai vérifié qu'il n'y en a pas d'autre entre 100 et 400 ms dans l'app. Cela tient en 5 lignes : `P1-fermeture-raccourcie-seule.patch`.
- **Gain.**
  - Mesuré sur 4 suites (tablette) : 217 s → 117 s (−46 %), 33 vérifications sur 33 identiques.
  - Mesuré sur le banc entier, avec C : 1 362 s → 915 s, soit **−7 min 30 par passage**. La part de C est d'environ 20 s.
  - Par chantier, avec 3 passages par défaut : **environ −22 min**.
  - Moins de cycles d'attente : un passage de 15 min tient en 2 attentes de 9 min au lieu de 3.
- **Ce qu'on perd.** Sans animation, la fenêtre de 240 ms pendant laquelle les boutons sont inertes ne dure plus que 12 ms. Rien ne regardait cette fenêtre sans animation. Les vérifications qui l'éprouvent (C21·6l, C22, et les pages `anim: true` de C21) sont en mode animé et restent inchangées, tout comme le mode `KINBALL_ANIM=1`.
- **Effort.** Quelques minutes, plus une ligne dans le README.
- **Statut.** **Mesuré.**

### R2. Une sortie faite pour un agent : silence, fichier de résultat, attente unique, diffusion continue

- **Ce qu'on change.**
  1. Les processus fils écrivent au fil de l'eau, et non à la fin.
  2. `KINBALL_SILENCE=1` n'affiche que les FAIL, les KNOWN, un résumé et les 5 suites les plus lentes.
  3. Un fichier `resultat.json` donne, pour chaque vérification, son état et sa durée, ainsi que l'empreinte de `index.html` et de `tests/`, le code de sortie et la durée par suite. Le reporter connaît déjà la durée de chaque vérification.
  4. Une commande `node tests/attendre.mjs <journal>` bloque jusqu'à 9 min 30, rend la main immédiatement si le processus est mort, et n'affiche que le résumé et les échecs.
- **Gain en tokens.**
  - Lecture d'un passage : environ 17 300 → **700 tokens** (mesuré sur le journal réel).
  - Suivi : 2 tours d'attente au lieu de 5 à 10 coups d'œil `sleep` + `tail` (estimé).
  - Avec 4 à 6 passages complets par chantier, codeur et auditeur réunis, on économise de l'ordre de **70 000 tokens de lecture** et une **quinzaine de tours d'agent**, chacun relisant tout son contexte (estimé).
- **Ce qu'on perd.** Rien : le journal complet reste disponible sur demande.
- **Effort.** Environ une heure.
- **Statut.** Volume **mesuré** ; tours **estimés**.

### R3. Ne pas rejouer ce qui a déjà été joué : cache par empreinte

- **Ce qu'on change.** Le passage « avant » du codeur et le passage sur la version d'avant de l'auditeur portent sur un `index.html` et des tests identiques au dernier passage « après » de main, déjà joué et audité. Il suffit de garder `resultat.json` (R2), indexé par une empreinte de `index.html`, des fichiers du site, de `tests/` et de la version de Playwright et Chromium. Si l'empreinte correspond, on relit ce résultat au lieu de rejouer 452 vérifications.
- **Ce qui ne change pas.** Le contrôle négatif (le scénario du chantier doit échouer sur l'ancienne version) reste obligatoire : il ne porte que sur une suite et prouve que le scénario détecte le défaut.
- **Ce qui change pour la version d'avant.** On ne la rejoue que pour les suites en échec dans le passage « après », car c'est seulement là qu'il faut distinguer régression et défaut ancien.
- **Gain.** **2 passages complets par chantier**, soit environ 45 min aujourd'hui ou environ 18 min après R1 et R4, et autant de cycles d'attente et de lectures (estimé).
- **Ce qu'on perd.** On ne détecte plus une dérive de l'environnement (Chromium mis à jour, machine différente) entre deux chantiers. Mettre la version de Chromium dans l'empreinte couvre l'essentiel. On peut aussi faire un passage non mis en cache chaque semaine ou avant chaque publication.
- **Effort.** Une demi-journée, après R2.
- **Statut.** **Estimé.**

### R4. Corriger les trois vérifications instables

- **Ce qu'on change.**
  - **M04·1** : attendre `waitForLoadState('load')` avant de poser le compteur d'événements `load`.
  - **C13B·11** : attendre que le calcul ait réellement commencé, par exemple que `WP.stats.sent` ait augmenté, au lieu de `!inFlight && !dirty`.
  - **C13B·13** : la sortir de la phase parallèle et la jouer **seule, en fin de passage** (voir R5). Une autre solution est de prendre la médiane de 3 mesures au lieu du maximum, ou de compter des tâches longues plutôt qu'une durée réelle.
- **Gain.** Plus de faux rouges. Aujourd'hui, l'un d'eux apparaît dans pratiquement chaque passage complet (3 passages sur 3 ici). Chacun coûte un rejeu ciblé et plusieurs tours d'enquête au codeur comme à l'auditeur. Surtout, un rouge chronique habitue à ignorer le rouge, et c'est un risque direct pour la saisie en match.
- **Ce qu'on perd.** Rien pour M04·1 et C13B·11. Pour C13B·13, si l'on garde la mesure de durée, rien non plus : seul le moment où elle tourne change.
- **Effort.** 1 à 2 heures.
- **Statut.** Causes **déduites** de la lecture du code ; corrélation avec la charge **mesurée** pour C13B·13.

### R5. Plus de parallélisme, avec une phase finale « au calme » (prototype D)

- **Ce qu'on change.** `KINBALL_PARTS=2` lance 2 processus par gabarit au lieu d'un. Les suites sont réparties de la plus longue à la plus courte d'après leur durée mesurée. Pour un vrai outil, ces durées viendraient du `resultat.json` précédent. Les vérifications qui mesurent une durée réelle (C13B·13, et toute vérification de ce genre à l'avenir) sont marquées et jouées seules à la fin.
- **Gain.** Mesuré, sur le banc entier, avec A et C : **915 s → 548 s**. Le banc complet passe ainsi de 22 min 42 à **9 min 08**, ce qui tient dans **une seule** commande d'attente de 10 min.
- **Ce qu'on perd.** Pas de couverture. En revanche, la machine est plus chargée : occupation de 33 % à 68 % en moyenne, 88 % en p90. C13B·13 a échoué dans ce passage. Il faut donc **appliquer R4 avant R5**. Je n'ai pas mesuré la phase finale « au calme » : elle coûterait environ 1 min 30 de plus (estimé).
- **Effort.** Une demi-journée : répartition, phase finale, durées relues.
- **Statut.** **Mesuré** sans la phase finale.

### R6. Alléger l'audit là où il ne fait que répéter

Ce qui **apporte une preuve indépendante** et doit rester :

- le passage complet de l'auditeur sur le commit livré, une fois (il vérifie que le résultat annoncé par le codeur est vrai) ;
- le contrôle négatif ;
- les scripts Playwright jetables de l'auditeur, qui revérifient chaque critère d'acceptation avec ses propres appuis ;
- les captures d'écran.

Ce qui **répète sans rien apprendre** :

| Étape de l'audit | Proposition | Gain (estimé) | Ce qu'on perd |
|---|---|---|---|
| Passage complet sur la version d'avant | Cache (R3), plus un rejeu des seules suites en échec | ~23 min aujourd'hui, ~9 min après R1 et R5 | Rien de plus qu'en R3 |
| Modes animés sur C22 et C23 | Les exclure de ces modes : leurs pages fixent déjà leur mode, donc le passage est identique | ~10 min en mode animé, ~25 min en vrais délais | Rien : c'est le même passage |
| Modes animés sur le téléphone | Tablette seulement (l'appareil cible), sauf pour les chantiers qui touchent la mise en page du téléphone | Environ la moitié du temps des modes | Les différences de minutage propres au téléphone en mode animé. La mise en page du téléphone reste couverte par le mode par défaut. |
| Modes animés sur les longues séquences (fuzz, C13B·9, C21·10) | Une seule graine dans ces modes | ~5 min en mode animé, ~10 min en vrais délais | Moins de combinaisons aléatoires sous vraies animations |

- **Effort.** Surtout un changement de consigne, plus `KINBALL_ONLY` / `KINBALL_SAUF`.
- **Statut.** **Estimé**, à partir des facteurs ×1,5 et ×2,5 mesurés sur un sous-ensemble.

### R7. Ne jouer qu'une fois ce qui ne dépend pas de l'écran

- **Ce qu'on change.** C13B·9, le rejeu des règles (le moteur `KBSim` comparé à l'app sur 450 actions), ne regarde que les pointages et les éliminations. On le joue sur la tablette seulement.
- **Gain.** Environ 93 s de processus, soit environ 45 s de durée totale (mesuré sur la vérification ; le gain total est déduit).
- **Ce qu'on perd.** Les gestes du téléphone sur ces 450 actions. Ils restent couverts par le fuzz sur téléphone, comparé au modèle indépendant.
- **Pour aller plus loin.** Un test Node pur `KBSim` contre `model.mjs`, avec des milliers d'actions en quelques secondes, ajouté au fuzz (app contre modèle), rendrait C13B·9 presque redondant. Mais les distributions d'actions diffèrent (reprises du duel), donc c'est à valider.
- **Statut.** **Estimé.**

### R8. Un banc « de travail » distinct du banc « de livraison »

- **Ce qu'on change.** Entre ses deux passages, le codeur travaille déjà avec `KINBALL_ONLY=<son id>`. On formalise un niveau intermédiaire, `KINBALL_NIVEAU=rapide` : tablette seule, smoke, undo, le scénario du chantier, et le fuzz réduit à une graine. Le banc complet reste obligatoire avant le commit et pour l'audit.
- **Ce qu'on écarte.** La sélection des suites d'après les fichiers modifiés apporterait peu : presque tout chantier touche `index.html`, que testent toutes les suites.
- **Gain.** Pour les retours intermédiaires du codeur : environ 3 à 4 min au lieu de 9 à 22 (estimé).
- **Ce qu'on perd.** Rien au moment du commit. Les régressions dans d'autres suites sont découvertes plus tard, au passage complet.
- **Statut.** **Estimé.**

### R9. Découper le README

- **Ce qu'on change.** On garde dans `tests/README.md` la commande, les variables, l'API de `lib.mjs` et la façon d'ajouter un scénario, soit environ 4 300 caractères. Les notes par chantier (13 700 caractères) vont dans un en-tête de commentaire de chaque scénario ou dans `tests/notes/<id>.md`. On corrige aussi la durée annoncée.
- **Gain.** Environ 3 900 tokens par agent qui démarre (mesuré sur le fichier), et moins d'informations périmées.
- **Ce qu'on perd.** Rien.
- **Effort.** 30 min.
- **Statut.** **Mesuré.**

### R10. Un seul Chromium par processus, un contexte neuf par page (prototype C)

- **Ce qu'on change.** `launch()` ouvre un contexte neuf, isolé (stockage, IndexedDB et service workers séparés), dans un Chromium partagé, au lieu de lancer un Chromium à chaque fois. C'est le cas 365 fois par passage.
- **Gain.** Mesuré sur 5 suites qui lancent beaucoup de pages : 72 s → 67 s (−7 %). Le lancement passe de 238 à 186 ms, la fermeture de 34 à 7 ms. Sur le banc entier, environ **−20 s** (déduit).
- **Ce qu'on perd.** On s'écarte légèrement de « un appareil neuf par test ». M04·1 a échoué une fois avec ce prototype : je l'attribue à la course décrite en 1.6, mais je ne peux pas exclure un effet de minutage.
- **Recommandation.** Le faire seulement après R4, et en gardant une option pour donner un Chromium propre à un scénario (M04).
- **Statut.** **Mesuré** ; gain faible.

### Récapitulatif

| # | Recommandation | Gain par passage complet | Gain par chantier (estimé) | Risque | Effort | Statut |
|---|---|---|---|---|---|---|
| R1 | Fermeture de la feuille raccourcie sans animation | −7 min 30 | ~−22 min | Très faible | Minutes | Mesuré |
| R2 | Silence, `resultat.json`, attente unique, diffusion continue | ~−16 600 tokens par lecture | ~−70 000 tokens, ~15 tours | Nul | ~1 h | Volume mesuré |
| R3 | Cache par empreinte (passages « avant ») | – | −2 passages complets | Faible (dérive de l'environnement) | ½ jour | Estimé |
| R4 | Corriger M04·1, C13B·11, C13B·13 | Rejeux et enquêtes évités | Plusieurs tours | Nul | 1-2 h | Causes déduites |
| R5 | 4 processus, plus une phase finale au calme | −6 min (après R1) | ~−18 min | Moyen sans R4, faible avec | ½ jour | Mesuré |
| R6 | Audit : modes sans C22 et C23, tablette seule | – | −30 à −60 min par grand audit | Faible (listé ci-dessus) | Consigne | Estimé |
| R7 | C13B·9 sur tablette seule | −45 s | ~−2 min | Faible | Minutes | Estimé |
| R8 | Niveau « rapide » pour le travail courant | – | Retours plus rapides | Nul au commit | ~1 h | Estimé |
| R9 | README découpé | – | −3 900 tokens par agent | Nul | 30 min | Mesuré |
| R10 | Chromium partagé | −20 s | ~−1 min | Faible, après R4 | ~1 h | Mesuré |

**Ordre conseillé :** R1, puis R2, puis R4 et R9, puis R5, puis R3 et R6. R1, R2 et R4 suffisent à rendre le banc environ 1,5 fois plus court et lisible en un coup d'œil, sans rien perdre. R1 + R5 l'amènent sous 10 minutes.

---

## 3. Ce que je recommande de ne pas toucher

- **Les vrais gestes** (pointeur, appuis aux coordonnées, clics sans `force`) et l'attente de stabilité avant chaque clic. C'est ce qui rend le banc crédible pour la saisie en direct.
- **Le modèle indépendant (`model.mjs`) et le fuzz à graines fixes**, ainsi que les invariants vérifiés à chaque pas. Ce sont les vérifications les plus chères, mais aussi celles qui protègent le plus directement contre une saisie perdue ou corrompue. Je ne propose que de les raccourcir en mode animé (R6) et dans le niveau « rapide » (R8).
- **Le fuzz en mode radial (C21·10)** : c'est un autre chemin d'interface, ce n'est pas un doublon.
- **Les pages en vrais délais et animées de C22, C23 et C21** : elles visent précisément les fenêtres de temps (appuis fantômes, ↶ pendant la fin de période).
- **Les contrôles négatifs** : ils sont peu coûteux (une suite) et prouvent que chaque scénario détecte ce qu'il prétend détecter.
- **Les scripts propres de l'auditeur et les captures** : c'est la partie réellement indépendante de l'audit.
- **Le mécanisme KNOWN avec `knownErr`**, qui n'excuse qu'une erreur précise, et le **code de sortie** du lanceur, qui vaut 1 dès qu'un processus fils n'a rendu aucun résultat.
- **Les suites Node** (`simtest`, `kblocal`, `resync`, `collecte`, `check-release`) : 27 s au total, aucun enjeu.

---

## 4. Ce qui est mesuré, ce qui est déduit

| Mesuré | Déduit ou estimé |
|---|---|
| Durées totales, par suite, par gabarit et par vérification (3 passages complets) | Gains « par chantier » (ils dépendent du nombre de passages réels) |
| Décomposition des attentes (`settle`, pauses, lancements) | Durée des modes animés sur le banc entier (extrapolée d'un sous-ensemble) |
| Cause de la lenteur de `settle()` (sonde) | Tours d'agent et tokens de contexte économisés par R2 |
| Gains de A, de C et de D, résultats identiques (mêmes 452 noms) | Causes de M04·1 et C13B·11 (lecture du code) |
| Charge processeur et mémoire | Gains de R3, R6, R7 et R8 |
| Volume de la sortie, journal vide pendant le passage, échecs absents de `tail -n 20` | Conversion en tokens (3,5 caractères par token) |
| Facteurs ×1,5 et ×2,5 des modes animés (sous-ensemble) | |

---

## 5. Limites de cette évaluation

- **Versions d'avant incomplètes.** Je n'ai pu reconstruire que `kinball.C20/C21/C24.avant.html`, depuis l'historique git. Celles de C13B, C19, C22B et C23 sont antérieures au dépôt (avant M00) : 8 vérifications sont donc restées KNOWN. Avec ces fichiers, ces vérifications joueraient en plus des parties complètes (par exemple C13B·12 joue deux parties) : le vrai banc est donc un peu plus long que mes 22 min 42. Les copies d'avant, placées hors du dépôt, n'ont pas accès aux fichiers voisins (`kbsite.js`, etc.). C'est aussi le cas dans la pratique décrite, mais je ne l'ai pas vérifié en détail.
- **Une seule mesure par configuration** pour les passages complets. Je n'ai pas mesuré la variation d'un passage à l'autre. Les écarts annoncés (−33 %, −60 %) sont très supérieurs au bruit probable, mais les petits gains (R10) sont à la limite.
- **Modes animés** mesurés sur un sous-ensemble tablette (5 suites) seulement, faute de budget pour deux passages complets de 30 à 50 minutes.
- **Tokens** : il n'y avait pas de compteur sur la machine. La conversion est une estimation, et les coûts de contexte par tour dépendent de la taille de contexte de chaque agent, que je ne connais pas.
- **Instrumentation** : elle ajoute une ligne `@@SUITE` par suite et un chronomètre autour de `settle()` et des pauses. Son propre coût est négligeable (quelques millisecondes en tout).
- **Fichiers trouvés dans le dossier de travail.** Le dossier contenait déjà les fichiers d'une évaluation antérieure, datée du 5 octobre : `copie*`, `journaux/`, `cache/`, `00-*.patch`, `01-*.patch`, `*.py`, `charge.sh`, `essai-m04.sh`, `lancer-banc.sh`, `prototype-kbsim-vs-modele.mjs`. **Aucun de mes chiffres n'en vient.** Je n'ai consulté que leur correctif de M04·1, pour le comparer à mon propre diagnostic.

## 6. Fichiers produits (dans `eval-tests/`)

- `rapport-evaluation-tests.md` : ce rapport.
- `base.log`, `base.suites.jsonl`, `base.cpu`, `base.time` : passage de référence.
- `protoAC.*` : passage complet avec A et C. `protoACD.*` : passage complet avec A, C et D (4 processus).
- `protoA-0.log` / `protoA-1.log`, `protoC-0.log` / `protoC-1.log`, `m04-*.log`, `m04seq-*.log`, `mode-anim.log`, `mode-anim-ts1.log`, `autre-*.log`, `smoke.log` : passages ciblés.
- `sondes/settle.mjs` : la sonde qui explique le coût de `settle()`.
- `lancer.sh` : le lanceur en arrière-plan avec relevé de charge (il écrit le code de sortie et la durée dans `<nom>.time`).
- `P0-instrumentation-seule.patch` : l'instrumentation seule.
- `P1-fermeture-raccourcie-seule.patch` : R1 seul, propre, prêt à appliquer.
- `P-instrumentation-A-C-D.patch` : tout ce qui a été mesuré, réglable par variables (`KINBALL_PROTO_A=0`, `KINBALL_PROTO_C=0`, `KINBALL_PARTS=n`).
