# Documentation de Kin-Ball Stats

Kin-Ball Stats est un site statique (PWA) de prise de statistiques de kin-ball, pensé pour l'iPad et utilisable sur téléphone. L'app est le fichier unique `index.html` ; les données vivent sur l'appareil ; les exports sont en CSV, XLSX et JSON. Tout est en français.

Le code fait foi sur ces documents. Quand un fait de cette documentation ne correspond plus au code, on corrige le document dans le même changement. Chaque fait n'est écrit qu'à un seul endroit ; les autres documents y renvoient.

## Quoi lire, selon le chantier

| Si le chantier touche… | Lire |
|---|---|
| un nouvel écran, la navigation, le CSS du téléphone, la structure de `index.html` | `architecture.md` |
| le terrain, les feuilles de saisie, le menu radial, les règles du jeu, la fin de période, l'annulation | `saisie.md` |
| la forme d'un match, la sauvegarde, la copie de secours, l'import, la corbeille, l'identité | `donnees.md` |
| un onglet de statistiques, un tableau, les zones, la heat map, l'export CSV ou XLSX | `stats-et-export.md` |
| les barres de probabilité de victoire ou le moteur de simulation | `probabilite-victoire.md` |
| le déploiement, le service worker, la version du site, la collecte facultative, une PR | `site.md` |
| le pourquoi d'un choix existant (avant de le remettre en cause) | `decisions.md` |
| le banc d'essai (lancer, attendre, ajouter une suite) | `tests/README.md`, puis `tests/docs/<id>.md` |
| qui joue le banc, le niveau d'audit d'un chantier, le choix du modèle, la consommation de tokens, l'installation sur un ordinateur | `processus.md` |
| l'état du projet, le prochain chantier, une question en attente | `handoff.md`, puis `chantiers.md` |

Dans tous les cas, lire d'abord `CLAUDE.md` (invariants de l'app, règles de la machine, publication).

## Outils

- `node outils/carte.mjs [regex]` : carte « fonction → ligne » à jour de `index.html` et de `kbsite.js` (par exemple `node outils/carte.mjs wp`). Les documents citent des noms de fonctions, jamais des numéros de ligne.
- `node outils/check-release.mjs [--ecrire]` : version et empreinte du site (voir `site.md`).
- `node outils/ci-banc.mjs [--branche <b>] [--attendre]` : résultat du banc complet joué par la CI (sans `--branche` : le commit courant du clone ; voir `processus.md`).
- `node tests/rapide.mjs [--liste]` : banc rapide, les suites touchées par le diff.
- `node sim/simtest.mjs` : tests du moteur de simulation (doit afficher « TOUT PASSE »).

## Suivi du projet (lu par la session principale)

- `handoff.md` : état en 40 lignes, première action de la prochaine session, pièges. Réécrit à chaque fin de session.
- `chantiers.md` : **le seul registre** (chantiers ouverts et terminés, questions à l'utilisateur, décisions récentes en une ligne). 15 Ko au plus.
- `orchestrateur.md` : rôle de la session principale (déléguer, relire, consigner, ne pas coder).
- Skills du dépôt : `.claude/skills/kinball-deleguer`, `kinball-banc`, `kinball-audit` ; agents : `.claude/agents/`.

Depuis le 2026-10-16 (D94), tout vit dans le dépôt : il n'y a plus de Projet claude.ai ni de document hors de GitHub.

## Ce qui n'est pas à jour exprès

- L'historique (briefs et rapports des vagues 1 à 5, anciens registres, ancien guide, cahier des charges d'origine, évaluations du 2026-10-09) est dans `archive/`. Ces fichiers ne font plus foi ; ils servent à retrouver pourquoi une chose a été faite.
- Le code de l'app contient encore des commentaires qui parlent du temps où elle vivait dans claude.ai (serveurs de Claude, plafond de 5 000 documents, wifi du gymnase, règles d'accès). Le code est juste, ces commentaires sont périmés : se fier à `donnees.md`.
