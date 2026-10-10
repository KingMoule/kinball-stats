# Vague 5 — corrections issues de la revue de code du 2026-10-09

Rôle : codeur (un seul agent, quatre chantiers en série). Dépôt `/home/claude/kinball-stats`, branche `vague-5-revue` (déjà créée depuis `harnais-banc`). Un commit par chantier, message « C2x : <titre> », terminé par les deux lignes :
```
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011fTpMsWcAp2L9qe7bSrMDJ
```
Ne pousse pas, ne fusionne pas.

**Source des constats** : `/home/claude/rapports/revue-code-2026-10-09.md`. Lis seulement les sections des constats de ton chantier. Les scripts de preuve sont dans `/home/claude/rapports/revue-code-preuves/` (`preuveN-*.mjs`) : réutilise-les comme point de départ du contrôle négatif. Les numéros de ligne du rapport datent de `9452a2e` : retrouve les fonctions avec `node outils/carte.mjs`.

**Versions d'avant** (contrôles négatifs) : copie `git show HEAD:index.html` (et les autres fichiers touchés) dans `/home/claude/avant/` avant chaque chantier, sous le nom `kinball.C2x.avant.html`. Passe `KINBALL_AVANT=/home/claude/avant` au banc.

**Banc** : pendant le travail, `KINBALL_ONLY=<id>,smoke,undo` (et les suites que tu touches). **Un seul passage complet, à la fin des quatre chantiers.** Les rapports vont dans `/home/claude/rapports/vague-5-rapport.md`.

Règle générale : aucune règle du jeu ne change ; pas de migration (les anciens matchs, équipes et fichiers restent lisibles) ; tout texte saisi passe par `escapeHtml`, y compris dans les attributs et les `onclick` construits par concaténation.

---

## C25 — Import et sécurité (R5, R4, R3, R22)

