---
name: kinball-audit
description: Mener un audit indépendant d'un chantier Kin-Ball Stats, au niveau complet ou léger donné par le brief, en réutilisant le résultat de la CI et en concentrant l'effort sur la preuve indépendante. À utiliser par tout agent d'audit ou de relecture du projet.
---

# Audit d'un chantier Kin-Ball Stats

Tu n'écris rien dans le dépôt ni dans l'app. Tes scripts jetables vont dans ton dossier temporaire. Ton but : trouver ce que le codeur n'a pas testé, pas refaire ce que la CI a déjà prouvé. En cas de contradiction avec ce skill, `CLAUDE.md` et `docs/processus.md` font foi.

## 0. Le niveau vient du brief
| Niveau | Chantiers | Ton travail |
|---|---|---|
| **Complet** | saisie en direct (terrain, feuilles, menu radial, annulation, fin de période) ; stockage, sauvegarde, import, corbeille ; règles de pointage et % de victoire ; service worker et version | CI verte, puis tout le §2 |
| **Léger** | statistiques, exports, heat map, écrans de consultation | CI verte, puis §2 points 2 et 5, plus les invariants du diff. Une preuve indépendante seulement si le brief la demande |
| **Aucun** | libellés, lisibilité, documentation | pas d'audit : CI verte et relecture de la PR par l'utilisateur |

Sans niveau dans le brief, applique cette table ; en cas de doute, prends « complet ».

## 1. Réutiliser (ne pas rejouer)
- Lis le résultat de la CI pour le commit audité : `node outils/ci-banc.mjs --branche <b>` (`--attendre` si en cours). Il doit être vert et porter sur le bon commit : compare le commit entre crochets avec la tête de la PR. Cite-le, ne relance **jamais** le banc complet.
- Le banc « d'avant » ne se rejoue pas. Les modes animés ne se rejouent pas sur les suites qui fixent déjà leur mode (C21, C22, C23).
- La CI n'a pas de `KINBALL_AVANT` : ses vérifications « d'avant » sont KNOWN. Le contrôle négatif est donc à toi (§2.2).

## 2. Prouver toi-même (l'essentiel de ton travail)
1. Chaque critère d'acceptation du brief, vérifié par **tes propres** scripts Playwright, avec de vrais appuis aux coordonnées (`page.mouse.click`, `page.touchscreen.tap`), jamais `locator.click()` ni `force:true` pour une mesure. Après un ↶, attends la stabilité du terrain (`fieldStable()` de `tests/lib.mjs`) avant le geste suivant : sa disposition reste périmée environ 20 ms.
2. Le contrôle négatif : le scénario du chantier échoue sur la copie d'avant (`KINBALL_HTML=<copie d'avant> KINBALL_ONLY=<id>`).
3. Le scénario du chantier en mode animé, tablette et téléphone (`KINBALL_ONLY=<id>`), seulement pour l'audit d'une publication.
4. Des scénarios adverses que le brief n'a pas prévus : double appui, appui pendant une fermeture, ↶ à chaque étape, navigation (⌂, stats, retour) pendant une saisie, rechargement, redimensionnement, téléphone 320 px, noms hostiles (`<img onerror>`, `=SUM()`, `;`, très longs, homonymes).
5. La non-régression des données sur un match scénarisé : `S`, export et nombre de `save()` identiques à la référence (hors `ts`, `by`, `updatedAt`).
6. Des captures regardées par toi, tablette et téléphone.

Utilise `node tests/rapide.mjs` ou `KINBALL_ONLY=<id>,smoke,undo` pour tes propres passages. Un seul banc à la fois sur la machine.

## 3. Rendre
- Rapport complet dans le chemin indiqué : verdict (CONFORME / CONFORME AVEC RÉSERVES / NON CONFORME), critère par critère, constats avec gravité, scénario et preuve, ce que tu as réutilisé de la CI (commit et empreinte), ce que seul un iPad réel peut confirmer.
- Réponse finale de 30 lignes au plus : verdict, constats en une ligne chacun, limites.

Pour les règles de machine et la lecture du résultat, suis le skill `kinball-banc`.