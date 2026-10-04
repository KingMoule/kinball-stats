# Moteur de simulation Kin-Ball (C13-A)

`simcore.js` : JavaScript pur, sans DOM ni réseau. Tout est dans `KBSimFactory()`, qui ne lit aucune variable extérieure (graine interne mulberry32, pas de `Math.random`). `KBSimFactory.toString()` suffit à fabriquer un Web Worker : `new Function('return (' + src + ')()')()`. Tests : `node sim/simtest.mjs [--table]`.

## Interface
- `params(history, teams)` -> `{h2h, fault, overall, confidence, counts}`. `h2h[A][T]`, `fault[A]`, `overall[A]`, `confidence[A]` sont en [0,1]. `counts[A]` = compteurs bruts (`actions, faults, throws, escaped`, `window{...}`, `pairs[T]{throws, escaped}`).
- `run({state, fmt, teams, params, n=1000, seed=1, periodsToWin=4})` -> `{n, match, period, unfinished, anomalies, ms}` ou `null` si `fmt.periodAt` est nul. `match`/`period` = nombre de victoires par équipe en jeu. Équipe éliminée : `period` = 0. Équipe déjà à `periodsToWin` : n victoires, sans simulation.
- `apply(state, fmt, teams, action)` -> nouvel état `{scores, periodWins, eliminated, duelActive, possession}` ; action `{type:'faute', team}` ou `{type:'lancer', attacker, target, caught}`, `restart` optionnel (choix de l'utilisateur après élimination). Renvoie `null` pour une action invalide (cible éliminée, équipe inconnue). Une propriété non énumérable `info` donne `{elimination, periodFinished, periodWinner, anomalies}`.
- `state` : `scores`, `periodWins` (objets Bleu/Gris/Noir), `eliminated`, `duelActive`, `possession` (null = tirée au sort à chaque simulation).

## Règles (fidèles à `awardFaultPoints` / `checkPeriodState` / `finishPeriod`)
Possession de A : faute directe avec probabilité `fault[A]` (+1 à chaque autre équipe en jeu, A garde le ballon) ; sinon lancer vers la cible (autre équipe en jeu au plus haut pointage ; en duel l'unique adversaire), échappé avec `h2h[A][T]` (+1 à toutes les équipes en jeu sauf T, T prend le ballon), attrapé sinon (aucun point, T prend le ballon). Après un gain de points : élimination (3 équipes, hors duel, `eliminationAt` atteint, la plus basse part, on s'arrête là), sinon fin de période (`periodAt`). Fin de période : +1 période, pointages à 0, ballon à l'éliminée (3 équipes) ou au perdant, duel actif si format à 2 équipes. Match : première équipe à `periodsToWin`.

## Paramètres
Fenêtre de 35 actions offensives (lancers + fautes directes de l'équipe). `fault = (fautes + 0.05*6)/(actions + 6)`. `overall = (échappés_fenêtre + pool*6)/(lancers_fenêtre + 6)`, `pool` = part de lancers échappés sur tout le match (0.35 si aucun). `h2h = (échappés_A->T + overall*6)/(lancers_A->T + 6)` sur tout l'historique. `confidence = min(1, actions_fenêtre/35)`.

## Constantes (`CONST`)
`WINDOW 35`, `FAULT_PRIOR 0.05`, `PRIOR_WEIGHT 6`, `DEFAULT_OFF 0.35`, `PERIODS_TO_WIN 4`, `MAX_ACTIONS 5000`, `TIE_TARGET 'coin'`, `DUEL_RESTART 'holder-else-coin'`, `ORDER`.
Choix de l'Orchestrator sans référence : `DEFAULT_OFF`, le lissage de `overall` vers `pool`, `TIE_TARGET`, `DUEL_RESTART`. `PERIODS_TO_WIN = 4` vient du cahier (non codé dans l'app).

## Limites
- Calibration sans aucune référence : les tests prouvent la cohérence interne et la fidélité aux règles, pas la justesse des probabilités.
- `apply` ne tire pas au sort : à la reprise du duel, si le porteur est l'éliminé et sans `restart`, la première équipe restante (ordre Bleu, Gris, Noir) prend le ballon ; `run` tire au sort.
- Une simulation qui atteint `MAX_ACTIONS` est comptée dans `unfinished` et exclue de `match` et `period`.
- Égalité au plus bas à l'élimination : `anomalies`++, première équipe dans l'ordre Bleu, Gris, Noir. Un état d'entrée déjà au-dessus d'un seuil n'est pas corrigé.
- Pas de distinction arrêtée / continue ; probabilités constantes pendant toute la simulation (pas de réajustement en cours de match).
