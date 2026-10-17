# Chantiers — Kin-Ball Stats (seul registre)

Mis à jour le 2026-10-17 (revue du plan). Ce fichier dit où en est le projet, ce qui vient ensuite et ce qu'on attend de l'utilisateur. Il reste sous 10 Ko : un chantier terminé tient en une ligne, le pourquoi va dans `docs/decisions.md`, la méthode dans `docs/processus.md`.

## État
- `main` = `46b6106` (PR #24, T-FP robustesse, site `2026-10-17.5`).
- Revue complète du 2026-10-16 : rapports dans `docs/revue-2026-10-16/` (1 saisie, 2 données, 3 stats, 4 outillage). On les cite par fichier et numéro (« données I1 »). Le dossier se supprime quand ses constats sont traités ou écartés.
- ESSAI-5 (`docs/essai-ipad.md`) : fait par l'utilisateur le 2026-10-16.

## Plan (validé par l'utilisateur le 2026-10-16, « fiabilité d'abord »)
Série stricte sur `index.html` : une PR fusionnée avant la suivante. Ce qui ne touche pas `index.html` peut avancer en parallèle.

1. **FIAB-1, sauvegarde et reprise** (complet) : **fait** (PR #20, D96, suite FIAB1 ; corrige aussi saisie N7 et le reste de R21). Données I1 (REPRENDRE charge la version de la base et la première action écrase la copie de secours : actions perdues), données I2 = saisie N1 (une écriture réussie efface l'état « en attente » d'une sauvegarde plus récente : plus de réessai, de copie ni d'alerte), données M2, M3, M5, saisie N6, N8 ; audit #13 : NOUVEAU match non protégé, réessai perdu en consultation d'archive.
2. **STAT-4, chiffres faux** (léger) : **fait** (PR #23, D97, suite STAT4). Stats S1 (onglet Zones d'un duel sans Bleu), S2 (en-têtes « Par période »), S3 (« Points marqués (match) » en fin de « Équipes » ; « Score final » documenté comme score de la période en cours), S5 (même dénominateur des zones de fautes), S8.
3. **T-FP robustesse + garde commune** (complet) : **fait** (PR #24, D98, suite TFP2 ; TFP1 et C23 lisent l'affichage ; le défaut des barres du % de victoire passe à VIS-1). Une fonction de garde partagée par ↶, ⌂, TERMINER, FIN PÉRIODE, terrain et bandeau (cause de saisie N3, N4) ; F26 et E5 (appliquer la remise à zéro de période à `S` tout de suite, ne différer que l'affichage) ; F42 ; minuteur de fin de période (audit #13) ; D2 et double appui terrain ; saisie N2 (double ↶), N5 (`pointercancel`). Prépare REDO.
4. **MÉNAGE-1, vestiges claude.ai et code mort** (aucun ; OUTIL-1 et MÉNAGE-1 fusionnés le 2026-10-17, ils touchent tous deux `check-release` et `kbsite.js`). Retirer `amont/`, `outils/resync.mjs`, son test et `MIGRATION.md` (figer `VERSION_AMONT`) ; branche `window.claude`, `migrateLegacyMatches`, archivage (vraie suppression masquée, et `masquerArchivage` dans `kbsite.js`), `zoneSection`, `playerPickTeam`, commentaires « serveur » et « 5 000 documents ».
5. **OUTIL-2, CI** : **fait** (PR #27). Pages ne publie que le site (R24 ; `docs/` sorti des fichiers du site, ce qui rétablit le déploiement cassé par la PR #25) ; actions sur Node 24 ; `simtest` et `tests/local` en CI ; outillage B-1 (TFP1, C23·2 au calme) et B-5 (`rapide.json`, `carte.mjs --sections`).
6. **VIS-1** (#8, #9, #11 ; léger : CSS, sauf `drawDrag`) : **fait** (PR à venir, D99, suite VIS1). bordure blanche autour des pastilles Bleu et Gris ; retirer la barre blanche de possession (`.team-chip:has(.poss-dot)::after`, règles bureau et `.phone`), garder le point, « allumer » la pastille de l'équipe qui a le ballon ; flèche du glissé à la couleur de l'équipe qui lance (Noir : contour blanc) ; `wpTransition` lit `periodEndView` (les barres du % de victoire ne passent plus à la période suivante pendant le message de fin, noté par T-FP). Jouer les suites du terrain. Avant ESSAI-6, pour qu'un seul essai le couvre.
7. **ESSAI-6 iPad** puis publication. Puis **REDO** (#7) : ↷ après ↶ ; pile `{ev, after}` hors de `S`, vidée à la prochaine action ou au rechargement (décidé) ; couvre `fin_periode`, changements de joueur, fenêtre de fin de période ; risques : revue saisie, section R. Puis **TERRAIN** (#12) : tracé du terrain de saisie en direct remplacé par la maquette `docs/maquettes/terrain-3x3.png` (heat maps inchangées) : carré 1:1 à coins arrondis, fond vert foncé en dégradé vertical, liseré clair, grille 3×3 bleue aux tiers, cercle central gris-vert sans remplissage (≈ 70 % de la case), aucune autre ligne ; les lignes actuelles à 0,18 / 0,82 ne sont pas les tiers des zones, le nouveau tracé corrige cet écart ; pas d'`overflow:hidden` sur les coins ; risques : revue saisie, section T.
8. **Fonctions nouvelles, à choisir après TERRAIN** : F8 (courbe du % de victoire au fil du match), C04 (fiche joueur cumulée, attend Q5), identifiant d'équipe permanent dans les exports (stats S6), « Situation (avec fautes) » dans le CSV (stats S4), F7 (calibration, attend une vingtaine de matchs).

## Autres lignes
| Id | Sujet | Remarque |
|---|---|---|
| R15-C | Copies locales `deleted` gardées sans purge ; vides laissés par une fermeture brutale | mineurs, sans perte |
| C08-B, C08-C | Export « tous les matchs » : gel à 120 000 lignes ; seul le match de `S` dédoublonné | mineurs |
| C24·6 | Non filtré des 5 clés sorties de `S` avec une copie « d'avant » locale | KNOWN en CI |
| R12, R17, R18, R23, R25, R26 | Safari non installé ; « Saisi par » brut ; deux doigts ; quotas de collecte ; SheetJS ancien ; accessibilité | mineurs |
| Revue, mineurs restants | Données M1, M4, M6, M7, M8, M10 ; stats S7, S9 à S12 ; saisie N7 et propreté ; outillage (mineurs) | à reprendre quand on touche le code concerné |

**Abandonnés** : F31, F32, F34, F36, CI-3 (protection de `main`) ; R19-UX et R15-B (Q15 et Q16 : « on ne change rien », 2026-10-16) ; le 2026-10-17 (revue du plan) : R13 (découper `index.html` : le coût vient surtout du nombre d'appels, `couts.md`), points Windows d'outillage (K-1 à K-3 : ni développement ni prise de stats sous Windows, l'app sert sur tablette et téléphone), F43-B (consigné D93), E4, E6, E8 (pour information).

## Terminés (une ligne chacun ; détail dans `docs/decisions.md` et l'historique git)
- Vagues 1 à 4 (C02 à C24) ; banc en CI, banc rapide, hooks, agents (PR #3, #6) ; C25 à C28 (import, garde-fous, stockage, exports).
- STAT-1 à 3 (PR #8, #10, #11 ; D85 à D88) ; C08 export de tous les matchs (PR #12, D89) ; R16 + R19 + R27 (PR #13, D90) ; R15 matchs vides (PR #14, D91).
- LIS-1 (PR #7, #15 ; D83, D92) ; T-FP affichage et geste (PR #16, D93) ; MIG-1, tout le suivi dans le dépôt (PR #17, D94).

## Questions pour l'utilisateur
- **Q11** : règles supposées du moteur de probabilité (match gagné à 4 périodes, reprise du duel, cible à égalité).
- **Q5** : questions prioritaires de la fiche joueur (C04).
