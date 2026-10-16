# FIAB1 : sauvegarde et reprise (FIAB-1)

Suite `tests/scenarios/FIAB1.mjs`, tablette et téléphone. Chaque vérification lance sa propre page ; les pannes sont simulées par une doublure de `writeMatchDoc`.

1. Données I2 / saisie N1 : l'écriture N (retenue par une porte) réussit pendant que l'action N+1 attend, puis N+1 échoue : `pendingSaveId`, le réessai et la copie de N+1 restent ; le réessai automatique écrit tout.
2. Données I1 : actions non écrites, rechargement (fermeture brutale), puis la carte REPRENDRE : `S` est la copie locale, la bannière disparaît, une action de plus, rechargement : rien n'est perdu.
3. Audit #13 : le minuteur de réessai tombe pendant la consultation d'une archive : le match de saisie est écrit, l'archive jamais, la consultation reste.
4. Audit #13 : NOUVEAU MATCH pendant une écriture en échec : « ENREGISTREMENT EN COURS », `S` inchangé ; après RÉESSAYER, le nouveau match démarre.
5. Données M3 / saisie N6 : « Récupérer ce match » d'un autre match pendant une écriture en échec : refus ; ensuite récupération, saisie orpheline (`pending`) jetée.
6. Données M2 : corbeille depuis l'historique du match de saisie dont l'écriture échoue : à la corbeille avec toutes ses actions, ne réapparaît pas.
7. Données M5 : « Ne pas enregistrer » dont l'écriture échoue : le match redevient le match de saisie, copie complète, puis écrit en entier.
8. Saisie N8 : match terminé dont l'écriture n'est pas confirmée : pas de carte REPRENDRE ni de bouton dans l'historique, `resumeMatch` reste à l'accueil.
9. Audit D2 : ↶ ↶ puis une action, écritures en échec, rechargement : la bannière dit « de moins », REPRENDRE prend la copie, rien n'est perdu.
10. Audit D1 : corbeille en échec, puis réussie, puis récupération depuis la corbeille : plus rien « en attente » ; un match en attente qui n'est plus en mémoire ne bloque pas NOUVEAU MATCH.
11. Audit D3 : copie d'un match terminé non écrit, REPRENDRE : message « MATCH TERMINÉ », terrain non ouvert, match enregistré terminé.

Contrôle négatif : `KINBALL_HTML=<index.html de main dans un worktree> KINBALL_ONLY=FIAB1` : toutes les vérifications échouent (1 à 8 vérifiées sur `main` ; 8 à 11 échouent aussi sur le premier commit de la PR, avant les correctifs de l'audit).
