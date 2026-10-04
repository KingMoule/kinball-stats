/* C22 : la feuille de saisie avale les appuis fantômes (F20, N4, B2, F21, N3, F22, N2).
   Les appuis MESURÉS sont de vrais appuis aux coordonnées (page.mouse.click ;
   page.touchscreen.tap sur le téléphone), avec l'animation de la feuille
   (launch(…, { anim: true })) : jamais locator.click(), force, ni appel direct
   d'une fonction de l'app. L'installation de l'état de départ passe par les
   gestes du banc. Le Δ réel entre deux appuis (horodatage des pointerdown) est
   donné dans chaque message d'échec. */
import { launch, assert, eq } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];

const KEYS = () => ({
  scores: S.scores, possession: S.possession, stopped: S.stopped, eliminated: S.eliminated,
  duelActive: S.duelActive, awaitingDuelStart: S.awaitingDuelStart, period: S.period,
  periodWins: S.periodWins, n: S.history.length,
});
const sleep = (app, ms) => app.page.waitForTimeout(ms);

async function install(app) {
  await app.page.evaluate(() => {
    if (window.__probe) return;
    window.__pd = [];
    document.addEventListener('pointerdown', e => window.__pd.push(e.timeStamp), true);
    window.__msgSeen = 0;
    new MutationObserver(() => { if (document.querySelector('#sheet .msg-center')) window.__msgSeen++; })
      .observe(document.getElementById('sheet'), { childList: true, subtree: true });
    window.__probe = 1;
  });
}
/* Le second appui peut tomber sur le TERRAIN quand la feuille a déjà quitté l'endroit touché
   (elle descend de 220 ms) : c'est un vrai appui sur le terrain, pas sur la feuille ; il ouvre une
   saisie en attente, qu'on jette (nettoyage, hors mesure) pour la suite du scénario. */
const dropField = app => app.page.evaluate(() => { const had = !!pending; if (had) cancelPendingEvent(); return had; });
const snap = app => app.page.evaluate(KEYS);
/* Feuille ouverte, au repos (ni montée ni descente) : seulement alors on relève les rectangles. */
const ready = app => app.page.waitForFunction(() => {
  const sh = document.getElementById('sheet');
  return sh.classList.contains('open') && !sh.classList.contains('closing') && sh.getAnimations().length === 0;
}, null, { timeout: 5000, polling: 10 });
const closedIdle = app => app.page.waitForFunction(() => {
  const sh = document.getElementById('sheet');
  return !sh.classList.contains('open') && !sh.classList.contains('closing') && sh.getAnimations().length === 0 && window.__timers === 0;
}, null, { timeout: 8000, polling: 10 });
const rect = (app, sel) => app.page.evaluate(sel => {
  const el = document.querySelector(sel); if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, r: r.right, b: r.bottom };
}, sel);
const B = call => `#sheet [onclick="${call}"]`;
async function need(app, sel) {
  const r = await rect(app, sel);
  if (!r) throw new Error(`introuvable : ${sel} — feuille : ${(await app.page.evaluate(() => document.getElementById('sheet').className + ' | ' + document.getElementById('sheet').textContent.replace(/\s+/g, ' ').slice(0, 90)))}`);
  return r;
}
async function tap(app, pt, via) {
  if (via === 'touch') await app.page.touchscreen.tap(pt.x ?? pt.cx, pt.y ?? pt.cy);
  else await app.page.mouse.click(pt.x ?? pt.cx, pt.y ?? pt.cy);
}
const C = r => ({ x: r.cx, y: r.cy });
async function fieldPt(app, nx = .5, ny = .5) {
  const b = await app.page.locator('#field').boundingBox();
  return { x: b.x + nx * b.width, y: b.y + ny * b.height };
}
async function fieldTap(app, nx, ny) {
  const p = await fieldPt(app, nx, ny), m = app.page.mouse;
  await m.move(p.x, p.y); await m.down(); await m.up();
  await ready(app);
}
async function fieldDrag(app) {
  const a = await fieldPt(app, .3, .3), b = await fieldPt(app, .7, .7), m = app.page.mouse;
  await m.move(a.x, a.y); await m.down(); await m.move(b.x, b.y, { steps: 2 }); await m.up();
  await ready(app);
}
/* Δ réel entre les deux derniers pointerdown. */
const dReal = app => app.page.evaluate(() => { const L = window.__pd, n = L.length; return n >= 2 ? Math.round(L[n - 1] - L[n - 2]) : null; });
/* Deux appuis : p1, attente d ms, p2. */
async function twoTaps(app, p1, d, p2, via) {
  await tap(app, p1, via); if (d > 0) await sleep(app, d); await tap(app, p2, via);
  return dReal(app);
}
async function fresh(app, opts = {}) {
  await app.page.evaluate(() => { pending = null; playerPickCont = null; closeSheet(); });
  await closedIdle(app);
  await app.startMatch({ format: '9_11', ...opts });
  await install(app);
  await app.page.evaluate(() => { window.__msgSeen = 0; });
}
async function setup(app, nFaults, opts = {}) {
  await fresh(app, opts);
  await app.initialPossession('Bleu');
  for (let i = 0; i < nFaults; i++) await app.faute({ code: 'APPEL' });
  await closedIdle(app);
  await sleep(app, 350);                 // hors de la fenêtre de double appui
}
function same(a, b, msg) { eq(a, b, msg); }

