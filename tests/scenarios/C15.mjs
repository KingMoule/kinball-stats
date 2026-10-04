/* C15 : onglet « Par période » (graphique OFF / DÉF par période). */
import fs from 'node:fs';
import { launch, assert, eq, rng, SORTIE } from '../lib.mjs';
import { Model, pickAction, play } from '../model.mjs';

const TMP = `${SORTIE}/captures/C15`;   /* KINBALL_SORTIE, jamais dans le dépôt */
fs.mkdirSync(TMP, { recursive: true });
const recalc = (hist, teams) => {            // recalcul indépendant, écrit à part du code testé
  const out = {}; teams.forEach(t => out[t] = {});
  for (const e of hist) {
    if (e.type !== 'lancer' || !e.details) continue;
    const r = e.details.result; if (r !== 'attrapé' && r !== 'échappé') continue;
    const p = e.before.period;
    const a = out[e.details.attacker], c = out[e.details.target];
    if (a) { a[p] ??= [0,0,0,0]; a[p][0]++; if (r === 'échappé') a[p][1]++; }
    if (c) { c[p] ??= [0,0,0,0]; c[p][2]++; if (r === 'attrapé') c[p][3]++; }
  }
  return out;
};
export const gabarits = ['tablette', 'telephone'];
export default async function ({ gabarit, check }) {
  const app = await launch(gabarit);
  const P = `[${gabarit}] C15`;
  try {
    await check(`${P} · match vide : message, pas d'erreur`, async () => {
      await app.startMatch({ format: '9_11' }); await app.initialPossession('Bleu');
      const r = await app.openStatsTab('periodes');
      assert(/Aucune action/.test(r.text), 'message attendu : ' + r.text.slice(0, 80));
      assert(app.errors.length === 0, app.errors.join(' | '));
      await app.backToMatch();
    });
    const m = new Model('9_11'); m.initial('Bleu');
    await check(`${P} · 3 périodes (dont élimination) : tableau et points = recalcul`, async () => {
      const r = rng(77); let guard = 0;
      while (m.period < 3 && guard++ < 400) await play(app, m, pickAction(m, r));
      for (let k = 0; k < 6; k++) await play(app, m, pickAction(m, r));
      assert(m.period >= 3, 'trois périodes non atteintes');
      const d = await app.ev(() => ({ hist: JSON.parse(JSON.stringify(S.history)), teams: ATEAMS(), ov: computeOverall(), ev: computeOffDefByPeriod(), lancers: S.history.filter(e => e.type === 'lancer' && e.details && (e.details.result === 'attrapé' || e.details.result === 'échappé')).length }));
      const rc = recalc(d.hist, d.teams);
      let offTot = 0;
      for (const t of d.teams) {
        let so = 0, sa = 0;
        for (const p of Object.keys(rc[t])) {
          const [oa, os, da, ds] = rc[t][p], c = d.ev.teams[t][p];
          eq([c.offAtt, c.offSucc, c.defAtt, c.defSucc], [oa, os, da, ds], `${t} P${p}`);
          so += oa; sa += os;
        }
        for (const p of Object.keys(d.ev.teams[t])) assert(rc[t][p], 'période fantôme');
        eq(so, d.ov[t].offAttempts, `somme offAtt ${t} = computeOverall`);
        eq(sa, d.ov[t].offSuccesses, `somme offSucc ${t}`);
        offTot += so;
      }
      eq(offTot, d.lancers, 'somme des offAtt = nombre de lancers');
      assert(d.ev.periods.length >= 3, 'au moins 3 périodes');
      // DOM : points tracés et valeurs du tableau
      await app.openStatsTab('periodes');
      const dom = await app.ev(() => {
        const pts = document.querySelectorAll('.evo-pt').length;
        const ev = computeOffDefByPeriod(); let n = 0;
        Object.values(ev.teams).forEach(o => Object.values(o).forEach(c => { if (c.offAtt) n++; if (c.defAtt) n++; }));
        const rows = [...document.querySelectorAll('#statsBody table.stab tbody tr')].map(tr => tr.textContent);
        const pale = [...document.querySelectorAll('.evo-pt')].filter(e => e.getAttribute('opacity')).length;
        return { pts, n, rows: rows.length, periods: ev.periods.length, pale, ow: document.documentElement.scrollWidth - innerWidth, bw: document.getElementById('statsBody').scrollWidth - document.getElementById('statsBody').clientWidth,
          lines: document.querySelectorAll('.evo-svg polyline').length };
      });
      eq(dom.pts, dom.n, 'points SVG = points calculables');
      eq(dom.rows, dom.periods, 'lignes du tableau');
      assert(dom.ow <= 0 && dom.bw <= 0, `débordement horizontal ${dom.ow}/${dom.bw}`);
      console.log(`   (${gabarit}) points=${dom.pts} pâles=${dom.pale} polylignes=${dom.lines} périodes=${dom.periods}`);
      await app.shot(`${TMP}/C15-${gabarit}-3p.png`);
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
    await check(`${P} · tri du tableau sans quitter l'onglet, + de détail`, async () => {
      await app.ev(() => sortTable('match', 'matchEvolution', 'off_Bleu'));
      assert(await app.ev(() => !!document.querySelector('.evo-svg')), 'onglet quitté');
      await app.ev(() => toggleDetails());
      assert(await app.ev(() => !!document.querySelector('.cell-sub')), 'comptages absents');
      await app.shot(`${P.replace(/[\[\]]/g, '')}.png`.replace(/^/, TMP + '/C15-detail-'));
      await app.ev(() => toggleDetails());
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
    await check(`${P} · onglet absent du cumul d'équipe, présent en archive (copie)`, async () => {
      const r = await app.ev(() => ({ t: STAT_SECTIONS.filter(s => s.team).some(s => s.id === 'periodes'), mm: STAT_SECTIONS.filter(s => s.match).some(s => s.id === 'periodes'),
        arch: Object.keys(computeOffDefByPeriod(JSON.parse(JSON.stringify(S))).teams).length }));
      assert(!r.t && r.mm && r.arch >= 2, JSON.stringify(r));
    });
    await check(`${P} · duel (2 équipes) : 4 courbes max, une seule période : points sans trait`, async () => {
      await app.startMatch({ format: 'duel11' }); await app.initialPossession('Bleu');
      const [a, b] = await app.ev(() => ATEAMS());
      await app.lancer({ target: b, caught: true }); 
      await app.openStatsTab('periodes');
      let r = await app.ev(() => ({ pts: document.querySelectorAll('.evo-pt').length, lines: document.querySelectorAll('.evo-svg polyline').length }));
      eq(r.lines, 0, 'aucun trait avec une seule période'); eq(r.pts, 2, 'un point OFF + un DÉF');
      await app.shot(`${TMP}/C15-${gabarit}-1p.png`);
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
  } finally { await app.close(); }
}
