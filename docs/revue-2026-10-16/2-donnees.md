# Revue 2 — Stockage, sauvegarde, import, corbeille, identité, site

Date : 2026-10-16. Lecture seule, sans exécution du banc. Fichiers lus en entier : `kblocal.js`, `kbsite.js`, `kbcollect.js`, `sw.js`, `config.js`, `manifest.webmanifest` ; les scripts de `confidentialite.html`. Dans `index.html` : l. 1159-1310 (en-tête, formats, `freshState`), 1309-1912 (base, stockage, synchronisation, matchs par auteur, identité, migration, corbeille, `save()`, récupération), 2083-2107 et 2221-2270 (`matchVide`, `resumeMatch`), 3455-3508 (`discardMatch`), 5628-5654 (`saveFile`), 6028-6035 et 6037-6769 (équipes, historique, corbeille, sauvegarde, archivage, import).

Sauf mention « supposé », chaque constat a été vérifié **par lecture du code**. Aucun n'a été reproduit dans un navigateur.

## Synthèse

| # | Gravité | Constat | Où |
|---|---|---|---|
| I1 | important | REPRENDRE ignore une copie de secours plus récente du même match. La première action l'écrase sans rien dire | `index.html` 2246-2270, 1825-1866 |
| I2 | important | La fin d'une écriture plus ancienne efface `pendingSaveId` et la copie de secours d'une écriture plus récente : c'est R21, qui n'est plus suivi dans le registre. Le réessai automatique est aussi perdu | `index.html` 1772-1776, 1756, 1796 |
| M1 | mineur | Mettre à la corbeille ou récupérer un match ne change pas `updatedAt` : l'import et le rappel de sauvegarde ne voient pas ce changement | `index.html` 1693, 1701, 3481, 3504 ; `kbsite.js` 531 |
| M2 | mineur | Un match EN COURS mis à la corbeille depuis l'historique reste vivant dans `S` : un réessai en attente le fait réapparaître | `index.html` 1689-1696, 6228-6231 |
| M3 | mineur | « Récupérer ce match » n'a pas la garde R19 (écriture en attente d'un autre match) | `index.html` 1868-1882 |
| M4 | mineur | Le badge repasse au vert à chaque instantané, même si une écriture du match reste en échec | `index.html` 1442, 1503, 1610 |
| M5 | mineur | `discardMatch` en échec : les dernières actions non écrites sont perdues, alors que le message dit « toujours dans l'historique » | `index.html` 3473-3495 |
| M6 | mineur | Import : un même identifiant présent deux fois dans le fichier, c'est le dernier qui gagne, quel que soit son `updatedAt` ; un match de la corbeille réimporté est compté « ajouté » | `kbsite.js` 528-535 ; `index.html` 6732 |
| M7 | mineur | Trous dans la validation de l'import : `format` (plante l'écran de match) et `history[].before` (supposé) | `index.html` 1234, 2560, 6687-6708 |
| M8 | mineur | Lecture en panne : une copie locale `deleted` est retirée sans être écrite | `index.html` 1827-1836 |
| M9 | mineur, supposé | Premier lancement de l'app installée : rien ne dit quand elle est prête hors ligne | `sw.js` 38-47, `kbsite.js` 258-271 |
| M10 | propreté | `avecDb` rejoue aussi une erreur de quota quand la connexion est déjà marquée morte, contrairement à ce que dit le commentaire | `kblocal.js` 151-159 |
| P1 à P6 | propreté | Restes du temps claude.ai (commentaires faux, code mort), `amont/`, `MIGRATION.md`, `resync.mjs`, duplication entre `kbsite.js` et l'app | voir plus bas |

**Rien de nouveau en XSS** dans ce périmètre (détail en fin de rapport). **Le service worker est sain** : un cache par version, remplissage tout ou rien, activation seulement sur accord, et chaque page reçoit les fichiers de sa propre version. Je n'y ai trouvé aucun moyen de rester bloqué sur une vieille version ni de casser le hors-ligne une fois la première installation faite.

