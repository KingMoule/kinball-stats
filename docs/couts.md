# Coût des chantiers (tokens)

Une ligne par chantier, ajoutée par la session du fil juste après la fusion (méthode : `processus.md`, étape 6). Sert à repérer ce qui coûte et à vérifier qu'une économie a marché. Détail du premier bilan : `bilans/tokens-FIAB-1.md` dans les fichiers du Projet.

| Chantier | Niveau | Date | Coût session | Contexte final | Lectures du cache | Sortie | Sous-agents | Remarque |
|---|---|---|---|---|---|---|---|---|
| FIAB-1 (PR #20) | complet | 2026-10-16 | 6,89 $ | 241 k | 16,9 M | 139 k | auditeur 177 k | ~80 appels ; l'essentiel du coût = relecture du contexte à chaque appel |
| STAT-4 (PR #23) | léger | 2026-10-17 | ≈ 4,7 $ (avant la fusion) | 215 k | 12,4 M | 55 k | auditeur 100 k | ~60 appels ; banc rapide de 21 suites (11 min) attendu en deux appels |
| T-FP robustesse (PR #24) | complet | 2026-10-17 | ≈ 5,5 $ (compteur de session, avant la fusion) | 229 k | 15,3 M | 59 k | auditeur 131 k | une CI rouge (C22 · 6c, garde de ↶ trop longue) corrigée en un commit ; banc rapide de 24 suites (16 min) |
| VIS-1 (PR #28) | léger | 2026-10-17 | ≈ 4,1 $ (avant la ligne de coût) | 203 k | 9,4 M | 40 k | auditeur 53 k | MÉNAGE-1 fusionnée pendant la CI : fusion de `main`, D99 renuméroté D100, second passage CI ; M03·8 rouge une fois (attente de 30 s, hors du diff) |
| REDO (PR #30) | complet | 2026-10-17 | ≈ 5,7 $ (compteur de session, avant la ligne de coût) | 212 k | 16,3 M | 112 k | auditeur 185 k | avec la note d'ESSAI-6 ; banc rapide de 23 suites (19 min) ; audit : un écart (↶ d'un ancien événement sans `before`) corrigé, deuxième passage CI |
| TERRAIN (PR #32) | complet | 2026-10-17 | ≈ 3,7 $ (compteur de session, avant la ligne de coût) | 224 k | 9,4 M | 61 k | auditeur 104 k | CI verte du premier coup ; banc rapide de 21 suites (10 min) ; audit tenu, remarque cosmétique : le voile radial carré dépasse l'arrondi des coins de 4 px |
| EXPORT-1 (PR #34) | léger | 2026-10-17 | ≈ 3,6 $ (compteur de session, avant la ligne de coût) | 188 k | 7,6 M | 42 k | auditeur 60 k | CI verte du premier coup ; C29·7 adapté après le banc rapide (7 suites, 5 min) ; audit tenu, aucun écart |
| TERRAIN-2 (PR #36) | léger | 2026-10-17 | ≈ 3,7 $ (écart du compteur de session depuis TERRAIN) | 148 k | 12,1 M | 37 k | auditeur 72 k | même session que TERRAIN (contexte déjà long) ; R16 et C17 comptent les points par `heat-pt` ; CI verte du premier coup |
