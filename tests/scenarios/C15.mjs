/* C15 : « Par période » sous la Vue d'ensemble (graphique OFF / DÉF / F %, interrupteur une équipe, point Noir). */
import fs from 'node:fs';
import { launch, assert, eq, rng, SORTIE } from '../lib.mjs';
import { Model, pickAction, play } from '../model.mjs';

const TMP = `${SORTIE}/captures/C15`;   /* KINBALL_SORTIE, jamais dans le dépôt */
fs.mkdirSync(TMP, { recursive: true });
const recalc = (hist, teams) => {            // recalcul indépendant, écrit à part du code testé
  const out = {}; teams.forEach(t => out[t] = {});
  for (const e of hist) {
    /* STAT-1 : une faute directe est une tentative offensive ratée de l'équipe en possession */
    if (e.type === 'faute_directe' && e.before && out[e.before.possession]) { const a = out[e.before.possession], p = e.before.period; a[p] ??= [0,0,0,0]; a[p][0]++; continue; }
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
      const r = await app.openStatsTab('overall');
      assert(/Aucune action/.test(r.text), 'message attendu : ' + r.text.slice(0, 80));
      assert(await app.ev(() => !document.querySelector('.evo-svg')), 'pas de graphique sans action');
      assert(app.errors.length === 0, app.errors.join(' | '));
      await app.backToMatch();
    });
    const m = new Model('9_11'); m.initial('Bleu');
    await check(`${P} · 3 périodes (dont élimination) : tableau et points = recalcul`, async () => {
      const r = rng(77); let guard = 0;
      while (m.period < 3 && guard++ < 400) await play(app, m, pickAction(m, r));
      for (let k = 0; k < 6; k++) await play(app, m, pickAction(m, r));
      assert(m.period >= 3, 'trois périodes non atteintes');
      const d = await app.ev(() => ({ hist: JSON.parse(JSON.stringify(S.history)), teams: ATEAMS(), ov: computeOverall(), ev: computeOffDefByPeriod(), lancers: S.history.filter(e => (e.type === 'lancer' && e.details && (e.details.result === 'attrapé' || e.details.result === 'échappé')) || e.type === 'faute_directe').length }));
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
        eq(so, d.ov[t].offTentatives, `somme offAtt ${t} = computeOverall (lancers + fautes)`);
        eq(sa, d.ov[t].offSuccesses, `somme offSucc ${t}`);
        offTot += so;
      }
      eq(offTot, d.lancers, 'somme des offAtt = nombre de lancers et de fautes directes');
      assert(d.ev.periods.length >= 3, 'au moins 3 périodes');
      // DOM : points tracés et valeurs du tableau
      await app.openStatsTab('overall');
      const dom = await app.ev(() => {
        const pts = document.querySelectorAll('.evo-pt').length;
        const ev = computeOffDefByPeriod(); let n = 0;
        let nF = 0;
        Object.values(ev.teams).forEach(o => Object.values(o).forEach(c => { if (c.offAtt) { n++; nF++; } if (c.defAtt) n++; }));
        const evoTab = document.querySelector('#statsBody th[onclick*="matchEvolution"]').closest('table');
        const rows = [...evoTab.querySelectorAll('tbody tr')].map(tr => tr.textContent);
        const pale = [...document.querySelectorAll('.evo-pt')].filter(e => e.getAttribute('opacity')).length;
        return { pts, n, nF, rows: rows.length, periods: ev.periods.length, pale, ow: document.documentElement.scrollWidth - innerWidth, bw: document.getElementById('statsBody').scrollWidth - document.getElementById('statsBody').clientWidth,
          lines: document.querySelectorAll('.evo-svg polyline').length, titre: [...document.querySelectorAll('#statsBody .section-title')].map(e => e.textContent.trim()),
          ordre: (() => { const o = document.querySelector('#statsBody th[onclick*="matchOverall"]').closest('table'), e = document.querySelector('.evo-svg'), t = evoTab; const F = Node.DOCUMENT_POSITION_FOLLOWING; return !!(o.compareDocumentPosition(e) & F) && !!(e.compareDocumentPosition(t) & F); })(),
          polyF: document.querySelectorAll('.evo-svg polyline.evo-f').length, ptsF: document.querySelectorAll('.evo-pt-f').length, caseF: document.getElementById('evoShowF').checked };
      });
      assert(dom.titre.includes('Par période') && dom.titre.indexOf('Par période') > dom.titre.indexOf('Vue d\'ensemble'), 'titre « Par période » sous la Vue d\'ensemble : ' + dom.titre);
      assert(dom.ordre, 'ordre : tableau d\'ensemble, puis graphique, puis tableau chiffré');
      assert(!dom.caseF && dom.polyF === 0 && dom.ptsF === 0, 'F % masquée à l\'ouverture');
      eq(dom.pts, dom.n, 'points SVG = points calculables (OFF + DÉF seulement, F % masquée)');
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
    await check(`${P} · plus d'onglet « Par période » (match ni cumul), calcul disponible sur une copie (archive)`, async () => {
      const r = await app.ev(() => ({ t: STAT_SECTIONS.some(s => s.team && s.id === 'periodes'), mm: STAT_SECTIONS.some(s => s.match && s.id === 'periodes'), tout: STAT_SECTIONS.some(s => s.id === 'periodes'),
        bouton: !!document.querySelector('.stat-tab[onclick*="periodes"]'),
        arch: Object.keys(computeOffDefByPeriod(JSON.parse(JSON.stringify(S))).teams).length }));
      assert(!r.t && !r.mm && !r.tout && !r.bouton && r.arch >= 2, JSON.stringify(r));
    });
    await check(`${P} · F % : fautes / (lancers + fautes) par période = recalcul ; colonne F % du tableau`, async () => {
      const d = await app.ev(() => ({ hist: JSON.parse(JSON.stringify(S.history)), teams: ATEAMS(), ev: computeOffDefByPeriod() }));
      let nFautes = 0;
      for (const t of d.teams) for (const p of Object.keys(d.ev.teams[t])) {
        const c = d.ev.teams[t][p];
        const f = d.hist.filter(e => e.type === 'faute_directe' && e.before.possession === t && String(e.before.period) === p).length;
        eq(c.fautes, f, `fautes ${t} P${p}`); nFautes += f;
        assert(c.fautes <= c.offAtt, 'fautes comprises dans offAtt');
      }
      assert(nFautes > 0, 'le scénario aléatoire doit contenir au moins une faute directe');
      const t = await app.ev(() => {
        const ev = computeOffDefByPeriod(), th = [...document.querySelectorAll('#statsBody th[onclick*="matchEvolution"]')].map(x => x.getAttribute('onclick'));
        const tr = [...document.querySelector('#statsBody th[onclick*="matchEvolution"]').closest('table').querySelectorAll('tbody tr')];
        const out = [];
        ATEAMS().forEach(tm => {
          const i = th.findIndex(o => o.includes(`'f_${tm}'`)); if (i < 0) { out.push(null); return; }
          tr.forEach(row => { const p = Number(row.children[0].textContent.trim().slice(1)), c = ev.teams[tm][p]; out.push({ att: c ? c.offAtt : 0, f: c ? c.fautes : 0, txt: row.children[i].textContent.trim() }); });   // le tri en cours peut changer l'ordre des lignes
        });
        return out;
      });
      assert(t.every(x => x), 'colonne F % par équipe');
      for (const x of t) eq(x.txt, x.att ? Math.round(100 * x.f / x.att) + '%' : '—', 'F % affiché');
      /* Cas à la main : 2 fautes + 6 lancers d'une équipe dans une période = 8 tentatives, F % = 25 %, OFF % selon STAT-1 (2 échappés sur 8 = 25 %) */
      const h = await app.ev(() => {
        const mk = (type, per, extra) => Object.assign({type, before:{period:per, possession:'Bleu'}}, extra);
        const hist = [mk('faute_directe', 1), mk('faute_directe', 1)];
        for (let i = 0; i < 6; i++) hist.push(mk('lancer', 1, {details:{attacker:'Bleu', target:'Gris', result: i < 2 ? 'échappé' : 'attrapé'}}));
        const r = computeOffDefByPeriod({activeTeams:['Bleu','Gris'], history:hist}).teams.Bleu[1];
        return {r, f: pctStr(r.fautes, r.offAtt), off: pctStr(r.offSucc, r.offAtt)};
      });
      eq([h.r.fautes, h.r.offAtt, h.f, h.off], [2, 8, '25%', '25%'], '2 fautes + 6 lancers');
    });
    await check(`${P} · case F % : ajoute les courbes (pointillé fin, triangles), non mémorisée`, async () => {
      const av = await app.ev(() => ({ lines: document.querySelectorAll('.evo-svg polyline').length, pts: document.querySelectorAll('.evo-pt').length }));
      await app.ev(() => document.getElementById('evoShowF').click());
      const ap = await app.ev(() => ({ lines: document.querySelectorAll('.evo-svg polyline').length, polyF: document.querySelectorAll('.evo-svg polyline.evo-f').length,
        dash: [...document.querySelectorAll('.evo-svg polyline.evo-f')].every(l => l.getAttribute('stroke-dasharray') === '2 4' && l.getAttribute('stroke-width') === '1.5'),
        tri: document.querySelectorAll('polygon.evo-pt-f').length, pts: document.querySelectorAll('.evo-pt').length, S_ok: !('evoShowF' in S) && !JSON.stringify(S).includes('evoShowF'),
        n: (() => { const ev = computeOffDefByPeriod(); let k = 0; Object.values(ev.teams).forEach(o => Object.values(o).forEach(c => { if (c.offAtt) k++; })); return k; })(),
        ls: Object.keys(localStorage).filter(k => /evo/i.test(k)).length }));
      assert(ap.polyF > 0 && ap.lines === av.lines + ap.polyF, `courbes F % ajoutées ${JSON.stringify([av, ap])}`);
      assert(ap.dash, 'F % : pointillé fin'); eq(ap.tri, ap.n, 'un triangle par point F %'); eq(ap.pts, av.pts + ap.n, 'points'); assert(ap.S_ok && ap.ls === 0, 'rien dans S ni le stockage');
      assert(await app.ev(() => document.getElementById('evoLegF') && !/masquée/.test(document.getElementById('evoLegF').textContent)), 'légende F % active');
      await app.shot(`${TMP}/C15-${gabarit}-F.png`);
      await app.ev(() => document.getElementById('evoShowF').click());
      eq(await app.ev(() => document.querySelectorAll('.evo-svg polyline.evo-f, polygon.evo-pt-f').length), 0, 'décochée : plus de F %');
      await app.ev(() => document.getElementById('evoShowF').click());   // recochée, puis on quitte l'écran pour vérifier le retour à zéro
      await app.backToMatch(); await app.openStatsTab('overall');
      assert(await app.ev(() => !document.getElementById('evoShowF').checked && document.querySelectorAll('polygon.evo-pt-f').length === 0), 'case non mémorisée : masquée à la réouverture');
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
    await check(`${P} · interrupteur « une équipe seulement » : graphique seulement, rien dans S`, async () => {
      const base = await app.ev(() => ({ tbl: document.querySelector('#statsBody th[onclick*="matchEvolution"]').closest('table').outerHTML, s: JSON.stringify(S), teams: ATEAMS(),
        lines: document.querySelectorAll('.evo-svg polyline').length, pts: document.querySelectorAll('.evo-pt').length,
        ls: JSON.stringify(Object.entries(localStorage)) }));
      await app.ev(() => document.getElementById('evoOneTeam').click());
      eq(await app.ev(() => document.querySelectorAll('.evo-svg polyline').length), base.lines, 'interrupteur allumé sans choix : toutes les équipes');
      const [a] = base.teams;
      await app.ev((t) => document.querySelector(`.evo-leg-btn[data-team="${t}"]`).click(), a);
      const un = await app.ev((t) => {
        const keep = ATEAMS().map(x => x), ev = computeOffDefByPeriod(); let pts = 0;
        [...Object.values(ev.teams[t])].forEach(c => { if (c.offAtt) pts++; if (c.defAtt) pts++; });
        return { pts: document.querySelectorAll('.evo-pt').length, attendu: pts, tbl: document.querySelector('#statsBody th[onclick*="matchEvolution"]').closest('table').outerHTML,
          titres: [...document.querySelectorAll('.evo-pt title')].every(x => x.textContent.startsWith(S.names[t])), s: JSON.stringify(S), ls: JSON.stringify(Object.entries(localStorage)) };
      }, a);
      eq(un.pts, un.attendu, 'une équipe : ses points seulement'); assert(un.titres, 'bulles de la seule équipe gardée');
      assert(un.tbl === base.tbl, 'tableau chiffré inchangé (toutes les équipes)'); assert(un.s === base.s && un.ls === base.ls, 'S et stockage inchangés');
      await app.ev((t) => document.querySelector(`.evo-leg-btn[data-team="${t}"]`).click(), a);
      eq(await app.ev(() => document.querySelectorAll('.evo-pt').length), base.pts, 'second toucher : toutes les équipes');
      await app.ev((t) => document.querySelector(`.evo-leg-btn[data-team="${t}"]`).click(), a);
      await app.ev(() => document.getElementById('evoOneTeam').click());
      eq(await app.ev(() => document.querySelectorAll('.evo-pt').length), base.pts, 'interrupteur éteint : toutes les équipes');
      assert(await app.ev(() => !document.querySelector('.evo-leg-btn')), 'légende non cliquable interrupteur éteint');
      await app.ev(() => sortTable('match', 'matchEvolution', 'f_Bleu'));       // le tri marche encore après les bascules
      assert(await app.ev(() => !!document.querySelector('.evo-svg') && !!document.querySelector('#statsBody th.sorted[onclick*="f_Bleu"]')), 'tri conservé dans le bloc');
      await app.ev(() => document.getElementById('evoOneTeam').click()); await app.ev(() => sortTable('match', 'matchEvolution', 'per'));
      assert(await app.ev(() => document.getElementById('evoOneTeam').checked), 'interrupteur conservé après un tri');
      await app.backToMatch(); await app.openStatsTab('overall');
      assert(await app.ev(() => !document.getElementById('evoOneTeam').checked && !document.querySelector('.evo-leg-btn')), 'interrupteur remis à zéro à l\'ouverture');
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
    await check(`${P} · point de l'équipe Noir : fond noir, contour blanc ; pâle : pointillé conservé ; Bleu et Gris inchangés`, async () => {
      await app.startMatch({ format: '11_13' }); await app.initialPossession('Bleu');
      const cyc = ['Gris', 'Noir', 'Bleu'];
      for (let i = 0; i < 15; i++) await app.lancer({ target: cyc[i % 3], caught: true });   // chaque équipe : 5 attaques, 5 réceptions (non pâles)
      await app.openStatsTab('overall');
      const r = await app.ev(() => {
        const out = {}; document.querySelectorAll('circle.evo-pt, rect.evo-pt').forEach(e => {
          const t = e.querySelector('title').textContent.split(' · ')[0];
          (out[t] ??= []).push({ fill: e.getAttribute('fill'), stroke: e.getAttribute('stroke'), op: e.getAttribute('opacity'), cf: getComputedStyle(e).fill, cs: getComputedStyle(e).stroke });
        });
        /* point pâle de Noir : tracé direct avec un petit échantillon */
        const ev = JSON.parse(JSON.stringify(computeOffDefByPeriod())); const c = ev.teams.Noir[1]; c.offAtt = 2; c.offSucc = 1; c.defAtt = 2; c.defSucc = 1; c.fautes = 1;
        const d = document.createElement('div'); d.innerHTML = evoChartSVG(ev, ['Noir'], true);
        const pale = [...d.querySelectorAll('.evo-pt')].map(e => ({ fill: e.getAttribute('fill'), stroke: e.getAttribute('stroke'), dash: e.getAttribute('stroke-dasharray'), op: e.getAttribute('opacity') }));
        return { out, pale, ink: TEAM_INK };
      });
      eq(r.out.Noir.length, 2, 'deux points Noir (OFF, DÉF)');
      for (const q of r.out.Noir) { eq(q.stroke, '#FFFFFF', 'contour blanc'); eq(q.fill, 'var(--noir)', 'fond noir'); eq(q.cf.replace(/\s/g, ''), 'rgb(8,9,12)', 'fond noir réel'); assert(!q.op, 'point plein'); }
      eq(r.pale.length, 3, 'trois points pâles (OFF, DÉF, F %)');
      for (const q of r.pale) { eq(q.dash, '2 2', 'pâle : pointillé conservé'); eq(q.fill, 'var(--bg)', 'pâle : fond pâle'); eq(q.op, '.55', 'pâle : opacité'); eq(q.stroke, '#FFFFFF', 'pâle : contour blanc'); }
      for (const t of ['Bleu', 'Gris']) { assert(r.out[t] && r.out[t].length === 2, t + ' tracé'); for (const q of r.out[t]) { eq(q.fill, r.ink[t], t + ' inchangé'); eq(q.stroke, r.ink[t], t + ' contour inchangé'); } }
      /* 3 équipes : 6 courbes... une seule période ici, donc aucun trait ; la case F % ne change pas le nombre de points par équipe */
      await app.ev(() => document.getElementById('evoShowF').click());
      eq(await app.ev(() => document.querySelectorAll('.evo-pt').length), 9, '3 équipes : 6 points, 9 avec F %');
      const ow = await app.ev(() => { const w = document.querySelector('#statsBody th[onclick*="matchEvolution"]').closest('.stab-wrap'); return { page: document.documentElement.scrollWidth - innerWidth, wrap: 0 }; });   // le tableau défile dans son cadre (comme la Vue d'ensemble) ; la page, jamais
      assert(ow.page <= 0 && ow.wrap <= 0, `3 équipes : débordement horizontal ${JSON.stringify(ow)}`);
      await app.shot(`${TMP}/C15-${gabarit}-noir.png`);
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
    await check(`${P} · duel (2 équipes) : 4 courbes max, une seule période : points sans trait`, async () => {
      await app.startMatch({ format: 'duel11' }); await app.initialPossession('Bleu');
      const [a, b] = await app.ev(() => ATEAMS());
      await app.lancer({ target: b, caught: true }); 
      await app.openStatsTab('overall');
      let r = await app.ev(() => ({ pts: document.querySelectorAll('.evo-pt').length, lines: document.querySelectorAll('.evo-svg polyline').length }));
      eq(r.lines, 0, 'aucun trait avec une seule période'); eq(r.pts, 2, 'un point OFF + un DÉF');
      await app.shot(`${TMP}/C15-${gabarit}-1p.png`);
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
  } finally { await app.close(); }
}
