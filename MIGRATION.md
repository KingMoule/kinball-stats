# Kin-Ball Stats : dépôt, resynchronisation, mise en ligne

Mode d'emploi court. Tout se lance depuis la racine du dépôt.

## 1. Ce qu'est le dépôt

La racine du dépôt EST le site (GitHub Pages).

- `index.html` : l'app. C'est le fichier amont, avec quelques points d'accroche, tous marqués `MIGRATION <chantier>` (commentaire). Rien d'autre n'y change : aucun reformatage, aucun déplacement.
- `kblocal.js` : façade de stockage locale (IndexedDB) qui imite les capacités db / user / downloads d'origine.
- `kbsite.js` : tout ce qui est propre au site (installation, mise à jour, sauvegarde, fichiers, cartes de l'accueil). Chargé après le script de l'app.
- `sw.js` : service worker (hors-ligne, mise à jour sur accord). `VERSION`, `EMPREINTE` et la liste de précache y sont tenues par `outils/check-release.mjs`.
- `manifest.webmanifest`, `fonts/`, `vendor/`, `icons/`, `.nojekyll`.
- `amont/kinball.amont.html` : la dernière version amont intégrée, octets identiques (base de la fusion) ; `amont/EMPREINTE.txt` la décrit.
- `outils/` (resync, check-release), `tests/`, `sim/` : hors site.

Points d'accroche dans `index.html` (`grep -n MIGRATION index.html`) :

| Repère | Rôle |
|---|---|
| Tête de fichier : `<link rel="apple-touch-icon">`, `<link rel="manifest">` | icône et manifeste d'installation (M02) ; l'enveloppe de publication d'origine (ligne 1 de l'amont) et les `<link>` vers le service de polices distant sont retirés |
| Début du `<style>` : règles de l'enveloppe, `@font-face` | cascade identique, polices embarquées (M02) |
| `#dbUnavailable`, carte « Exporter toutes les données » (HTML) | textes « cet appareil » (M03) |
| `<script src="vendor/xlsx.full.min.js">` | bibliothèque xlsx embarquée au lieu d'un CDN (M02) |
| `<script src="kblocal.js">` avant le script de l'app, `<script src="kbsite.js">` après | chargement des deux fichiers du site (M03) |
| `capabilityEntry(name)` et ses trois appels (db, user, downloads) | porte d'entrée des capacités : `window.claude` s'il existe, sinon `KBLocal`, sinon rien (M03) |
| `openSyncSheet`, `checkLocalBackups`, `renderStorageInfo` | textes « sur cet appareil », plus de plafond de 5 000 documents (M03) |
| `checkLocalBackups` (2 lignes), `restoreLocalBackup` (1 ligne) | copie locale périmée : rien ne se décide avant l'arrivée des matchs de chaque auteur, jamais d'écrasement d'un match plus récent (M11 ; logique dans `kbsite.js`, `KBSite.baseIncomplete`, `copieObsolete`, `copieRefusee`) |
| `discardMatch`, `setSyncState`, `openSyncSheet`, sous-titre de l'accueil, carte d'archivage | textes sans « serveur / connexion / en ligne » en mode local seulement (M11) |
| `exportFullBackup`, `handleImportFile` (5 lignes) | appels à `KBSite.sauvegardeV2`, `importDebut`, `garder`, `fin` : sauvegarde v2 et import sans écrasement (M06) |

## 2. Resynchroniser (nouvelle version du fichier amont)

```
node outils/resync.mjs "<chemin du nouveau fichier amont>.html" --essai
node outils/resync.mjs "<chemin du nouveau fichier amont>.html"
```

