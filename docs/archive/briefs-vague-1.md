# Briefs de la vague 1 — Kin-Ball Stats

Écrits par l'Orchestrator le 2026-10-02. Un fichier par brief dans `briefs/` (dossier de l'utilisateur) ; ce document les réunit. Ordre de lancement : voir `chantiers.md`, « Ordre d'exécution ».

---

## Fichier : briefs/00-commun.md

# Consignes communes à tous les briefs — Kin-Ball Stats (vague 1)

À lire avant ton brief. Tu démarres à froid : tout ce qu'il faut savoir est ici et dans ton brief.

## Le projet
Web app de statistiques de kin-ball (iPad d'abord, téléphone aussi). **Un seul fichier autonome** HTML + CSS + JS, un seul `<script>` classique, plus de 250 fonctions globales, 120 `onclick=` en ligne (donc pas de modules ES, pas de second `<script>`). Interface et commentaires en français.

## Fichiers
- Code de travail : `/home/claude/work/kinball.html` (4 856 lignes ; nom livré à l'utilisateur : « Kin-Ball — Statistiques.html »). Le fichier peut être en lecture seule : `chmod u+w` avant d'écrire.
- **Avant toute modification**, copie de sauvegarde : `mkdir -p /home/claude/work/backups && cp /home/claude/work/kinball.html /home/claude/work/backups/kinball.<ID-CHANTIER>.avant.html`.
- Cahier des charges : `/home/claude/work/cahier-des-charges.md` (ne lis que la section citée par ton brief).
- Guide d'architecture : dans le Projet claude.ai (`claude/architecture-et-guide.md`, outil Projects si tu l'as). S'il est inaccessible, ton brief suffit.
- Banc d'essai (s'il existe déjà) : `/home/claude/work/tests/` — `node /home/claude/work/tests/run.mjs`.
- Les numéros de ligne des briefs sont approximatifs : retrouve les fonctions par `grep -n "function nom"`.

## Règles
- Tu ne modifies que le périmètre de ton brief. Tu n'édites jamais par réécriture complète du fichier : éditions ciblées (outil Edit), pour ne pas écraser le travail d'un autre.
- Tu ne publies rien (aucun Artifact, aucun appel réseau). Tu ne touches ni à la base ni au dossier de l'utilisateur.
- Tu ne tranches aucune règle du kin-ball et aucune option laissée ouverte : tu la remontes dans « QUESTIONS OUVERTES ».
- Un constat hors périmètre (bug voisin, dette) se signale dans le rapport, il ne se corrige pas.

## Invariants à ne jamais casser
- Navigation : uniquement `showOnly(id)` / `navTo` / `navBack` / `navHome` ; le rendu est séparé de la navigation (`onEnterScreen`).
- `TEAMS_DB` / `MATCHES_DB` ne sont jamais écrits directement ; écritures via `dbSet*` et `save()`.
- Chaque événement de `S.history` porte `before` (annulation) et `details`. Annuler (`undo()`) doit toujours restaurer exactement l'état.
- Aucune migration des données enregistrées : tout nouveau champ a une valeur par défaut sûre, tout ancien match reste lisible.
- `FAULTS` (codes) ne change jamais ; affichage via `faultLabel()`.
- `TEAMS` = stockage (3 emplacements Bleu/Gris/Noir), `ATEAMS()` / `matchTeams(m)` = équipes en jeu.
- L'écran de match n'a pas de barre d'app. `fieldPoint()` est le seul endroit qui lit `clientX/clientY` pour le terrain.
- Toute règle CSS propre au téléphone est préfixée `.phone` (classe sur `<html>`, pas de media query).
- Nouvelle famille de stats = une entrée dans `STAT_SECTIONS` ; tableaux via `statTable()` ; nouveau format = entrée de `FORMATS`.
- **Pas de nouvel état d'interface dans `S`** (il part en base à chaque `save()`) : utilise des variables de module.
- Tout texte saisi par un utilisateur passe par `escapeHtml()` avant d'entrer dans du HTML.
- Le rendu ne déclenche jamais `save()`.

## Vérification minimale obligatoire
Chromium et Playwright sont installés. Lancer Node avec `NODE_PATH=/home/claude/.npm-global/lib/node_modules` (ex. `const {chromium}=require('playwright')`), page `file:///home/claude/work/kinball.html`.
- Hors de claude.ai, `window.claude` n'existe pas : l'app affiche « stockage indisponible » et l'état de synchro en erreur, mais un match se joue normalement en mémoire. C'est attendu.
- **État de référence : 2 erreurs console réseau** (`net::ERR_TUNNEL_CONNECTION_FAILED` : polices Google et `xlsx` du CDN, bloqués ici). Toute AUTRE erreur console ou `pageerror` est une régression. `XLSX` est donc indéfini ici : ne teste pas l'export Excel, teste les fonctions de construction (`buildActionRows()`, `*Aoa()`).
- Deux gabarits : tablette 1180×820 ; téléphone 390×844 avec `hasTouch:true, isMobile:true` (la classe `html.phone` doit être présente).
- Délais de l'app à respecter dans les scénarios : message éclair 550 ms, fin de période 1 400 ms, armement des boutons 500 ms.
- Démarrer un match : `openNewMatch()`, choisir le format (`setFormatTeams(n)`, `setFormatPreset(id)`), `startMatch()`, puis `chooseInitialPossession('Bleu')`. Un lancer = glisser sur `#field` (plus de 15 px) puis choix dans la feuille ; une faute = appui sur `#field` puis type de faute.
- Si `/home/claude/work/tests/run.mjs` existe : lance-le avant et après ton travail et cite les deux résultats.
- Vérification visuelle : capture d'écran tablette et téléphone des écrans touchés, regardées (outil Read sur le PNG), dans ton dossier temporaire.

