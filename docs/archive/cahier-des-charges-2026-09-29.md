> **Archive (rapatriée du Projet claude.ai le 2026-10-16).** Cahier des charges d'origine, livré par les vagues 1 à 5. Il ne fait plus foi : le code et `docs/*.md` décrivent ce qui existe, `docs/decisions.md` dit pourquoi. La seule idée non réalisée (graphique du % de victoire au fil du match, « Backlog » en bas) est reprise dans `docs/chantiers.md` (ligne F8).

# Cahier des charges — App stats Kin-ball

Sep 29, 2026 · @Guillaume

Ce document sert a planifier ensemble les prochaines fonctionnalites de l'app avant de les coder : on decrit chaque feature (objectif, comportement attendu, cas limites, decisions prises), puis on l'implemente une fois que c'est clair.

## Etat des lieux

- Prise de stats en direct (tap = faute directe/reprise, glisser = lancer attrape/echappe), formats 9/11, 11/13, libre et duel a 2 equipes, alignement optionnel de 4 joueurs par equipe.
- Suivi automatique arrete/continu, elimination a seuil + duel, fin de periode (auto ou bouton en format libre), match complet jusqu'a 4 periodes gagnees.
- Fin de match avec ou sans enregistrement (double confirmation par hold), annulation de la derniere action, changement de joueur en cours de match.
- Stats : vue d'ensemble, head-to-head (avec filtre arrete/continu), zones (carte du terrain), fautes (8 types nommes), joueurs.
- Export par match (Excel, CSV actions, CSV donnees brutes, JSON) et sauvegarde complete (tous les matchs/equipes + corbeille).
- Partage via claude.ai (Contributeur recommande), base de donnees partagee entre tous les utilisateurs ayant acces.

## Nouvelles fonctionnalites a ajouter

### 1. Graphique d'evolution des % off/def par periode

**Objectif.** Voir comment le % offensif et le % defensif de chaque equipe evoluent periode par periode dans un match, en un coup d'oeil.

**Comportement attendu.**

- Un seul graphique par match, toutes les equipes superposees dessus.
- Deux courbes par equipe : offensif et defensif (donc jusqu'a 6 courbes a 3 equipes).
- Axe X = numero de periode (1, 2, 3...), axe Y = %.
- On garde seulement les % overall (pas de decoupe par adversaire ni par arrete/continu) pour eviter de fragmenter la donnee.
- % offensif d'une equipe pour une periode = % de ses lancers qui sont echappes par la cible (comme la definition actuelle du head-to-head).
- % defensif d'une equipe pour une periode = % des lancers RECUS (elle etait la cible) qu'elle a attrapes -- calcule independamment, pas derive de l'offensif adverse (une equipe peut etre ciblee par 2 equipes differentes).

**Decisions prises.**

- Nouvel onglet dedie dans les stats du match (a cote de Vue d'ensemble, Head-to-head, Zones, Fautes, Joueurs).
- S'applique a tous les formats (3 equipes ET duel/libre) -- juste moins de courbes en duel.
- Point d'une equipe eliminee tot dans une periode (peu de lancers) : affiche quand meme, mais marque differemment (ex. point plus pale/pointille) pour signaler le petit echantillon.
- Vue par match seulement pour l'instant; une version agregee sur l'historique d'une equipe serait une feature separee, plus tard.

* Ce graphique vit ou dans l'UI (nouvel onglet stats du match, ou ajoute a un onglet existant comme Vue d'ensemble)?
* Que faire d'une periode ou une equipe est eliminee tot (peu de lancers, donc % peu fiable) -- afficher quand meme, ou marquer differemment?
* S'applique-t-il aussi aux formats duel/libre (2 equipes, pas d'elimination), ou seulement aux formats a 3 equipes?
* Vue par match seulement, ou aussi une version agregee sur l'historique complet d'une equipe?

**Notes techniques.** Reutiliser la logique de `computeH2H()`/`computeFaults()` (parcours de `S.history` avec situation figee par evenement) pour batir un nouveau `computeOffDefByPeriod()` qui groupe par `ev.before.period` plutot que par paire attaquant/cible.

