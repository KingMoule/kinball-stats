# LIS1 : annuler une saisie à l'étage « joueurs » ; pas d'appui parasite sur ⌂ / TERMINER après l'annulation (D92)

Suite `tests/scenarios/LIS1.mjs`, tablette et téléphone, une page par vérification, vrais gestes (aucun `force`).

1. Feuille (QUI A LANCÉ ? et QUI A FAIT LA FAUTE ?, téléphone à 320 px) : « Annuler cette saisie » présent, hors de la grille, à 16 px au moins du « ? », entier dans l'écran ; son appui met `pending` à null, n'ajoute rien à l'historique, ne change aucun score, ferme la feuille ; la saisie suivante repart. 1c : « ? » et FAUTE D'ÉQUIPE enregistrent comme avant.
2. Couche radiale (lancer et faute directe, 1180 px ; 320 et 390 px sur téléphone ; centre, bas, deux coins, haut) : un seul « Annuler », entier dans le terrain, sans chevauchement d'aucun autre bouton, à 40 px au moins du « ? », texte sans débordement ; même effet que 1. 2c : le voile ne fait rien à cet étage. 2d (au calme, animations réelles) : couche fermée 150 ms après Annuler.
3. Après « Annuler » (feuille ou radiale, lancer ou faute), un vrai appui sur ⌂ ou TERMINER tombé dans la fenêtre de ré-armement (lu par un écouteur en capture) n'ouvre rien et ne navigue pas ; après la fenêtre, ⌂ ouvre « QUITTER LE MATCH EN COURS ? » et TERMINER sa feuille. L'appui est donné une fois la couche radiale fermée (`radialBusy` refuse déjà ⌂ et TERMINER pendant sa fermeture).
4. ↶ : ignoré dans la fenêtre qui suit Annuler, actif après (comportement d'avant).
5. R15 : ⌂ sur un match vide, sans appui récent, revient à l'accueil sans confirmation.

Contrôles négatifs : `KINBALL_HTML=<copie de main>` (worktree, pour garder les fichiers voisins) : échouent 1a, 1b, 2a, 2b, 2d, 3 (les 16, bouton `finishBarTap` absent ou Annuler absent) et 4 ; 1c, 2c et 5 passent (comportement inchangé). Copie de la branche sans la garde de `goHome` / `finishBarTap` : les 16 vérifications 3 échouent.
