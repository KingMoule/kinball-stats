# Kin-Ball Stats : règles pour les agents

## Invariants de l'app (index.html)
- Navigation : uniquement par `showOnly` / `navTo` / `navBack` / `navHome`.
- `S` ne contient que l'état de jeu, jamais d'état d'interface.
- `FAULTS` ne change pas ; l'affichage passe par `faultLabel`.
- Aucun point ne s'ajoute sans un événement dans l'historique.
- Une suppression s'écrit `deleted:true`, jamais un effacement.
- Pas de migration des données : les champs nouveaux sont lus avec une valeur par défaut sûre.
- Tout texte saisi passe par `escapeHtml`, y compris dans les attributs.
- Les règles CSS du téléphone sont préfixées `.phone`.
- Le bouton d'annulation dans une feuille appelle `undo()`.

## Banc et machine (2 cœurs)
- **Le banc complet se joue en CI**, jamais dans ta session (`.github/workflows/banc.yml`, cache par empreinte). Tu pousses ta branche, puis `node outils/ci-banc.mjs` donne le résultat (`--attendre` : jusqu'à 9 min par appel). Ne sonde pas.
- **En travail** : `node tests/rapide.mjs` joue les suites touchées par ton diff, sur la tablette (`--liste` : le plan ; `--fond` au-delà de 8 min). Une suite : `KINBALL_ONLY=<id>[,smoke,undo]`. Un rapide vert ne remplace pas la CI.
- Un seul banc à la fois sur la machine. Une commande dure au plus 10 min : un passage long se lance par `(setsid nohup … &)`, puis `node tests/attendre.mjs` (codes 0, 1, 2), pas par `sleep` + `tail`.
- On lit `node tests/attendre.mjs` ou `resultat.json`, jamais le journal en entier. `KINBALL_CACHE=seul node tests/run.mjs` relit un passage déjà joué, sans rien lancer.
- On tue un processus par son PID, jamais avec `pkill -f` (cela tue aussi le shell) ; un hook le refuse.
- `NODE_PATH=/home/claude/.npm-global/lib/node_modules` ; ne lance jamais `playwright install` (réservé à la CI). `KINBALL_SORTIE` et `KINBALL_AVANT` pointent hors du dépôt.

## Lecture du code
- Ne lis jamais `index.html` en entier (354 Ko, environ 95 000 tokens) : `node outils/carte.mjs <regex>`, puis Read avec `offset` et `limit`. Un hook le refuse.

## Publication
- Après modification d'un fichier du site (index.html, kb*.js, sw.js, polices, icônes, manifest, vendor) : lance `node outils/check-release.mjs --ecrire`, puis `node outils/check-release.mjs` doit passer. Sinon M04·8 est rouge.
- **Toute PR s'ouvre avec `base: main`** ; un hook le vérifie. `gh pr create --base main …`, ou `gh api repos/KingMoule/kinball-stats/pulls -f title=… -f head=… -f base=main -f body=…`.
- Un agent ne fusionne jamais une PR et ne committe jamais sur `main`.

## Où trouver la doc
- `docs/README.md` : architecture et guide. `docs/processus.md` : qui joue le banc, niveau d'audit, modèles, hygiène de session.
- `tests/README.md` : banc ; détail par suite dans `tests/docs/<id>.md`.
- `node outils/carte.mjs [regex]` : carte « fonction → ligne » du code (ex. `wp`, `saisie`, `^undo`).
