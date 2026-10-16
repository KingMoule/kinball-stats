# Kin-Ball Stats : règles pour les agents

**Session d'un fil (un fil = un chantier) :** lis `docs/chantiers.md` (le seul registre : état, plan, questions), puis seulement ce que `docs/README.md` indique pour ton chantier. Tout l'état du projet vit dans le dépôt. Un sous-agent suit sa définition (`.claude/agents/`) et son brief, pas ce paragraphe. Méthode de travail : `docs/processus.md`.

## Invariants de l'app (index.html)
- Navigation : uniquement par `showOnly` / `navTo` / `navBack` / `navHome`.
- `S` ne contient que l'état de jeu, jamais d'état d'interface.
- `FAULTS` ne change pas ; l'affichage passe par `faultLabel`.
- Aucun point ne s'ajoute sans un événement dans l'historique.
- Une suppression s'écrit `deleted:true`, jamais un effacement.
- Pas de migration des données : les champs nouveaux sont lus avec une valeur par défaut sûre.
- Tout texte saisi passe par `escapeHtml`, y compris dans les attributs.
- Les règles CSS du téléphone sont préfixées `.phone`.
- « Annuler cette saisie » (saisie en cours, `pending` existe) appelle `cancelPendingEvent()`, car `undo()` refuse tant que `pending` existe ; ailleurs, le bouton d'annulation appelle `undo()`.

## Banc
- **Le banc complet se joue en CI, sur une PR vers `main`** (`.github/workflows/banc.yml`) : une branche poussée sans PR n'a aucun passage, donc on ouvre une PR brouillon dès le premier push. Résultat : `node outils/ci-banc.mjs --branche <b>` (sans `--branche`, il lit le commit courant du clone) ; `--attendre` patiente 9 min par appel, un passage en dure 17 à 20. Vérifier le commit entre crochets avant de conclure. Ne sonde pas.
- **En travail** : `node tests/rapide.mjs` (suites touchées par le diff, tablette ; `--liste` : le plan). Une suite : `KINBALL_ONLY=<id>[,smoke,undo] node tests/run.mjs`. Un diff sur les fautes joue aussi C20. Un rapide vert ne remplace pas la CI.
- Jamais le banc complet dans une session. Un seul banc à la fois (2 cœurs). Au-delà de 8 min : `--fond`, puis `node tests/attendre.mjs` (codes 0, 1, 2). On lit `attendre.mjs` ou `resultat.json`, jamais le journal entier.
- On tue un processus par son PID, jamais `pkill -f` (un hook le refuse).
- Session cloud : `export NODE_PATH="$(npm root -g)"` (Playwright y est préinstallé avec Chromium) ; jamais `playwright install`. `KINBALL_SORTIE` et `KINBALL_AVANT` pointent hors du dépôt.

## Lecture du code
- Ne lis jamais `index.html` en entier (environ 95 000 tokens ; un hook le refuse) : `node outils/carte.mjs <regex>`, puis Read avec `offset` et `limit`.
- Les commentaires qui parlent de serveurs, de claude.ai ou d'un plafond de 5 000 documents sont périmés : `docs/donnees.md` fait foi.

## Publication
- Après modification d'un fichier du site (index.html, kb*.js, sw.js, polices, icônes, manifest, vendor) : `node outils/check-release.mjs --ecrire`, puis `node outils/check-release.mjs` doit passer (sinon M04·8 est rouge).
- **Toute PR s'ouvre avec `base: main`** (un hook le vérifie) ; si `gh pr create` est refusé : `gh api repos/KingMoule/kinball-stats/pulls -f title=… -f head=… -f base=main -f body=…` (préfixer `env -u GH_TOKEN` si le jeton est invalide).
- Clone peu profond : `git fetch origin main` avant tout push ; le diff d'une PR se lit par `gh api …/pulls/<n> -H 'Accept: application/vnd.github.v3.diff'`.
- Un agent ne fusionne jamais une PR et ne committe jamais sur `main` : l'utilisateur fusionne.

## Pièges de test
- `undoBlockedUntil` (400 ms) garde ↶, ⌂ et TERMINER après un appui de feuille ; pendant le message de fin de période (≈ 1,95 s après un échappé au seuil), tout appui sauf « Annuler » est ignoré (`periodEndBusy()`) : un test attend la fin de la fenêtre.
- Après ↶, la mise en page du terrain reste périmée ≈ 20 ms (bandeau `#syncBadge`) : les tests attendent par `fieldStable()`.
- `navHome()` s'exécute avant la déclaration de `pending` (TDZ) : tout code appelé par `navHome` teste `pending` en dernier.
- `tests/rapide.json` reconnaît les sections de `index.html` par leur commentaire : une section ajoutée doit y figurer.