1. **R5.** Plus aucune chaîne venant de l'utilisateur ou d'un fichier ne peut s'exécuter. Il s'agit des noms d'équipes, de joueurs et de match, et des identifiants importés (`id`, `teamIds`, ids de joueurs). Fais l'inventaire des `innerHTML` et des `onclick` construits avec des données (le message ATTRAPÉ/ÉCHAPPÉ de `flashMessage` en est un) et protège chacun. Pour les identifiants placés dans un `onclick`, valide-les à l'import avec un motif strict et échappe-les à l'affichage. **Pas de CSP** dans ce chantier : note seulement dans le rapport ce qu'elle demanderait.
2. **R4.** Valide l'import. Un enregistrement mal formé est écarté, avec un compte rendu « N importés, M écartés (raison) ». Il n'entre jamais en base, et l'Historique ne plante plus. Valide au minimum : la forme de `history`, les types de `names`, `scores` et `status`, l'`id`. Les fichiers valides d'aujourd'hui (sauvegarde v1 et v2, archive) s'importent exactement comme avant.
3. **R3.** L'export « JSON — Tout le match, réimportable » doit se réimporter. Soit l'import l'accepte, soit l'export produit le format de sauvegarde. Choisis le plus petit changement qui ne casse pas les fichiers déjà exportés par les utilisateurs, et justifie-le.
4. **R22.** Un match importé sans auteur ne doit pas devenir « le mien » pour la collecte. Le plus simple et le plus sûr : il n'est jamais envoyé. Il reste visible et réimportable.
5. Scénario `tests/scenarios/C25.mjs` (tablette, plus téléphone si l'affichage est en jeu) : noms hostiles (`<img src=x onerror=…>`, `"'><svg onload=…>`, `');alert(1);//`) à chaque écran qui les affiche, sans aucune exécution (compteur posé par le test) ; import d'un fichier mal formé ; aller-retour export JSON vers import ; import sans auteur. Contrôle négatif sur `kinball.C25.avant.html`.

## C26 — Garde-fous du match (R9, R7, R6, R8, R20)

1. **R9.** SUPPRIMER une équipe passe par la même protection que les matchs : une confirmation armée (`armSheet`) avec le nom de l'équipe, puis une suppression logique (`deleted:true`) récupérable depuis l'écran Sauvegarde, comme la corbeille des matchs. Une équipe à la corbeille n'apparaît plus dans les choix ; les matchs passés gardent leurs noms et leur fiche.
2. **R7.** Un match `status !== 'in_progress'` refuse tout geste de saisie : terrain, changements, ↶, FIN PÉRIODE. La feuille « Et maintenant ? » de `finishMatchNow` n'est plus refermable d'un appui à côté.
3. **R6.** ↶ après une fin de période manuelle (`endPeriodByLeader`, `endPeriodManually`) défait **la fin de période seule** et ramène exactement l'état d'avant, sans toucher la dernière action. Piste de la revue : un événement `type:'fin_periode'` avec `before` et `details:{winner}` (ou `null`), annulable comme les autres. Si tu le fais, vérifie que tous les lecteurs de `history` l'ignorent comme ils ignorent `changement` et `alignement` : stats, export, moteur `WP`, `situationOf`, `phaseOf`, +/-, compteurs d'actions. Ajoute-le à l'export Actions comme une ligne d'événement, au même titre qu'un changement. Les fins de période automatiques (seuil) ne changent pas.
4. **R8.** Dans l'éditeur d'équipe, l'identifiant d'un joueur reste attaché à sa ligne, pas à son texte. Renommer un joueur garde son identifiant ; deux homonymes gardent deux identifiants. Ne réécris aucune donnée existante.
5. **R20.** Au lancement d'un match, la même équipe enregistrée ne peut pas occuper deux couleurs : message clair, lancement bloqué.
6. Scénario `tests/scenarios/C26.mjs` et contrôle négatif. Vérifie l'invariant de `fuzz` : le total des points reste pair hors duel, y compris avec une fin de période manuelle annulée.

## C27 — Stockage de l'appareil (R1, R2)

Fichiers : `kblocal.js`, `kbsite.js` (et `index.html` seulement si nécessaire).
1. **R2.** Une connexion IndexedDB fermée par le système (`close`, `versionchange`, erreur `InvalidStateError` ou `TransactionInactiveError` à l'ouverture d'une transaction) est rouverte automatiquement une fois. L'écriture en cours est rejouée, et les réessais de `save()` réussissent ensuite sans recharger l'app.
2. **R1.** Si la base s'ouvre mais que la lecture des matchs échoue, la copie de secours locale reste proposée, et « Récupérer » fonctionne quand la base revient. Un échec de lecture ne doit jamais être pris pour « aucun match en base ».
3. Le banc n'a aucune panne de stockage aujourd'hui. Ajoute une suite (`tests/local/` pour la façade, ou `tests/scenarios/C27.mjs` sous Playwright) qui simule les pannes : connexion fermée, lecture rejetée, transaction refusée. Les preuves `preuve9-lecture-echouee.mjs` et `preuve10-connexion-perdue.mjs` montrent comment.

## C28 — Exports pour l'analyse (R10, R11), décision de l'utilisateur du 2026-10-09

L'utilisateur a choisi « **ajouts sûrs** » et « **Excel en français** ».
1. **Aucune colonne existante n'est renommée, retirée ni déplacée**, sauf deux équipes de même nom (R10) : la seconde colonne prend alors un suffixe qui les distingue (« Laval (2) »), dans l'en-tête comme dans les colonnes d'équipe. L'ordre reste stable.
2. **Colonnes ajoutées, en fin de ligne** dans la feuille Actions (CSV et XLSX) :
   - `ID du match` ;
   - `Date du match` (ISO 8601 avec fuseau, date de création du match) ;
   - `Heure de l'action` (horodatage des **nouveaux** événements, champ `at` en ISO 8601, vide pour les anciens ; pas de migration) ;
   - `Code de faute` (le code stable de `FAULTS`, ou `DÉF ILL`, à côté du libellé existant).

   Ajoute aussi l'ID et la date à la feuille « Match » du XLSX.
3. **CSV** : l'en-tête est échappé comme les données ; une valeur contenant `\r` est mise entre guillemets ; un texte qui commence par `=`, `+`, `-`, `@` (ou par une tabulation) est préfixé d'une apostrophe ; les **nombres décimaux sont écrits avec une virgule** (`0,45`), le séparateur de colonnes reste `;`, et l'encodage reste celui d'aujourd'hui (garde le BOM s'il existe). Le XLSX garde de vrais nombres.
4. `at` ne doit rien changer d'autre : `snapshotBefore`, l'annulation, le moteur `WP` et les comparaisons du banc qui excluent déjà `ts` et `by` doivent aussi exclure `at`. Vérifie C13B, C20, C21 et M04 à M11.
5. Scénario `tests/scenarios/C28.mjs` : homonymes, `;` et `"` dans un nom, formule, `\r`, virgule décimale, présence et place des quatre colonnes, ancien match sans `at`, et en-tête d'un match ordinaire **identique** à celui de la version d'avant, sauf les colonnes ajoutées en fin de ligne.

---

## Fin
- `node outils/check-release.mjs --ecrire`, puis la même commande sans option, et un commit « Version du site ».
- Un passage complet du banc (`KINBALL_AVANT=/home/claude/avant`), puis `node sim/simtest.mjs` et `tests/local/*.test.mjs`.
- Mets à jour la doc touchée (`docs/donnees.md`, `docs/stats-et-export.md`, `docs/saisie.md`, `tests/docs/<id>.md`) dans le même commit que le code.
- Rapport : `/home/claude/rapports/vague-5-rapport.md`. Réponse finale de 30 lignes au plus.
