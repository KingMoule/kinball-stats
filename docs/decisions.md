# Décisions de conception qui restent vraies

Une ou deux lignes par décision, avec sa raison. Pas d'historique de chantier : il est dans `docs/archive/`. Avant de remettre l'une d'elles en cause, lire sa raison.

## Règles du jeu et données

| Décision | Raison |
|---|---|
| Une égalité au plus bas pointage à l'élimination est impossible : aucune règle de départage. | Une faute donne 1 point à chacune des deux autres équipes, donc le total d'une période avance par pas de 2 et reste pair ; si la tête atteint le seuil (9 ou 11, impair) et que les deux autres sont à égalité à x, le total vaudrait seuil + 2x, impair. Confirmé par l'utilisateur et par 200 000 simulations. |
| Un match = un seul preneur de stats ; `save()` envoie toujours le match entier. | Besoin inexistant, confirmé par l'utilisateur ; évite tout un chantier de fusion de données. |
| Un match est enregistré dès son lancement, avant la première action. | Choix de l'utilisateur ; « ne pas l'enregistrer » veut donc dire retirer le match (corbeille). |
| Supprimer = `deleted:true` (corbeille récupérable) ; seul « Effacer pour de bon » efface. | L'intégrité des données passe avant le ménage. |
| Aucune fin de match automatique. | Le cahier parle de 4 périodes gagnées, mais l'app n'a jamais codé cette règle ; une fin forcée en direct serait un risque. |
| Pas de migration : tout champ nouveau a une valeur par défaut sûre, tout ancien match reste lisible. | Les matchs enregistrés ne se réécrivent pas ; ce qui se calcule à la lecture (zone, phase) s'applique rétroactivement. |
| `FAULTS` (8 codes) est la valeur stockée et ne change jamais ; l'affichage passe par `faultLabel()`. | Les matchs déjà pris et exportés doivent rester cohérents avec les nouveaux. |
| Aucun état d'interface ni de calcul dans `S` (variables de module, ou `localStorage` pour un réglage d'appareil). | `S` part en base à chaque `save()` ; un réglage d'affichage y déclencherait des écritures et réécrirait des matchs terminés. |
| Une équipe sans alignement joue normalement ; un alignement compte exactement 4 joueurs ou aucun. | Entre les deux c'est presque sûrement un oubli ; mieux vaut bloquer que récolter des stats sur un terrain incomplet. |
| « ? » enregistre l'action sans joueur ; « FAUTE D'ÉQUIPE » est distincte de « ? ». | Mieux vaut une donnée manquante qu'une donnée devinée ; la différence est conservée dans les données. |
| Règles du +/- : seuls les joueurs impliqués bougent (voir `stats-et-export.md`). | Règles définies par l'utilisateur. |
| Mots « ATTRAPÉ » et « ÉCHAPPÉ » en toutes lettres sur les boutons de résultat. | Réponse de l'utilisateur ; sans ambiguïté, sans icône à apprendre. |
| DÉF ILL = un ballon échappé avec `fault_type:'DÉF ILL'`, sans joueur ni coordonnées ; F % reste « fautes directes sur actions offensives ». | Tout ce qui lit un lancer échappé le compte déjà correctement (aucun code de lecture à toucher, ni le moteur) ; les coordonnées n'ont pas de sens avant la frappe. Choix de l'utilisateur. |
| Une reprise de jeu est un événement à part, sans point. | Elle ne doit polluer ni les fautes, ni les actions offensives, ni le +/-. |

## Saisie

