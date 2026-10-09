# Banc : variables, lib.mjs, modes de passage

<!-- Déplacé de tests/README.md (chantier harnais-banc) ; texte d'origine. -->

Variables : `KINBALL_SORTIE=<dossier>` (mesures et captures, défaut : `kinball-sortie` dans le dossier temporaire du système, jamais dans le dépôt), `KINBALL_AVANT=<dossier>` (sauvegardes « d'avant » des chantiers, défaut : `kinball-avant` dans le dossier temporaire du système ; un fichier absent donne KNOWN « sauvegarde d'avant absente »), `KINBALL_HTML=<fichier>` (tester une copie ; défaut : index.html du dépôt), `KINBALL_BAIL=1` (stop au premier échec), `KINBALL_ONLY=smoke,undo,fuzz,<id>` (suites), `KINBALL_GABARIT=tablette|telephone`, `KINBALL_TIMESCALE=1` (vrais délais de l'app), `KINBALL_ANIM=1` (garder l'animation de la feuille).

Contenu : `lib.mjs` (Chromium, gestes réels sur `#field` et `#sheet`, `state()`, `settle()`), `model.mjs` (modèle indépendant du pointage), `smoke.mjs`, `undo.mjs`, `fuzz.mjs`.

Un défaut connu de l'app : `check(nom, fn, { known: 'description' })` (affiché KNOWN, ne bloque pas). Sélecteurs : privilégier les appels d'`onclick` et les identifiants (`pickResult('Gris',true)`, `#undoBtn`), jamais les textes de boutons.

## Animation de la feuille et trois modes de passage (C22B)

Par défaut le banc coupe l'animation de `#sheet` (feuille de style `transition:none`) et divise par 20 les minuteries de 400 à 1 600 ms. Trois modes, tous à 0 échec :

| Commande | Durée indicative |
|---|---|
| `node tests/run.mjs` | ~17 min (1 036 s mesurés le 9 oct. 2026 : 2 processus + phase au calme, fermeture de feuille raccourcie ; 1 362 s avant le chantier harnais-banc). `KINBALL_PARTS=2` (4 processus) : 660 s, mais les 2 cœurs sont saturés (86 %) et C22·4, M08·8 ont échoué sous cette charge |
| `KINBALL_ANIM=1 node tests/run.mjs` (animation de 0,22 s gardée) | ×1,5 environ par rapport au mode par défaut d'avant harnais-banc (mesuré sur un sous-ensemble) |
| `KINBALL_ANIM=1 KINBALL_TIMESCALE=1 node tests/run.mjs` (animation + vrais délais) | ×2,5 environ (même mesure) |

Un scénario peut aussi garder l'animation seul : `launch(gabarit, { anim: true })` (C22 le fait : les appuis fantômes se produisent pendant la descente de 220 ms).

`clickSheet(call)` clique comme une personne, **sans `force`** : il attend que `#sheet` porte `open`, ne porte pas `closing`, n'ait plus d'animation (`getAnimations().length === 0`), que le bouton existe, et que l'appui ne soit pas un « double appui » au sens de l'app (`sheetLastTap`, `SHEET_DOUBLE_MS`, `SHEET_DOUBLE_PX`) ; Playwright vérifie ensuite que le bouton reçoit bien l'appui. `undo()` attend la fin du réarmement de ↶ (`undoBlockedUntil`) puis clique sans `force` ; `undoInSheet()` clique le bouton `undo()` placé dans la feuille (feuille du duel) ; `settle()` attend aussi la fin de la classe `closing`. Les variables de l'app ajoutées par C22B sont lues sous garde `typeof` : le banc tourne encore sur une ancienne copie (`KINBALL_HTML=backups/kinball.C22B.avant.html`).

Chemins : plus aucun chemin local en dur. `KINBALL_SORTIE` et `KINBALL_AVANT` ont pour défaut un dossier du dossier temporaire du système ; sans `KINBALL_AVANT` pointant sur les sauvegardes « d'avant », C13B, C19 et C23 donnent des KNOWN supplémentaires. Playwright : `NODE_PATH`, sinon `~/.npm-global/lib/node_modules`. `tests/local/resync.test.mjs` vérifie l'absence de nom et de fragment d'adresse personnels dans MIGRATION.md par empreintes sha256 (aucun mot en clair dans le dépôt).

## Lanceur, résultat et cache (chantier harnais-banc)

`run.mjs` est un parent qui répartit les suites entre `KINBALL_PARTS` processus par gabarit (1 par défaut, donc 2 processus en tout ; 2 donne 4 processus, plus rapide mais instable sur 2 cœurs). La répartition se fait de la suite la plus longue à la plus courte, d'après les durées du dernier passage complet (`~/.cache/kinball-banc/durees.json`), ou à défaut d'après la table `POIDS` de `run.mjs`.

**Sortie.** Les lignes des processus fils arrivent au fil de l'eau. Par défaut, seuls les FAIL, les KNOWN et le résumé sont affichés ; `KINBALL_VERBEUX=1` affiche tout, en préfixant les lignes libres par `[gabarit#n]`.

**Phase au calme.** `check(nom, fn, { calme: true })` marque une vérification qui mesure une durée réelle (C13B·13). Pendant le passage parallèle, elle est reportée ; elle est ensuite jouée seule, un gabarit après l'autre. `KINBALL_CALME=0` supprime cette phase : cela ne sert qu'aux essais de robustesse sous charge.

**Fichiers écrits dans `KINBALL_SORTIE`.**
- `en-cours.json` : écrit pendant le passage ; il contient le pid, la progression et le chemin du journal.
- `resultat.json` : écrit à la fin.
- `verifications.json` : chaque vérification avec son état, sa durée, son gabarit et sa suite.

**Attente.** `node tests/attendre.mjs [--max 540] [--tout]` attend la fin du passage. Codes de sortie :
- 0 : vert ;
- 1 : rouge, passage interrompu, ou aucun résultat ;
- 2 : encore en cours au bout de `--max` secondes.

Tuer le parent par son PID arrête aussi ses processus fils.

**Cache.** L'empreinte (`tests/empreinte.mjs`) couvre :
- le sha256 de chaque fichier du dépôt, sauf `docs/`, `.claude/`, `tests/docs/`, `tests/README.md` et `CLAUDE.md` ;
- `KINBALL_HTML`, et le contenu de `KINBALL_AVANT` ;
- les versions de Playwright et de Chromium ;
- les variables `KINBALL_*` et `<ID>_ONLY` qui changent le passage.

Tout passage complet (sans `KINBALL_ONLY`, `KINBALL_GABARIT`, `KINBALL_BAIL` ni `*_ONLY`) range son résultat dans `~/.cache/kinball-banc/<empreinte>.json`. Avec `KINBALL_CACHE=1`, un résultat de même empreinte est affiché et rien n'est lancé.

**Vérifications instables corrigées.**
- M04·1 : attend le `load` du premier chargement avant de compter les rechargements.
- C13B·11 : attend que la base soit prête avant d'injecter le match à reprendre, puis vérifie que la reprise a eu lieu.
- C13B·13 : en phase au calme. Une mesure qui dépasse 50 ms est refaite sur une page neuve, au plus 2 fois ; chaque essai doit tenir toutes les bornes.
