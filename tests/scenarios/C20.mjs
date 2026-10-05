/* C20 : mots ATTRAPÉ / ÉCHAPPÉ et option DÉF ILL (défensive illégale = ballon échappé + faute de l'équipe visée).
   A  menu du résultat : libellés en toutes lettres, trois segments par équipe adverse (≥ 44 px, texte sans débordement,
      dans la feuille), un seul bloc en duel ; les appels pickResult(...) sont inchangés ;
   B  DÉF ILL : mêmes points et même reprise qu'un ballon échappé, événement `lancer` échappé avec fault_type 'DÉF ILL',
      sans joueur ni coordonnées d'arrivée imposées, aucune feuille de joueur même avec alignement et mode avancé ;
      Annuler exact ; élimination et fin de période déclenchées par une DÉF ILL ;
   C  stats : comptée pour l'équipe fautive (Fautes, Par type, détail, export), hors F % et hors zones de fautes,
      lue comme un échappé par OFF % / DÉF %, jamais « lancer sans joueur » ;
   D  un match SANS DÉF ILL donne le même S, le même export et le même nombre de save() que la référence.
   Contrôle négatif : KINBALL_HTML=<avant>/kinball.C20.avant.html KINBALL_ONLY=C20 node tests/run.mjs
   Captures dans SORTIE/captures/C20/. */
import fs from 'node:fs';
import path from 'node:path';
import { launch, assert, eq, SORTIE, exigerAvant } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];
const AVANT_NOM = 'kinball.C20.avant.html';
const CAPT = path.join(SORTIE, 'captures', 'C20');
const NORM = s => { const c = JSON.parse(JSON.stringify(s)); delete c.id; delete c.createdAt; delete c.matchName; delete c.authorId; return c; };

async function drag(app, from = [0.3, 0.3], to = [0.7, 0.7]) {
  const a = await app._pt(from), b = await app._pt(to), m = app.page.mouse;
  await m.move(a.x, a.y); await m.down(); await m.move(b.x, b.y, { steps: 2 }); await m.up();
  await app.page.waitForFunction(() => !!document.querySelector('#sheet [onclick^="pickResult"]'), null, { timeout: 4000, polling: 10 });
}
const detail = app => app.ev(() => { const e = S.history[S.history.length - 1]; return e && { type: e.type, d: e.details, b: e.before }; });
async function nouveau(gabarit, opts = {}, format = '9_11', poss = 'Gris') {
  const app = await launch(gabarit, opts.launch);
  await app.startMatch({ format, withRosters: !!opts.rosters });
  if (format !== 'duel11') await app.initialPossession(poss);
  return app;
}

