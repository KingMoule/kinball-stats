# STAT4 : chiffres faux des statistiques (revue 3 : S1, S2, S3, S5, S8)

Suite `tests/scenarios/STAT4.mjs`. Vérifications 1 et 2 sur tablette et téléphone, 3 et 4 sur tablette ; une page par vérification.

1. S1 : duel 11 Gris contre Noir, deux lancers, onglet Zones : tableau rendu, boutons Gris (actif) et Noir seulement, `matchZoneTeam` non réécrit ; rouvrir STATS rend encore l'onglet. Noir choisi, puis un duel qui exclut Noir : Bleu actif.
2. S2 : noms « A&B » et `<b>x</b>`, onglet Vue d'ensemble, tableau « Par période » : libellé long `OFF A&B` (échappé une fois, `title` compris), libellé court `OFF ` suivi d'une pastille `.evo-sw` (aucun balisage en texte), nom à balises affiché en texte.
3. S3 + S8 : 9/11 aléatoire (graine 404) jusqu'à la période 3 avec une élimination, joué en même temps sur `tests/model.mjs` qui compte chaque point accordé. `matchPoints()` = ces points ; XLSX « Équipes » : 17 colonnes, « Score final » à sa place (= `S.scores`), « Points marqués (match) » en dernière colonne ; un événement sans `before` ne compte pas. Détail du % de victoire avec 10 simulations inachevées : « victoires sur n − 10 ».
4. S5 : format libre, dix fautes de Bleu dont quatre perdent leur position : par zone, le % du cumul (`sectionTeamFaults`) = le % du match (`computeFaultZones`), et la mention « 4 faute(s) directe(s) sans position » sous le tableau du cumul.

Contrôle négatif : `KINBALL_HTML=<copie de main avant STAT-4> KINBALL_ONLY=STAT4` : les six vérifications échouent.
