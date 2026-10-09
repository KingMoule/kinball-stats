# Données : modèle, stockage, sauvegarde

## Le match, `S`

`S` est l'état du match courant ; `freshState()` en donne la forme. Champs de jeu : `id`, `status` (`in_progress` ou `completed`), `createdAt`, `updatedAt`, `matchName`, `names`, `teamIds` (référence vers une équipe enregistrée, ou `null` pour un nom libre), `rosters` (copie de l'alignement des équipes au coup d'envoi), `lineups` (joueurs sur le terrain en ce moment), `startingLineups`, `possession`, `scores`, `period`, `periodWins`, `eliminated`, `duelActive`, `awaitingDuelStart`, `awaitingInitial`, `stopped`, `format`, `activeTeams`, `authorId`, `advancedMode`, `history`. Les champs d'interface hérités (`heat*`, `sheetDismissable`) sont dans `S` mais ne doivent plus grandir.

Un match référence une équipe sans la modifier : `rosters` est une copie, donc modifier une équipe plus tard ne réécrit jamais l'historique. Le format est enregistré dans le match (`S.format`) pour qu'un match archivé se relise avec ses propres règles.

### L'historique

`S.history` est le cœur : un tableau d'événements `{type, before, details}`, plus `by` quand l'auteur de l'action diffère de celui du match (jamais en pratique : une seule personne saisit un match).

- `before` : instantané de l'état juste avant l'événement (`snapshotBefore()` : `scores`, `possession`, `period`, `periodWins`, `eliminated`, `duelActive`, `awaitingDuelStart`, `awaitingInitial`, `stopped`, `lineups`). C'est ce qui permet ↶ : restaurer `before` et retirer l'événement. C'est aussi ce que lisent les phases, les statistiques de présence et le +/-.
- `details` : ce qui est propre à l'événement.

| `type` | Clés de `details` |
|---|---|
| `lancer` | `attacker`, `start_norm`, `end_norm` (positions de 0 à 1), `result` (`attrapé` ou `échappé`), `target`, `situation` (`arretee` ou `continue`) ; selon le cas `attacker_player_id`, `attacker_player_name`, `target_player_id`, `target_player_name` (mode avancé) |
| `lancer` DÉF ILL | comme ci-dessus avec `result:'échappé'`, `target` = l'équipe fautive, `fault_type:'DÉF ILL'`, sans `start_norm`, `end_norm` ni joueur |
| `faute_directe` | `position_norm`, `fault_type` (un code de `FAULTS`), soit `attacker_player_id` et `attacker_player_name`, soit `fault_scope:'equipe'` |
| `reprise` | `team`, `team_name` (aucun point) |
| `changement` | `team`, `player_out_id`, `player_out_name`, `player_in_id`, `player_in_name` |
| `alignement` | `team`, `lineup_ids`, `lineup_names` (alignement défini en cours de match) |

La fin de période manuelle n'est pas un événement (elle ne laisse que `periodWins`).

**Ce qui se calcule à la lecture n'est pas stocké** : la zone d'un lancer (de `start_norm`, `end_norm`, `position_norm`), la phase d'une action (de `before`), les pourcentages par période. Une nouvelle façon de lire s'applique donc d'elle-même à tous les matchs déjà enregistrés. Exception voulue : `details.situation` est figée à la saisie.

**Pas de migration.** Tout champ nouveau a une valeur par défaut sûre à la lecture ; un ancien match (sans `format`, avec un `heatGrid`, avec une clé `pendingPeriodWinner`) s'ouvre sans erreur. Les codes de `FAULTS` sont la valeur stockée de `fault_type` et ne changent jamais ; seul l'affichage passe par `faultLabel()`.

**Qui a pris les stats.** `S.authorId` est l'identifiant de la personne qui a lancé le match, jamais son nom ; le nom se résout à l'affichage (`resolveProfiles`, `authorLabel`, `plainAuthor`).

## Stockage local : `KBLocal`

Les données vivent dans IndexedDB, base `kinball-stats`, par la façade `kblocal.js`, que l'app utilise comme elle utilisait la base de claude.ai (`capabilityEntry('db')`).

