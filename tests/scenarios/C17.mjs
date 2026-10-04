/* C17 : heat map, bascule DÉPART / ARRIVÉE. */
import fs from 'node:fs';
import { launch, assert, eq, rng, SORTIE } from '../lib.mjs';
import { Model, pickAction, play } from '../model.mjs';

const TMP = `${SORTIE}/captures/C17`;   /* KINBALL_SORTIE, jamais dans le dépôt */
fs.mkdirSync(TMP, { recursive: true });
export const gabarits = ['tablette', 'telephone'];
export default async function ({ gabarit, check }) {
  const app = await launch(gabarit);
  const P = `[${gabarit}] C17`;
  // recalcul indépendant (écrit à part du code testé)
  const recalc = (hist, slot, mode, point) => {
    const out = [];
    for (const e of hist) {
      if (e.type !== 'lancer' || !e.details) continue;
      const d = e.details; if (d.result !== 'attrapé' && d.result !== 'échappé') continue;
      if (mode === 'offense' ? d.attacker !== slot : d.target !== slot) continue;
      const pos = point === 'start' ? d.start_norm : d.end_norm; if (!pos) continue;
      out.push([pos[0], pos[1], mode === 'offense' ? d.result === 'échappé' : d.result === 'attrapé']);
    }
    return out;
  };
  try {
    await check(`${P} · jeu de lancers départ ≠ arrivée`, async () => {
      await app.startMatch({ format: '9_11' }); await app.initialPossession('Bleu');
      const r = rng(5); const m = new Model('9_11'); m.initial('Bleu');
      for (let k = 0; k < 40; k++) await play(app, m, pickAction(m, r));
      const n = await app.ev(() => S.history.filter(e => e.type === 'lancer').length);
      assert(n >= 8, 'au moins 8 lancers : ' + n);
    });
    await check(`${P} · points = recalcul (4 combinaisons), défauts inchangés (critères 1-2)`, async () => {
      const d = await app.ev(() => {
        const o = {}; const hist = JSON.parse(JSON.stringify(S.history));
        const att = [...new Set(hist.filter(e => e.type === 'lancer').map(e => e.details.attacker))];
        const tg = [...new Set(hist.filter(e => e.type === 'lancer').map(e => e.details.target))];
        o.hist = hist; o.att = att; o.tg = tg;
        o.res = {};
        for (const slot of [...att, ...tg]) for (const mode of ['offense', 'defense']) for (const pt of ['start', 'end', undefined])
          o.res[`${slot}|${mode}|${pt}`] = heatPointsFrom(S, slot, mode, 'all', pt).map(p => [p.x, p.y, p.success]);
        o.def = {}; for (const slot of [...att, ...tg]) for (const mode of ['offense', 'defense'])
          o.def[`${slot}|${mode}`] = heatPointsFrom(S, slot, mode, 'all').map(p => [p.x, p.y, p.success]);
        return o;
      });
      let tot = 0;
      for (const slot of [...d.att, ...d.tg]) for (const mode of ['offense', 'defense']) {
        for (const pt of ['start', 'end']) {
          const r = recalc(d.hist, slot, mode, pt);
          eq(d.res[`${slot}|${mode}|${pt}`], r, `${slot} ${mode} ${pt}`); tot += r.length;
        }
        eq(d.res[`${slot}|${mode}|undefined`], recalc(d.hist, slot, mode, mode === 'offense' ? 'start' : 'end'), `défaut ${slot} ${mode}`);
        eq(d.def[`${slot}|${mode}`], d.res[`${slot}|${mode}|undefined`], 'sans paramètre = défaut');
      }
      assert(tot > 0, 'aucun point comparé');
      // départ et arrivée sont bien différents (le jeu de test a un sens)
      const a = recalc(d.hist, d.att[0], 'offense', 'start'), b = recalc(d.hist, d.att[0], 'offense', 'end');
      assert(JSON.stringify(a.map(p => [p[0], p[1]])) !== JSON.stringify(b.map(p => [p[0], p[1]])), 'départ = arrivée ?');
    });
    await check(`${P} · bascule dans l'onglet match : totaux inchangés, mémoire par mode, GRILLE/POINTS (critères 3-4, 6)`, async () => {
      await app.openStatsTab('heat');
      const read = () => app.ev(() => {
        const leg = document.querySelector('.heat-legend').textContent.replace(/\s+/g, ' ');
        const f = document.querySelector('.heat-field');
        const act = [...document.querySelectorAll('#statsBody .heat-btn.active')].map(b => b.textContent.trim());
        const sub = document.querySelector('#statsBody .section-sub').textContent;
        const circles = f.querySelectorAll('circle').length;
        const de = document.documentElement, ov = de.scrollWidth > de.clientWidth + 1;
        return { leg, act, sub, circles, ov, mode: S.heatMode };
      });
      const click = (c) => app.page.locator(`#statsBody [onclick="${c}"]`).first().click();
      const base = await read();
      assert(base.act.includes('DÉPART') && base.act.includes('OFFENSIVE'), 'défaut offensive = DÉPART : ' + base.act);
      assert(/D'où partent ses lancers/.test(base.sub), base.sub);
      const tot = (s) => s.leg.match(/(\d+) lancer/)[1] + '|' + (s.leg.match(/\((\d+%|—)\)/) || [])[1];
      await click(`setHeatPoint('offense','end')`);
      const e = await read();
      assert(e.act.includes('ARRIVÉE') && /Où arrivent ses lancers/.test(e.sub), e.sub);
      eq(tot(e), tot(base), 'total + moyenne inchangés offensive');
      // défensive : mémorisée à part (défaut ARRIVÉE)
      await click(`setHeatMode('defense')`);
      const d0 = await read();
      assert(d0.act.includes('ARRIVÉE') && /Où arrivent les ballons/.test(d0.sub), 'défensive défaut ARRIVÉE : ' + d0.sub);
      await click(`setHeatPoint('defense','start')`);
      const d1 = await read();
      assert(/D'où partent les ballons qu'elle reçoit/.test(d1.sub), d1.sub);
      eq(tot(d1), tot(d0), 'total + moyenne inchangés défensive');
      // retour offensive : choix ARRIVÉE conservé
      await click(`setHeatMode('offense')`);
      assert((await read()).act.includes('ARRIVÉE'), 'offensive garde ARRIVÉE');
      // POINTS : nombre de cercles = nombre de lancers, bascule combinée
      await click(`setHeatView('dots')`);
      const dots = await read();
      eq(dots.circles, +dots.leg.match(/(\d+) lancer/)[1], 'cercles = lancers (ARRIVÉE)');
      await click(`setHeatPoint('offense','start')`);
      eq((await read()).circles, dots.circles, 'cercles = lancers (DÉPART)');
      // combiné au filtre de situation
      const sitBtn = app.page.locator('#statsBody [onclick^="setHeatSituation("]');
      if (await sitBtn.count() > 1) { await sitBtn.nth(1).click(); await click(`setHeatPoint('offense','end')`); }
      assert(!(await read()).ov, 'pas de débordement horizontal');
      await app.shot(`${TMP}/C17-match-${gabarit}.png`);
      eq(await app.ev(() => Object.keys(S).filter(k => /heatPoint/i.test(k))), [], 'rien dans S');
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
    await check(`${P} · cumul d'équipe : sectionTeamHeat = recalcul, bascule, archive (critère 5)`, async () => {
      const d = await app.ev(() => {
        const copy = JSON.parse(JSON.stringify(S)); copy.id = 'c17-test'; copy.teamIds = { Bleu: 'T_X', Gris: 'T_Y', Noir: null };
        MATCHES_DB.push(copy);
        const out = {};
        try {
          for (const mode of ['offense', 'defense']) for (const p of ['start', 'end']) {
            teamHeatMode = mode; teamHeatPoint[mode] = p; teamHeatSituation = 'all';
            for (const view of ['grid', 'dots']) {
              teamHeatView = view;
              const host = document.createElement('div'); host.innerHTML = sectionTeamHeat({ matchesPlayed: 1 }, 'T_X');
              out[`${mode}|${p}|${view}`] = { leg: host.querySelector('.heat-legend').textContent.replace(/\s+/g, ' '), circles: host.querySelectorAll('circle').length, sub: host.querySelector('.section-sub').textContent, act: [...host.querySelectorAll('.heat-btn.active')].map(b => b.textContent.trim()) };
            }
          }
        } finally { MATCHES_DB.pop(); teamHeatMode = 'offense'; teamHeatView = 'grid'; teamHeatPoint.offense = 'start'; teamHeatPoint.defense = 'end'; }
        out.hist = JSON.parse(JSON.stringify(S.history));
        return out;
      });
      for (const mode of ['offense', 'defense']) for (const p of ['start', 'end']) {
        const r = recalc(d.hist, 'Bleu', mode, p);
        const g = d[`${mode}|${p}|grid`], q = d[`${mode}|${p}|dots`];
        eq(+g.leg.match(/(\d+) lancer/)[1], r.length, `total ${mode} ${p}`);
        eq(q.circles, r.length, `cercles ${mode} ${p}`);
        assert(g.act.includes(p === 'start' ? 'DÉPART' : 'ARRIVÉE'), 'bouton actif ' + g.act);
      }
      const t = (k) => d[k].leg.match(/(\d+) lancer/)[1] + d[k].leg.match(/\((\d+%|—)\)/)[1];
      eq(t('offense|start|grid'), t('offense|end|grid'), 'cumul : total/moyenne offensive inchangés');
      eq(t('defense|start|grid'), t('defense|end|grid'), 'cumul : total/moyenne défensive inchangés');
      assert(/Où arrivent ses lancers, sur 1 match/.test(d['offense|end|grid'].sub), d['offense|end|grid'].sub);
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
  } finally { await app.close(); }
}
