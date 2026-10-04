/* C23 : correctifs après l'audit C13C.
   A  fin de période : un seul minuteur annulable (periodEndTimer), ↶ pendant le message restaure l'état exact (critères 1 à 7, vrais délais) ;
   B  duel : les barres suivent le porteur du ballon (9, 10, 11) ;
   C  seuil WP.minK = 9 (12, 13) ;
   D  zone d'appui des barres sur téléphone (15) ; données inchangées (16).
   Mesures écrites dans audit/C23-mesures-<gabarit>.json. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { launch, assert, eq, rng, diff, SORTIE, SIMCORE, exigerAvant, KNOWN_AVANT } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];
const AVANT_NOM = 'kinball.C23.avant.html';   /* dossier : KINBALL_AVANT (défaut : dossier temporaire du système) ; absent = KNOWN */
const SIMCORE_SHA = '262fa0598ab61cbc3689deaadbb849f5ddfea2519a5f7f6d3ab5684f23345a15';

/* ---------- aides ---------- */
const wait = app => app.page.waitForFunction(() => !WP.inFlight && !WP.dirty, null, { timeout: 15000, polling: 20 });
const peState = app => app.ev(() => typeof periodEndTimer === 'undefined' || periodEndTimer === null ? null : 'actif');
/* Tout ce que l'app a de volatil et que state() ne retire pas encore : rien (state() retire updatedAt et sheetDismissable). */
const stateOf = app => app.state();
const instrument = app => app.ev(() => {
  window.__t0 = null; window.__saves = [];
  const of = window.finishPeriod;
  window.finishPeriod = function (...a) { if (window.__t0 === null) window.__t0 = performance.now(); return of.apply(this, a); };
  const os = window.save;
  window.save = function (...a) { window.__saves.push({ t: performance.now(), r: !!a[0], s: JSON.parse(JSON.stringify(S)) });   /* r : nouvelle tentative de stockage (stockage indisponible ici), pas une écriture voulue */ return os.apply(this, a); };
});
const resetT0 = app => app.ev(() => { window.__t0 = null; });
/* attend que `ms` ms (temps réel) se soient écoulées depuis l'appel de finishPeriod */
const atMs = (app, ms) => app.page.waitForFunction(ms => window.__t0 !== null && performance.now() - window.__t0 >= ms, ms, { polling: 10, timeout: 8000 });
const since = app => app.ev(() => Math.round(performance.now() - window.__t0));

/* Mise en place d'un état proche d'une fin de période, par le formulaire puis forçage de S (comme l'auditeur) ;
   l'action qui termine la période et l'annulation mesurée sont de vrais gestes. */
