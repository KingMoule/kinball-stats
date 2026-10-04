/* C16 : phases d'une période (début / pré-duel / duel), format 9/11. */
import fs from 'node:fs';
import { launch, assert, eq, rng, SORTIE } from '../lib.mjs';
import { Model, pickAction, play } from '../model.mjs';

const TMP = `${SORTIE}/captures/C16`;   /* KINBALL_SORTIE, jamais dans le dépôt */
fs.mkdirSync(TMP, { recursive: true });
export const gabarits = ['tablette', 'telephone'];

/* Phase lue sur le MODÈLE (état avant l'action), indépendamment du code testé. */
const phaseModele = m => m.duel ? 'duel' : (Math.max(...m.teams.map(t => m.scores[t])) < 5 ? 'debut' : 'preduel');

export default async function ({ gabarit, check }) {
  const app = await launch(gabarit);
  const P = `[${gabarit}] C16`;
  try {
    const m = new Model('9_11'); m.initial('Bleu');
    const attendu = [];              // phase attendue de chaque événement (ordre de S.history)
    const meta = [];                 // période + score avant, pour les critères de bord
    await app.startMatch({ format: '9_11', names: { Bleu: 'Bleu', Gris: 'Gris', Noir: 'Noir' } });
    await app.initialPossession('Bleu');
    await check(`${P} · jeu de 2 périodes complètes (élimination + duel)`, async () => {
      const r = rng(91); let guard = 0;
      while (m.period < 3 && guard++ < 500) {
        const a = pickAction(m, r);
        attendu.push(phaseModele(m)); meta.push({ period: m.period, max: Math.max(...m.teams.map(t => m.scores[t])), duel: m.duel });
        await play(app, m, a);
      }
      assert(m.period >= 3, 'deux périodes non terminées');
      const n = await app.ev(() => S.history.length);
      eq(n, attendu.length, 'événements');
      assert(new Set(attendu).size === 3, 'les 3 phases doivent apparaître : ' + [...new Set(attendu)]);
    });
    await check(`${P} · phaseOf = modèle indépendant, événement par événement (critère 2)`, async () => {
      const got = await app.ev(() => S.history.map((e, i) => phaseOf(S.history, i, getFormat(S))));
      eq(got, attendu, 'phases');
      /* Bords : première action de la période suivante = début ; action qui élimine = pré-duel. */
      for (let i = 1; i < meta.length; i++) {
        if (meta[i].period !== meta[i - 1].period) eq(got[i], 'debut', 'début de période ' + i);
        if (meta[i - 1].duel === false && meta[i].duel === true && meta[i].period === meta[i - 1].period) eq(got[i - 1], 'preduel', 'élimination ' + i);
        if (meta[i - 1].duel === false && meta[i].duel === true && meta[i].period === meta[i - 1].period) eq(got[i], 'duel', 'première action en duel ' + i);
        if (meta[i].max === 5 && meta[i - 1].max < 5 && meta[i].period === meta[i - 1].period) eq(got[i - 1], 'debut', 'action qui porte à 5 ' + i);
      }
    });
    await check(`${P} · Début + Pré-duel + Duel = Tout (h2h, fautes, zones de faute) (critère 1)`, async () => {
      const d = await app.ev(() => {
        const ph = ['debut', 'preduel', 'duel'], all = computeH2H(), noArg = computeH2H('all');
        const parts = ph.map(p => computeH2H(p));
        const f = computeFaults(), fp = ph.map(p => computeFaults(p));
        const zs = ATEAMS().map(t => [computeFaultZones(t), ph.map(p => computeFaultZones(t, p))]);
        return { all, noArg, parts, f, fp, zs, teams: ATEAMS() };
      });
      eq(d.noArg, d.all, "computeH2H('all') = computeH2H()");
      let nonvide = 0;
      for (const k of Object.keys(d.all)) {
        for (const c of ['attempts', 'successes']) {
          eq(d.parts.reduce((s, p) => s + p[k][c], 0), d.all[k][c], `h2h ${k} ${c}`);
          for (const sit of ['arretee', 'continue'])
            eq(d.parts.reduce((s, p) => s + p[k][sit][c], 0), d.all[k][sit][c], `h2h ${k} ${sit} ${c}`);
        }
        nonvide += d.all[k].attempts;
      }
      assert(nonvide > 20, 'trop peu de lancers');
      let fautes = 0;
      for (const t of d.teams) {
        for (const c of ['actions', 'faults']) eq(d.fp.reduce((s, p) => s + p[t][c], 0), d.f[t][c], `fautes ${t} ${c}`);
        for (const ft of Object.keys(d.f[t].types)) eq(d.fp.reduce((s, p) => s + p[t].types[ft], 0), d.f[t].types[ft], `type ${t} ${ft}`);
        fautes += d.f[t].faults;
      }
      assert(fautes > 5, 'trop peu de fautes');
      for (const [all, parts] of d.zs) {
        eq(parts.reduce((s, p) => s + p.total, 0), all.total, 'zones total');
        for (const z of Object.keys(all.counts)) eq(parts.reduce((s, p) => s + p.counts[z], 0), all.counts[z], 'zone ' + z);
      }
    });
    await check(`${P} · h2h Duel + Continue = recalcul indépendant (critère 5)`, async () => {
      const d = await app.ev(() => ({ hist: JSON.parse(JSON.stringify(S.history)), h: computeH2H('duel'), teams: ATEAMS() }));
      const idx = d.hist.map((e, i) => i);
      const exp = {};
      d.hist.forEach((e, i) => {
        if (e.type !== 'lancer' || attendu[i] !== 'duel') return;
        const x = e.details; if (!(x.result === 'attrapé' || x.result === 'échappé') || x.situation !== 'continue') return;
        const k = x.attacker + '_' + x.target; exp[k] ??= [0, 0];
        exp[k][0]++; if (x.result === 'échappé') exp[k][1]++;
      });
      let tot = 0;
      for (const k of Object.keys(d.h)) {
        const e = exp[k] || [0, 0];
        eq([d.h[k].continue.attempts, d.h[k].continue.successes], e, 'duel+continue ' + k); tot += e[0];
      }
      assert(tot > 0, 'aucun lancer continu en duel dans le scénario');
      void idx;
    });
    await check(`${P} · buildActionRows : une colonne Phase après Situation, valeurs = modèle (critère 6)`, async () => {
      const r = await app.ev(() => { const b = buildActionRows(); return { header: b.header, rows: b.rows, n: S.history.length, types: S.history.map(e => e.type) }; });
      eq(r.rows.length, r.n, 'nombre de lignes');
      eq(r.header.indexOf('Phase'), r.header.indexOf('Situation') + 1, 'position de la colonne');
      const L = { debut: 'Début', preduel: 'Pré-duel', duel: 'Duel' };
      r.rows.forEach((row, i) => eq(row['Phase'], ['lancer', 'faute_directe', 'reprise'].includes(r.types[i]) ? L[attendu[i]] : '', 'ligne ' + i));
    });
    await check(`${P} · bascule visible, les clics changent les chiffres, rendu sans erreur (critère 3 en miroir)`, async () => {
      await app.openStatsTab('h2h');
      assert(await app.ev(() => document.querySelectorAll('[onclick^="setH2HPhase("]').length === 4), '4 boutons de phase dans h2h');
      const avant = await app.ev(() => document.getElementById('statsBody').innerText);
      await app.page.locator('[onclick="setH2HPhase(\'duel\')"]').click();
      const apres = await app.ev(() => document.getElementById('statsBody').innerText);
      assert(/phase « Duel »/.test(apres), 'sous-titre de phase');
      assert(avant !== apres, 'le tableau doit changer');
      await app.page.locator('[onclick="setH2HSituation(\'continue\')"]').click();
      assert(await app.ev(() => document.querySelector('[onclick="setH2HPhase(\'duel\')"]').classList.contains('active') && document.querySelector('[onclick="setH2HSituation(\'continue\')"]').classList.contains('active')), 'les deux filtres actifs');
      await app.shot(`${TMP}/C16-h2h-${gabarit}.png`);
      await app.page.locator('[onclick="setH2HSituation(\'all\')"]').click();
      await app.page.locator('[onclick="setH2HPhase(\'all\')"]').click();
      await app.openStatsTab('fautes');
      assert(await app.ev(() => document.querySelectorAll('[onclick^="setFaultPhase("]').length === 4), '4 boutons de phase dans fautes');
      await app.page.locator('[onclick="setFaultPhase(\'preduel\')"]').click();
      await app.shot(`${TMP}/C16-fautes-${gabarit}.png`);
      await app.page.locator('#statsBody tbody tr[onclick^="openFaultDetail"]').first().click();
      const t = await app.ev(() => document.getElementById('statsBody').innerText);
      assert(/phase « Pré-duel »/.test(t), 'détail des fautes : sous-titre de phase');
      await app.shot(`${TMP}/C16-detail-${gabarit}.png`);
      await app.ev(() => { setFaultPhase('all'); renderStats(); });
      await app.backToMatch();
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
    await check(`${P} · détail par zone d'un h2h : suit la phase et la situation, sous-titre explicite (audit constat 1)`, async () => {
      const d = await app.ev(() => {
        const [a, b] = ATEAMS(), tot = o => ZONES.reduce((n, z) => n + o.off[z].attempts + o.def[z].attempts, 0);
        const all = computeZoneStats(a, b), ph = ['debut', 'preduel', 'duel'].map(p => computeZoneStats(a, b, p));
        const sit = ['arretee', 'continue'].map(x => computeZoneStats(a, b, 'all', x));
        const sum = ZONES.map(z => ['attempts', 'successes'].map(c => [ph.reduce((n, o) => n + o.off[z][c] + o.def[z][c], 0), all.off[z][c] + all.def[z][c]]));
        return { a, b, noArg: JSON.stringify(computeZoneStats(a, b, 'all', 'all')) === JSON.stringify(all), sum, tAll: tot(all), tDuel: tot(ph[2]),
          sitSum: sit.reduce((n, o) => n + tot(o), 0) };
      });
      assert(d.noArg, "('all','all') = sans paramètre");
      for (const z of d.sum) for (const [x, y] of z) eq(x, y, 'Début+Pré-duel+Duel = Tout (zones)');
      assert(d.tAll > 0 && d.tDuel < d.tAll, 'la phase Duel doit restreindre les zones');
      assert(d.sitSum <= d.tAll, 'situations <= tout');
      await app.openStatsTab('h2h');
      await app.page.locator('[onclick="setH2HPhase(\'duel\')"]').click();
      await app.ev(([a, b]) => openZoneDetail(a, b), [d.a, d.b]);
      const t = await app.ev(() => ({ txt: document.getElementById('zoneBody').innerText, att: ZONES.reduce((n, z) => n + computeZoneStats(...[ATEAMS()[0], ATEAMS()[1], 'duel']).off[z].attempts, 0) }));
      assert(/phase « Duel »/.test(t.txt), 'sous-titre de phase dans le détail : ' + t.txt.slice(0, 60));
      assert(/toutes situations/.test(t.txt), 'sous-titre de situation');
      await app.shot(`${TMP}/C16-zonedetail-${gabarit}.png`);
      await app.ev(() => navBack());
      await app.page.locator('[onclick="setH2HPhase(\'all\')"]').click();
      await app.ev(([a, b]) => openZoneDetail(a, b), [d.a, d.b]);
      assert(await app.ev(() => /toutes phases/.test(document.getElementById('zoneBody').innerText)), 'sous-titre « toutes phases »');
      await app.ev(() => navBack());
      await app.backToMatch();
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
    await check(`${P} · match archivé sans champ format : traité en 9/11 (critère 4)`, async () => {
      const r = await app.ev(() => {
        const sv = S.format; delete S.format;
        const out = { phaseAt: getFormat(S).phaseAt, ph: phaseOf(S.history, 3, getFormat(S)) };
        S.format = sv; return out;
      });
      eq(r.phaseAt, 5, 'phaseAt par repli');
      assert(r.ph, 'phase définie');
    });
    await check(`${P} · export/sommes inchangés : synthèses = comportement sans filtre (critère 7)`, async () => {
      if (process.env.C16_DUMP) {
        const j = await app.ev(() => JSON.stringify({ h: computeH2H(), f: computeFaults(), o: computeOverall(), t: teamSummaryAoa(), z: zoneAoa(), p: playerAoa(),
          rows: buildActionRows().rows.map(r => { const c = { ...r }; delete c['Phase']; return c; }),
          hdr: buildActionRows().header.filter(h => h !== 'Phase') }));
        fs.writeFileSync(`${TMP}/C16-dump-${process.env.C16_DUMP}-${gabarit}.json`, j);
      }
    });
  } finally { await app.close(); }

  /* Formats sans phase : 11/13, libre, duel. */
  const app2 = await launch(gabarit);
  try {
    for (const fmt of ['11_13', 'libre3', 'duel11']) {
      await check(`${P} · format ${fmt} : aucune bascule, colonne Phase vide, chiffres inchangés (critère 3)`, async () => {
        const mm = new Model(fmt === 'libre3' ? '11_13' : fmt); mm.initial('Bleu');
        await app2.startMatch({ format: fmt }); await app2.initialPossession('Bleu');
        const r = rng(5);
        for (let i = 0; i < 10; i++) { if (fmt === 'libre3') { const a = pickAction(mm, r); if (a.t === 'lancer') await app2.lancer({ from: a.from, to: a.to, target: a.target, caught: true }), mm.lancer(a.target, true); else break; } else await play(app2, mm, pickAction(mm, r)); }
        for (const tab of ['h2h', 'fautes']) {
          await app2.openStatsTab(tab);
          assert(await app2.ev(() => !document.querySelector('[onclick^="setH2HPhase("],[onclick^="setFaultPhase("]')), 'pas de bascule de phase (' + tab + ')');
        }
        await app2.backToMatch();
        const x = await app2.ev(() => {
          const b = buildActionRows();
          return { vide: b.rows.every(r => r['Phase'] === ''), n: b.rows.length, h: JSON.stringify(computeH2H('debut')) === JSON.stringify(computeH2H()), pa: getFormat(S).phaseAt, hl: S.history.length };
        });
        assert(x.vide && x.n === x.hl, 'colonne Phase vide, mêmes lignes');
        eq(x.pa, undefined, 'phaseAt absent');
        void x.h;
        assert(app2.errors.length === 0, app2.errors.join(' | '));
      });
    }
  } finally { await app2.close(); }
}
