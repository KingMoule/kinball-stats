# Chantiers — Kin-Ball Stats (seul registre)

Mis à jour le 2026-10-16 (revue complète et ménage de la doc). Ce fichier dit où en est le projet, ce qui vient ensuite et ce qu'on attend de l'utilisateur. Il reste sous 10 Ko : un chantier terminé tient en une ligne, le pourquoi va dans `docs/decisions.md`, la méthode dans `docs/processus.md`.

## État
- `main` = `a9cf546` (PR #18, ménage de la doc, fusionnée) ; dernier code : PR #16, site `2026-10-12.5`. CI de `main` verte : 686/686, 18 connus (commit `804226c`).
- Revue complète du 2026-10-16 : rapports dans `docs/revue-2026-10-16/` (1 saisie, 2 données, 3 stats, 4 outillage). On les cite par fichier et numéro (« données I1 »). Le dossier se supprime quand ses constats sont traités ou écartés.
- ESSAI-5 (`docs/essai-ipad.md`) : fait par l'utilisateur le 2026-10-16.

## Plan (validé par l'utilisateur le 2026-10-16, « fiabilité d'abord »)
Série stricte sur `index.html` : une PR fusionnée avant la suivante. Ce qui ne touche pas `index.html` peut avancer en parallèle.

1. **FIAB-1, sauvegarde et reprise** (complet) : **en cours**, branche `claude/project-thread-waxvtd` (D96, suite FIAB1). Données I1 (REPRENDRE charge la version de la base et la première action écrase la copie de secours : actions perdues), données I2 = saisie N1 (une écriture réussie efface l'état « en attente » d'une sauvegarde plus récente : plus de réessai, de copie ni d'alerte), données M2, M3, M5, saisie N6, N8 ; audit #13 : NOUVEAU match non protégé, réessai perdu en consultation d'archive.
2. **STAT-4, chiffres faux** (léger). Stats S1 (onglet Zones plante dans un duel sans Bleu), S2 (en-têtes « Par période » cassés sur téléphone, nom échappé deux fois), S3 (« Score final » exporté = score de la période en cours, souvent 0 : ajouter « Points marqués (match) » en fin de colonnes), S5, S8.
3. **T-FP robustesse + garde commune** (complet). Une fonction de garde partagée par ↶, ⌂, TERMINER, FIN PÉRIODE, terrain et bandeau (cause de saisie N3, N4) ; F26 et E5 (appliquer la remise à zéro de période à `S` tout de suite, ne différer que l'affichage) ; F42 ; minuteur de fin de période (audit #13) ; D2 et double appui terrain ; saisie N2 (double ↶), N5 (`pointercancel`). Prépare REDO.
4. **OUTIL-1, outillage** (aucun ; **en parallèle de 1 à 3**, ne touche pas `index.html` sauf `VERSION_AMONT`). Retirer `amont/`, `outils/resync.mjs`, son test et `MIGRATION.md` (figer `VERSION_AMONT`) ; `.gitattributes` LF ; Pages ne publie que le site (R24) ; actions `checkout@v5` ; `tests/local` et `simtest` en CI ; marquer `{ calme: true }` les vérifications chronométrées (outillage 2) ; `tests/lib.mjs` cherche aussi `npm root -g` ; `rapide.json` complété ; `ci-banc.mjs` sous Windows.
5. **MÉNAGE-1, code mort et commentaires périmés** (aucun, après 3). Branche `window.claude`, `migrateLegacyMatches`, archivage (vraie suppression masquée), `zoneSection`, `isRetry`, `playerPickTeam`, commentaires « serveur » ; puis mesurer `/usage` pour décider de R13.
6. **ESSAI-6 iPad** puis publication. Puis MAJ 4 : **VIS-1** (#8, #9, #11), **REDO** (#7, après la garde commune ; pile `{ev, after}` hors de `S`, vidée à la prochaine action ou au rechargement), **TERRAIN** (#12, image de la maquette à fournir ; les lignes actuelles à 0,18 / 0,82 ne sont pas les tiers des zones : le nouveau tracé corrige cet écart ; pas d'`overflow:hidden` sur les coins).
7. **Fonctions nouvelles, à choisir après MAJ 4** : F8 (courbe du % de victoire au fil du match), C04 (fiche joueur cumulée, attend Q5), identifiant d'équipe permanent dans les exports (stats S6), « Situation (avec fautes) » dans le CSV (stats S4), F7 (calibration, attend une vingtaine de matchs).

## Autres lignes
| Id | Sujet | Remarque |
|---|---|---|
| R15-C | Copies locales `deleted` gardées sans purge ; vides laissés par une fermeture brutale | mineurs, sans perte |
| C08-B, C08-C | Export « tous les matchs » : gel à 120 000 lignes ; seul le match de `S` dédoublonné | mineurs |
| F43-B | Bandeau `#syncBadge` dans le flux pendant `save()` (cause de la mise en page périmée après ↶) | consigné (D93) |
| C24·6 | Non filtré des 5 clés sorties de `S` avec une copie « d'avant » locale | KNOWN en CI |
| R12, R17, R18, R23, R25, R26 | Safari non installé ; « Saisi par » brut ; deux doigts ; quotas de collecte ; SheetJS ancien ; accessibilité | mineurs |
| E4, E6, E8 | Relectures en double ; identifiants anciens écartés à l'import ; carte « nouvel appareil » | pour information |
| Revue, mineurs restants | Données M1, M4, M6, M7, M8, M10 ; stats S7, S9 à S12 ; saisie N7 et propreté ; outillage (mineurs) | à reprendre quand on touche le code concerné |

**Abandonnés** : F31, F32, F34, F36, CI-3 (protection de `main`) ; R19-UX et R15-B (Q15 et Q16 : « on ne change rien », 2026-10-16).

## Terminés (une ligne chacun ; détail dans `docs/decisions.md` et l'historique git)
- Vagues 1 à 4 (C02 à C24) ; banc en CI, banc rapide, hooks, agents (PR #3, #6) ; C25 à C28 (import, garde-fous, stockage, exports).
- STAT-1 à 3 (PR #8, #10, #11 ; D85 à D88) ; C08 export de tous les matchs (PR #12, D89) ; R16 + R19 + R27 (PR #13, D90) ; R15 matchs vides (PR #14, D91).
- LIS-1 (PR #7, #15 ; D83, D92) ; T-FP affichage et geste (PR #16, D93) ; MIG-1, tout le suivi dans le dépôt (PR #17, D94).

## Questions pour l'utilisateur
- **Q11** : règles supposées du moteur de probabilité (match gagné à 4 périodes, reprise du duel, cible à égalité).
- **Q5** : questions prioritaires de la fiche joueur (C04).
