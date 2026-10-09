/* C21 : saisie près du doigt, menu radial (réglage d'appareil kinball.saisie = 'radiale', défaut ; 'feuille' = avant).
   1  lancer : une rangée par équipe adverse (ATTRAPÉ | ÉCHAPPÉ | DÉF ILL) + Annuler près du point de relâchement, entière
      dans le terrain (centre, quatre bords, quatre coins), libellés, appels, tailles, aucun débordement ; duel ; Noir (liseré) ;
   2  ATTRAPÉ / ÉCHAPPÉ avec alignement : 4 disques en diagonale + « ? » centrés sur le bouton touché, entiers dans le terrain,
      bons joueurs ; même résultat final qu'en mode feuille pour les mêmes gestes ;
   3  DÉF ILL : aucun menu de joueurs, événement identique au mode feuille ;
   4  sans alignement : aucun menu radial des joueurs ;
   5  faute : grille des 8 types, REPRISE DE JEU, Annuler ; puis menu radial avec FAUTE D'ÉQUIPE ; reprise de jeu ;
   6  garde-fous : (a) couche qui se ferme, (b) double appui, (c) voile, (d) pointerdown du terrain, (e) ↶ atteignable,
      (f) fin de période et élimination, (g) accueil puis retour ;
   7  verrou portrait du téléphone (uiRotation ±90°) ; 8 (contrôle négatif : voir README) ;
   9  non-régression : mode feuille identique à la référence (S, export, save()), mode radial identique au mode feuille ;
   10 fuzz en mode radial (mêmes graines que le mode feuille).
   Captures dans SORTIE/captures/C21/. Contrôle négatif : KINBALL_HTML=<avant>/kinball.C21.avant.html KINBALL_ONLY=C21 node tests/run.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { launch, assert, eq, SORTIE, exigerAvant } from '../lib.mjs';
import { runFuzz } from '../fuzz.mjs';

export const gabarits = ['tablette', 'telephone'];
const AVANT_NOM = 'kinball.C21.avant.html';
const CAPT = path.join(SORTIE, 'captures', 'C21');
const NORM = s => { const c = JSON.parse(JSON.stringify(s)); delete c.id; delete c.createdAt; delete c.matchName; delete c.authorId; (c.history || []).forEach(e => { delete e.at; }); return c; };   /* C28 : `at` (heure des événements) est propre à chaque partie */
const NOUV_COLS = ['ID du match', 'Date du match', 'Heure de l’action', 'Code de faute'];   /* C28 : colonnes ajoutées en fin de ligne ; l'ID et les dates changent d'une partie à l'autre */

/* ---------- aides ---------- */
async function ouvrir(gabarit, o = {}) {
  const app = await launch(gabarit, { saisie: 'radiale', ...(o.launch || {}) });
  await app.startMatch({ format: o.format || '9_11', withRosters: !!o.rosters });
  if (await app.ev(() => !!S.awaitingInitial)) await app.initialPossession(o.poss || 'Gris');
  return app;
}
/* Glisser du point `from` au point `to` (normalisés) SANS choisir : la couche radiale s'ouvre au point de relâchement. */
async function lacher(app, to = [0.7, 0.6], from) {
  from = from || (Math.abs(to[0] - 0.5) < 0.1 && Math.abs(to[1] - 0.5) < 0.1 ? [0.3, 0.3] : [0.5 + (to[0] - 0.5) * 0.5, 0.5 + (to[1] - 0.5) * 0.5]);
  const a = await app._pt(from), b = await app._pt(to), m = app.page.mouse;
  await m.move(a.x, a.y); await m.down(); await m.move(b.x, b.y, { steps: 2 }); await m.up();
  await attendre(app, 'result');
  return b;
}
async function toucher(app, at = [0.5, 0.5]) {
  const a = await app._pt(at), m = app.page.mouse;
  await m.move(a.x, a.y); await m.down(); await m.up();
  await attendre(app, 'fault');
  return a;
}
const attendre = (app, stage) => app.page.waitForFunction(st => {
  const r = document.getElementById('radial');
  return r.classList.contains('open') && !r.classList.contains('closing') && radialStage === st && r.getAnimations({ subtree: true }).length === 0;
}, stage, { timeout: 4000, polling: 10 });
const infoRadial = app => app.ev(() => {
  const r = document.getElementById('radial'), f = document.getElementById('field').getBoundingClientRect();
  const R = x => ({ l: x.left, t: x.top, r: x.right, b: x.bottom });
  return {
    open: r.classList.contains('open'), closing: r.classList.contains('closing'), stage: radialStage, field: R(f),
    fw: document.getElementById('field').offsetWidth, fh: document.getElementById('field').offsetHeight,
    btns: [...r.querySelectorAll('.rd-btn')].map(b => {
      const q = b.getBoundingClientRect();
      return { call: b.getAttribute('onclick'), text: b.textContent.trim(), ...R(q), cx: (q.left + q.right) / 2, cy: (q.top + q.bottom) / 2, lw: b.offsetWidth, lh: b.offsetHeight, ll: b.offsetLeft, lt: b.offsetTop,
        over: b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1, shadow: getComputedStyle(b).boxShadow, bg: getComputedStyle(b).backgroundColor, bc: getComputedStyle(b).borderColor };
    }),
    cap: (r.querySelector('.rd-cap') || {}).textContent || null,
  };
});
/* Centre attendu du menu des joueurs : celui du bouton touché, ramené dans le cadre (marge = rayon 84 + 32), repère local. */
const centreAttendu = (bt, fw, fh) => ({ x: Math.max(120, Math.min(fw - 120, bt.ll + bt.lw / 2)), y: Math.max(142, Math.min(fh - 124, bt.lt + bt.lh / 2)) });
const dansTerrain = (x, f, tol = 1) => x.l >= f.l - tol && x.r <= f.r + tol && x.t >= f.t - tol && x.b <= f.b + tol;
const dist = (p, x) => Math.hypot(Math.max(x.l - p.x, 0, p.x - x.r), Math.max(x.t - p.y, 0, p.y - x.b));
const radialFerme = app => app.ev(() => { const r = document.getElementById('radial'); return !r.classList.contains('open') && !r.classList.contains('closing'); });
const sansSaisie = app => app.ev(() => pending === null);
const nHist = app => app.ev(() => S.history.length);
const last = app => app.ev(() => { const e = S.history[S.history.length - 1]; return e && { type: e.type, d: e.details }; });
async function tapAt(app, x, y) {
  if (app.gabarit === 'telephone') await app.page.touchscreen.tap(x, y); else await app.page.mouse.click(x, y);
}
const cible = (app, k = 0) => app.ev(k => { const o = ATEAMS().filter(t => t !== S.possession && t !== S.eliminated); return o[k % o.length]; }, k);
const attaquant = app => app.ev(() => S.possession);
const arrondi = st => { st.history.forEach(e => { delete e.ts; delete e.by; const d = e.details || {}; ['start_norm', 'end_norm', 'position_norm'].forEach(k => { if (d[k]) d[k] = d[k].map(v => Math.round(v * 100) / 100); }); }); return st; };

