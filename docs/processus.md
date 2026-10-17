# Processus : qui fait quoi, qui joue le banc, ce que ça coûte

Le projet se mène dans un Projet Claude : la session du projet reçoit les demandes et ouvre **un fil par chantier** ; la session du fil fait le chantier de bout en bout. L'utilisateur, francophone, fusionne les PR et fait les essais sur iPad. Il n'y a pas de mémoire entre sessions : ce qui n'est pas écrit dans le dépôt n'existe pas pour la suivante.

## Un chantier, dans son fil
1. Lire `docs/chantiers.md`, puis seulement ce que `docs/README.md` indique. Situer le code par `node outils/carte.mjs <regex>`.
2. Coder sur une branche, valider avec `node tests/rapide.mjs`, pousser, **ouvrir la PR brouillon vers `main`** (sans PR, pas de CI).
3. Lire la CI (`node outils/ci-banc.mjs --branche <b>`). Rouge : distinguer une vérification instable (relancer le job échoué) d'un vrai échec.
4. Contrôle selon le niveau (table ci-dessous). L'audit est confié à l'agent `auditeur` : il repart à froid et prouve les critères sans réutiliser le scénario du codeur. Correctif ou contre-audit : `SendMessage` au même agent.
5. Dans la même PR : une ligne au registre (`docs/chantiers.md`), la raison complète d'une décision dans `docs/decisions.md`, la doc touchée corrigée. Puis la PR passe « prête » et l'utilisateur fusionne.
6. Après la fusion : `get_session` sur la session du fil (lectures et écritures du cache, sortie, coût, contexte final) et tokens de chaque sous-agent (sa notification de fin) ; une ligne dans `docs/couts.md`, et la cause en une ligne si le coût dépasse nettement les chantiers du même niveau.

La session du fil code elle-même. L'agent `codeur` sert quand deux chantiers indépendants avancent en parallèle (jamais deux sur `index.html` : série stricte) ; son brief suit le skill `kinball-deleguer`. On ne demande à l'utilisateur que ce qui est irréversible, les règles du kin-ball et ses goûts, une seule fois, avec un défaut.

## Niveau de contrôle d'un chantier

| Niveau | Chantiers | Contrôle |
|---|---|---|
| **Complet** | saisie en direct (terrain, feuilles, menu radial, annulation, fin de période) ; stockage, sauvegarde, import, corbeille ; règles de pointage et % de victoire ; service worker et version du site | CI verte, puis audit complet (`auditeur` : preuve indépendante de chaque critère, scénarios adverses) |
| **Léger** | statistiques, exports, heat map, écrans de consultation | CI verte, puis audit léger : contrôle négatif et invariants du diff |
| **Aucun** | libellés, documentation, outillage, ajustements visuels sans logique | CI verte et relecture de la PR par l'utilisateur |

Le **relecteur** (Opus, revue transversale) passe avant une publication importante ou après plusieurs chantiers, jamais par chantier. La revue du 2026-10-16 (`docs/revue-2026-10-16/`) en tient lieu pour la série en cours.

## Qui joue le banc

| Quand | Quoi | Coût en tokens |
|---|---|---|
| Pendant le travail | `node tests/rapide.mjs` (1 à 4 min, tablette) | une dizaine de lignes |
| À chaque push sur une PR | banc complet **en CI** (17 à 20 min) | nul |
| Lire le résultat | `node outils/ci-banc.mjs --branche <b> [--attendre]` | une dizaine de lignes |

- Un agent ne lance jamais le banc complet et ne l'attend pas par sondage. Un passage complet local est une décision de l'utilisateur.
- **Cache par empreinte** (`tests/empreinte.mjs`) : un commit déjà joué relit son résultat. Une PR qui ne touche que `docs/`, `tests/docs/`, `.claude/`, `CLAUDE.md`, `README.md`, `MIGRATION.md` ou `tests/README.md` ne déclenche pas la CI (« aucun passage » est normal).
- Un push n'annule pas le passage en cours ; le suivant attend, puis relit le cache si l'empreinte n'a pas changé.
- `tests/rapide.json` (fichier ou section → suites) est indicatif : quand la CI révèle une suite manquante, on corrige la table.
- Les modes animés (`KINBALL_ANIM=1`) se jouent seulement pour l'audit d'une publication ; C21, C22 et C23 fixent déjà leur mode.

## Modèles et coût
- Un sous-agent coûte environ 200 000 tokens (mesuré le 2026-10-16) : on n'en lance pas pour une petite tâche, et on ne lui fait pas relire ce que la session sait déjà.
- Sonnet pour le code, les audits et la routine ; Opus pour le relecteur, une architecture ou une règle du jeu.
- Contexte léger : documents cités, jamais collés ; registre sous 10 Ko ; jamais `index.html` en entier. La réponse finale d'un agent tient en 30 lignes, le détail va dans son rapport sur disque.
- Mesurer avant d'optimiser : une ligne par chantier dans `couts.md` (étape 6). Le coût vient surtout du nombre d'appels d'outils, car chacun relit tout le contexte : regrouper les commandes, lire le banc une fois, ouvrir un fil neuf pour un travail tardif. Si la lecture d'`index.html` domine, le découpage (R13) passe devant.

## Garde-fous automatiques (`.claude/hooks/`)

| Hook | Refuse |
|---|---|
| `garde-banc` | `pkill` sur le banc ; un second banc quand un passage tourne |
| `garde-pr` | une PR dont la base n'est pas `main` |
| `garde-lecture` | `Read` d'un fichier de plus de 150 Ko sans `limit` (ou au-dessus de 800 lignes) ; `cat index.html` |

Autotest : `bash .claude/hooks/test-hooks.sh`. Agents, skills et hooks du dépôt sont chargés au démarrage d'une session (ou quand le dépôt est attaché) : une modification vaut pour la suivante. Les hooks sont en `bash` ; Windows n'est pas pris en charge (décidé le 2026-10-17).

## Environnement
- **Session cloud** : Node 22, Playwright préinstallé sous `npm root -g`, Chromium dans `/opt/pw-browsers`. Rien à installer.
- **Ordinateur** : Node 22, puis Playwright à la version de la CI (`PLAYWRIGHT_VERSION` dans `.github/workflows/banc.yml`) : `npm install -g playwright@<version>`, `npx playwright@<version> install chromium`, `NODE_PATH="$(npm root -g)"`.
- **GitHub** : `gh` doit pouvoir pousser une branche et ouvrir une PR. Journaux et artefacts de la CI sont illisibles depuis une session cloud (403) : `ci-banc.mjs` lit les annotations (résumé et dix premiers échecs) ; le reste s'ouvre dans GitHub.

## Limites connues
- Vérifications instables : C08·3 / C08·8 (course `onSnapshot` / `rebuildMatches`), M02·2 (`config.js net::ERR_ABORTED`). Si l'une est seule rouge : `gh api -X POST repos/KingMoule/kinball-stats/actions/runs/<id>/rerun-failed-jobs`. Si l'échec se répète, il est réel.
- La CI n'a pas de dossier `KINBALL_AVANT` : 18 vérifications « d'avant » y sont KNOWN. Le contrôle négatif se fait à la main (`KINBALL_HTML=<copie d'avant> KINBALL_ONLY=<id>`).