async function setup(app, { format = 'duel11', scores = { Bleu: 10, Gris: 4, Noir: 0 }, poss = 'Gris', elim = null, rosters = false, prelude = null } = {}) {
  await app.startMatch({ format, withRosters: rosters });
  await app.initialPossession('Bleu');
  if (prelude) await prelude(app);
  await app.ev(([sc, po, el]) => {
    S.scores = sc; S.possession = po;
    if (el) { S.eliminated = el; S.duelActive = true; S.awaitingDuelStart = false; }
    renderScoreboard();
  }, [scores, poss, elim]);
}
async function drag(app) {
  const a = await app._pt([0.3, 0.3]), b = await app._pt([0.7, 0.7]), m = app.page.mouse;
  await m.move(a.x, a.y); await m.down(); await m.move(b.x, b.y, { steps: 2 }); await m.up();
}
/* Les trois chemins qui mènent à finishPeriod. Sans settle : on veut agir PENDANT la fenêtre. */
const PATHS = {
  faute: async app => { await app._tap([0.5, 0.5]); await app.clickSheet("pickFault('APPEL')"); await app._pickPlayer(); },
  echappe: async app => { await drag(app); await app.clickSheet("pickResult('Gris',false)"); await app._pickPlayer(); },
  menu: async app => { await app.ev(() => openFinishMenu()); await app.clickSheet("endPeriodManually('Bleu')"); },
};
const CFG = {
  faute: { duel11: { format: 'duel11', poss: 'Gris' }, elim: { format: '9_11', poss: 'Gris', elim: 'Noir', scores: { Bleu: 10, Gris: 4, Noir: 2 } } },
  echappe: { duel11: { format: 'duel11', poss: 'Bleu' }, elim: { format: '9_11', poss: 'Bleu', elim: 'Noir', scores: { Bleu: 10, Gris: 4, Noir: 2 } } },
};
/* ↶ : vrai appui si le bouton reçoit l'appui à cet instant, sinon undo() dans la page. Renvoie la façon. */
async function tapUndo(app) {
  const r = await app.ev(() => {
    const b = [...document.querySelectorAll('#undoBtn,#undoBtnPhone')].find(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    if (!b) return { hit: false };
    const q = b.getBoundingClientRect(), x = q.x + q.width / 2, y = q.y + q.height / 2, el = document.elementFromPoint(x, y);
    return { hit: !!el && (el === b || b.contains(el)), x, y, disabled: b.disabled };
  });
  if (r.hit && !r.disabled) {
    if (app.gabarit === 'telephone') await app.page.touchscreen.tap(r.x, r.y); else await app.page.mouse.click(r.x, r.y);
    return 'appui';
  }
  await app.ev(() => undo());
  return 'undo()';
}
const ribbon = app => app.ev(() => [...document.querySelectorAll('#scoreboard .team-chip .tscore')].map(e => e.textContent.trim()));
const lastSaved = app => app.ev(() => { const s = window.__saves.filter(x => !x.r); return s.length ? s[s.length - 1].s : null; });
const strip = s => { if (!s) return s; const c = JSON.parse(JSON.stringify(s)); delete c.updatedAt; delete c.sheetDismissable; if (c.pendingPeriodWinner == null) delete c.pendingPeriodWinner; return c; };

/* ↶ annule : état exact, immédiatement et 2 s plus tard */
async function fenetreUndo(app, { path, cfg, at, n = 1, prelude = null, bypass = null }) {
  await setup(app, { ...cfg, prelude });
  await instrument(app);
  const E0 = await stateOf(app);
  const E0rub = await ribbon(app);
  await PATHS[path](app);
  await atMs(app, at);
  const how = [];
  for (let i = 0; i < n; i++) { how.push(await tapUndo(app)); if (n > 1) await app.page.waitForTimeout(60); }
  const t = await since(app);
  await app.page.waitForTimeout(40);
  return { E0, E0rub, how, t };
}
async function verifieRestaure(app, E0, E0rub, msg) {
  const d1 = diff(await stateOf(app), E0); assert(!d1, `${msg} : état juste après ↶ — ${d1}`);
  eq(await peState(app), null, `${msg} : periodEndTimer`);
  await app.page.waitForTimeout(2000);
  const d2 = diff(await stateOf(app), E0); assert(!d2, `${msg} : état 2 s plus tard — ${d2}`);
  eq(await peState(app), null, `${msg} : periodEndTimer 2 s plus tard`);
  eq(await app.sheetOpen(), false, `${msg} : feuille ouverte`);
  eq(await app.ev(() => pending), null, `${msg} : pending`);
  eq(await ribbon(app), E0rub, `${msg} : ruban`);
  const ls = strip(await lastSaved(app)); const d3 = diff(ls, strip(E0));
  assert(!d3, `${msg} : dernière écriture de save() ≠ E0 — ${d3}`);
}

/* jouer : mini-grammaire du banc (F faute du porteur, E échappé, A attrapé, R reprise, U annuler, D:équipe) */
async function jouer(app, seq) {
  for (const tok of seq.split(/\s+/).filter(Boolean)) {
    const info = await app.ev(() => ({ po: S.possession, el: S.eliminated, teams: ATEAMS() }));
    const [op, arg] = tok.split(/[>:]/);
    const other = () => arg === 'next' ? info.teams[(info.teams.indexOf(info.po) + 1) % info.teams.length] : (arg || info.teams.find(t => t !== info.po && t !== info.el));   /* next : rotation Bleu → Gris → Noir, pour que trois équipes montent ensemble sans élimination */
    if (op === 'F') await app.faute({});
    else if (op === 'E') await app.lancer({ target: other(), caught: false });
    else if (op === 'A') await app.lancer({ target: other(), caught: true });
    else if (op === 'R') await app.reprise({ team: arg || info.po });
    else if (op === 'U') await app.undo();
    else if (op === 'D') await app.duelStart(arg);
    else if (op === 'S') {
      await app.ev(() => { openLineupSheet('Bleu'); pickSubOut('Bleu_p1'); pickSubIn('Bleu_p5'); closeLineupSheet(); });
      await app.settle();
    } else throw new Error('geste inconnu ' + tok);
    await wait(app);
  }
}
const sentOf = app => app.ev(() => WP.stats.sent);
const barsOf = app => app.ev(() => [...document.querySelectorAll('#scoreboard .wp')].map(e => [e.dataset.team, e.dataset.match, e.dataset.period, e.style.opacity]));

export default async function ({ gabarit, check: check0 }) {
  const P = `[${gabarit}] C23`;
  const phone = gabarit === 'telephone';
  const mesures = { gabarit };
  const apps = [];
  const chk = async (n, f, o) => { if (process.env.C23_ONLY && !new RegExp(process.env.C23_ONLY).test(n)) return; try { await check0(n, f, o); } finally { while (apps.length) { try { await apps.pop().close(); } catch {} } } };
  const open = async opts => { const a = await launch(gabarit, opts); apps.push(a); return a; };
  const MODES = [['sans animation', { timescale: 1 }], ['avec animation', { timescale: 1, anim: true }]];
  try {
    /* ============ VOLET A ============ */
    /* 1. chemin « faute » */
    await chk(`${P} · 1 · faute : ↶ à +480 ms restaure l'état exact (Duel 11 et 9/11 après élimination), tout de suite et 2 s plus tard, avec et sans animation`, async () => {
      for (const [nom, opts] of MODES) for (const k of ['duel11', 'elim']) {
        const a = await open(opts);
        const { E0, E0rub, how, t } = await fenetreUndo(a, { path: 'faute', cfg: CFG.faute[k], at: 480 });
        mesures['c1_' + k + '_' + nom] = { how, t };
        await verifieRestaure(a, E0, E0rub, `${nom}, ${k}, ↶ par ${how} à +${t} ms`);
        assert(a.errors.length === 0, a.errors.join(' | '));
        await a.close(); apps.pop();
      }
    });
    /* 2. chemin « ballon échappé », vrai appui sur ↶ entre 600 et 1300 ms */
    await chk(`${P} · 2 · ballon échappé : vrai appui sur ↶ à +700 ms (message éclair déjà fermé) restaure l'état exact et le garde 2 s`, async () => {
      for (const [nom, opts] of MODES) for (const k of ['duel11', 'elim']) {
        const a = await open(opts);
        const { E0, E0rub, how, t } = await fenetreUndo(a, { path: 'echappe', cfg: CFG.echappe[k], at: 700 });
        mesures['c2_' + k + '_' + nom] = { how, t };
        assert(t >= 600 && t <= 1300, `appui hors fenêtre : +${t} ms`);
        assert(how[0] === 'appui', `↶ non atteint par un vrai appui à +${t} ms (${how})`);
        await verifieRestaure(a, E0, E0rub, `${nom}, ${k}, ↶ par ${how} à +${t} ms`);
        assert(a.errors.length === 0, a.errors.join(' | '));
        await a.close(); apps.pop();
      }
    });
    /* 3. fin à la main */
    await chk(`${P} · 3 · fin à la main (menu TERMINER, FIN PÉRIODE du format libre) puis ↶ pendant le message : état = before du dernier événement, stable 2 s ; historique vide : la période se termine`, async () => {
      for (const [nom, opts] of MODES) {
        /* menu TERMINER, 9/11, un événement dans l'historique */
        {
          const a = await open(opts);
          const pre = async app => { await app.lancer({ target: 'Gris', caught: true }); };
          await setup(a, { format: '9_11', scores: { Bleu: 3, Gris: 2, Noir: 1 }, poss: 'Bleu', prelude: pre });
          await instrument(a);
          const B = await a.ev(() => JSON.parse(JSON.stringify(S.history[S.history.length - 1].before)));
          const hl = await a.ev(() => S.history.length);
          await PATHS.menu(a);
          await atMs(a, 480);
          assert((await a.ev(() => S.periodWins.Bleu)) === 1, 'période comptée pendant le message');
          const how = await tapUndo(a);
          await a.page.waitForTimeout(40);
          for (const phase of ['tout de suite', '2 s plus tard']) {
            if (phase !== 'tout de suite') await a.page.waitForTimeout(2000);
            const s = await a.ev(() => JSON.parse(JSON.stringify(S)));
            eq(s.history.length, hl - 1, `${nom} menu (${how}) ${phase} : le dernier événement est défait`);
            for (const k of Object.keys(B)) {
              const exp = k === 'stopped' ? B[k] : B[k], got = k === 'stopped' ? (s.stopped !== false) : s[k];
              eq(got, exp, `${nom} menu ${phase} : ${k}`);
            }
            eq(s.period, B.period, `${nom} menu ${phase} : période non terminée`);
            eq(await peState(a), null, `${nom} menu ${phase} : periodEndTimer`);
          }
          await a.close(); apps.pop();
        }
        /* format libre : bouton FIN PÉRIODE */
        {
          const a = await open(opts);
          const pre = async app => { await app.lancer({ target: 'Gris', caught: true }); };
          await setup(a, { format: 'libre3', scores: { Bleu: 3, Gris: 1, Noir: 0 }, poss: 'Bleu', prelude: pre });
          await instrument(a);
          const B = await a.ev(() => JSON.parse(JSON.stringify(S.history[S.history.length - 1].before)));
          const hl = await a.ev(() => S.history.length);
          await a.page.locator('[onclick="endPeriodByLeader()"]:visible').first().click();
          await atMs(a, 480);
          const how = await tapUndo(a);
          await a.page.waitForTimeout(2300);
          const s = await a.ev(() => JSON.parse(JSON.stringify(S)));
          eq(s.history.length, hl - 1, `${nom} libre (${how}) : dernier événement défait`);
          eq([s.period, s.scores, s.periodWins], [B.period, B.scores, B.periodWins], `${nom} libre : état = before`);
          eq(await peState(a), null, `${nom} libre : periodEndTimer`);
          await a.close(); apps.pop();
        }
        /* historique vide : ↶ désactivé, la période se termine normalement */
        {
          const a = await open(opts);
          await setup(a, { format: '9_11', scores: { Bleu: 2, Gris: 1, Noir: 0 }, poss: 'Bleu' });
          await instrument(a);
          eq(await a.ev(() => S.history.length), 0, 'historique vide');
          await PATHS.menu(a);
          await atMs(a, 480);
          const how = await tapUndo(a);
          await a.page.waitForTimeout(1500);
          const s = await a.ev(() => JSON.parse(JSON.stringify(S)));
          eq([s.period, s.periodWins.Bleu, s.scores], [2, 1, { Bleu: 0, Gris: 0, Noir: 0 }], `${nom} historique vide (${how}) : la période se termine`);
          await a.close(); apps.pop();
        }
      }
    });
    /* 4. deux annulations rapprochées */
    await chk(`${P} · 4 · deux ↶ rapprochés dans la fenêtre : état = before de l'avant-dernier événement, stable 2 s`, async () => {
      for (const [nom, opts] of MODES) for (const path of ['faute', 'echappe']) {
        const a = await open(opts);
        const pre = async app => { await app.lancer({ target: 'Gris', caught: true }); };
        const cfg = { ...CFG[path].duel11 };
        await setup(a, { ...cfg, prelude: pre });
        await instrument(a);
        const B = await a.ev(() => JSON.parse(JSON.stringify(S.history[0].before)));
        await PATHS[path](a);
        await atMs(a, path === 'faute' ? 480 : 700);
        const h1 = await tapUndo(a); await a.page.waitForTimeout(80); const h2 = await tapUndo(a);
        for (const phase of [0, 2000]) {
          if (phase) await a.page.waitForTimeout(phase);
          const s = await a.ev(() => JSON.parse(JSON.stringify(S)));
          eq(s.history.length, 0, `${nom} ${path} (${h1},${h2}) +${phase} : historique`);
          for (const k of Object.keys(B)) eq(k === 'stopped' ? (s.stopped !== false) : s[k], B[k], `${nom} ${path} +${phase} : ${k}`);
        }
        eq(await peState(a), null, 'periodEndTimer');
        await a.close(); apps.pop();
      }
    });
    /* 5. atteignabilité de ↶ */
    await chk(`${P} · 5 · atteignabilité de ↶ pendant la fenêtre (elementFromPoint tous les 100 ms) : tableau écrit dans audit/C23-mesures-${gabarit}.json`, async () => {
      mesures.atteignabilite = {};
      for (const [nom, opts] of MODES) for (const path of ['faute', 'echappe', 'menu']) {
        const a = await open(opts);
        const cfg = path === 'menu' ? { format: '9_11', scores: { Bleu: 3, Gris: 2, Noir: 1 }, poss: 'Bleu' } : CFG[path].duel11;
        const pre = path === 'menu' ? async app => { await app.lancer({ target: 'Gris', caught: true }); } : null;
        await setup(a, { ...cfg, prelude: pre });
        await instrument(a);
        await PATHS[path](a);
        const out = await a.ev(async () => {
          const res = []; let next = 0;
          const find = () => [...document.querySelectorAll('#undoBtn,#undoBtnPhone')].find(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
          for (;;) {
            const t = performance.now() - window.__t0; if (t > 1450) break;
            if (t >= next) {
              const b = find(); let hit = false;
              if (b) { const r = b.getBoundingClientRect(), el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); hit = !!el && (el === b || b.contains(el)); }
              res.push([Math.round(t), hit]); next += 100;
            }
            await new Promise(r => setTimeout(r, 10));
          }
          return res;
        });
        const plages = []; let cur = null;
        out.forEach(([t, h]) => { if (h) { if (!cur) cur = [t, t]; else cur[1] = t; } else if (cur) { plages.push(cur); cur = null; } });
        if (cur) plages.push(cur);
        mesures.atteignabilite[`${path} · ${nom}`] = { atteint_aux_ms: plages.map(p => p[0] === p[1] ? `${p[0]}` : `${p[0]}–${p[1]}`).join(' ; ') || 'jamais', echantillons: out.length };
        await a.close(); apps.pop();
      }
      console.log(`  atteignabilité C23 [${gabarit}] : ` + JSON.stringify(mesures.atteignabilite));
    });
    /* 6. sans annulation, rien ne change */
    await chk(`${P} · 6 · sans annulation : chronologie inchangée (message, +1 400 ms période + 1, pointages à zéro, un seul save() au minuteur) ; ↶ après la fenêtre restaure E0 ; rejouer après une annulation dans la fenêtre : une seule fin`, async () => {
      for (const [nom, opts] of MODES) {
        const a = await open(opts);
        await setup(a, CFG.faute.duel11);
        await instrument(a);
        const E0 = await stateOf(a);
        await PATHS.faute(a);
        await atMs(a, 300);
        const mid = await a.ev(() => ({ period: S.period, sc: { ...S.scores }, wins: { ...S.periodWins }, msg: !!document.querySelector('#sheet .msg-center'), pe: typeof periodEndTimer === 'undefined' ? 'absent' : periodEndTimer !== null }));
        eq([mid.period, mid.sc.Bleu, mid.wins.Bleu, mid.msg], [1, 11, E0.periodWins.Bleu + 1, true], `${nom} : pendant le message`);
        await atMs(a, 1700); await a.settle();
        const fin = await stateOf(a);
        eq([fin.period, fin.scores, fin.possession, fin.periodWins.Bleu, fin.periodWins.Gris, fin.duelActive, fin.awaitingDuelStart],
          [2, { Bleu: 0, Gris: 0, Noir: 0 }, 'Gris', E0.periodWins.Bleu + 1, E0.periodWins.Gris, true, false], `${nom} : après 1 400 ms`);
        const apres = await a.ev(() => window.__saves.filter(x => !x.r && x.t - window.__t0 >= 1300).length);
        eq(apres, 1, `${nom} : un seul save() au minuteur`);
        eq(await peState(a), null, 'periodEndTimer nul après le minuteur');
        await tapUndo(a); await a.settle();
        const d = diff(await stateOf(a), E0); assert(!d, `${nom} : ↶ après la fenêtre ≠ E0 — ${d}`);
        /* annulation dans la fenêtre, puis la même action : une seule fin de période */
        await resetT0(a);
        await PATHS.faute(a); await atMs(a, 480); await tapUndo(a); await a.page.waitForTimeout(1700);
        const d2 = diff(await stateOf(a), E0); assert(!d2, `${nom} : après annulation dans la fenêtre ≠ E0 — ${d2}`);
        await resetT0(a);
        await PATHS.faute(a); await atMs(a, 1700); await a.settle();
        const f2 = await stateOf(a);
        eq([f2.period, f2.periodWins.Bleu, f2.periodWins.Gris, f2.scores], [2, E0.periodWins.Bleu + 1, E0.periodWins.Gris, { Bleu: 0, Gris: 0, Noir: 0 }], `${nom} : rejouée, la période se termine une seule fois`);
        assert(a.errors.length === 0, a.errors.join(' | '));
        await a.close(); apps.pop();
      }
    });
    /* 7. pendant la fenêtre : gestes refusés */
    await chk(`${P} · 7 · pendant la fenêtre : appui et glisser sur le terrain sans pending ni feuille, bloc d'équipe sans feuille des changements, second finishPeriod sans double compte ; ensuite le terrain répond`, async () => {
      for (const [nom, opts] of MODES) for (const path of ['faute', 'echappe']) {
        const a = await open(opts);
        await setup(a, { ...CFG[path].duel11, rosters: true });
        await instrument(a);
        const E0 = await stateOf(a);
        await PATHS[path](a);
        await atMs(a, path === 'faute' ? 480 : 700);
        const h0 = await a.ev(() => S.history.length);
        await a._tap([0.5, 0.5]);
        const g1 = await a.ev(() => ({ pending: !!pending, hist: S.history.length, menu: !!document.querySelector('#sheet [onclick^="pickFault"],#sheet [onclick^="pickResult"]') }));
        await drag(a);
        const g2 = await a.ev(() => ({ pending: !!pending, hist: S.history.length, menu: !!document.querySelector('#sheet [onclick^="pickFault"],#sheet [onclick^="pickResult"]') }));
        const chip = await a.page.locator('#scoreboard .team-chip .tname').first().boundingBox();
        await a.page.mouse.click(chip.x + chip.width / 2, chip.y + chip.height / 2);
        const g3 = await a.ev(() => ({ lineup: typeof lineupSheetTeam !== 'undefined' && lineupSheetTeam !== null, openSheetHasLineup: !!document.querySelector('#sheet [onclick^="pickSub"],#sheet [onclick^="closeLineupSheet"]') }));
        /* second finishPeriod pendant la fenêtre */
        await a.ev(() => { try { finishPeriod('Gris'); } catch (e) {} });
        let tardif = null;
        const faute = g1.pending || g2.pending;
        if (faute) {   /* ancien fichier : le geste a ouvert une saisie ; on la valide pour mesurer ce qui se passe */
          try { await a.clickSheet("pickFault('APPEL')"); await a._pickPlayer(); tardif = await a.ev(() => ({ hist: S.history.length })); } catch (e) { tardif = String(e).split('\n')[0]; }
        }
        const msg = `${nom} ${path} : appui terrain pending=${g1.pending}, glisser pending=${g2.pending}, lineup=${g3.lineup}, historique ${h0}→${g2.hist}${tardif ? ' ; saisie validée dans la fenêtre : ' + JSON.stringify(tardif) : ''}`;
        assert(!g1.pending && !g2.pending && !g1.menu && !g2.menu, msg);
        assert(g1.hist === h0 && g2.hist === h0, msg);
        assert(!g3.lineup && !g3.openSheetHasLineup, msg + ' (la feuille des changements s\'est ouverte)');
        await a.page.waitForTimeout(1700); await a.settle();
        const f = await stateOf(a);
        eq([f.period, f.periodWins.Bleu - E0.periodWins.Bleu, f.periodWins.Gris - E0.periodWins.Gris], [2, 1, 0], `${nom} ${path} : une seule période comptée (second finishPeriod)`);
        /* dès le minuteur passé, le premier geste fonctionne */
        await a._tap([0.5, 0.5]);
        eq(await a.ev(() => !!pending), true, `${nom} ${path} : le terrain ne répond pas après la fenêtre`);
        await a.clickSheet('cancelPendingEvent()'); await a.settle();
        await a.close(); apps.pop();
      }
    });

    /* ============ VOLET B ============ */
    await chk(`${P} · 9 · duel : ballon attrapé = +1 demande, changement de joueur = +0, reprise du même porteur = +0, d'un autre = +1 ; hors duel : attrapé = +0`, async () => {
      const a = await open(); await a.ev(() => { WP.seedFixed = 4242; });
      await a.startMatch({ format: 'duel11', withRosters: true }); await a.initialPossession('Bleu');
      await jouer(a, 'F E F E F E F E F');
      eq(await a.ev(() => wpCountK()), 9, 'K = 9');
      let n = await sentOf(a); assert(n >= 1, 'une demande au seuil');
      await jouer(a, 'A'); eq(await sentOf(a), n + 1, 'duel : attrapé'); n++;
      await jouer(a, 'S'); eq(await sentOf(a), n, 'changement de joueur');
      await jouer(a, 'R'); eq(await sentOf(a), n, 'reprise du même porteur');
      const po = await a.ev(() => S.possession); const autre = po === 'Bleu' ? 'Gris' : 'Bleu';
      await jouer(a, 'R:' + autre); eq(await sentOf(a), n + 1, 'reprise d\'un autre porteur'); n++;
      /* hors duel : 9/11, K >= 9, attrapé */
      const b = await open(); await b.ev(() => { WP.seedFixed = 4242; });
      await b.startMatch({ format: '9_11' }); await b.initialPossession('Bleu');
      await jouer(b, 'F E>next F E>next F E>next F E>next F');
      eq(await b.ev(() => [wpCountK(), S.eliminated, S.duelActive]), [9, null, false], 'trois équipes, K = 9');
      const m = await sentOf(b); eq(m, 1, 'une demande à K = 9');
      await jouer(b, 'A'); eq(await sentOf(b), m, 'hors duel : attrapé = +0');
    });
    await chk(`${P} · 10 · fraîcheur : 40 actions par vrais gestes en Duel 11, après chaque action stabilisée les barres reposent sur l'état courant ; « Calculé après l'action n° » ne retarde plus`, async () => {
      const a = await open(); await a.ev(() => { WP.seedFixed = 4242; });
      await a.startMatch({ format: 'duel11' }); await a.initialPossession('Bleu');
      const r = rng(2024); const toks = ['F', 'E', 'A', 'A', 'R'];
      let verifs = 0;
      for (let i = 0; i < 40; i++) {
        const tok = i < 9 ? ['F', 'E'][i % 2] : toks[Math.floor(r() * toks.length)];
        await jouer(a, tok);
        const s = await a.ev(() => {
          if (wpTransition() || wpCountK() < WP.minK) return { skip: true };
          const st = WP.cur && WP.cur.state, T = ATEAMS();
          return { inFlight: WP.inFlight, sig: !!WP.result && WP.result.sig === wpSig(),
            same: !!st && st.possession === S.possession && JSON.stringify(T.map(t => st.scores[t])) === JSON.stringify(T.map(t => S.scores[t])) &&
              JSON.stringify(T.map(t => st.periodWins[t] || 0)) === JSON.stringify(T.map(t => (S.periodWins && S.periodWins[t]) || 0)) && st.eliminated === S.eliminated && !!st.duelActive === !!S.duelActive,
            last: WP.result && WP.result.reqId === WP.reqId, len: S.history.length };
        });
        if (s.skip) continue;
        verifs++;
        assert(!s.inFlight && (s.sig || tok === 'R') && s.same && s.last, `action ${i + 1} (${tok}) : ${JSON.stringify(s)}`);
      }
      assert(verifs >= 25, 'peu d\'actions vérifiées : ' + verifs);
      await jouer(a, 'A');
      await a.ev(() => openWinDetail());
      const txt = await a.ev(() => [document.getElementById('sheet').textContent, S.history.length]);
      assert(txt[0].includes(`Calculé après l'action n° ${txt[1]}.`), `texte de la feuille : ${txt[0].slice(-160)} / historique ${txt[1]}`);
    });
    await chk(`${P} · 11 · déterminisme : action, ↶, même action = mêmes barres ; 10 annulations enchaînées : une demande en vol au plus, résultat final sur l'état courant`, async () => {
      const a = await open(); await a.ev(() => { WP.seedFixed = 777; });
      await a.startMatch({ format: 'duel11' }); await a.initialPossession('Bleu');
      await jouer(a, 'F E F E F E F E F');
      await jouer(a, 'A'); const b1 = await barsOf(a);
      await jouer(a, 'U'); await jouer(a, 'A'); const b2 = await barsOf(a);
      eq(b2, b1, 'mêmes barres');
      await jouer(a, 'E F E F E F E F E F E A');
      await a.ev(() => { window.__nl = 0; const o = window.wpLaunch; window.wpLaunch = function () { window.__nl++; return o(); }; });
      const hl0 = await a.ev(() => S.history.length);
      await a.ev(() => { for (let i = 0; i < 10; i++) undo(); });
      await wait(a); await a.page.waitForTimeout(100); await wait(a);
      const f = await a.ev(() => ({ hl: S.history.length, k: wpCountK(), min: WP.minK, nl: window.__nl, sig: !!WP.result && WP.result.sig === wpSig(), inFlight: WP.inFlight }));
      eq(f.hl, hl0 - 10, 'dix annulations');
      assert(f.k >= f.min, 'K sous le seuil, le test ne mesure rien : ' + f.k);
      assert(f.sig && !f.inFlight && f.nl <= 2, 'résultat final sur l\'état courant avec au plus 2 lancements : ' + JSON.stringify(f));
    });

    /* ============ VOLET C ============ */
    await chk(`${P} · 12 · seuil : K de 0 à 8 parts égales, opacité 0,4, aucune demande (dont 3 fautes de Bleu) ; K = 9 : une demande, barres = moteur ; ↶ sous le seuil : parts égales sans calcul ; feuille de détail cite 9`, async () => {
      for (const [format, part] of [['9_11', '33.3'], ['duel11', '50.0']]) {
        const a = await open(); await a.ev(() => { WP.seedFixed = 4242; });
        eq(await a.ev(() => WP.minK), 9, 'WP.minK par défaut');
        await a.startMatch({ format }); await a.initialPossession('Bleu');
        const seq = (format === '9_11' ? 'F E>next F E>next F E>next F E>next' : 'F E F E F E F E').split(' ');
        for (let K = 0; K <= 8; K++) {
          if (K > 0) await jouer(a, seq[K - 1]);
          const s = await barsOf(a);
          s.forEach(b => eq([b[1], b[2], b[3]], [part, part, '0.4'], `${format} K=${K} : parts égales`));
          eq(await sentOf(a), 0, `${format} K=${K} : aucune demande`);
        }
        if (format === '9_11') {   /* le cas de l'audit : 3 fautes directes de Bleu */
          const c = await open(); await c.ev(() => { WP.seedFixed = 4242; });
          await c.startMatch({ format }); await c.initialPossession('Bleu');
          await jouer(c, 'F F F');
          (await barsOf(c)).forEach(b => eq([b[1], b[2], b[3]], [part, part, '0.4'], '3 fautes de Bleu : parts égales'));
          eq(await sentOf(c), 0, '3 fautes de Bleu : aucune demande');
          await c.ev(() => openWinDetail());
          assert((await c.ev(() => document.getElementById('sheet').textContent)).includes('jusqu\'à 9 fautes'), 'la feuille cite 9');
        }
        await jouer(a, 'F');
        eq(await a.ev(() => wpCountK()), 9, 'K = 9'); eq(await sentOf(a), 1, `${format} : une demande à K = 9`);
        const ok = await a.ev(() => { const r = WP.result; if (!r) return false; return [...document.querySelectorAll('#scoreboard .wp')].every(e => e.dataset.match === (100 * r.match[e.dataset.team] / (r.n - r.unfinished)).toFixed(1)); });
        assert(ok, `${format} : barres ≠ résultat du moteur`);
        await jouer(a, 'U');
        (await barsOf(a)).forEach(b => eq([b[1], b[2], b[3]], [part, part, '0.4'], `${format} : après ↶ sous le seuil, parts égales`));
        eq(await sentOf(a), 1, `${format} : ↶ sous le seuil ne lance aucun calcul`);
      }
    });
    await chk(`${P} · 13 · moteur embarqué identique à sim/simcore.js ; simcore.js non modifié (empreinte)`, async () => {
      const a = await open();
      const lines = fs.readFileSync(SIMCORE, 'utf8').split('\n');
      eq(await a.ev(() => KBSimFactory.toString()), lines.slice(6, 292).join('\n'), 'moteur');
      eq(crypto.createHash('sha256').update(fs.readFileSync(SIMCORE)).digest('hex'), SIMCORE_SHA, 'empreinte de simcore.js');
    });

    /* ============ VOLET D (mise en page) et données ============ */
    const geom = () => {
      const sb = document.getElementById('scoreboard'), chips = [...sb.querySelectorAll('.team-chip')], c = chips[0], cr = c.getBoundingClientRect();
      const w = c.querySelector('.wp'), wr = w && w.getBoundingClientRect(), bm = c.querySelector('.wp-m').getBoundingClientRect(), f = document.getElementById('field').getBoundingClientRect();
      const mb = document.getElementById('matchBar'), mbr = mb && mb.getClientRects().length ? mb.getBoundingClientRect() : null;
      const num = x => Math.round(x * 10) / 10;
      const hit = chips.map(ch => { const r = ch.getBoundingClientRect(), W = ch.querySelector('.wp').getBoundingClientRect(); return [document.elementFromPoint(r.x + r.width / 2, r.y + (W.top - r.top) / 2), document.elementFromPoint(r.x + r.width / 2, W.top + W.height / 2)]; });
      const content = [...c.querySelectorAll('.tscore,.twins,.tname')].map(e => e.getBoundingClientRect().bottom);
      const dot = c.querySelector('.poss-dot');
      return { ribbon: num(sb.getBoundingClientRect().height), chipH: num(cr.height), wpH: num(wr.height), wpW: num(wr.width), chipW: num(cr.width), zoneChangements: num(wr.top - cr.top), field: [num(f.width), num(f.height), num(f.bottom)], vh: innerHeight, mbBottom: mbr && num(mbr.bottom),
        contentMax: num(Math.max(...content)), wpTop: num(wr.top), barTop: num(bm.top), barBottomGap: num(cr.bottom - bm.bottom),
        hits: hit.map(([a, b]) => [!!a.closest('.team-chip') && !a.closest('.wp'), !!b.closest('.wp')]) };
    };
    const mesurer = async (file, format) => {
      const a = await open();
      if (file) {
        await a.page.goto('file://' + file, { waitUntil: 'domcontentloaded' });
        await a.page.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined');
        await a.page.addStyleTag({ content: '#sheet{transition:none !important}' });
      }
      await a.startMatch({ format, withRosters: true }); await a.initialPossession('Bleu');
      await a.ev(() => { WP.minK = 1; });
      await jouer(a, 'F E F');
      const g = await a.ev(geom);
      const caps = {};
      await a.close(); apps.pop();
      return g;
    };
    await chk(`${P} · 15 · mise en page : ${phone ? 'téléphone, zone d\'appui ≥ 28 px, zone des changements et terrain pas plus petits, rien ne déborde' : 'tablette, géométrie identique à la sauvegarde'}`, async () => {
      const AVANT = exigerAvant(AVANT_NOM);
      mesures.layout = {};
      for (const format of ['9_11', 'duel11']) {
        const av = await mesurer(AVANT, format), ap = await mesurer(null, format);
        mesures.layout[format] = { avant: av, apres: ap };
        if (!phone) {
          eq(ap, av, `${format} : géométrie tablette ≠ sauvegarde`);
        } else {
          assert(ap.wpH >= 28, `${format} : zone d'appui ${ap.wpH}`);
          eq(ap.zoneChangements, av.zoneChangements, `${format} : zone des changements`);
          assert(ap.field[0] >= av.field[0] - 0.5 && Math.abs(ap.field[0] - ap.field[1]) < 1.5, `${format} : terrain ${ap.field} (avant ${av.field})`);
          assert(ap.field[2] <= ap.vh && (ap.mbBottom === null || ap.mbBottom <= ap.vh + 0.5), `${format} : déborde en bas (${ap.field[2]} / ${ap.mbBottom} / ${ap.vh})`);
          assert(ap.barBottomGap >= 4 && ap.contentMax <= ap.barTop + 0.5, `${format} : recouvrement (contenu ${ap.contentMax}, barres ${ap.barTop}, écart bas ${ap.barBottomGap})`);
          ap.hits.forEach(([ch, wp], i) => assert(ch && wp, `${format} bloc ${i} : le centre de la zone des changements ou des barres n'atteint pas le bon élément`));
        }
      }
    }, KNOWN_AVANT);
    if (phone) await chk(`${P} · 15b · téléphone : un vrai appui tactile au milieu de la zone des barres ouvre « CHANCES DE VICTOIRE », un appui sur le pointage ouvre les changements`, async () => {
      const a = await open(); await a.ev(() => { WP.seedFixed = 4242; });
      await a.startMatch({ format: '9_11', withRosters: true }); await a.initialPossession('Bleu');
      const pt = sel => a.ev(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
      let p = await pt('#scoreboard .team-chip .wp'); await a.page.touchscreen.tap(p.x, p.y);
      assert(await a.sheetOpen() && (await a.ev(() => document.getElementById('sheet').textContent)).includes('CHANCES DE VICTOIRE'), 'les barres n\'ouvrent pas le détail');
      await a.ev(() => closeSheet()); await a.settle();
      p = await pt('#scoreboard .team-chip .tscore'); await a.page.touchscreen.tap(p.x, p.y);
      assert(await a.sheetOpen() && !(await a.ev(() => document.getElementById('sheet').textContent)).includes('CHANCES DE VICTOIRE'), 'le pointage n\'ouvre pas les changements');
    });
    /* 16. données */
    await chk(`${P} · 16 · données : partie scénarisée identique à la sauvegarde (Object.keys(S), S, buildActionRows(), nombre de save()) ; rien de WP ni de periodEndTimer dans S`, async () => {
      const AVANT = exigerAvant(AVANT_NOM);
      const script = 'F E F E F F F F F D:Gris F F U F R A F F F F F F F';
      const jouerComplet = async file => {
        const a = await open();
        if (file) {
          await a.page.goto('file://' + file, { waitUntil: 'domcontentloaded' });
          await a.page.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined');
          await a.page.addStyleTag({ content: '#sheet{transition:none !important}' });
        }
        await a.ev(() => { window.__saves = 0; const o = window.save; window.save = function (...x) { window.__saves++; return o.apply(this, x); }; });
        await a.startMatch({ format: '9_11', withRosters: true }); await a.initialPossession('Bleu');
        for (const tok of script.split(' ')) {
          if (tok.startsWith('D:')) { if (await a.awaitingDuel()) await a.duelStart(tok.slice(2)); continue; }
          if (await a.awaitingDuel()) await a.duelStart('Gris');
          const info = await a.ev(() => ({ po: S.possession, el: S.eliminated, teams: ATEAMS() }));
          const cible = info.teams.find(t => t !== info.po && t !== info.el);
          if (tok === 'F') await a.faute({}); else if (tok === 'E') await a.lancer({ target: cible, caught: false });
          else if (tok === 'A') await a.lancer({ target: cible, caught: true }); else if (tok === 'R') await a.reprise({ team: info.po });
          else if (tok === 'U') await a.undo();
          if (file === null) await wait(a);
        }
        await a.settle(); if (!file) await wait(a);
        const out = await a.ev(() => {
          const arr = o => JSON.parse(JSON.stringify(o), (k, v) => typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e5) / 1e5 : v);
          const c = arr(S); delete c.id; delete c.createdAt; delete c.updatedAt; delete c.sheetDismissable;
          const j = JSON.stringify(S);
          return { S: c, keys: Object.keys(S), rows: arr(buildActionRows()), saves: window.__saves, fuite: /"WP"|periodEndTimer|minK|lastPoss/.test(j) };
        });
        await a.close(); apps.pop();
        return out;
      };
      const avant = await jouerComplet(AVANT), apres = await jouerComplet(null);
      eq(apres.keys, avant.keys, 'Object.keys(S)');
      { const d = diff(apres.S, avant.S); assert(!d, 'S (hors id et dates) : ' + d); }
      { const d = diff(apres.rows, avant.rows); assert(!d, 'buildActionRows() : ' + d); }
      eq(apres.saves, avant.saves, 'nombre d\'appels de save()');
      assert(!apres.fuite, 'WP ou periodEndTimer dans JSON.stringify(S)');
      assert(avant.S.history.length > 10 && avant.S.period >= 2 && JSON.stringify(avant.rows).length > 2000, 'partie non triviale');
    }, KNOWN_AVANT);

    fs.mkdirSync(SORTIE, { recursive: true });
    fs.writeFileSync(`${SORTIE}/C23-mesures-${gabarit}.json`, JSON.stringify(mesures, null, 1));
  } finally {
    for (const a of apps) { try { await a.close(); } catch {} }
  }
}
