# Audit de la vague 5 (C25 à C28), branche `vague-5-revue`

Audité : `f0f4577` (HEAD), commits `harnais-banc..HEAD`. Rien n'a été modifié dans le dépôt. Scripts jetables : `/home/claude/audit-scripts/`. Sorties : `/home/claude/audit-sortie/`, `/home/claude/audit-neg/`, captures dans `/home/claude/audit-sortie/captures/`.

## Verdict : CONFORME AVEC RÉSERVES

Aucun défaut bloquant pour les données. Tous les critères du brief sont tenus. Un défaut moyen (export brut CSV, coordonnées négatives), un défaut faible (suffixe d'homonymes qui entre en collision) et quelques points de défense en profondeur ou de risque non prouvable sont listés plus bas.

## 1. Banc et contrôles négatifs

| Vérification | Résultat |
|---|---|
| `KINBALL_CACHE=1 node tests/run.mjs` sur `f0f4577` | L'empreinte avait bougé (`76c7ab10…`) : passage complet rejoué. **508/508, 0 échec, 8 KNOWN en 1 237 s.** Les 8 KNOWN sont ceux annoncés (C13B·12, C19·7, C23·15, C23·16, tablette et téléphone, copies d'avant absentes). |
| `node tests/local/*.test.mjs` | collecte 18/18, kblocal 63/63, resync 11/11. |
| `node sim/simtest.mjs` | tout passe. |
| `node outils/check-release.mjs` | OK (version 2026-10-09.1). |
| Contrôle négatif (`KINBALL_HTML=/home/claude/avant-neg/neg-C2x/index.html`, tablette). Les index.html d'avant ont été comparés par sha256 aux versions des commits d'avant : identiques. | C25 : 6 échecs sur 7 (C25·1, 2, 3, 4, 6, 7 ; C25·5 est la garde de non-régression, elle passe). C26 : 7/7 échouent. C27 : 3/3 échouent. C28 : 11/11 échouent. Les échecs portent bien sur les vérifications annoncées. |
| Modes animés | Voir section 9. |

## 2. R6 · événement `fin_periode` (priorité 1)

Tous les scripts jouent avec de vrais appuis (glisser et tap aux coordonnées du terrain, boutons réels), état lu dans `S`.