/* Une séquence de gestes (lancers avec et sans joueur, DÉF ILL, fautes avec joueur / équipe / sans, reprise, abandon, ↶). */
async function jouer(app, avecJoueurs = true) {
  const pid = async n => avecJoueurs ? `${await attaquant(app)}_p${n}` : undefined;
  await app.lancer({ target: await cible(app, 0), caught: true, player: await pid(1) });
  await app.lancer({ target: await cible(app, 1), caught: false, from: [0.2, 0.4], to: [0.8, 0.6] });
  await app.defIll({ target: await cible(app, 0) });
  await app.faute({ code: 'EXT', player: await pid(2) });
  await app.faute({ code: 'PENTE', player: avecJoueurs ? '__equipe__' : undefined });
  await app.reprise({ team: await cible(app, 0) });
  await app.abandon({ at: [0.3, 0.7] });
  await app.lancer({ target: await cible(app, 0), caught: true, player: await pid(3) });
  await app.faute({ code: 'APPEL' });
  await app.lancer({ target: await cible(app, 1), caught: false, player: await pid(4), from: [0.8, 0.8], to: [0.3, 0.2] });
  await app.undo();
}
async function resultat(app) {
  const st = arrondi(NORM(await app.state()));
  const rows = await app.ev(() => buildActionRows().rows);
  rows.forEach(x => { delete x['Saisi par']; NOUV_COLS.forEach(k => { delete x[k]; }); ['X départ', 'Y départ', 'X arrivée', 'Y arrivée'].forEach(k => { if (typeof x[k] === 'number') x[k] = Math.round(x[k] * 100) / 100; }); });
  return { st: JSON.stringify(st), rows: JSON.stringify(rows), saves: await app.ev(() => window.__saves) };
}
async function compter(app) {
  await app.settle(); await app.page.waitForTimeout(150);
  await app.ev(() => { window.__saves = 0; const s0 = save; save = function (retry) { if (!retry) window.__saves++; return s0.apply(this, arguments); }; });
}
async function matchJoue(gabarit, opts, o = {}) {
  const app = await launch(gabarit, opts);
  try {
    await app.startMatch({ format: '9_11', withRosters: !!o.rosters });
    await app.initialPossession('Gris');
    await compter(app);
    await jouer(app, !!o.rosters);
    return await resultat(app);
  } finally { await app.close(); }
}

