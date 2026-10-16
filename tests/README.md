# Banc d'essai Kin-Ball Stats

## Qui joue quoi

- **Le banc complet se joue en CI** (`.github/workflows/banc.yml`) et son résultat se lit par `node outils/ci-banc.mjs`. Un agent ne le lance pas dans sa session : voir `docs/processus.md`.
- **Pendant le travail : `node tests/rapide.mjs`.** Il lit les fichiers modifiés depuis `origin/main` (et, pour `index.html`, les sections touchées d'après `git diff` et `outils/carte.mjs`), en déduit les suites par la table `tests/rapide.json`, puis les joue sur la tablette (smoke et undo toujours). `--liste` montre le plan ; `--suites C21,C26` choisit ; `--tel` ou `--tous` change de gabarit ; `--fond` lance en arrière-plan (puis `node tests/attendre.mjs`). La table est indicative : un passage rapide vert ne remplace pas la CI.
- **Résumé de la CI** : `node tests/resume-ci.mjs` écrit un résumé Markdown de `resultat.json` ; la CI l'envoie dans l'onglet « Summary » du passage.

## Lancer et attendre (passage local)

```bash
cd <dépôt>; export NODE_PATH="$(npm root -g)" KINBALL_SORTIE=/tmp/kb-sortie
(setsid nohup node tests/run.mjs > /tmp/banc.log 2>&1 < /dev/null &)
node tests/attendre.mjs          # bloque ≤ 9 min ; 0 vert, 1 rouge, 2 encore en cours (relancer la même commande)
```

Passage complet : environ 17 min. Un seul banc à la fois sur la machine.

## Variables essentielles

- `KINBALL_ONLY=smoke,undo,C21` : ces suites seulement. Pendant le travail, utilise ton id.
- `KINBALL_GABARIT=tablette|telephone` : un seul gabarit.
- `KINBALL_PARTS=n` : n processus par gabarit (défaut 1). Avec 2, le passage dure environ 11 min mais n'est pas stable : voir `tests/docs/lib.md`.
- `KINBALL_VERBEUX=1` : affiche aussi les PASS et les sorties des scénarios.
- `KINBALL_CACHE=1` : si un passage complet de même empreinte existe dans `~/.cache/kinball-banc/`, son résultat est affiché et rien n'est lancé ; sinon le banc tourne.
- `KINBALL_CACHE=seul` : comme `1`, mais sans résultat de même empreinte rien ne tourne (code 3). Pour lire sans jamais payer un passage.
- `KINBALL_HTML=<copie>` : tester une autre version, par exemple pour le contrôle négatif.
- `KINBALL_AVANT=<dossier>` : versions d'avant. Sans elles, certaines vérifications sont KNOWN.
- `KINBALL_SORTIE=<dossier>` : mesures, captures et `resultat.json`, jamais dans le dépôt.
- `KINBALL_ANIM=1`, `KINBALL_TIMESCALE=1` : modes animé et vrais délais.
- `KINBALL_BAIL=1` : s'arrêter au premier échec.

## Lire le résultat

- Le journal ne contient que les FAIL, les KNOWN et le résumé ; sa dernière ligne donne le chemin de `resultat.json`. Ne fais pas `cat` du journal ; lis `node tests/attendre.mjs`, ou `resultat.json`.
- `resultat.json` contient :
  - `total`, `ok`, `echecs[{nom,message}]`, `known[]` ;
  - `suites{id:{tablette,telephone,verifications}}` (secondes), `gabarits`, `duree_s` ;
  - `empreinte`, `complet`, `code`.
- `verifications.json` contient chaque vérification avec son état et sa durée.
- Les vérifications marquées `{ calme: true }` (mesures de durée réelle) sont jouées à la fin, seules : c'est la « phase au calme ».

## Ajouter un scénario

Crée `tests/scenarios/<id>.mjs`, chargé automatiquement :

```js
import { launch, assert, eq } from '../lib.mjs';
export const gabarits = ['tablette', 'telephone'];   // facultatif
export default async function ({ gabarit, check }) {
  const app = await launch(gabarit);
  try {
    await check(`[${gabarit}] C99 · ma vérification`, async () => {
      await app.startMatch({ format: '9_11' }); await app.initialPossession('Bleu');
      await app.lancer({ target: 'Gris', caught: false });
      eq((await app.state()).scores.Noir, 1, 'point de Noir');
    });
  } finally { await app.close(); }
}
```

Un défaut connu s'écrit `check(nom, fn, { known: '…' })`. Pour les sélecteurs, utilise les appels `onclick` et les identifiants, jamais les textes.

Détail des suites : `tests/docs/lib.md` (lib, modes, variables) et `tests/docs/<id>.md`.