Constats déjà connus que j'ai confirmés, sans les compter : **R15-C** (une copie `deleted` non vide est gardée sans fin, l. 1837), **R24** (`amont/` publié sur la même origine), **R17** (`plainAuthor` renvoie l'identifiant brut, l. 1597), **E4** (deux relances de `items:<moi>`, l. 1481 et 1492), **E8**, **R25** (SheetJS chargé à chaque démarrage, l. 1156), et les **constats préexistants de l'audit #13** (« NOUVEAU match non protégé pendant une écriture en attente » : `startMatch`, l. 2466).

---

## I1 — REPRENDRE ignore une copie de secours plus récente du même match (important)

- **Où** : `resumeMatch` (`index.html` 2246-2270) fait `S = JSON.parse(JSON.stringify(record))` à partir de la base, sans regarder `localStorage`. La bannière de récupération (`checkLocalBackups`, 1825-1866) et la carte « Reprendre » (`checkResume`, 2221-2239) s'affichent indépendamment l'une de l'autre.
- **Scénario** :
  1. Un match est en cours ; les écritures dans IndexedDB échouent (connexion perdue, quota) ou l'app est tuée dans la fenêtre décrite en I2.
  2. Au relancement, l'accueil montre en même temps « Un match n'avait pas été sauvegardé — N action(s)… de plus que la version enregistrée » **et** la carte « Reprendre » du même match : la version de la base est en cours et non vide, donc reprenable.
  3. La personne touche le gros bouton REPRENDRE (ou REPRENDRE sur la ligne de l'historique, ou le bouton de la barre d'app). `S` devient la version **plus ancienne** de la base.
  4. À la première action, `save()` → `writeLocalBackup(snapshot)` remplace la copie de secours sous la même clé `kinball_backup_<id>`. Les N actions non enregistrées sont perdues, sans aucun message. La bannière reste affichée, mais « Récupérer » rendrait désormais l'état courant.
- **Pourquoi c'est grave** : la copie de secours est le dernier filet, et c'est justement le geste le plus naturel qui la détruit.
- **Correction proposée** : dans `resumeMatch`, avant de remplacer `S`, chercher la copie locale de `record.id`. Si elle est candidate selon la règle de `checkLocalBackups` (plus récente et au moins aussi fournie, non `deleted`, non `copieObsolete`), reprendre la copie, en passant par `restoreLocalBackup(id)` ou par la même logique, ou bien ouvrir une feuille « Une version plus complète existe sur cet appareil : la reprendre ? ». Autre solution, plus simple : masquer REPRENDRE (carte, barre d'app, ligne de l'historique) tant que la bannière propose ce match-là. Tester le cas (copie plus récente, puis REPRENDRE, puis une action, puis rechargement) : les N actions doivent toujours être là.

## I2 — Une écriture terminée efface l'état « en attente » d'une écriture plus récente : R21, plus suivi (important, rare)

- **Où** : `save()` (`index.html` 1758-1785). La copie de l'état (`payload`) est prise **au début** de l'étape de la file (1772). À la fin de cette étape, `if(pendingSaveId === payload.id) pendingSaveId = null` (1775) et `markLocalBackupSynced(payload.id)` (1776) s'appliquent **quel que soit le nombre de `save()` appelés entre-temps**.
- **Scénario A (R21 de la revue du 2026-10-09)** : pendant l'écriture N (`await writeMatchDoc`), l'action N+1 appelle `save()`, qui dépose la copie de secours N+1 et met l'étape N+1 en file. L'étape N se termine et retire la copie N+1. Si l'app est tuée avant la fin de l'étape N+1, l'action N+1 est perdue.
- **Scénario B (nouveau, plus large que R21)** : même début, mais l'écriture N+1 **échoue**. C'est le cas typique de la première écriture qui dépasse le quota, juste après une écriture réussie. L'étape N a déjà mis `pendingSaveId` à `null`, donc :
  - la minuterie du réessai ne fait rien (`if(pendingSaveId) save(true)`, 1756) ;
  - le retour du réseau non plus (1796) ;
  - `hasUnsavedWork()` est faux, donc pas d'alerte `beforeunload`, la garde R19 de `resumeMatch` saute, et la mise à jour peut s'appliquer (`sansTravailNonEnregistre`) ;
  - la copie de secours a été retirée.

  L'action N+1 n'existe plus qu'en mémoire, avec un badge rouge. Une nouvelle action, ou RÉESSAYER MAINTENANT (qui appelle `save(true)` sans condition), rattrape la situation. Si c'était la dernière action avant de fermer l'app, elle est perdue.
