/* Fumée : chargement, match 9/11 scénarisé contre le modèle, onglets de
   stats, lignes d'export. */
import { launch, assert, eq } from './lib.mjs';
import { Model, compare, pickAction, play } from './model.mjs';
import { rng } from './lib.mjs';

export default async function smoke({ gabarit, check }) {
  const app = await launch(gabarit);
  const P = `[${gabarit}] smoke`;
  try {
    await check(`${P} · chargement sans erreur`, async () => {
      assert(await app.ev(() => typeof S === 'object' && typeof FORMATS === 'object'), 'app non initialisée');
      assert(await app.ev(() => document.getElementById('home') !== null), 'écran d’accueil absent');
      const phone = await app.isPhone();
      assert(phone === (gabarit === 'telephone'), `classe html.phone incorrecte (phone=${phone})`);
      assert(app.errors.length === 0, app.errors.join(' | '));
    });

    const m = new Model('9_11');
    await check(`${P} · nouveau match 9/11, trois équipes, possession initiale`, async () => {
      await app.startMatch({ format: '9_11', name: 'smoke_' + gabarit });
      const s = await app.state();
      assert(s.awaitingInitial && s.format.id === '9_11' && s.activeTeams.length === 3, 'état de départ inattendu');
      await app.initialPossession('Bleu'); m.initial('Bleu');
      eq((await app.state()).possession, 'Bleu', 'possession initiale');
    });

    /* Scénario écrit à la main jusqu'à l'élimination, au duel et à la fin de période. */
    const A = [
      { t: 'lancer', target: 'Gris', caught: true,  from: [.2, .3], to: [.7, .6] },
      { t: 'faute', code: 'APPEL', at: [.4, .4] },
      { t: 'lancer', target: 'Noir', caught: false, from: [.3, .7], to: [.8, .2] },
      { t: 'lancer', target: 'Bleu', caught: true,  from: [.5, .1], to: [.5, .9] },
      { t: 'reprise', team: 'Gris', at: [.5, .5] },
      { t: 'faute', code: 'EXT', at: [.2, .8] },
      { t: 'lancer', target: 'Bleu', caught: false, from: [.1, .1], to: [.9, .9] },
      { t: 'faute', code: 'M1C', at: [.6, .5] },
      { t: 'lancer', target: 'Noir', caught: false, from: [.7, .7], to: [.2, .2] },
      { t: 'faute', code: 'PENTE', at: [.3, .3] },
    ];
    let i = 0, n = 0;
    await check(`${P} · pointage = modèle indépendant (scénario écrit)`, async () => {
      for (const a of A) {
        i++;
        try { await play(app, m, { duel: 0, ...a }, { manualDuel: true }); }
        catch (e) { throw new Error(`action ${i} (${a.t}) : ${String(e.message).split('\n')[0]} ; scores app=${JSON.stringify((await app.state()).scores)} modèle=${JSON.stringify(m.scores)}`); }
        const d = compare(await app.state(), m);
        if (d) throw new Error(`action ${i} (${a.t}) : ${d}`);
      }
    });
    /* Poursuite pseudo-aléatoire (graine fixe) jusqu'à avoir vu élimination ET fin de période. */
    await check(`${P} · élimination, duel, fin de période et remise à zéro`, async () => {
      const r = rng(2026);
      let guard = 0;
      while (!m.awaitingDuel && guard++ < 40) {      // jusqu'à l'élimination
        const a = pickAction(m, r);
        await play(app, m, a, { manualDuel: true });
        const d = compare(await app.state(), m);
        if (d) throw new Error(`action aléatoire ${guard} (${a.t}) : ${d}`);
      }
      assert(m.awaitingDuel && m.log.eliminations === 1, 'l’élimination n’a pas eu lieu (modèle)');
      const s0 = await app.state();
      assert(s0.eliminated && s0.duelActive && s0.awaitingDuelStart, 'l’app n’a pas éliminé d’équipe');
      eq(s0.eliminated, m.elim, 'équipe éliminée');
      assert(await app.sheetHas(`chooseDuelStart('${m.inPlay()[0]}')`), 'feuille « qui reprend le ballon ? » absente');
      const dueTeam = m.inPlay()[0];
      await app.duelStart(dueTeam); m.duelStart(dueTeam);
      { const d = compare(await app.state(), m); if (d) throw new Error('après choix du duel : ' + d); }
      guard = 0;
      while (m.period === 1 && guard++ < 40) {
        const a = pickAction(m, r);
        await play(app, m, a);
        const d = compare(await app.state(), m);
        if (d) throw new Error(`action aléatoire ${guard} (${a.t}) : ${d}`);
      }
      assert(m.period === 2, 'la période 1 ne s’est pas terminée');
      const s = await app.state();
      eq(s.scores, { Bleu: 0, Gris: 0, Noir: 0 }, 'remise à zéro des points');
      eq(s.eliminated, null, 'élimination effacée'); eq(s.duelActive, false, 'duel terminé');
      assert(Object.values(s.periodWins).reduce((x, y) => x + y, 0) === 1, 'une période gagnée attendue');
    });
    await check(`${P} · la période suivante repart (3 actions de plus)`, async () => {
      const r = rng(7);
      for (let k = 0; k < 3; k++) { const a = pickAction(m, r); await play(app, m, a); const d = compare(await app.state(), m); if (d) throw new Error(d); }
    });

    const ids = await app.ev(() => STAT_SECTIONS.filter(s => s.match).map(s => s.id));
    for (const id of ids) {
      await check(`${P} · onglet de stats « ${id} » (match)`, async () => {
        const before = app.errors.length;
        const r = await app.openStatsTab(id);
        assert(r.text.length > 0 || r.rich, 'contenu vide');
        assert(app.errors.length === before, app.errors.slice(before).join(' | '));
      });
    }
    await check(`${P} · buildActionRows() : une ligne par événement`, async () => {
      const rows = await app.ev(() => { const b = buildActionRows(); return { n: b.rows.length, h: b.header.length, k: Object.keys(b.rows[0] || {}).length, hist: S.history.length }; });
      eq(rows.n, rows.hist, 'lignes vs événements'); eq(rows.k, rows.h, 'colonnes vs en-tête');
      assert(rows.n > 0, 'aucun événement');
    });
    await check(`${P} · aucune erreur console sur l'ensemble`, async () => { assert(app.errors.length === 0, app.errors.join(' | ')); });
    await app.backToMatch();
  } finally { await app.close(); }
}
