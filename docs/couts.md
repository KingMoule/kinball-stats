# Coût des chantiers (tokens)

Une ligne par chantier, ajoutée par la session du fil juste après la fusion (méthode : `processus.md`, étape 6). Sert à repérer ce qui coûte et à vérifier qu'une économie a marché. Détail du premier bilan : `bilans/tokens-FIAB-1.md` dans les fichiers du Projet.

| Chantier | Niveau | Date | Coût session | Contexte final | Lectures du cache | Sortie | Sous-agents | Remarque |
|---|---|---|---|---|---|---|---|---|
| FIAB-1 (PR #20) | complet | 2026-10-16 | 6,89 $ | 241 k | 16,9 M | 139 k | auditeur 177 k | ~80 appels ; l'essentiel du coût = relecture du contexte à chaque appel |
| STAT-4 (PR #23) | léger | 2026-10-17 | ≈ 4,7 $ (avant la fusion) | 215 k | 12,4 M | 55 k | auditeur 100 k | ~60 appels ; banc rapide de 21 suites (11 min) attendu en deux appels |
| T-FP robustesse (PR #24) | complet | 2026-10-17 | ≈ 5,5 $ (compteur de session, avant la fusion) | 229 k | 15,3 M | 59 k | auditeur 131 k | une CI rouge (C22 · 6c, garde de ↶ trop longue) corrigée en un commit ; banc rapide de 24 suites (16 min) |