| Décision | Raison |
|---|---|
| La saisie en direct passe avant tout : rien ne doit retarder un geste, créer un appui involontaire ou laisser une action hors de l'historique. | Un match perdu ne se rejoue pas. |
| Une feuille qui se ferme avale les appuis (classe `closing`) plutôt que d'être transparente ; en plus, les fonctions de saisie vérifient leur état. | Une feuille transparente enverrait l'appui sur le terrain ou sur la barre du téléphone ; les gardes d'état empêchent tout point sans événement même si la mécanique des feuilles change. |
| Premier appui gagne par un anti-double-appui au même endroit (300 ms, 32 px), pas par un verrou de durée. | Un verrou avalerait aussi l'appui légitime d'un preneur de stats rapide. |
| ↶ du ruban et de la barre est ignoré 400 ms après un appui de feuille ; `undo()` reste sans délai, et les boutons d'annulation placés dans une feuille l'appellent directement. | Le réarmement vise le double appui, pas l'annulation ; posé plus bas il brimerait aussi les fermetures par minuterie. |
| Pendant « DUEL — QUI REPREND LE BALLON ? », un bouton « ↶ Annuler la dernière action » est dans la feuille. | Le ↶ du ruban y est recouvert ; `undo()` sait déjà défaire l'action éliminante. |
| Annuler pendant la fenêtre de fin de période annule le minuteur ET le dernier événement, et le terrain refuse tout geste pendant la fenêtre. La remise à zéro n'est pas avancée. | Refuser ↶ le rendrait muet quand on corrige une erreur ; avancer la remise à zéro changerait l'affichage, l'ordre d'écriture de `applyResult` et le déclencheur des barres. |
| Un point d'entrée unique pour rouvrir ce que le match attend : `reopenMatchSheets()`, appelée par `onEnterScreen('match')`. | C'est le seul passage commun aux quatre chemins d'entrée dans l'écran de match. |
| Le menu radial est une présentation seulement : mêmes fonctions de règles, même `onclick`. Réglage d'appareil `kinball.saisie`, défaut `radiale`, mode `feuille` identique à l'ancien. | Aucune règle du jeu ne change ; le mode `feuille` sert de référence au banc. |
| Menu radial : jamais de menu de joueurs pour une équipe sans alignement ; DÉF ILL se termine sans joueur ; le voile annule la saisie aux étages « résultat » et « faute » et ne fait rien à l'étage des joueurs. | Comportement validé par l'utilisateur sur maquette, au doigt ; à l'étage des joueurs le résultat est déjà choisi, on passe par « ? ». |
| Changements de joueurs : une équipe à la fois, un événement `changement` identique par échange, glisser dans les deux sens, toucher-toucher conservé. | Garde l'annulation action par action et l'export sans code nouveau ; le repli protège si le glisser se comporte mal. Le glisser HTML5 ne marche pas au doigt sur iPad. |
| Garde-fous contre le faux clic : armement différé 500 ms, appui maintenu 1 300 ms, récapitulatif du match. | Une tablette tenue à bout de bras ; valeurs choisies sans essai en gymnase, à ajuster sur retour. |
| L'écran de match n'a pas de barre d'app. | Un bouton de navigation à portée de pouce est une sortie accidentelle en plein point. |

## Statistiques et export

| Décision | Raison |
|---|---|
| Un seul zonage : la grille 3×3, noms de fonctions conservés (`ZONES`, `ZONE_LABEL`, `classifyZone`), coordonnées bornées au classement. Pas de colonne « ancien zonage » dans l'export. | Un seul découpage pour les stats, la heat map, la saisie et l'export ; deux zonages dans un export donneraient deux vérités pour un lancer. Les coordonnées brutes restent exportées. |
| La phase d'une action se lit sur `before` ; filtre de phase pour un match en 9/11 seulement (head-to-head et fautes). | Applique « l'action qui atteint le seuil compte dans la phase qu'elle termine » sans rien stocker ; le cumul mélange des formats. |
| Une nouvelle famille de stats = une entrée de `STAT_SECTIONS` ; tous les tableaux passent par `statTable()`. | Les onglets, leur ordre et leur présence dans les deux écrans en découlent. |
| Le graphique « Par période » est un SVG en ligne, sans bibliothèque ; la forme porte la mesure, la couleur porte l'équipe. | Aucune dépendance de plus ; lisible sans la couleur. |
| Heat map : grille d'efficacité par défaut, échelle divergente autour de la moyenne de l'équipe, couleur jamais seule (pourcentage et comptage dans la case), case hachurée sous 3 lancers. | Un nuage de points dit où l'on a lancé, pas si c'était efficace ; 0 sur 2 en rouge vif serait un mensonge. |
| Fondu du score de l'équipe éliminée à 35 % d'opacité. | Valeur validée par l'utilisateur. |
| L'export « Actions » est en format long (une observation par ligne, colonnes 1 ou 0 pour les réussites) ; l'export brut découvre ses colonnes dynamiquement. | Alimente un tableau croisé sans retouche ; un nouveau champ d'événement apparaît tout seul dans le brut. |

## Probabilité de victoire

| Décision | Raison |
|---|---|
| Un seul point d'accroche (`wpSync()` en fin de `renderScoreboard()`) ; aucune fonction de la saisie n'est modifiée. | Tout changement d'état finit par `renderScoreboard()` ; aucun chemin oublié, et la refonte de la saisie n'a pas touché les déclencheurs. |
| Moteur dans `sim/simcore.js`, collé tel quel dans `index.html`, exécuté dans un Worker par Blob avec repli synchrone qui donne le même résultat. | Un fichier unique interdit un fichier de Worker séparé ; sans repli la fonction pourrait être muette sans que personne le voie. |
| Une réponse n'est appliquée que si son `reqId` est le dernier et si l'état n'a pas changé ; graine fixe par match. | Une barre ne montre jamais le résultat d'un autre état ; refaire une action annulée redonne les mêmes barres. |
| Barres sans chiffre sur le ruban, détail au toucher, mention « estimation non calibrée » dans le détail et l'étiquette d'accessibilité ; coupe-circuit `WP_ENABLED`. | Un pourcentage sans référence ne s'affiche jamais seul. |
| Parts égales sous 9 événements marquants (`WP_MIN_K`) ; en duel, recalcul quand le porteur change. | Mesures de l'audit : l'estimation sature sur 3 à 10 événements ; en duel le porteur pèse lourd. Le 9 est un choix prudent sans référence. |
| Les règles supposées du moteur sont des constantes nommées, jamais présentées comme décidées. | Les simulateurs d'origine sont perdus ; les changer ne coûte qu'une constante. |

