# Banc d'essai Kin-Ball Stats

Commande : `cd <dépôt> && NODE_PATH=<dossier de playwright> node tests/run.mjs` (environ 7-8 minutes depuis C22, qui garde l'animation de la feuille ; tablette et téléphone en parallèle ; code de sortie 1 au moindre échec).

Variables : `KINBALL_SORTIE=<dossier>` (mesures et captures, défaut /home/claude/work/audit, jamais dans le dépôt), `KINBALL_AVANT=<dossier>` (sauvegardes « d'avant » des chantiers, défaut /home/claude/work/backups ; un fichier absent donne KNOWN « sauvegarde d'avant absente »), `KINBALL_HTML=<fichier>` (tester une copie ; défaut : index.html du dépôt), `KINBALL_BAIL=1` (stop au premier échec), `KINBALL_ONLY=smoke,undo,fuzz,<id>` (suites), `KINBALL_GABARIT=tablette|telephone`, `KINBALL_TIMESCALE=1` (vrais délais de l'app), `KINBALL_ANIM=1` (garder l'animation de la feuille).

Contenu : `lib.mjs` (Chromium, gestes réels sur `#field` et `#sheet`, `state()`, `settle()`), `model.mjs` (modèle indépendant du pointage), `smoke.mjs`, `undo.mjs`, `fuzz.mjs`.

Ajouter un scénario par chantier : créer `tests/scenarios/<id>.mjs`, chargé automatiquement :

```js
import { launch, assert, eq } from '../lib.mjs';
export const gabarits = ['tablette', 'telephone'];          // facultatif
export default async function ({ gabarit, check }) {
  const app = await launch(gabarit);
  try {
    await check(`[${gabarit}] C14 · ma vérification`, async () => {
      await app.startMatch({ format: '9_11' });
      await app.initialPossession('Bleu');
      await app.lancer({ from: [.2, .3], to: [.7, .6], target: 'Gris', caught: false });
      eq((await app.state()).scores.Noir, 1, 'point de Noir');
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
  } finally { await app.close(); }
}
```

Un défaut connu de l'app : `check(nom, fn, { known: 'description' })` (affiché KNOWN, ne bloque pas). Sélecteurs : privilégier les appels d'`onclick` et les identifiants (`pickResult('Gris',true)`, `#undoBtn`), jamais les textes de boutons.

## Animation de la feuille et trois modes de passage (C22B)

Par défaut le banc coupe l'animation de `#sheet` (feuille de style `transition:none`) et divise par 20 les minuteries de 400 à 1 600 ms. Trois modes, tous à 0 échec :

| Commande | Durée indicative |
|---|---|
| `node tests/run.mjs` | ~7,5 min (459 s mesurés, C22 comprise ; ~90 s sans C22 : `KINBALL_ONLY=smoke,undo,fuzz,C14,C15,C16,C17,C18`) |
| `KINBALL_ANIM=1 node tests/run.mjs` (animation de 0,22 s gardée) | ~10,5 min (630 s mesurés) |
| `KINBALL_ANIM=1 KINBALL_TIMESCALE=1 node tests/run.mjs` (animation + vrais délais) | ~18 min (1 064 s mesurés) |

Un scénario peut aussi garder l'animation seul : `launch(gabarit, { anim: true })` (C22 le fait : les appuis fantômes se produisent pendant la descente de 220 ms).

`clickSheet(call)` clique comme une personne, **sans `force`** : il attend que `#sheet` porte `open`, ne porte pas `closing`, n'ait plus d'animation (`getAnimations().length === 0`), que le bouton existe, et que l'appui ne soit pas un « double appui » au sens de l'app (`sheetLastTap`, `SHEET_DOUBLE_MS`, `SHEET_DOUBLE_PX`) ; Playwright vérifie ensuite que le bouton reçoit bien l'appui. `undo()` attend la fin du réarmement de ↶ (`undoBlockedUntil`) puis clique sans `force` ; `undoInSheet()` clique le bouton `undo()` placé dans la feuille (feuille du duel) ; `settle()` attend aussi la fin de la classe `closing`. Les variables de l'app ajoutées par C22B sont lues sous garde `typeof` : le banc tourne encore sur une ancienne copie (`KINBALL_HTML=backups/kinball.C22B.avant.html`).

Scénario `C22.mjs` : de vrais appuis aux coordonnées (`page.mouse.click`, `page.touchscreen.tap` sur le téléphone), jamais `locator.click()` ni `force` pour la mesure ; le Δ réel entre deux appuis est lu sur les `pointerdown` et donné dans le message d'échec. Adaptation de M04·6 et M04·11 : la carte de premier lancement (base vide) est ignorée dans leurs listes de cartes (les autres vérifications intactes). Contrôle négatif : `KINBALL_HTML=backups/kinball.C22B.avant.html KINBALL_ONLY=C22 node tests/run.mjs` doit échouer sur les vérifications 1 à 8 et 10.

## C23 : vrais délais, fenêtre de fin de période, seuil des barres
`launch(gabarit, { timescale: 1 })` donne les vrais délais à UNE page (défaut : la valeur de `KINBALL_TIMESCALE`, 20 si absente) ; `{ timescale: 1, anim: true }` y ajoute l'animation de la feuille. `scenarios/C23.mjs` agit dans la fenêtre de 1,4 s de la fin de période avec de vrais appuis sur ↶ et lit `periodEndTimer` / `WP.minK` sous garde `typeof` : contrôle négatif `KINBALL_HTML=backups/kinball.C23.avant.html KINBALL_ONLY=C23 node tests/run.mjs` doit échouer sur 1, 2, 3, 4, 6, 7, 9 à 12 (et 15 sur téléphone).
`C23_ONLY=<regex sur le nom>` ne lance que certaines vérifications de C23 ; `scenarios/C13B.mjs` pose `WP.minK = 1` dans `open()` (ses tests supposent un premier calcul au 3e événement).

## C19 : changements par glisser-déposer
`scenarios/C19.mjs` (11 vérifications par gabarit, 13 sur téléphone) : glisser à la souris (`page.mouse`), glisser tactile réel par CDP (`Input.dispatchTouchEvent`, téléphone), `pointercancel` simulé, verrou portrait (viewport 844×390 + `window.orientation`). Les jetons de la feuille sont des `<button class="sub-tok" data-pid data-zone="on|off">` ; le bouton d'annulation de la feuille s'appelle par `undoLineupChange()`. La comparaison d'export lit la sauvegarde `backups/kinball.C19.avant.html`.

## M04 : service worker, mise à jour sur accord, version, installation
`scenarios/M04.mjs` (12 vérifications sur tablette, 4 sur téléphone). Les pages sont servies en `http://127.0.0.1:<port>/` par `tests/serveur.mjs` (`serveur(racine, { cache })`, Cache-Control de Pages par défaut ; `srv.requetes` consigne les chemins demandés ; M03·10 l'utilise aussi). La mise à jour se joue sur une COPIE du site (`copierSite()`) : v2 = un fichier touché (balise `<meta name="kb-test" content="v2">` dans index.html) puis `node outils/check-release.mjs --ecrire --racine <copie>`. Mécanique (premier chargement, hors-ligne via `context.setOffline`, mise à jour, `hasUnsavedWork` forcé, limite d'une heure avec `Date.now` décalé et `ServiceWorkerRegistration.update` compté, check-release, grep de sw.js) : tablette seule ; cartes (installation iOS simulée par `navigator.standalone`, `beforeinstallprompt` simulé, mode installé, cartes à l'écran) et file:// : les deux gabarits. Captures dans `captures/M04/`.
Avant de committer un changement de fichier du site (index.html, kbsite.js, kblocal.js, polices, icônes, manifest, vendor) : `node outils/check-release.mjs --ecrire` (nouvelle version et empreinte dans kbsite.js et sw.js), puis `node outils/check-release.mjs` doit passer. Un fichier ajouté au site doit aussi être ajouté à la liste de précache de sw.js (entre les marqueurs PRECACHE) : sinon « oublié : <nom> ».

## M05 : feuille de partage (fichiers sur iPad)
`scenarios/M05.mjs` (7 vérifications sur téléphone, 2 sur tablette) : `navigator.share` / `canShare` sont des doublures posées par `context.addInitScript` puis rechargement (`window.__mode` = `'ok'`, un nom d'erreur, ou une liste consommée appel par appel ; `window.__canShare` ; les fichiers reçus sont gardés dans `window.__fichiers` et relus par `arrayBuffer()`). Instruments d'essai posés dans la page après coup : `saveFile` et `flashMessage` sont enveloppés (`window.__sf`, `window.__flash`) sans toucher à index.html ; l'événement `kb:fichier` s'accumule dans `window.__evts`. Téléphone (`hasTouch` + `isMobile`, donc `maxTouchPoints > 0` et `(pointer: coarse)`) : les 6 appelants (CSV, CSV brut, XLSX, JSON du match, sauvegarde complète, archivage appelé directement car sa carte est masquée en mode local : un match terminé daté de 200 jours est écrit par `writeMatchDoc`), les quatre issues, le second geste (feuille `#kbFichierPret`, boutons `KBSite.fichierPartager()` / `KBSite.fichierAnnuler()`), captures en portrait et appareil couché (verrou portrait, `window.orientation` ±90). Tablette sans tactile = ordinateur (critère 5) ; la même tablette avec `navigator.standalone` simulé (iPad installé) sert à la capture. Suite autonome de la façade : groupes `partage` (contexte tactile) et `partage-ordi` de `tests/local/kblocal.test.mjs` (identifiants PT1 à PT10 ; nom nettoyé, type, issues, second geste, adresse libérée). Captures dans `captures/M05/`.

## M06 : sauvegarde v2, import sans écrasement, premier lancement, rappel
`scenarios/M06.mjs` (14 vérifications par gabarit). Deux navigateurs séparés : A (données : 2 équipes, 3 matchs terminés dont 2 copies par `writeMatchDoc`, 1 copie à la corbeille, 1 match réel en cours) et B (vide, puis réutilisé pour les imports). Les écritures de la façade sont comptées en enveloppant `IDBObjectStore.prototype.put` sur le magasin « docs » (`window.__puts`, via `compterEcritures(p)`) : indépendant de l'app. Fichiers fabriqués par le test (plus récent sur un objet, match chargé dans S, corbeille croisée, autre identité, version 1 sans champ `format`, archive `kinball_archive`, JSON invalide) écrits dans `os.tmpdir()` et supprimés en fin de scénario. Les cartes de l'accueil (`#kbCarteLancement`, `#kbCarteRappel`) ne se recalculent qu'à l'ENTRÉE sur l'accueil : le test passe par `allerRetour(p)` (écran Sauvegarde, 60 ms, accueil) car deux changements d'écran dans la même tâche sont vus comme un seul. Refus d'une sauvegarde : `KBLocal.downloads.save` remplacé par un rejet `{code:'declined'}`. Règle des 14 jours : `KBLocal.meta.set('site.derniereSauvegarde', {…, at: <reculé>})` puis rechargement. Captures dans `captures/M06/`. Adaptation de M04·6 et M04·11 : la carte de premier lancement (base vide) est ignorée dans leurs listes de cartes (les autres vérifications intactes). Contrôle négatif : `KINBALL_HTML=<index.html d'avant M06 copié à la racine du dépôt> KINBALL_ONLY=M06` échoue sur 8 vérifications (tablette).
