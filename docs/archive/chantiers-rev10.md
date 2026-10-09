# Chantiers — révision 10 (addendum à `chantiers-rev9.md`)

Écrit le 2026-10-05. Là où ce fichier diffère de `chantiers-rev9.md` ou `chantiers.md` rév. 8, **ce fichier fait foi**.

## Vague 3 : en ligne
PR #1 fusionnée par l'utilisateur (commit `8275e81`), action GitHub Pages réussie, version 2026-10-04.11. L'utilisateur a constaté que **C24 fonctionne** sur iPad ; C20 (mots + DÉF ILL) en ligne. Un agent ne peut pas fusionner une PR (refus du système) : l'utilisateur fusionne toujours.

## Vague 4 : C21, menu radial près du doigt — **livré en PR #2, à fusionner**
PR : https://github.com/KingMoule/kinball-stats/pull/2 (`vague-4-c21` → `main`), version 2026-10-05.1. Brief : `claude/briefs-vague-4.md`.

**Q10 tranchée** (maquette essayée au doigt) : glisser → ATTRAPÉ | ÉCHAPPÉ | DÉF ILL près du doigt → menu radial des joueurs (4 disques + « ? ») centré sur le bouton touché, seulement pour ATTRAPÉ / ÉCHAPPÉ ; DÉF ILL sans joueur ; faute : type près du doigt (+ REPRISE DE JEU, Annuler) puis menu radial avec FAUTE D'ÉQUIPE ; **sans alignement : aucun menu radial des joueurs**.

**Réalisation** : couche `#radial` dans le repère de `fieldPoint()` ; mêmes fonctions de saisie qu'avant (aucune règle changée : `applyResult`, `applyFault`, `commitEvent`, `snapshotBefore`, `checkPeriodState`, `finishPeriod`, `undo`, `WP` intacts) ; réglage d'appareil `localStorage kinball.saisie` (`radiale` défaut | `feuille`) sur l'écran Nouveau match, hors `S` ; mode `feuille` identique à l'ancien et utilisé par défaut par le banc (`launch(g, { saisie: 'radiale' })` pour le radial). Feuilles de reprise / duel / receveur / fin de période restent des feuilles.

**Vérification** : banc complet 451/452 (M04·8 réglé par `check-release --ecrire`, rejoué : 16/16) ; C21+C20+C22+C23+C24 en animation 144/144 et animation + vrais délais 144/144 ; contrôle négatif 36/52 ; fuzz, smoke, undo, C20 rejoués en radial ; `simtest`, tests locaux verts. **Audit indépendant** (`rapports/C21-audit.md`) : conforme, S / export / `save()` identiques radial = feuille = référence sur 9/11, 11/13, Duel 11 ; fuzz radial 7 × 320 actions ; 6 problèmes (P1 ⌂ pendant une saisie laissait un `pending` orphelin ; P2 noms tronqués ; P3 init du banc instable (M03, M11) ; P4 geste perdu 240 ms après Annuler ; P5 redimensionnement ; P6 écran 320 px) **tous corrigés** (disques 72 px sur 2 lignes, fermeture 120 ms après Annuler / voile, annulation au redimensionnement…).

## Restes et constats
- **À essayer au doigt sur iPad et téléphone** (jamais testé en vrai tactile) : lisibilité des noms, discrétion du voile (34 %), appuis juste après un relâchement, iOS (clics synthétisés après `touchend`).
- **Réglage « Saisie en match » seulement dans Nouveau match** : changer de mode en plein match passe par l'accueil (P7).
- Deux relâchements très rapides : le second tombe sur le voile et annule le premier (voulu).
- Équivalence radial / feuille sur téléphone vérifiée seulement par les tests du codeur (l'audit l'a faite sur tablette).
- Inchangés : F39 à F42, F26 reste / F33 / F38 (transition de fin de période), F7, F37 (contrôles d'audit complet : l'audit de C21 a rejoué les modes animés et le fuzz, mais pas tout F37).
- Leçon d'outillage : un script d'initialisation du banc qui écrit dans `localStorage` à chaque chargement peut rendre d'autres suites instables ; ne l'écrire qu'une fois par contexte.

## Prochaine action
1. L'utilisateur fusionne la PR #2, puis met à jour l'iPad (version `2026-10-05.1`) et essaie le menu radial (tablette et téléphone).
2. Retours d'essai → petits réglages (voile, noms, taille des disques, place du réglage).
3. Ensuite : chantier « transition de fin de période » (F26 reste, F33, F38), audit complet F37, puis C04 / C08 selon l'utilisateur.
