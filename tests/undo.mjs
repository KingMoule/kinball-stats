/* Annuler : après chaque action d'un scénario d'une trentaine d'actions,
   « action puis Annuler » redonne exactement l'état précédent. */
import { launch, assert, eq, diff, rng } from './lib.mjs';
import { Model, compare, pickAction, play, playDuel } from './model.mjs';

export default async function undo({ gabarit, check }) {
  const app = await launch(gabarit);
  const P = `[${gabarit}] undo`;
  try {
    const m = new Model('9_11');
    await app.startMatch({ format: '9_11', name: 'undo_' + gabarit });
    await app.initialPossession('Bleu'); m.initial('Bleu');
    const r = rng(11);
    const seen = { n: 0, elim: 0, periode: 0, reprise: 0, faute: 0, lancer: 0 };
    let done = 0, firstFail = null;
    await check(`${P} · action puis Annuler = état précédent (≈ 32 actions)`, async () => {
      while (seen.n < 32 || seen.elim < 1 || seen.periode < 1) {
        if (seen.n > 70) throw new Error('scénario trop long : élimination ou fin de période non atteinte');
        let a = pickAction(m, r);
        if (seen.n % 11 === 5) a = { t: 'reprise', team: m.inPlay()[0], at: [.5, .5], duel: 0 };   // reprises garanties
        const avant = await app.state(), snapM = m.snap();
        const res = await play(app, m, a, { manualDuel: true });
        let duelTeam = null;
        if (m.awaitingDuel) duelTeam = await playDuel(app, m, a);
        const apres = await app.state();
        const dcmp = compare(apres, m); if (dcmp) throw new Error(`avant Annuler, action ${seen.n + 1} : ${dcmp}`);
        await app.undo(); m.undo();
        const restored = await app.state();
        const d = diff(restored, avant);
        if (d) throw new Error(`action ${seen.n + 1} (${a.t}${a.code ? ' ' + a.code : ''}${a.target ? '→' + a.target + (a.caught ? ' attrapé' : ' échappé') : ''}) : Annuler ne restaure pas l’état — ${d}`);
        eq(m.snap(), snapM, 'modèle après Annuler');
        // rejouer la même action pour poursuivre le scénario
        await play(app, m, a, { manualDuel: true });
        if (m.awaitingDuel) await playDuel(app, m, a);
        seen.n++; seen[a.t]++; if (res === 'elim') seen.elim++; if (res === 'periode') seen.periode++;
        const d2 = compare(await app.state(), m); if (d2) throw new Error(`après rejeu, action ${seen.n} : ${d2}`);
      }
    });
    await check(`${P} · couverture du scénario (lancers, fautes, reprise, élimination, fin de période)`, async () => {
      assert(seen.lancer > 0 && seen.faute > 0 && seen.reprise > 0, JSON.stringify(seen));
      assert(seen.elim >= 1 && seen.periode >= 1, JSON.stringify(seen));
    });
    await check(`${P} · Annuler désactivé sans historique, inerte`, async () => {
      while ((await app.state()).history.length) { await app.undo(); m.undo(); }
      eq(await app.ev(() => (document.querySelector('#undoBtn:not([style*="none"])') || document.getElementById('undoBtnPhone')).disabled), true, 'bouton Annuler activé sans historique');
      const d = compare(await app.state(), m); if (d) throw new Error(d);
    });
    await check(`${P} · aucune erreur console`, async () => { assert(app.errors.length === 0, app.errors.join(' | ')); });
  } finally { await app.close(); }
}
