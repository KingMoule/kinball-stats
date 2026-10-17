# TERRAIN : tracé du terrain de saisie (D102)

Suite `tests/scenarios/TERRAIN.mjs`. Vérifications 1, 2 et 4 sur tablette et téléphone, 3 sur téléphone ; une page par vérification (deux pour la 3).

1. 9/11, possession Bleu : `#field` sans bordure, padding, transform ni `overflow:hidden`, coins arrondis, fond en dégradé ; le SVG du fond ne contient qu'un liseré (rectangle arrondi centré) et un cercle sans remplissage ; `#gridLayer` couvre `#field` et porte quatre lignes, d'un bord du liseré à l'autre, dont le centre à l'écran, lu par `fieldPoint`, tombe à 1/3 et 2/3 (± 0,004) ; diamètre du cercle entre 60 et 80 % d'une case, centré ; étiquettes vides du duel et du mode avancé en `display:none`. Capture `TERRAIN-<gabarit>.png` dans `KINBALL_SORTIE`.
2. Vrais gestes à 4 px de part et d'autre des lignes dessinées (rectangles des lignes à l'écran, pas `lib._pt`) : deux lancers autour de la première verticale tombent en colonnes 0 et 1 (`zoneIndex(start_norm)`), deux fautes directes autour de la seconde horizontale en rangées 1 et 2 (`position_norm`).
3. Verrou portrait (`uiRotation` ±90°, 844×390) : la grille reste aux tiers du repère de `fieldPoint`.
4. Écrans de stats, deux lancers : heat map en grille, en points, puis schéma de l'onglet Zones : fond en dégradé, aucune ligne pointillée, deux verticales et deux horizontales aux tiers de l'hôte (± 0,006), un cercle central, un liseré ; en grille, neuf cases dont au moins sept transparentes ; en points, autant de `circle.heat-pt` que de lancers. Captures `TERRAIN-heat-<gabarit>.png` et `TERRAIN-zones-<gabarit>.png`.

Contrôle négatif : `KINBALL_HTML=<copie de main avant TERRAIN> KINBALL_ONLY=TERRAIN` : 1, 2 et 3 échouent (pas de lignes dans `#gridLayer`) ; contre main après la PR #32, seule la 4 échoue (lignes pointillées, fond blanc).
