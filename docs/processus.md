# Processus : qui joue le banc, qui audite, ce que ça coûte

Le banc est un script : il ne consomme aucun token. Les tokens partent dans les agents qui l'entourent (lancer, attendre, lire la sortie, le relancer pour l'audit) et dans le contexte qu'ils traînent. Le processus sort donc le banc de la boucle du modèle et réserve le modèle à ce que seul il fait.

## Qui joue le banc

| Quand | Quoi | Coût en tokens |
|---|---|---|
| Pendant le travail | `node tests/rapide.mjs` : les suites que le diff peut casser, tablette seulement, 1 à 4 min. `--liste` montre le plan sans rien lancer. | une dizaine de lignes |
| À chaque push | Le banc complet joue **en CI** (workflow « Banc d'essai », `.github/workflows/banc.yml`). | nul |
| Lire le résultat | `node outils/ci-banc.mjs [--attendre]` : résumé court du passage du commit courant. | une dizaine de lignes |

- **Un agent ne lance jamais le banc complet** (`node tests/run.mjs` sans filtre) et ne l'attend pas par sondage. Un passage complet local, quand la CI est indisponible, est une décision de l'utilisateur.
- **Le cache par empreinte** (voir `tests/empreinte.mjs`) fait qu'un commit déjà joué, ou une PR qui ne change que la documentation, relit un résultat au lieu de rejouer 17 à 20 minutes. Une PR qui ne touche que `docs/`, `tests/docs/`, `.claude/`, `CLAUDE.md`, `README.md`, `MIGRATION.md` ou `tests/README.md` ne déclenche pas la CI (`ci-banc.mjs` répond alors « aucun passage » : c'est normal). `docs/`, `tests/docs/`, `.claude/`, `CLAUDE.md` et `tests/README.md` n'entrent pas non plus dans l'empreinte.
- Un push n'annule pas le passage en cours (le filtre des PR juge la PR entière : un push de documentation relancerait le workflow et tuerait 20 minutes de banc). Le passage suivant attend, puis relit le cache si l'empreinte n'a pas changé.
- `KINBALL_CACHE=seul node tests/run.mjs` relit un passage local déjà joué sans jamais lancer le banc (code 3 s'il n'existe pas).
- La table `tests/rapide.json` (fichier ou section de `index.html` → suites) est **indicative**. Quand la CI révèle qu'une suite manquait au passage rapide, on corrige la table.

## Niveau de contrôle d'un chantier

Le brief donne le niveau. À défaut, l'Orchestrator tranche par cette table.

| Niveau | Chantiers | Contrôle |
|---|---|---|
| **Complet** | saisie en direct (terrain, feuilles, menu radial, annulation, fin de période) ; stockage, sauvegarde, import, corbeille ; règles de pointage et pourcentage de victoire ; service worker et version du site | CI verte, puis audit complet (`auditeur`, preuve indépendante de chaque critère) |
| **Léger** | statistiques, exports, heat map, écrans de consultation | CI verte, puis audit léger : résultat CI, contrôle négatif, invariants du diff. Une preuve indépendante seulement si le brief la demande |
| **Aucun** | libellés, lisibilité, documentation, ajustements visuels sans logique | CI verte et relecture de la PR par l'utilisateur |

- Le **relecteur** (Opus) passe par vague, ou avant une publication importante, jamais par chantier.
- Les **modes animés** se jouent sur la tablette, seulement pour l'audit d'une publication. C21, C22 et C23 fixent déjà leur mode : inutile de les rejouer en `KINBALL_ANIM=1`.

## Modèles

- **Sonnet** : le code, les audits, la routine.
- **Opus** : le relecteur, les décisions d'architecture et de règles du jeu. L'Orchestrator tourne sous Sonnet pour tenir le registre et déléguer, et passe sous Opus pour trancher une architecture ou arbitrer un audit.
- **Aucun agent** ne surveille le banc : c'est le travail d'un script.

## Hygiène de session

- Une session par chantier. `/clear` entre deux chantiers, `/compact` avant une phase longue : chaque tour renvoie tout le contexte accumulé, donc une session qui traîne coûte de plus en plus cher par message.
- Un sous-agent repart à froid : on n'en lance pas pour une petite tâche.
- On ne lit jamais `index.html` en entier (354 Ko, environ 95 000 tokens) : `node outils/carte.mjs <regex>`, puis une lecture bornée. Un hook refuse la lecture entière.
- La réponse finale d'un agent tient en 30 lignes ; le détail va dans son rapport sur disque.
- **Mesurer avant d'optimiser.** `/usage` (ou `/cost`) à la fin d'un chantier : noter le poste dominant. Si c'est le banc ou l'audit, ce document s'applique ; si c'est la lecture d'`index.html`, le découpage (R13 / C01) passe devant.

## Garde-fous automatiques (`.claude/hooks/`)

| Hook | Refuse |
|---|---|
| `garde-banc` | `pkill` sur le banc ; un second banc quand un passage tourne |
| `garde-pr` | une PR dont la base n'est pas `main` (D80) |
| `garde-lecture` | `Read` d'un fichier de plus de 150 Ko sans `limit` (ou au-dessus de 800 lignes) ; `cat index.html` |

Autotest : `bash .claude/hooks/test-hooks.sh`. Une définition ou un hook ajouté en cours de session n'est chargé qu'à la session suivante.

## Limites connues

- Éprouvée le 2026-10-10 : passage complet vert (514/514, 979 s), puis relecture du cache en moins de 45 s. Le premier passage avait révélé un vrai défaut de test : après ↶ la disposition du terrain reste périmée environ 20 ms et un tap devient un glissement (corrigé par `fieldStable()` dans `tests/lib.mjs`). Les vérifications sensibles au temps peuvent encore échouer sur un exécuteur partagé : relancer le passage (« Re-run failed jobs ») avant de conclure à une régression ; si le même échec se répète, il est réel ou à marquer `{ calme: true }`.
- Journaux et artefacts d'un passage se téléchargent depuis les serveurs de stockage de GitHub, que la politique d'une organisation ou d'une session peut refuser (constaté le 2026-10-10 : 403 sur `productionresultssa1.blob.core.windows.net`). `ci-banc.mjs` lit donc des **annotations** (`api.github.com`) : le résumé et les dix premiers échecs. Au-delà, ou pour le détail, ouvrir le passage dans GitHub (onglet *Summary*, artefact `banc-resultat`).
- La CI n'a pas de dossier `KINBALL_AVANT` : les vérifications qui comparent avec une sauvegarde « d'avant » y sont **KNOWN** (non bloquantes), pas jouées. Les contrôles négatifs restent à faire à la main.
- Le coût en minutes GitHub Actions dépend du forfait du dépôt.
