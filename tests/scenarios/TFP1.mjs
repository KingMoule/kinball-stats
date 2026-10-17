/* TFP1 (T-FP affichage et geste : R14, F33, F38, F43). Détail : tests/docs/TFP1.md.
   Vrais délais (timescale 1), vrais gestes ; un état de jeu est forcé (scores proches du seuil), comme C23. */
import { launch, assert, eq, diff } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];

const CFG = {
  echappe: { format: 'duel11', poss: 'Bleu', scores: { Bleu: 10, Gris: 4, Noir: 0 } },
  faute: { format: 'duel11', poss: 'Gris', scores: { Bleu: 10, Gris: 4, Noir: 0 } },
  menu: { format: 'duel11', poss: 'Bleu', scores: { Bleu: 3, Gris: 2, Noir: 0 } },
};
async function setup(app, cfg, { rosters = false, advanced = false } = {}) {
  await app.startMatch({ format: cfg.format, withRosters: rosters });
  await app.initialPossession('Bleu');
  await app.ev(([sc, po, adv]) => { S.scores = sc; S.possession = po; if (adv) S.advancedMode = true; renderScoreboard(); }, [cfg.scores, cfg.poss, advanced]);
}
async function drag(app) {
  const a = await app._pt([0.3, 0.3]), b = await app._pt([0.7, 0.7]), m = app.page.mouse;
  await m.move(a.x, a.y); await m.down(); await m.move(b.x, b.y, { steps: 2 }); await m.up();
}
/* Les trois chemins qui terminent la période. Sans settle : on agit PENDANT la fenêtre. */
const PATHS = {
  echappe: async app => { await drag(app); await app.clickSheet("pickResult('Gris',false)"); await app._pickPlayer(); },
  faute: async app => { await app._tap([0.5, 0.5]); await app.clickSheet("pickFault('APPEL')"); await app._pickPlayer(); },
  menu: async app => { await app.ev(() => openFinishMenu()); await app.clickSheet("endPeriodManually('Bleu')"); },
};
const until = (app, fn, arg, timeout = 4000) => app.page.waitForFunction(fn, arg, { timeout, polling: 10 });
const txt = app => app.ev(() => document.getElementById('sheet').textContent.replace(/\s+/g, ' ').trim());
const sheetOpen = app => app.ev(() => document.getElementById('sheet').classList.contains('open'));
const ribbon = app => app.ev(() => [...document.querySelectorAll('#scoreboard .team-chip .tscore')].map(e => e.textContent.trim()));
const msgUp = app => until(app, () => /TERMINÉE/.test(document.getElementById('sheet').textContent) && document.getElementById('sheet').classList.contains('open'));
/* Enregistreur : une ligne toutes les 10 ms (setInterval n'est pas raccourci par le banc) ; t0 = premier appel du geste qui conclut. */
const record = app => app.ev(() => {
  window.__log = []; window.__t0 = null;
  for (const n of ['applyResult', 'applyFault', 'endPeriodManually']) {
    const o = window[n]; window[n] = function (...a) { if (window.__t0 === null) window.__t0 = performance.now(); return o.apply(this, a); };
  }
  setInterval(() => { const sh = document.getElementById('sheet'); window.__log.push({ t: performance.now(), open: sh.classList.contains('open'), txt: sh.textContent.replace(/\s+/g, ' ').trim(), sc: JSON.stringify((periodEndView || S).scores), per: (periodEndView || S).period }); }, 10);   /* T-FP robustesse : ce que le ruban affiche */
});
const frise = app => app.ev(() => window.__log.map(l => ({ ...l, t: Math.round(l.t - window.__t0) })));
/* Premier et dernier instants (relatifs à t0) où le message de période est affiché, instant de la remise à zéro. */
function lire(log, per0) {
  const term = log.filter(l => /TERMINÉE/.test(l.txt) && l.open), reset = log.find(l => l.per > per0 && /^\{"Bleu":0,"Gris":0,"Noir":0\}$/.test(l.sc));
  return { debut: term.length ? term[0].t : null, fin: term.length ? term[term.length - 1].t : null, reset: reset ? reset.t : null };
}
async function un(gabarit, f, opts = { timescale: 1 }) {
  const app = await launch(gabarit, opts);
  try { return await f(app); } finally { await app.close(); }
}
const periodEtat = app => app.ev(() => ({ wait: periodEndWait ? periodEndWait.phase : null, timer: periodEndTimer !== null, flash: flashTimer !== null, per: (periodEndView || S).period, h: S.history.length, sc: JSON.stringify((periodEndView || S).scores), pw: JSON.stringify(S.periodWins) }));   /* affiché (T-FP robustesse : S est déjà dans la période suivante) */
/* Appui réel (souris ou doigt) au centre d'un élément. */
async function tapEl(app, sel) {
  const r = await app.ev(s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height }; }, sel);
  if (app.gabarit === 'telephone') await app.page.touchscreen.tap(r.x, r.y); else await app.page.mouse.click(r.x, r.y);
  return r;
}

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] TFP1`;
  const phone = gabarit === 'telephone';

  /* ---------- 1 · R14, F33 : le message de période est vu, 1,4 s pleines ---------- */
  for (const saisie of ['feuille', 'radiale']) await check(`${P} · 1a · (saisie ${saisie}) ballon échappé au seuil : ÉCHAPPÉ (≈ 550 ms) puis « PÉRIODE 1 TERMINÉE » 1,4 s, remise à zéro à ≈ 1,95 s ; pointage au seuil affiché pendant tout le message`, async () => {
    await un(gabarit, async app => {
      await setup(app, CFG.echappe); await record(app);
      const E0 = await app.state();
      await PATHS.echappe(app);
      await until(app, () => window.__log.length && window.__log[window.__log.length - 1].per > 1, null, 6000);
      const log = await frise(app), L = lire(log, 1);
      const flash = log.filter(l => l.t >= 100 && l.t <= 450);
      assert(flash.length && flash.every(l => /ÉCHAPPÉ/.test(l.txt) && !/TERMINÉE/.test(l.txt)), 'l\'éclair ÉCHAPPÉ devrait occuper 100 à 450 ms : ' + JSON.stringify(flash.slice(0, 2)));
      assert(L.debut !== null && L.debut >= 480 && L.debut <= 800, `message de période attendu vers +550 ms : +${L.debut}`);
      assert(L.fin - L.debut >= 1300, `message affiché ${L.fin - L.debut} ms (≥ 1300 attendu)`);
      assert(L.reset >= 1850 && L.reset <= 2300, `remise à zéro attendue vers +1950 ms : +${L.reset}`);
      const avant = log.filter(l => l.t >= 0 && l.t < L.reset);
      assert(avant.every(l => l.per === 1 && l.sc === avant[0].sc && /"Bleu":11/.test(l.sc)), 'pointage au seuil et période 1 jusqu\'à la remise à zéro');
      const msg = log.find(l => /TERMINÉE/.test(l.txt));
      assert(/PÉRIODE 1 TERMINÉE/.test(msg.txt) && /GAGNE/.test(msg.txt), msg.txt);
      const S1 = await app.state();
      eq(S1.period, 2, 'période suivante'); eq(S1.history.length, E0.history.length + 1, 'une seule action ajoutée');
      assert(app.errors.length === 0, app.errors.join(' | '));
    }, { timescale: 1, saisie });
  }, { calme: true });   // bornes de temps réel : jouées au calme (outillage B-1)
  for (const k of ['faute', 'menu']) {
    await check(`${P} · 1b · chemin ${k === 'faute' ? 'faute directe' : 'fin à la main'} : message 1,4 s inchangé (remise à zéro à ≈ 1,4 s)`, async () => {
      await un(gabarit, async app => {
        await setup(app, CFG[k]); await record(app);
        await PATHS[k](app);
        await until(app, () => window.__log.length && window.__log[window.__log.length - 1].per > 1, null, 6000);
        const log = await frise(app), L = lire(log, 1);
        assert(L.debut !== null && L.debut <= 250, `message attendu tout de suite : +${L.debut}`);
        assert(L.reset - L.debut >= 1300 && L.reset - L.debut <= 1700, `durée ${L.reset - L.debut} ms`);
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    }, { calme: true });
  }
  await check(`${P} · 1c · mode avancé sans alignement (aucune feuille à ouvrir) : éclair puis message, comme en direct`, async () => {
    await un(gabarit, async app => {
      await setup(app, CFG.echappe, { advanced: true }); await record(app);
      await PATHS.echappe(app);
      await until(app, () => window.__log.length && window.__log[window.__log.length - 1].per > 1, null, 6000);
      const L = lire(await frise(app), 1);
      assert(L.debut >= 480 && L.debut <= 800 && L.fin - L.debut >= 1300 && L.reset >= 1850 && L.reset <= 2300, JSON.stringify(L));
    });
  }, { calme: true });

  /* ---------- 2 · mode avancé : la feuille des détails n'est jamais refermée d'office ---------- */
  const versDetails = async app => {
    await setup(app, CFG.echappe, { rosters: true, advanced: true }); await record(app);
    await PATHS.echappe(app);
    await until(app, () => !!document.querySelector('#sheet .adv-player-grid'), null, 4000);
  };
  await check(`${P} · 2a · mode avancé : la feuille DÉTAILS AVANCÉS s'ouvre après l'éclair et reste 3 s sans être refermée (pointage au seuil, terrain inerte) ; validée, le message puis la remise à zéro suivent ; le receveur choisi est gardé`, async () => {
    await un(gabarit, async app => {
      await versDetails(app);
      const idx = await app.ev(() => S.history.length - 1);
      await app.clickSheet(`setAdvancedPlayer(${idx},'target','Gris_p1')`);
      await app.page.waitForTimeout(3000);
      const e = await periodEtat(app);
      eq(e.wait, 'detail', 'attente de la feuille'); eq(e.timer, false, 'aucun minuteur de fin de période'); eq(e.per, 1, 'période'); assert(/"Bleu":11/.test(e.sc), e.sc);
      assert(await sheetOpen(app) && /DÉTAILS AVANCÉS/.test(await txt(app)), 'feuille des détails ouverte : ' + await txt(app));
      eq(await app.ev(() => !!document.querySelector('#sheet [onclick*="Gris_p1"].selected')), true, 'receveur sélectionné');
      const pt = await app._pt([0.5, 0.5]);
      await app.ev(([x, y]) => { field.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 7 })); }, [pt.x, pt.y]);
      eq(await app.ev(() => dragging), false, 'terrain inerte pendant l\'attente');
      const log = await frise(app);
      assert(!log.some(l => /TERMINÉE/.test(l.txt)), 'aucun message de période avant la validation');
      await app.clickSheet('closeAdvancedDetailSheet()');
      await msgUp(app);
      const t1 = await app.ev(() => performance.now());
      await until(app, () => S.period === 2 && !periodEndBusy(), null, 4000);
      const dt = (await app.ev(() => performance.now())) - t1;
      assert(dt >= 1100 && dt <= 1700, `remise à zéro ${Math.round(dt)} ms après le début du message`);
      const ev = await app.ev(i => S.history[i].details, idx);
      eq(ev.target_player_id, 'Gris_p1', 'receveur enregistré');
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
  }, { calme: true });
  await check(`${P} · 2b · mode avancé : feuille des détails fermée d'un appui à côté (fond) : message puis remise à zéro, comme après TERMINÉ`, async () => {
    await un(gabarit, async app => {
      await versDetails(app);
      await app.page.waitForTimeout(700);
      await app.page.mouse.click(8, 8);
      await msgUp(app);
      await until(app, () => S.period === 2 && !periodEndBusy(), null, 4000);
      eq((await app.state()).scores.Bleu, 0, 'scores remis à zéro');
      eq(await sheetOpen(app), false, 'feuille fermée à la fin');
    });
  });
  for (const phase of ['éclair', 'détails']) {
    await check(`${P} · 2c · ↶ (undo()) pendant ${phase === 'éclair' ? 'l\'éclair' : 'l\'attente de la feuille des détails'} : état d'avant exact, aucun minuteur orphelin (rien ne se passe 3 s plus tard)`, async () => {
      await un(gabarit, async app => {
        await setup(app, CFG.echappe, { rosters: true, advanced: true }); await record(app);
        const E0 = await app.state(), R0 = await ribbon(app);
        await PATHS.echappe(app);
        if (phase === 'éclair') await until(app, () => /ÉCHAPPÉ/.test(document.getElementById('sheet').textContent), null, 2000);
        else await until(app, () => !!document.querySelector('#sheet .adv-player-grid'), null, 3000);
        eq((await periodEtat(app)).wait, phase === 'éclair' ? 'flash' : 'detail', 'phase');
        await app.ev(() => undo());
        for (const att of [450, 3000]) {
          await app.page.waitForTimeout(att);
          const d = diff(await app.state(), E0); assert(!d, `après ↶ (+${att} ms) : ${d}`);
          const e = await periodEtat(app);
          eq(e.wait, null, 'attente'); eq(e.timer, false, 'minuteur de fin de période'); eq(e.flash, false, 'minuteur d\'éclair');
          eq(await sheetOpen(app), false, 'feuille ouverte'); eq(await app.ev(() => pending), null, 'pending');
          eq(await ribbon(app), R0, 'ruban');
          eq(await app.ev(() => window.__timers), 0, 'minuteurs du banc en cours');
        }
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    });
  }

  /* ---------- 3 · F38 : « Annuler » dans le message de fin de période ---------- */
  for (const k of ['echappe', 'faute', 'menu']) {
    await check(`${P} · 3a · chemin ${k} : « Annuler » du message (vrai appui, ≥ 44 px, après un appui de feuille tout récent) défait la fin de période : état d'avant exactement, stable 2 s`, async () => {
      await un(gabarit, async app => {
        await setup(app, CFG[k]); await record(app);
        const E0 = await app.state(), R0 = await ribbon(app);
        await PATHS[k](app);
        await msgUp(app);
        await until(app, () => Date.now() - periodMsgAt >= UNDO_REARM_MS + 30, null, 2000);
        await app.ev(() => { undoBlockedUntil = Date.now() + UNDO_REARM_MS; });   // un appui de feuille tout récent : ↶ serait ignoré, pas ce bouton
        const r = await tapEl(app, '#sheet .period-undo');
        assert(r.h >= 44 && r.w >= 44, `bouton ${Math.round(r.w)}×${Math.round(r.h)} px`);
        await app.page.waitForTimeout(120);
        eq(await app.ev(() => document.querySelector('#sheet .period-undo') !== null && document.getElementById('sheet').classList.contains('open')), false, 'message encore affiché');
        for (const att of [0, 2000]) {
          if (att) await app.page.waitForTimeout(att);
          const d = diff(await app.state(), E0); assert(!d, `état (+${att} ms) : ${d}`);
          const e = await periodEtat(app); eq(e.timer, false, 'minuteur');
          eq(await app.ev(() => pending), null, 'pending'); eq(await ribbon(app), R0, 'ruban');
        }
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    });
  }
  await check(`${P} · 3b · anti-double-appui : un appui sur « Annuler » dans les UNDO_REARM_MS (400 ms) qui suivent l'ouverture du message est ignoré (le message va à son terme)`, async () => {
    await un(gabarit, async app => {
      await setup(app, CFG.faute);
      await app.ev(() => {
        const o = window.showPeriodEnd;
        window.showPeriodEnd = function (...a) { const r = o.apply(this, a); document.querySelector('#sheet .period-undo').click(); window.__early = S.history.length; return r; };
      });
      const h0 = await app.ev(() => S.history.length);
      await PATHS.faute(app);
      await until(app, () => window.__early !== undefined, null, 3000);
      eq(await app.ev(() => window.__early), h0 + 1, 'l\'appui précoce n\'a rien défait');
      await until(app, () => S.period === 2 && !periodEndBusy(), null, 4000);
      eq((await app.state()).history.length, h0 + 1, 'la période s\'est terminée normalement');
    });
  });
  for (const phase of ['éclair', 'détails', 'message']) {
    await check(`${P} · 3c · pendant ${phase === 'message' ? 'le message de période' : phase === 'éclair' ? 'l\'éclair' : 'la feuille des détails'} : terrain, ⌂, TERMINER, STATS, pastilles d'équipe, FIN PÉRIODE, changements ignorés (jamais mis en file)`, async () => {
      await un(gabarit, async app => {
        const adv = phase === 'détails';
        await setup(app, CFG.echappe, { rosters: adv, advanced: adv }); await record(app);
        await PATHS.echappe(app);
        if (phase === 'éclair') await until(app, () => /ÉCHAPPÉ/.test(document.getElementById('sheet').textContent), null, 2000);
        else if (phase === 'détails') await until(app, () => !!document.querySelector('#sheet .adv-player-grid'), null, 3000);
        else await msgUp(app);
        const pt = await app._pt([0.5, 0.5]);
        const r = await app.ev(([x, y]) => {
          const h = S.history.length, before = document.getElementById('sheet').innerHTML;
          undoBlockedUntil = 0;
          goHome(); finishBarTap(); openFinishMenu(); openStats(); openLineupSheet('Bleu'); endPeriodByLeader(); endPeriodManually('Bleu');
          field.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 9 }));
          return { screen: currentScreen(), same: document.getElementById('sheet').innerHTML === before, h: S.history.length - h, dragging, lineup: lineupSheetTeam, pend: pending !== null, status: S.status };
        }, [pt.x, pt.y]);
        eq(r.screen, 'match', 'écran'); eq(r.same, true, 'la feuille affichée n\'a pas changé'); eq(r.h, 0, 'historique');
        eq(r.dragging, false, 'glisser'); eq(r.lineup, null, 'feuille des changements'); eq(r.pend, false, 'saisie en cours'); eq(r.status, 'in_progress', 'statut');
        if (phase === 'message') { await until(app, () => S.period === 2 && !periodEndBusy(), null, 4000); eq(await app.ev(() => S.scores.Bleu), 0, 'la période se termine normalement'); }
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    });
  }
  await check(`${P} · 3d · message de période : « Annuler » entier à l'écran, ≥ 44 px, sans défilement horizontal${phone ? ' (téléphone 320 px compris)' : ''}`, async () => {
    for (const vp of phone ? [{ width: 390, height: 844 }, { width: 320, height: 568 }] : [null]) {
      await un(gabarit, async app => {
        await setup(app, CFG.faute);
        if (vp) { await app.page.setViewportSize(vp); await app.page.waitForTimeout(300); }
        await PATHS.faute(app); await msgUp(app);
        const m = await app.ev(() => {
          const b = document.querySelector('#sheet .period-undo').getBoundingClientRect(), t = document.querySelector('#sheet .msg-center').getBoundingClientRect();
          return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, tl: t.left, tr: t.right, label: document.querySelector('#sheet .period-undo').textContent.trim() };
        });
        const nom = vp ? vp.width + ' px' : 'tablette';
        assert(m.w >= 44 && m.h >= 44, `${nom} : bouton ${Math.round(m.w)}×${Math.round(m.h)}`);
        assert(m.l >= 0 && m.r <= m.vw + 0.5 && m.b <= m.vh + 0.5 && m.t >= 0, `${nom} : bouton hors écran ${JSON.stringify(m)}`);
        assert(m.sw <= m.vw + 1, `${nom} : défilement horizontal ${m.sw} > ${m.vw}`);
        assert(m.tl >= -0.5 && m.tr <= m.vw + 0.5, `${nom} : message débordant`);
        eq(m.label, 'Annuler', 'texte');
      });
    }
  });

  await check(`${P} · 3e · rebond TERMINÉ (feuille des détails) → « Annuler » du message : un appui à ≈ 330 ms n'a aucun effet (historique et pointage inchangés), un appui à 450 ms défait le lancer et la fin de période`, async () => {
    await un(gabarit, async app => {
      await setup(app, CFG.echappe, { rosters: true, advanced: true });
      await app.ev(() => { window.__E0 = JSON.stringify({ h: S.history.length, sc: S.scores, per: S.period }); });
      const E0 = await app.state();
      await PATHS.echappe(app);
      await until(app, () => !!document.querySelector('#sheet .adv-player-grid'), null, 4000);
      await app.page.waitForTimeout(500);
      await app.clickSheet('closeAdvancedDetailSheet()');
      await msgUp(app);
      await until(app, () => Date.now() - periodMsgAt >= 330, null, 2000);
      await app.ev(() => document.querySelector('#sheet .period-undo').click());
      await app.page.waitForTimeout(40);
      const e = await app.ev(() => ({ h: S.history.length, sc: JSON.stringify((periodEndView || S).scores), per: (periodEndView || S).period, msg: /TERMINÉE/.test(document.getElementById('sheet').textContent), timer: periodEndTimer !== null }));
      eq(e.h, E0.history.length + 1, 'historique inchangé par le rebond'); assert(/"Bleu":11/.test(e.sc) && e.per === 1 && e.msg && e.timer, JSON.stringify(e));
      await until(app, () => Date.now() - periodMsgAt >= 450, null, 2000);
      await tapEl(app, '#sheet .period-undo');
      await app.page.waitForTimeout(150);
      const d = diff(await app.state(), E0); assert(!d, 'après l\'appui à 450 ms : ' + d);
    });
  }, { calme: true });
  await check(`${P} · 2d · navHome() pendant la feuille des détails : ni message sur l'accueil, ni attente résiduelle ; le match repris rejoue la fin de période puis accepte un geste`, async () => {
    await un(gabarit, async app => {
      await versDetails(app);
      await app.ev(() => navHome());
      const e = await app.ev(() => ({ scr: currentScreen(), open: document.getElementById('sheet').classList.contains('open'), msg: /TERMINÉE/.test(document.getElementById('sheet').textContent), busy: periodEndBusy(), w: periodEndWait, f: flashTimer }));
      eq(e.scr, 'home', 'écran'); eq(e.open, false, 'feuille'); eq(e.msg, false, 'message'); eq(e.busy, false, 'periodEndBusy'); eq(e.w, null, 'attente'); eq(e.f, null, 'éclair');
      await app.page.waitForTimeout(2500);
      eq(await app.ev(() => /TERMINÉE/.test(document.getElementById('sheet').textContent) || document.getElementById('sheet').classList.contains('open')), false, 'rien sur l\'accueil 2,5 s plus tard');
      await app.ev(() => resumeMatch());
      await until(app, () => currentScreen() === 'match', null, 3000);
      await until(app, () => S.period === 2 && periodEndTimer === null && !document.getElementById('sheet').classList.contains('open'), null, 6000);
      await app.settle(); await app.fieldStable();
      await app.faute({});
      assert((await app.state()).history.length >= 2, 'le geste suivant est accepté');
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
  });

  /* ---------- 4 · F43 : appui juste après ↶ = faute directe ---------- */
  const jouerQuelques = async app => { await app.startMatch({ format: '9_11' }); await app.initialPossession('Bleu'); await app.faute({}); await app.faute({}); };
  await check(`${P} · 4a · F43 : vrai ↶ puis appui IMMÉDIAT sur le terrain (sans attendre la mise en page) : faute directe, jamais un lancer (3 essais)`, async () => {
    await un(gabarit, async app => {
      await jouerQuelques(app);
      for (let i = 0; i < 3; i++) {
        await app.page.waitForFunction(() => Date.now() >= undoBlockedUntil + 10 && !document.getElementById('sheet').classList.contains('closing'), null, { timeout: 4000, polling: 10 });
        await app.page.waitForTimeout(300);
        const box = await app.page.locator('#field').boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await app.page.locator('#undoBtn:visible, #undoBtnPhone:visible').first().click({ noWaitAfter: true });
        const m = app.page.mouse; await m.move(x, y); await m.down(); await m.up();
        await app.page.waitForFunction(() => pending !== null, null, { timeout: 3000, polling: 10 });
        eq(await app.ev(() => pending.type), 'faute_directe', `essai ${i + 1}`);
        await app.ev(() => cancelPendingEvent());
        await app.settle(); await app.fieldStable();
        await app.faute({});   // l'historique remonte : prochain ↶
      }
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
  });
  await check(`${P} · 4b · F43 : mise en page décalée (bandeau « Enregistrement… » de ↶) pendant l'appui : le rectangle du début du geste sert jusqu'au relâchement ; faute directe, position_norm lue dans ce rectangle`, async () => {
    await un(gabarit, async app => {
      await jouerQuelques(app);
      await app.undo();
      await app.ev(() => setSyncState('saving'));   // la même mise en page que dans les ~20 ms qui suivent ↶ : tout le terrain est poussé de 33 px
      await app.page.waitForTimeout(100);
      const dec = await app.page.evaluate(() => { const r = document.getElementById('field').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
      const px = dec.x + dec.w * 0.4, py = dec.y + dec.h * 0.4;
      const m = app.page.mouse; await m.move(px, py); await m.down();
      await app.ev(() => setSyncState('ok'));       // le terrain saute à sa vraie place entre l'appui et le relâchement
      await app.page.waitForTimeout(100);
      const dec2 = await app.page.evaluate(() => { const r = document.getElementById('field').getBoundingClientRect(); return { x: r.x, y: r.y }; });
      assert(Math.abs(dec2.y - dec.y) > 10, `la mise en page n'a pas bougé (${dec.y} → ${dec2.y}) : la vérification ne mesure rien`);
      await m.up();
      await app.page.waitForFunction(() => pending !== null, null, { timeout: 3000, polling: 10 });
      const p = await app.ev(() => ({ type: pending.type, pos: pending.details.position_norm }));
      eq(p.type, 'faute_directe', 'type de la saisie');
      assert(Math.abs(p.pos[0] - 0.4) < 0.003 && Math.abs(p.pos[1] - 0.4) < 0.003, 'position_norm = ' + JSON.stringify(p.pos) + ' (0,4 ; 0,4 attendu dans le rectangle du début du geste)');
    });
  });
  await check(`${P} · 4c · F43 : un vrai glisser reste un lancer ; start_norm au pointerdown, end_norm au relâchement (rectangle du début du geste)`, async () => {
    await un(gabarit, async app => {
      await jouerQuelques(app);
      const b = await app.page.locator('#field').boundingBox();
      const m = app.page.mouse;
      await m.move(b.x + b.width * 0.25, b.y + b.height * 0.25); await m.down();
      await m.move(b.x + b.width * 0.6, b.y + b.height * 0.7, { steps: 3 }); await m.up();
      await app.page.waitForFunction(() => pending !== null, null, { timeout: 3000, polling: 10 });
      const p = await app.ev(() => ({ type: pending.type, s: pending.details.start_norm, e: pending.details.end_norm }));
      eq(p.type, 'lancer', 'type');
      assert(Math.abs(p.s[0] - 0.25) < 0.003 && Math.abs(p.s[1] - 0.25) < 0.003, 'start_norm ' + p.s);
      assert(Math.abs(p.e[0] - 0.6) < 0.003 && Math.abs(p.e[1] - 0.7) < 0.003, 'end_norm ' + p.e);
    });
  });
  await check(`${P} · 4d · F43 : menu radial (C21) : les disques restent centrés sur le point d'appui (non déplacés)`, async () => {
    await un(gabarit, async app => {
      await jouerQuelques(app);
      const b = await app.page.locator('#field').boundingBox();
      const x = b.x + b.width * 0.5, y = b.y + b.height * 0.5;
      await app.ev(() => setSaisieMode('radiale'));
      const m = app.page.mouse; await m.move(x, y); await m.down(); await m.up();
      await app.page.waitForFunction(() => radialIsOpen(), null, { timeout: 3000, polling: 10 });
      await app.page.waitForTimeout(400);
      const r = await app.ev(() => { const bs = [...document.querySelectorAll('#radial .rd-btn')].map(e => e.getBoundingClientRect()); return { l: Math.min(...bs.map(q => q.left)), r: Math.max(...bs.map(q => q.right)), t: Math.min(...bs.map(q => q.top)), b: Math.max(...bs.map(q => q.bottom)), n: bs.length }; });
      assert(r.n > 0 && (r.l + r.r) / 2 > x - 20 && (r.l + r.r) / 2 < x + 20 && (r.t + r.b) / 2 > y - 25 && (r.t + r.b) / 2 < y + 25, `menu ${JSON.stringify(r)} autour de (${Math.round(x)}, ${Math.round(y)})`);
      await app.ev(() => cancelPendingEvent());
    }, { timescale: 1, saisie: 'radiale' });
  });
  await check(`${P} · 5 · aucune erreur console sur un match joué jusqu'à la fin de deux périodes, ↶ compris`, async () => {
    await un(gabarit, async app => {
      await setup(app, CFG.faute);
      await PATHS.faute(app); await msgUp(app); await until(app, () => S.period === 2 && !periodEndBusy(), null, 4000);
      await app.settle(); await app.fieldStable();
      await app.faute({}); await app.undo();
      assert(app.errors.length === 0, app.errors.join(' | '));
    });
  });
}