- Magasin `docs` : un enregistrement par document, clé = chemin complet, index `parent` pour les collections. Magasin `meta` : paires clé/valeur (identité, réglages du site).
- Chemins : `teams/<idÉquipe>` ; `matches/<idAuteur>/items/<idMatch>` ; `matches/<idAuteur>` (fiche d'auteur, créée à la première écriture). Cette organisation par auteur vient du temps où plusieurs comptes partageaient une base ; en mode local il n'y a qu'un auteur (l'identité de l'appareil), mais le code la traverse encore. Les anciens matchs « à plat » (`matches/<idMatch>`) sont encore lus et migrés par `migrateLegacyMatches`, code qui ne sert plus.
- `TEAMS_DB`, `MATCHES_DB`, `DELETED_MATCHES` ne sont jamais écrits directement : ils sont alimentés par les abonnements `onSnapshot` (`subscribeTeams`, `subscribeMatches`, `subscribeOwnerMatches`, `rebuildMatches`). Toute écriture passe par `dbSetTeam`, `dbDeleteTeam`, `writeMatchDoc` ou `save()`.
- Principes de `KBLocal` : une transaction par document, copie profonde figée au moment de l'écriture, miroir en mémoire mis à jour seulement après validation, schéma qui ne fait qu'ajouter, aucune opération destructive.
- Identité de l'appareil : un identifiant `u_…` créé dans une seule transaction, rangé dans `meta` et recopié dans `localStorage` (`kinball_install_id`). Une sauvegarde v2 l'emporte avec elle.
- Le site demande un stockage persistant (`KBLocal.storage.requestPersist`) au démarrage et au premier lancement de match.
- Plus de plafond de documents (il n'existe que sous claude.ai). La carte « Archiver les vieux matchs » est masquée par `kbsite.js` ; le code de `confirmArchiveOldMatches` reste.

## Sauvegarde d'un match, `save()`

Un match perdu ne se rejoue pas. `save()` est appelée à chaque changement d'état et fait :

1. `S.updatedAt = Date.now()`, copie profonde de `S`.
2. Copie de secours immédiate dans `localStorage`, clé `kinball_backup_<idMatch>`, valeur `{savedToServer:false, at, match}`.
3. Une file d'écriture (`saveChain`) : une seule écriture à la fois ; elle renvoie toujours l'état courant du même match, jamais un instantané périmé.
4. En cas d'échec : badge de synchronisation en erreur et réessais à 2, 5, 12, 30 puis 60 s (`RETRY_DELAYS`), plus un réessai immédiat au retour du réseau et par « RÉESSAYER MAINTENANT ».
5. Succès : la copie de secours est retirée (`markLocalBackupSynced`).
6. `beforeunload` demande confirmation tant qu'une écriture reste en attente (`hasUnsavedWork`).

`save()` ne fait rien pendant la consultation d'une archive (`viewingArchive`) ni sans match courant. Un match est écrit dès son lancement, avant la première action : « ne pas l'enregistrer » veut dire le retirer (corbeille).

**Récupération au démarrage** (`checkLocalBackups`, accueil) : une copie de secours est proposée (« Un match n'avait pas été sauvegardé ») si elle est absente de la base avec au moins une action, ou plus récente et au moins aussi fournie que la version enregistrée. Règles ajoutées par `kbsite.js` : rien ne se décide tant que les matchs de chaque auteur n'ont pas livré leur premier instantané (`KBSite.baseIncomplete`) ; une copie plus ancienne que la corbeille est ignorée (`copieObsolete`) ; « Récupérer » refuse d'écraser une version plus récente (`copieRefusee`). Tout est en `try/catch` : l'app ne dépend jamais de `localStorage`.

## Corbeille

« Supprimer » un match écrit `deleted:true`, `deletedAt`, `deletedBy` (`dbTrashMatch`) ; le match sort de l'historique et des statistiques et se récupère dans l'écran Données (`dbRestoreMatch`). Seul « Effacer pour de bon » (`doPurgeMatch`) supprime, avec confirmation. Une équipe, elle, se supprime vraiment (`dbDeleteTeam`).

**Jeter un match** (`discardMatch`, depuis TERMINER) coupe d'abord tout ce qui pourrait le réécrire (réessai, copie de secours, `S` remis à neuf, attente de l'écriture en vol), puis l'écrit avec `deleted:true`. Une touche « REMETTRE LE MATCH » le rétablit sur-le-champ. L'ordre compte : sans cette séquence, un match jeté hors réseau réapparaîtrait au retour de la connexion.

## Sauvegarde complète et import

`exportFullBackup()` écrit `kinball_sauvegarde_<date>.json` : `{format:'kinball_backup', version:2, exportedAt, teams, matches (corbeille comprise), identity, site, counts}`. `KBSite.sauvegardeV2` ajoute la version, l'identité, la version du site et les décomptes. Le fichier est remis par la feuille de partage du système sur appareil tactile, sinon par un lien de téléchargement, avec une feuille « FICHIER PRÊT » si le geste a expiré.

`handleImportFile` accepte un objet qui a une liste `teams` ou `matches`, **ou l'état d'un seul match** (`id` + `history`, ce que l'export « JSON — Tout le match » écrit) : il est alors traité comme `{matches:[ce match]}` (C25 · R3 ; le contenu de l'export n'a pas changé, les fichiers déjà exportés restent valables). Par `KBSite.importDebut`, l'import n'écrase jamais : un enregistrement n'est écrit que s'il est plus récent (`updatedAt`) que celui de l'appareil, et le match en cours de saisie est toujours ignoré. Si la base lue est vide et que le fichier porte une identité valide, l'identité du fichier est reprise. À la fin, un compte rendu signale les enregistrements ignorés et un fichier dont les décomptes ne concordent pas.

**Validation à l'import (C25 · R4, R5).** Avant toute écriture, `raisonEquipe` et `raisonMatch` examinent chaque enregistrement. Un enregistrement mal formé est écarté, compté par raison, et n'entre jamais en base ; le compte rendu ajoute « N importés, M écartés (raisons) » à la phrase d'avant (qui ne change pas pour un fichier sans écart). Contrôles :
- équipe : `id` au motif `RE_ID_SUR` (`[A-Za-z0-9_-]{1,80}`), `name` texte, `players` liste d'objets `{id (même motif), name}`, `updatedAt` nombre s'il est présent ;
- match : `id` au même motif, `status` `in_progress` ou `completed`, `history` liste d'objets portant un `type` texte (`details` objet s'il est présent), `names` et `scores` complets pour les équipes en jeu (texte, nombres), `activeTeams` valide ; si présents : `periodWins`, `teamIds` (identifiants ou null), `authorId` (motif ou null), `rosters`, `lineups`, `startingLineups`, `matchName`, `createdAt`, `updatedAt`.
Les champs récents restent facultatifs (pas de migration) : un ancien match qui ne les a pas est importé comme avant. Un fichier dont `teams` ou `matches` n'est pas une liste, ou qui n'est pas un objet, est refusé en bloc (« Fichier invalide »).

**Texte et identifiants dans le HTML (C25 · R5).** Tout identifiant placé dans un `onclick` construit par concaténation passe par `jsArg()` (tout caractère hors `[A-Za-z0-9_-]` devient `\uXXXX` : sûr dans l'attribut et dans la chaîne JavaScript, et le gestionnaire reçoit l'identifiant d'origine) ; un identifiant dans un attribut `value` passe par `escapeHtml`. `statTable` échappe les en-têtes de colonne (qui portent des noms d'équipe) et toute valeur texte d'une cellule sans `fmt`. Le message éclair ATTRAPÉ / ÉCHAPPÉ échappe le nom d'équipe. La clé d'adversaire `libre:<nom>` de la fiche d'équipe passe aussi par `jsArg`. **Pas de politique de sécurité du contenu (CSP)** : `script-src 'self'` exigerait de retirer les 129 `onclick` en ligne ; à défaut, `connect-src 'self' <adresse de collecte>` empêcherait au moins l'envoi des données ailleurs, mais le service worker, SheetJS (dépôt local) et les polices embarquées demanderaient d'être listés (`worker-src`, `font-src`, `img-src data:`) ; à traiter comme un chantier à part.

**Match importé sans auteur (C25 · R22).** Un match sans `authorId` reste visible, récupérable et réimportable, mais la collecte ne l'envoie jamais (`reconcilier` et `envoyerVersion` de `kbcollect.js`) : il n'est pas « le mien ».

**Limites connues** (revue de code du 2026-10-09, détail et suites dans le registre) :
- si IndexedDB s'ouvre mais que sa lecture échoue, la copie de secours n'est jamais proposée ; si la connexion à IndexedDB meurt en cours de match (Safari iOS après une longue veille), aucun réessai ne peut réussir avant le rechargement de la page ;
- un match terminé accepte encore des actions si l'on referme la feuille « Et maintenant ? » ; regarder la heat map d'un match terminé le réécrit (`updatedAt` change) ;
- un match lancé puis quitté avant la première action reste « en cours » et compte comme match joué ;
- dans un onglet Safari non installé, WebKit peut effacer le stockage d'un site inactif depuis 7 jours.
