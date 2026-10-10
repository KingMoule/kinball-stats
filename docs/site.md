# Le site : déploiement, version, service worker, collecte

La procédure détaillée de resynchronisation avec l'ancienne source (`amont/`) et le retour arrière sont dans `MIGRATION.md` à la racine : ce document ne les répète pas. Depuis la vague 3 (2026-10-04), le dépôt est la source du code ; la resynchronisation ne sert plus qu'en secours.

## Hébergement et mise en ligne

Le site est servi par GitHub Pages depuis la racine du dépôt `KingMoule/kinball-stats` (adresse `https://kingmoule.github.io/kinball-stats/`). Le workflow `.github/workflows/pages.yml` se déclenche à chaque poussée sur `main` : il lance `node outils/check-release.mjs` (échec si la version ou l'empreinte ne correspondent pas aux fichiers), puis publie la racine entière. Conséquence : `tests/`, `collecte/`, `outils/`, `MIGRATION.md` et `amont/kinball.amont.html` sont aussi en ligne.

Procédure d'un changement :
1. Travailler sur une branche (jamais directement sur `main`), commiter.
2. Si un fichier du site a changé : `node outils/check-release.mjs --ecrire`, commiter « Version du site », puis `node outils/check-release.mjs` doit passer.
3. `git fetch origin main`, pousser la branche (jamais `--force`).
4. Ouvrir la PR par `gh api repos/KingMoule/kinball-stats/pulls -f title=… -f head=… -f base=main -f body=…` (`gh pr create` ne marche pas ici).
5. L'utilisateur fusionne ; un agent ne fusionne jamais une PR. L'action Pages republie, puis l'app installée télécharge la nouvelle version en silence et propose « Mise à jour prête ».

Le banc d'essai est décrit dans `tests/README.md` ; il doit être vert avant la PR (la suite `M04` échoue tant que `--ecrire` n'a pas été lancé après une modification d'un fichier du site).

## Version et empreinte : `check-release`

`VERSION` (dans `sw.js`) et `VERSION_SITE` (dans `kbsite.js`) sont la version du site, de la forme `AAAA-MM-JJ.rang` (rang + 1 le même jour). `EMPREINTE` (dans `sw.js`) est le sha256 de la liste triée « chemin + sha256 du fichier » de tous les fichiers du site. Sont des fichiers du site les fichiers suivis par git moins `tests/`, `amont/`, `outils/`, `sim/`, `collecte/`, `.github/`, les fichiers et dossiers cachés, `*.md`, `*.txt` et `sw.js` lui-même.

- `node outils/check-release.mjs` vérifie : chaque entrée du précache existe, chaque fichier du site est dans le précache, l'empreinte est celle de `sw.js`, les deux versions concordent, et le champ « amont » de `kbsite.js` est le sha256 réel de `amont/kinball.amont.html` (8 premiers caractères). Un écart donne le code de sortie 1.
- `--ecrire` écrit une nouvelle version (date du jour) dans `kbsite.js`, recalcule l'empreinte et l'écrit dans `sw.js`. Rien n'a changé : rien n'est écrit.
- Un fichier **servi** par le site s'ajoute d'abord à la liste `PRECACHE` de `sw.js` ; un outil hors site n'y va pas. La version doit toujours avancer, jamais reculer, sans quoi les appareils gardent leur cache (valable pour un retour arrière : `git revert`, puis `--ecrire`).

## Service worker, `sw.js`

- Le site se recharge et se joue entièrement hors ligne. Cache nommé `kinball-<VERSION>`, rempli de la liste `PRECACHE` explicite à l'installation (tout ou rien : un échec laisse l'ancienne version en service).
- Une nouvelle version s'installe sans jamais s'activer toute seule : seule la page, sur accord de la personne, envoie `{type:'ACTIVER'}` (`skipWaiting`). L'activation supprime les anciens caches `kinball-…`, rien d'autre.
- `fetch` : requêtes GET de même origine, servies depuis le cache de la version seulement (une page de la version 1 ne reçoit jamais un fichier de la version 2) ; hors précache, le réseau, sans mise en cache.

