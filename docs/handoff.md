# Handoff — Kin-Ball Stats

Mis à jour le 2026-10-16 (passage à Claude Code, MIG-1). Lire ce fichier, puis `docs/chantiers.md`, le seul registre. Rôle de la session : `docs/orchestrateur.md`. Le reste : `docs/README.md`.

## État
1. **`main` = `804226c`** (PR #16 fusionnée le 2026-10-16, T-FP affichage et geste, D93 ; site 2026-10-12.5). CI de `main` lancée à la fusion : lire `node outils/ci-banc.mjs --branche main` (vérifier `804226c` entre crochets). ESSAI-5 : demander à l'utilisateur s'il a été fait.
2. **MIG-1** (D94, PR #17) : tout le suivi vit dans le dépôt (`docs/chantiers.md`, `docs/handoff.md`, `docs/orchestrateur.md`, `.claude/skills/`, cahier des charges et évaluation dans `docs/archive/`). Il n'y a plus de Projet claude.ai à lire.
3. Q14 appliquée par #16 (geste ignoré pendant la fenêtre de fin de période). Q15 et Q16 restent à poser après ESSAI-5.

## Première action de la prochaine conversation
1. Si la PR #17 (MIG-1) n'est pas fusionnée, le rappeler (elle ne touche que la doc). Puis `node outils/ci-banc.mjs --branche main --attendre` si le passage n'est pas lu ; si rouge, le dire avant tout chantier (un seul `M02·2`, `C08·3` ou `C08·8` rouge : relancer le job échoué).
2. **ESSAI-5 (iPad) avant T-FP robustesse** : liste dans le registre, avec les gestes de LIS-1 et de #16. Puis **Q15** et **Q16**, en un seul AskUserQuestion.
3. **Prochain chantier : MAJ 3, T-FP robustesse** (niveau complet) : reste de F26, E5, F42, constats de l'audit de #13, D2 de l'audit de #15. Puis relecteur Opus avant publication de MAJ 3. `/usage` pour décider de R13. MAJ 4 ensuite ; l'utilisateur fournit l'image de la maquette pour TERRAIN.
4. Agents : vérifier que `codeur`, `auditeur`, `relecteur` figurent dans la liste des types d'agent (ils sont chargés au démarrage dans Claude Code) ; sinon `general-purpose` sous Sonnet avec « lis `.claude/agents/<rôle>.md` et `CLAUDE.md` ». Correctif ou contre-audit : `SendMessage` au même `agentId`. Ne poser à l'utilisateur que ses goûts (une seule fois).

## Pièges
- **`node outils/ci-banc.mjs` sans argument lit le commit COURANT du clone** : toujours `--branche main` ou `--branche <b>`. Un passage dure environ 17 min : `--attendre` fait 9 min par appel, il en faut deux. **Après un push ou une relance il peut rendre l'ancien passage** : vérifier le commit entre crochets.
- **Ouvrir toute PR avec `base: main`, avant d'attendre la CI** (le workflow se déclenche sur la PR). Si `gh pr create` est refusé : `gh api repos/KingMoule/kinball-stats/pulls -f title=… -f head=… -f base=main -f body=…`. Session cloud : si `GH_TOKEN` est invalide, préfixer `env -u GH_TOKEN`.
- Relancer un passage en échec : `gh api -X POST repos/KingMoule/kinball-stats/actions/runs/<id>/rerun-failed-jobs` ; en cas d'échec répété, comparer avec le passage de `main`.
- Un agent ne lance pas le banc complet. `KINBALL_ONLY=<id> node tests/run.mjs` joue une suite (`rapide.mjs` l'ignore). `rapide.mjs` ne couvre pas C20 (DÉF ILL) : jouer C20 en plus pour un diff sur les fautes.
- `undoBlockedUntil` (400 ms) garde ↶, `goHome()` et `finishBarTap()` : un test qui enchaîne un appui de feuille puis ⌂ ou TERMINER doit attendre la fenêtre (R15 `clicHome`, C26·2).
- `tests/rapide.json` reconnaît les sections de `index.html` par leur commentaire : une section ajoutée doit y figurer.
- `navHome()` s'exécute à l'initialisation, avant la déclaration de `pending` (TDZ) : tout code appelé par `navHome` doit tester `pending` en dernier.
- Vérifications instables : C08·3 / C08·8, M02·2 ; C24·6 échoue en local avec une copie « d'avant » (KNOWN en CI, 18 vérifications « d'avant » KNOWN).
- Journaux et artefacts de la CI sont illisibles depuis une session cloud (403) : `ci-banc.mjs` lit des annotations.
- Clone peu profond : `git diff origin/main...<branche>` échoue ; lire le diff d'une PR par `gh api …/pulls/<n> -H 'Accept: application/vnd.github.v3.diff'`. `git fetch origin main` avant tout push.
- Après ↶, la disposition du terrain reste périmée environ 17 à 20 ms (bandeau `#syncBadge` pendant `save()`, F43-B) ; le geste est protégé par `fieldGeom` depuis #16, les tests attendent encore par `fieldStable()`.
- Pendant le message de fin de période, tout appui sauf « Annuler » est ignoré (`periodEndBusy()`) ; un test doit attendre la fin de la fenêtre (≈ 1,95 s après un échappé au seuil).
- Agents, skills et hooks du dépôt ne sont chargés qu'au démarrage d'une session : une modification vaut pour la suivante.
- Les limites d'usage coupent les longs sous-agents. `node outils/carte.mjs` depuis la racine du dépôt ; jamais `index.html` en entier.
- Sur un ordinateur, Playwright doit être installé à la version de la CI : « Environnement » dans `docs/processus.md`.
