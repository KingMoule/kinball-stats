/* C14 : fondu du score de l'équipe éliminée (.tscore.out → opacité 0,35). */
import { launch, assert, eq } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];

/* Opacité calculée du .tscore de chaque équipe, par nom d'équipe. */
const opac = app => app.ev(() => {
  const r = {};
  document.querySelectorAll('.team-chip').forEach(c => {
    r[c.querySelector('.tname').textContent.trim().replace(/[^A-Za-zÀ-ÿ]/g, '')] = +getComputedStyle(c.querySelector('.tscore')).opacity;
  });
  return { r, elim: S.eliminated, duel: S.duelActive, attente: !!S.awaitingDuelStart, periode: S.period };
});

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] C14`;
  const app = await launch(gabarit);
  try {
    await check(`${P} · 9/11 : fondu seulement pendant le choix « qui reprend », levé par Annuler et par la fin de période`, async () => {
      await app.startMatch({ format: '9_11', names: { Bleu: 'Bleu', Gris: 'Gris', Noir: 'Noir' } });
      await app.initialPossession('Noir');
      const n0 = await opac(app);
      assert(Object.values(n0.r).every(v => v === 1), 'avant : tous les scores à 1 ' + JSON.stringify(n0.r));
      let g = 0;
      while (!(await app.awaitingDuel()) && g++ < 40) {
        const o = await opac(app);
        assert(Object.values(o.r).every(v => v === 1), 'fondu prématuré ' + JSON.stringify(o.r));
        await app.faute({ code: 'APPEL' });
      }
      assert(await app.awaitingDuel(), 'aucune élimination');
      const choix = await opac(app);
      assert(choix.elim, 'équipe éliminée connue');
      const nomE = await app.ev(e => S.names[e], choix.elim);
      const nom = Object.keys(choix.r).find(k => k.startsWith(nomE.replace(/[^A-Za-zÀ-ÿ]/g, '')));
      assert(nom, 'chip de l\'éliminée introuvable');
      eq(choix.r[nom], 0.35, 'éliminée pendant le choix');
      for (const k of Object.keys(choix.r)) if (k !== nom) eq(choix.r[k], 1, 'autre équipe ' + k);
      /* La feuille « qui reprend » recouvre le bouton ↶ : on appelle undo() (c'est ce que fait le bouton). */
      await app.ev(() => undo()); await app.settle();
      const apres = await opac(app);
      assert(!apres.attente, 'toujours en attente après Annuler');
      assert(Object.values(apres.r).every(v => v === 1), 'après Annuler : tout à 1 ' + JSON.stringify(apres.r));
      /* On ré-élimine, on lance le duel, puis on termine la période (fautes jusqu'à 11). */
      g = 0;
      while (!(await app.awaitingDuel()) && g++ < 10) await app.faute({ code: 'APPEL' });
      await app.duelStart('Bleu');
      assert((await opac(app)).r[nom] === 0.35, 'fondu pendant le duel');
      g = 0;
      while ((await opac(app)).periode === 1 && g++ < 40) {
        const poss = await app.ev(() => S.possession);
        await app.faute({ code: 'APPEL' });
        if (await app.awaitingDuel()) break;
        void poss;
      }
      const fin = await opac(app);
      assert(fin.periode >= 2, 'période non terminée');
      assert(Object.values(fin.r).every(v => v === 1), 'après fin de période : tout à 1 ' + JSON.stringify(fin.r));
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
  } finally { await app.close(); }

  for (const fmt of ['duel11', 'libre3']) {
    const app2 = await launch(gabarit);
    try {
      await check(`${P} · ${fmt} : jamais de fondu`, async () => {
        await app2.startMatch({ format: fmt });
        await app2.initialPossession(await app2.ev(() => ATEAMS()[0]));
        for (let i = 0; i < 12; i++) {
          await app2.faute({ code: 'APPEL' });
          const o = await opac(app2);
          assert(Object.values(o.r).every(v => v === 1), `fondu en ${fmt} ` + JSON.stringify(o.r));
        }
        assert(app2.errors.length === 0, app2.errors.join(' | '));
      });
    } finally { await app2.close(); }
  }
}