Côté page (`kbsite.js`) : `verifierMiseAJour` cherche une mise à jour au lancement et au retour au premier plan (au plus une fois par heure), mais jamais pendant un match (la recherche est reportée). La carte « Mise à jour prête » propose METTRE À JOUR ou « Plus tard » ; l'activation est refusée pendant un match ou tant qu'une écriture est en attente (`sansTravailNonEnregistre`), et un seul rechargement a lieu, dans la page qui l'a demandé. Le service worker ne s'enregistre pas dans claude.ai ni hors HTTPS (sauf `localhost`).

## Ce que fait `kbsite.js`

Chargé après le script de l'app, il n'écrit jamais dans `S`, `TEAMS_DB` ni `MATCHES_DB` et ne redéfinit aucune fonction de l'app. Il pose des cartes sur l'accueil (ordre d'affichage : mise à jour 10, premier lancement 20, rappel de sauvegarde 30, installation 90) et sur l'écran Données. Par chantier d'origine :

- **M03** : demande de stockage persistant, ligne d'état « stockage protégé », carte d'archivage masquée.
- **M04** : service worker, mise à jour sur accord, ligne de version (« Version … · app amont … »), incitation à installer (sur iOS : Partager → Sur l'écran d'accueil ; les données de Safari et celles de l'app installée sont séparées, installer d'abord, saisir ensuite).
- **M05** : feuille « FICHIER PRÊT », second geste du partage de fichiers quand le geste utilisateur a expiré.
- **M06** : sauvegarde v2, import sans écrasement, reprise d'identité, carte « Nouvel appareil, ou données effacées ? » (base vide), rappel « Pensez à sauvegarder » (trois matchs terminés depuis la dernière sauvegarde, ou 14 jours avec des données modifiées). Voir `donnees.md`.
- **M08** : chargement de la collecte facultative.
- **M11** : règles de récupération d'une copie locale périmée (`baseIncomplete`, `copieObsolete`, `copieRefusee`).

Il repère des boutons de l'app par le texte de leur `onclick` et réécrit quelques textes de l'app (« en ligne », « archiver ») ; tout renommage dans `index.html` se vérifie avec `grep` dans `kbsite.js`. Les points d'accroche laissés dans `index.html` sont marqués `MIGRATION <chantier>` (`grep -n MIGRATION index.html`) ; le tableau est dans `MIGRATION.md`.

## Collecte facultative des matchs terminés

Désactivée par défaut. `config.js` porte `window.KB_CONFIG = {collecteUrl, contact}` ; **les deux** doivent être non vides pour que `kbsite.js` charge `kbcollect.js` ; sinon aucune carte, aucune requête. Jamais dans claude.ai. Une adresse en `http` n'est admise que vers `localhost` ou `127.0.0.1`.

- L'accord est donné par la personne, pour **cette identité** seulement, rangé dans `KBLocal.meta` (`site.collecte.accord`), jamais déduit ni repris d'une sauvegarde.
- Ne part que : un match de mon espace, terminé, non supprimé, une fois par version, jamais pendant l'écran de match. Boîte d'envoi persistante avec reprise (délais 1 min, 5 min, 30 min, puis au lancement suivant).
- Aucun nom de joueur ne part : copie profonde épurée (`rosters[*].name` vidé, valeurs des clés `*_name` à `''`, sauf `team_name`). Les noms d'équipes et du match, eux, partent tels que saisis.
- Serveur : un script Google Apps Script en ajout seul (`collecte/Code.gs`, `collecte/Logique.gs`) qui rejette aussi tout nom de joueur ; mise en place pas à pas dans `collecte/MODE-D-EMPLOI.md`. La page `confidentialite.html` décrit ce qui part et annonce 30 jours pour traiter un retrait.
- Pour l'allumer : suivre le mode d'emploi, remplir les deux valeurs de `config.js`, puis `check-release --ecrire`, commit, PR.
- Essais : `node tests/local/collecte.test.mjs` et `collecte/faux-serveur.mjs`. Le serveur Apps Script n'a pas été déployé à ce jour.

## Stockage et navigateurs

Safari : dans un onglet non installé, WebKit peut effacer le stockage d'un site non visité depuis 7 jours, et en navigation privée tout disparaît à la fermeture. Installer l'app sur l'écran d'accueil, accepter la demande de persistance et faire des sauvegardes complètes régulières sont les protections (voir `donnees.md`). Le comportement réel de Safari iOS n'a pas été observé par les agents : à essayer sur un iPad avant de s'y fier.
