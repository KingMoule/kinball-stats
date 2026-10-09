# Revue de code indépendante — Kin-Ball Stats

Dépôt relu : `kinball-stats` (branche `main`, version du site `2026-10-05.1`), en lecture seule.
Date de la revue : 9 octobre 2026.
Scripts de preuve : dans ce même dossier (`preuve1.mjs` à `preuve11-match-vide.mjs`). Ils réutilisent la bibliothèque du banc (`tests/lib.mjs`) sans rien écrire dans le dépôt. Pour les relancer : `NODE_PATH=/home/claude/.npm-global/lib/node_modules node <script>`.

---

## Résumé

**État général : bon, avec des trous sur les chemins d'exception.** Le chemin normal d'un match est solide : chaque action est enregistrée aussitôt dans IndexedDB, avec une copie de secours dans le stockage local du navigateur, des réessais, une corbeille au lieu de vraies suppressions, et une mise à jour du site qui ne s'active jamais pendant un match. Les règles de pointage passent par un seul chemin de code, qui applique correctement les règles confirmées. La collecte facultative retire bien les noms de joueurs, côté appareil comme côté serveur. Je n'ai trouvé aucun défaut qui perde ou corrompe un match dans un usage normal. Je n'en classe donc aucun « bloquant ».

Les faiblesses sont ailleurs :
- **les pannes de stockage**, que le banc n'exerce pas : une lecture ratée ou une connexion perdue (connue sur iOS) ;
- **ce qui entre par un fichier importé**, qui n'est validé d'aucune façon ;
- **quelques gestes qui modifient un match sans le dire** : l'annulation après une fin de période manuelle, la saisie dans un match terminé ;
- **les exports**, pensés pour un match isolé mais mal adaptés à l'analyse de plusieurs matchs.

**Les cinq constats les plus graves :**
1. **R1** — Si IndexedDB s'ouvre mais que la lecture des matchs échoue, la copie de secours n'est jamais proposée, et « Récupérer » est refusé indéfiniment. C'est pourtant exactement le cas pour lequel cette copie existe. (Confirmé par simulation.)
2. **R2** — Si la connexion à IndexedDB meurt en plein match (bogue connu de Safari iOS après une mise en veille), l'app ne la rouvre jamais. Tous les réessais échouent jusqu'au rechargement de la page, alors que le badge annonce un réessai automatique. (Confirmé par simulation.)
3. **R3** — L'export « JSON — sauvegarde complète. Tout le match, réimportable » n'est **pas** réimportable : l'import le refuse comme « fichier invalide ». (Confirmé.)
4. **R5** — Un fichier de sauvegarde piégé fait exécuter du code dans l'app, à chaque ouverture de l'accueil. Ce code pourrait lire toutes les données et les envoyer ailleurs. Un nom d'équipe contenant du HTML est aussi interprété dans le message « ATTRAPÉ / ÉCHAPPÉ ». (Confirmé.)
5. **R6** — Après une fin de période déclenchée à la main (bouton FIN PÉRIODE ou TERMINER → vainqueur), un seul appui sur ↶ annule la fin de période **et efface en silence la dernière action de la période précédente**. (Confirmé.)

---

## Constats, du plus grave au moins grave

