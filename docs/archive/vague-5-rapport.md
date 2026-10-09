# Vague 5 — rapport du codeur (C25, C26, C27, C28)

Branche `vague-5-revue` (depuis `harnais-banc` 7bf9ce0), rien de poussé. Commits : C25 `d3cc7fb`, C26 `652776b`, C27 `ed2ea32`, C28 `f466494`, « Version du site » `1de6e94` (version 2026-10-09.1), puis trois commits de complément (tests C13B/C23, test resync·3, tableau des décisions).

## Banc
- **Passage complet** (une fois, sur `1de6e94`) : `KINBALL_AVANT=/home/claude/avant`, empreinte `1eb561f5a25742fb3c720c66` : **508/508, 0 échec, 8 connus, 1 202 s** (452 au point de départ + 56 : C25 14, C26 14, C27 6, C28 22).
- 8 KNOWN = copies d'avant absentes pour C13B·12, C19·7, C23·15, C23·16 (tablette et téléphone), comme au départ.
- Depuis ce passage, seuls des fichiers de test ont changé (C13B·12 et C23·16 retirent aussi `authorId` ; `tests/local/resync.test.mjs` cas 3). Ces vérifications KNOWN ont été rejouées à part contre une copie « d'avant » de substitution (la version précédant C28, avec les scripts du dépôt liés) : C13B·12, C19·7, C23·15, C23·16 passent, 28/28 sur tablette.
- `node sim/simtest.mjs` : tout passe. `tests/local/` : collecte 18/18, kblocal 63/63 (dont 5 nouveaux cas E4 à E8), resync 11/11 (après la correction du cas 3 : il prenait la ligne juste au-dessus de l'accroche M06, que C26 a retouchée).
- `check-release` : OK (version 2026-10-09.1).

## C25 — Import et sécurité
| Critère | Preuve (`tests/scenarios/C25.mjs`) |
|---|---|
| R5 plus rien d'exécutable | 1 : noms hostiles (3 formes, dont un `onerror` qui survit à `toUpperCase()`) dans équipes, joueurs, nom libre et nom de match, à chaque écran (accueil, Nouveau match, alignements, message éclair, feuilles, toutes les sections de stats, zones, fautes, fiches, adversaires `libre:`, Historique, Classement, corbeille) : compteur à 0, aucun élément injecté. 2 : identifiants hostiles injectés en mémoire, chaque bouton rend l'identifiant intact. |
| R4 validation | 3 et 4 : « N importés, M écartés (raisons) », 14 formes de match et 4 d'équipe mal formés, fichiers non reconnus ; Historique et « Mes équipes » s'affichent. 5 : sauvegarde v1, v2 et archive réelles s'importent sans écart. |
| R3 export réimportable | 6 : téléchargement réel de « JSON — Tout le match » puis import : match identique ; deuxième import ignoré ; match seul mal formé écarté. **Choix** : l'import accepte l'objet `{id, history}` ; l'export est inchangé (les fichiers déjà exportés restent valables, aucun format à migrer). |
| R22 | 7 : site servi en http, faux serveur de collecte : seul le match avec auteur part ; le match importé sans auteur reste visible et dans la sauvegarde complète. `kbcollect.js` : `reconcilier` et `envoyerVersion` ignorent un match sans `authorId`. |

Inventaire corrigé : 26 `onclick` avec identifiant (`jsArg`), `<option value>`, en-têtes de colonnes (`label`, `short`, `title`) qui portent les noms d'équipe, cellules de tableau sans `fmt`, message éclair, clé `libre:<nom>` (celle-ci était exécutable avec un nom libre : `'` seul protégé, pas `"` ni `\`). Aucune règle du jeu touchée.

**Contrôle négatif** (site avec `index.html` et `kbcollect.js` d'avant) : 1, 2, 3, 4, 6, 7 échouent ; 5 (non-régression) passe.

**Ce qu'une CSP demanderait (non faite)** : `script-src 'self'` impossible tant que les 129 `onclick` sont en ligne (il faudrait des gestionnaires posés par `addEventListener` et un `data-*`) ; à défaut `default-src 'self'; connect-src 'self' <adresse de collecte>; img-src 'self' data:; font-src 'self'; worker-src 'self' blob:` (le moteur WP tourne dans un Worker créé depuis un Blob) avec `style-src 'unsafe-inline'` (styles en ligne partout) et `script-src 'unsafe-inline'` : cette dernière directive n'arrête pas l'injection, seule `connect-src` limite l'envoi de données.

## C26 — Garde-fous du match
- **R9** : feuille armée nommant l'équipe, `deleted:true`, hors des choix/« Mes équipes »/classement/choix de fiche, récupérable depuis Sauvegarde (aussi après rechargement), « Effacer pour de bon » armé ; la sauvegarde complète et l'archive contiennent les équipes à la corbeille ; les matchs passés gardent noms et fiche (`getTeamAny`). M03·3 adapté (suppression = corbeille puis effacement).
- **R7** : « Et maintenant ? » non refermable ; terrain (appui, glisser), ↶ (bouton et fonction), feuille des joueurs, échange, TERMINER, FIN PÉRIODE refusés sur un match terminé ; état et base inchangés.
- **R6** : événement `fin_periode` (`before`, `details.winner`) ; ↶ le défait seul (menu TERMINER, FIN PÉRIODE du format libre, avec ou sans vainqueur, pendant le message ou après), le ↶ suivant défait l'action d'avant. Lecteurs vérifiés : sorties identiques avec et sans l'événement pour toutes les sections de stats, H2H, fautes, vue d'ensemble, situations, WP, compteurs, récapitulatif, export Actions (ligne « Fin de période ») et brut (colonne `winner`). `situationOf` le traite comme un départ arrêté. C23·3 adapté (il encodait l'ancien défaut).
- **R8** : `data-pid` sur la ligne ; renommage, homonymes, retrait + ajout, enregistrer sans changer ; deux joueurs déjà au même identifiant ne sont pas réécrits.
- **R20** : message « … est choisie pour deux couleurs (Bleu et Gris) », lancement bloqué ; en duel la couleur exclue ne compte pas. Ajout (hors brief, nécessaire) : le choix par défaut ne répète plus la même équipe d'office.
- Invariant du fuzz : suite aléatoire de 60 pas (graine 777) avec fins manuelles annulées, total pair hors duel, jamais négatif, chaque ↶ de fin = état d'avant (`diff` profond).
- **Contrôle négatif** : les 7 vérifications échouent sur la version d'avant.

## C27 — Stockage de l'appareil (pannes simulées dans Chromium, rien observé sur iPad)
- **R2** : `avecDb()` dans `kblocal.js` : sur `InvalidStateError`, `TransactionInactiveError`, `UnknownError` ou connexion marquée morte (`close`, `versionchange`), la connexion est oubliée, rouverte une fois, l'opération rejouée (une seule émission). Un second échec est rendu ; les réessais de `save()` repartent d'une ouverture neuve. Note : `close` et `versionchange` étaient déjà oubliés avant C27 ; ce qui manquait était la connexion morte sans événement (cas iOS) et le rejeu.
- **R1** : `lecturesEchouees` + relecture à 1,5 / 5 / 15 / 30 s ; bandeau d'accueil, copie de secours proposée avec avertissement rouge, « Récupérer » répond (message distinct de « encore en cours de lecture »), `baseIncomplete` ne fait plus attendre sans fin ; à la lecture réussie le bandeau normal et `copieRefusee` reprennent. Si la liste des auteurs est illisible, l'app lit au moins son propre espace.
- Preuves : `kblocal.test.mjs` E4 à E8 ; `C27.mjs` 1 (connexion morte en plein match, trois actions en base sans recharger), 2 (connexion morte + panne, badge, RÉESSAYER MAINTENANT), 3 (lecture en panne puis retour).
- **Contrôle négatif** : C27 1, 2, 3 échouent sur la version d'avant ; E4, E6, E7, E8 aussi (E5 est une garde de non-régression).
- **Décision à signaler** : « Récupérer » reste refusé tant que la lecture est en panne (comparaison impossible avec la base, donc risque d'écraser une version plus récente) ; il fonctionne dès que la lecture revient.

## C28 — Exports
- Quatre colonnes ajoutées en fin de ligne de la feuille Actions (CSV, XLSX) : `ID du match`, `Date du match`, `Heure de l’action`, `Code de faute` ; feuille « Match » : ID et date en dernières lignes. **Vérifié contre la copie d'avant** : en-tête, valeurs et lignes existantes identiques (C28·1, hors « Saisi par »).
- R10 : « Laval », « Laval (2) », « Laval (3) » dans les en-têtes et les colonnes d'équipe (via `nm()`, donc aussi dans les autres feuilles) ; en-tête échappé comme les données ; `;`, `"`, `\r`, `\n` se relisent à l'identique.
- CSV : texte commençant par `= + - @ \t \r` préfixé d'une apostrophe (jamais un nombre, `-1` reste `-1`), décimales à la virgule (actions et listes de coordonnées de l'export brut), `;` et BOM gardés. XLSX : vrais nombres, texte sans apostrophe, aucune formule (relu avec SheetJS sous Node).
- `at` : champ de l'événement (`commitEvent`, changement, alignement, `fin_periode`), UTC ISO 8601, jamais dans `before`/`details` ; ↶, `snapshotBefore`, WP inchangés. Suites adaptées pour l'exclure comme `ts`/`by` : C13B·12, C19·7, C20, C21, C23·16, C24.
- **Écarts à signaler** : (1) apostrophe typographique `’` dans `Heure de l’action`, comme les en-têtes existants (`Type d’action`) ; (2) dates en UTC (`…Z`) plutôt qu'avec le décalage local, pour des fichiers identiques d'un appareil à l'autre ; (3) `kbcollect.js` retire `at` de la copie épurée envoyée, pour que le contenu partagé, son empreinte et la page de confidentialité ne changent pas ; (4) l'export brut garde son en-tête (pas de colonne `at`) ; (5) la feuille Actions garde les noms d'équipe dans ses colonnes de score (non demandé : pas d'export « tous les matchs »).
- **Contrôle négatif** : les 11 vérifications échouent sur la version d'avant.

## Fichiers modifiés
Site : `index.html`, `kbcollect.js`, `kblocal.js`, `kbsite.js`, `sw.js` (version). Tests : `tests/scenarios/C25.mjs` à `C28.mjs` (nouveaux), `C13B`, `C19`, `C20`, `C21`, `C23`, `C24`, `M03`, `tests/local/kblocal.test.mjs`, `tests/local/resync.test.mjs`. Docs : `docs/donnees.md`, `docs/saisie.md`, `docs/stats-et-export.md`, `docs/decisions.md`, `tests/docs/C25.md` à `C28.md`.

## Limites
- Aucune panne de stockage observée sur un vrai iPad ; Excel non disponible (décimales, apostrophe non vérifiées dans Excel lui-même).
- Les copies « d'avant » de C13B, C19 et C23 n'existent pas dans `/home/claude/avant` (8 KNOWN) ; leurs comparaisons adaptées ont été validées contre une copie de substitution seulement.
- Les dossiers de site « d'avant » du contrôle négatif sont dans `/home/claude/avant-neg/` (hors dépôt, liens vers le dépôt) ; `/home/claude/avant/` contient les copies `kinball.C25..C28.avant.html`, `kbcollect.C25.avant.js`, `kblocal.C27.avant.js`, `kbsite.C27.avant.js`, plus C20/C21/C24 copiées depuis le dossier d'évaluation (nécessaires à C20·7, C21·9, C24).
- Pas de CSP (voir ci-dessus). R12 à R26 non traités (hors brief).
