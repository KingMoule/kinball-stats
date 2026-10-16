> **Archive (rapatriée du Projet claude.ai le 2026-10-16).** Évaluation qui a mené à CI-1 (PR #6), à `CLAUDE.md`, aux agents et hooks de `.claude/`, aux skills `kinball-*` et au régime du registre. Presque tout est appliqué ; ce qui fait foi aujourd'hui est `docs/processus.md`. Les chemins `claude/…` qu'elle cite désignaient le Projet claude.ai, remplacé par `docs/` (D94).

# Évaluation du workflow des sous-agents : où partent les tokens et comment mieux les encadrer

*9 octobre 2026. Ce document s'appuie sur l'évaluation indépendante du banc (agent extérieur, 452 vérifications mesurées) et sur la revue de code complète (agent Opus indépendant). Il s'appuie aussi sur la relecture de `orchestrator.md`, `handoff.md`, `chantiers*.md`, `architecture-et-guide.md`, `briefs-vague-4.md` et `tests/README.md`.*

## En bref

Le workflow est rigoureux : les rôles sont séparés, le banc fait vraiment les gestes, les contrôles négatifs sont systématiques, et il y a un handoff à chaque fin de session. Ce qui coûte, ce n'est pas la rigueur, c'est la façon de la payer. Quatre postes dominent :

1. **Le banc lui-même.** Il dure 22 min 42 s. Il est lancé au moins deux fois par chantier, puis encore par l'audit. Les agents le surveillent avec des `sleep` + `tail`, et chacun de ces coups d'œil renvoie tout le contexte de l'agent au modèle. Le journal reste vide jusqu'à la fin, puis la sortie fait environ 17 000 tokens.
2. **La mémoire du projet est trop grosse et en couches.** Les 12 documents du Projet totalisent environ 190 000 caractères, soit environ 54 000 tokens. Plusieurs documents sont périmés (briefs des vagues 1 et 2, plan de la vague 3, `chantiers-rev9`). Pour savoir quoi faire, il faut lire trois registres en cascade (« rev10 fait foi, puis rev9, puis rév. 8 »). `chantiers.md` à lui seul contient quatre générations de numéros de ligne, 75 décisions avec leur justification complète et les fiches de chantiers terminés depuis longtemps.
3. **Chaque agent redécouvre tout à froid.** Les règles communes (une seule instance du banc, ne jamais `pkill -f`, commandes de 10 min au plus, invariants de l'app) sont recopiées dans chaque brief. Le README du banc fait 18 Ko et chaque agent le lit en entier. `index.html` pèse environ 95 000 tokens, et aucune carte à jour n'aide à cibler la lecture.
4. **L'audit refait ce que le codeur vient de prouver.** Il relance le banc complet, puis les modes animés sur des suites qui fixent déjà leur propre mode, puis le banc « avant » sur un fichier qui n'a pas changé.

Ordre de grandeur mesuré aujourd'hui :
- l'évaluation du banc a coûté 186 000 tokens et 92 minutes ;
- la revue de code a coûté 342 000 tokens et 18 minutes.

Un chantier ordinaire (un codeur et un audit) se situe vraisemblablement dans la même fourchette. Les recommandations ci-dessous visent à le ramener à une fraction de ce coût, sans retirer de preuve.

---

## 1. Le banc : trois changements qui rapportent le plus

Le détail et les mesures sont dans le rapport `rapport-evaluation-tests.md`.

| # | Changement | Gain | Risque |
|---|---|---|---|
| B1 | Raccourcir aussi la fermeture de la feuille (240 ms) quand l'animation est coupée. Correctif de 5 lignes dans `tests/lib.mjs`, prêt (`P1-fermeture-raccourcie-seule.patch`) | **−7 min 30 par passage** (mesuré), soit environ −22 min par chantier | très faible : la fenêtre de 240 ms reste testée en mode animé (C21·6l, C22) |
| B2 | **Mode silencieux** et **fichier `resultat.json`** : n'afficher que les échecs et une ligne de résumé, écrire la sortie au fil de l'eau, fournir **une seule commande d'attente** qui rend la main à la fin avec le résumé | environ **−16 600 tokens par lecture** (mesuré), environ 15 tours d'agent de moins par chantier | aucun |
| B3 | **Mettre en cache le passage « avant »** par empreinte (`sha256` d'`index.html` + des tests + version de Chromium) : le passage « avant » du codeur et le banc « avant » de l'audit deviennent une simple lecture | deux passages complets de moins par chantier | faible |
| B4 | Corriger les trois vérifications instables (M04·1, C13B·11, C13B·13) | plus de rejeux ni d'enquêtes | aucun |
| B5 | Quatre processus au lieu de deux, avec les mesures de durée jouées à la fin, au calme | 15 min → 9 min (mesuré) | moyen tant que B4 n'est pas fait |

**Règle de surveillance à donner aux agents.** Une attente se fait en une seule commande : un `wait` sur le PID ou une boucle `until [ -f resultat.json ]` dans une seule commande de moins de 10 minutes, répétée au plus trois fois. Jamais de `sleep 60 && tail` en boucle : chaque tour renvoie tout le contexte de l'agent. Si l'outil `Monitor` est disponible dans la session, il est fait pour cela.

## 2. La mémoire du projet : un régime

| # | Changement | Pourquoi |
|---|---|---|
| M1 | **Un seul registre vivant**, `chantiers.md`, de 10 à 15 Ko au plus : état des chantiers ouverts, questions ouvertes, « Décisions futures » encore actives. Tout le reste (fiches terminées, décisions D1 à D75, anciens relevés de lignes, historique des audits) va dans un fichier d'archive **hors du Projet**, par exemple `docs/archive/` dans le dépôt | Mettre fin à la lecture en cascade rev10 → rev9 → rév. 8. Un document vivant ne dit jamais « ce fichier fait foi sur l'autre » |
| M2 | **Retirer du Projet** les documents périmés : `briefs-vague-1.md`, `briefs-vague-2.md`, `plan-vague-3.md`, `chantiers-rev9.md`, `chantiers-rev10.md` (après fusion dans M1) et `migration-site-github-pages.md` (sa place est dans le dépôt, qui a déjà `MIGRATION.md`) | Selon la façon dont claude.ai charge les documents d'un Projet, ces 54 000 tokens peuvent être relus à chaque conversation. Même s'ils ne sont consultés que par recherche, les documents périmés produisent de fausses réponses |
| M3 | **Plus aucun numéro de ligne écrit à la main.** Un petit script `outils/carte.mjs` sort la carte fonction → ligne d'`index.html` à la demande | Les quatre relevés de lignes de `chantiers.md` sont tous faux aujourd'hui, et leur entretien coûte à chaque chantier |
| M4 | Le guide (`architecture-et-guide.md`, environ 60 Ko) passe **dans le dépôt**, découpé par sujet (`docs/saisie.md`, `docs/stockage.md`, `docs/stats.md`, `docs/banc.md`…). Un brief cite les fichiers utiles au lieu de « lis le guide » | Un codeur de la feuille de saisie n'a pas besoin des sections sur la heat map ou les phases |
| M5 | **Instructions du Projet** (vides aujourd'hui) : trois lignes. Lire `handoff.md` d'abord, puis le reste seulement à la demande ; le code est dans le dépôt | Démarrage léger garanti, sans dépendre de la mémoire de l'Orchestrator |

## 3. Le harnais des agents

### 3.1 Un `CLAUDE.md` dans le dépôt

Claude Code charge automatiquement un `CLAUDE.md` à la racine du dépôt pour tout agent qui y travaille. C'est l'endroit des règles qui se répètent aujourd'hui dans chaque brief. Il doit rester court, 2 Ko au plus :
- les invariants de l'app (navigation, `S`, `FAULTS`, `deleted:true`, aucun point sans événement, `escapeHtml` pour tout texte saisi) ;
- les règles de la machine (un seul banc à la fois, `setsid nohup`, jamais `pkill -f`, commandes de 10 min au plus) ;
- l'attente par une seule commande, la lecture de `resultat.json` plutôt que de la sortie ;
- `gh pr create` ne marche pas, passer par `gh api` ; un agent ne fusionne pas ;
- où écrire les rapports.

Les briefs ne gardent alors que ce qui est propre au chantier. Celui de C21 aurait perdu environ un tiers de sa longueur.

### 3.2 Des définitions d'agents versionnées

Le fichier `orchestrator.md` existe, mais les codeurs et les auditeurs sont lancés comme `general-purpose` avec un long prompt. Je propose trois définitions dans `.claude/agents/` du dépôt :
- `codeur.md` : Sonnet, droits d'écriture ;
- `auditeur.md` : Sonnet ou Opus, sans `Edit` ni `Write` sur le dépôt, rapport seulement ;
- `relecteur.md` : Opus, effort élevé, lecture seule.

La définition fixe le modèle, l'effort, les outils permis et le format du rapport ; le prompt de lancement n'est plus que le brief.

**Limite constatée aujourd'hui.** Dans cette session, une définition d'agent ajoutée en cours de route (`revue-code-opus`, Opus, effort extra élevé) n'a pas été reconnue. L'outil de lancement ne permet de choisir que le modèle, pas l'effort. La revue de code a donc tourné sous Opus 5.5 avec l'effort par défaut. Des définitions présentes dans le dépôt **dès le début de la session** devraient être chargées, mais c'est à vérifier à la prochaine session avant de compter dessus.

### 3.3 Des skills plutôt que des paragraphes de brief

Un skill ne coûte presque rien tant qu'il n'est pas utilisé : seule sa description d'une ligne est présente. Trois procédures du projet reviennent à chaque chantier et gagneraient à devenir des skills :
- **`kinball-banc`** : lancer, attendre, lire et interpréter le banc, avec les rejeux ciblés et les contrôles négatifs ;
- **`kinball-deleguer`** : comment l'Orchestrator prépare un chantier (brief court au format fixe, contexte cité et non recopié, ce que l'agent doit rendre, fin de chantier) ;
- **`kinball-audit`** : ce qu'un audit réutilise (le `resultat.json` du codeur, à empreinte égale) et ce qu'il doit prouver lui-même (critères du brief par ses propres scripts, contrôle négatif, captures, scénarios adverses).

Je les propose ci-dessous en cartes d'enregistrement.

### 3.4 Des mods (hooks) pour les erreurs qui coûtent cher

Un hook s'exécute sans qu'aucun agent ait à se souvenir d'une règle. Quatre hooks seraient utiles ici :
- **Refuser `pkill -f tests/run.mjs`.** Cette commande tue le shell de l'agent ; c'est un piège déjà noté dans le handoff.
- **Refuser un second banc** si un verrou `/tmp/kinball-banc.lock` existe.
- **Tronquer la sortie d'une commande qui dépasse quelques milliers de lignes**, en gardant la fin et les lignes `FAIL`.
- **Une ligne d'état** qui affiche « banc : 312/452, 14 min » pendant un passage, pour toi.

Ces mods se construisent avec le skill `plugin-authoring` ; je peux le faire à la demande.

## 4. Le processus : moins de répétitions, autant de preuves

| # | Changement | Gain | Ce qui reste prouvé |
|---|---|---|---|
| P1 | **Codeur** : banc complet une fois **après** seulement ; le passage « avant » vient du cache (B3) ou du dernier résultat de `main` | un passage par chantier | « On ne démarre pas sur un banc rouge » reste vrai : le cache le dit |
| P2 | **Audit d'un chantier** : il lit le `resultat.json` du codeur s'il porte la même empreinte, et ne relance que (a) le scénario du chantier en mode animé, (b) le contrôle négatif, (c) ses propres scripts adverses. Pas de banc complet | un ou deux passages complets par chantier | La preuve indépendante, c'est-à-dire l'auditeur qui cherche ce que le codeur n'a pas testé, reste entière. C'est elle qui a trouvé P1 à P6 sur C21 |
| P3 | **Modes animés** : C21, C22 et C23 fixent déjà leur mode, il est inutile de les rejouer en `KINBALL_ANIM=1`. Les modes animés complets se jouent **sur tablette seulement**, et seulement pour l'audit d'une publication | de −30 à −60 min par grand audit (estimé) | On perd le minutage du téléphone en mode animé, déjà couvert par C22 |
| P4 | **Un relecteur Opus par vague, pas par chantier**, en lecture seule, comme la revue d'aujourd'hui | moins d'audits complets | Une revue transversale trouve ce que les audits par chantier ne voient pas. Aujourd'hui elle a trouvé R3 (export « réimportable » refusé) et R5 (code exécuté depuis un fichier importé) |
| P5 | **Rapports courts par contrat** : la réponse finale d'un agent tient en 30 lignes au plus (verdict, échecs, constats, questions). Le détail va dans le fichier de rapport, que l'Orchestrator ne lit que s'il y a un problème | le contexte de l'Orchestrator reste léger plus longtemps, donc moins de handoffs forcés | aucun : le rapport complet existe toujours |
| P6 | **Choix du modèle** : Sonnet pour le code et la plupart des audits ; Opus pour la relecture et l'Orchestrator ; jamais un agent pour surveiller le banc (c'est le travail d'un script) | — | — |

## 5. Ordre d'application conseillé

1. **Dépôt, en un seul chantier (codeur Sonnet, environ une heure)** : B1, B2, B4, `CLAUDE.md`, `outils/carte.mjs`, découpage du README du banc. B3 et B5 dans la foulée si B4 passe.
2. **Projet (Orchestrator, une session)** : M1, M2, M5, puis M4 au chantier suivant.
3. **Skills** : enregistrer les trois cartes proposées, puis ajuster après un chantier réel.
4. **Agents versionnés** (3.2) et **hooks** (3.4) : à la session suivante, en vérifiant d'abord que les définitions du dépôt sont bien chargées.
5. **Code** : traiter les constats de la revue dans cet ordre :
   - R5 (code exécuté depuis un fichier importé) et R4 (import non validé) ;
   - R3 (export « réimportable » refusé à l'import) ;
   - R9 (équipe supprimée sans confirmation) et R7 (match terminé qui accepte encore des actions) ;
   - R6 (↶ après une fin de période manuelle) ;
   - R1 et R2 (pannes d'IndexedDB, à essayer sur iPad) ;
   - puis R11 (exports pour l'analyse), qui recoupe C08.

## 6. Limites

- Les coûts en tokens des anciens chantiers ne sont pas disponibles. Les chiffres de ce document viennent des deux agents d'aujourd'hui et des mesures du banc.
- La façon exacte dont claude.ai charge les documents d'un Projet dans une conversation (tout le texte ou par recherche) n'est pas vérifiée ici. M2 vaut dans les deux cas.
- L'effort de raisonnement d'un sous-agent n'a pas pu être réglé depuis cette session (voir 3.2).