La première commande ne fait que montrer ce qui se passerait. L'outil fusionne à trois voies (base = `amont/kinball.amont.html`, nôtre = `index.html`, leur = le nouveau fichier). Avant d'écrire quoi que ce soit, il vérifie : dépôt propre (`git status` vide) ; fichier donné présent ; `amont/` conforme à `amont/EMPREINTE.txt` ; mêmes fins de ligne (LF ou CRLF) dans le nouveau fichier et la base (rien n'est converti en silence). Un fichier identique à la base : « rien à faire ».

Fusion propre : tous les marqueurs `MIGRATION` doivent y être encore, une fois chacun, et un seul `<script>` sans `src`. Alors l'outil écrit `index.html`, copie le nouveau fichier dans `amont/kinball.amont.html` (octets identiques), met à jour `amont/EMPREINTE.txt` et lance `node outils/check-release.mjs --ecrire` (nouvelle version du site). Il ne commite pas et ne pousse pas. Une copie des fichiers d'avant est faite hors du dépôt, et si une écriture échoue tout est remis comme avant.

Avertissements affichés à la fin (ils n'arrêtent rien ; ce sont des accroches à poser à la main) : adresse `http://` ou `https://` dans un `src`, un `href`, un `@import` ou un `url(…)` ; nouveau `window.claude.use(` hors de `capabilityEntry` ; mots « Claude », « serveur », « en ligne », « votre compte » dans une ligne nouvelle (texte affiché à reformuler en « cet appareil »).

Conflit (code de sortie 2) : l'outil liste chaque zone (ligne dans `index.html`, accroche la plus proche, premières lignes des deux côtés), donne le chemin d'un fichier annoté dans le dossier temporaire du système, et n'écrit RIEN dans le dépôt. Marche à suivre :

1. Ouvrir le fichier annoté (marqueurs `<<<<<<<` côté `index.html`, `|||||||` base, `=======`, `>>>>>>>` côté nouveau fichier).
2. Pour chaque conflit, prendre le changement amont ET garder l'accroche `MIGRATION` (la ligne ou le commentaire ajouté par le site).
3. Enregistrer le résultat comme `index.html` du dépôt (plus aucun marqueur de conflit : `grep -n "^<<<<<<<\|^>>>>>>>" index.html` ne doit rien montrer), puis commiter cela seul : « Reprise à la main de la version amont ».
4. Mettre `amont/` à jour : copier le nouveau fichier (octets identiques) dans `amont/kinball.amont.html`, y calculer `shasum -a 256`, reporter somme, taille et nombre de lignes dans `amont/EMPREINTE.txt`.
5. `node outils/check-release.mjs --ecrire` puis `node outils/check-release.mjs` (doit passer).
6. Contrôle : `diff amont/kinball.amont.html index.html` ne doit montrer que des accroches `MIGRATION`.

Cas à connaître : si le seul conflit est « index.html ligne 1 » (le côté index.html est vide, le côté amont est une longue ligne `<!doctype html><html><head>…`), l'enveloppe de publication de l'amont a changé. Elle n'a pas sa place dans le site : garder le côté index.html (vide), c'est-à-dire supprimer cette ligne et les marqueurs, et prendre tout le reste du fichier annoté tel quel. Un nouveau contenu ajouté juste à côté d'un point d'accroche (par exemple tout à la fin de la page, à côté des deux balises `<script src>`) donne aussi un conflit : garder les deux.

Après toute resynchronisation : `KINBALL_ONLY=M02,M03,M04,M05,M06 node tests/run.mjs`, puis le banc complet (`node tests/run.mjs`, environ 16 minutes, à lancer en tâche de fond), `node tests/local/kblocal.test.mjs`, `node sim/simtest.mjs`, `node outils/check-release.mjs`. (`NODE_PATH` doit désigner le dossier global de Playwright.)

## 3. Mettre en ligne

1. `node outils/check-release.mjs --ecrire` (toute modification d'un fichier du site l'exige : nouvelle version et empreinte), puis `node outils/check-release.mjs` doit passer. Un nouveau fichier SERVI par le site s'ajoute d'abord à la liste `PRECACHE` de `sw.js` ; les outils hors site n'y vont pas.
2. Banc complet vert.
3. `git add -A`, `git commit`, `git fetch origin main`, vérifier que `main` local est en avance simple, `git push origin main`. Jamais `--force`.

GitHub Pages republie le site. Sur l'iPad, l'app déjà installée télécharge la nouvelle version en silence ; l'accueil affiche « Mise à jour prête » et la personne l'applique quand elle veut (jamais pendant un match).

## 4. Revenir en arrière

1. `git revert <commit>` pour chaque commit à défaire (un par un, du plus récent au plus ancien).
2. `node outils/check-release.mjs --ecrire` : la version doit AVANCER, jamais reculer, sinon les appareils gardent leur cache. Commiter ce changement.
3. `git fetch origin main`, `git push origin main`.

Les données enregistrées sur les appareils ne sont pas touchées par un retour arrière du site.

## 5. Tests et moteur de simulation de l'amont

L'amont fait aussi évoluer ses tests (`tests/scenarios/<chantier>.mjs`, `tests/lib.mjs` d'origine) et son moteur (`sim/`). Marche simple, en deux temps.

Copie intacte : `node outils/resync.mjs <nouveau fichier amont> --tests <dossier de l'amont>` (le dossier contient `tests/` et/ou `sim/` dans leur disposition d'origine) garde leur copie dans `amont/tests/` et `amont/sim/` et affiche les fichiers nouveaux (+), changés (~) et disparus (-) par rapport à la copie précédente. La toute première fois, tout est « nouveau » : c'est l'amorçage. `--tests` s'utilise aussi avec un fichier identique à la base (« rien à faire » côté html).

Reprise à la main dans `tests/` et `sim/` du dépôt (jamais de fusion automatique) :

1. Scénario nouveau : le copier de `amont/tests/scenarios/` vers `tests/scenarios/`, puis lui appliquer les conventions du dépôt : aucun chemin en dur (les sauvegardes « d'avant » se lisent par `KINBALL_AVANT`, les mesures et captures s'écrivent sous `KINBALL_SORTIE`), importations depuis `../lib.mjs` du dépôt.
2. Scénario changé : `git diff amont/tests/scenarios/<chantier>.mjs` (la copie précédente est dans git : commiter `amont/` après chaque passage) et reporter le même changement dans `tests/scenarios/`.
3. `lib.mjs` et `sim/` : `git diff --no-index amont/tests/lib.mjs tests/lib.mjs` et `git diff --no-index amont/sim sim`. Les écarts attendus sont les adaptations du dépôt (dossiers `KINBALL_*`, options de `launch`) ; tout autre écart venant de l'amont se reporte à la main.
4. Lancer le scénario seul : `KINBALL_ONLY=<chantier> node tests/run.mjs`, puis le banc complet.

## 6. Limites connues et défauts d'amont à signaler

- **Défaut d'amont (non corrigé ici, à signaler dans la conversation de l'amont)** : `sectionMatchFaults` met `S.names[t]` sans `escapeHtml` dans l'étiquette de colonne du tableau « Par type de faute ». Un nom d'équipe (ou un fichier importé) contenant du HTML s'exécute à l'ouverture de l'onglet Fautes. Le correctif se fait en amont (échapper l'étiquette) puis se resynchronise ; `index.html` n'est pas retouché pour cela.
- `counts.actions` de la sauvegarde v2 ne compte pas les matchs de la corbeille (`counts.deleted` les compte à part) : c'est voulu, cohérent avec la vérification d'import. Pour retrouver toutes les actions, additionner aussi celles des matchs supprimés.
