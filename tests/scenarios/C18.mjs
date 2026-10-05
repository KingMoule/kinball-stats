/* C18 : une seule grille 3×3 (classement, heat map, terrain, zones, export). */
import fs from 'node:fs';
import { launch, assert, eq, rng, SORTIE } from '../lib.mjs';
import { Model, pickAction, play } from '../model.mjs';

const TMP = `${SORTIE}/captures/C18`;   /* KINBALL_SORTIE, jamais dans le dépôt */
fs.mkdirSync(TMP, { recursive: true });
export const gabarits = ['tablette', 'telephone'];
export default async function ({ gabarit, check }) {
  const app = await launch(gabarit);
  const P = `[${gabarit}] C18`;
  const LAB = ['Haut gauche','Haut centre','Haut droite','Milieu gauche','Centre','Milieu droite','Bas gauche','Bas centre','Bas droite'];
  try {
    await check(`${P} · classifyZone : libellés et cas limites (critère 2)`, async () => {
      await app.startMatch({ format: '9_11' }); await app.initialPossession('Bleu');
      const r = await app.ev(() => ({
        a: ZONE_LABEL[classifyZone(.5,.5)], b: ZONE_LABEL[classifyZone(.05,.05)], c: ZONE_LABEL[classifyZone(.99,.5)],
        d: ZONE_LABEL[classifyZone(1.2,-.1)], e: classifyZone(.3333,.6667), n: ZONES.length,
        lab: ZONES.map(z => ZONE_LABEL[z]),
        heat: (() => { const pts = [{x:.3333,y:.6667,success:true}]; return heatCellCounts(pts).k.indexOf(1); })(),
        hz: ZONES.indexOf(classifyZone(.3333,.6667)),
      }));
      eq(r.a, 'Centre'); eq(r.b, 'Haut gauche'); eq(r.c, 'Milieu droite'); eq(r.d, 'Haut droite');
      eq(r.n, 9); eq(r.lab, LAB); eq(r.heat, r.hz, 'même case heat map / zones');
    });
    await check(`${P} · jeu avec lancers hors terrain : heat map = zones = lancers localisés (critère 3)`, async () => {
      const rg = rng(11); const m = new Model('9_11'); m.initial('Bleu');
      for (let k = 0; k < 36; k++) await play(app, m, pickAction(m, rg));
      // lancers finissant hors du terrain
      for (const to of [[1.1, -0.05], [-0.06, 1.08]]) {
        const s = await app.state();
        const tgt = await app.ev(() => { const t = ATEAMS().filter(x => x !== S.possession); return t[0]; });
        try { await app.lancer({ from: [.4, .5], to, target: tgt, caught: false }); } catch (e) { /* état inattendu : ignoré */ }
      }
      const d = await app.ev(() => {
        const out = {};
        const hist = S.history.filter(e => e.type === 'lancer' && (e.details.result === 'attrapé' || e.details.result === 'échappé'));
        out.hors = S.history.filter(e => e.type === 'lancer' && e.details.end_norm && (e.details.end_norm[0] < 0 || e.details.end_norm[0] > 1 || e.details.end_norm[1] < 0 || e.details.end_norm[1] > 1)).length;
        const ov = computeOverall(); out.rows = [];
        for (const t of ATEAMS()) {
          const o = ov[t];
          const offZ = ZONES.reduce((n, z) => n + o.offZones[z].attempts, 0), defZ = ZONES.reduce((n, z) => n + o.defZones[z].attempts, 0);
          const ptsO = heatPointsFrom(S, t, 'offense', 'all', 'start'), ptsD = heatPointsFrom(S, t, 'defense', 'all', 'end');
          const cO = heatCellCounts(ptsO), cD = heatCellCounts(ptsD);
          /* C20 : une DÉF ILL est une tentative sans coordonnées (la faute précède la frappe) */
          const diO = S.history.filter(e => e.type === 'lancer' && e.details.fault_type === 'DÉF ILL' && e.details.attacker === t).length;
          const diD = S.history.filter(e => e.type === 'lancer' && e.details.fault_type === 'DÉF ILL' && e.details.target === t).length;
          out.rows.push({ diO, diD, t, offZ, defZ, offA: o.offAttempts, defA: o.defAttempts,
            hO: cO.k.reduce((a, b) => a + b, 0), hD: cD.k.reduce((a, b) => a + b, 0), nO: ptsO.length, nD: ptsD.length });
        }
        return out;
      });
      assert(d.rows.length >= 2);
      for (const r of d.rows) {
        eq(r.hO, r.nO, 'heat off = points localisés'); eq(r.hD, r.nD, 'heat déf = points localisés');
        eq(r.offZ, r.nO, 'zones off = points localisés'); eq(r.defZ, r.nD, 'zones déf = points localisés');
        eq(r.offZ, r.offA - r.diO, 'zones off = tentatives localisées'); eq(r.defZ, r.defA - r.diD, 'zones déf = tentatives localisées');
      }
    });
    await check(`${P} · heat map : 9 cases, aucune finesse, hachures < 3 lancers (critère 6)`, async () => {
      await app.openStatsTab('heat');
      const d = await app.ev(() => ({
        rects: document.querySelectorAll('.heat-field svg g').length,
        finesse: /Finesse|[345]×[345]/.test(document.getElementById('statsBody').textContent),
        gridBtn: document.querySelectorAll('.grid-btn').length,
        hatch: document.querySelectorAll('.heat-field [fill="url(#heatHatch)"]').length,
        fn: typeof setHeatGrid + typeof setTeamHeatGrid + typeof HEAT_GRIDS,
        sansGrille: S.heatGrid,
      }));
      eq(d.rects, 9); assert(!d.finesse, 'sélecteur de finesse présent'); eq(d.gridBtn, 0);
      eq(d.fn, 'undefinedundefinedundefined'); eq(d.sansGrille, undefined, 'heatGrid absent de S');
      // case à 2 lancers hachurée, case à 3 colorée
      const h = await app.ev(() => {
        const a = heatGridSVG([{x:.1,y:.1,success:true},{x:.1,y:.1,success:false}], .5);
        const b = heatGridSVG([{x:.1,y:.1,success:true},{x:.1,y:.1,success:false},{x:.1,y:.1,success:true}], .5);
        return [(a.match(/heatHatch/g)||[]).length, (b.match(/heatHatch/g)||[]).length];
      });
      eq(h, [1, 0]);
      await app.shot(`${TMP}/C18-heat-${gabarit}.png`);
    });
    await check(`${P} · onglet Zones et détail des fautes : 9 lignes numérotées, schéma 3×3`, async () => {
      await app.ev(() => setStatTab('match', 'zones'));
      await app.settle();
      const d = await app.ev(() => ({
        rows: document.querySelectorAll('#statsBody table tbody tr').length,
        nums: [...document.querySelectorAll('#statsBody table tbody .zone-num')].map(x => x.textContent),
        svgNums: [...document.querySelectorAll('#statsBody .zone-diagram-wrap svg text')].map(x => x.textContent),
        txt: document.getElementById('statsBody').textContent,
      }));
      eq(d.rows, 9); eq(d.nums, ['1','2','3','4','5','6','7','8','9']); eq(d.svgNums, ['1','2','3','4','5','6','7','8','9']);
      assert(!/Bord de ligne|Coin|décalé/.test(d.txt), 'anciens libellés');
      await app.shot(`${TMP}/C18-zones-${gabarit}.png`);
      await app.ev(() => { openFaultDetail(ATEAMS()[0]); });
      await app.settle();
      const f = await app.ev(() => document.getElementById('faultBody') ? document.getElementById('faultBody').innerHTML.length : (document.body.textContent.includes('Haut gauche') ? 1 : 0));
      assert(f > 0, 'détail des fautes vide');
      await app.shot(`${TMP}/C18-fautes-${gabarit}.png`);
      await app.ev(() => navBack());
    });
    await check(`${P} · export : libellés 9 cases, zoneAoa = 9 lignes par équipe et par mode (critère 7)`, async () => {
      const d = await app.ev(() => {
        const aoa = zoneAoa(), rows = buildActionRows().rows;
        const labs = new Set(Object.values(ZONE_LABEL));
        const bad = rows.filter(r => (r['Zone de départ'] && !labs.has(r['Zone de départ'])) || (r['Zone d’arrivée'] && !labs.has(r['Zone d’arrivée']))).length;
        return { n: aoa.length - 1, teams: ATEAMS().length, bad, avec: rows.filter(r => r['Zone de départ']).length };
      });
      eq(d.n, 9 * 2 * d.teams); eq(d.bad, 0); assert(d.avec > 0);
    });
    await check(`${P} · écran de match : grille visible, inerte, un glisser sur une ligne est saisi (critère 5)`, async () => {
      for (let i = 0; i < 4 && !(await app.page.locator('#field').isVisible()); i++) { await app.backToMatch(); await app.settle(); }
      const g = await app.ev(() => { const e = document.getElementById('gridLayer'), cs = getComputedStyle(e); return { pe: cs.pointerEvents, h: e.offsetHeight, w: e.offsetWidth }; });
      eq(g.pe, 'none'); assert(g.h > 100 && g.w > 100, 'grille invisible');
      await app.shot(`${TMP}/C18-match-${gabarit}.png`);
      const n0 = await app.ev(() => S.history.length);
      const tgt = await app.ev(() => ATEAMS().filter(x => x !== S.possession)[0]);
      // départ posé exactement sur une ligne (1/3) et arrivée sur la ligne 2/3
      await app.lancer({ from: [1 / 3, 1 / 3], to: [2 / 3, 2 / 3], target: tgt, caught: false });
      eq(await app.ev(() => S.history.length), n0 + 1, 'lancer saisi');
      const n1 = await app.ev(() => S.history.length);
      await app.faute({ at: [1 / 3, 2 / 3], code: 'APPEL' });
      eq(await app.ev(() => S.history.length), n1 + 1, 'faute saisie');
    });
    await check(`${P} · cumul d'équipe (zones, fautes, détail par adversaire) : 9 cases, sans erreur, sommes = match`, async () => {
      const d = await app.ev(() => {
        const copy = JSON.parse(JSON.stringify(S)); copy.id = 'c18-test'; copy.teamIds = { Bleu: 'T_X', Gris: 'T_Y', Noir: null };
        MATCHES_DB.push(copy);
        const out = {};
        try {
          const agg = computeTeamAggregate('T_X');
          const h = document.createElement('div');
          h.innerHTML = sectionTeamZones(agg) + sectionTeamFaults(agg);
          out.rows = h.querySelectorAll('tbody tr').length;
          out.nums = h.querySelectorAll('.zone-num').length;
          out.svg = h.querySelectorAll('.zone-diagram-wrap svg').length;
          out.zoneSum = ZONES.reduce((n, z) => n + agg.faultZones[z], 0);
          const key = Object.keys(agg.h2h)[0];
          out.hasKey = !!key;
          if (key) {
            renderTeamOppZoneDetail('T_X', key);
            out.oppRows = document.querySelectorAll('#zoneBody tbody tr').length;
            out.oppOff = ZONES.reduce((n, z) => n + agg.h2h[key].offZones[z].attempts, 0);
          }
          out.offTot = ZONES.reduce((n, z) => n + agg.zoneOff[z].attempts, 0);
          out.offA = S.history.filter(e => e.type === 'lancer' && e.details.attacker === 'Bleu' && ['attrapé','échappé'].includes(e.details.result) && e.details.start_norm).length;
        } finally { MATCHES_DB.pop(); }
        return out;
      });
      assert(d.rows >= 18, 'lignes de zones : ' + d.rows); assert(d.nums >= 18); assert(d.svg >= 2);
      assert(d.hasKey, 'pas de détail par adversaire'); eq(d.oppRows, 9);
      eq(d.offTot, d.offA, 'cumul offensif = lancers de Bleu localisés');
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
  } finally { await app.close(); }
}
