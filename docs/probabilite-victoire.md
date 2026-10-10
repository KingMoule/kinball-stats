# Probabilité de victoire en direct

Pendant un match, chaque bloc d'équipe du ruban de pointage montre deux barres : les chances de gagner le match et de gagner la période en cours, estimées par 1 000 simulations rejouées depuis l'état réel du match. **Ces chiffres ne sont pas calibrés** : ils ne sont jamais présentés comme validés.

## Le moteur : `sim/simcore.js`

JavaScript pur, sans DOM ni réseau. Tout est dans une seule fonction autonome, `KBSimFactory()`, qui ne lit aucune variable extérieure (graine interne mulberry32, pas de `Math.random`). `KBSimFactory.toString()` suffit donc à fabriquer un Web Worker dans un fichier unique. Le moteur est collé tel quel dans `index.html`, juste après `undo()` ; **`sim/simcore.js` reste la source** : pour le changer, recoller la fonction et relancer la suite `C13B` du banc, dont une vérification compare les deux textes. Tests : `node sim/simtest.mjs` (« TOUT PASSE ») ; `--table` affiche les probabilités d'états types ; `sim/README.md` détaille l'interface.

Interface : `params(history, teams)` estime les paramètres depuis l'historique ; `run({state, fmt, teams, params, n, seed, periodsToWin})` joue `n` matchs et compte les victoires de match et de période (`null` pour un format sans `periodAt`) ; `apply(state, fmt, teams, action)` applique une action réelle (c'est par elle que le rejeu du banc vérifie que moteur et app suivent les mêmes règles).

Règles reprises de l'app (`awardFaultPoints`, `checkPeriodState`, `finishPeriod`) : faute directe = +1 à chaque autre équipe en jeu, le fautif garde le ballon ; ballon échappé = +1 à toutes les équipes en jeu sauf la cible, qui prend le ballon ; ballon attrapé = aucun point ; élimination de la plus basse au seuil ; fin de période au seuil ; ballon à l'éliminée (ou au perdant du duel) à la période suivante. Une DÉF ILL est un ballon échappé pour le moteur.

Paramètres estimés : fenêtre des 35 dernières actions offensives de l'équipe ; probabilité de faute lissée vers 5 % ; pourcentage offensif lissé vers la moyenne du match (poids 6, 0,35 sans aucun lancer) ; détail par cible lissé vers le pourcentage offensif de l'équipe. `confidence` (0 à 1) dit combien d'actions nourrissent l'estimation.

### Hypothèses sans référence

Les simulateurs d'origine sont perdus. Chaque hypothèse est une constante nommée de `CONST`, à faire valider par l'utilisateur :