## Rapport à rendre (format imposé)
```
CHANTIER : <id>
STATUT : terminé | partiel | bloqué
CE QUI A CHANGÉ : <fonctions, écrans, CSS, avec numéros de ligne>
RISQUES / EFFETS DE BORD :
VÉRIFICATIONS FAITES : <commandes, résultats chiffrés, captures regardées>
À AJOUTER AU GUIDE : <texte prêt à coller, avec numéro de section proposé>
QUESTIONS OUVERTES :
```

---

## Fichier : briefs/C02A-banc-minimal.md

CHANTIER : C02 lot A — Banc d'essai minimal
MODÈLE : Sonnet 5.5 (codeur dédié aux tests). Lis d'abord /home/claude/briefs/00-commun.md.
OBJECTIF : une seule commande, `node /home/claude/work/tests/run.mjs`, dit en moins de deux minutes si l'app se charge, joue un match et annule correctement, sur tablette et sur téléphone.
CONTEXTE : les cinq scripts cités par le guide (`fuzz.mjs`, `uifuzz.mjs`, `overlaptest.mjs`, `exportcheck.mjs`, `csvcheck.mjs`) n'existent plus nulle part. Ce lot en recrée le strict nécessaire pour que les chantiers de la vague 1 aient une vérification commune. Guide §4quater (formats), §4decies (situations), §8 étape 21.
PÉRIMÈTRE : uniquement `/home/claude/work/tests/` (à créer).
- `lib.mjs` : lancement de Chromium (Playwright, `NODE_PATH=/home/claude/.npm-global/lib/node_modules` ; prévoir `createRequire`), ouverture du fichier (chemin dans la variable d'environnement `KINBALL_HTML`, défaut `/home/claude/work/kinball.html`), deux gabarits (tablette 1180×820 ; téléphone 390×844, `hasTouch`, `isMobile`), collecte des erreurs console et `pageerror` en ignorant seulement les échecs réseau de référence (`net::ERR_…` sur polices et CDN). Aides : `startMatch({format, names})`, `initialPossession(team)`, `lancer({from:[x,y], to:[x,y], target, caught, player})`, `faute({at:[x,y], code, player})`, `reprise({at, team})`, `duelStart(team)`, `undo()`, `state()` (copie de `S` sans `updatedAt`), `openStatsTab(id)`. Les gestes passent par de VRAIS événements de pointeur sur `#field` et de vrais clics dans la feuille (`#sheet`), pas par un appel direct aux fonctions de règles : c'est l'interface qu'on teste.
- `smoke.mjs` : chargement sans erreur ; match 9/11 scénarisé jusqu'à l'élimination, le duel et la fin de période ; pointage comparé à un modèle indépendant écrit dans le test (une faute ou un ballon échappé = 1 point à chaque AUTRE équipe en jeu ; élimination de la plus basse au seuil ; période gagnée au second seuil ; remise à zéro) ; ouverture de chaque onglet de `STAT_SECTIONS` (match) sans erreur et avec un contenu non vide ; `buildActionRows()` renvoie une ligne par événement.
- `undo.mjs` : après chaque action d'un scénario d'une trentaine d'actions (lancers, fautes, reprise, élimination, fin de période), « action puis Annuler » redonne exactement l'état précédent.
- `fuzz.mjs` : quelques centaines d'actions aléatoires à graine fixe sur 9/11, 11/13 et duel 11, avec invariants : aucun pointage négatif ; à trois équipes hors duel, total des points de la période pair ; à l'élimination, jamais deux équipes à égalité au plus bas pointage (fait confirmé par l'utilisateur : l'égalité est impossible) ; `S.history.length` = nombre d'actions validées ; aucune erreur console.
- `run.mjs` : enchaîne tout sur les deux gabarits, affiche une ligne PASS / FAIL par vérification et un total, code de sortie ≠ 0 au premier échec.
- `README.md` court dans `tests/` : commande, durée, comment ajouter un scénario par chantier (`tests/scenarios/<id>.mjs`, chargés automatiquement par `run.mjs`).
HORS PÉRIMÈTRE : `kinball.html` (aucune modification, même pour « rendre testable ») ; l'export Excel (CDN bloqué ici) ; un faux `window.claude` (lot B, plus tard) ; la détection de recouvrements.
INVARIANTS À RESPECTER : le banc ne dépend d'aucun réseau ; il fonctionne sur la version actuelle du fichier ET devra continuer de fonctionner après les chantiers C14 à C18 (sélecteurs robustes : identifiants et fonctions globales stables plutôt que textes de boutons).
CRITÈRES D'ACCEPTATION :
1. `node tests/run.mjs` passe entièrement sur le fichier actuel, deux fois de suite, en moins de deux minutes.
2. Une régression volontaire est détectée : sur une COPIE du fichier (jamais l'original) où `awardFaultPoints` ne donne plus de point, `KINBALL_HTML=<copie> node tests/run.mjs` échoue avec un message qui nomme la vérification.
3. Si le banc révèle un vrai défaut de l'app, il est décrit dans le rapport (scénario minimal, attendu, obtenu) et NON corrigé ; le test correspondant est marqué « défaut connu » pour ne pas bloquer les autres chantiers.
VÉRIFICATIONS : sorties complètes des deux exécutions et de l'essai de régression volontaire, citées dans le rapport.
LIVRABLE : rapport au format commun ; la rubrique « À AJOUTER AU GUIDE » décrit le banc en dix lignes.

---

## Fichier : briefs/C13A-moteur-simulation.md

CHANTIER : C13-A — Moteur de simulation embarquable (règles + paramètres + Monte-Carlo), hors du fichier de l'app
MODÈLE : Sonnet 5.5 (codeur). Lis d'abord /home/claude/briefs/00-commun.md (les consignes sur `kinball.html` te concernent en LECTURE seulement).
OBJECTIF : un fichier JavaScript pur, sans DOM, `/home/claude/work/sim/simcore.js`, qui estime par Monte-Carlo les chances de chaque équipe de gagner la période en cours et le match, à partir de l'état d'un match et de son historique ; avec ses tests Node. Il sera collé tel quel dans l'app et exécuté dans un Web Worker par un chantier ultérieur (C13-B) : tu n'écris RIEN dans `kinball.html`.
CONTEXTE : cahier des charges, « Nouvelles fonctionnalités », point 3 (à lire en entier). Le cahier cite `simengine.mjs` et `simstats.mjs` : ces fichiers n'existent plus. Le moteur se reconstruit à partir du cahier et du code réel de l'app, que tu lis sans le modifier : `FORMATS` et `getFormat` (≈ l. 1078), `awardFaultPoints`, `checkPeriodState`, `finishPeriod` (≈ l. 2656–2709), `applyFault`, `applyResult` (≈ l. 2576–2644), `snapshotBefore` (≈ l. 2481).
PÉRIMÈTRE : uniquement `/home/claude/work/sim/` (à créer) : `simcore.js`, `simtest.mjs`, `README.md` (une page : interface, règles, constantes, limites).
FORME IMPOSÉE :
- Tout le moteur tient dans UNE fonction autonome `function KBSimFactory(){ … return {params, run, apply, CONST}; }` qui ne lit aucune variable extérieure (ni `S`, ni `window`, ni `document`, ni `Math.random` : générateur à graine interne, type mulberry32). Ainsi `KBSimFactory.toString()` suffira à fabriquer le Worker. En fin de fichier : export CommonJS conditionnel (`if(typeof module!=='undefined') module.exports = KBSimFactory;`).
- Emplacements d'équipe : chaînes 'Bleu' | 'Gris' | 'Noir' ; `teams` = équipes en jeu (2 ou 3).
RÈGLES DU MOTEUR (fidèles à l'app ; chaque écart = question ouverte, pas une initiative) :
1. État : `{scores, periodWins, eliminated, duelActive, possession}` + `fmt {teams, eliminationAt, periodAt}`. Le moteur refuse (`null`) un format dont `periodAt` est nul.
2. Une possession de l'équipe A : avec la probabilité `fault[A]`, faute directe ; sinon lancer vers une cible T, échappé avec la probabilité `h2h[A][T]`, attrapé sinon.
3. Cible (règle officielle donnée par l'utilisateur : « attaquer le meneur, ou le 2e si on mène soi-même ») : parmi les AUTRES équipes en jeu (non éliminées), celle qui a le plus haut pointage de la période. En duel, l'unique adversaire. Égalité entre les deux adversaires : tirage au sort à parts égales (défaut de l'Orchestrator, constante documentée).
4. Points : faute directe de A → +1 à chaque autre équipe en jeu, A garde le ballon. Ballon échappé par T → +1 à chaque équipe en jeu sauf T (y compris A), T prend le ballon. Ballon attrapé → aucun point, T prend le ballon.
5. Après tout gain de points, comme `checkPeriodState` : (a) si pas en duel, 3 équipes, `eliminationAt` défini et pointage maximal ≥ `eliminationAt` : l'équipe au plus bas pointage est éliminée, le duel commence, et on s'arrête là pour cette action ; égalité au plus bas = impossible selon l'utilisateur → compteur d'anomalies, puis première équipe dans l'ordre Bleu, Gris, Noir comme l'app ; (b) sinon si pointage maximal ≥ `periodAt` : l'équipe en jeu qui l'atteint gagne la période.
6. Reprise du duel après une élimination : l'app demande à l'utilisateur qui reprend le ballon, la règle n'est donc pas dans le code. Défaut : l'équipe qui avait le ballon après l'action si elle est encore en jeu, sinon tirage au sort entre les deux équipes restantes. Constante `DUEL_RESTART` documentée ; à signaler en question ouverte.
7. Fin de période, comme `finishPeriod` : `periodWins[gagnant]++`, pointages à zéro, le ballon va à l'équipe éliminée (3 équipes) ou au perdant (2 équipes), `eliminated = null`, `duelActive = (fmt.teams === 2)`.
8. Fin de match : première équipe à `periodsToWin` périodes gagnées (paramètre ; défaut 4, valeur tirée du cahier, non codée dans l'app aujourd'hui).
9. `possession` nulle dans l'état reçu (tout début de match) : tirage au sort parmi les équipes en jeu, à chaque simulation.
10. Garde-fou : plafond d'actions par simulation ; une simulation qui l'atteint est comptée dans `unfinished`, jamais dans une victoire.
PARAMÈTRES (`params(history, teams)`), d'après le cahier :
- « Actions offensives » d'une équipe A, dans l'ordre : ses `lancer` (`details.attacker === A`, résultat 'attrapé' ou 'échappé') et ses `faute_directe` (`before.possession === A`). Fenêtre = ses 35 dernières actions (`WINDOW = 35`).
- `fault[A] = (fautes_fenêtre + 0.05 × 6) / (actions_fenêtre + 6)` (`FAULT_PRIOR = 0.05`, `PRIOR_WEIGHT = 6`).
- `overall[A]` = % de lancers échappés de A dans sa fenêtre, lissé vers la moyenne de toutes les équipes du match : `(échappés_fenêtre + pool × 6) / (lancers_fenêtre + 6)`, où `pool` = part des lancers échappés sur tout le match, ou `DEFAULT_OFF = 0.35` si aucun lancer. Ce second lissage et la valeur 0.35 sont des choix de l'Orchestrator faute de référence : constantes nommées, signalées dans le README.
- `h2h[A][T] = (échappés_A→T + overall[A] × 6) / (lancers_A→T + 6)`, sur TOUT l'historique du match (pas de fenêtre).
- `confidence[A] = min(1, actions_fenêtre / 35)` (servira à l'opacité des barres).
- Renvoie aussi les compteurs bruts (pour l'écran de détail).
INTERFACE :
- `params(history, teams)` → `{h2h, fault, overall, confidence, counts}`.
- `run({state, fmt, teams, params, n = 1000, seed, periodsToWin = 4})` → `{n, match:{équipe: nb de victoires}, period:{équipe: nb}, unfinished, anomalies, ms}`. Une équipe éliminée a `period` = 0. Si une équipe a déjà `periodsToWin` périodes : 100 % pour elle, sans simuler.
- `apply(state, fmt, teams, action)` → nouvel état, pour une action réelle `{type:'faute', team}` ou `{type:'lancer', attacker, target, caught}` : le même pas de règles que la simulation, exposé pour qu'un rejeu puisse le comparer à l'app.
HORS PÉRIMÈTRE : `kinball.html`, tout affichage, le Worker lui-même, les déclencheurs de recalcul, toute lecture de fichier ou de réseau, la distinction arrêtée / continue (le cahier ne la demande pas).
CRITÈRES D'ACCEPTATION (tous automatisés dans `node sim/simtest.mjs`, sortie PASS / FAIL, code de sortie) :
1. Déterminisme : même entrée et même graine → résultat identique ; graine différente → écart sur le % de match inférieur à 6 points à n = 1000.
2. Symétrie : trois équipes aux paramètres identiques, pointage nul, possession nulle → chacune entre 30 % et 37 % sur 20 000 simulations ; permuter les emplacements permute les résultats.
3. Dominance : augmenter le `h2h` d'une équipe contre les deux autres augmente son % de match ; augmenter son `fault` le diminue.
4. États limites : une équipe à `periodsToWin − 1` périodes et à `periodAt − 1` points en duel domine nettement ; une équipe éliminée a 0 % pour la période mais un % de match > 0 ; `match` + `unfinished` = n ; la somme des `period` = n − unfinished.
5. Fidélité des règles, par `apply` sur des suites d'actions écrites à la main pour 9/11, 11/13, duel 11, duel 13 : élimination au bon seuil, de la bonne équipe ; total des points d'une période à trois équipes hors duel toujours pair ; fin de période au bon seuil ; remise à zéro ; possession de la période suivante ; aucune anomalie d'égalité au plus bas sur 200 000 simulations.
6. Lissage : historique vide → `fault` = 0.05, `h2h` = 0.35 partout, `confidence` = 0 ; 6 lancers tous échappés contre une cible → `h2h` strictement entre `overall` et 1 ; seules les 35 dernières actions comptent pour `fault` et `overall` (test avec 60 actions dont les 25 premières très différentes) ; `h2h` compte tout l'historique.
7. Format libre (`periodAt` nul) → `run` renvoie `null`.
8. Performance : 1 000 simulations depuis un début de match 9/11 en moins de 150 ms sous Node (mesuré, cité dans le rapport).
9. `KBSimFactory.toString()` évalué seul (`new Function('return (' + src + ')()')()`) donne un moteur qui fonctionne : preuve qu'il n'a aucune dépendance extérieure.
VÉRIFICATIONS : sortie complète de `simtest.mjs` ; tableau des % obtenus pour 4 ou 5 états types (début de match, 8-8-6, duel 10-9, 3 périodes à 2) cité dans le rapport pour relecture humaine.
RISQUE À RAPPELER DANS LE RAPPORT : la calibration n'a aucune référence (les simulateurs d'origine sont perdus, aucun match réel n'est disponible ici) ; les tests prouvent la cohérence interne et la fidélité aux règles de l'app, pas la justesse des probabilités.
LIVRABLE : rapport au format commun ; « QUESTIONS OUVERTES » doit lister chaque règle que tu as dû supposer.

---

## Fichier : briefs/C14-fondu-score-elimine.md

CHANTIER : C14 — Fondu du score de l'équipe éliminée pendant le duel
MODÈLE : Sonnet 5.5 (codeur). Lis d'abord /home/claude/briefs/00-commun.md.
OBJECTIF : dès que le duel commence après une élimination, le nombre de points de l'équipe éliminée s'affiche en opacité réduite dans le ruban de pointage ; le fondu disparaît au début de la période suivante.
CONTEXTE : cahier des charges, « Fonctionnalités actuelles à modifier », point 3 (décisions définitives). Guide §4quater (formats, `S.eliminated`, `S.duelActive`).
PÉRIMÈTRE :
- `renderScoreboard()` (≈ l. 2207) : l'élément `.tscore` de l'équipe `t` reçoit une classe (ex. `out`) quand `S.duelActive && S.eliminated === t`.
- CSS-match (≈ l. 115–167) : une règle, ex. `.team-chip .tscore.out{opacity:.35}`.
HORS PÉRIMÈTRE : le nom de l'équipe, la pastille de possession, les pastilles de périodes gagnées (`.twins`) restent pleinement visibles ; aucune modification de `checkPeriodState`, `finishPeriod`, `undo`, ni de l'état `S`.
INVARIANTS À RESPECTER : le rendu ne sauvegarde pas ; règle téléphone préfixée `.phone` seulement si une surcharge est nécessaire ; rien dans `S`.
CRITÈRES D'ACCEPTATION :
1. Format 9/11 et 11/13 : après l'élimination, `getComputedStyle` du score de l'équipe éliminée donne une opacité < 1 ; celle des deux autres scores = 1 ; l'opacité du nom et des pastilles de l'équipe éliminée = 1.
2. Le fondu apparaît dès l'élimination (y compris pendant le choix « qui reprend le ballon »), et disparaît après la fin de période (remise à zéro, 1 400 ms plus tard).
3. Annuler l'action qui a causé l'élimination retire le fondu.
4. Formats duel (2 équipes) et libre : jamais de fondu.
5. Le contraste reste lisible sur les trois fonds d'équipe (bleu, gris, clair de l'équipe Noire) : capture regardée.
VÉRIFICATIONS : scénario Playwright tablette et téléphone (amener une équipe au seuil par des fautes directes des deux autres), aucune erreur console hors référence, captures regardées. Banc d'essai s'il existe.
LIVRABLE : rapport au format commun.

---

## Fichier : briefs/C15-graphique-periodes.md

CHANTIER : C15 — Graphique d'évolution des % offensif et défensif par période
MODÈLE : Sonnet 5.5 (codeur). Lis d'abord /home/claude/briefs/00-commun.md.
OBJECTIF : un nouvel onglet des stats d'un match montre, sur un seul graphique, le % offensif et le % défensif de chaque équipe période par période.
CONTEXTE : cahier des charges, « Nouvelles fonctionnalités », point 1 (lire « Décisions prises » : elles répondent aux questions listées dessous). Guide §4ter (registre `STAT_SECTIONS`), §4septies (`statTable`), §4decies (`showDetails`).
PÉRIMÈTRE :
- Nouvelle fonction de calcul `computeOffDefByPeriod(match)` (à ranger près de `computeOverall`, ≈ l. 2890) : parcourt `(match||S).history`, ne garde que les `lancer` dont `details.result` vaut 'attrapé' ou 'échappé', groupe par `ev.before.period`. Par équipe et par période : `offAtt`/`offSucc` (elle attaque ; succès = échappé) et `defAtt`/`defSucc` (elle est la cible ; succès = attrapé). Le défensif se calcule sur les lancers REÇUS, indépendamment de l'offensif adverse.
- Nouvelle section `sectionMatchEvolution()` + UNE entrée dans `STAT_SECTIONS` : `{id:'periodes', label:'Par période', match:sectionMatchEvolution}` placée juste après « Vue d'ensemble » ; pas de clé `team` (vue par match seulement).
- CSS : quelques règles dans CSS-stats ; surcharge `.phone` si nécessaire.
DÉCISIONS DÉJÀ PRISES (ne pas rouvrir) :
- Graphique en SVG en ligne, sans bibliothèque (aucun CDN de plus). Axe X = numéro de période (seulement les périodes où il y a au moins un lancer), axe Y = 0 à 100 %, repères à 0/25/50/75/100.
- Deux courbes par équipe en jeu (`matchTeams`) : OFF = trait plein + marqueur rond ; DÉF = trait tireté + marqueur carré. Couleur = `TEAM_INK[équipe]` (fond sombre). La forme distingue la mesure, la couleur distingue l'équipe : jamais la couleur seule.
- Petit échantillon : un point calculé sur moins de `EVO_MIN = 5` lancers est tracé quand même, mais pâle (opacité ≈ .4) et à contour pointillé ; la légende l'explique. Aucun lancer = pas de point, et la courbe s'interrompt (pas de trait qui enjambe).
- Sous le graphique, un tableau `statTable()` : une ligne par période, colonnes OFF % et DÉF % par équipe ; les comptages (réussis/tentés) n'apparaissent que si `showDetails` est actif, comme ailleurs. C'est la lecture chiffrée du graphique.
- Pas de découpe par adversaire ni par situation. Pas de feuille d'export dans ce chantier.
- Si l'outil Skill est disponible, charge la skill `dataviz` avant d'écrire le graphique.
HORS PÉRIMÈTRE : `computeH2H`, `computeFaults`, `computeOverall` (lecture seule), cumul d'équipe, export, écran de match.
INVARIANTS À RESPECTER : entrée unique dans `STAT_SECTIONS` ; tableaux par `statTable()` ; `statsRerender` doit rester correct (tri du tableau sans quitter l'onglet) ; aucun état dans `S` ; `escapeHtml` sur les noms d'équipe ; fonctionne en consultation d'un match archivé (`viewingArchive`) sans écrire.
CRITÈRES D'ACCEPTATION :
1. L'onglet « Par période » apparaît dans les stats d'un match (en cours et archivé), pas dans le cumul d'une équipe.
2. Pour un match scénarisé, les pourcentages du tableau et la position des points correspondent à un recalcul indépendant (script de test) ; la somme des `offAtt` par période = nombre de lancers de l'équipe ; la somme des OFF de toutes les périodes redonne le total de `computeOverall()`.
3. 3 équipes : 6 courbes ; duel ou libre à 2 équipes : 4 courbes ; une seule période : des points sans trait, sans erreur.
4. Un point sous 5 lancers est visiblement différent (capture regardée) ; une période sans lancer d'une équipe n'a pas de point.
5. Match sans aucune action : message « Aucune action… », aucune erreur.
6. Lisible sur tablette et téléphone (pas de débordement horizontal de la page ; le graphique se réduit).
VÉRIFICATIONS : scénario Playwright sur 3 périodes au moins (dont une avec une équipe éliminée tôt), tablette et téléphone ; aucune erreur console hors référence ; captures regardées ; banc d'essai s'il existe.
LIVRABLE : rapport au format commun.

---

## Fichier : briefs/C16-phases.md

CHANTIER : C16 — Phases d'une période : début / pré-duel / duel (format 9/11)
MODÈLE : Sonnet 5.5 (codeur). Lis d'abord /home/claude/briefs/00-commun.md.
OBJECTIF : dans les stats d'un match en format 9/11, un filtre Tout / Début / Pré-duel / Duel s'applique au head-to-head et aux fautes ; la phase apparaît aussi comme colonne de l'export « Actions ».
CONTEXTE : cahier des charges, « Nouvelles fonctionnalités », point 2. Guide §4decies (`situationOf`, `situationFilterHTML` : le modèle à imiter), §4quater (`FORMATS`, `getFormat`), §4nonies (export).
RÈGLE (fixée par l'utilisateur) :
- Début : du début de la période jusqu'à ce qu'une équipe atteigne 5 points.
- Pré-duel : de 5 points jusqu'à l'élimination.
- Duel : après l'élimination, jusqu'à la fin de la période.
- L'action qui fait ATTEINDRE 5 points, ou qui provoque l'élimination, compte dans la phase qu'elle termine. Conséquence directe : la phase se lit sur l'état AVANT l'événement (`ev.before`), jamais après.
- Rétroactif : rien n'est stocké dans l'historique, rien ne s'affiche sur l'écran de match.
PÉRIMÈTRE :
- `FORMATS['9_11']` : ajouter `phaseAt:5` (champ facultatif ; absent des autres formats). `getFormat(m)` relit la table par `id` : les matchs déjà enregistrés en 9/11, et ceux d'avant les formats (repli sur 9/11), en profitent sans migration.
- Nouvelle fonction `phaseOf(history, i, fmt)` à côté de `situationOf` (≈ l. 3079) : renvoie `null` si `fmt.phaseAt` est absent ou si `ev.before.scores` manque ; `'duel'` si `ev.before.duelActive` ; sinon `'debut'` si le plus haut pointage de `before.scores` (équipes en jeu) est < `phaseAt`, sinon `'preduel'`. Table `PHASES = [{id,label,short}]` : Début, Pré-duel, Duel.
- `computeH2H(phase)` et `computeFaults(phase)` (≈ l. 2849, 2870), `computeFaultZones(team, phase)` (≈ l. 3601) : paramètre FACULTATIF ; absent ou `'all'` = comportement actuel inchangé (les appels de l'export, l. ≈ 4089–4163, restent sans argument).
- `sectionMatchH2H()` et `sectionMatchFaults()` (≈ l. 3442, 3486), `openFaultDetail()` (≈ l. 3530) : bascule de phase affichée seulement si `getFormat(S).phaseAt` ; état dans des variables de module (`h2hPhase`, `faultPhase`), pas dans `S`. Dans le head-to-head, le filtre de phase se COMBINE avec le filtre arrêtée/continue existant (les deux à la fois). Le détail des fautes d'une équipe suit la phase choisie et le dit dans son sous-titre.
- Composant de bascule : réutiliser le style `.sit-filter` / `.sit-btn` (généraliser `situationFilterHTML` ou écrire `phaseFilterHTML`), avec une ligne d'explication des trois phases.
- Export : `buildActionRows()` (≈ l. 4023) reçoit une colonne « Phase » juste après « Situation » (Début / Pré-duel / Duel pour lancer, faute directe et reprise ; vide quand le format n'a pas de phases).
DÉCISIONS DÉJÀ PRISES (ne pas rouvrir) : 9/11 seulement ; stats d'UN match seulement (pas le cumul d'équipe, pas la heat map, pas l'onglet Joueurs) ; aucun onglet nouveau.
HORS PÉRIMÈTRE : `checkPeriodState`, `commitEvent`, `snapshotBefore`, l'écran de match, `computeTeamAggregate`, `sectionTeamH2H`, la heat map, les feuilles de synthèse de l'export.
INVARIANTS À RESPECTER : aucune donnée stockée en plus ; anciens matchs lisibles ; `statTable` ; `statsRerender` ; rien dans `S` ; signature rétro-compatible des fonctions de calcul.
CRITÈRES D'ACCEPTATION :
1. Match 9/11 scénarisé : pour le head-to-head comme pour les fautes, Début + Pré-duel + Duel = Tout, case par case (tentatives et réussites ; fautes et actions).
2. L'action qui porte le meneur à 5 est comptée en Début ; l'action qui provoque l'élimination est comptée en Pré-duel ; la première action après l'élimination est en Duel ; la première action de la période suivante est en Début.
3. Format 11/13, libre, duel : aucune bascule de phase visible, colonne « Phase » vide, aucun changement de chiffres.
4. Match archivé sans champ `format` : traité comme un 9/11 (bascule visible).
5. Phase « Duel » + situation « Continue » dans le head-to-head : les chiffres correspondent à un recalcul indépendant.
6. `buildActionRows()` : même nombre de lignes qu'avant, une colonne de plus, valeurs conformes au critère 2.
7. Sans filtre, tous les chiffres des onglets Head-to-head et Fautes et toutes les feuilles de synthèse sont identiques à la version d'avant (comparer avec la sauvegarde `kinball.C16.avant.html` sur le même scénario).
VÉRIFICATIONS : scénario Playwright jouant au moins deux périodes complètes en 9/11 (avec élimination et duel) et un début de match en 11/13 ; tablette et téléphone ; aucune erreur console hors référence ; captures regardées ; banc d'essai s'il existe.
LIVRABLE : rapport au format commun.

---

## Fichier : briefs/C17-heat-depart-arrivee.md

CHANTIER : C17 — Heat map : bascule départ / arrivée
MODÈLE : Sonnet 5.5 (codeur). Lis d'abord /home/claude/briefs/00-commun.md.
OBJECTIF : dans l'onglet Heat map (match et cumul d'équipe), chaque mode (offensive, défensive) peut afficher soit le point de départ, soit le point d'arrivée des lancers.
CONTEXTE : cahier des charges, « Fonctionnalités actuelles à modifier », point 2. Guide §4undecies (heat map).
CONSTAT DÉJÀ VÉRIFIÉ PAR L'ORCHESTRATOR (la vérification exigée par le cahier est faite) : `start_norm` ET `end_norm` sont enregistrés ensemble pour chaque lancer, dans l'unique appel `beginEvent('lancer', {attacker, start_norm, end_norm})` (≈ l. 2473). Il n'y a rien à ajouter à la saisie. Seuls des lancers importés d'ailleurs peuvent en être dépourvus : ils sont déjà ignorés (`if(pos)`).
PÉRIMÈTRE :
- `heatPointsFrom(match, slot, mode, situation, point)` (≈ l. 3711) : nouveau paramètre facultatif `point` = `'start'` | `'end'`. Absent : comportement actuel (offensive → départ, défensive → arrivée). Le critère de réussite ne change pas (offensive : échappé ; défensive : attrapé).
- Bascule « DÉPART / ARRIVÉE » dans `heatViewControls()` (≈ l. 3860), sur la même rangée que GRILLE / POINTS et la finesse ; elle vaut pour la vue grille comme pour la vue points.
- État : variables de module, une valeur par mode (ex. `heatPoint = {offense:'start', defense:'end'}` pour le match, l'équivalent pour le cumul d'équipe). Rien dans `S`, aucun `save()`.
- `sectionMatchHeat()` et `sectionTeamHeat()` (≈ l. 3873, 3887) : passent le choix ; le sous-titre décrit ce qu'on regarde (4 cas : d'où partent ses lancers / où arrivent ses lancers / où arrivent les ballons qu'elle reçoit / d'où partent les ballons qu'elle reçoit).
HORS PÉRIMÈTRE : la finesse de grille (un autre chantier, C18, la fixera à 3×3 juste après : n'y touche pas), `heatGridSVG`, les zones, la saisie, l'export.
INVARIANTS À RESPECTER : rien dans `S` ; `statsRerender` ; `.phone` pour toute surcharge téléphone ; le rendu ne sauvegarde pas.
CRITÈRES D'ACCEPTATION :
1. Par défaut, l'affichage est identique à aujourd'hui (offensive = départ, défensive = arrivée).
2. Offensive + ARRIVÉE : les points sont les `end_norm` des lancers de l'équipe ; défensive + DÉPART : les `start_norm` des lancers reçus. Vérifié contre un recalcul indépendant (nombre de points et coordonnées).
3. Le nombre total de lancers et la moyenne affichés ne changent pas quand on bascule (mêmes lancers, autre coordonnée).
4. Le choix est mémorisé séparément pour l'offensive et la défensive pendant la session ; il se combine avec le filtre de situation et avec GRILLE / POINTS.
5. Fonctionne sur le cumul d'une équipe et sur un match archivé.
6. Sur téléphone, la rangée de contrôles ne déborde pas (retour à la ligne accepté).
VÉRIFICATIONS : scénario Playwright avec des lancers dont départ et arrivée sont dans des cases différentes ; tablette et téléphone ; aucune erreur console hors référence ; captures regardées ; banc d'essai s'il existe.
LIVRABLE : rapport au format commun.

---

## Fichier : briefs/C18-grille-3x3.md

CHANTIER : C18 — Une seule grille 3×3 partout (heat map, terrain en direct, stats par zones)
MODÈLE : Sonnet 5.5 (codeur). Lis d'abord /home/claude/briefs/00-commun.md. Chantier transversal : procède par petites éditions et relance les vérifications après chaque étape.
OBJECTIF : l'app n'a plus qu'un système de zonage, une grille 3×3 : la heat map est fixée à 3×3, le terrain de saisie affiche la grille, et les stats par zones (offensive, défensive, fautes directes) passent des 4 zones nommées aux 9 cases.
CONTEXTE : cahier des charges, « Fonctionnalités actuelles à modifier », point 6. Guide §4undecies (heat map), §6 (zones de terrain), §4nonies (export).
ÉTAT ACTUEL (relevé par l'Orchestrator) :
- 4 zones : `ZONES`, `ZONE_LABEL`, `ZONE_COLOR`, `classifyZone(nx, ny)` (≈ l. 3571–3581), `zoneDiagramSVG()` (≈ l. 3613). Utilisées par `computeOverall` (l. 2890), `computeZoneStats`, `computeFaultZones`, `zonesDualTable`, `renderZoneDetail`, `openFaultDetail`, `sectionMatchZones`, `computeTeamAggregate` (≈ l. 4455–4530), `sectionTeamZones`, le détail par adversaire du cumul (≈ l. 4686), et l'export (`zoneAt` l. 4018, `zoneAoa` l. 4101).
- Heat map : `HEAT_GRIDS = [3,4,5]`, `S.heatGrid` (défaut 5 dans `freshState`), `teamHeatGrid`, `setHeatGrid`, `setTeamHeatGrid`, sélecteur de finesse dans `heatViewControls`, conseil « une grille plus large… » dans `heatFieldHTML`.
- DÉFAUT À CORRIGER AU PASSAGE : `heatGridSVG` et `heatFilledCells` ignorent en silence tout point hors de [0,1[ (un glisser qui finit hors du terrain donne une coordonnée < 0 ou ≥ 1), alors que `classifyZone` les compte en bord ou en coin. Avec la grille unique, chaque lancer localisé doit tomber dans exactement une case : coordonnées bornées à [0,1] au moment du classement (les données stockées ne sont pas modifiées).
PÉRIMÈTRE :
1. Une seule fonction de classement, utilisée partout : `classifyZone(nx, ny)` renvoie désormais l'identifiant d'une des 9 cases (colonne = ⌊3·x⌋, ligne = ⌊3·y⌋, après bornage). `ZONES` = les 9 identifiants, de gauche à droite puis de haut en bas ; `ZONE_LABEL` = « Haut gauche », « Haut centre », « Haut droite », « Milieu gauche », « Centre », « Milieu droite », « Bas gauche », « Bas centre », « Bas droite » (tels que vus à l'écran de saisie). Garder les noms `ZONES` / `ZONE_LABEL` / `classifyZone` limite le nombre d'endroits à modifier.
2. `heatGridSVG` / `heatFilledCells` : n = 3 fixe, et le même classement que ci-dessus. Suppression de `HEAT_GRIDS`, du sélecteur de finesse, de `setHeatGrid` / `setTeamHeatGrid` / `teamHeatGrid`, du conseil « grille plus large », et de `heatGrid` dans `freshState` (les anciens matchs portent encore ce champ : il est simplement ignoré). La bascule GRILLE / POINTS et la bascule DÉPART / ARRIVÉE (chantier C17, déjà en place) restent.
3. Terrain de saisie (`#field`, HTML ≈ l. 986–994) : un calque de grille 3×3 purement visuel (deux lignes verticales et deux horizontales aux tiers), discret et distinct des lignes officielles du terrain (qui restent). Il ne capte aucun événement de pointeur et ne change rien à `fieldPoint()`.
4. Schéma des zones : `zoneDiagramSVG()` devient un schéma 3×3 aux cases numérotées 1 à 9, lignes du terrain par-dessus ; dans les tableaux, la pastille de couleur (`ZONE_COLOR`) est remplacée par le numéro de case, repris à l'identique dans le schéma. `ZONE_COLOR` disparaît.
5. Tous les tableaux de zones (match, détail d'un duel, détail des fautes, cumul d'équipe, détail par adversaire) et l'export (`zoneAt`, `zoneAoa`, colonnes « Zone de départ » / « Zone d'arrivée ») passent aux 9 cases par le seul changement de `ZONES` / `ZONE_LABEL` / `classifyZone` ; vérifie chacun.
6. Textes d'aide et sous-titres : remplacer toute mention des 4 zones.
HORS PÉRIMÈTRE : la saisie elle-même (`pointerdown/up`, `beginEvent`), les données stockées, `checkPeriodState`, les onglets autres que Zones / Fautes / Heat map, toute nouvelle statistique.
INVARIANTS À RESPECTER : aucune migration (le zonage se calcule à la lecture, donc les anciens matchs se relisent en 3×3) ; `statTable` ; `.phone` ; rien dans `S` ; le rendu ne sauvegarde pas.
CRITÈRES D'ACCEPTATION :
1. `grep` ne trouve plus `centre_decale`, `HEAT_GRIDS`, `setHeatGrid`, `4×4`, `5×5`, ni « Bord de ligne » / « Coin » dans le fichier.
2. `classifyZone(0.5,0.5)` = Centre ; `(0.05,0.05)` = Haut gauche ; `(0.99,0.5)` = Milieu droite ; `(1.2,-0.1)` = Haut droite ; `(0.3333,0.6667)` cohérent avec la heat map (même case des deux côtés).
3. Pour un match scénarisé avec des lancers finissant hors du terrain : la somme des 9 cases de la heat map = le nombre de lancers localisés = la somme des 9 lignes du tableau de zones (offensive au départ, défensive à l'arrivée).
4. Les totaux OFF % / DÉF % de la vue d'ensemble, du head-to-head et du classement sont inchangés par rapport à la sauvegarde `kinball.C18.avant.html` sur le même scénario (seule la ventilation par zone change).
5. Écran de match : la grille est visible sur tablette et téléphone, les étiquettes (période, situation, duel) restent lisibles, et un glisser ou un appui posé SUR une ligne de la grille est saisi normalement.
6. Heat map : plus aucun choix de finesse ; 9 cases ; cases sous 3 lancers toujours hachurées.
7. Export : `buildActionRows()` et `zoneAoa()` donnent les nouveaux libellés ; le nombre de lignes de `zoneAoa()` passe à 9 par équipe et par mode.
8. Cumul d'une équipe (zones, fautes, détail par adversaire) et match archivé : affichés sans erreur.
VÉRIFICATIONS : scénario Playwright complet tablette et téléphone ; aucune erreur console hors référence ; captures regardées de l'écran de match, de l'onglet Zones, du détail des fautes et de la heat map ; banc d'essai s'il existe.
LIVRABLE : rapport au format commun, avec le texte de remplacement pour le guide (§6 « Zones de terrain » et §4undecies « Finesse réglable »).

---

## Fichier : briefs/AUD1-audit-vague-1.md

CHANTIER : AUD-1 — Audit de fin de vague 1 (aucune modification)
MODÈLE : agent d'audit. Lis d'abord /home/claude/briefs/00-commun.md. Tu n'écris AUCUN code de l'app, tu ne corriges ni l'app ni les scripts de test : tu exécutes, tu regardes, tu rapportes.
OBJECTIF : dire si `/home/claude/work/kinball.html`, après les chantiers C14, C15, C16, C17 et C18, peut être livré à l'utilisateur.
CONTEXTE : briefs `/home/claude/briefs/C14…C18` (leurs critères d'acceptation sont ta liste de contrôle) ; fichier d'origine `/home/claude/work/backups/kinball.C14.avant.html` ; banc `/home/claude/work/tests/run.mjs` ; moteur `/home/claude/work/sim/` (C13-A, hors app).
PÉRIMÈTRE DES CONTRÔLES :
1. `node tests/run.mjs` sur le fichier final, tablette et téléphone ; puis sur le fichier d'origine (pour distinguer une régression d'un défaut ancien).
2. Chaque critère d'acceptation des cinq briefs : vérifié par toi, indépendamment de ce qu'affirme le rapport du codeur. Verdict par critère : conforme / non conforme / non vérifiable (dire pourquoi).
3. Non-régression chiffrée : sur un même match scénarisé joué dans l'ancienne et la nouvelle version, comparer vue d'ensemble, head-to-head sans filtre, fautes, joueurs, et `buildActionRows()` colonne par colonne (seules différences admises : colonne « Phase », libellés de zones).
4. Intégrité des données : la forme de `S` et d'un événement de `history` n'a perdu aucun champ ; les seuls changements admis sont l'ajout de `phaseAt` dans `FORMATS['9_11']` et la disparition de `heatGrid` de `freshState`. Un état `S` produit par l'ancienne version se charge et s'affiche dans la nouvelle (le coller dans `S`, ouvrir chaque onglet de stats).
5. `diff` entre origine et final : lister les fonctions touchées et signaler toute modification hors des périmètres déclarés (navigation, sauvegarde, stockage, `commitEvent`, `checkPeriodState`, `undo` ne doivent pas avoir bougé).
6. Captures regardées, tablette et téléphone : écran de match (grille 3×3, score en fondu pendant un duel), onglets Par période, Head-to-head et Fautes avec filtre de phase, Zones, Heat map avec bascule départ / arrivée.
7. `node sim/simtest.mjs` : résultat, et relecture critique de la table des probabilités par état type (plausible ou non, et pourquoi).
LIVRABLE : rapport au format commun, « STATUT » remplacé par un verdict : LIVRABLE / LIVRABLE AVEC RÉSERVES / NON LIVRABLE, suivi des constats classés par gravité (bloquant, gênant, cosmétique), chacun avec scénario minimal, attendu, obtenu.
