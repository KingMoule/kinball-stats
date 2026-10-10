# Chantiers — révision 9 (addendum à `chantiers.md` rév. 8)

Écrit le 2026-10-04, fin de la vague 3 (saisie en match). Là où ce fichier diffère de `chantiers.md` rév. 8, **ce fichier fait foi**. `claude/plan-vague-3.md` garde le plan d'origine.

## Changements de cadre
- **La source du code est le dépôt GitHub `KingMoule/kinball-stats`** (`index.html`). L'artifact claude.ai n'évolue plus ; `amont/` reste figé (dernière version issue de l'artifact). **PUB-2 et PUB-3 sont obsolètes** : le site se déploie par GitHub Pages quand la PR est fusionnée (l'utilisateur fusionne). `MIGRATION.md` du dépôt le dit.
- Livraison de la vague 3 : **une PR**, `vague-3-saisie` → `main`, https://github.com/KingMoule/kinball-stats/pull/1 (commits : C24, C20, documentation, version du site 2026-10-04.11).
- Essais iPad/téléphone faits par l'utilisateur, rien à signaler : défauts des vagues 1 et 2 confirmés (Q14, Q16 à Q25).

## Questions résolues
- **Q8 = A. Mots** : « ATTRAPÉ » / « ÉCHAPPÉ » en toutes lettres.
- **Q9 = DÉF ILL comme un ballon échappé** : mêmes points, même reprise ; le lancer compte (OFF % de l'attaquant, DÉF % de l'équipe fautive) ; plus la faute. Choix par défaut acceptés : pas de coordonnées (ni zones, ni heat map) ; F % reste « fautes directes / actions offensives » (la DÉF ILL s'ajoute à « Fautes » et au tableau par type) ; +/- comme un échappé ; accès par glisser puis bouton du bloc d'équipe.
- **Q25** close. **Q26** sans objet (PUB-3 obsolète).
- **Q10 reste ouverte** : la maquette de C21 est publiée en privé (https://claude.ai/artifact/52kjtsmTHmh8B664DbvYRe), à essayer sur iPad et téléphone ; ses réponses écrivent le brief de C21.

## Chantiers
| Id | Statut | Résultat |
|---|---|---|
| **C24** | **terminé** | `reopenMatchSheets()` appelée par `onEnterScreen('match')` (F29) ; `.sub-pitch{overflow:visible}` (F35) ; fin de période en suspens rejouée une seule fois, les deux formes d'état enregistré (faute : période pas encore comptée ; lancer : déjà comptée) (F26 partiel). Scénario `tests/scenarios/C24.mjs` 22/22, contrôle négatif 9/11. |
| **C20** | **terminé** | Menu du résultat « ATTRAPÉ \| ÉCHAPPÉ \| DÉF ILL » (`showResultMenu`) ; `pickDefIll(team)` → `applyResult(..., defIll)` : événement `lancer` échappé, `target` = équipe fautive, `fault_type:'DÉF ILL'`, sans joueur ni coordonnées (supprimées avant `commitEvent`) ; `DEF_ILL`, `FAULT_TYPES = FAULTS + DÉF ILL`, `isDefIll(d)` ; lecteurs de fautes mis à jour (`computeFaults` avec `defIll`, `sectionMatchFaults`, `openFaultDetail`, `faultTypeAoa`, `computeTeamAggregate`, `sectionTeamFaults`) ; `accumulatePlayerStats` ne la compte pas « lancer sans joueur ». `FAULTS` (8 codes) inchangé. Scénario `C20.mjs` 14/14, contrôle négatif 6/7 ; `tests/lib.mjs` (`app.defIll`), `tests/model.mjs` (~28 % des échappés en DÉF ILL, sans tirage de plus), `C18.mjs` adapté. |
| **C21-M** (maquette) | **fait** | Page autonome publiée en privé, hors dépôt. Réponses attendues : Q10. |
| Audit court | **fait** | Aucun problème grave. Écart réel (coordonnées conservées) corrigé. Restent signalés : F39 à F41 ci-dessous. |
| **C21** | bloqué | Attend Q10 (essai de la maquette). |

## Résultats de vérification
- Banc complet après C24 : 385/386 (seul M04·8, empreinte de version, attendu avant la version) ; final : 397/400 (C18 adapté ; C13B·11 et ·13 passent seuls : bruit de charge connu) ; C20, C22, C24 en animation et vrais délais verts ; `simtest`, `kblocal`, `resync`, `collecte`, `check-release` verts.
- Nouvelle règle de banc : un test de comptage de `save()` ignore les nouvelles tentatives différées (`save(true)`).

## Nouveaux constats (de l'audit)
| # | Constat | Gravité | Suite |
|---|---|---|---|
| F39 | La DÉF ILL compte comme attaque réussie dans OFF %, H2H, par période, arrêté/continu et +/- (aucun lancer n'a eu lieu) : le total OFF d'une équipe dépasse la somme des lancers de ses joueurs | choix assumé (Q9), à confirmer à l'usage | — |
| F40 | Onglet Fautes : « Fautes » inclut la DÉF ILL, F % non ; dans le détail d'équipe, « Par type » inclut la DÉF ILL mais pas « Où elles sont commises » ; sous-titre « faute(s) directe(s) » inexact pour elle ; XLSX « Types de fautes » ajoute une ligne « DÉFENSIVE ILLÉGALE » à 0 même sans DÉF ILL ; feuille « Équipes » sans colonne DÉF ILL | faible | à regrouper avec C12 / lisibilité des stats |
| F41 | Segment DÉF ILL petit (15 px tablette, 12 px téléphone) collé à ÉCHAPPÉ (trait de 1 px) : risque de faux appui, récupérable par Annuler ; « ATTRAPÉ » blanc sur le bloc Gris ≈ 3,1:1 | faible, à essayer au doigt | ajuster `.opp-defill` (flex, taille) selon l'essai |
| F42 | Non vérifiés par l'audit : Annuler pendant la fenêtre de 1,4 s d'une reprise C24 ; état suspendu créé par une version antérieure à C24 (réparé seulement si le dernier événement est `lancer` ou `faute_directe`) | faible | — |

## Hors de la vague 3 (inchangé)
Transition de fin de période (reste de F26, F33, F38) · nom d'équipe non échappé dans `sectionMatchFaults` (corrigeable dans le dépôt avec C12 lot 1) · calibration du % de victoire (F7) · C04, C08 · F37 (contrôles de l'audit complet, à faire avant C21).

## Prochaine action
1. L'utilisateur fusionne la PR (le site se déploie ; l'iPad propose « Mise à jour prête »).
2. L'utilisateur essaie la maquette de C21 et répond à Q10 → brief de C21.
3. Audit complet (F37) avant C21 ; regrouper F26 reste + F33 + F38 en un chantier « transition de fin de période ».