- **Registre** : R21 n'apparaît ni dans les chantiers terminés (C27 = R2 et R1) ni dans « Autres lignes » de `docs/chantiers.md`. Il a été perdu en route.
- **Correction proposée** : un compteur `let saveSeq = 0`. `save()` fait `const seq = ++saveSeq`, et l'étape lit `const seqDebut = saveSeq` au moment où elle prend `payload`. Après l'écriture, ne remettre `pendingSaveId` à `null`, `retryStep` à 0 et ne retirer la copie que si `saveSeq === seqDebut`, c'est-à-dire si aucune `save()` n'a eu lieu depuis la prise de `payload`. Variante : ne retirer la copie que si sa `match.updatedAt` est égale à `payload.updatedAt`. Test : bloquer `writeMatchDoc` sur une promesse, appeler deux fois `save()`, libérer la première écriture et faire échouer la seconde, puis vérifier que `pendingSaveId`, la copie locale et la minuterie de réessai sont toujours là.

## M1 — Corbeille et récupération sans `updatedAt` (mineur)

- **Où** :
  - `dbTrashMatch` (1693), `dbRestoreMatch` (1701), `discardMatch` (3481) et `restoreDiscarded` (3504) recopient le match sans changer `updatedAt`, alors que `dbTrashTeam` et `dbRestoreTeam` le mettent à jour (1618, 1624).
  - L'import compare uniquement `updatedAt` (`kbsite.js` 531 : à égalité, il ignore).
- **Scénario** :
  1. L'appareil B est restauré depuis la sauvegarde 1 (match X actif, `updatedAt` T).
  2. Sur A, X est mis à la corbeille ; la sauvegarde 2 contient X avec `deleted:true` et le même T.
  3. Importer la sauvegarde 2 sur B : X est « ignoré : déjà à jour », et reste dans l'historique et les statistiques de B. Même chose dans l'autre sens pour une récupération depuis la corbeille.
  4. Le rappel « des données ont changé depuis » (`kbsite.js` 641-643) ne compte pas non plus une mise à la corbeille.
- **Correction proposée** : ajouter `updatedAt: Date.now()` dans ces quatre recopies. À vérifier en même temps : `copieObsolete` (`kbsite.js` 728-732), qui deviendra plus strict. Une copie locale plus récente que la base, mais plus ancienne que la mise à la corbeille, ne sera plus proposée. C'est le comportement voulu par R15 ; aujourd'hui, elle est proposée avec le libellé faux « absent du stockage de cet appareil » (1861), puisque `getMatchRecord` ne voit pas la corbeille.

## M2 — Un match EN COURS mis à la corbeille depuis l'historique peut réapparaître (mineur)

- **Où** : `doDeleteMatch` → `dbTrashMatch(id)` (6228-6231, 1689-1696) écrit la version **de la base**, avec `deleted:true`, sans toucher à `S` ni à la file d'écriture. `discardMatch` (3468-3496) prend ces précautions ; ce chemin-là, non.
- **Scénario** :
  1. Pendant le match M, une écriture a échoué (`pendingSaveId = M`, réessai programmé).
  2. ⌂, puis Historique, puis 🗑 sur la ligne M (EN COURS). L'écriture de la mise à la corbeille réussit, car la panne était passagère.
  3. Le réessai programmé réécrit `S` (non supprimé, `updatedAt` plus récent) : M revient dans l'historique.

  Même chose si `S` contient des actions plus récentes que la base.
- **Correction proposée** : dans `dbTrashMatch`, si `!viewingArchive && S.id === id`, appliquer la séquence de `discardMatch` : couper le réessai, retirer la copie locale, `S = freshState()`, attendre `saveChain`, puis écrire `S` (le plus récent) avec `deleted:true`. Ou plus simplement : poser `S.deleted = true` et appeler `save()`, comme `corbeilleSiMatchVide`.

