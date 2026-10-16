---
name: kinball-banc
description: Lancer, attendre et lire le banc d'essai Kin-Ball Stats (tests/run.mjs) au moindre coût en temps et en tokens. À utiliser dès qu'un agent doit faire passer le banc ou interpréter son résultat.
---

# Banc d'essai Kin-Ball Stats

Dépôt : `KingMoule/kinball-stats`. Banc : Playwright, tablette et téléphone, environ 640 vérifications, 16 à 20 min. Machine à 2 cœurs. En cas de contradiction avec ce skill, `CLAUDE.md` et `docs/processus.md` du dépôt font foi.

## Règle d'or
**Le banc complet se joue en CI** (workflow « Banc d'essai », `.github/workflows/banc.yml`), jamais dans ta session. Un agent ne lance jamais `node tests/run.mjs` sans filtre et ne l'attend pas par sondage. Un passage complet local, quand la CI est indisponible, est une décision de l'utilisateur.

## Pendant le travail : le banc rapide
- `node tests/rapide.mjs` joue les suites que ton diff peut casser, sur la tablette, en 1 à 4 min (smoke et undo toujours inclus). `--liste` montre le plan sans rien lancer ; `--fond` au-delà de 8 min ; `--tel` ajoute le téléphone.
- Une suite précise : `KINBALL_ONLY=<id>[,smoke,undo]`. Une vérification précise : `C23_ONLY` / `C21_ONLY=<regex>`.
- Un rapide vert ne remplace pas la CI. La table `tests/rapide.json` est indicative : si la CI révèle qu'une suite manquait, signale-le pour qu'on la corrige.
- Contrôle négatif : `KINBALL_HTML=<copie d'avant> KINBALL_ONLY=<id>` doit échouer (la CI ne le fait pas : il reste manuel).

## Le résultat complet : la CI
1. Pousse ta branche de travail (jamais `main`).
2. `node outils/ci-banc.mjs --branche <b>` donne le résumé du dernier passage de la branche (une dizaine de lignes). **Sans `--branche`, il lit le commit courant du clone.** `--attendre` attend jusqu'à 9 min par appel : un passage complet en demande deux ; relance si code 2. Ne sonde pas. Le workflow se déclenche sur une PR : une branche poussée sans PR donne « aucun passage ».
   Après un push ou une relance, il peut rendre l'ancien passage : lis le commit entre crochets (`[CI, commit …]`) avant de conclure.
3. Codes de sortie : 0 vert, 1 rouge, 2 pas de passage ou en cours, 3 GitHub injoignable. « Aucun passage » est normal pour une PR qui ne touche que `docs/`, `tests/docs/`, `.claude/`, `CLAUDE.md`, `README.md`, `MIGRATION.md` ou `tests/README.md`.
4. Un commit déjà joué, ou une PR sans changement du code, relit le cache par empreinte (moins d'une minute) au lieu de rejouer 16 à 20 minutes.
5. Les journaux et artefacts de GitHub sont illisibles depuis la session (403) : `ci-banc.mjs` lit des annotations (résumé et dix premiers échecs). Pour le détail, l'utilisateur ouvre le passage dans GitHub.
- `KINBALL_CACHE=seul node tests/run.mjs` relit un passage local déjà joué sans rien lancer (code 3 s'il n'existe pas).

## Règles de machine
- Un seul banc à la fois (un hook refuse le second). Une commande dure au plus 10 min : un passage long se lance par `(setsid nohup … &)`, puis `node tests/attendre.mjs` (codes 0, 1, 2), pas par `sleep` + `tail`.
- On tue un processus par son PID, jamais par `pkill -f` (un hook le refuse).
- Session cloud : `NODE_PATH=/home/claude/.npm-global/lib/node_modules`, Chromium préinstallé (`/opt/pw-browsers`) : ne lance jamais `playwright install`. Sur un ordinateur : « Environnement » dans `docs/processus.md`.
- `KINBALL_SORTIE` et `KINBALL_AVANT` pointent hors du dépôt.
- `rapide.mjs` ne couvre pas C20 (DÉF ILL) : pour un diff sur les fautes, ajoute `KINBALL_ONLY=C20`.
- On lit `node tests/attendre.mjs` ou `resultat.json`, jamais le journal en entier.

## Échecs à ne pas confondre avec une régression
- `M04·8` rouge tant que `node outils/check-release.mjs --ecrire` n'a pas été relancé après une modification d'un fichier du site.
- Vérifications instables connues (`C08·3`, `C08·8` : course `onSnapshot` / `rebuildMatches` ; `M02·2` : `config.js net::ERR_ABORTED`) et vérifications sensibles au temps : si l'une est seule rouge, relance le job échoué (`env -u GH_TOKEN gh api -X POST repos/KingMoule/kinball-stats/actions/runs/<id>/rerun-failed-jobs`) avant de conclure. Si l'échec se répète, il est réel. La liste à jour est dans `docs/chantiers.md`.
- En CI il n'y a pas de dossier `KINBALL_AVANT` : les vérifications qui comparent avec une sauvegarde « d'avant » (18 sur `main` le 2026-10-12) y sont KNOWN, non bloquantes.

## Ce que tu rapportes
Une ligne : `banc <ok>/<total>, <échecs> échec(s), <durée>` (CI ou rapide, et le commit), puis les échecs avec leur cause (régression, connu, instable rejoué) et le lien du passage.