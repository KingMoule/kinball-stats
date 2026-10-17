/* TFP2 (T-FP robustesse et garde commune : F26, E5, F42, audit #13, D2, saisie N2 à N5). Détail : tests/docs/TFP2.md.
   Vrais délais (timescale 1) pour les fenêtres de fin de période ; vrais appuis. */
import { launch, assert, eq } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];

const until = (app, fn, arg, timeout = 4000) => app.page.waitForFunction(fn, arg, { timeout, polling: 10 });
async function un(gabarit, f, opts = { timescale: 1 }) {
  const app = await launch(gabarit, opts);
  try { return await f(app); } finally { await app.close(); }
}
async function setup(app, { format = 'duel11', poss = 'Bleu', scores = { Bleu: 10, Gris: 4, Noir: 0 }, advanced = false, rosters = false } = {}) {
  await app.startMatch({ format, withRosters: rosters });
  await app.initialPossession('Bleu');
  await app.ev(([sc, po, adv]) => { S.scores = sc; S.possession = po; if (adv) S.advancedMode = true; renderScoreboard(); }, [scores, poss, advanced]);
}
/* Chaque document écrit dans la base, avec l'instant (ms après le geste qui conclut). */
const espion = app => app.ev(() => {
  window.__docs = []; window.__t0 = null;
  for (const n of ['applyResult', 'applyFault', 'endPeriodManually', 'endPeriodByLeader']) {
    const o = window[n]; window[n] = function (...a) { if (window.__t0 === null) window.__t0 = performance.now(); return o.apply(this, a); };
  }
  const w = window.writeMatchDoc;
  window.writeMatchDoc = m => { window.__docs.push({ t: performance.now() - (window.__t0 || 0), period: m.period, scores: { ...m.scores }, pw: { ...m.periodWins }, poss: m.possession, h: m.history.length, el: m.eliminated }); return w(m); };
});
async function drag(app) {
  const a = await app._pt([0.3, 0.3]), b = await app._pt([0.7, 0.7]), m = app.page.mouse;
  await m.move(a.x, a.y); await m.down(); await m.move(b.x, b.y, { steps: 2 }); await m.up();
}
async function tapEl(app, sel) {
  const r = await app.ev(s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, sel);
  if (app.gabarit === 'telephone') await app.page.touchscreen.tap(r.x, r.y); else await app.page.mouse.click(r.x, r.y);
}
const ruban = app => app.ev(() => ({ sc: [...document.querySelectorAll('#scoreboard .team-chip .tscore')].map(e => e.textContent.trim()), per: document.getElementById('periodTag').textContent }));
const undoSel = phone => phone ? '#undoBtnPhone' : '#undoBtn';

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] TFP2`;
  const phone = gabarit === 'telephone';

  /* ---------- 1 · F26, E5 : la remise à zéro est dans S et dans la base dès l'action ; seul l'affichage attend ---------- */
  for (const chemin of ['echappe', 'faute', 'avance']) await check(`${P}·1 (${chemin}) fin de période au seuil : S et chaque écriture sont déjà dans la période 2 (période comptée une fois) ; le ruban montre 11 et « PÉRIODE 1 » jusqu'à la fin du message`, async () => {
    await un(gabarit, async app => {
      await setup(app, chemin === 'faute' ? { poss: 'Gris' } : { advanced: chemin === 'avance', rosters: chemin === 'avance' });
      const E0 = await app.state();
      await espion(app);
      if (chemin === 'faute') { await app._tap([0.5, 0.5]); await app.clickSheet("pickFault('APPEL')"); await app._pickPlayer(); }
      else { await drag(app); await app.clickSheet("pickResult('Gris',false)"); await app._pickPlayer(chemin === 'avance' ? 'Bleu_p1' : undefined); }
      await app.page.waitForTimeout(250);
      const mid = await app.ev(() => ({ per: S.period, sc: { ...S.scores }, pw: { ...S.periodWins }, poss: S.possession, busy: periodEndBusy() }));
      eq([mid.per, mid.sc, mid.pw.Bleu, mid.busy], [2, { Bleu: 0, Gris: 0, Noir: 0 }, E0.periodWins.Bleu + 1, true], 'S pendant la fenêtre');
      eq(mid.poss, 'Gris', 'possession de la période suivante (perdant du duel)');
      const r = await ruban(app);
      assert(r.sc.includes('11') && /PÉRIODE 1\b/.test(r.per), 'ruban : la période qui finit : ' + JSON.stringify(r));
      if (chemin === 'avance') {
        /* feuille des détails : le receveur est choisi pendant l'attente ; son save() écrit aussi la période 2 */
        await until(app, () => !!document.querySelector('#sheet .adv-player-grid'), null, 3000);
        const b = await app.ev(() => { const x = [...document.querySelectorAll('#sheet [onclick^="setAdvancedPlayer("]')].find(e => /'target'/.test(e.getAttribute('onclick'))); return x ? x.getAttribute('onclick') : null; });
        assert(b, 'bouton du receveur');
        const n0 = await app.ev(() => window.__docs.length);
        await app.clickSheet(b);
        await until(app, n => window.__docs.length > n, n0, 3000);   // setAdvancedPlayer enregistre pendant l'attente
        await app.page.waitForTimeout(450);
        await app.clickSheet('closeAdvancedDetailSheet()');
      }
      await until(app, () => !periodEndBusy() && !document.getElementById('sheet').classList.contains('open'), null, 8000);
      const docs = await app.ev(() => window.__docs);
      assert(docs.length >= 1, 'au moins une écriture');
      docs.forEach((d, i) => eq([d.period, d.scores.Bleu, d.scores.Gris, d.pw.Bleu, d.h], [2, 0, 0, E0.periodWins.Bleu + 1, E0.history.length + 1], `écriture ${i + 1} (+${Math.round(d.t)} ms)`));
      const fin = await app.state();
      eq([fin.period, fin.periodWins.Bleu, fin.history.length], [2, E0.periodWins.Bleu + 1, E0.history.length + 1], 'après la fenêtre : rien de plus');
      const r2 = await ruban(app);
      assert(/PÉRIODE 2\b/.test(r2.per) && r2.sc.every(x => x === '0'), 'ruban après le message : ' + JSON.stringify(r2));
      /* ↶ ramène l'état d'avant l'action, période comprise */
      await app.undo();
      const u = await app.state();
      eq([u.period, u.scores, u.periodWins, u.history.length, u.possession], [E0.period, E0.scores, E0.periodWins, E0.history.length, E0.possession], '↶ après la fenêtre');
      eq(app.errors, [], 'aucune erreur de page');
    });
  });

  /* ---------- 2 · fin à la main : enregistrée dans la période suivante ; ↶ pendant le message la défait seule ---------- */
  await check(`${P}·2 fin à la main : S et l'écriture dans la période 2 tout de suite ; ↶ du message (après 400 ms) rend l'état d'avant exactement`, async () => {
    await un(gabarit, async app => {
      await setup(app, { scores: { Bleu: 3, Gris: 2, Noir: 0 } });
      const E0 = await app.state();
      await espion(app);
      await app.ev(() => openFinishMenu()); await app.clickSheet("endPeriodManually('Bleu')");
      await until(app, () => /TERMINÉE/.test(document.getElementById('sheet').textContent));
      const mid = await app.ev(() => ({ per: S.period, sc: { ...S.scores }, docs: window.__docs.map(d => d.period) }));
      eq([mid.per, mid.sc.Bleu], [2, 0], 'S');
      eq(mid.docs, [2], 'une écriture, déjà dans la période 2');
      await app.page.waitForTimeout(450);
      await app.clickSheet('undoPeriodEnd()');
      await app.page.waitForTimeout(1800);
      const u = await app.state();
      eq([u.period, u.scores, u.periodWins, u.history.length, u.possession], [E0.period, E0.scores, E0.periodWins, E0.history.length, E0.possession], 'état d\'avant, stable');
      eq(await app.ev(() => [periodEndView, periodEndTimer, periodEndWait]), [null, null, null], 'aucune fenêtre résiduelle');
      eq(app.errors, [], 'aucune erreur de page');
    });
  });

  /* ---------- 3 · F42 : état en suspens laissé par une version d'avant (fin_periode compté, période pas avancée) ---------- */
  await check(`${P}·3 F42 : fin à la main restée en suspens (ancienne version) : reprise = message rejoué une fois, période comptée une fois ; ↶ pendant ce message rend l'état d'avant la fin`, async () => {
    await un(gabarit, async app => {
      await setup(app, { scores: { Bleu: 3, Gris: 2, Noir: 0 } });
      const E0 = await app.state();
      /* état d'avant T-FP robustesse : fin_periode poussé, période comptée, remise à zéro jamais faite */
      await app.ev(() => { S.history.push({ type: 'fin_periode', before: snapshotBefore(), at: horodatage(), details: { winner: 'Bleu' } }); S.periodWins.Bleu += 1; save(); navHome(); });
      await app.ev(id => resumeMatch(id), E0.id);
      await until(app, () => /TERMINÉE/.test(document.getElementById('sheet').textContent), null, 3000);
      const mid = await app.ev(() => ({ per: S.period, pw: S.periodWins.Bleu, h: S.history.length }));
      eq([mid.per, mid.pw, mid.h], [2, E0.periodWins.Bleu + 1, E0.history.length + 1], 'période comptée une fois, période suivante');
      await app.page.waitForTimeout(450);
      await app.clickSheet('undoPeriodEnd()');
      await app.page.waitForTimeout(1800);
      const u = await app.state();
      eq([u.period, u.scores, u.periodWins, u.history.length], [E0.period, E0.scores, E0.periodWins, E0.history.length], '↶ : état d\'avant la fin');
      eq(await app.ev(() => periodEndBusy()), false, 'fenêtre close');
      eq(app.errors, [], 'aucune erreur de page');
    });
  });

  /* ---------- 4 · audit #13 : quitter pendant le message coupe son minuteur ---------- */
  await check(`${P}·4 navHome pendant le message : minuteur et affichage différé coupés ; une feuille ouverte ensuite n'est pas refermée ; la reprise est dans la période 2, sans message`, async () => {
    await un(gabarit, async app => {
      await setup(app, { poss: 'Gris' });
      await app._tap([0.5, 0.5]); await app.clickSheet("pickFault('APPEL')"); await app._pickPlayer();
      await until(app, () => /TERMINÉE/.test(document.getElementById('sheet').textContent));
      await app.ev(() => navHome());
      eq(await app.ev(() => [periodEndTimer, typeof periodEndView === 'undefined' ? null : periodEndView, periodEndWait]), [null, null, null], 'plus rien en attente');
      await app.ev(() => openSheet('<div id="__x">x</div>', true));
      await app.page.waitForTimeout(1700);
      eq(await app.ev(() => !!document.querySelector('#sheet #__x') && document.getElementById('sheet').classList.contains('open')), true, 'la feuille de l\'accueil reste ouverte');
      await app.ev(() => closeSheet());
      await app.ev(() => resumeMatch(S.id));
      await app.page.waitForTimeout(300);
      const e = await app.ev(() => ({ per: S.period, sc: S.scores.Bleu, msg: /TERMINÉE/.test(document.getElementById('sheet').textContent) && document.getElementById('sheet').classList.contains('open') }));
      eq([e.per, e.sc, e.msg], [2, 0, false], 'reprise');
      eq(app.errors, [], 'aucune erreur de page');
    });
  });

  /* ---------- 5 · saisie N2 : double appui sur ↶ ---------- */
  await check(`${P}·5 N2 : deux appuis sur ↶ à 80 ms défont une seule action ; à 350 ms, deux`, async () => {
    await un(gabarit, async app => {
      await app.startMatch({ format: '9_11' }); await app.initialPossession('Bleu');
      for (let k = 0; k < 4; k++) { await app.faute({ at: [0.5, 0.5] }); }
      eq((await app.state()).history.length, 4, 'quatre fautes');
      await app.page.waitForTimeout(450);
      await tapEl(app, undoSel(phone)); await app.page.waitForTimeout(80); await tapEl(app, undoSel(phone));
      await app.page.waitForTimeout(400);
      eq((await app.state()).history.length, 3, 'double appui : une seule action défaite');
      await tapEl(app, undoSel(phone)); await app.page.waitForTimeout(350); await tapEl(app, undoSel(phone));
      await app.page.waitForTimeout(100);
      eq((await app.state()).history.length, 1, 'deux ↶ espacés : deux actions défaites');
      eq(app.errors, [], 'aucune erreur de page');
    }, { timescale: 1, saisie: 'feuille' });
  });

  /* ---------- 6 · saisie N3 : le bandeau pendant une saisie radiale ---------- */
  await check(`${P}·6 N3 : bandeau « Non enregistré » touché pendant une saisie radiale : aucune feuille, la saisie continue et s'enregistre`, async () => {
    await un(gabarit, async app => {
      await app.startMatch({ format: '9_11' }); await app.initialPossession('Bleu');
      await app.ev(() => setSyncState('error'));
      await app._tap([0.5, 0.5]);
      await until(app, () => radialIsOpen() && pending !== null, null, 3000);
      await app.page.waitForTimeout(450);
      await tapEl(app, '#syncBadge');
      await app.page.waitForTimeout(150);
      const e = await app.ev(() => ({ sheet: document.getElementById('sheet').classList.contains('open'), radial: radialIsOpen(), pend: pending !== null }));
      eq(e, { sheet: false, radial: true, pend: true }, 'la saisie radiale est intacte');
      await app.clickSheet("pickFault('APPEL')"); await app._pickPlayer(); await app.settle();
      eq((await app.state()).history.length, 1, 'la faute est enregistrée');
      await app.ev(() => setSyncState('ok'));
      eq(app.errors, [], 'aucune erreur de page');
    }, { timescale: 1, saisie: 'radiale' });
  });

  /* ---------- 7 · saisie N4 : FIN PÉRIODE juste après « Annuler cette saisie » ---------- */
  await check(`${P}·7 N4 : format libre, FIN PÉRIODE 100 ms après « Annuler cette saisie » : ignoré ; 450 ms après : la période se termine`, async () => {
    await un(gabarit, async app => {
      await app.startMatch({ format: 'libre3' }); await app.initialPossession('Bleu');
      await app.faute({ at: [0.5, 0.5] });
      await app.ev(() => { S.scores = { Bleu: 3, Gris: 1, Noir: 1 }; renderScoreboard(); });   // un seul meneur : FIN PÉRIODE termine sans feuille
      await app.page.waitForTimeout(450);
      const sel = phone ? '.mb-periode' : '.icon-btn.periode';
      await app._tap([0.5, 0.5]); await until(app, () => !!document.querySelector('#sheet [onclick="cancelPendingEvent()"]'));
      await app.page.waitForTimeout(300);
      await app.clickSheet('cancelPendingEvent()');
      await app.page.waitForTimeout(100);
      await tapEl(app, sel);
      await app.page.waitForTimeout(200);
      eq(await app.ev(() => [S.period, S.history.length, periodEndBusy()]), [1, 1, false], 'second appui ignoré');
      await app.page.waitForTimeout(450);
      await tapEl(app, sel);
      await app.page.waitForTimeout(150);
      eq(await app.ev(() => [S.period, S.history.length]), [2, 2], 'appui volontaire : la période se termine');
      eq(app.errors, [], 'aucune erreur de page');
    }, { timescale: 1, saisie: 'feuille' });
  });

  /* ---------- 8 · D2, audit #13 : second appui sur le terrain après Annuler ---------- */
  for (const saisie of ['feuille', 'radiale']) await check(`${P}·8 D2 (saisie ${saisie}) : second appui au point d'« Annuler cette saisie » (150 ms, sur le terrain) : ignoré ; un appui ailleurs au même moment ouvre une saisie (C21 · 6l)`, async () => {
    await un(gabarit, async app => {
      await app.startMatch({ format: '9_11' }); await app.initialPossession('Bleu');
      const presser = async (x, y) => { await app.page.mouse.move(x, y); await app.page.mouse.down(); await app.page.mouse.up(); };
      const annuler = async () => {
        await app._tap([0.5, 0.5]);
        await until(app, () => pending !== null && !!document.querySelector('[onclick="cancelPendingEvent()"]'), null, 3000);
        await app.page.waitForTimeout(350);
        const b = await app.ev(() => {
          const r = [...document.querySelectorAll('[onclick="cancelPendingEvent()"]')].map(e => e.getBoundingClientRect()).find(r => r.width > 0);
          const f = document.getElementById('field').getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
          return { x, y, dansTerrain: x > f.left && x < f.right && y > f.top && y < f.bottom, f: { l: f.left, t: f.top, w: f.width, h: f.height } };
        });
        await presser(b.x, b.y);
        return b;
      };
      /* 1 : le doigt retombe au même endroit (double appui) */
      const b = await annuler();
      await app.page.waitForTimeout(150);
      if (b.dansTerrain) {
        await presser(b.x, b.y);
        await app.page.waitForTimeout(100);
        eq(await app.ev(() => [pending === null, document.getElementById('sheet').classList.contains('open'), radialIsOpen()]), [true, false, false], 'second appui au même endroit ignoré');
      } else assert(saisie === 'feuille', 'en saisie radiale, « Annuler » est dans le terrain');
      await app.page.waitForTimeout(400);
      /* 2 : un geste ailleurs juste après Annuler reste accepté */
      const b2 = await annuler();
      await app.page.waitForTimeout(150);
      const ax = b2.f.l + (b2.x - b2.f.l > b2.f.w / 2 ? 0.2 : 0.8) * b2.f.w, ay = b2.f.t + 0.5 * b2.f.h;
      await presser(ax, ay);
      await until(app, () => pending !== null, null, 3000);
      await app.clickSheet("pickFault('APPEL')"); await app._pickPlayer(); await app.settle();
      eq((await app.state()).history.length, 1, 'une faute enregistrée');
      eq(app.errors, [], 'aucune erreur de page');
    }, { timescale: 1, saisie });
  });

  /* ---------- 9 · saisie N5 : geste interrompu par le système ---------- */
  await check(`${P}·9 N5 : pointercancel au milieu d'un glisser : flèche effacée, rien de saisi ; le geste suivant marche`, async () => {
    await un(gabarit, async app => {
      await app.startMatch({ format: '9_11' }); await app.initialPossession('Bleu');
      const A = await app._pt([0.3, 0.3]), B = await app._pt([0.6, 0.6]), m = app.page.mouse;
      await m.move(A.x, A.y); await m.down(); await m.move(B.x, B.y, { steps: 2 });
      const fleche = await app.ev(() => document.getElementById('dragLayer').innerHTML.length > 0);
      const apres = await app.ev(() => { document.getElementById('field').dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })); return { fleche: document.getElementById('dragLayer').innerHTML.length, dragging, pend: pending !== null }; });
      await m.up();
      const r = { fleche, apres, ...(await app.ev(() => ({ pend2: pending !== null, sheet: document.getElementById('sheet').classList.contains('open') }))) };
      eq(r, { fleche: true, apres: { fleche: 0, dragging: false, pend: false }, pend2: false, sheet: false }, 'geste interrompu');
      await app.faute({ at: [0.5, 0.5] });
      eq((await app.state()).history.length, 1, 'geste suivant');
      eq(app.errors, [], 'aucune erreur de page');
    }, { timescale: 1, saisie: 'feuille' });
  });
}
