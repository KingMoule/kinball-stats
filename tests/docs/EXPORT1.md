# EXPORT1 : situation des fautes et équipe permanente dans les exports (revue 3 : S4, S6)

Suite `tests/scenarios/EXPORT1.mjs`. Vérification 1 sur tablette, 2 et 3 sur tablette et téléphone ; une page par vérification.

1. S4 : 9/11 aléatoire (graine 505) jusqu'à la période 2, avec des fautes arrêtées et continues. « Situation (avec fautes) » est la dernière colonne des Actions, juste après « Réussite offensive (avec fautes) » ; le tableau croisé (équipe attaquante × cette colonne) redonne `offF_arretee` et `offF_continue` de `computeSituations` ; un lancer y garde sa « Situation », une faute a « Situation » vide et une situation rangée, les autres événements sont vides ; l'export « tous les matchs » a les mêmes valeurs. Puis, `before.stopped` retiré des fautes (ancien match) : toutes rangées, tableau croisé toujours égal à l'écran.
2. S6, feuille « Match » : `teamIds` Bleu et Noir posés, Gris nom libre : trois lignes « ID équipe » après « Date du match » (Gris vide), aussi en fin de la feuille du XLSX téléchargé ; duel Bleu–Gris : deux lignes ; sans `teamIds` : vides, sans erreur.
3. S6, « tous les matchs » : 44 colonnes, les quatre dernières « Situation (avec fautes) », « ID équipe 1/2/3 » ; l'ancienne dernière (« Équipe éliminée ») à sa place ; une équipe renommée et passée de Bleu à Gris garde son ID ; nom libre, emplacement hors jeu (même avec un `teamIds` résiduel) et match sans `teamIds` : vide.

Contrôle négatif : `KINBALL_HTML=<copie de main avant EXPORT-1> KINBALL_ONLY=EXPORT1` : les cinq vérifications échouent.