### R1 — Copie de secours jamais proposée quand la lecture du stockage échoue
- **Gravité** : important
- **Où** : `kbsite.js` l. 716-725 (`KBSite.baseIncomplete`), `index.html` l. 1733 (`checkLocalBackups`) et l. 1409-1414 (`subscribeOwnerMatches`, dont l'erreur est seulement écrite en console).
- **Ce qui se passe pour l'utilisateur** : l'app démarre vide (aucun match, aucune reprise possible). La copie du match conservée dans le navigateur existe bien, mais le bandeau « Un match n'avait pas été sauvegardé » n'apparaît jamais. Si on appelle la récupération quand même, l'app répond « Le stockage de cet appareil est encore en cours de lecture. Réessayez dans un instant. », et ce message ne change jamais.
- **Scénario** : IndexedDB s'ouvre, puis la lecture des matchs échoue (base abîmée, bogue de WebKit). L'abonnement aux matchs ne livre jamais de premier instantané, donc `baseIncomplete()` reste vrai pour toujours. Or `checkLocalBackups` et `copieRefusee` attendent toutes deux que cette valeur devienne fausse.
- **Statut** : confirmé par simulation (`preuve9-lecture-echouee.mjs`). La lecture `getAll` est rendue défaillante, et une copie de secours est déposée au préalable. Résultat : en lecture normale, `{"bandeau":true}` ; en lecture en panne, `{"bandeau":false,"baseIncomplete":true}`, puis le refus de « Récupérer ». Je n'ai pas vu la panne de lecture se produire sur un vrai iPad : c'est pour cela que la cause réelle reste à observer.
- **Piste** : quand l'abonnement aux matchs tombe en erreur, considérer la base comme lue (« incomplète mais définitive ») et proposer la copie avec un avertissement. Au minimum, afficher un message clair plutôt qu'un « réessayez » qui ne mènera nulle part.

### R2 — Une connexion IndexedDB morte n'est jamais rouverte
- **Gravité** : important
- **Où** : `kblocal.js` l. 97-131 (`openDb` garde la même promesse de connexion) et l. 246-270 (`writeDoc` échoue sans oublier cette connexion).
- **Ce qui se passe pour l'utilisateur** : en plein match, le badge passe à « Non enregistré — touchez pour en savoir plus ». La feuille d'explication dit : « sera réessayé automatiquement ». Mais aucun réessai ne peut réussir, ni le bouton RÉESSAYER MAINTENANT, jusqu'à ce que l'app soit fermée puis rouverte. Pendant ce temps, le match n'existe qu'en mémoire et dans la copie du stockage local. Si celle-ci échoue aussi (quota plein), un arrêt brutal de l'app fait perdre les actions saisies depuis la panne.
- **Scénario** : bogue connu de Safari iOS (« Connection to Indexed Database server lost ») après une longue mise en veille. La connexion devient inutilisable sans que l'événement `close` soit forcément envoyé.
- **Statut** : mécanisme confirmé par simulation (`preuve10-connexion-perdue.mjs`). La connexion est fermée sans prévenir la façade. Résultat : 3 actions en mémoire, 2 dans IndexedDB, badge en erreur après RÉESSAYER. Le déclenchement sur un vrai iPad reste **plausible** : il faudrait reproduire une longue veille sur iOS.
- **Piste** : dans `writeDoc` (et `readDoc`, `metaTx`), quand l'erreur est `InvalidStateError` ou `UnknownError`, oublier `dbOpenPromise` et rouvrir une fois avant d'échouer. Dans la feuille d'explication, proposer de recharger l'app si les réessais échouent.

### R3 — L'export JSON d'un match, annoncé « réimportable », ne l'est pas
- **Gravité** : important
- **Où** : `index.html` l. 5420-5421 (texte du menu), l. 5433-5439 (`exportJSON` écrit l'état du match seul), l. 6028-6031 (`handleImportFile` exige une liste `teams` ou `matches`).
- **Ce qui se passe pour l'utilisateur** : il exporte un match en « JSON — sauvegarde complète. Tout le match, réimportable » et croit avoir une copie de secours. À l'import, il obtient : « Fichier invalide : ce n'est pas une sauvegarde Kin-Ball reconnue. »
- **Scénario** : Stats → EXPORTER → JSON, puis Données → IMPORTER UN FICHIER avec ce fichier. C'est aussi ce que propose la feuille de synchronisation en cas de panne (« EXPORTER CE MATCH »).
- **Statut** : confirmé (`preuve1.mjs`, cas 1).
- **Piste** : faire accepter par l'import un objet qui a l'allure d'un match (`id` + `history`), en le traitant comme `{matches:[ce match]}` et avec les mêmes garde-fous (pas d'écrasement d'une version plus récente). Ou bien emballer l'export d'un match dans la forme `{format:'kinball_backup', matches:[…]}`.

### R4 — Un fichier importé n'est pas validé : un seul enregistrement mal formé casse l'Historique
- **Gravité** : important
- **Où** : `index.html` l. 6018-6055 (`handleImportFile` écrit tout objet qui a un `id`) ; plantage à l. 5581 (`r.m.names[t]`), du même type à l. 5460 (`t.players.length`) et dans les exports (`S.periodWins.Bleu`, l. 5163).
- **Ce qui se passe pour l'utilisateur** : après l'import d'un fichier venant d'une autre version, retouché à la main ou abîmé, l'écran Historique reste vide (erreur JavaScript), alors que l'import a affiché « Import terminé : … 1 match(s) ajouté(s) ». C'est depuis cet écran qu'on met un match à la corbeille : l'enregistrement fautif ne peut plus être retiré par l'interface.
- **Scénario** : un fichier contenant `{"id":"x","status":"completed","history":[]}` (sans `names`). Une équipe sans `players` casserait de la même façon « Mes équipes ». Un match `in_progress` dont `history` n'est pas une liste peut devenir « le match à reprendre », et chaque action y planterait.
- **Statut** : confirmé pour l'Historique (`preuve3-import-invalide.mjs` : `TypeError: Cannot read properties of undefined (reading 'Bleu')`). Les autres cas sont tirés de la lecture du code.
- **Piste** : un contrôle de forme minimal à l'import (types de `id`, `names`, `scores`, `history`, `players`, identifiants limités à `[A-Za-z0-9_-]`) qui ignore et compte les enregistrements non conformes. Et des écrans de liste qui sautent une ligne fautive au lieu de tout abandonner.

### R5 — Injection de code par un fichier importé ou par un nom d'équipe
- **Gravité** : important (sécurité)
- **Où** :
  - identifiants insérés sans échappement dans du HTML : `index.html` l. 1965 (`<option value="${t.id}">`), l. 2059, 2222, 2423, 2428, 2764, 2977 (identifiants de joueurs dans des `onclick`), l. 1754, 5466, 5468, 5586, 5603, 5636, 5928, 5930 (identifiants d'équipe ou de match) ;
  - nom d'équipe non échappé : l. 3080 (`flashMessage` du résultat d'un lancer) ;
  - aucune politique de sécurité du contenu (CSP) dans `index.html`.
- **Ce qui se passe pour l'utilisateur** :
  - **Fichier piégé.** Un entraîneur importe un fichier « sauvegarde » reçu d'un tiers. Le code qu'il contient s'exécute à chaque affichage de l'accueil, donc à chaque ouverture de l'app. Il peut lire toutes les équipes, les noms des joueurs et les matchs, puis les envoyer n'importe où.
  - **Nom d'équipe.** Un nom saisi ou importé qui contient du HTML (par exemple `<b`) casse l'affichage du message éclair, ou exécute du code.
- **Scénario et statut** : confirmé (`preuve2-xss.mjs`) dans trois cas :
  - A — nom d'équipe libre piégé : code exécuté dès le premier ATTRAPÉ ;
  - B — joueur importé dont l'identifiant est piégé : code exécuté à l'ouverture de « Nouveau match » ;
  - C — équipe importée dont l'identifiant est piégé : code exécuté sur l'accueil, et de nouveau sur « Mes équipes ».
- **Piste** : passer `escapeHtml()` sur tout identifiant inséré dans un attribut, ou mieux, poser les identifiants en `data-id` et lire `this.dataset.id` dans les gestionnaires. Refuser à l'import les identifiants hors `[A-Za-z0-9_-]`. Échapper le nom à la l. 3080. Ajouter une CSP (`script-src 'self'` exigerait de retirer les `onclick` en ligne ; à défaut, `connect-src 'self' <adresse de collecte>`, qui empêche au moins d'envoyer les données ailleurs).

### R6 — ↶ après une fin de période manuelle efface aussi l'action précédente
- **Gravité** : important (pointage faux, perte silencieuse d'une action)
- **Où** : `index.html` l. 3256-3278 (`endPeriodByLeader`, `endPeriodManually` → `finishPeriod`), l. 3127-3149 (la fin de période n'est pas un événement de l'historique), l. 3284-3293 (`undo` retire le dernier événement).
- **Ce qui se passe pour l'utilisateur** : en format libre (ou par TERMINER → « qui la remporte ? »), il termine la période, voit que c'était une erreur et appuie sur ↶. La période revient bien, mais **la dernière action de la période est aussi effacée**, et le pointage recule d'un cran. Rien ne le signale.
- **Scénario** (format libre) : faute (Gris 1, Noir 1), faute (Gris 2, Noir 2), FIN PÉRIODE → Gris, puis ↶ → période 1, Gris 1, Noir 1, une seule action.
- **Statut** : confirmé (`preuve1.mjs`, cas 3). Ce même manque explique qu'une période gagnée « à la main » ne laisse aucune trace dans l'historique ni dans l'export des actions. Seul le compteur `periodWins` la retient.
- **Piste** : faire de la fin de période manuelle un événement (`type:'fin_periode'`, avec `before` et `details:{winner}`), annulable comme les autres. Cela respecterait aussi l'invariant « rien n'est accordé sans événement ».

### R7 — Un match TERMINÉ accepte encore des actions
- **Gravité** : important
- **Où** : `index.html` l. 2255-2267 (`finishMatchNow` : feuille « Et maintenant ? » refermable d'un appui à côté), l. 2864-2871 (le terrain ne vérifie pas `S.status`).
- **Ce qui se passe pour l'utilisateur** : la confirmation annonce « Vous ne pourrez plus y ajouter d'action ». Pourtant, un appui à côté de la feuille ramène sur le terrain d'un match terminé, où les fautes, les lancers et ↶ fonctionnent toujours et sont enregistrés dans le match terminé. La collecte, si elle est active, renverra alors une nouvelle version.
- **Scénario** : TERMINER → TERMINER LE MATCH → TERMINER → appui sur le fond assombri → appui sur le terrain → EXTÉRIEUR.
- **Statut** : confirmé (`preuve1.mjs`, cas 2 : `status:"completed"`, 2 actions au lieu d'une, aussi en base).
- **Piste** : refuser tout geste de saisie et ↶ quand `S.status !== 'in_progress'`, et rendre la feuille « Et maintenant ? » non refermable.

### R8 — L'identité d'un joueur dépend de son nom dans l'éditeur d'équipe
- **Gravité** : important (statistiques individuelles fausses)
- **Où** : `index.html` l. 5505-5511 (`saveTeamEditor` retrouve l'identifiant d'un joueur par son NOM).
- **Ce qui se passe pour l'utilisateur** :
  - **Deux homonymes** (« Alex » et « Alex ») reçoivent le **même identifiant** dès que l'équipe est rouverte et enregistrée. Leurs statistiques se mélangent, on ne peut plus en mettre un seul dans l'alignement, et les changements de joueur deviennent incohérents.
  - **Corriger une faute de frappe** (« Julie » → « Julie B. ») crée un nouveau joueur. Son historique cumulé est coupé en deux, et le pré-remplissage de l'alignement (« partants du dernier match ») l'oublie.
- **Statut** : confirmé (`preuve6-equipes.mjs`).
- **Piste** : garder l'identifiant attaché à la LIGNE de l'éditeur (par exemple `data-pid` sur la ligne), et non au texte.

### R9 — « SUPPRIMER » une équipe : un seul appui, aucune confirmation, effacement réel
- **Gravité** : important
- **Où** : `index.html` l. 1033 (bouton), l. 5520-5525 (`deleteTeamEditor`), l. 1533-1537 (`dbDeleteTeam` : vraie suppression, pas de corbeille).
- **Ce qui se passe pour l'utilisateur** : le bouton rouge SUPPRIMER, à côté d'ENREGISTRER, efface l'équipe et tout son alignement à l'instant, sans aucune question. On ne peut la retrouver que dans un fichier de sauvegarde, s'il existe. Les matchs passés gardent les noms, mais la fiche cumulée de l'équipe affiche « ? ».
- **Statut** : confirmé (`preuve6-equipes.mjs` : 0 équipe restante, aucune feuille ouverte).
- **Piste** : la même protection que pour les matchs, c'est-à-dire une confirmation armée et une suppression logique (`deleted:true`, avec récupération possible).

### R10 — Export des actions : deux équipes de même nom s'écrasent, et l'en-tête n'est pas protégé
- **Gravité** : important (données d'analyse fausses)
- **Où** : `index.html` l. 5223-5225 et 5265-5266 (colonnes nommées « Score <nom d'équipe> avant », « Sur le terrain — <nom> »), l. 5428-5431 (`toCSV` : l'en-tête n'est pas passé par `csvEscape`).
- **Ce qui se passe pour l'utilisateur** :
  - **Homonymes.** Deux équipes de même nom (deux noms libres identiques, ou la même équipe enregistrée choisie deux fois, ce que rien n'empêche, voir R20) : les colonnes portent le même nom, et la valeur de la seconde équipe écrase celle de la première. Dans la preuve, le score de Bleu disparaît. Les colonnes « Équipe en possession », « Équipe attaquante » et « Équipe ciblée » ne permettent plus de savoir de quelle équipe il s'agit.
  - **Point-virgule.** Un nom d'équipe contenant `;` ou `"` décale toutes les colonnes de l'en-tête par rapport aux données.
- **Statut** : confirmé (`preuve8-exports.mjs` : colonnes en double `Score Laval avant`, `Sur le terrain — Laval` ; ligne 2 « 0;0;1 » au lieu de « 1;0;1 » ; en-tête coupé par le `;`). Le fichier produit est `sortie-actions.csv`.
- **Piste** : nommer les colonnes par emplacement (« Score Bleu avant », avec le nom de l'équipe dans une colonne à part) ou dédoublonner les noms. Échapper l'en-tête comme les données. Refuser deux fois la même équipe au lancement.

### R11 — Exports peu adaptés à l'analyse de plusieurs matchs
- **Gravité** : important pour l'usage visé (analyse), mineur pour chaque point pris seul
- **Où** : `index.html` l. 5150-5166 (`matchInfoRows`), l. 5218-5270 (`buildActionRows`), l. 5250 (`faultLabel` dans l'export), l. 5254-5257 (`r3`), l. 5424-5427 (`csvEscape`), l. 2899-2906 (`snapshotBefore`, sans heure).
- **Ce qui se passe pour l'utilisateur** :
  - **Pas d'identifiant ni de date de match** dans le CSV des actions, ni dans la feuille « Match » du XLSX (seulement le nom saisi). Une fois plusieurs fichiers mis bout à bout, on ne sait plus à quel match appartient une ligne.
  - **Aucun événement n'a d'heure**, donc aucune analyse de rythme ou de durée n'est possible. Comme le dit le code lui-même à propos de l'auteur, « c'est le genre d'information qui ne s'invente pas après coup ».
  - **Les noms de colonnes changent d'un match à l'autre** (ils contiennent les noms des équipes), et leur nombre change entre 2 et 3 équipes. Les fichiers ne s'empilent pas sans retouche.
  - **« Type de faute » exporte le libellé affiché** (« EXTÉRIEUR »), pas le code stable (`EXT`). Si un libellé change dans un chantier futur, les fichiers anciens et nouveaux ne concordent plus.
  - **Séparateur de liste `;` mais décimales avec un point** (`0.123`). Dans un Excel réglé en français, les coordonnées et les pourcentages risquent d'être lus comme du texte.
  - **Formules dans le CSV.** Un nom qui commence par `=`, `+`, `-` ou `@` est interprété comme une formule par Excel à l'ouverture du CSV. Le XLSX, lui, est sûr : SheetJS range ces textes comme du texte, ce qui est vérifié dans la preuve.
  - **Retour chariot.** Un `\r` dans une valeur n'est pas mis entre guillemets.
- **Statut** : contenu des fichiers confirmé (`preuve8-exports.mjs`). Le comportement d'Excel (décimales, formules) est **plausible**, non vérifié faute d'Excel.
- **Piste** :
  - ajouter les colonnes `match_id`, `date_match` (ISO, avec fuseau) et le code de faute à côté du libellé ;
  - proposer un export « tous les matchs » au format long, avec des noms de colonnes fixes ;
  - horodater les nouveaux événements (`at`, avec une valeur par défaut nulle pour les anciens) ;
  - préfixer d'une apostrophe les textes qui commencent par `= + - @` dans le CSV ;
  - écrire les décimales avec une virgule, ou utiliser la virgule comme séparateur et le point comme décimale.

### R12 — Utilisation dans Safari sans installation, ou en navigation privée : effacement possible
- **Gravité** : important (perte de données) — **plausible**, cela dépend de Safari
- **Où** : `kbsite.js` l. 285-318 (la carte « Installer l'app » se ferme pour toujours) et l. 57-66 (l'état « protégé : non » n'apparaît que dans l'écran Données).
- **Ce qui se passe pour l'utilisateur** : dans un onglet Safari, sans installation sur l'écran d'accueil, WebKit efface le stockage d'un site non visité pendant 7 jours. En navigation privée, tout disparaît à la fermeture de l'onglet. La seule mise en garde est une carte de l'accueil, que « Fermer » fait disparaître définitivement. Le rappel de sauvegarde ne se déclenche qu'après 14 jours ou 3 matchs terminés.
- **Statut** : plausible (règle documentée de WebKit, non reproduite ici).
- **Piste** : quand l'app n'est pas installée et que le stockage n'est pas persistant, afficher un rappel permanent et discret pendant la saisie et à la fin de chaque match, avec SAUVEGARDER MAINTENANT. Ne jamais masquer cet avertissement pour toujours.

### R13 — Maintenabilité : ce qui coûte le plus cher à chaque nouveau chantier
- **Gravité** : important (pour la maintenance)
- **Constats** :
  - **Un seul fichier de 335 Ko** (environ 90 000 à 100 000 jetons) : environ 850 lignes de CSS, environ 120 lignes de HTML et environ 4 900 lignes de JavaScript dans un seul `<script>`. On y compte 114 variables globales de premier niveau et 129 gestionnaires `onclick` écrits sous forme de chaînes. Un agent ne peut pas le charger en entier. Il travaille par `grep` et voit rarement tous les effets d'un changement : un renommage de fonction casse silencieusement les `onclick` en chaîne et les sélecteurs de `kbsite.js`.
  - **Des commentaires périmés qui induisent en erreur.** Par exemple, l. 1290-1305 : « ils sont stockés sur les serveurs de Claude ». L. 1338-1356 décrit les règles de cloisonnement d'un serveur qui n'existe plus ; l. 1612-1631, le « wifi du gymnase ». Un agent raisonne à partir de ces commentaires.
  - **Du code mort en mode local**, toujours chargé et toujours à comprendre : migration des matchs « à plat » (l. 1560-1589), cloisonnement par auteur, résolution des profils, `CAN_EDIT_TEAMS`, archivage « 5 000 documents » (l. 5895-5995, masqué par `kbsite.js` en retouchant le DOM), réessais réseau.
  - **Des couplages cachés.** `kbsite.js` lit les globales de l'app (`S`, `MATCHES_DB`, `DELETED_MATCHES`, `DB`, `unsubOwnerItems`, `matchesByOwner`, `hasUnsavedWork`, `markLocalBackupSynced`, `openSheet`…). Il repère des boutons par le texte de leur `onclick` (`[onclick^="startMatch("]`, `[onclick="openBackup()"]`) et réécrit des textes de l'app par expression régulière (« en ligne », « archiver », `kbsite.js` l. 77-88). Aucune erreur ne signale une rupture.
  - **Des invariants affichés mais non tenus.** Il y a de l'état d'interface dans `S` (`sheetDismissable`, `heatTeam`, `heatMode`, `heatSituation`, `heatView`, voir R16). Des périodes sont attribuées sans événement (R6).
  - **Des calculs en double.** Les mêmes indicateurs sont calculés pour un match (`computeOverall`, `computeFaults`) et pour une équipe (`computeTeamAggregate`), dans deux codes parallèles qui peuvent diverger. Les menus en feuille et en couche radiale dupliquent aussi la présentation.
  - **Un outillage de resynchronisation devenu secondaire.** `MIGRATION.md` dit que « le dépôt est la source », mais `amont/`, les 30 marqueurs `MIGRATION` et `resync.mjs` restent à porter, et `check-release` en dépend.
- **Ce qu'un découpage apporterait réellement** :
  - sortir le **moteur de règles** (`awardFaultPoints`, `checkPeriodState`, `finishPeriod`, `undo`, le passage d'un état et d'un geste à un nouvel état) dans un fichier pur, testable sous Node en quelques secondes au lieu du banc Playwright de 20 minutes ;
  - sortir les **exports** dans un module pur, avec des tests d'or (« ce match donne exactement ce CSV ») ;
  - sortir le **CSS** dans sa propre feuille : environ 25 % du contenu en moins à charger pour un chantier de logique.
- **Ce qu'il n'apporterait pas** : couper le JS en plusieurs `<script>` qui partagent toujours les mêmes globales ne réduit aucun couplage, ajoute des chemins de précache et des risques d'ordre de chargement. Le gain vient de modules purs avec une interface étroite, pas du nombre de fichiers.
- **Piste** : d'abord supprimer le code mort et les commentaires périmés (gain immédiat pour les agents, sans risque fonctionnel si le banc passe). Ensuite extraire le moteur de règles et les exports en modules purs.

### R14 — Fin de période sur un ballon ÉCHAPPÉ : message « PÉRIODE TERMINÉE » jamais visible ; feuille avancée refermée d'office
- **Gravité** : mineur
- **Où** : `index.html` l. 3060-3081 (`applyResult` ferme la feuille de fin de période puis affiche le message éclair), l. 3083-3089 (`flashMessage`), l. 3136-3148 (la minuterie de 1,4 s ferme toute feuille ouverte).
- **Ce qui se passe** : quand la période est gagnée sur un ballon échappé (cas fréquent), on voit « GRIS • ÉCHAPPÉ », puis rien, puis le pointage revient à zéro. Le message « PÉRIODE 1 TERMINÉE — X GAGNE » n'apparaît jamais. En mode avancé, la feuille « DÉTAILS AVANCÉS » ouverte à 550 ms est refermée par la minuterie à 1,4 s, en pleine saisie.
- **Statut** : confirmé à vitesse réelle (`preuve7-fin-periode.mjs`).
- **Piste** : afficher le message de fin de période après le message éclair, et ne pas fermer une feuille ouverte par quelqu'un d'autre.

### R15 — Matchs « fantômes » : un match lancé puis quitté avant la première action reste EN COURS pour toujours
- **Gravité** : mineur
- **Où** : `index.html` l. 2321 (enregistrement dès le lancement), l. 2112-2124 (`goHome` ne demande rien sans action), l. 5732 (`matchesPlayed` compte tous les matchs).
- **Ce qui se passe** : chaque faux départ ajoute à l'Historique une ligne « EN COURS · 0 action », impossible à reprendre, et compte comme un match joué dans le Classement et la fiche d'équipe.
- **Statut** : confirmé (`preuve11-match-vide.mjs` : 3 matchs à 0 action, « Matchs joués » = 3).
- **Piste** : ne pas compter les matchs sans action, et les retirer d'eux-mêmes (corbeille) au retour à l'accueil.

### R16 — De l'état d'interface dans le match : regarder la heat map réécrit un match terminé
- **Gravité** : mineur
- **Où** : `index.html` l. 1268-1273 (`heat*`, `sheetDismissable` dans `freshState`), l. 2627, l. 4941-4947 (`setHeat*` appellent `save()`).
- **Ce qui se passe** : changer la vue de la heat map d'un match qu'on vient de terminer l'enregistre de nouveau. La date affichée dans l'Historique (qui est la date de dernière modification) devient l'heure de consultation, la comparaison de l'import (« plus récent ») est faussée, et la collecte verra une « nouvelle version » à renvoyer.
- **Statut** : confirmé (`preuve11-match-vide.mjs` : `updatedAt` et `heatView` changés en base sur un match `completed`).
- **Piste** : sortir ces réglages de `S`, dans des variables de module ou en préférence de l'appareil.

### R17 — « Saisi par » et « Stats prises par » exportent un identifiant brut
- **Gravité** : mineur
- **Où** : `index.html` l. 1514-1518 (`plainAuthor` rend l'identifiant si aucun nom n'est connu), l. 5165, 5261. Aucun écran ne permet de saisir son nom (`setName` n'est appelé nulle part).
- **Ce qui se passe** : chaque ligne d'export porte `u_14de5cd4-…`, un identifiant d'appareil illisible et stable, présent dans tous les fichiers partagés.
- **Statut** : confirmé (`sortie-actions.csv`).
- **Piste** : laisser la colonne vide, ou exposer un réglage « Votre nom ».

### R18 — Deux doigts sur le terrain : la saisie mélange les deux contacts
- **Gravité** : mineur — plausible
- **Où** : `index.html` l. 2864-2892 (aucune vérification de `pointerId`, pas de gestion de `pointercancel`).
- **Ce qui se passe** : une paume ou un second doigt posé pendant un glisser remplace le point de départ. Le lancer est alors noté avec de fausses coordonnées, ou devient une « faute » si les deux points sont proches. Une annulation par le système laisse aussi la flèche affichée. Une feuille de choix s'ouvre toujours, donc rien n'est enregistré sans un appui de plus.
- **Statut** : plausible (lecture du code ; à vérifier sur iPad avec deux contacts).
- **Piste** : ignorer tout `pointerdown` pendant un glisser, et terminer le geste seulement sur le `pointerId` de départ.

### R19 — Seul le match en cours le plus récent peut être repris
- **Gravité** : mineur
- **Où** : `index.html` l. 1953-1958 (`findResumableMatch`), l. 5568 (l'Historique ouvre en lecture seule).
- **Ce qui se passe** : si deux matchs sont en cours (un oubli de TERMINER), le plus ancien ne peut plus ni être repris ni être terminé. On peut seulement le consulter.
- **Statut** : confirmé par lecture.
- **Piste** : un bouton « Reprendre » sur les lignes EN COURS de l'Historique.

### R20 — La même équipe peut être choisie pour deux couleurs
- **Gravité** : mineur
- **Où** : `index.html` l. 2269-2302 (`startMatch` ne vérifie pas les doublons).
- **Ce qui se passe** : les statistiques cumulées ne comptent que la première couleur trouvée, l'export s'écrase (R10), et les mêmes joueurs peuvent être « sur le terrain » des deux côtés.
- **Statut** : confirmé par lecture.
- **Piste** : refuser ce choix dans l'écran « Nouveau match ».

### R21 — Courte fenêtre où la copie de secours est retirée trop tôt
- **Gravité** : mineur — plausible
- **Où** : `index.html` l. 1670 et 1682 (`writeLocalBackup` au moment de l'appel, `markLocalBackupSynced` à la fin d'une écriture plus ancienne).
- **Ce qui se passe** : l'écriture N, en se terminant, retire la copie de secours déposée par l'action N+1. Si l'app est tuée avant la fin de l'écriture N+1 (quelques millisecondes), l'action N+1 est perdue.
- **Statut** : plausible (fenêtre très courte, non reproduite).
- **Piste** : ne retirer la copie que si son `updatedAt` est celui qui vient d'être écrit.

### R22 — Un match importé sans auteur est rangé comme le mien (et donc partagé par la collecte)
- **Gravité** : mineur — plausible
- **Où** : `index.html` l. 1542 (`m.authorId || myMatchesOwner()`), `kbcollect.js` l. 277 (seul « mon » espace est envoyé).
- **Ce qui se passe** : un vieux match d'un autre preneur, sans `authorId`, part à la collecte au nom de cet appareil. Cela contredit la page de confidentialité (« les matchs pris par d'autres personnes » ne partent jamais).
- **Statut** : plausible (lecture ; la collecte est coupée tant que `config.js` est vide).
- **Piste** : ranger les matchs importés sans auteur dans un espace « importés » non collecté.

### R23 — Serveur de collecte : quotas épuisables par n'importe qui
- **Gravité** : mineur
- **Où** : `collecte/Logique.gs` l. 217-226 (`decider` : plafonds par `installId`, choisi par l'envoyeur, et plafond global), `collecte/Code.gs` l. 51.
- **Ce qui se passe** : l'adresse est publique. Quelqu'un peut épuiser le plafond quotidien global (2 000 envois, 300 Mo) en inventant des `installId`, et bloquer la collecte légitime ce jour-là, ou remplir le Drive de fichiers inutiles dans cette limite. La validation est par ailleurs rigoureuse : forme, taille, noms de joueurs refusés, ajout seul, aucune injection de formule possible dans la feuille.
- **Statut** : confirmé par lecture.
- **Piste** : acceptable pour un projet de cette taille. À surveiller ; un jeton partagé dans `config.js` relèverait un peu la barre.

### R24 — Tout le dépôt est publié, dont une ancienne copie de l'app sur la même origine
- **Gravité** : mineur
- **Où** : `.github/workflows/pages.yml` (`path: .`).
- **Ce qui se passe** : `tests/`, `collecte/`, `outils/`, `MIGRATION.md` et `amont/kinball.amont.html` sont en ligne. Cette dernière est une copie de l'app, sans la façade locale. Elle partage le stockage local du site : ouverte par erreur, elle peut afficher, voire écarter (« Ignorer »), les copies de secours de la vraie app.
- **Statut** : confirmé par lecture (l'effet de l'ancienne copie n'a pas été essayé).
- **Piste** : publier un dossier construit qui ne contient que les fichiers du précache.

### R25 — SheetJS 0.18.5 : ancien, et chargé à chaque démarrage
- **Gravité** : mineur
- **Où** : `vendor/xlsx.full.min.js` (0.18.5, 2022, 880 Ko), `index.html` l. 1123.
- **Ce qui se passe** : les failles connues de cette version (CVE-2023-30533, CVE-2024-22363) concernent la LECTURE de fichiers. L'app ne fait qu'écrire (`XLSX.write`), donc le risque est faible. En revanche, 880 Ko de JavaScript sont analysés à chaque ouverture de l'app, pour un export occasionnel.
- **Piste** : charger la bibliothèque seulement à l'export. Mettre à jour si la lecture de fichiers Excel est un jour ajoutée.

### R26 — Accessibilité de base
- **Gravité** : mineur
- **Où** : `index.html` l. 5 (`user-scalable=no`), cartes d'équipe, demi-boutons ATTRAPÉ/ÉCHAPPÉ (`.opp-half`), cartes `team-card` et lignes de tableau cliquables écrites en `<div onclick>`. Les feuilles n'ont ni `aria-modal`, ni gestion du focus, ni annonce `aria-live` des messages éclair.
- **Ce qui se passe** : avec VoiceOver ou un clavier, une partie des commandes est inatteignable ou muette. Le zoom est interdit, mais iOS ignore cette interdiction de toute façon. Les cibles tactiles et les contrastes principaux sont corrects (texte blanc gras de grande taille sur les couleurs d'équipe).
- **Piste** : des `<button>` à la place des `<div onclick>`, `role="dialog"` et `aria-live="polite"` sur la feuille, et retrait de `user-scalable=no`.

---

## Ce qui est solide et ne doit pas être touché

- **La façade de stockage `kblocal.js`** : copie profonde figée au moment de l'écriture, une transaction par document, mise à jour du miroir seulement après validation, schéma qui ne fait qu'ajouter, aucune opération destructive, identité créée dans une seule transaction (deux onglets ne peuvent pas créer deux identités). Le seul point à reprendre est R2 (réouverture après une connexion perdue).
- **La file d'écriture de `save()`** : une écriture à la fois, toujours avec l'état COURANT du match ; copie locale avant chaque écriture ; réessais progressifs ; garde contre l'écrasement d'un match plus récent par une copie périmée (M11).
- **Jeter un match** : appui maintenu, récapitulatif, passage par la corbeille, coupure des réessais et de la copie locale avant la mise à la corbeille, « REMETTRE LE MATCH » immédiat.
- **Les règles de pointage** : un seul chemin (`awardFaultPoints` → `checkPeriodState` → `finishPeriod`), sans attribution de points ailleurs. Les règles confirmées (+1 aux deux autres équipes en jeu, élimination de la plus basse au seuil, duel, période au second seuil, total par pas de 2 donc pas d'égalité au plus bas) sont correctement appliquées. L'annulation par instantané `before` est simple et fiable pour les événements de l'historique. Les garde-fous contre le double appui (feuille, couche radiale, réarmement de ↶) sont bien pensés. La reprise d'une fin de période interrompue (F26) est traitée.
- **La mise à jour du site** : cache par version, liste de précache explicite, empreinte globale vérifiée en intégration continue (`check-release.mjs` passe), aucune activation sans accord, jamais pendant un match ni avec une écriture en attente.
- **La collecte** : désactivée par défaut, accord propre à chaque identité, épuration des noms sur l'appareil puis contrôle indépendant sur le serveur, serveur en ajout seul sous verrou, boîte d'envoi persistante, rien pendant un match. La page de confidentialité décrit honnêtement ce qui part, identifiants pseudonymes compris.
- **Le XLSX** : les textes sont rangés comme du texte, jamais comme des formules.
- **Le moteur de simulation embarqué** : identique octet pour octet à `sim/simcore.js` (vérifié), exécuté dans un Worker avec un repli propre. Coût mesuré : 12 à 30 ms pour 1 000 simulations sur ce poste.
- **La performance au fil d'un match** : aucune fuite d'écouteur ni de minuterie (tous les écouteurs sont posés une seule fois). Mesuré avec un processeur ralenti 4 fois : 500 actions, match de 300 Ko, 9 ms de travail synchrone et 60 ms jusqu'à l'enregistrement complet par action. Un match réel (150 à 300 actions) reste loin de toute limite.

---

## Limites de cette revue

- **Pas d'iPad réel.** Le comportement de Safari iOS n'a pas été observé :
  - perte de connexion IndexedDB après une veille (R2), panne de lecture (R1) ;
  - effacement après 7 jours et navigation privée (R12) ;
  - feuille de partage et besoin d'un geste récent ;
  - cycle de vie de l'app installée (fermeture par le système, activation de la nouvelle version au relancement) ;
  - gestes à plusieurs doigts (R18) ;
  - vitesse réelle.

  Les pannes de stockage ont été **simulées** dans Chromium.
- **Pas d'Excel** : l'interprétation des décimales et des formules du CSV (R11) est déduite du contenu du fichier.
- **Le serveur Apps Script n'a pas été déployé** : relu seulement, avec ses tests Node non relancés.
- **Le banc complet (`tests/run.mjs`) n'a pas été exécuté**, comme demandé. Je n'ai lancé que mes scripts ciblés.
- **La bibliothèque SheetJS** n'a pas été relue (version seulement).
- **Le comportement du CDN de GitHub Pages** n'a pas été vérifié : un fichier servi en retard pendant l'installation d'une nouvelle version pourrait mêler deux versions dans le cache. Ce risque reste théorique.
- **Les statistiques avancées** (+/-, situations, phases, heat maps, zones) ont été relues en surface seulement, pas recalculées à la main.