export default async function ({ gabarit, check }) {
  const app = await launch(gabarit, { anim: true });
  const PH = gabarit === 'telephone';
  const P = `[${gabarit}] C22`;
  const VIA = PH ? 'touch' : 'mouse';
  try {
    await check(`${P} · 0 l'animation de la feuille est bien présente (0.22s)`, async () => {
      const d = await app.page.evaluate(() => getComputedStyle(document.getElementById('sheet')).transitionDuration);
      eq(d, '0.22s', 'durée de transition de #sheet');
    });

    // ------------------------------------------------------------------ 1
    await check(`${P} · 1 F20-faute : appuis sur la feuille qui descend, état inchangé`, async () => {
      await setup(app, 8);
      const before = await snap(app);
      eq([before.scores.Gris, before.scores.Noir], [8, 8], 'départ 8-8');
      const plans = [];
      for (const t of ['APPEL', 'OFF ILL']) for (const d of [0, 30]) plans.push([t, d, VIA]);
      if (PH) { plans.push(['MEME', 60, 'touch'], ['MEME', 100, 'touch'], ['APPEL', 0, 'mouse'], ['MEME', 60, 'mouse']); }
      for (const [t, d, via] of plans) {
        await sleep(app, 350);
        await fieldTap(app, .5, .5);
        const cancel = await need(app, B('cancelPendingEvent()'));
        const target = t === 'MEME' ? cancel : await need(app, B(`pickFault('${t}')`));
        await app.page.evaluate(() => { window.__msgSeen = 0; });
        const real = await twoTaps(app, C(cancel), d, C(target), via);
        const ctx = `${t} Δ demandé ${d} ms (réel ${real} ms, ${via})`;
        await app.settle(); await sleep(app, 100); await dropField(app); await app.settle();
        same(await snap(app), before, `état modifié : ${ctx}`);
        const duel = await app.page.evaluate(() => !!document.querySelector('#sheet [onclick^="chooseDuelStart"]'));
        assert(!duel, `feuille du duel ouverte : ${ctx}`);
        assert(await app.page.evaluate(() => window.__msgSeen) === 0, `message éclair : ${ctx}`);
      }
      assert(app.errors.length === 0, app.errors.join(' | '));
    });

    // ------------------------------------------------------------------ 2
    await check(`${P} · 2 F20-résultat : appuis sur la feuille qui descend, état inchangé`, async () => {
      await fresh(app); await app.initialPossession('Bleu'); await sleep(app, 350);
      const before = await snap(app);
      const plans = [];
      for (const t of ["pickResult('Gris',false)", "pickResult('Noir',false)", "pickResult('Gris',true)"]) for (const d of [0, 30, 60]) plans.push([t, d]);
      for (const [t, d] of plans) {
        await sleep(app, 350);
        await fieldDrag(app);
        const cancel = await need(app, B('cancelPendingEvent()'));
        const target = await need(app, B(t));
        await app.page.evaluate(() => { window.__msgSeen = 0; });
        const real = await twoTaps(app, C(cancel), d, C(target), VIA);
        const ctx = `${t} Δ demandé ${d} ms (réel ${real} ms, ${VIA})`;
        await app.settle(); await sleep(app, 100); await dropField(app); await app.settle();
        same(await snap(app), before, `état modifié : ${ctx}`);
        assert(await app.page.evaluate(() => window.__msgSeen) === 0, `message éclair : ${ctx}`);
      }
    });

    // ------------------------------------------------------------------ 3
    await check(`${P} · 3 premier appui gagne (possession initiale, début de duel)`, async () => {
      for (const [other, d] of [['Gris', 0], ['Noir', 0], ['Gris', 30], ['Noir', 30]]) {
        await fresh(app);
        await ready(app);
        const first = await need(app, B("chooseInitialPossession('Bleu')"));
        const second = await need(app, B(`chooseInitialPossession('${other}')`));
        const real = await twoTaps(app, C(first), d, C(second), VIA);
        await app.settle();
        eq((await snap(app)).possession, 'Bleu', `possession initiale : ${other} Δ ${d} (réel ${real}) a pris la place`);
      }
      for (const d of [0, 30]) {
        await setup(app, 8);
        await app.faute({ code: 'APPEL' });                 // 9e : Bleu éliminé
        await ready(app);
        const first = await need(app, B("chooseDuelStart('Gris')"));
        const second = await need(app, B("chooseDuelStart('Noir')"));
        const real = await twoTaps(app, C(first), d, C(second), VIA);
        await app.settle();
        eq((await snap(app)).possession, 'Gris', `début de duel : Noir Δ ${d} (réel ${real}) a pris la place`);
      }
    });

    // ------------------------------------------------------------------ 4
    await check(`${P} · 4 F21 : bouton ↶ dans la feuille du duel`, async () => {
      for (const mode of ['faute', 'echappe']) {
        await setup(app, 8);
        const before = await snap(app);
        const eliminate = async () => {
          if (mode === 'faute') await app.faute({ code: 'APPEL' });
          else await app.lancer({ target: 'Gris', caught: false });
          await ready(app);
        };
        await eliminate();
        const after = await snap(app);
        assert(after.awaitingDuelStart && after.eliminated, `élimination non obtenue (${mode})`);
        const geo = await app.page.evaluate(() => {
          const sh = document.getElementById('sheet'), b = sh.querySelector('[onclick="undo()"]');
          if (!b) return { exists: false };
          const r = b.getBoundingClientRect(), s = sh.getBoundingClientRect();
          return { exists: true, last: sh.lastElementChild === b, disabled: b.disabled,
            inWindow: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
            inSheet: r.top >= s.top - 0.5 && r.bottom <= s.bottom + 0.5, h: Math.round(r.height) };
        });
        assert(geo.exists, `bouton undo() absent de la feuille du duel (${mode})`);
        assert(geo.last && !geo.disabled && geo.inWindow && geo.inSheet, `bouton undo() mal placé (${mode}) : ${JSON.stringify(geo)}`);
        const b = await need(app, B('undo()'));
        await tap(app, C(b), VIA);
        await app.settle(); await sleep(app, 60);
        same(await snap(app), before, `état non restauré (${mode})`);
        assert(!(await app.page.evaluate(() => document.getElementById('sheet').classList.contains('open'))), `feuille restée ouverte (${mode})`);
        eq(await app.page.evaluate(() => document.querySelectorAll('.tscore.out').length), 0, `.tscore.out restant (${mode})`);
        // double appui au même point : une seule action annulée
        for (const d of [100, 250]) {
          await sleep(app, 350);
          await eliminate();
          const n0 = (await snap(app)).n;
          const bb = await need(app, B('undo()'));
          const real = await twoTaps(app, C(bb), d, C(bb), VIA);
          await app.settle(); await sleep(app, 60);
          const n1 = await app.page.evaluate(() => { const r = S.history.length; if (pending) cancelPendingEvent(); return r; });   // nettoyage : sur tablette le 2e appui peut tomber sur le terrain
          eq(n1, n0 - 1, `double appui ${mode} Δ ${d} (réel ${real}) : history.length ${n0} → ${n1}`);
          await sleep(app, 450);
        }
      }
    });

    // ------------------------------------------------------------------ 5
    await check(`${P} · 5 F22 : pendingPeriodWinner hors de S`, async () => {
      await setup(app, 8);
      /* M03 : avec le stockage local, la copie kinball_backup_<id> est retirée dès que l'écriture
         réussit ; on la lit donc au moment où elle est écrite (enregistrement des setItem). */
      await app.page.evaluate(() => {
        window.__lsEcrits = [];
        const si = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('kinball_backup_')) window.__lsEcrits.push(String(v)); return si.call(this, k, v); };
      });
      await app.faute({ code: 'APPEL' });                   // 9e : duel
      await app.duelStart('Gris');
      await app.faute({ code: 'APPEL' });                   // Noir 10
      await app.faute({ code: 'APPEL' });                   // Noir 11 : période terminée par faute
      const r = await app.page.evaluate(() => {
        const k = Object.keys(localStorage).filter(k => k.startsWith('kinball_backup_'));
        return { inS: 'pendingPeriodWinner' in S, ls: k.map(x => localStorage.getItem(x)).concat(window.__lsEcrits).join('').includes('pendingPeriodWinner'), nls: k.length + window.__lsEcrits.length, wins: S.periodWins, period: S.period };
      });
      assert(r.wins.Noir === 1, `la période n'est pas terminée : ${JSON.stringify(r)}`);
      assert(!r.inS, "'pendingPeriodWinner' encore dans S");
      assert(r.nls >= 1, 'aucune copie localStorage trouvée (test sans objet)');
      assert(!r.ls, 'copie localStorage porteuse de pendingPeriodWinner');
      // valeur injectée : une faute à 0-0 ne doit rien terminer
      await closedIdle(app);
      const b = await snap(app);
      await app.page.evaluate(() => { S.pendingPeriodWinner = 'Gris'; });
      await app.faute({ code: 'APPEL' });
      const a = await snap(app);
      eq([a.period, a.periodWins], [b.period, b.periodWins], 'période terminée à tort par une valeur résiduelle');
      await app.page.evaluate(() => { delete S.pendingPeriodWinner; });
    });

    // ------------------------------------------------------------------ 6
    if (PH) {
      const undoR = async () => need(app, '#undoBtnPhone');
      const inter = (a, b) => { const x0 = Math.max(a.x, b.x), x1 = Math.min(a.r, b.r), y0 = Math.max(a.y, b.y), y1 = Math.min(a.b, b.b); return x1 > x0 && y1 > y0 ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : null; };
      // b) partie gauche de « Annuler cette saisie » (recouvre ↶ de la barre) : second appui au même point
      for (const d of [100, 200, 300]) {
        await check(`${P} · 6b N4 : « Annuler cette saisie », second appui au même point à ${d} ms : ↶ ne défait rien`, async () => {
          await setup(app, 8);
          await fieldTap(app, .5, .5);
          const cancel = await need(app, B('cancelPendingEvent()'));
          const p = inter(cancel, await undoR());
          assert(p, "« Annuler cette saisie » ne recouvre pas ↶");
          const n0 = (await snap(app)).n;
          const real = await twoTaps(app, p, d, p, 'touch');
          await app.settle(); await sleep(app, 60); await dropField(app); await app.settle();
          eq((await snap(app)).n, n0, `Δ ${d} (réel ${real}) : une action défaite`);
        });
      }
      await check(`${P} · 6c N4 : ↶ réarmé (460 ms après un appui de feuille), puis trois ↶ à 150 ms sans feuille`, async () => {
        await setup(app, 8);
        await fieldTap(app, .5, .5);
        await tap(app, C(await need(app, B('cancelPendingEvent()'))), 'touch');
        await sleep(app, 460);
        const n0 = (await snap(app)).n;
        await tap(app, C(await undoR()), 'touch'); await app.settle();
        eq((await snap(app)).n, n0 - 1, '↶ doit annuler 460 ms après un appui de feuille');
        await sleep(app, 460);
        const m0 = (await snap(app)).n;
        for (let i = 0; i < 3; i++) { await tap(app, C(await undoR()), 'touch'); await sleep(app, 150); }
        await app.settle();
        eq((await snap(app)).n, m0 - 3, 'trois appuis ↶ sans feuille');
      });
      // a) feuille du duel : le bouton d'équipe de gauche ne recouvre plus ↶ (mesuré : il est au-dessus) ;
      //    c'est le bouton « ↶ Annuler la dernière action » de la feuille qui le recouvre. Un appui
      //    en son centre annule UNE action ; le second appui (↶ de la barre, apparu dessous) est ignoré.
      await check(`${P} · 6a N4 : feuille du duel, ↶ de la feuille au-dessus de ↶ de la barre : une seule action annulée`, async () => {
        await setup(app, 8);
        for (const d of [100, 200, 300]) {
          await app.faute({ code: 'APPEL' });                 // 9e : feuille du duel
          await ready(app);
          const left = await need(app, B("chooseDuelStart('Gris')"));
          const ub = await need(app, B('undo()'));
          const u = await undoR();
          assert(!inter(left, u), 'le bouton d’équipe recouvre ↶ : la mise en page a changé, adapter le scénario');
          const p = inter(ub, u);
          assert(p, `le bouton ↶ de la feuille ne recouvre pas ↶ de la barre : ${JSON.stringify({ ub, u })}`);
          const s0 = await snap(app);
          const real = await twoTaps(app, p, d, p, 'touch');
          await app.settle(); await sleep(app, 60);
          const s1 = await snap(app);
          eq(s1.n, s0.n - 1, `duel Δ ${d} (réel ${real}) : history.length ${s0.n} → ${s1.n} (une seule action doit être annulée)`);
          assert(!s1.awaitingDuelStart && !s1.eliminated, 'état non restauré');
          await sleep(app, 350);
        }
        // appui sur le bouton d'équipe de gauche (pas de recouvrement), second appui au même point : rien d'autre
        await app.faute({ code: 'APPEL' });
        await ready(app);
        const left = await need(app, B("chooseDuelStart('Gris')"));
        const s0 = await snap(app);
        const real = await twoTaps(app, C(left), 100, C(left), 'touch');
        await app.settle(); await sleep(app, 60);
        const s1 = await snap(app);
        eq([s1.n, s1.eliminated, s1.duelActive], [s0.n, s0.eliminated, s0.duelActive], `bouton d'équipe Δ réel ${real} : une action défaite`);
      });
    }

    // ------------------------------------------------------------------ 7
    await check(`${P} · 7 N2 : appui fantôme après TERMINÉ (changements)`, async () => {
      await fresh(app, { withRosters: true }); await app.initialPossession('Bleu'); await sleep(app, 350);
      const chip = await need(app, '#scoreboard .team-chip');
      await tap(app, C(chip), VIA);
      await ready(app);
      const fin = await need(app, B('closeLineupSheet()'));
      const ph = await need(app, B("pickSubOut('Bleu_p1')"));
      const real = await twoTaps(app, C(fin), 0, C(ph), VIA);
      await app.settle(); await sleep(app, 100);
      const r = await app.page.evaluate(() => ({ open: document.getElementById('sheet').classList.contains('open'), html: document.getElementById('sheet').innerHTML }));
      assert(!r.open && !/UNDEFINED/i.test(r.html), `la feuille s'est rouverte (Δ réel ${real}) : ${r.html.slice(0, 80)}`);
      // effet de commitLineupDefinition() feuille fermée (brouillon plein injecté)
      const e = await app.page.evaluate(() => {
        const a = JSON.stringify([S.lineups, S.history.length]);
        lineupDraft = ['Bleu_p1', 'Bleu_p2', 'Bleu_p3', 'Bleu_p4'];
        try { commitLineupDefinition(); } catch (x) { return { err: String(x) }; }
        lineupDraft = [];
        return { same: a === JSON.stringify([S.lineups, S.history.length]), a, b: JSON.stringify([S.lineups, S.history.length]) };
      });
      assert(e.same, 'commitLineupDefinition() feuille fermée a modifié S : ' + JSON.stringify(e).slice(0, 200));
    });

    // ------------------------------------------------------------------ 8
    await check(`${P} · 8 B2 : double appui au même point, feuille remplacée`, async () => {
      if (PH) for (const d of [0, 100, 250]) {
        await fresh(app, { withRosters: true }); await app.initialPossession('Bleu'); await sleep(app, 350);
        await fieldDrag(app);
        const x = await need(app, B("pickResult('Gris',false)"));
        const n0 = (await snap(app)).n;
        const real = await twoTaps(app, C(x), d, C(x), 'touch');
        await sleep(app, 100);
        const r = await app.page.evaluate(() => ({ ask: !!document.querySelector('#sheet .player-pick-row'), pend: !!pending, n: S.history.length }));
        assert(r.ask && r.pend && r.n === n0, `✕ Gris Δ ${d} (réel ${real}) : ${JSON.stringify(r)}`);
      }
      // 9e faute : « ? » puis second appui au même point
      for (const d of [0, 100, 250]) {
        await setup(app, 8, { withRosters: true });
        await fieldTap(app, .5, .5);
        await tap(app, C(await need(app, B("pickFault('APPEL')"))), VIA);
        await sleep(app, 350);
        const q = await need(app, B("choosePlayer('')"));
        const real = await twoTaps(app, C(q), d, C(q), VIA);
        await app.page.evaluate(() => 0); await sleep(app, 100);
        const r = await app.page.evaluate(() => ({ duelSheet: !!document.querySelector('#sheet [onclick^="chooseDuelStart"]'), aw: S.awaitingDuelStart, n: S.history.length }));
        assert(r.duelSheet && r.aw && r.n === 9, `9e faute « ? » Δ ${d} (réel ${real}) : ${JSON.stringify(r)}`);
      }
      // sans effectifs : ✕ Noir qui élimine
      if (PH) for (const d of [0, 100, 250]) {
        await setup(app, 8);
        await fieldDrag(app);
        const x = await need(app, B("pickResult('Noir',false)"));
        const real = await twoTaps(app, C(x), d, C(x), 'touch');
        await sleep(app, 100);
        const r = await snap(app);
        assert(r.awaitingDuelStart && r.possession === 'Bleu', `✕ Noir éliminant Δ ${d} (réel ${real}) : une équipe a été choisie ${JSON.stringify(r)}`);
      }
    });

    // ------------------------------------------------------------------ 9
    await check(`${P} · 9 pas de ralentissement : appui ailleurs accepté, 6 actions de suite`, async () => {
      await fresh(app, { withRosters: true }); await app.initialPossession('Bleu'); await sleep(app, 350);
      await fieldDrag(app);
      const x = await need(app, B("pickResult('Gris',false)"));
      await tap(app, C(x), VIA);
      await sleep(app, 100);
      const pb = await need(app, B("choosePlayer('Bleu_p3')"));
      assert(Math.hypot(pb.cx - x.cx, pb.cy - x.cy) > 40, 'le bouton joueur est trop près de ✕ pour ce test');
      await tap(app, C(pb), VIA);
      await app.settle(); await sleep(app, 60);
      const last = await app.page.evaluate(() => S.history[S.history.length - 1]);
      eq(last.details.attacker_player_id, 'Bleu_p3', 'appui à 100 ms et plus de 32 px perdu');
      // 6 actions ordinaires, appuis de feuille espacés de 250 ms
      await fresh(app); await app.initialPossession('Bleu');
      const steps = [
        ['drag', ["pickResult('Gris',true)"]],
        ['drag', ["pickResult('Bleu',false)"]],
        ['tap', ["pickFault('APPEL')"]],
        ['drag', ["pickResult('Gris',true)"]],
        ['tap', ['pickReprise()', "applyReprise('Bleu')"]],
        ['drag', ["pickResult('Gris',false)"]],
      ];
      let lastPt = { cx: -999, cy: -999 };
      for (const [gesture, calls] of steps) {
        await app.settle(); await sleep(app, 260);
        // l'équipe désignée doit être un adversaire : on lit la possession
        if (gesture === 'drag') await fieldDrag(app); else await fieldTap(app, .5, .5);
        await sleep(app, 250);
        for (const c of calls) {
          let call = c;
          if (call.startsWith('pickResult')) {
            const poss = await app.page.evaluate(() => S.possession);
            const opp = poss === 'Bleu' ? 'Gris' : 'Bleu';
            call = call.replace(/'(Gris|Bleu)'/, `'${opp}'`);
          }
          if (call.startsWith('applyReprise')) {
            // un bouton d'équipe à plus de 40 px du dernier appui (voir « QUESTIONS OUVERTES » : REPRISE puis équipe du milieu)
            const teams = await app.page.evaluate(() => ATEAMS());
            let best = null;
            for (const t of teams) { const r = await rect(app, B(`applyReprise('${t}')`)); if (r && Math.hypot(r.cx - lastPt.cx, r.cy - lastPt.cy) > 40) { best = t; break; } }
            assert(best, 'aucun bouton d’équipe à plus de 40 px de REPRISE DE JEU');
            call = `applyReprise('${best}')`;
          }
          const tr = await need(app, B(call)); lastPt = tr;
          await tap(app, C(tr), VIA);
          await sleep(app, 250);
        }
      }
      await app.settle();
      eq(await app.page.evaluate(() => S.history.length), 6, '6 actions, 6 événements');
      assert(app.errors.length === 0, app.errors.join(' | '));
    });

    // ------------------------------------------------------------------ 10
    await check(`${P} · 10 N3 : sortie de la feuille « QUI REPART AU BALLON ? »`, async () => {
      await fresh(app); await app.initialPossession('Bleu'); await sleep(app, 350);
      await fieldTap(app, .5, .5);
      await tap(app, C(await need(app, B('pickReprise()'))), VIA);
      await sleep(app, 350);
      const c = await rect(app, B('cancelPendingEvent()'));
      assert(c, 'pas de « Annuler cette saisie » dans la feuille de reprise');
      const n0 = (await snap(app)).n;
      await tap(app, C(c), VIA);
      await app.settle(); await sleep(app, 60);
      const r = await app.page.evaluate(() => ({ n: S.history.length, pend: pending, open: document.getElementById('sheet').classList.contains('open') }));
      assert(r.n === n0 && r.pend === null && !r.open, JSON.stringify(r));
      if (PH) {
        await sleep(app, 350);
        await fieldTap(app, .5, .5);
        const x = await need(app, B('pickReprise()'));
        const real = await twoTaps(app, C(x), 100, C(x), 'touch');
        await sleep(app, 100);
        const q = await app.page.evaluate(() => ({ n: S.history.length, pend: !!pending }));
        assert(q.n === n0 && q.pend, `double appui sur REPRISE DE JEU (réel ${real}) : ${JSON.stringify(q)}`);
        await app.page.evaluate(() => cancelPendingEvent());
      }
    });

    // ------------------------------------------------------------------ 11
    await check(`${P} · 11 aucune erreur console`, async () => { assert(app.errors.length === 0, app.errors.join(' | ')); });
  } finally { await app.close(); }
}
