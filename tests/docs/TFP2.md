# TFP2 : T-FP robustesse et garde commune (D98)

Suite `tests/scenarios/TFP2.mjs`, tablette et téléphone, vrais délais (timescale 1), une page par vérification.

1. F26, E5 (trois chemins : ballon échappé, faute directe, mode avancé avec la feuille des détails) : à +250 ms, `S` est déjà dans la période 2 (pointages à 0, période comptée une fois, possession au perdant du duel) ; le ruban montre encore 11 et « PÉRIODE 1 » ; chaque écriture dans la base, `setAdvancedPlayer` compris, porte la période 2 ; après le message, le ruban rejoint `S` ; ↶ rend l'état d'avant l'action.
2. Fin à la main : `S` et l'unique écriture dans la période 2 tout de suite ; « Annuler » du message (après 400 ms) rend l'état d'avant, sans fenêtre résiduelle.
3. F42 : état en suspens d'une ancienne version (`fin_periode` compté, période pas avancée) : la reprise rejoue le message une fois, la période n'est comptée qu'une fois ; ↶ pendant ce message rend l'état d'avant la fin.
4. Audit #13 : `navHome` pendant le message coupe le minuteur et l'affichage différé ; une feuille ouverte à l'accueil n'est pas refermée 1,7 s plus tard ; la reprise est dans la période 2, sans message.
5. Saisie N2 : deux appuis réels sur ↶ à 40 ms (rebond) défont une action ; à 350 ms, deux (la rafale à 150 ms est C22 · 6c).
6. Saisie N3 : bandeau `#syncBadge` touché pendant une saisie radiale : aucune feuille, la couche et `pending` restent, la faute s'enregistre.
7. Saisie N4 : format libre, FIN PÉRIODE 100 ms après « Annuler cette saisie » : ignoré ; 450 ms après : la période se termine.
8. D2 (feuille et radiale) : second appui au point d'« Annuler cette saisie », 150 ms après, quand ce point est sur le terrain (toujours en radiale) : ignoré ; un appui ailleurs au même moment ouvre une saisie (C21 · 6l).
9. Saisie N5 : `pointercancel` au milieu d'un vrai glisser : flèche effacée, rien de saisi, le relâchement n'ouvre rien ; le geste suivant marche.

`App.abandon()` (`tests/lib.mjs`) attend désormais la fin de la fenêtre de 300 ms après l'abandon : le fuzz tire le geste suivant au hasard et pouvait tomber au même point.

Contrôle négatif : `KINBALL_HTML=<copie de main avant T-FP robustesse> KINBALL_ONLY=TFP2` : 23 des 24 vérifications échouent (la 4 par le minuteur resté actif).