export default async function ({ gabarit, check }) {
  fs.mkdirSync(CAPT, { recursive: true });
  const P = `[${gabarit}] C20`;

  await check(`${P}·1 menu du résultat : ATTRAPÉ | ÉCHAPPÉ | DÉF ILL, tailles et débordements, appels inchangés`, async () => {
    const app = await nouveau(gabarit);
    try {
      await drag(app);
      const r = await app.ev(() => {
        const sh = document.getElementById('sheet').getBoundingClientRect();
        return [...document.querySelectorAll('#sheet .opp-block')].map(bl => ({
          calls: [...bl.querySelectorAll('[onclick]')].map(x => x.getAttribute('onclick')),
          texts: [...bl.querySelectorAll('[onclick]')].map(x => x.textContent.trim()),
          boxes: [...bl.querySelectorAll('[onclick]')].map(x => { const q = x.getBoundingClientRect(); return { w: q.width, h: q.height, l: q.left, r: q.right, over: x.scrollWidth > x.clientWidth + 1 }; }),
          sh: { l: sh.left, r: sh.right },
        }));
      });
      eq(r.length, 2, 'deux équipes adverses à 3 équipes');
      r.forEach((b, i) => {
        const t = ['Bleu', 'Noir'][i];
        eq(b.texts, ['ATTRAPÉ', 'ÉCHAPPÉ', 'DÉF ILL'], 'libellés');
        eq(b.calls, [`pickResult('${t}',true)`, `pickResult('${t}',false)`, `pickDefIll('${t}')`], 'appels');
        b.boxes.forEach(x => { assert(x.w >= 44 && x.h >= 44, `segment trop petit ${JSON.stringify(x)}`); assert(!x.over, 'texte qui déborde'); assert(x.l >= b.sh.l - 1 && x.r <= b.sh.r + 1, 'hors de la feuille'); });
        assert(b.boxes[2].w < b.boxes[0].w, 'DÉF ILL plus étroit');
      });
      await app.shot(path.join(CAPT, `menu_${gabarit}.png`));
    } finally { await app.close(); }
  });

  await check(`${P}·2 duel : un seul bloc adverse, trois segments`, async () => {
    const app = await nouveau(gabarit, {}, 'duel11', 'Bleu');
    try {
      if (await app.ev(() => !!S.awaitingInitial)) await app.initialPossession('Bleu');
      await drag(app);
      const n = await app.ev(() => [document.querySelectorAll('#sheet .opp-block').length, document.querySelectorAll('#sheet .opp-block [onclick]').length]);
      eq(n, [1, 3], 'un bloc, trois segments');
    } finally { await app.close(); }
  });

  await check(`${P}·3 DÉF ILL = échappé : mêmes points, possession et départ arrêté ; forme de l'événement ; aucune feuille de joueur`, async () => {
    const mk = async def => {
      const app = await nouveau(gabarit, { rosters: true });
      await app.ev(() => { S.advancedMode = true; });
      if (def) await app.defIll({ target: 'Bleu' }); else await app.lancer({ target: 'Bleu', caught: false });
      return app;
    };
    const a = await mk(true), b = await mk(false);
    try {
      const ea = await detail(a), eb = await detail(b);
      eq(ea.type, 'lancer'); eq(ea.d.result, 'échappé'); eq(ea.d.target, 'Bleu'); eq(ea.d.fault_type, 'DÉF ILL');
      assert(!ea.d.start_norm && !ea.d.end_norm, 'aucune coordonnée stockée');
      eq(await a.ev(() => { const o = computeOverall(); return ZONES.reduce((n, z) => n + o.Gris.offZones[z].attempts + o.Bleu.defZones[z].attempts, 0); }), 0, 'ni zones ni heat map');
      eq(await a.ev(() => buildActionRows().rows[0]['Zone de départ'] + '|' + buildActionRows().rows[0]['X départ']), '|', 'export sans coordonnées');
      assert(!ea.d.attacker_player_id, 'aucun lanceur demandé');
      const sa = NORM(await a.state()), sb = NORM(await b.state());
      sa.history.forEach(e => { if (e.details) { delete e.details.fault_type; delete e.details.attacker_player_id; delete e.details.attacker_player_name; } });
      sb.history.forEach(e => { if (e.details) { delete e.details.attacker_player_id; delete e.details.attacker_player_name; } });
      [sa, sb].forEach(x => x.history.forEach(e => { if (e.details) { delete e.details.start_norm; delete e.details.end_norm; } if (e.ts) delete e.ts; if (e.by) delete e.by; }));
      eq(sa.scores, sb.scores, 'points'); eq(sa.possession, sb.possession, 'possession'); eq(sa.stopped, sb.stopped, 'départ arrêté');
      eq(await a.ev(() => !!document.querySelector('#sheet .player-pick-row')), false, 'aucune feuille de joueur');
      eq(await a.ev(() => S.scores.Bleu + '-' + S.scores.Gris + '-' + S.scores.Noir), '0-1-1', 'Gris et Noir +1');
      eq(eb.d.fault_type, undefined, 'témoin sans fault_type');
    } finally { await a.close(); await b.close(); }
  });

  await check(`${P}·4 Annuler : retour exact à l'état d'avant`, async () => {
    const app = await nouveau(gabarit, { rosters: true });
    try {
      const avant = await app.state();
      await app.defIll({ target: 'Noir' });
      assert((await app.ev(() => S.history.length)) === 1, 'un événement');
      await app.undo();
      const apres = await app.state();
      eq(JSON.stringify(apres), JSON.stringify(avant), 'état identique après Annuler');
    } finally { await app.close(); }
  });

  await check(`${P}·5 DÉF ILL qui élimine (Noir fautif à 3 équipes) puis qui termine une période`, async () => {
    const app = await nouveau(gabarit);
    try {
      await app.ev(() => { S.scores = { Bleu: 8, Gris: 3, Noir: 1 }; renderScoreboard(); });
      await app.defIll({ target: 'Noir' }).catch(() => {});   // Gris attaque : Bleu +1 → 9, élimination de Noir attendue
      const r = await app.ev(() => ({ el: S.eliminated, duel: S.duelActive, aw: S.awaitingDuelStart, n: S.history.length, ft: S.history[0] && S.history[0].details.fault_type }));
      eq([r.el, r.duel, r.aw, r.n, r.ft], ['Noir', true, true, 1, 'DÉF ILL'], JSON.stringify(r));
    } finally { await app.close(); }
    const b = await nouveau(gabarit, {}, '9_11', 'Bleu');
    try {
      await b.ev(() => { S.scores = { Bleu: 10, Gris: 3, Noir: 3 }; S.eliminated = 'Noir'; S.duelActive = true; renderScoreboard(); });
      await b.defIll({ target: 'Gris' });   // Bleu attaque, Gris défensive illégale : Bleu 11 → fin de période (le temps du minuteur est raccourci)
      const w = await b.ev(() => S.periodWins.Bleu);
      eq(w, 1, 'Bleu gagne la période une seule fois');
    } finally { await b.close(); }
  });

  await check(`${P}·6 stats : fautes de l'équipe visée, hors F %, hors zones ; lue comme un échappé ; jamais sans joueur`, async () => {
    const app = await nouveau(gabarit, { rosters: true });
    try {
      await app.lancer({ target: 'Bleu', caught: true });     // Gris -> Bleu attrapé ; Bleu en possession
      await app.defIll({ target: 'Gris' });                    // Bleu attaque, Gris : DÉF ILL
      await app.faute({ code: 'APPEL' });                      // Gris relance, faute directe de Gris
      const r = await app.ev(() => {
        const f = computeFaults(), o = computeOverall();
        const acc = {}; const x = accumulatePlayerStats(S, 'Bleu', acc, null);
        const html = sectionMatchFaults();
        const rows = buildActionRows().rows;
        return {
          gris: { faults: f.Gris.faults, defIll: f.Gris.defIll, types: f.Gris.types, actions: f.Gris.actions },
          bleu: { faults: f.Bleu.faults, defIll: f.Bleu.defIll, actions: f.Bleu.actions },
          offBleu: o.Bleu.offAttempts + '/' + o.Bleu.offSuccesses, defGris: o.Gris.defAttempts + '/' + o.Gris.defSuccesses,
          unattrBleu: x.unattributed,
          fz: computeFaultZones('Gris').total,
          htmlOk: html.includes('DÉFENSIVE ILLÉGALE') && html.includes('Par type de faute'),
          ligne: rows[1] && { r: rows[1]['Résultat'], t: rows[1]['Type de faute'], z: rows[1]['Zone d’arrivée'] },
          detailOk: (openFaultDetail('Gris'), document.getElementById('statsBody').textContent.includes('DÉFENSIVE ILLÉGALE')),
        };
      });
      eq(r.gris.defIll, 1, 'DÉF ILL de Gris'); eq(r.gris.faults, 1, 'faute directe de Gris (APPEL), hors DÉF ILL');
      eq(r.gris.types['DÉF ILL'], 1); eq(r.gris.types['APPEL'], 1);
      eq(r.bleu.defIll, 0); eq(r.bleu.faults, 0);
      eq(r.bleu.actions, 1, 'Bleu a attaqué une fois (F % : DÉF ILL non ajoutée au numérateur)');
      eq(r.offBleu, '1/1', 'OFF de Bleu : échappé'); eq(r.defGris, '1/0', 'DÉF de Gris : un ballon reçu non attrapé');
      eq(r.unattrBleu, 0, 'une DÉF ILL n\'est pas un lancer sans joueur');
      eq(r.fz, 1, 'zones de fautes : la faute directe seule');
      assert(r.htmlOk, 'libellé et tableau par type'); assert(r.detailOk, 'détail de l\'équipe');
      eq([r.ligne.r, r.ligne.t], ['Échappé', 'DÉFENSIVE ILLÉGALE'], 'ligne d\'export');
    } finally { await app.close(); }
  });

  await check(`${P}·7 match sans DÉF ILL : S, export et save() identiques à la référence`, async () => {
    const ref = exigerAvant(AVANT_NOM);
    const run = async opts => {
      const app = await launch(gabarit, opts);
      try {
        await app.startMatch({ format: '9_11', withRosters: true });
        await app.initialPossession('Gris');
        await app.settle(); await app.page.waitForTimeout(150);   /* une sauvegarde différée du démarrage ne doit pas tomber dans le décompte */
        await app.ev(() => { window.__saves = 0; const s0 = save; save = function (retry) { if (!retry) window.__saves++; return s0.apply(this, arguments); };   /* les nouvelles tentatives différées (isRetry) ne sont pas des enregistrements d'actions */ });
        await app.lancer({ target: 'Bleu', caught: true });
        await app.lancer({ target: 'Gris', caught: false, from: [0.2, 0.4], to: [0.8, 0.6] });
        await app.faute({ code: 'M1C' });
        await app.lancer({ target: 'Bleu', caught: false });
        const st = NORM(await app.state());
        st.history.forEach(e => { delete e.ts; delete e.by; const d = e.details || {}; ['start_norm', 'end_norm', 'position_norm'].forEach(k => { if (d[k]) d[k] = d[k].map(v => Math.round(v * 100) / 100); }); });   /* coordonnées arrondies : le pixel exact varie d'un chargement à l'autre */
        const rows = await app.ev(() => buildActionRows().rows);
        rows.forEach(x => { delete x['Saisi par']; ['X départ', 'Y départ', 'X arrivée', 'Y arrivée'].forEach(k => { if (typeof x[k] === 'number') x[k] = Math.round(x[k] * 100) / 100; }); });
        return { st: JSON.stringify(st), rows: JSON.stringify(rows), saves: await app.ev(() => window.__saves) };
      } finally { await app.close(); }
    };
    const a = await run({ html: ref }), b = await run({});
    eq(b.saves, a.saves, 'nombre de save()'); eq(b.st, a.st, 'S'); eq(b.rows, a.rows, 'export');
  });
}