| Hypothèse | Valeur |
|---|---|
| Un match se gagne à N périodes (l'app ne termine jamais un match seule) | `PERIODS_TO_WIN = 4`, valeur du cahier des charges |
| Reprise du duel après une élimination | `DUEL_RESTART = 'holder-else-coin'` : l'équipe qui a le ballon si elle est encore en jeu, sinon tirage au sort |
| Cible quand les deux adversaires sont à égalité | `TIE_TARGET = 'coin'` : tirage au sort (la règle officielle est « attaquer le meneur, ou le deuxième si on mène soi-même ») |
| Pourcentage offensif sans lancer observé | `DEFAULT_OFF = 0.35` |
| Équipe déjà à N périodes | elle gagne 100 % sans simulation |

Autres limites : pas de distinction arrêtée ou continue ; probabilités constantes pendant une simulation ; `apply` ne tire pas au sort à la reprise du duel (la première équipe restante dans l'ordre Bleu, Gris, Noir prend le ballon sans choix explicite), alors que `run` tire au sort. Mesures : 1 000 simulations en 12 à 30 ms ; aucune égalité au plus bas score sur 200 000 simulations (ce qui confirme l'impossibilité de l'égalité, voir `saisie.md`).

## Dans l'app

Le bloc « % DE VICTOIRE EN DIRECT » de `index.html` contient le moteur, l'objet `WP` et les fonctions `wp*`. **Rien de ce bloc n'entre dans `S`**, dans la sauvegarde ni dans l'export, et `wpSync` n'appelle jamais `save()` ni `renderScoreboard()`.

Affichage : seulement dans les formats à seuil de période (`periodAt` non nul), tant que le match est en cours et n'est pas une archive. Chaque `.team-chip` porte un bloc `.wp` avec `.wp-m` (match, plus haute et plus opaque) et `.wp-p` (période, plus fine et pâle), sans texte ni chiffre sur le ruban. L'opacité vaut `0,4 + 0,6 × confiance` de l'équipe. Équipe éliminée : barre de période à 0. Sans résultat : parts égales. Le CSS réserve de la place dans le bloc (plus sur téléphone, `.phone .wp`) pour que la zone d'appui des barres ne mange pas celle des changements. Toucher une barre ouvre `openWinDetail()` (« CHANCES DE VICTOIRE — ESTIMATION » : victoires sur 1 000, actions sur 35, numéro de l'action, mention « Estimation non calibrée » et l'hypothèse des 4 périodes) ; toucher ailleurs sur le bloc ouvre les changements de joueurs.

### Quand le calcul repart

Un seul point d'accroche : `wpSync()`, dernière ligne de `renderScoreboard()`, sous `try`. Elle compare l'état courant à ce qu'elle a vu et décide ; aucune fonction de la saisie n'est modifiée. K = nombre d'événements marquants (fautes directes et lancers échappés, DÉF ILL comprises).

- **Sous `WP_MIN_K` (9) événements marquants et sans période gagnée** : parts égales, aucun calcul. Le seuil évite l'emballement du début de match ; valeur choisie sans référence.
- Au-dessus : hors duel, un calcul quand K atteint un multiple de `WP_EVERY` (3) ; en duel, à chaque événement marquant et à chaque changement de porteur du ballon (`WP_DUEL_ON_POSSESSION`) ; à chaque changement de période (après la remise à zéro) ; à l'entrée en duel (au choix de reprise) ; à chaque annulation ; à la reprise d'un match qui a un historique. Un changement de joueur ne relance rien.
- Jamais pendant une transition : attente de possession, ou pointage encore au seuil de période.

### File, Worker et repli

Une seule demande en vol (`inFlight`), une relance en attente (`dirty`). Chaque demande porte un `reqId` et une signature de l'état (`wpSig`) : une réponse périmée est ignorée, une réponse dont la signature n'est plus celle de l'état courant est jetée (`stats.dropped`) et un seul calcul repart. Le résultat est la somme de `WP_SLICES` (10) tranches de 100 simulations (`wpCompute`), identique dans le Worker et dans le repli ; la graine est un hachage FNV-1a de l'identifiant du match, donc fixe : « action, annuler, même action » redonne exactement les mêmes barres.

Le Worker est fabriqué par Blob à la première demande, un seul par session. Repli synchrone (`WP.mode = 'sync'` pour le reste de la session, une tranche par `setTimeout(0)`) si `Worker`, `Blob` ou `URL.createObjectURL` manquent, si la création échoue, sur `error` ou `messageerror`, ou sans réponse en `WP_WORKER_TIMEOUT_MS` (2 500 ms) ; la demande en cours est rejouée, jamais perdue, et aucune erreur n'est écrite en console. Mesures sous Chromium : Worker 5 à 12 ms, repli 45 à 80 ms par tranches de 10 à 30 ms, aucun geste retardé. **Le comportement sous Safari iPad n'a jamais été observé.**

### Constantes et coupe-circuit

`WP_ENABLED` (à `false` : aucune barre, aucun calcul), `WP_N = 1000`, `WP_SLICES = 10`, `WP_EVERY = 3`, `WP_MIN_K = 9` (lu par `WP.minK`), `WP_DUEL_ON_POSSESSION = true`, `WP_OPACITY_MIN = 0.4`, `WP_WORKER_TIMEOUT_MS = 2500`, `WP_PERIODS_TO_WIN = null` (valeur du moteur).

## Limites connues

- **Saturation.** L'estimation s'emballe sur peu d'actions : au-dessus du seuil, une équipe qui ne fait que des fautes reste à 0 % même à 12 événements, et un duel équilibré passe de 17 % à 9 événements à 51 % à 12. À lire comme une tendance. `PRIOR_WEIGHT` est le seul levier réel du moteur ; seule une calibration sur de vrais matchs (score de Brier sur des prédictions à mi-parcours) peut la corriger.
- Pas de fin de match à 4 périodes : au-delà, les barres affichent 100 / 0 / 0 et la saisie continue.
- Un deuxième moteur de règles (celui de la simulation) peut diverger de l'app ; le rejeu de 150 actions aléatoires par format dans le banc (suite `C13B`) est le garde-fou.
- Cosmétique : barres peu contrastées sur le bloc Bleu ; sur tablette la zone d'appui des barres ne fait que 22 px de haut.