### 2. Diviser chaque periode en 3 temps (debut / pre-duel / duel)

**Objectif.** Pour les matchs officiels en format 9/11, decouper l'analyse d'une periode en 3 phases pour voir comment le jeu differe selon le moment de la periode.

**Comportement attendu.**

- **Debut** : tous les lancers/fautes depuis le debut de la periode jusqu'a ce qu'une equipe atteigne 5 points.
- **Pre-duel** : de 5 points jusqu'a l'elimination (une equipe atteint 9 points, la derniere est eliminee).
- **Duel** : tout ce qui se passe apres l'elimination, jusqu'a la fin de la periode (11 points ou egalite tranchee).
- Implemente pour le format 9/11 seulement pour l'instant (pas 11/13, pas libre, pas duel a 2 equipes).
- Rétroactif seulement : nouveau filtre dans les stats (comme le filtre arrete/continu existant), rien de visible a l'ecran pendant la prise de stats en direct.

**Decisions prises.**

- L'action qui fait ATTEINDRE exactement 5 ou 9 points compte dans la phase qu'elle termine (coherent avec la logique d'elimination deja codee).
- Le filtre debut/pre-duel/duel s'ajoute partout ou le filtre arrete/continu existe deja : head-to-head ET fautes.

* L'action qui fait ATTEINDRE exactement 5 (ou 9) points : comptee dans la phase qu'elle termine, ou dans la phase suivante? (a trancher, probablement "dans la phase qu'elle termine", par coherence avec la logique d'elimination existante)
* Ce filtre s'ajoute-t-il partout ou le filtre arrete/continu existe deja (head-to-head, fautes), ou seulement a certains ecrans?
* Lien avec la feature 1 (graphique par periode) : les % par phase pourraient aussi etre affiches en sous-decoupe du graphique plus tard, mais pas demande pour l'instant.

**Notes techniques.** Nouvelle fonction `phaseOf(history, index)` (miroir de `situationOf()`) qui recalcule, a partir du score au moment de l'evenement, si on etait en debut/pre-duel/duel -- pas besoin de stocker la phase dans l'historique, comme pour arrete/continu.

### 3. Pourcentage de victoire en direct (façon poker)

**Objectif**

Afficher, pendant un match en cours, une estimation en temps réel des chances de victoire de chaque équipe (comme l'indicateur d'équité au poker), basée sur les statistiques accumulées jusqu'à ce moment dans le match.

**Comportement attendu**

- Le % de victoire de chaque équipe est calculé via une simulation Monte-Carlo (même moteur que celui développé et validé ensemble : règles de ciblage officielles — attaquer le meneur, ou le 2e si on mène soi-même —, élimination/duel en format 9/11, etc.), rejouée virtuellement plusieurs milliers de fois à partir de l'état actuel du match (pointage, période, équipe éliminée, duel en cours) et des stats accumulées jusqu'à maintenant.
- Chaque équipe affiche **deux barres** dans le ruban de pointage : une pour ses chances de gagner le **match**, une pour ses chances de gagner la **période en cours** — toutes deux mises à jour aux mêmes moments de recalcul.
- Recalcul déclenché : à chaque tranche de **3 événements** (fautes directes + lancers échappés combinés) hors duel; **à chaque événement** pendant le duel (2 équipes actives); et systématiquement à la fin de chaque période.

**Décisions prises**

- Source des données : le match en cours seulement (pas d'historique d'équipes mélangé).
- Granularité statistique : tête-à-tête entre les équipes (attaquant vs cible), et non un % global comme pour la feature 1 — nécessite un lissage vers la moyenne globale de l'équipe (même méthode que dans le simulateur : pondération vers le % global tant que l'échantillon tête-à-tête est petit), puisque les données du match en cours seront souvent limitées, surtout en début de partie.
- Tendance récente : le % offensif global et le % de faute directe de chaque équipe (utilisés comme *prior* pour le lissage tête-à-tête) sont calculés sur une **fenêtre glissante des 35 derniers lancers** de l'équipe (tous adversaires confondus), plutôt que sur l'ensemble du match — pour capter si une équipe devient plus ou moins efficace en cours de match. Le tête-à-tête lui-même reste cumulatif sur tout le match (échantillon trop petit pour être aussi fenetre).
- Affichage : deux barres de progression par équipe, intégrées au ruban de pointage en haut (là où se trouvent déjà les pastilles de périodes gagnées) — une barre plus visible pour le % de victoire du **match**, une barre plus discrète pour le % de victoire de la **période en cours**.
- Équipe éliminée avant/pendant le duel : sa barre de **période** tombe à 0 % (elle ne peut plus gagner cette période-ci), mais sa barre de **match** continue d'être calculée normalement par la simulation complète — celle-ci tient déjà compte du fait qu'elle a perdu la période en cours (voir Notes techniques : état initial de la simulation inclut `eliminated`/`duelActive`).
- Fréquence de recalcul : tous les **3 événements** combinés hors duel (fautes/échappés, pas un compte de points — un événement ne vaut pas toujours le même nombre de points selon la phase du jeu); **à chaque événement** pendant le duel (recalcul plus fréquent, l'enjeu étant plus immédiat à 2 équipes actives); et à chaque fin de période.
- Avant le premier recalcul (tout début de match, aucune donnée) : affichage par défaut à parts égales entre les équipes actives (ex. 33 %/33 %/33 % pour un format à 3 équipes), le temps que le premier seuil soit atteint.
- Portée : **tous les formats où `periodAt` est défini** (9/11, 11/13, Duel 11, Duel 13) — le moteur lit les seuils `eliminationAt`/`periodAt`/`teams` du format réel du match (table `FORMATS` déjà existante dans l'app) plutôt qu'un format câblé en dur. Exclu : Libre et Duel libre (`periodAt: null`), où il n'y a structurellement aucun seuil de fin de période à simuler.
- Faute directe : même lissage bayésien formel que pour le tête-à-tête, avec un **prior de 5 % et le même `PRIOR_WEIGHT = 6`** (`faultPct = (fautes + 0.05×6) / (tentatives + 6)`) plutôt qu'un cas spécial « si 0 tentative, 5 % ». Cohérent avec le traitement du h2h, et lisse aussi les tout premiers lancers (pas juste le 0e).
- Performance : le calcul (1000 simulations) tourne dans un **Web Worker dès le départ**, pour ne jamais bloquer l'interface tactile pendant la prise de stats.
- Affichage entre deux recalculs : les barres font une **transition animée en douceur** vers la nouvelle valeur plutôt qu'un saut instantané, pour atténuer le bruit statistique naturel (\~±3 %) d'un recalcul à l'autre.
- Fin de match : les deux barres **disparaissent** une fois le match terminé (le ruban revient à un affichage simple).
- Indicateur d'incertitude en début de match : **opacité réduite** de la barre (ex. 40 % → 100 %) proportionnelle au nombre de lancers accumulés par l'équipe vers le seuil de la fenêtre glissante (35 lancers) — aucun texte ajouté, on réutilise un seuil déjà décidé plutôt que d'en inventer un nouveau.
- Annulation de la dernière action (undo) : **recalcul immédiat** des % après une annulation, pour que les barres reflètent toujours l'historique réel sans attendre le prochain seuil de 3 fautes/échappés.
- Détail au toucher : un appui sur une barre révèle le détail du calcul (ex. nombre de simulations gagnées sur 1000) -- inclus **dès le premier jet**, pas reporté à plus tard.
  - Concurrence des recalculs (Web Worker) : chaque déclenchement envoie un **`requestId`** incrémental; l'app n'applique que la réponse dont le `requestId` correspond à la dernière requête envoyée (les réponses obsolètes sont ignorées). Si un nouveau déclencheur arrive pendant qu'un calcul tourne déjà, on attend la fin du calcul en cours puis on relance une seule fois si l'état a encore changé (pas de rafale de requêtes lors d'annulations rapides successives).

**Notes techniques**

- Réutiliser/adapter directement le moteur `simengine.mjs` développé lors de nos simulations (règles de ciblage corrigées : attaque du meneur/2e-si-meneur, logique fidèle à `checkPeriodState`/`awardFaultPoints`/`finishPeriod` de kinball.html) comme moteur de simulation embarqué dans l'app, initialisé avec l'état réel du match en cours (`scores`, `periodWins`, `eliminated`, `duelActive`, `possession`) plutôt qu'un match vide.
  - Moteur paramétré par format : lire `eliminationAt`/`periodAt`/`teams` depuis l'entrée `FORMATS` du match en cours (comme `checkPeriodState()` le fait déjà ailleurs dans l'app) plutôt qu'un `FMT` câblé en dur pour le 9/11. La feature ne s'active que si `periodAt` est défini pour ce format.
  - Déclencheur de recalcul basé sur un **compte d'événements** (3 fautes/échappés), pas sur un compte de points : pendant le duel (2 équipes actives), un événement ne crédite qu'une seule équipe (+1 point), contre 2 équipes (+2 points) hors duel — le seuil « 6 points » ne serait donc pas fiable partout.
- Les probabilités tête-à-tête (`h2hPct`) et de faute directe (`faultPct`) sont recalculées à partir de `history` du match en cours à chaque déclenchement, avec lissage progressif vers la moyenne globale de l'équipe : poids du prior fixé à **`PRIOR_WEIGHT = 6`** lancers virtuels (même valeur que dans `simstats.mjs`, validée lors de nos simulations).
  - Fenêtre glissante de **35 lancers** : au recalcul, ne garder que les 35 derniers lancers/fautes de chaque équipe (peu importe la cible) pour calculer `teamOverall.pct` et `faultPct` utilisés comme prior de lissage; `h2hPct` reste basé sur tout l'historique du match en cours (pas de fenêtre, échantillon déjà petit par paire).
    - `faultPct` lisse avec la **même formule** que `h2hPct` : `faultPct[équipe] = (fautes + 0.05 × PRIOR_WEIGHT) / (tentatives + PRIOR_WEIGHT)`, prior fixe de 5 %, `PRIOR_WEIGHT = 6` — traitement identique au h2h plutôt qu'un cas spécial à 0 tentative.
- Nombre de simulations par recalcul : **1000** (decision prise, coherent avec le nombre deja utilise et valide dans notre simulateur de match).
- Calcul entièrement côté client (JS), sans appel réseau.

## Fonctionnalites actuelles a modifier

### 1. Indicateur visuel attrapé/échappé

**Comportement actuel.** Un lancer est marqué par un croche ou un X. Ambigu : le crochet signifie-t-il que le lancer a été attrapé (succès défensif), ou qu'il a été échappé (succès offensif)? Les deux lectures sont plausibles, et le symbole encode un jugement de succès sans dire succès pour qui.

**Comportement voulu.** Un indicateur qui décrit le fait (attrapé ou échappé) sans ambiguïté de lecture, idéalement sans avoir à décoder un symbole abstrait.

**Options proposées (non tranchées) :**

- **A. Mots explicites** : « ATTRAPÉ » / « ÉCHAPPÉ » en toutes lettres, plutôt qu'un symbole.
- **B. Icônes d'action physique** : une main qui attrape le ballon vs un ballon qui touche le sol/rebondit — décrit le fait physique plutôt qu'un verdict de succès/échec.
- **C. Couleur de l'équipe qui marque le point** : le fond/contour prend la couleur de l'équipe qui reçoit le point (attaquant si échappé, défenseur si attrapé), répondant directement à « qui vient de marquer ».
- **D. Combinaison B + C** : icône d'action physique ET couleur de l'équipe qui marque.

**À faire avant implémentation.** Aucune option n'est encore choisie. Avant de lancer le développement de ce point dans Claude Code, s'assurer que l'agent **demande explicitement** laquelle des options A–D (ou une autre) utiliser plutôt que de choisir seul.

**Décision prise (complément) :** une 3e option s'ajoute à côté d'ATTRAPÉ/ÉCHAPPÉ : **DÉF ILL** (défensive illégale), affichée dans une taille plus petite que les deux autres options. Cette faute survient avant la frappe elle-même : on ne demande jamais d'identifier quel joueur a frappé pour cet événement (le choix DÉF ILL ne passe pas par le menu radial des joueurs de la feature 5 ci-dessous).

### 2. Heat map : point de départ ET point d'arrivée

**Comportement actuel.** Selon le guide d'architecture, `computeOverall()` utilise déjà `start_norm` pour l'offensive et `end_norm` pour la défensive dans le calcul par zones — les deux coordonnées semblent donc déjà exister par lancer. Mais la heat map elle-même (`heatPointsFrom()`) n'affiche qu'**un seul point par mode** : l'offensive montre seulement le point de départ, la défensive seulement le point d'arrivée — jamais les deux vues pour un même mode.

**Comportement voulu.** Enregistrer systématiquement le point de départ ET le point d'arrivée pour chaque lancer, autant offensif que défensif, pour disposer de toutes les données nécessaires à l'analyse. Ajouter des options de visualisation pour choisir quelle heat map regarder.

**Décisions prises :**

- Deux heat maps (offensive et défensive, comme actuellement) avec un **bouton de bascule départ/arrivée** sur chacune, plutôt que 4 heat maps séparées.
- Le sélecteur de bascule vit **dans l'onglet Heat map existant**, à côté du choix de finesse de grille (3×3/4×4/5×5) déjà présent.

**À faire avant implémentation.** Vérifier dans le code que `start_norm` et `end_norm` sont bel et bien enregistrés pour **chaque** lancer (pas seulement utilisés sélectivement selon le mode) avant de bâtir les nouvelles vues — pour éviter de découvrir un trou de données en cours de développement.

### 3. Fondu du score de l'équipe éliminée pendant le duel

**Comportement actuel.** En format 9/11 ou 11/13, une fois le duel commencé (élimination), le score de l'équipe éliminée reste affiché normalement dans le ruban de pointage, alors qu'il ne compte plus pour la période en cours.

**Comportement voulu.** Dès que le duel commence, le score de l'équipe éliminée s'affiche **en fondu (opacité réduite)** dans le ruban, pour signaler visuellement qu'il ne compte plus pour cette période.

**Décisions prises :**

- Le fondu s'applique au **score seulement** (le nombre de points) — le nom de l'équipe et les pastilles de périodes gagnées restent pleinement visibles.
- Le fondu se retire automatiquement au début de la période suivante, quand l'équipe redevient active.

Confirmé avec l'utilisateur — les deux points ci-dessus sont définitifs, prêts pour l'implémentation.

### 4. Changement de joueurs par glisser-déposé

**Comportement actuel.** Toucher le bloc d'une équipe ouvre ses joueurs : toucher celui qui sort, puis celui qui entre — un seul changement à la fois.

**Comportement voulu.** Permettre plusieurs changements en une seule interaction, via glisser-déposé :

- Toucher le symbole de changement fait apparaître les **joueurs actifs sur le terrain**, positionnés grosso modo chacun dans son coin, mais près du centre.
- Les **joueurs sur le banc** apparaissent groupés sous la couleur de l'équipe, en dessous — distinction visuelle claire entre qui est actif et qui est sur le banc.
- Glisser un joueur du banc sur un joueur du terrain les échange. Peut se faire plusieurs fois de suite sans mode spécial à activer/désactiver, permettant autant de changements qu'on veut en une seule visite à cet écran.

**Notes techniques.** Remplace/étend l'interaction actuelle (`toucher qui sort, toucher qui entre`) décrite dans le guide d'architecture (§4quinquies).

### 5. Emplacement des zones de saisie (joueur + équipe ciblée)

**Comportement actuel.** Les zones permettant d'indiquer quel joueur a frappé et quelle équipe a attrapé/échappé le ballon sont situées au bas de l'écran. Sur téléphone, comme les lancers sont fréquents, le pouce doit faire l'aller-retour entre le milieu de l'écran (où se déroule le jeu visuellement) et le bas (zones de saisie) à répétition, ce qui demande plus de précision tactile et ralentit la prise de stats.

**Comportement voulu.** Rapprocher les deux saisies (joueur, équipe ciblée) du point de contact du doigt plutôt que de les fixer au bas de l'écran.

**Décisions prises :**

- Sélection du joueur : **menu radial** apparaissant directement à l'endroit où l'on touche l'écran, avec les 4 joueurs disposés autour et le symbole **?** (joueur inconnu/non identifié) au centre.
- Sélection de l'équipe ciblée (attrapé/échappé) : **zones contextuelles**, dans la continuité du geste. Une fois le joueur choisi dans le menu radial, les 2 options d'équipe apparaissent dans un second temps, juste à côté, toujours proches du dernier point de contact — plutôt qu'à une position fixe au bas de l'écran. Permet d'enchaîner les deux sélections (joueur, puis équipe) sans déplacer le doigt vers une zone éloignée.

**Notes techniques.** Lié à la feature « 1. Indicateur visuel attrapé/échappé » ci-dessus (ambiguïté du symbole) — l'affichage de ces zones contextuelles (couleur, icône/texte) suivra la décision qui sera prise sur les options A–D une fois tranchée.

Conséquence de l'ajout de l'option **DÉF ILL** (feature 1 ci-dessus) : comme cette faute ne demande jamais de joueur, le choix DÉF ILL doit rester accessible **sans passer par le menu radial des joueurs** — par exemple directement depuis l'écran principal ou via un raccourci vers les zones contextuelles, plutôt que d'obliger un choix de joueur fantôme avant d'y accéder.

### 6. Grille 3×3 partout : heat map simplifiée, terrain en direct, et fusion des zones

**Comportement actuel.**

- Heat map : finesse réglable 3×3 / 4×4 / 5×5 (5×5 par défaut).
- Écran de stats principal (prise en direct) : terrain sans grille visuelle superposée.
- Stats par zones (offensive/défensive et fautes directes) : système séparé à **4 zones** (centre, centre décalé, bord de ligne, coin), cliquables depuis les stats.

**Comportement voulu.**

- Heat map : grille fixée à **3×3 seulement** (4×4 et 5×5 retirés — trop de lancers nécessaires pour remplir une grille plus fine de façon fiable).
- Terrain de l'écran de stats principal (prise en direct) : affichage d'une **grille 3×3** par-dessus le terrain, pour aider le marqueur à se situer visuellement au moment de taper.
- Stats par zones (zones offensive/défensive et zones de fautes directes) : le système à 4 zones est retiré, remplacé par la **même grille 3×3** que la heat map — un seul système de zonage dans toute l'app plutôt que deux en parallèle.

**Décisions prises :**

- Une seule grille **3×3**, utilisée partout (heat map, terrain en direct, stats par zones). Fin du sélecteur de finesse (plus de choix à faire) et du système à 4 zones nommées.
- Les stats de zones offensive/défensive et de fautes directes, actuellement basées sur les 4 zones (centre, centre décalé, bord de ligne, coin), sont reconstruites sur la grille 3×3.

**Notes techniques.** Impacte `heatPointsFrom()`/`heatGridSVG()` (finesse forcée à 3×3, suppression du sélecteur), le tracé du terrain de l'écran de prise de stats en direct (ajout d'un calque grille purement visuel), et le système « zones de terrain » décrit au guide d'architecture (4 zones dérivées des proportions du tracé du terrain), à remplacer par un découpage en 9 cases (3×3) pour les stats de zones offensive/défensive et de fautes directes.

## Backlog (idees pas encore discutees)

- **Graphique d'évolution du % de victoire au fil du match** (à la manière d'un « win probability chart » des diffusions sportives) : un mini-graphique montrant comment le % de victoire de chaque équipe a changé à chaque recalcul de la feature 3, consultable après le match. Déborde du scope actuel (affichage en direct seulement) -- feature suite naturelle à explorer plus tard.