## M3 — « Récupérer ce match » sans la garde R19 (mineur)

- **Où** : `restoreLocalBackup` (1868-1882) remplace `S` sans tester `hasUnsavedWork()`.
- **Scénario** :
  1. La bannière propose le match B (copie d'une session précédente).
  2. La personne lance le match A ; les écritures de A échouent ; elle revient à l'accueil et touche « Récupérer » B.
  3. Le réessai de A relit `S`, qui est maintenant B, et A n'est plus réécrit de la session. Sa copie locale reste, mais elle ne sera proposée qu'au démarrage suivant, puisque `backupChecked` est vrai.

  C'est le même défaut que celui que `resumeMatch` corrige (R19), et que celui des « constats préexistants (audit #13) » pour NOUVEAU match.
- **Correction proposée** : reprendre le bloc de garde de `resumeMatch` (2250-2260), en une fonction partagée par `resumeMatch`, `restoreLocalBackup` et `startMatch`.

## M4 — Le badge passe au vert alors qu'une écriture du match est en échec (mineur)

- **Où** : `setSyncState('ok')` est appelé sans condition dans le rappel des équipes (1442), dans `rebuildMatches` (1503) et après toute réussite de `dbSetTeam` (1610).
- **Scénario** :
  1. La sauvegarde du match échoue (badge « Non enregistré », réessais en cours).
  2. Une autre écriture réussit, ou une relecture après panne livre un instantané : par exemple une équipe modifiée, un document plus petit qui passe sous le quota, ou un abonnement relu après R1.
  3. Le badge disparaît, alors que `pendingSaveId` est toujours posé. La personne croit le match enregistré.
- **Correction proposée** : `setSyncState(pendingSaveId ? dbSyncState : 'ok')` dans ces trois endroits, ou une fonction `etatSync()` qui déduit l'état de `pendingSaveId` et de `retryTimer`.

## M5 — `discardMatch` en échec perd les actions non écrites (mineur)

- **Où** : 3473-3484. La copie locale est retirée (3475, 3480) et `S` est remis à neuf (3477) **avant** l'écriture. Si `writeMatchDoc(copie)` échoue, `copie` n'existe plus qu'en mémoire jusqu'à la fin de la fonction.
- **Scénario** : stockage en panne, TERMINER, puis « Ne pas enregistrer », geste maintenu, et l'écriture échoue. Le message dit « « X » est toujours dans l'historique ». En réalité, l'historique contient la dernière version **écrite** : les actions saisies pendant la panne ont disparu, sans copie locale. Si la personne change d'avis, elle ne retrouve pas ce qu'elle a vu.
- **Correction proposée** : en cas d'échec, redéposer `writeLocalBackup(copie sans deleted)`, ou rendre `S = copie` avec `pendingSaveId`. Corriger le message en conséquence.

## M6 — Import : identifiants en double et décompte (mineur)

- **Où** : `KBSite.importDebut().garder` (`kbsite.js` 528-535) compare chaque enregistrement à la table `local` lue **avant** l'import, et ne la met jamais à jour après un enregistrement retenu. `existingMatchIds` (`index.html` 6732) ne contient que `MATCHES_DB`.
- **Scénario** :
  - Un fichier qui contient deux fois le même match (fichiers concaténés, ou une sauvegarde dont un identifiant figure à la fois dans `MATCHES_DB` et dans `DELETED_MATCHES` parce qu'il existe dans deux espaces d'auteur) : les deux versions sont écrites, et la **dernière du fichier** gagne, même si elle est plus ancienne.
  - Un match de la corbeille rafraîchi par l'import est compté « ajouté », pas « mis à jour ».
- **Correction proposée** : dans `garder`, après `ok`, faire `table[obj.id] = obj.updatedAt || 0`. Construire `existingMatchIds` à partir de `MATCHES_DB` et de `DELETED_MATCHES`.

## M7 — Trous dans la validation de l'import (mineur)

- **`format`** : `raisonMatch` (6687-6708) ne regarde pas `format`, et `getFormat` (1234) renvoie `m.format` tel quel s'il n'est pas un format connu. Un match importé avec `"format":"9_11"` (une chaîne) ou `"format":{}`, puis repris : `renderScoreboard` plante sur `getFormat(S).label.toUpperCase()` (2560), et l'écran de match devient inutilisable. Les seuils (`periodAt`, `eliminationAt`) ne sont pas contrôlés non plus. Il faut un fichier abîmé ou d'une autre origine (E6 couvre seulement les identifiants et `status`). **Correction** : dans `raisonMatch`, si `format` est présent, exiger un objet dont `id` est une clé de `FORMATS`, ou des nombres et null pour les seuils. Ou faire en sorte que `getFormat` retombe toujours sur `FORMATS[DEFAULT_FORMAT]` quand `format.id` est inconnu.
- **`history[].before`** (supposé, non suivi jusqu'au bout) : il n'est pas contrôlé. Un `before` qui n'est pas un objet ferait sans doute planter ↶, les phases et le cumul d'équipe, qui lisent `before.scores` et `before.lineups`. **Correction** : `before` facultatif, mais objet s'il est présent.

## M8 — Lecture en panne : une copie `deleted` est retirée sans être écrite (mineur)

- **Où** : `checkLocalBackups` (1827-1836). Quand la lecture est illisible, la fonction continue, et la branche « copies supprimées » fait `getMatchRecord(...)`, qui vaut `null` puisque rien n'a été lu, donc `markLocalBackupSynced`.
- **Effet** : une mise à la corbeille automatique (match vide, R15) qui n'avait pas été écrite est oubliée. Le match vide reste EN COURS dans la base. Il n'est ni compté ni reprenable : aucune perte de données, seulement un vide de plus dans l'historique (proche de R15-C).
- **Correction proposée** : sauter cette branche tant que `lecturesEchouees.size > 0`.

## M9 — Premier lancement de l'app installée : rien ne dit quand elle est prête hors ligne (mineur, supposé)

- **Où** : `sw.js` n'appelle ni `skipWaiting` ni `clients.claim` à la première installation (un test M04·9 l'exige), donc la première page n'est pas contrôlée. Le précache pèse environ 1,5 Mo (xlsx 880 Ko, polices) et se télécharge pendant cette première ouverture. Sur iOS, l'app installée a un stockage séparé de celui de Safari : elle refait cette installation à son premier lancement.
- **Scénario supposé** : la personne installe l'app, l'ouvre une fois quelques secondes (installation du service worker incomplète, ou app tuée), puis arrive au gymnase sans réseau : l'app ne s'ouvre pas.
- **Correction proposée** : une ligne « Prête hors ligne : oui / non » dans l'écran Sauvegarde (`navigator.serviceWorker.controller` et `registration.active`), ou une mention sur la carte d'installation. À essayer sur iPad (ESSAI-5) avant de coder.

## M10 — `avecDb` rejoue une erreur de quota quand la connexion est déjà morte (propreté)

- **Où** : `kblocal.js` 154 : `if (!db.kbMorte && !connexionMorte(e)) throw e;`. Si la connexion a été marquée morte (événement `close`) pendant l'opération, n'importe quelle erreur est rejouée, `QuotaExceededError` compris. Le commentaire (137-141) et `docs/donnees.md` affirment le contraire.
- **Effet** : une seule réouverture et un seul second essai, sans danger, puisque l'écriture est idempotente. C'est un écart entre la doc et le code, pas une perte.
- **Correction proposée** : `if (connexionMorte(e) || (db.kbMorte && !(e && e.name === 'QuotaExceededError')))`, ou corriger le commentaire.

---

## Propreté et restes du temps claude.ai

### P1 — Commentaires devenus faux (à corriger en priorité dans ce groupe, car ils trompent les agents)
- `index.html` 1321-1336 : « ils sont stockés sur les serveurs de Claude… survit à un iPad réinitialisé… consultable depuis n'importe quel appareil ». C'est **faux** et dangereux à lire : tout est local. À remplacer par une phrase sur KBLocal.
- 1403-1427 : règles du serveur, « le serveur refuse l'écriture chez le voisin », « compte non résolu » ; 1557-1559 (« écriture réservée ») ; 1654-1662 (migration réservée au propriétaire) ; 1719-1722 et 1819-1824 (« parti au serveur ») ; 5628-5634 (« viewer d'artifact ») ; 6512-6517 (plafond de 5 000 documents) ; 6664-6667 (« le serveur refusera ») ; 1169 (« l'app vit dans Claude »).
- La variable `serveur` dans `checkLocalBackups` (1835-1861) désigne en fait la base locale.

### P2 — Code mort en mode local
- `capabilityEntry` (1516-1520) : la branche `window.claude`. Les tests `!global.claude` dans `kbsite.js` (18, 196, 394) et `kbcollect.js` (19), et les textes alternatifs `KBSite.local ? … : 'Non synchronisé…' / 'PAS PU JOINDRE LE SERVEUR'` (1400, 1810, 3493-3494).
- `migrateLegacyMatches`, `legacyMatches`, la suppression « ancienne place » de `dbDeleteMatchDoc` (1650) et la branche « matchs à plat » de `kbsite.lireBase` (463). IndexedDB n'a jamais contenu de matchs « à plat » (ils vivaient sur le serveur de claude.ai), et l'import écrit toujours sous `items`. Ce code ne peut plus servir.
- `CAN_EDIT_TEAMS` (`canEdit()` vaut toujours vrai) et ses branches « équipes gérées par le propriétaire » (6046, 6065, 6561-6563) ; `isOwner`.
- Le repli « lien de téléchargement » de `saveFile` (5648-5653) : KBLocal fournit toujours `downloads`.
- **Archivage** : `startArchiveOldMatches`, `confirmArchiveOldMatches`, `eligibleArchiveMatches`, `warn` (6608-6648), et dans `kbsite.js` le masquage et la réécriture de leurs textes (68-88). Ce code fait une **vraie suppression**, contraire à l'invariant « une suppression s'écrit `deleted:true` ». Il n'est caché que par `kbsite.js`, après coup (la carte est visible un instant au démarrage, et toujours visible si `kbsite.js` ne charge pas). À retirer plutôt que masquer. Garder l'acceptation du format `kinball_archive` à l'import (il a une liste `matches`, c'est déjà le cas).
- `kbsite.js` 520-521 : `lu` et `cible` sont déclarées et jamais lues.