| Lecteur ou exigence | Preuve | Verdict |
|---|---|---|
| Stats d'un match (toutes les sections : vue d'ensemble, par période, H2H, zones, fautes, joueurs, heat), H2H filtré par phase (début, pré-duel, duel), fautes, zones de fautes, situations arrêtée/continue, +/- et stats des joueurs, `wpCountK` | `r6-lecteurs.mjs` (libre3 et 9_11, 2 `fin_periode`) : 20 lecteurs comparés avec et sans l'événement dans l'historique, sortie identique pour chacun. `r6-fuzz.mjs` rejoue la comparaison tous les 15 pas. | tenu |
| Cumul d'une équipe, classement | `r6-cumul.mjs` : `computeTeamAggregate` ×3 équipes, `computeLeaderboard` et HTML des 6 sections « équipe » identiques avec et sans événement. | tenu |
| `situationOf` | Lecture du code : `fin_periode` est traité comme un départ arrêté (même résultat que « période différente »). Comparaison des lecteurs ci-dessus. | tenu |
| Barres de probabilité : `KBSim.params`, `KBSim.run` (graine fixe), rejeu | Comparaison avec/sans (`kbparams`, `kbrun`). Test en direct `wp.mjs` (11_13, Worker) : barres après fin + ↶ identiques à celles d'avant la fin, y compris « fin, action, ↶, ↶ ». Remarque : à 10 événements (k=10), les barres d'avant la fin sont celles calculées à k=9 (`WP_EVERY`) ; l'écart après ↶ est le comportement existant, pas un défaut. | tenu |
| Export Actions | Ligne « Fin de période », période, possession, `Résultat` = « Période gagnée par X » ou « Période sans vainqueur » ; autres lignes identiques (sauf N°) ; même en-tête. | tenu |
| Export brut | Ligne `event_type=fin_periode`. Colonne `winner` ajoutée **en dernière position** (les colonnes d'avant gardent leur ordre). Absente si le match n'a pas de fin manuelle. | tenu |
| Collecte | `r6-collecte.mjs` (faux serveur, Logique.gs réelle) : l'événement part, aucun `at`, le serveur répond `recu`, aucun nom de joueur. | tenu |
| Reprise d'un match | `r6-ancien.mjs` : base contient la fin, rechargement, `resumeMatch()` : état identique à celui d'avant rechargement ; ↶ défait la fin seule. | tenu |
| Ancien match sans l'événement | Match joué **dans la version d'avant** (harnais-banc), importé (sauvegarde v1) dans la version finale, repris : tous les lecteurs sans erreur, `Heure de l'action` vide, fin posée dessus puis ↶ exact. | tenu |
| ↶ défait la fin seule, exactement | `r6-fuzz.mjs` : après chaque « fin manuelle puis ↶ » (après le message ou pendant la fenêtre de 1,4 s), `diff` profond de `S` avec l'état d'avant : aucune différence. Après chaque ↶ ordinaire : état = état d'avant l'événement. Dépilage complet final : état initial retrouvé (période 1, scores 0, victoires 0). | tenu |
| Invariant du total pair hors duel | Contrôlé à chaque pas, 3 équipes. | tenu |

Fuzz mêlant fins manuelles (menu TERMINER et FIN PÉRIODE), ↶ (avant, pendant, après le message), seuils automatiques et éliminations : tablette, formats 9_11 (graines 1, 2, 5, 11, 12, 41), 11_13 (3), libre3 (4, 13), duel11 (31, 34), duelL (32), duel13 (33) ; téléphone : libre3 (21), 9_11 (22). Une partie de 160 pas atteint la période 6 avec 1 fin manuelle : au moins 4 fins automatiques exercées. Aucune violation. Les rares échecs de mes premiers essais venaient de mon script (glissé trop court, couleur exclue en duel) et ont été corrigés dans le script.

Scénarios adverses R6 (`adv.mjs`, vrais délais) :
- Double appui sur le choix du vainqueur : un seul événement, période 2.
- Double appui sur FIN PÉRIODE : une seule fin (le second appui referme la feuille d'égalité, sans effet de données, comportement de feuille antérieur).
- Deux ↶ d'affilée dans la fenêtre de 1,4 s : fin défaite, puis dernière action défaite, aucune incohérence.
- Rechargement en pleine fin de période (250 ms après le choix) : la base garde l'état d'avant la fin (aucune moitié de fin de période), pas de boîte de secours.
- Rechargement en pleine saisie (feuille ouverte après glisser) : reprise sans événement fantôme.

Point résiduel (faible, voir E5) : `fin_periode` est ajouté à `S.history` à l'appui, mais l'enregistrement part à la fin du message. Un `save()` de réessai qui tomberait dans la fenêtre (base déjà en erreur) écrirait un état « victoire comptée, période non avancée ». Aucune récupération automatique (F26 ne lit que lancer et faute directe), mais ↶ le ramène exactement. Même nature de risque qu'avant C26.

## 3. R7 · match terminé

`r7.mjs`, tablette et téléphone, modes feuille et radial, formats libre3 et 9_11. Match terminé par l'interface (TERMINER, confirmation, « Et maintenant ? »).
- Appui à côté et Échap : la feuille « Et maintenant ? » reste ouverte. Tenu.
- Retour sur le terrain par VOIR LES STATS puis retour : glisser, tap, appui long, toucher : aucune feuille de saisie ; ↶ désactivé (et `undo()`, `undoTap()` sans effet) ; `openLineupSheet`, `applySub`, `commitLineupDefinition`, `endPeriodByLeader`, `endPeriodManually`, `openFinishMenu`, `pickResult`, `pickFault`, `applyReprise`, `chooseInitialPossession`, `chooseDuelStart` appelés directement : `S` et l'enregistrement en base **inchangés**.
- Rechargement : le match terminé n'est pas repris et reste intact.
- Verdict : tenu, avec une réserve de défense en profondeur (E3 : `setAdvancedPlayer` n'est pas gardée, non atteignable par l'interface).

## 4. R5 et R4 · injection et import

- `preuve2-xss.mjs` rejoué sur l'état final : A (nom d'équipe piégé, message éclair) **0 exécution** (1 sur la version d'avant), B et C (identifiants piégés importés) 0 ; sur la version d'avant avec ses fichiers voisins (`avant-neg/neg-C25`), A, B, C = 1, 1, 1. Les équipes à identifiant piégé sont écartées à l'import (compte rendu), donc absentes des choix.
- `preuve3-import-invalide.mjs` : « N importés, M écartés (raison) » ; Historique, Classement, fiche d'équipe et accueil s'affichent pour chaque forme mal formée.
- Noms hostiles de mon cru (`xss.mjs`, `xss2.mjs`, `xss3.mjs`) : 8 chaînes (`<img onerror>`, `"'><svg onload>`, `');…//`, `\');…//`, `</script><script>`, attribut cassé avec `onmouseover`/`autofocus`, gabarit `${…}`, entités et `<b>`). Saisie par les vrais champs (éditeur d'équipe, nom libre, nom de match) puis import de matchs dont **tous** les textes sont hostiles (noms, `matchName`, joueurs des rosters, `format.label`, noms dans les événements, `by`, `deletedBy`). Écrans parcourus, tablette et téléphone : accueil, reprise, Mes équipes, éditeur, feuille de corbeille d'équipe, classement, sélecteur de fiche, Nouveau match (+ alignements), terrain, feuille de résultat, message éclair, feuille de joueur, détail avancé, changements, menu TERMINER, égalité, récapitulatif de fin, « Et maintenant ? », menu d'export, toutes les sections de stats (en direct, en archive, fiches d'équipe), détails de fautes et de zones, Historique (filtré ou non), Sauvegarde et corbeille (matchs et équipes). Détecteur validé par un contrôle positif (injection volontaire détectée). **0 exécution, 0 élément injecté, aucun nom dans un `onclick`.** Les `onclick` de la fiche d'équipe qui portent une clé `libre:<nom>` contiennent le nom sous forme `\uXXXX` ; un clic réel rend le nom intact, sans exécution.
- Identifiants hostiles déjà en base (contournant l'import) (`xss-ids.mjs`) : environ 130 passages « clic sur tous les `onclick` » sur 20 écrans : 0 exécution sur la version finale, **53 sur la version d'avant**.
- Sauvegardes v1, v2 et archive (`r4-compat.mjs`) : fichiers produits par la version d'avant (2 équipes, 3 matchs dont un en cours, un en corbeille, un « ancien format » sans `format`, `activeTeams`, `rosters`, `authorId`, `createdAt`), importés dans la version d'avant et dans la finale : **même compte rendu et mêmes équipes/matchs en base**, v2 restaure la même identité.
- R3 (`r3.mjs`) : « JSON — Tout le match » (produit par la version d'avant et par la finale) s'importe ; second import « ignoré, déjà à jour » ; fichiers vide, tronqué, `null`, nombre, tableau, objet vide : refus avec message, sans erreur de console.
- R22 : `r6-collecte.mjs` : match importé sans auteur (`authorId` absent), `null` ou vide : seul le match avec auteur part ; `''` est écarté à l'import (« auteur invalide »).
- Verdict : tenu.

## 5. C28 · exports

Preuves : `c28.mjs` (même partie jouée dans la version d'avant et la finale, fichiers réellement téléchargés), `c28b.mjs`, `csvunit.mjs`.
- En-tête Actions : les 32 colonnes d'avant identiques et dans le même ordre, 4 ajoutées en fin dans l'ordre `ID du match`, `Date du match`, `Heure de l'action`, `Code de faute`. Valeurs d'avant identiques, ligne à ligne (virgule décimale mise à part). XLSX : même en-tête que le CSV, vrais nombres (0.5 numérique), feuille Match terminée par ID et date, mêmes feuilles que la version d'avant, feuilles Équipes, Joueurs, Arrêté-continu, Reprises, Zones, H2H, Types de fautes, Données brutes **identiques**.
- BOM UTF-8 présent des deux côtés, séparateur `;`, fins de ligne CRLF. Aucun nombre à point dans le CSV Actions ; `0,5`, `-0,042` pour les nombres (non préfixés).
- `at` : ISO 8601 UTC avec `Z`, croissant, sur chaque événement nouveau, vide pour les anciens (`r6-ancien.mjs`), jamais dans `before` ni `details`, jamais dans l'envoi à la collecte. C13B, C20, C21, C23, C24 passent dans le banc complet.
- `csvEscape` : `=1+1`, `+1`, `-a`, `@x`, tabulation, `\r` en tête : apostrophe. `;`, `"`, `\r`, `\n` internes : guillemets, relus à l'identique. En-tête échappé comme les données. Nombre `-1` non préfixé, texte `"-1"` préfixé.
- Homonymes : « Laval », « Laval (2) », « Laval (3) » dans l'en-tête, les colonnes de score et de terrain, les cellules d'équipe et les autres feuilles ; aucune colonne en double. Noms `A;B`, `C"D`, `=1+1`, `+cmd`, `-2+3`, `@SUM(A1)` : 36 colonnes sur chaque ligne à la relecture.
- Vieux match (joué avec la version d'avant) : se charge, s'exporte, sans erreur.
- Verdict : tenu, avec **E1** (moyen) et **E2** (faible) ci-dessous.

## 6. C27 · stockage

Lecture du code (`kblocal.js`, `index.html`) et preuves (`c27-morte.mjs`, `c27-secours.mjs`, `c27-tempete.mjs`).
- R2, connexion morte sans événement `close` (patch de `IDBDatabase.transaction`) : l'action suivante est enregistrée, **une seule écriture du match, une seule réouverture**, état de sauvegarde `ok`, actions suivantes sans nouvelle réouverture ; rechargement : la base contient tous les événements. Panne durable (les nouvelles connexions meurent aussi) : état « error », copie de secours locale écrite, réouvertures espacées par les délais de l'app.
- Ordre des rejeux : deux opérations qui échouent sur la même connexion s'enregistrent sur la même ouverture, dans l'ordre d'émission. Une opération déjà validée n'est jamais rejouée (`done`). Les erreurs hors `InvalidStateError`, `TransactionInactiveError`, `UnknownError` (quota, par exemple) ne sont pas rejouées.
- R1, lecture en panne au démarrage (`c27-secours.mjs`) : match de 5 événements en base, copie de secours plus ancienne (3 événements) en local. Pendant la panne : bandeau rouge, copie proposée avec avertissement, « Récupérer » refusé avec feuille explicative (capture `c27_recuperer_refuse.png`), `S` inchangé. Retour du stockage : bandeau retiré, copie **plus proposée**, un appel direct à `restoreLocalBackup` est refusé par `copieRefusee` (« plus récente que cette copie »), la base garde 5 événements : **aucun écrasement**.
- Tempête de relectures (`c27-tempete.mjs`, minuteries compressées ×50, 8 fenêtres de 5 s) : le nombre de lectures refusées reste stable (48 à 66 par fenêtre), sans croissance ; une relecture « items » tourne environ 1,3 fois plus souvent que les autres (deux sources la relancent) : borné, pas une boucle (E4). Au retour du stockage, `lecturesEchouees` se vide et le bandeau disparaît.
- Verdict : tenu.

## 7. R8, R9, R20

`r8r9r20.mjs` (tablette et téléphone, vrais délais pour l'armement).
- R8 : enregistrer sans changer garde les identifiants ; renommer un homonyme garde son identifiant ; deux homonymes gardent deux identifiants ; retrait puis ajout : ids conservés, nouvel id distinct ; ligne vidée retire le joueur ; équipe aux identifiants déjà dupliqués : pas réécrite. Tenu.
- R9 : feuille armée avec le nom (bouton désarmé au départ, un appui immédiat ne supprime rien), `deleted:true`, absente des choix, visible dans la corbeille de Sauvegarde, « Récupérer » rend l'équipe et ses 4 joueurs ; un import d'une ancienne sauvegarde ne ressuscite pas une équipe à la corbeille (« déjà à jour »). Capture téléphone `r9_feuille_telephone.png`. Tenu.
- R20 : même équipe sur 3 couleurs : message nommant l'équipe et les couleurs, lancement bloqué ; équipes distinctes : lancement ; duel : la couleur exclue qui répète l'équipe ne bloque pas. Tenu.

## 8. Téléphone 320 px et captures

`p320.mjs` (viewport 320×640) : pas de débordement horizontal sur terrain, message de fin de période, menu TERMINER, « Et maintenant ? », feuille de corbeille d'équipe, message R20, accueil avec bandeau de panne. Seul écart : `.brand-row` de l'accueil dépasse (346 px), **déjà présent sur la version d'avant**, sans scroll horizontal (`scrollWidth` = 320). Captures regardées : `p320_panne.png`, `p320_r20.png`, `p320_et_maintenant.png`, `c27_panne_accueil.png` (tablette), `r9_feuille_telephone.png` : textes complets, boutons atteignables.

## 9. Modes animés

ANIM_PLACEHOLDER

## 10. Invariants de `CLAUDE.md` sur le diff (`harnais-banc..HEAD`)

- Navigation : aucune bascule d'écran nouvelle hors `navTo`/`navBack`/`navHome`/`showOnly`. Les seuls `style.display` ajoutés servent à un bandeau (`dbUnavailable`) et à la section Corbeille, comme avant.
- `S` : aucun champ d'interface ajouté ; un événement `fin_periode` et le champ `at` d'événement sont de l'état de jeu. `pendingPeriodWinner` et `periodEndTimer` restent hors de `S`.
- `FAULTS` inchangé ; l'export lit le code stable (`Code de faute`).
- Aucun point sans événement : la victoire de période est comptée avec l'événement `fin_periode` ; les scores ne bougent que dans `finishPeriod` après le message.
- Suppressions : `deleted:true` (équipes comme matchs) ; « Effacer pour de bon » est explicite et armé pour les équipes.
- Pas de migration : champs lus avec valeur par défaut, vérifié sur un match de l'ancienne version.
- `escapeHtml` : voir section 4 (inventaire dynamique et fuzz de noms/ids).
- CSS : aucune règle ajoutée.
- Bouton d'annulation dans une feuille : les nouvelles feuilles (corbeille d'équipe, copie non récupérée) ne sont pas des saisies d'événement ; elles ferment par `closeSheet()`.
- Publication : `check-release` passe, `sw.js` et `kbsite.js` à la version 2026-10-09.1.

## 11. Écarts classés par gravité

**Bloquants : aucun.**

**Moyen**
- **E1. Export « CSV — données brutes » : une liste de coordonnées qui commence par un nombre négatif reçoit une apostrophe.** Preuve : `c28.mjs`, appui réel relâché à gauche du terrain (`fieldPoint` ne borne pas `nx`, la capture du pointeur laisse le relâchement hors du terrain). Cellule obtenue `'-0,042|0,4` (la version d'avant écrivait `-0.042|0.4`). Cause : `csvEscape` applique la règle des formules à la chaîne « liste de nombres » des colonnes `listes`. Un analyste qui sépare sur `|` lit `'-0,042`. Le CSV Actions n'est pas touché (colonnes numériques), ni le XLSX. Correctif possible : ne pas préfixer les cellules des colonnes `listes`, ou ne préfixer que ce qui n'est pas un nombre.

**Faible**
- **E2. Suffixe d'homonymes en collision.** « Laval », « Laval », « Laval (2) » donnent « Laval », « Laval (2) », « Laval (2) » : en-têtes `Score Laval (2) avant` et `Sur le terrain — Laval (2)` en double, feuille Équipes ambiguë. Même chose pour « Laval (2) », « Laval », « Laval ». Cas rare (preuve `c28b.mjs`). Correctif possible : boucler tant que le nom suffixé existe déjà.
- **E3. `setAdvancedPlayer` (et `openAdvancedDetailSheet`) ne contrôlent pas `S.status`.** Un appel direct modifie `attacker_player_id` dans l'historique d'un match terminé (démontré par appel de fonction). Non atteignable par l'interface : la feuille n'existe que juste après une saisie et le fond de feuille masque TERMINER. À garder en défense en profondeur.

**Information**
- **E4.** Relecture de lecture en panne : la clé `items:<auteur>` est relancée par deux chaînes (son propre minuteur et le gestionnaire d'erreur de `matches`), soit environ 1,3 fois plus de lectures que les autres clés ; borné et sans croissance sur 8 fenêtres, mais ce n'est pas « une relecture par clé ».
- **E5.** Fenêtre de 1,4 s d'une fin de période : voir section 2 (état intermédiaire possible seulement si un `save()` de réessai y tombe ; ↶ récupère exactement).
- **E6.** Risque de rejet à l'import non prouvable : `status` hors `in_progress`/`completed`, identifiants hors `[A-Za-z0-9_-]{1,80}`. Les sauvegardes v1, v2, archive et l'ancien match que j'ai produits passent. Des fichiers très anciens (époque artifact) à identifiants d'une autre forme seraient écartés et comptés, jamais perdus du fichier source.
- **E7.** Choix assumés : dates et heures en UTC `Z` (le brief disait « avec fuseau ») ; apostrophe typographique dans `Heure de l'action` comme `Type d'action` ; `kbcollect.js` retire `at` de l'envoi ; un match local sans `authorId` n'est jamais partagé (y compris un match à soi, ancien et sans auteur, s'il en existe). La colonne « Actions » de l'Historique compte `fin_periode` comme elle compte déjà `changement`.
- **E8.** La carte « Nouvel appareil, ou données effacées ? » (kbsite) dépend de l'état de la base à vide, pas de `lecturesEchouees` ; non constatée pendant mes pannes simulées (la base contenait déjà des données).

## 12. Ce qui n'a pas pu être prouvé

- Aucun essai sur un vrai iPad (perte de connexion IndexedDB après veille, vraie double-tape, glisser hors du terrain au doigt). Les pannes sont simulées dans Chromium.
- Excel lui-même : décimales à virgule et apostrophe de tête non relues dans Excel. Le XLSX a été relu avec SheetJS sous Node.
- Les 8 KNOWN du banc dépendent de copies d'avant absentes de `/home/claude/avant` (C13B, C19, C23). Les comparaisons correspondantes ont été refaites par moi autrement : C28·1 contre `kinball.C28.avant.html`, et `c28.mjs`.
- La limite 30 s de relecture, les délais de 5 et 15 s : minuteries compressées dans ma preuve, pas jouées en temps réel.

## 13. Scripts de preuve (relançables, `NODE_PATH=/home/claude/.npm-global/lib/node_modules`)

`/home/claude/audit-scripts/` : `r6-lecteurs.mjs`, `r6-fuzz.mjs <gabarit> <format> <graine> <pas> <n|r> <low|x>`, `r6-ancien.mjs`, `r6-cumul.mjs`, `r6-collecte.mjs`, `r7.mjs <gabarit> <feuille|radiale>`, `xss.mjs`, `xss2.mjs`, `xss3.mjs`, `xss-ids.mjs`, `poscontrol.mjs`, `r4-compat.mjs`, `r3.mjs`, `c28.mjs`, `c28b.mjs`, `csvunit.mjs`, `c27-morte.mjs`, `c27-secours.mjs`, `c27-tempete.mjs`, `r8r9r20.mjs`, `r9-import.mjs`, `p320.mjs`, `wp.mjs`, `adv.mjs`. Aide commune : `driver.mjs`.
