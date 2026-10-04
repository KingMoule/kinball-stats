/* Fuzz : quelques centaines d'actions aléatoires à graine fixe, avec invariants. */
import { launch, assert, eq, rng } from './lib.mjs';
import { Model, compare, pickAction, play } from './model.mjs';

const RUNS = [
  { format: '9_11',   seed: 101, n: 130, rosters: true },
  { format: '11_13',  seed: 202, n: 130 },
  { format: 'duel11', seed: 303, n: 110 },
];

export default async function fuzz({ gabarit, check }) {
  for (const run of RUNS) {
    const P = `[${gabarit}] fuzz ${run.format}`;
    await check(`${P} (${run.n} actions, graine ${run.seed})`, async () => {
      const app = await launch(gabarit);
      try {
        const m = new Model(run.format);
        await app.startMatch({ format: run.format, withRosters: !!run.rosters, name: 'fuzz' });
        await app.initialPossession('Bleu'); m.initial('Bleu');
        const r = rng(run.seed);
        let validated = 0;
        for (let i = 1; i <= run.n; i++) {
          const x = r();
          let what;
          if (x < 0.06 && m.events > 0) { await app.undo(); m.undo(); validated--; what = 'undo'; }
          else if (x < 0.10) { await app.abandon({ at: [0.2 + r() * 0.6, 0.2 + r() * 0.6] }); what = 'abandon'; }
          else {
            const a = pickAction(m, r);
            try { await play(app, m, a, { rosters: !!run.rosters }); }
            catch (e) { throw new Error(`action ${i} (${JSON.stringify(a)}) : ${String(e.message).split('\n')[0]} ; app=${JSON.stringify(await app.ev(() => ({ s: S.scores, p: S.possession, el: S.eliminated, sheet: document.getElementById('sheet').innerHTML.slice(0, 160) })))} modèle=${m.snap()}`); }
            validated++; what = a.t;
          }
          const s = await app.state();
          const ctx = `action ${i} (${what})`;
          const d = compare(s, m); if (d) throw new Error(`${ctx} : ${d}`);
          // invariants
          for (const t of ['Bleu', 'Gris', 'Noir']) assert(s.scores[t] >= 0, `${ctx} : pointage négatif ${t}=${s.scores[t]}`);
          eq(s.history.length, validated, `${ctx} : S.history.length vs actions validées`);
          if (s.activeTeams.length === 3 && !s.duelActive) {
            const tot = s.scores.Bleu + s.scores.Gris + s.scores.Noir;
            assert(tot % 2 === 0, `${ctx} : total des points impair hors duel (${JSON.stringify(s.scores)})`);
          }
          if (s.eliminated) {
            const v = s.activeTeams.map(t => s.scores[t]); const lo = Math.min(...v);
            assert(v.filter(x => x === lo).length === 1, `${ctx} : égalité au plus bas à l’élimination ${JSON.stringify(s.scores)}`);
            assert(s.scores[s.eliminated] === lo, `${ctx} : l’éliminée n’est pas la plus basse`);
          }
          assert(app.errors.length === 0, `${ctx} : ${app.errors.join(' | ')}`);
        }
        // couverture : la graine doit avoir réellement exercé les transitions
        const L = m.log;
        assert(L.periodEnds >= 1, `aucune fin de période en ${run.n} actions (${JSON.stringify(L)})`);
        if (run.format.startsWith('9_') || run.format.startsWith('11_')) assert(L.eliminations >= 1, `aucune élimination (${JSON.stringify(L)})`);
        assert(L.lancers > 0 && L.fautes > 0 && L.reprises > 0 && L.echappes > 0, `types d'actions manquants (${JSON.stringify(L)})`);
        if (run.rosters) {
          const n = await app.ev(() => S.history.filter(e => e.details && e.details.attacker_player_id).length);
          assert(n > 0, 'aucune action attribuée à un joueur (feuille « qui a lancé ? » non exercée)');
        }
      } finally { await app.close(); }
    });
  }
}