### P3 — `amont/`, `MIGRATION.md`, `outils/resync.mjs`
- `amont/kinball.amont.html` est figé depuis le 2026-10-04 (vague 3), et l'artifact d'origine n'évolue plus (D94). Ils ne servent plus qu'à :
  - `VERSION_AMONT` (« app amont cce95ad2 » sur l'écran Sauvegarde, sans intérêt pour la personne) ;
  - une vérification de `check-release` ;
  - `tests/local/resync.test.mjs` ;
  - le motif de `tests/rapide.json`.
- Publiée sur la même origine (R24), cette copie de l'app sans KBLocal peut afficher les copies `kinball_backup_*` de la vraie app, et les retirer par « Ignorer ».
- **Proposition** : une PR qui retire `amont/`, `outils/resync.mjs`, son test et la section 2 de `MIGRATION.md`, et ramène `MIGRATION.md` à un court historique des points d'accroche, ou le fond dans `docs/site.md`. Elle simplifie aussi `check-release` (plus de champ « amont ») et adapte les deux assertions qui lisent « amont » (M04 l. 306, M06 l. 180). Le pire de R24 disparaît avec. Les commentaires `MIGRATION Mxx` de `index.html` peuvent rester (repères pour `grep`), mais le tableau de `MIGRATION.md` en décrit déjà certains de travers (« checkLocalBackups (2 lignes) »).

### P4 — `sw.js` : l'entrée `"./"` du précache
`"./"` n'est jamais lue : une navigation vers la racine est servie depuis `index.html` (l. 71). Elle double donc le téléchargement de `index.html` (environ 390 Ko) à chaque installation. À retirer, si `check-release` et M04 ne l'exigent pas (non vérifié).

### P5 — La même règle écrite deux fois, dans deux fichiers
- « Copie récupérable » : `checkLocalBackups` (1843-1850 : plus récente **et** au moins aussi fournie) et `KBSite.copieRefusee` (`kbsite.js` 742 : la même règle à l'envers), plus `copieObsolete`. Une seule fonction `copieRecuperable(b)` dans `index.html`, appelée des deux côtés, éviterait qu'elles divergent. I1 en a besoin.
- `kbsite.lireBase` (454-476) refait le parcours auteurs, `items` et matchs « à plat » que l'app fait déjà avec ses abonnements. `enregBase` (708-713) refait `getMatchRecord` en y ajoutant `DELETED_MATCHES`.
- `kbsite.js` repère des boutons de l'app par le texte de leur `onclick` (`[onclick^="startMatch("]`, `startArchiveOldMatches(`, `openBackup()`) : c'est fragile au moindre renommage. C'est documenté (`docs/site.md`), mais un `data-kb="…"` serait plus sûr.

### P6 — `kbsite.js` et la « sauvegarde faite »
Avec le lien de téléchargement (ordinateur), `kb:fichier` part dès `a.click()` (`kblocal.js` 558-562) : la sauvegarde est notée « faite », même si le téléchargement est annulé. Sur iPad, c'est la feuille de partage, avec une issue fiable. Aucun effet sur l'appareil cible.

---

## XSS (`escapeHtml`, `jsArg`) : vérifié, rien de nouveau

- **`kbsite.js`** : tout le texte variable passe par `textContent` ou `echapper()` (le nom de fichier de FICHIER PRÊT, le compte rendu de l'import, le message de `copieRefusee`).
- **`kbcollect.js`** : uniquement `textContent`, `cfg.contact` compris ; seules des constantes passent dans `openSheet`.
- **`confidentialite.html`** : `textContent`.
- **`index.html`, dans mon périmètre** :
  - bannière de récupération (`matchName` échappé, identifiant par `jsArg`) ;
  - historique (nom, `title`, `aria-label`, noms d'équipe, auteur) ;
  - corbeille ;
  - feuilles de confirmation ;
  - éditeur d'équipe (`value="${escapeHtml(name)}"`) ;
  - gestion des équipes ;
  - `jsArg` sur tous les identifiants dans les `onclick`.

  `escapeHtml` traite `& < > " '`. `jsArg` code tout caractère hors `[A-Za-z0-9_-]`, y compris chaque moitié d'un caractère hors BMP, ce qui est sûr. L'absence de CSP est connue et documentée (`docs/donnees.md`).

## Service worker : vérifié, rien de bloquant

- `install` est tout ou rien, `cache: 'reload'`, et l'enregistrement se fait avec `updateViaCache: 'none'`. La nouvelle version n'est activée que par `ACTIVER`, refusé pendant un match ou une écriture en attente (sauf l'écart d'I2 sur `pendingSaveId`). Un seul rechargement, dans la page qui l'a demandé. `activate` ne supprime que les caches `kinball-*` des autres versions.
- `fetch` : uniquement `GET` de même origine, servi par le cache de la version, et le réseau sans mise en cache hors précache. Une page ne peut donc pas mélanger deux versions.
- `EMPREINTE` change dès qu'un fichier du site change, ce qui déclenche toujours une mise à jour.
- Hors ligne, un fichier hors précache donne une erreur réseau : c'est le comportement attendu. Le seul fichier chargé à la demande, `kbcollect.js`, est dans le précache.
- Seul point à surveiller : M9 (le premier lancement).

## Identité : vérifié

- Le `u_…` est créé dans une seule transaction, avec un repli sur `localStorage`. `importIdentity` valide le motif.
- La reprise d'identité n'a lieu que si la base est vide (sans équipe, sans match, sans copie locale) et sans échec d'écriture. Elle est suivie d'un rechargement forcé : la feuille ne se ferme pas, et seul CONTINUER recharge.
- Les matchs importés gardent l'espace de leur auteur ; la collecte ne lit que `matches/<moi>/items` et saute ceux qui n'ont pas d'auteur (R22). `lineups` ne contient que des identifiants, donc aucun nom de joueur ne part par `before.lineups`.
- Effet de bord connu (E8, proche) : la reprise est refusée dès qu'une équipe a été créée avant l'import. Deux appareils restaurés depuis la même sauvegarde partagent la même identité ; c'est voulu, mais ce n'est pas documenté comme tel.
