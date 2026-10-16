---
name: kinball-deleguer
description: Préparer et lancer un sous-agent Kin-Ball Stats (codeur, auditeur, relecteur) avec un brief court, un niveau de contrôle et un contexte cité plutôt que recopié. À utiliser avant chaque délégation.
---

# Déléguer un chantier Kin-Ball Stats

But : un agent qui démarre à froid reçoit exactement ce qu'il lui faut, et rend un résultat court. Les règles communes vivent dans `CLAUDE.md` du dépôt (chargé automatiquement), dans `docs/processus.md` et dans les skills `kinball-banc` et `kinball-audit` : ne les recopie pas dans le brief. En cas de contradiction avec ce skill, `CLAUDE.md` et `docs/processus.md` font foi.

## Avant d'écrire le brief
1. Lis le registre (`docs/chantiers.md`), rien d'autre par défaut.
2. Situe le code avec `node outils/carte.mjs <regex>` (jamais `index.html` en entier, environ 95 000 tokens) ; n'écris aucun numéro de ligne dans le brief, cite les noms de fonctions.
3. Vérifie qu'aucun autre agent ne modifie `index.html` en même temps (série stricte : un codeur à la fois).
4. **Fixe le niveau de contrôle** (table de `docs/processus.md`) : *complet* (saisie en direct, stockage, règles de pointage, service worker), *léger* (statistiques, exports, heat map), *aucun* (libellés, documentation). Le niveau décide de l'audit.
5. Modèles : Sonnet pour le codeur et l'auditeur, Opus pour le relecteur et pour trancher une architecture ou une règle du jeu.

## Le brief (une page au plus)
```
CHANTIER : <id> — <titre>
RÔLE : codeur | auditeur | relecteur
NIVEAU DE CONTRÔLE : complet | léger | aucun
OBJECTIF : <une phrase, résultat observable par l'utilisateur>
DÉCISIONS DE L'UTILISATEUR : <ce qui est tranché, citations courtes>
PÉRIMÈTRE : <fonctions, CSS, fichiers de tests>
HORS PÉRIMÈTRE : <ce qu'il ne touche pas>
INVARIANTS PROPRES AU CHANTIER : <seulement ceux qui ne sont pas déjà dans CLAUDE.md>
CRITÈRES D'ACCEPTATION : <liste numérotée, testable>
TESTS : <scénario tests/scenarios/<id>.mjs, contrôle négatif, suites du banc rapide>
BRANCHE : <nom de la branche de travail ; PR vers main>
À LIRE : <fichiers docs/ précis, sections>
RENDU : rapport complet dans <chemin> ; réponse finale de 30 lignes au plus (statut, CI, échecs, écarts au brief, questions)
```

## Lancer
- Utilise la définition d'agent du dépôt (`codeur`, `auditeur`, `relecteur`) si elle figure dans la liste des types d'agent ; sinon `general-purpose` avec le modèle du rôle, et « lis `.claude/agents/<rôle>.md` et `CLAUDE.md` » en tête du brief.
- Le codeur travaille sur sa branche (jamais `main`), valide avec `node tests/rapide.mjs`, pousse, ouvre la PR brouillon vers `main` (sans PR, pas de CI), puis lit la CI par `node outils/ci-banc.mjs --branche <b>`. Il ne lance jamais le banc complet.
- L'auditeur reçoit le niveau (complet ou léger) ; pas d'auditeur pour le niveau *aucun*.
- Le relecteur passe par vague ou avant une publication importante, jamais par chantier.
- Un codeur ou un auditeur peut être repris par `SendMessage` (avec son `agentId`) pour un correctif ou un contre-audit : ne relance pas un agent neuf qui devrait tout relire. N'attends pas en surveillant : l'agent rend la main quand il a fini.
- Toute PR s'ouvre avec `base: main` (un hook le vérifie). Un agent ne fusionne jamais : c'est l'utilisateur.

## Après
1. Lis la réponse courte. N'ouvre le rapport complet que si un critère est non conforme, si la CI est rouge, ou s'il y a un écart au brief.
2. CI rouge : distingue une vérification instable (relancer le passage) d'un vrai échec ; corrige sur la branche de la PR.
3. Mets à jour `docs/chantiers.md` en quelques lignes (statut, décision prise, constat ouvert). La raison complète d'une décision va dans `docs/decisions.md`, dans le même commit que le code.

## À ne pas faire
- Recopier le guide, le README du banc ou les règles de machine dans le brief.
- Demander un banc complet local au codeur : la CI le joue.
- Lancer un audit qui rejoue ce que la CI a déjà prouvé (voir `kinball-audit`), ou un audit complet pour un chantier de niveau *aucun*.