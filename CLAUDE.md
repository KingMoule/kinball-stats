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

## Machine (2 cœurs)
- Un seul banc à la fois sur la machine.
- Une commande dure au plus 10 min : le banc se lance par `(setsid nohup node tests/run.mjs > <journal> 2>&1 < /dev/null &)`, puis on attend avec `node tests/attendre.mjs` (codes 0, 1, 2), pas par `sleep` + `tail`.
- On lit `node tests/attendre.mjs` ou `resultat.json`, jamais le journal en entier par `cat`.
- On tue un processus par son PID, jamais avec `pkill -f` (cela tue aussi le shell) ; un hook le refuse.
- `NODE_PATH=/home/claude/.npm-global/lib/node_modules` ; ne lance jamais `playwright install`. `KINBALL_SORTIE` et `KINBALL_AVANT` pointent hors du dépôt.

## Publication
- Après modification d'un fichier du site (index.html, kb*.js, sw.js, polices, icônes, manifest, vendor) : lance `node outils/check-release.mjs --ecrire`, puis `node outils/check-release.mjs` doit passer. Sinon M04·8 est rouge.
- `gh pr create` ne marche pas ici : passe par `gh api repos/KingMoule/kinball-stats/pulls -f title=… -f head=… -f base=main -f body=…`.
- Un agent ne fusionne jamais une PR.

## Où trouver la doc
- `docs/README.md` : architecture et guide.
- `tests/README.md` : banc ; détail par suite dans `tests/docs/<id>.md`.
- `node outils/carte.mjs [regex]` : carte « fonction → ligne » du code (ex. `wp`, `saisie`, `^undo`).
