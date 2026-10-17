# VIS1 : pastilles d'équipe, possession, flèche du glissé, % de victoire en fin de période (D100)

Suite `tests/scenarios/VIS1.mjs`. Vérifications 1 et 2 sur tablette et téléphone, 3 sur tablette ; une page par vérification.

1. 9/11 sans joueurs, possession Bleu puis Gris puis Noir (deux échappés) : à chaque étape, les trois blocs du ruban ont un liseré blanc, aucun `::after` (plus de barre de possession), et seul le bloc qui porte `.poss-dot` est allumé (liseré blanc plein de 3 px et halo).
2. Même match : un vrai glisser (souris) par équipe en possession, lu avant le relâchement puis abandonné : ligne, point de départ et pointe à `TEAM_BG` de l'équipe ; Noir : une ligne blanche plus large dessous et une pointe cernée de blanc.
3. Duel 11, `WP.minK = 1`, échappés en alternance jusqu'à la période 2 ; `wpRequest` espionné : aucune demande pendant que `periodEndView` existe, la dernière demande porte sur la période 2 après le message, et le résultat finit sur l'état courant.

Contrôle négatif : `KINBALL_HTML=<copie de main avant VIS-1> KINBALL_ONLY=VIS1` : les cinq vérifications échouent (3 : une demande pendant le message, période 2).