export default async function ({ gabarit, check: checkTout }) {
  /* C21_ONLY=<regex sur le nom> : ne lance que certaines vérifications (réglage, contrôles de mutation). */
  const check = (nom, fn, o) => (process.env.C21_ONLY && !new RegExp(process.env.C21_ONLY).test(nom)) ? null : checkTout(nom, fn, o);
  fs.mkdirSync(CAPT, { recursive: true });
  const P = `[${gabarit}] C21`;
  const phone = gabarit === 'telephone';
  const hMin = phone ? 48 : 56;

  /* ---------- 1 : étage « résultat » ---------- */
  await check(`${P}·1 lancer : rangées d'équipe près du relâchement, entières dans le terrain (centre, bords, coins), libellés, appels, tailles`, async () => {
    const app = await ouvrir(gabarit);
    try {
      const pts = { centre: [0.5, 0.5], hg: [0.04, 0.04], hd: [0.96, 0.04], bg: [0.04, 0.96], bd: [0.96, 0.96], haut: [0.5, 0.04], bas: [0.5, 0.96], gauche: [0.04, 0.5], droite: [0.96, 0.5] };
      for (const [nom, to] of Object.entries(pts)) {
        const P0 = await lacher(app, to);
        const r = await infoRadial(app);
        eq(r.stage, 'result', `${nom} : étage`);
        eq(r.btns.map(b => b.call), ["pickResult('Bleu',true)", "pickResult('Bleu',false)", "pickDefIll('Bleu')", "pickResult('Noir',true)", "pickResult('Noir',false)", "pickDefIll('Noir')", 'cancelPendingEvent()'], `${nom} : appels`);
        eq(r.btns.map(b => b.text), ['ATTRAPÉ', 'ÉCHAPPÉ', 'DÉF ILL', 'ATTRAPÉ', 'ÉCHAPPÉ', 'DÉF ILL', 'Annuler'], `${nom} : libellés`);
        r.btns.forEach(b => { assert(dansTerrain(b, r.field), `${nom} : bouton hors du terrain ${b.call} ${JSON.stringify([b.l, b.t, b.r, b.b])} / ${JSON.stringify(r.field)}`); assert(!b.over, `${nom} : texte qui déborde (${b.call})`); });
        const eq3 = r.btns.slice(0, 6);
        eq3.forEach(b => assert(b.lh >= hMin, `${nom} : hauteur ${b.lh} < ${hMin}`));
        assert(eq3[2].lw >= 56 && eq3[5].lw >= 56, `${nom} : DÉF ILL trop étroit (${eq3[2].lw})`);
        assert(eq3[2].lw < eq3[0].lw, 'DÉF ILL plus étroit qu\'ATTRAPÉ');
        const rangee = eq3.slice(0, 3), W = rangee[2].ll + rangee[2].lw - rangee[0].ll;
        if (phone) assert(W <= r.fw - 16 + 1, `${nom} : rangée ${W} > terrain − 16`); else assert(Math.abs(W - 300) <= 2, `${nom} : largeur de rangée ${W} ≠ 300`);
        const box = { l: Math.min(...r.btns.map(b => b.l)), r: Math.max(...r.btns.map(b => b.r)), t: Math.min(...r.btns.map(b => b.t)), b: Math.max(...r.btns.map(b => b.b)) };
        assert(dist(P0, box) <= 160, `${nom} : menu à ${dist(P0, box).toFixed(0)} px du doigt`);
        if (nom === 'centre') { assert(Math.abs((box.l + box.r) / 2 - P0.x) <= 3 && Math.abs((box.t + box.b) / 2 - P0.y) <= 3, 'menu centré sur le doigt (au centre du terrain)'); await app.shot(path.join(CAPT, `resultat_centre_${gabarit}.png`)); }
        if (nom === 'hd') await app.shot(path.join(CAPT, `resultat_coin_${gabarit}.png`));
        await app.clickSheet('cancelPendingEvent()'); await app.settle();
        assert(await sansSaisie(app) && await radialFerme(app), `${nom} : Annuler ferme sans saisie`);
      }
      eq(await nHist(app), 0, 'aucun événement');
    } finally { await app.close(); }
  });

  await check(`${P}·1b Noir : liseré blanc ; ÉCHAPPÉ et DÉF ILL voilés ; couleurs d'équipe ; duel : une seule rangée`, async () => {
    const app = await ouvrir(gabarit);
    try {
      await lacher(app);
      const r = await infoRadial(app);
      const noir = r.btns.slice(3, 6), bleu = r.btns.slice(0, 3);
      noir.forEach(b => assert(b.shadow.includes('rgba(255, 255, 255, 0.55)'), `liseré blanc de Noir absent (${b.shadow})`));
      bleu.forEach(b => assert(!b.shadow.includes('rgba(255, 255, 255, 0.55)'), 'Bleu sans liseré'));
      assert(bleu[1].shadow.includes('rgba(0, 0, 0, 0.24)') && bleu[2].shadow.includes('rgba(0, 0, 0, 0.24)') && !bleu[0].shadow.includes('rgba(0, 0, 0, 0.24)'), 'voile sur ÉCHAPPÉ et DÉF ILL seulement');
      const attendu = await app.ev(() => ['Bleu', 'Noir'].map(t => { const i = document.createElement('i'); i.style.background = TEAM_BG[t]; document.body.appendChild(i); const c = getComputedStyle(i).backgroundColor; i.remove(); return c; }));
      eq([bleu[0].bg, noir[0].bg], attendu, 'couleurs d\'équipe');
      await app.clickSheet('cancelPendingEvent()'); await app.settle();
    } finally { await app.close(); }
    const d = await ouvrir(gabarit, { format: 'duel11', poss: 'Bleu' });
    try {
      await lacher(d);
      const r = await infoRadial(d);
      eq(r.btns.map(b => b.call), ["pickResult('Gris',true)", "pickResult('Gris',false)", "pickDefIll('Gris')", 'cancelPendingEvent()'], 'duel : une rangée');
      await d.shot(path.join(CAPT, `duel_${gabarit}.png`));
    } finally { await d.close(); }
  });

  /* ---------- 2 : étage « joueurs » ---------- */
  await check(`${P}·2 ATTRAPÉ / ÉCHAPPÉ avec alignement : 4 disques + « ? » centrés sur le bouton touché, entiers dans le terrain, bons joueurs`, async () => {
    const app = await ouvrir(gabarit, { rosters: true });
    try {
      for (const [caught, to] of [[true, [0.7, 0.6]], [false, [0.35, 0.45]], [true, [0.96, 0.96]], [false, [0.04, 0.04]]]) {
        await lacher(app, to);
        const avant = await infoRadial(app);
        const bt = avant.btns.find(b => b.call === `pickResult('Bleu',${caught})`);
        await app.clickSheet(`pickResult('Bleu',${caught})`);
        await attendre(app, 'players');
        const r = await infoRadial(app);
        eq(r.btns.map(b => b.call), ["choosePlayer('Gris_p1')", "choosePlayer('Gris_p2')", "choosePlayer('Gris_p3')", "choosePlayer('Gris_p4')", "choosePlayer('')"], 'appels : 4 joueurs + « ? », pas de faute d\'équipe');
        eq(r.btns.slice(0, 4).map(b => b.text), [1, 2, 3, 4].map(i => `Gris joueur ${i}`), 'joueurs de l\'équipe qui attaque');
        r.btns.forEach(b => { assert(dansTerrain(b, r.field), `bouton hors du terrain (${b.call}) pour ${to}`); assert(b.lw >= 56 && b.lh >= 56, `disque trop petit ${b.lw}`); });
        const q = r.btns[4], ex = centreAttendu(bt, r.fw, r.fh);
        assert(Math.abs(q.ll + q.lw / 2 - ex.x) <= 1.5 && Math.abs(q.lt + q.lh / 2 - ex.y) <= 1.5, `« ? » centré sur le bouton touché, ramené dans le cadre (attendu ${ex.x},${ex.y} ; obtenu ${q.ll + q.lw / 2},${q.lt + q.lh / 2})`);
        if (r.fw > 600 && to[0] > 0.3 && to[0] < 0.8) assert(Math.abs(q.cx - bt.cx) <= 1.5 && Math.abs(q.cy - bt.cy) <= 1.5, 'tablette : « ? » exactement sur le bouton touché');
        const s2 = Math.SQRT1_2 * 84;
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], i) => {
          const b = r.btns[i];
          assert(Math.abs(b.cx - q.cx - sx * s2) <= 1.5 && Math.abs(b.cy - q.cy - sy * s2) <= 1.5, `disque ${i} en diagonale (${(b.cx - q.cx).toFixed(1)}, ${(b.cy - q.cy).toFixed(1)})`);
        });
        assert(/QUI A LANCÉ/.test(r.cap || ''), 'légende : ' + r.cap);
        if (to[0] === 0.7 && caught) await app.shot(path.join(CAPT, `joueurs_${gabarit}.png`));
        if (to[0] === 0.96) await app.shot(path.join(CAPT, `joueurs_coin_${gabarit}.png`));
        await app.clickSheet("choosePlayer('Gris_p2')"); await app.settle();
        const e = await last(app);
        eq([e.d.result, e.d.attacker_player_id, e.d.target], [caught ? 'attrapé' : 'échappé', 'Gris_p2', 'Bleu'], 'événement');
        await app.ev(() => { S.possession = 'Gris'; });   // même attaquant pour les gestes suivants
      }
    } finally { await app.close(); }
  });

  await check(`${P}·2b Noir qui attaque : disques à liseré blanc ; « ? » enregistre sans joueur`, async () => {
    const app = await ouvrir(gabarit, { rosters: true, poss: 'Noir' });
    try {
      await lacher(app); await app.clickSheet("pickResult('Bleu',false)"); await attendre(app, 'players');
      const r = await infoRadial(app);
      r.btns.slice(0, 4).forEach(b => assert(/255, 255, 255/.test(b.bc), 'liseré blanc des disques de Noir : ' + b.bc));
      await app.clickSheet("choosePlayer('')"); await app.settle();
      const e = await last(app);
      assert(!e.d.attacker_player_id && e.d.result === 'échappé', 'sans joueur');
    } finally { await app.close(); }
  });

  await check(`${P}·2c mêmes gestes en mode feuille et en mode radial : même S, même export, même nombre de save()`, async () => {
    const f = await matchJoue(gabarit, { saisie: 'feuille' }, { rosters: true });
    const r = await matchJoue(gabarit, { saisie: 'radiale' }, { rosters: true });
    eq(r.st, f.st, 'S'); eq(r.rows, f.rows, 'export'); eq(r.saves, f.saves, 'save()');
  });

  /* ---------- 3 : DÉF ILL ---------- */
  await check(`${P}·3 DÉF ILL : aucun menu de joueurs ; événement identique à celui du mode feuille`, async () => {
    const run = async saisie => {
      const app = await launch(gabarit, { saisie });
      try {
        await app.startMatch({ format: '9_11', withRosters: true }); await app.initialPossession('Gris');
        await app.defIll({ target: 'Bleu', from: [0.3, 0.3], to: [0.6, 0.4] });
        const nDisc = await app.ev(() => document.querySelectorAll('#radial .rd-disc, #sheet .player-pick').length);
        eq(nDisc, 0, 'aucun menu de joueurs');
        return { nDisc, st: JSON.stringify(arrondi(NORM(await app.state()))) };
      } finally { await app.close(); }
    };
    const a = await run('feuille'), b = await run('radiale');
    eq(b.st, a.st, 'événement et état identiques');
  });

  /* ---------- 4 : sans alignement ---------- */
  await check(`${P}·4 sans alignement complet : aucun menu radial des joueurs, la saisie se termine au résultat`, async () => {
    const app = await ouvrir(gabarit);
    try {
      await lacher(app); await app.clickSheet("pickResult('Bleu',true)"); await app.settle();
      eq(await app.ev(() => document.querySelectorAll('#radial .rd-disc').length), 0, 'aucun disque');
      eq(await nHist(app), 1, 'événement enregistré');
      const e = await last(app); assert(!e.d.attacker_player_id, 'sans joueur');
      // alignement incomplet (3 joueurs) : pareil
      await app.ev(() => { TEAMS.forEach(t => { S.rosters[t] = [1, 2, 3, 4, 5].map(i => ({ id: t + '_p' + i, name: t + ' joueur ' + i })); S.lineups[t] = [1, 2, 3].map(i => t + '_p' + i); }); });
      await lacher(app); await app.clickSheet(`pickResult('${await cible(app)}',false)`); await app.settle();
      eq(await app.ev(() => document.querySelectorAll('#radial .rd-disc').length), 0, 'alignement incomplet : aucun disque');
      eq(await nHist(app), 2, 'second événement');
    } finally { await app.close(); }
  });

  /* ---------- 5 : faute ---------- */
  await check(`${P}·5 faute : grille 2 × 4 des types, REPRISE DE JEU, Annuler ; puis menu radial avec FAUTE D'ÉQUIPE`, async () => {
    const app = await ouvrir(gabarit, { rosters: true });
    try {
      for (const at of [[0.5, 0.5], [0.04, 0.96], [0.96, 0.04]]) {
        await toucher(app, at);
        const r = await infoRadial(app);
        const F = await app.ev(() => FAULTS.map(f => [`pickFault('${f}')`, faultLabel(f)]));
        eq(r.btns.map(b => b.call), [...F.map(x => x[0]), 'pickReprise()', 'cancelPendingEvent()'], 'appels : 8 fautes, reprise, annuler');
        eq(r.btns.slice(0, 8).map(b => b.text), F.map(x => x[1]), 'libellés (faultLabel)');
        r.btns.forEach(b => { assert(dansTerrain(b, r.field), `hors du terrain : ${b.call}`); assert(!b.over, `texte qui déborde : ${b.call}`); });
        const g = r.btns.slice(0, 8);
        eq([...new Set(g.map(b => Math.round(b.ll)))].length, 2, 'deux colonnes'); eq([...new Set(g.map(b => Math.round(b.lt)))].length, 4, 'quatre rangées');
        g.forEach(b => assert(b.lh >= hMin, `hauteur ${b.lh}`));
        if (at[0] === 0.5) await app.shot(path.join(CAPT, `faute_${gabarit}.png`));
        await app.clickSheet('cancelPendingEvent()'); await app.settle();
        assert(await sansSaisie(app) && await radialFerme(app), 'Annuler');
      }
      await toucher(app); await app.clickSheet("pickFault('EXT')"); await attendre(app, 'players');
      const p = await infoRadial(app);
      eq(p.btns.map(b => b.call), ["choosePlayer('Gris_p1')", "choosePlayer('Gris_p2')", "choosePlayer('Gris_p3')", "choosePlayer('Gris_p4')", "choosePlayer('')", "choosePlayer('__equipe__')"], 'joueurs, « ? », FAUTE D\'ÉQUIPE');
      p.btns.forEach(b => assert(dansTerrain(b, p.field), `hors du terrain : ${b.call}`));
      assert(p.btns[5].cy > p.btns[4].cy + 40 && p.btns[5].lw > 100, 'bouton large sous le « ? »');
      assert(/QUI A FAIT LA FAUTE/.test(p.cap || ''), p.cap);
      await app.shot(path.join(CAPT, `faute_joueurs_${gabarit}.png`));
      await app.clickSheet("choosePlayer('__equipe__')"); await app.settle();
      let e = await last(app);
      eq([e.type, e.d.fault_type, e.d.fault_scope, e.d.attacker_player_id], ['faute_directe', 'EXT', 'equipe', undefined], 'faute d\'équipe');
      await toucher(app, [0.96, 0.96]); await app.clickSheet("pickFault('APPEL')"); await attendre(app, 'players');
      const p2 = await infoRadial(app); p2.btns.forEach(b => assert(dansTerrain(b, p2.field), `coin : hors du terrain ${b.call}`));
      await app.clickSheet("choosePlayer('Gris_p3')"); await app.settle();
      e = await last(app); eq([e.d.fault_type, e.d.attacker_player_id, e.d.fault_scope], ['APPEL', 'Gris_p3', undefined], 'faute d\'un joueur');
      // reprise de jeu : feuille « qui repart au ballon ? » (choix assumé), événement de type reprise, aucun point
      const sc = await app.ev(() => JSON.stringify(S.scores));
      await toucher(app); await app.clickSheet('pickReprise()');
      await app.clickSheet("applyReprise('Bleu')"); await app.settle();
      e = await last(app); eq([e.type, e.d.team], ['reprise', 'Bleu'], 'reprise');
      eq(await app.ev(() => JSON.stringify(S.scores)), sc, 'aucun point');
    } finally { await app.close(); }
  });

  await check(`${P}·5b faute : même événement qu'en mode feuille (type, joueur, équipe, reprise)`, async () => {
    const un = async saisie => {
      const app = await launch(gabarit, { saisie });
      try {
        await app.startMatch({ format: '9_11', withRosters: true }); await app.initialPossession('Gris');
        await app.faute({ code: 'PENTE', player: '__equipe__' }); await app.faute({ code: 'M1C', player: 'Gris_p4' }); await app.faute({ code: 'OFF ILL' });
        await app.reprise({ team: 'Noir' }); await app.faute({ code: 'EXT', player: 'Noir_p1' });
        return JSON.stringify(arrondi(NORM(await app.state())));
      } finally { await app.close(); }
    };
    eq(await un('radiale'), await un('feuille'), 'état identique');
  });

  /* ---------- 6 : garde-fous ---------- */
  await check(`${P}·6a appui pendant la fermeture de la couche (animation réelle) : aucun effet, aucun nouveau geste`, async () => {
    const app = await ouvrir(gabarit, { launch: { anim: true } });
    try {
      await lacher(app);
      const r = await infoRadial(app);
      const def = r.btns.find(b => b.call === "pickDefIll('Bleu')"), can = r.btns.find(b => b.call === 'cancelPendingEvent()');
      await app.clickSheet('cancelPendingEvent()');
      const st = await app.ev(() => { const r = document.getElementById('radial'); const b = r.querySelector('.rd-btn'); return { closing: r.classList.contains('closing'), pe: b ? getComputedStyle(b).pointerEvents : 'none' }; });
      assert(st.closing && st.pe === 'none', 'couche « closing », boutons inertes : ' + JSON.stringify(st));
      await tapAt(app, def.cx, def.cy);                                    // ancien DÉF ILL
      await tapAt(app, can.cx + (phone ? 0 : 60), can.cy - 140);           // ailleurs sur la couche
      await tapAt(app, r.field.l + 20, r.field.t + 20);                    // coin du terrain
      await app.page.waitForTimeout(80);
      assert(await sansSaisie(app), 'aucune saisie ouverte par un appui fantôme');
      eq(await nHist(app), 0, 'aucun événement');
      await app.page.waitForTimeout(400); await app.settle();
      assert(await radialFerme(app) && await sansSaisie(app), 'couche fermée, aucune saisie');
      // la saisie suivante fonctionne
      await app.lancer({ target: 'Bleu', caught: true });
      eq(await nHist(app), 1, 'saisie normale ensuite');
    } finally { await app.close(); }
  });

  await check(`${P}·6b double appui : au point de relâchement, d'un étage à l'autre (centre du menu des joueurs) : un seul choix`, async () => {
    const app = await ouvrir(gabarit, { rosters: true, launch: { anim: true } });
    try {
      // (1) deuxième appui au point où le doigt vient de se lever : avalé, la couche reste ouverte
      let P0 = await app._pt([0.6, 0.55]), m = app.page.mouse;
      const A = await app._pt([0.4, 0.4]);
      await m.move(A.x, A.y); await m.down(); await m.move(P0.x, P0.y, { steps: 2 }); await m.up();
      await m.click(P0.x, P0.y);
      await app.page.waitForTimeout(60);
      eq(await app.ev(() => [radialStage, pending !== null, S.history.length]), ['result', true, 0], 'appui au point de relâchement avalé');
      // (2) même chose au point de relâchement d'une faute (grille de fautes)
      await app.clickSheet('cancelPendingEvent()'); await app.settle();
      await app.page.waitForTimeout(350);
      P0 = await app._pt([0.5, 0.5]);
      await m.move(P0.x, P0.y); await m.down(); await m.up(); await m.click(P0.x, P0.y);
      await app.page.waitForTimeout(60);
      eq(await app.ev(() => [radialStage, pending !== null, S.history.length]), ['fault', true, 0], 'faute : appui au point de relâchement avalé');
      await app.clickSheet('cancelPendingEvent()'); await app.settle();
      // (3) étage résultat → étage joueurs : second appui au centre du menu (« ? ») avalé
      await lacher(app, [0.6, 0.55]);
      const r = await infoRadial(app), bt = r.btns.find(b => b.call === "pickResult('Bleu',true)");
      await app.clickSheet("pickResult('Bleu',true)");
      await m.click(bt.cx, bt.cy);                                         // double appui au même endroit : tombe sur « ? »
      await app.page.waitForTimeout(60);
      eq(await app.ev(() => [radialStage, pending !== null, S.history.length]), ['players', true, 0], 'double appui au centre du menu des joueurs avalé');
      await app.page.waitForTimeout(350);
      await m.click(bt.cx, bt.cy);                                         // appui voulu, plus tard : « ? »
      await app.settle();
      eq(await nHist(app), 1, 'un seul choix');
      const e = await last(app); assert(!e.d.attacker_player_id, 'le choix est « ? »');
    } finally { await app.close(); }
  });

  await check(`${P}·6c voile : annule sans événement aux étages résultat et faute ; sans effet à l'étage des joueurs`, async () => {
    const app = await ouvrir(gabarit, { rosters: true });
    try {
      const coin = r => ({ x: r.field.l + 6, y: r.field.b - 6 });
      await lacher(app, [0.5, 0.2]);
      let r = await infoRadial(app); let c = coin(r);
      await app.page.waitForTimeout(350); await tapAt(app, c.x, c.y); await app.settle();
      assert(await sansSaisie(app) && await radialFerme(app) && (await nHist(app)) === 0, 'résultat : voile = annuler');
      await toucher(app, [0.5, 0.2]); r = await infoRadial(app); c = coin(r);
      await app.page.waitForTimeout(350); await tapAt(app, c.x, c.y); await app.settle();
      assert(await sansSaisie(app) && await radialFerme(app) && (await nHist(app)) === 0, 'faute : voile = annuler');
      await lacher(app, [0.5, 0.3]); await app.clickSheet("pickResult('Bleu',false)"); await attendre(app, 'players');
      r = await infoRadial(app); c = coin(r);
      await app.page.waitForTimeout(350); await tapAt(app, c.x, c.y); await app.page.waitForTimeout(100);
      eq(await app.ev(() => [radialStage, pending !== null, S.history.length]), ['players', true, 0], 'joueurs : voile sans effet');
      await app.clickSheet("choosePlayer('Gris_p1')"); await app.settle();
      eq(await nHist(app), 1, 'la saisie se termine par un joueur');
    } finally { await app.close(); }
  });

  await check(`${P}·6d un pointerdown sur le terrain pendant la couche ne crée rien (résultat, faute, joueurs)`, async () => {
    const app = await ouvrir(gabarit, { rosters: true });
    try {
      const essai = async (nom) => {
        const av = await app.ev(() => ({ p: pending && pending.type, st: radialStage, h: S.history.length }));
        await app.ev(() => {
          const f = document.getElementById('field'), q = f.getBoundingClientRect();
          const mk = (t, x, y) => f.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 7, isPrimary: true }));
          mk('pointerdown', q.left + 30, q.top + 30); mk('pointermove', q.left + 120, q.top + 90); mk('pointerup', q.left + 120, q.top + 90);
        });
        const ap = await app.ev(() => ({ p: pending && pending.type, st: radialStage, h: S.history.length, d: dragging }));
        eq([ap.p, ap.st, ap.h, ap.d], [av.p, av.st, av.h, false], `${nom} : rien ne change`);
      };
      await lacher(app, [0.6, 0.5]); await essai('résultat');
      await app.clickSheet("pickResult('Bleu',true)"); await attendre(app, 'players'); await essai('joueurs');
      await app.clickSheet('cancelPendingEvent()').catch(() => {});
      await app.ev(() => cancelPendingEvent()); await app.settle();
      await toucher(app); await essai('faute');
      await app.ev(() => cancelPendingEvent()); await app.settle();
    } finally { await app.close(); }
  });

  await check(`${P}·6e ↶ reste atteignable par un vrai appui à chaque étage (la couche ne recouvre que le terrain)`, async () => {
    const app = await ouvrir(gabarit, { rosters: true });
    try {
      await app.lancer({ target: 'Bleu', caught: true, player: 'Gris_p1' });   // un événement : ↶ actif
      const sel = phone ? '#undoBtnPhone' : '#undoBtn';
      const verif = async nom => {
        const r = await app.ev(sel => {
          const u = document.querySelector(sel), q = u.getBoundingClientRect(), x = (q.left + q.right) / 2, y = (q.top + q.bottom) / 2;
          const hit = document.elementFromPoint(x, y), rd = document.getElementById('radial').getBoundingClientRect();
          return { x, y, ok: !!hit && (hit === u || u.contains(hit)), dis: u.disabled, inter: !(rd.right <= q.left || rd.left >= q.right || rd.bottom <= q.top || rd.top >= q.bottom) };
        }, sel);
        assert(r.ok && !r.dis && !r.inter, `${nom} : ↶ recouvert ou inactif ${JSON.stringify(r)}`);
        await app.page.waitForTimeout(450);                       // réarmement de ↶ après un appui de couche
        await tapAt(app, r.x, r.y);
        eq(await app.ev(() => [pending !== null, S.history.length]), [true, 1], `${nom} : ↶ n'agit pas pendant une saisie (comme avant : undo() refuse si pending)`);
      };
      await lacher(app, [0.5, 0.5]); await verif('résultat');
      await app.clickSheet("pickResult('Gris',true)").catch(async () => { await app.clickSheet("pickResult('Noir',true)"); });
      await attendre(app, 'players'); await verif('joueurs');
      await app.ev(() => cancelPendingEvent()); await app.settle();
      await toucher(app); await verif('faute');
      await app.ev(() => cancelPendingEvent()); await app.settle();
    } finally { await app.close(); }
  });

  await check(`${P}·6f élimination et fin de période par un lancer saisi en radial : mêmes états qu'en mode feuille`, async () => {
    const elim = async saisie => {
      const app = await launch(gabarit, { saisie });
      try {
        await app.startMatch({ format: '9_11', withRosters: true }); await app.initialPossession('Gris');
        await app.ev(() => { S.scores = { Bleu: 8, Gris: 3, Noir: 1 }; renderScoreboard(); });
        await app.lancer({ target: 'Noir', caught: false, player: 'Gris_p1' });
        assert(await app.awaitingDuel(), 'duel proposé');
        assert(await app.sheetHas("chooseDuelStart('Gris')"), 'feuille du duel');
        const j = JSON.stringify(arrondi(NORM(await app.state())));
        await app.duelStart('Gris');
        return j;
      } finally { await app.close(); }
    };
    eq(await elim('radiale'), await elim('feuille'), 'élimination : même état');
    const per = async saisie => {
      const app = await launch(gabarit, { saisie });
      try {
        await app.startMatch({ format: '9_11', withRosters: true }); await app.initialPossession('Bleu');
        await app.ev(() => { S.scores = { Bleu: 10, Gris: 3, Noir: 3 }; S.eliminated = 'Noir'; S.duelActive = true; renderScoreboard(); });
        await app.lancer({ target: 'Gris', caught: false, player: 'Bleu_p2' });
        await app.settle();
        const w = await app.ev(() => JSON.stringify(S.periodWins));
        return { w, st: JSON.stringify(arrondi(NORM(await app.state()))) };
      } finally { await app.close(); }
    };
    const a = await per('radiale'), b = await per('feuille');
    eq(JSON.parse(a.w).Bleu, 1, 'periodWins une seule fois'); eq(a.st, b.st, 'fin de période : même état');
  });

  await check(`${P}·6g accueil puis retour pendant la couche : aucun état résiduel (saisie jetée, aucun point, aucun événement)`, async () => {
    const app = await ouvrir(gabarit, { rosters: true });
    try {
      await app.lancer({ target: 'Bleu', caught: true, player: 'Gris_p1' });
      for (const etage of ['resultat', 'joueurs', 'faute']) {
        const sc = await app.ev(() => JSON.stringify([S.scores, S.possession, S.history.length]));
        if (etage === 'faute') await toucher(app); else await lacher(app, [0.5, 0.5]);
        if (etage === 'joueurs') { await app.clickSheet(`pickResult('${await cible(app)}',true)`); await attendre(app, 'players'); }
        await app.ev(() => { navHome(); navTo('match'); });
        await app.page.waitForTimeout(300); await app.settle();
        assert(await radialFerme(app), etage + ' : couche fermée');
        assert(await sansSaisie(app), etage + ' : saisie en attente jetée');
        eq(await app.ev(() => JSON.stringify([S.scores, S.possession, S.history.length])), sc, etage + ' : aucun point, aucun événement');
        eq(await app.ev(() => [playerPickCont === null, document.getElementById('sheet').classList.contains('open')]), [true, false], etage + ' : aucune feuille');
        await app.page.waitForTimeout(450);
        await app.undo();                                                  // ↶ fonctionne (aucun pending orphelin)
        await app.lancer({ target: await cible(app), caught: true, player: `${await attaquant(app)}_p1` });
      }
    } finally { await app.close(); }
  });

  await check(`${P}·6i ⌂ et menu de navigation refusés pendant la saisie radiale (aucune saisie orpheline) ; ↶ fonctionne ensuite`, async () => {
    const app = await ouvrir(gabarit, { rosters: true });
    try {
      await app.lancer({ target: 'Bleu', caught: true, player: 'Gris_p1' });
      for (const etage of ['resultat', 'joueurs', 'faute']) {
        if (etage === 'faute') await toucher(app); else await lacher(app, [0.5, 0.5]);
        if (etage === 'joueurs') { await app.clickSheet(`pickResult('${await cible(app)}',true)`); await attendre(app, 'players'); }
        const n = await nHist(app);
        await app.ev(() => { goHome(); openNavMenu(); });
        await app.page.waitForTimeout(100);
        eq(await app.ev(() => [document.getElementById('sheet').classList.contains('open'), pending !== null, radialIsOpen()]), [false, true, true], etage + ' : aucune feuille, saisie et couche intactes');
        /* l'étage des joueurs n'a pas d'Annuler (le voile n'y fait rien) : on le termine par « ? », puis ↶ retire cet événement */
        await app.clickSheet(etage === 'joueurs' ? "choosePlayer('')" : 'cancelPendingEvent()'); await app.page.waitForTimeout(300); await app.settle();
        assert(await sansSaisie(app) && await radialFerme(app), etage + ' : terminée proprement');
        await app.page.waitForTimeout(450);
        await app.undo();
        eq(await nHist(app), etage === 'joueurs' ? n : n - 1, etage + ' : ↶ fonctionne');
        await app.lancer({ target: await cible(app), caught: true, player: `${await attaquant(app)}_p1` });
      }
    } finally { await app.close(); }
  });

  await check(`${P}·6j redimensionnement / rotation avec une couche ouverte : saisie annulée proprement, aucun événement`, async () => {
    const app = await ouvrir(gabarit, { rosters: true });
    try {
      const [w, h] = phone ? [360, 640] : [900, 600];
      for (const etage of ['resultat', 'joueurs', 'faute']) {
        if (etage === 'faute') await toucher(app); else await lacher(app, [0.95, 0.95]);
        if (etage === 'joueurs') { await app.clickSheet(`pickResult('${await cible(app)}',true)`); await attendre(app, 'players'); }
        await app.page.setViewportSize({ width: w, height: h });
        await app.page.waitForTimeout(450); await app.settle();
        assert(await radialFerme(app) && await sansSaisie(app), etage + ' : couche fermée, saisie annulée');
        eq(await nHist(app), 0, etage + ' : aucun événement');
        await app.page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1180, height: 820 });
        await app.page.waitForTimeout(500); await app.settle();
        await app.lancer({ target: await cible(app), caught: true }); await app.page.waitForTimeout(450); await app.undo();
      }
    } finally { await app.close(); }
  });

  if (phone) await check(`${P}·6k téléphone étroit (320 et 360 px) : grille de fautes et disques entiers dans le terrain ; noms hostiles lisibles sur deux lignes`, async () => {
    for (const [w, h] of [[320, 568], [360, 640]]) {
      const app = await ouvrir(gabarit, { rosters: true });
      try {
        await app.page.setViewportSize({ width: w, height: h }); await app.page.waitForTimeout(300);
        await app.ev(() => { const n = ['Jean-Luc', 'Jean-Marc', 'Alexandre-Olivier', '<img src=x onerror=1>"\'&']; S.rosters.Gris.forEach((p, i) => { p.name = n[i] || p.name; }); });
        await toucher(app, [0.5, 0.2]);
        let r = await infoRadial(app);
        r.btns.forEach(b => assert(dansTerrain(b, r.field), `${w} px : bouton hors du terrain (${b.call}) ${JSON.stringify([b.t, b.b, r.field])}`));
        assert(r.btns.filter(b => /pickFault/.test(b.call)).every(b => b.lh >= 36), `${w} px : boutons de faute ≥ 36 px`);
        await app.shot(path.join(CAPT, `faute_${w}.png`));
        await app.clickSheet("pickFault('EXT')"); await attendre(app, 'players');
        r = await infoRadial(app);
        r.btns.forEach(b => assert(dansTerrain(b, r.field), `${w} px : disque hors du terrain (${b.call})`));
        const ov = await app.ev(() => [...document.querySelectorAll('#radial .rd-disc .rd-t')].map(e => [e.textContent, e.scrollHeight <= e.parentElement.clientHeight]));
        assert(ov.every(x => x[1]), `${w} px : noms dans le disque ${JSON.stringify(ov)}`);
        await app.shot(path.join(CAPT, `joueurs_noms_${w}.png`));
        await app.clickSheet("choosePlayer('')");
      } finally { await app.close(); }
    }
  });

  await check(`${P}·6l fermeture courte après Annuler / voile (un glisser à 150 ms est accepté) ; appui fantôme après un choix toujours sans effet`, async () => {
    const app = await ouvrir(gabarit, { rosters: true, launch: { anim: true } });
    try {
      await lacher(app);
      await app.clickSheet('cancelPendingEvent()');
      await app.page.waitForTimeout(140);
      await lacher(app, [0.6, 0.4]);
      assert(await app.ev(() => pending !== null && pending.type === 'lancer'), 'glisser accepté juste après Annuler');
      const r = await infoRadial(app);
      const veil = r.field;
      await app.page.mouse.click(veil.l + 6, veil.t + 6);                       // voile
      await app.page.waitForTimeout(140);
      await lacher(app, [0.4, 0.6]);
      assert(await app.ev(() => pending !== null), 'glisser accepté juste après le voile');
      await app.clickSheet(`pickResult('${await cible(app)}',true)`); await attendre(app, 'players');
      const d = (await infoRadial(app)).btns.find(b => b.call === "choosePlayer('Gris_p2')");
      await app.clickSheet("choosePlayer('Gris_p2')");
      const t0 = Date.now();
      await tapAt(app, d.cx, d.cy);
      const encore = Date.now() - t0 < 200 && await app.ev(() => document.getElementById('radial').classList.contains('closing'));   // le tactile émulé peut dépasser les 240 ms : on ne juge que l'appui tombé pendant la fermeture
      if (encore) { await app.page.waitForTimeout(30); assert(await sansSaisie(app), 'aucune saisie ouverte par un appui fantôme'); }
      eq(await nHist(app), 1, 'un seul événement');
      await app.page.waitForTimeout(450); await app.settle();
    } finally { await app.close(); }
  });

  await check(`${P}·6h réglage d'appareil : défaut radiale, 'feuille' = feuilles d'avant, choix lu à l'ouverture du menu, rien dans S`, async () => {
    const app = await launch(gabarit, { saisie: null });
    try {
      eq(await app.ev(() => saisieMode()), 'radiale', 'défaut');
      await app.startMatch({ format: '9_11', withRosters: true }); await app.initialPossession('Gris');
      const s0 = JSON.stringify(Object.keys(await app.state()).sort());
      await lacher(app); assert(await app.ev(() => radialIsOpen()), 'radiale par défaut');
      await app.ev(() => setSaisieMode('feuille'));                         // changer de réglage ne casse pas la saisie en cours
      await app.clickSheet("pickResult('Bleu',true)"); await attendre(app, 'players');
      await app.clickSheet("choosePlayer('Gris_p1')"); await app.settle();
      eq(await nHist(app), 1, 'saisie en cours menée à terme');
      await app.page.mouse.move(10, 10);
      const a = await app._pt([0.4, 0.4]), b = await app._pt([0.7, 0.7]), m = app.page.mouse;
      await m.move(a.x, a.y); await m.down(); await m.move(b.x, b.y, { steps: 2 }); await m.up();
      await app.page.waitForFunction(() => document.getElementById('sheet').classList.contains('open') && !!document.querySelector('#sheet .opp-block'), null, { timeout: 4000 });
      eq(await app.ev(() => document.getElementById('radial').classList.contains('open')), false, 'feuille du bas en mode feuille');
      await app.clickSheet('cancelPendingEvent()'); await app.settle();
      eq(JSON.stringify(Object.keys(await app.state()).sort()), s0, 'aucun champ ajouté à S');
      eq(await app.ev(() => JSON.stringify(Object.keys(S).filter(k => /saisie|radial/i.test(k)))), '[]', 'rien de la saisie dans S');
      // le réglage de l'écran « nouveau match »
      await app.ev(() => { navHome(); openNewMatch(); setSaisieMode('radiale'); });
      eq(await app.ev(() => [localStorage.getItem('kinball.saisie'), document.getElementById('saisieRadBtn').classList.contains('active')]), ['radiale', true], 'bouton du réglage');
      // localStorage indisponible : repli sur radiale sans erreur
      await app.ev(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('bloqué'); }, configurable: true }); });
      eq(await app.ev(() => saisieMode()), 'radiale', 'localStorage bloqué : défaut');
    } finally { await app.close(); }
  });

  /* ---------- 7 : verrou portrait (téléphone) ---------- */
  if (phone) {
    await check(`${P}·7 verrou portrait (uiRotation ±90°) : menus au bon endroit dans le terrain, clics aux coordonnées réelles`, async () => {
      for (const ori of [90, -90]) {
        const app = await launch('telephone', { saisie: 'radiale' });
        try {
          await app.page.addInitScript(o => { Object.defineProperty(window, 'orientation', { get: () => o, configurable: true }); }, ori);
          await app.startMatch({ format: '9_11', withRosters: true }); await app.initialPossession('Gris');
          await app.page.setViewportSize({ width: 844, height: 390 });
          await app.page.evaluate(o => { try { Object.defineProperty(window, 'orientation', { get: () => o, configurable: true }); } catch (_) {} applyPhoneOrientation(); }, ori);
          const rot = await app.ev(() => uiRotation); assert(rot === 90 || rot === -90, 'verrou actif : ' + rot);
          const m = app.page.mouse;
          const fb = await app.ev(() => { const q = document.getElementById('field').getBoundingClientRect(); return { l: q.left, t: q.top, w: q.width, h: q.height }; });
          const at = (u, v) => ({ x: fb.l + u * fb.w, y: fb.t + v * fb.h });          // u, v : fractions de la BOÎTE À L'ÉCRAN
          for (const [nom, u, v] of [['centre', 0.55, 0.5], ['coin', 0.95, 0.06], ['coin2', 0.06, 0.95]]) {
            const a = at(0.5, 0.5), b = at(u, v);
            await m.move(a.x, a.y); await m.down(); await m.move(b.x, b.y, { steps: 3 }); await m.up();
            await attendre(app, 'result');
            const r = await infoRadial(app);
            r.btns.forEach(x => assert(dansTerrain(x, r.field, 1.5), `${ori}° ${nom} : ${x.call} hors du terrain ${JSON.stringify([x.l, x.t, x.r, x.b])} / ${JSON.stringify(r.field)}`));
            const box = { l: Math.min(...r.btns.map(x => x.l)), r: Math.max(...r.btns.map(x => x.r)), t: Math.min(...r.btns.map(x => x.t)), b: Math.max(...r.btns.map(x => x.b)) };
            assert(dist(b, box) <= 160, `${ori}° ${nom} : menu à ${dist(b, box).toFixed(0)} px du doigt`);
            if (nom === 'centre') await app.shot(path.join(CAPT, `rotation_${ori}_resultat.png`));
            const bt = r.btns.find(x => x.call === "pickResult('Bleu',true)");
            await app.clickSheet("pickResult('Bleu',true)"); await attendre(app, 'players');
            const p = await infoRadial(app);
            p.btns.forEach(x => assert(dansTerrain(x, p.field, 1.5), `${ori}° ${nom} : joueurs : ${x.call} hors du terrain`));
            const q = p.btns[4];
            const ex = centreAttendu(bt, p.fw, p.fh);
            assert(Math.abs(q.ll + q.lw / 2 - ex.x) <= 1.5 && Math.abs(q.lt + q.lh / 2 - ex.y) <= 1.5, `${ori}° ${nom} : « ? » centré sur le bouton touché (repère du terrain)`);
            if (nom === 'centre') await app.shot(path.join(CAPT, `rotation_${ori}_joueurs.png`));
            await app.page.waitForTimeout(350);
            await tapAt(app, p.btns[1].cx, p.btns[1].cy); await app.settle();           // vrai appui sur le disque 2
            const e = await last(app); eq(e.d.attacker_player_id, 'Gris_p2', `${ori}° ${nom} : le bon joueur`);
            await app.ev(() => { S.possession = 'Gris'; });
          }
          // faute : grille et FAUTE D'ÉQUIPE
          const c = at(0.5, 0.5);
          await m.move(c.x, c.y); await m.down(); await m.up(); await attendre(app, 'fault');
          const rf = await infoRadial(app); rf.btns.forEach(x => assert(dansTerrain(x, rf.field, 1.5), `${ori}° faute : ${x.call} hors du terrain`));
          await app.clickSheet("pickFault('APPEL')"); await attendre(app, 'players');
          const pf = await infoRadial(app); pf.btns.forEach(x => assert(dansTerrain(x, pf.field, 1.5), `${ori}° faute joueurs : ${x.call} hors du terrain`));
          await app.page.waitForTimeout(350);
          await tapAt(app, pf.btns[5].cx, pf.btns[5].cy); await app.settle();
          eq((await last(app)).d.fault_scope, 'equipe', `${ori}° faute d'équipe par un vrai appui`);
        } finally { await app.close(); }
      }
    });
  }

  /* ---------- 9 : non-régression ---------- */
  await check(`${P}·9a mode feuille : même S, même export, même nombre de save() que la référence (avant C21)`, async () => {
    const ref = exigerAvant(AVANT_NOM);
    const a = await matchJoue(gabarit, { html: ref }, { rosters: true }), b = await matchJoue(gabarit, { saisie: 'feuille' }, { rosters: true });
    eq(b.saves, a.saves, 'nombre de save()'); eq(b.st, a.st, 'S'); eq(b.rows, a.rows, 'export');
    const a2 = await matchJoue(gabarit, { html: ref }, { rosters: false }), b2 = await matchJoue(gabarit, { saisie: 'feuille' }, { rosters: false });
    eq(b2.saves, a2.saves, 'sans alignement : save()'); eq(b2.st, a2.st, 'sans alignement : S'); eq(b2.rows, a2.rows, 'sans alignement : export');
  });

  await check(`${P}·9b mêmes gestes en mode radial : S et export identiques à ceux du mode feuille (sans alignement aussi)`, async () => {
    const f = await matchJoue(gabarit, { saisie: 'feuille' }, { rosters: false }), r = await matchJoue(gabarit, { saisie: 'radiale' }, { rosters: false });
    eq(r.st, f.st, 'S'); eq(r.rows, f.rows, 'export'); eq(r.saves, f.saves, 'save()');
  });

  /* ---------- 10 : fuzz en mode radial ---------- */
  await runFuzz({ gabarit, check, saisie: 'radiale', tag: 'C21·10 fuzz radial' });
}