## Dépôt, site, stockage

| Décision | Raison |
|---|---|
| Le dépôt GitHub est la source du code ; l'artifact claude.ai n'évolue plus ; `amont/` reste figé. | Choix de l'utilisateur (2026-10-04). |
| Un seul fichier `index.html` (CSS, HTML, JS), un seul script, des fonctions globales ; pas de modules ES ni de scripts multiples. | Les `onclick` en chaîne exigent des fonctions globales ; plusieurs scripts qui partagent les mêmes globales ne réduiraient aucun couplage et ajouteraient des risques d'ordre de chargement. Si un découpage est un jour fait, ce sera en modules purs à interface étroite (moteur de règles, exports). |
| Les données vivent sur l'appareil (IndexedDB), derrière une façade `KBLocal` qui imite les capacités de claude.ai. | L'app n'a presque pas changé : elle appelle `capabilityEntry('db')` comme avant. |
| L'import n'écrase jamais une donnée plus récente de l'appareil. | Une sauvegarde ancienne ne doit pas défaire un match saisi depuis. |
| Une nouvelle version du site ne s'active que sur accord de la personne, jamais pendant un match ni avec une écriture en attente. | Une mise à jour au milieu d'un point perdrait des données. |
| La collecte des matchs est facultative, éteinte par défaut, accord par identité, aucun nom de joueur ne part. | Vie privée ; la page de confidentialité le promet. |
| Tout identifiant venu d'un fichier est limité à `[A-Za-z0-9_-]` à l'import et passe par `jsArg()` dans un `onclick` ; un enregistrement mal formé est écarté et compté, jamais écrit (C25). Pas de CSP pour l'instant. | Les `onclick` en ligne rendent `script-src 'self'` impossible sans chantier à part ; l'échappement et la validation ferment les trois injections connues. |
| L'import accepte l'export JSON d'un seul match tel quel ; l'export n'a pas changé (C25 · R3). | Les fichiers déjà exportés par les utilisateurs restent valables ; c'est le plus petit changement. |
| Un match importé sans auteur reste visible mais la collecte ne l'envoie jamais (C25 · R22). | Il n'est pas « le mien » ; la page de confidentialité promet que les matchs d'autres preneurs ne partent pas. |
| Une équipe supprimée va à la corbeille (`deleted:true`), comme un match ; seul « Effacer pour de bon » supprime (C26 · R9). | Un geste de trop ne doit pas effacer un alignement ; les matchs passés gardent la fiche. |
| Un match terminé refuse toute saisie, ↶ compris (C26 · R7). | La confirmation de fin dit « vous ne pourrez plus y ajouter d'action ». |
| Une fin de période décidée à la main est un événement `fin_periode` annulable seul ; une fin automatique reste portée par l'action qui la provoque (C26 · R6). | ↶ ne doit pas effacer l'action d'avant ; l'invariant « rien n'est accordé sans événement ». |
| Une connexion IndexedDB morte est rouverte une fois et l'opération rejouée ; une lecture en échec n'est jamais prise pour « aucun match » (C27). | Safari iOS perd la connexion après une longue veille ; la copie de secours doit rester proposée. |
| Exports : « ajouts sûrs » (rien d'existant n'est renommé ni déplacé, colonnes ajoutées en fin) et « Excel en français » (décimales à la virgule, `;`) ; heures et dates en UTC ISO 8601 (C28, décision du 2026-10-09). | Les fichiers d'avant restent comparables ; un Excel réglé en français lit les nombres comme des nombres. |
| La version et l'empreinte du site sont tenues par `check-release` ; le déploiement échoue sans elles. | Sans nouvelle version, les appareils ne verraient jamais la mise à jour. |
| L'utilisateur fusionne toujours les PR ; un agent ne fusionne ni ne pousse sur `main`. | Pousser sur `main` met le site en ligne. |

## Méthode

| Décision | Raison |
|---|---|
| Celui qui juge n'est pas celui qui écrit : le codeur lance le banc, un agent d'audit distinct vérifie sans rien modifier avant une livraison. | Un auditeur qui pourrait retoucher un test ou l'app pour faire passer le banc ne prouverait plus rien. |
| Un test de non-régression doit échouer sur le fichier fautif (contrôle négatif). | Un test qui passe sur le défaut ne prouve rien. |
| Les tests visent les `onclick` et les identifiants, jamais les textes de boutons. | Les textes changent ; les appels de fonctions sont stables. |
