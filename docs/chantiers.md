# Chantiers — Kin-Ball Stats (registre vivant)

Mis à jour le 2026-10-16 (PR #15 et #16 fusionnées ; passage à Claude Code, MIG-1). **Seul registre qui fait foi.** Il vit dans le dépôt depuis D94 (avant : Projet claude.ai). L'historique (registres rév. 8 à 10, briefs des vagues 1 à 5, ancien guide, cahier des charges, rapports) est dans `docs/archive/`. On garde ce fichier sous 15 Ko : un chantier terminé y tient en une ligne.

## Cadre
- Le site est publié par GitHub Pages quand une PR est fusionnée dans `main`, et c'est **toujours l'utilisateur qui fusionne**. **Toute PR s'ouvre avec `base: main`** (un hook le vérifie). Si `gh pr create` est refusé, passer par `gh api …/pulls`.
- Session principale = Orchestrator (`docs/orchestrateur.md`). Agents : `.claude/agents/` (codeur Sonnet, auditeur Sonnet, relecteur Opus), chargés au démarrage de la session. S'ils manquent à la liste des types d'agent : `general-purpose` sous le modèle du rôle, avec « lis `.claude/agents/<rôle>.md` et `CLAUDE.md` » dans le brief (méthode des PR #9 à #15). Correctif ou contre-audit : `SendMessage` au même `agentId` (codeur et auditeur repris sans relire, #12, #14, #15).
- Skills : `.claude/skills/kinball-deleguer`, `kinball-banc`, `kinball-audit` (versionnés depuis MIG-1). `CLAUDE.md` et `docs/processus.md` font foi sur eux.
- Banc : **le banc complet se joue en CI** (`.github/workflows/banc.yml`, cache par empreinte) ; résultat par `node outils/ci-banc.mjs`. **Sans argument il lit le commit COURANT du clone** : toujours `--branche main` ou `--branche <b>` ; `--attendre` pour patienter (9 min par appel : un passage de 16 à 17 min demande **deux** appels). **Après un push ou une relance, il peut rendre l'ancien passage** : lire le commit entre crochets (`[CI, commit …]`) avant de conclure. Le workflow se déclenche **sur la PR** : un push sans PR donne « aucun passage ». Pendant le travail : `node tests/rapide.mjs`. Une suite seule : `KINBALL_ONLY=<id> node tests/run.mjs` (`rapide.mjs` l'ignore). Un agent ne lance jamais le banc complet (D81).
- Processus : un codeur par vague, qui pousse sa branche. Niveau de contrôle donné par le brief (complet, léger, aucun). Un relecteur Opus par vague ou avant une publication importante.

## En cours
**MIG-1 (PR de documentation, branche `migration-claude-code`) : tout le suivi rapatrié dans le dépôt** (registre, handoff, rôle de l'Orchestrator, skills, cahier des charges et évaluation archivés), D94. Ne touche ni le site ni les tests : pas de CI (« aucun passage » est normal). PR #17. **À fusionner par l'utilisateur**, puis vider le Projet claude.ai (voir D94).
`main` = `804226c` (PR #16 fusionnée le 2026-10-16, T-FP affichage et geste ; site 2026-10-12.5). CI de `main` : passage lancé à la fusion (2026-10-16 13 h 06), résultat à lire par `node outils/ci-banc.mjs --branche main` (commit `804226c` entre crochets). ESSAI-5 : à demander à l'utilisateur (fait ou non avant #16 ?).

## Chantiers terminés (une ligne chacun)
- Vagues 1 à 4 : C02 à C24 ; détail dans `docs/archive/`.
- Harnais du banc (PR #3) ; CI-1 : banc en CI, banc rapide, `ci-banc.mjs`, hooks, agents (PR #6).
- C25 : import et sécurité (R5, R4, R3, R22). C26 : garde-fous du match (R9, R7, R6, R8, R20). C27 : stockage (R2, R1). C28 : exports pour l'analyse (R10, R11).
- LIS-1 (partie 1) : F40 (PR #7). F39 et F41 closes sans code (D83), F42 dans T-FP.
- STAT-1 = #10 (PR #8, D85, D86) : la faute directe compte dans les tentatives offensives.
- C23·6 (PR #9, `fieldStable()`) : **clos**, vert sur les PR #10 à #15 et sur `main` ; s'il recasse, rouvrir (`{ calme: true }` seulement avec l'accord de l'utilisateur).
- STAT-2 = #1, #3, #4, #5 (PR #10, D87). STAT-3 = #2, #6 (PR #11, D88) : gagnant de période dérivé de l'historique. Un ancien match sans `before.periodWins` affiche « Sans vainqueur » (attendu).
- C08 (PR #12, D89) : « Exporter tous les matchs (CSV) » ; CSV long, 40 colonnes figées, exports d'un match inchangés. Non prouvé : ouverture dans Excel français, iPad.
- R16 + R19 + R27 (PR #13, D90) : cinq états d'interface sortis de `S` ; bouton « REPRENDRE » sur les lignes EN COURS ; reprise d'un autre match refusée tant que l'écriture du match de `S` est en attente.
- R15 (PR #14, D91) : `matchVide(m)` unique ; un match vide part à la corbeille au retour à l'accueil sans confirmation ; une copie locale `deleted` n'est jamais reprise ; exports inchangés (D77).
- **LIS-1 reste = F27 + F28 (PR #15, D92, fusionnée, `bbe81d4`)** : « Annuler cette saisie » à l'étage joueurs (feuille et radial, lancer et faute directe) par `cancelPendingEvent()` ; ⌂ et TERMINER de la barre ignorés pendant `undoBlockedUntil` (400 ms, tablette comprise) ; fermeture radiale de 120 ms inchangée. CI de la PR : 638/638, 18 connus. Suite `LIS1`.
- **T-FP affichage et geste = R14 + F33 + F38 + F43 (PR #16, D93, fusionnée, `804226c`)** : après un échappé au seuil, « ÉCHAPPÉ » (550 ms) puis « PÉRIODE X TERMINÉE » 1,4 s pleines ; en mode avancé, la fin de période attend la feuille des détails (`periodEndWait`) ; bouton « Annuler » (≥ 44 px, `undo()`) dans le message, autres appuis ignorés pendant la fenêtre (Q14) ; rectangle du terrain figé au `pointerdown` (`fieldGeom`). Suite `TFP1` (42 vérifications).
- CI-2 (skills corrigés) : clos par MIG-1, les skills sont dans le dépôt.

## À faire, par priorité

### Plan du 2026-10-11 : 4 mises à jour
Série stricte : un seul codeur sur `index.html` à la fois, chaque PR fusionnée avant la suivante. Les numéros #n sont ceux des 12 idées de l'utilisateur (D85).

**MAJ 1, statistiques : CLOSE.** **MAJ 2, export et stockage : CLOSE.**

**MAJ 3, saisie en direct, fiabilité (complet, relecteur Opus avant publication, essai iPad ensuite)**
- **LIS-1 (reste) = F27 + F28 : FAIT** (PR #15).
- **T-FP, affichage et geste** : R14, F33, F38, F43 : **FAIT** (PR #16).
- **T-FP, robustesse (prochain chantier)** : reste de F26 (match rechargé pendant la fenêtre), E5 (`save()` dans la fenêtre), F42 ; y ajouter les constats préexistants de l'audit de #13 (ci-dessous) et **D2 de l'audit de #15** (double appui radial sur Annuler à 150 ms ou plus : le second appui ouvre une nouvelle saisie, sans donnée écrite ; même comportement sur `main` aux étages résultat et faute).

**MAJ 4, saisie en direct, confort (3 PR, complet, relecteur Opus avant publication)**
- **VIS-1 = #8, #9, #11** (léger : CSS, sauf `drawDrag`) : bordure blanche autour des pastilles Bleu et Gris ; retirer la barre blanche de possession (`.team-chip::after`, règles bureau et `.phone`), garder le point, « allumer » la pastille de l'équipe qui a le ballon (rendu validé sur iPad) ; flèche du glissé à la couleur de l'équipe qui lance (Noir : contour blanc). Jouer les suites du terrain.
- **REDO = #7** : ↷ après ↶ ; pile hors de `S`, **vidée à la prochaine action ou au rechargement** (décidé) ; couvre `fin_periode`, changements de joueur, fenêtre de 1,4 s ; **après T-FP**.
- **TERRAIN = #12** : tracé du terrain remplacé par le carré de la maquette, **écran de saisie en direct seulement** (heat maps inchangées). **L'image de la maquette n'est pas dans le dépôt : l'utilisateur la ré-attache au brief** (ou l'ajoute sous `docs/maquettes/`). Carré 1:1 à coins arrondis ; fond vert foncé en dégradé vertical (plus clair en haut) ; liseré clair arrondi juste à l'intérieur ; grille 3×3 en fines lignes bleues aux tiers ; cercle central gris-vert sans remplissage (environ 70 % de la case centrale) ; aucune autre ligne. Le calque `#gridLayer` existe déjà. Touche `fieldPoint`, `start_norm` / `end_norm` ; tests de géométrie (`fieldStable()`) concernés. En dernier.

**Avant T-FP robustesse** : CI de `main` verte, ESSAI-5 sur la version en ligne (avec les gestes de #16), et `/usage` pour décider de R13.

### Autres lignes
| Id | Sujet | Remarque |
|---|---|---|
| ESSAI-5 | Essai iPad : reprise après veille (R1, R2), CSV dans Excel (colonnes « (avec fautes) »), corbeille des équipes, ↶ après FIN PÉRIODE, détail de fautes avec DÉF ILL, XLSX « Équipes », « Par période » (STAT-2), gagnant de période et feuille des changements (STAT-3), « Exporter tous les matchs (CSV) » dans Excel français (C08), REPRENDRE et feuille « ENREGISTREMENT EN COURS » (#13), nouveau match puis ⌂ (corbeille sans confirmation) et match avec alignement seul (sans REPRENDRE ni bannière) (R15), **LIS-1 : « Annuler » à l'étage joueurs en radial et en feuille (lancer et faute directe), ⌂ et TERMINER ignorés environ 0,4 s après un appui de feuille, le « ? » remonté de 28 px ; sur téléphone en mode feuille, « Annuler cette saisie » occupe la zone de ↶ (un appui visé sur ↶ annule la saisie, sans perte)** ; **T-FP (#16) : après un échappé au seuil, « ÉCHAPPÉ » puis « PÉRIODE X TERMINÉE » bien visible ; « Annuler » dans ce message ; en mode avancé, la fin de période attend la feuille des détails ; ⌂, STATS, TERMINER ignorés pendant le message** | seul l'utilisateur |
| R19-UX | Sur téléphone, REPRENDRE est hors écran à droite dans le tableau de l'historique ; la corbeille de ligne reste à 34 px ; le `title` du nom tronqué est invisible au toucher ; « RÉESSAYER L'ENREGISTREMENT » coupé en plein mot à 320 px | goût de l'utilisateur ; après ESSAI-5 (**Q15**) |
| R15-B | La colonne « Actions » de l'historique affiche encore `history.length` (alignement et changements y comptent) et « Exporter tous les matchs (CSV) » exporte des lignes pour un match avec seulement alignement ou changements (1 à 2 lignes, 0 si `history` vide) | D77 : rien changé ; goût (**Q16**) |
| R15-C | Une copie locale `deleted` d'un match non vide ou plus ancien que la base est gardée sans jamais être proposée ni purgée (tablette) ; un vide laissé par une fermeture brutale de l'app reste dans l'historique ; `lastStartingLineup` lit encore les vides existants ayant un alignement ; la suppression en attente de `checkLocalBackups` n'est retentée qu'au démarrage suivant | mineurs, rares, sans perte |
| C08-B, C08-C | Export « tous les matchs » : gel du fil principal à 120 000 lignes (4,3 s en test) ; seul le match de `S` dédoublonné par id | mineurs |
| C08·3 / C08·8, M02·2 | Vérifications instables : course `onSnapshot` / `rebuildMatches` (C08) ; `M02·2` « 0 requête en échec » (`config.js net::ERR_ABORTED`), vert à la relance | préexistants ; si l'un est seul rouge, relancer le job échoué ; corriger s'il revient |
| F43-B | Cause de la mise en page périmée après ↶ : le bandeau `#syncBadge` « Enregistrement… » (33 px, dans le flux) pendant `save()`. Le geste est corrigé (`fieldGeom`), pas le bandeau | consigné (D93) ; le sortir du flux change toute la mise en page |
| C24·6 | Non filtré des 5 clés sorties de `S` : avec une copie « d'avant » locale il échoue (`.heatTeam`) | KNOWN en CI, sans effet ; à nettoyer avec le banc |
| Constats préexistants (audit #13) | Le minuteur de fin de période (1,4 s) modifie le `S` courant s'il est remplacé (inatteignable au toucher) ; le minuteur de réessai de `save()` est perdu en consultation d'archive ; un NOUVEAU match n'est pas protégé pendant une écriture en attente ; le second appui d'un double appui tombe sur le terrain | à regrouper dans T-FP, robustesse |
| R12 | Safari sans installation ou navigation privée | rétrogradé : l'app est installée partout |
| C04 | Fiche joueur cumulée | attend Q5 |
| F8 | Graphique du % de victoire au fil du match, consultable après le match (backlog du cahier des charges, jamais discuté) | idée ; à proposer après MAJ 4 |
| R13 / C01 | Découpage de `index.html` (environ 360 Ko) | reporté : on mesure `/usage` ; d'abord code mort et commentaires périmés |
| R17, R18, R23 à R26 | « Saisi par » brut ; deux doigts ; quotas serveur de collecte ; dépôt entier publié ; SheetJS ancien ; accessibilité | mineurs |
| F7 | Calibration du % de victoire sur de vrais matchs | attend une vingtaine de matchs en 9/11 |
| E4, E6, E8 | Relectures en double pendant une panne ; identifiants anciens écartés à l'import ; carte « nouvel appareil » | pour information |
| CI-1 (reste) | Surveiller les vérifications instables ; ajouter C20 (DÉF ILL) et la feuille « Équipes » au plan rapide d'un diff sur les fautes | `node outils/ci-banc.mjs --branche <b>` |

**Abandonnés (2026-10-11)** : F31, F32, F34, F36. **CI-3** (protection de `main`) : non mise en place ; lire `ci-banc.mjs` sur `main` après chaque fusion.

## Décisions récentes (le pourquoi complet est dans `docs/decisions.md`)
- **D76 à D82** : harnais du banc et des agents ; exports en ajouts sûrs et CSV pour Excel français (D77) ; fin de période manuelle = événement `fin_periode` (D78) ; banc complet en CI seulement (D81) ; hooks `garde-pr` et `garde-lecture` (D82).
- **D83** : LIS-1. **D84** : ordre léger, stockage, saisie ; F31, F32, F34, F36 abandonnés ; C08 colonnes figées ; R12 rétrogradé.
- **D85** : 12 idées intégrées. #10 : la faute directe entre dans le total de lancers. #7 : ↷ vit jusqu'à la prochaine action. #6 : toutes les équipes. #12 : saisie en direct seulement.
- **D86** : STAT-1. **D87** (PR #10) : STAT-2. **D88** (PR #11) : STAT-3. **D89** (PR #12) : C08. **D90** (PR #13) : R16 + R19 + R27. **D91** (PR #14) : R15. **D92** (PR #15) : LIS-1 reste. **D93** (PR #16) : T-FP affichage et geste ; geste ignoré pendant la fenêtre, Annuler par `undo()` avec garde de 400 ms.
- **D94** (2026-10-16, MIG-1) : passage complet à Claude Code. Registre, handoff, rôle de l'Orchestrator et skills vivent dans le dépôt ; le Projet claude.ai est vidé après la fusion.

## Questions ouvertes pour l'utilisateur
- **Q11** : règles supposées du moteur de probabilité (match gagné à 4 périodes, reprise du duel, cible à égalité).
- **Q5** : questions prioritaires de la fiche joueur (C04).
- **Q15** (après ESSAI-5) : sur téléphone, où mettre REPRENDRE pour qu'il se voie (colonne figée, sous le nom, autre) ? Et en consultation d'archive, proposer « quitter la consultation et réessayer » en un geste (défaut : on ne change rien) ?
- **Q16** (R15-B, après ESSAI-5, goût) : la colonne « Actions » de l'historique et l'export « tous les matchs » doivent-ils ignorer aussi alignement et changements (défaut : on ne change rien, D77) ?
- ~~Q13~~ répondue (R15). ~~Reprise de jeu~~ répondue : n'est pas une action. ~~Q14~~ répondue le 2026-10-12 : geste pendant les 1,4 s ignoré (appliqué par #16).
