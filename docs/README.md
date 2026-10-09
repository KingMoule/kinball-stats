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

Dans tous les cas, lire d'abord `CLAUDE.md` (invariants de l'app, règles de la machine, publication).

## Outils

- `node outils/carte.mjs [regex]` : carte « fonction → ligne » à jour de `index.html` et de `kbsite.js` (par exemple `node outils/carte.mjs wp`). Les documents citent des noms de fonctions, jamais des numéros de ligne.
- `node outils/check-release.mjs [--ecrire]` : version et empreinte du site (voir `site.md`).
- `node sim/simtest.mjs` : tests du moteur de simulation (doit afficher « TOUT PASSE »).

## Ce qui n'est pas ici

- Le registre des chantiers (état, chantiers ouverts, décisions à prendre, questions, constats de la revue de code) vit hors du dépôt, dans le Projet claude.ai (`claude/chantiers.md`), avec `claude/handoff.md`.
- L'historique des vagues 1 à 4 (briefs, plans, anciens registres, ancien guide) est dans `docs/archive/`. Ces fichiers ne font plus foi ; ils servent à retrouver pourquoi une chose a été faite.
- Le code de l'app contient encore des commentaires qui parlent du temps où elle vivait dans claude.ai (serveurs de Claude, plafond de 5 000 documents, wifi du gymnase, règles d'accès). Le code est juste, ces commentaires sont périmés : se fier à `donnees.md`.
