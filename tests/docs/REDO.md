# REDO : ↷ après ↶ (D101)

Suite `tests/scenarios/REDO.mjs`, tablette et téléphone, une page par vérification ; ↷ par un vrai clic après le réarmement.

1. 9/11 avec joueurs : ↷ présent et inactif au départ ; trois actions, trois ↶ puis trois ↷ : `S` identique à chaque étape (historique compris), une écriture par ↷, ↷ inactif à la fin.
2. Une action après ↶ vide la pile (`redo()` ne change rien) ; un choix de possession aussi.
3. Changement de joueur défait par « ↶ Annuler le dernier changement » puis ↷ du ruban : échange et événement rétablis.
4. Élimination : ↶ dans la feuille du duel puis ↷ : attente du duel et feuille rouverte ; duel lancé, ↶ ↷ : même porteur, aucune feuille.
5. Duel 11, échappé au seuil : ↶ après le message puis ↷ : période 2 identique, ni fenêtre ni `periodEndView`.
6. Vrais délais : « Annuler » du message de fin de période puis ↷ : `S` = l'état de la fenêtre, aucun message rejoué ; `redo()` refusé pendant une saisie, la pile reste.
7. Format libre, fin de période à la main : ↶ ↷ rétablit `fin_periode` et la période 2.
8. Deux appuis réels à 40 ms sur ↷ : une action ; historique allongé ailleurs : ↷ refusé, de nouveau possible à la même longueur ; pile vide après rechargement et après NOUVEAU MATCH.

Contrôle négatif : `KINBALL_HTML=<copie de main avant REDO> KINBALL_ONLY=REDO` : les 16 vérifications échouent (aucun bouton ↷, ni `redo`).
