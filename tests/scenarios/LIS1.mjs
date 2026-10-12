/* LIS-1 (F27, F28) : annuler une saisie à l'étage « joueurs » ; plus d'appui parasite sur ⌂ / TERMINER juste après.
   Détail : tests/docs/LIS1.md. */
import { launch, assert, eq } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];

async function ouvrir(gabarit, saisie, o = {}) {
  const app = await launch(gabarit, { saisie, ...(o.launch || {}) });
  await app.startMatch({ format: '9_11', withRosters: true });
  if (await app.ev(() => !!S.awaitingInitial)) await app.initialPossession('Gris');
  if (o.vp) { await app.page.setViewportSize(o.vp); await app.page.waitForTimeout(300); }
  return app;
}
const cible = app => app.ev(() => ATEAMS().find(t => t !== S.possession && t !== S.eliminated));
async function glisser(app, from = [0.3, 0.3], to = [0.7, 0.65]) {
  const a = await app._pt(from), b = await app._pt(to), m = app.page.mouse;
  await m.move(a.x, a.y); await m.down(); await m.move(b.x, b.y, { steps: 2 }); await m.up();
}
/* Amène la saisie à l'étage « joueurs » (lancer attrapé, ou faute directe EXT) et attend qu'il soit posé. */
async function versJoueurs(app, genre = 'lancer', saisie) {
  if (genre === 'lancer') { await glisser(app); await app.clickSheet(`pickResult('${await cible(app)}',true)`); }
  else { await app._tap([0.5, 0.5]); await app.clickSheet("pickFault('EXT')"); }
  if (saisie === 'radiale') {
    await app.page.waitForFunction(() => { const r = document.getElementById('radial'); return r.classList.contains('open') && !r.classList.contains('closing') && radialStage === 'players' && r.getAnimations({ subtree: true }).length === 0; }, null, { timeout: 4000, polling: 10 });
  } else {
    await app.page.waitForFunction(() => { const s = document.getElementById('sheet'); return s.classList.contains('open') && !!s.querySelector('.player-pick-row') && s.getAnimations({ subtree: true }).length === 0; }, null, { timeout: 4000, polling: 10 });
  }
}
const instant = app => app.ev(() => ({ n: S.history.length, sc: JSON.stringify(S.scores), pend: pending !== null, poss: S.possession, el: S.eliminated, h: JSON.stringify(S.history) }));
const rien = app => app.ev(() => document.getElementById('sheet').classList.contains('open') || radialBusy());
const aucuneFeuille = app => app.ev(() => !document.getElementById('sheet').classList.contains('open') && !radialBusy());
const coin = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
const inter = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] LIS1`;
  const phone = gabarit === 'telephone';

  /* ---------- F27 : mode feuille ---------- */
  for (const genre of ['lancer', 'faute']) {
    await check(`${P}·1${genre === 'lancer' ? 'a' : 'b'} feuille « ${genre === 'lancer' ? 'QUI A LANCÉ ?' : 'QUI A FAIT LA FAUTE ?'} » : « Annuler cette saisie », à l'écart du « ? » ; son appui jette la saisie (aucun événement, aucun point) et ferme la feuille`, async () => {
      const app = await ouvrir(gabarit, 'feuille', phone ? { vp: { width: 320, height: 568 } } : {});
      try {
        const avant = await instant(app);
        await versJoueurs(app, genre, 'feuille');
        const t = await app.ev(() => document.querySelector('#sheet .sheet-title').textContent);
        assert(new RegExp(genre === 'lancer' ? 'QUI A LANCÉ' : 'QUI A FAIT LA FAUTE').test(t), t);
        const info = await app.ev(() => {
          const c = document.querySelector('#sheet [onclick="cancelPendingEvent()"]'), q = document.querySelector('#sheet .player-pick.unknown');
          const rc = c.getBoundingClientRect(), rq = q.getBoundingClientRect();
          return { txt: c.textContent.trim(), cb: rc.bottom, ct: rc.top, ch: rc.height, qb: rq.bottom, vh: innerHeight, vw: innerWidth, cl: rc.left, cr: rc.right, inRow: !!c.closest('.player-pick-row') };
        });
        eq(info.txt, 'Annuler cette saisie', 'libellé');
        assert(!info.inRow, 'le bouton est hors de la grille des joueurs');
        assert(info.ct - info.qb >= 16, `écart au « ? » : ${info.ct - info.qb} px`);
        assert(info.cb <= info.vh && info.cl >= 0 && info.cr <= info.vw, `entier dans l'écran (${info.cb}/${info.vh})`);
        assert(info.ch >= 40, 'hauteur ' + info.ch);
        await app.clickSheet('cancelPendingEvent()'); await app.settle();
        const apres = await instant(app);
        eq([apres.pend, apres.n, apres.sc, apres.h], [false, avant.n, avant.sc, avant.h], 'rien ne reste : saisie, historique, scores');
        assert(await aucuneFeuille(app), 'feuille fermée');
        // la saisie suivante repart normalement
        await versJoueurs(app, genre, 'feuille');
        await app.clickSheet("choosePlayer('')"); await app.settle();
        eq(await app.ev(() => S.history.length), avant.n + 1, 'un événement après la saisie suivante');
        assert(app.errors.length === 0, app.errors.join(' | '));
      } finally { await app.close(); }
    });
  }

  await check(`${P}·1c feuille : « ? » et FAUTE D'ÉQUIPE enregistrent exactement comme avant`, async () => {
    const app = await ouvrir(gabarit, 'feuille');
    try {
      await versJoueurs(app, 'lancer', 'feuille'); await app.clickSheet("choosePlayer('')"); await app.settle();
      let e = await app.ev(() => { const x = S.history[S.history.length - 1]; return { t: x.type, d: x.details }; });
      eq([e.t, e.d.attacker_player_id, e.d.result], ['lancer', undefined, 'attrapé'], '« ? » sur un lancer');
      await versJoueurs(app, 'faute', 'feuille'); await app.clickSheet("choosePlayer('__equipe__')"); await app.settle();
      e = await app.ev(() => { const x = S.history[S.history.length - 1]; return { t: x.type, d: x.details }; });
      eq([e.t, e.d.fault_type, e.d.fault_scope, e.d.attacker_player_id], ['faute_directe', 'EXT', 'equipe', undefined], 'FAUTE D\'ÉQUIPE');
    } finally { await app.close(); }
  });

  /* ---------- F27 : menu radial ---------- */
  const vues = phone ? [{ w: 320, h: 568 }, { w: 390, h: 844 }] : [{ w: 1180, h: 820 }];
  for (const genre of ['lancer', 'faute']) for (const v of vues) {
    await check(`${P}·2${genre === 'lancer' ? 'a' : 'b'} radiale ${v.w} px, ${genre === 'lancer' ? 'lancer' : 'faute directe'} : « Annuler » entier dans le terrain, sans chevauchement, loin du « ? » ; son appui jette la saisie`, async () => {
      const app = await ouvrir(gabarit, 'radiale', { vp: { width: v.w, height: v.h } });
      try {
        const avant = await instant(app);
        for (const [at, nom] of [[[0.5, 0.5], 'centre'], [[0.5, 0.97], 'bas'], [[0.04, 0.96], 'coin bas gauche'], [[0.96, 0.96], 'coin bas droit'], [[0.5, 0.04], 'haut']]) {
          if (genre === 'lancer') { await glisser(app, Math.abs(at[0] - 0.5) < 0.1 && Math.abs(at[1] - 0.5) < 0.1 ? [0.3, 0.3] : [0.5 + (at[0] - 0.5) * 0.5, 0.5 + (at[1] - 0.5) * 0.5], at); await app.clickSheet(`pickResult('${await cible(app)}',true)`); }
          else { await app._tap(at); await app.clickSheet("pickFault('EXT')"); }
          await app.page.waitForFunction(() => { const r = document.getElementById('radial'); return r.classList.contains('open') && radialStage === 'players' && r.getAnimations({ subtree: true }).length === 0; }, null, { timeout: 4000, polling: 10 });
          const r = await app.ev(() => {
            const f = document.getElementById('field').getBoundingClientRect(), R = x => ({ left: x.left, top: x.top, right: x.right, bottom: x.bottom });
            return { f: R(f), btns: [...document.querySelectorAll('#radial .rd-btn')].map(b => ({ call: b.getAttribute('onclick'), txt: b.textContent.trim(), r: R(b.getBoundingClientRect()), over: b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1 })) };
          });
          const c = r.btns.filter(b => b.call === 'cancelPendingEvent()');
          eq(c.length, 1, `${nom} : un seul Annuler`); eq(c[0].txt, 'Annuler', 'libellé');
          const F = coin(r.f), C = coin(c[0].r);
          assert(C.l >= F.l - 1 && C.r <= F.r + 1 && C.t >= F.t - 1 && C.b <= F.b + 1, `${nom} : Annuler hors du terrain ${JSON.stringify([C, F])}`);
          assert(!c[0].over, `${nom} : texte qui déborde`);
          assert(C.b - C.t >= 40, 'hauteur ' + (C.b - C.t));
          r.btns.filter(b => b !== c[0]).forEach(b => assert(!inter(C, coin(b.r)), `${nom} : Annuler chevauche ${b.call}`));
          const q = r.btns.find(b => b.call === "choosePlayer('')");
          assert(C.t - q.r.bottom >= 40, `${nom} : écart au « ? » ${C.t - q.r.bottom} px`);
          assert(r.btns.every(b => { const x = coin(b.r); return x.l >= F.l - 1 && x.r <= F.r + 1 && x.t >= F.t - 1 && x.b <= F.b + 1; }), `${nom} : un bouton sort du terrain`);
          assert(r.btns.some(b => b.call === "choosePlayer('__equipe__')") === (genre === 'faute'), `${nom} : FAUTE D'ÉQUIPE seulement pour la faute`);
          await app.clickSheet('cancelPendingEvent()'); await app.settle();
          const apres = await instant(app);
          eq([apres.pend, apres.n, apres.sc, apres.h], [false, avant.n, avant.sc, avant.h], `${nom} : rien ne reste`);
          assert(await aucuneFeuille(app), `${nom} : couche fermée`);
        }
        assert(app.errors.length === 0, app.errors.join(' | '));
      } finally { await app.close(); }
    });
  }

  await check(`${P}·2c radiale : le voile à l'étage joueurs ne fait toujours rien ; « ? » et FAUTE D'ÉQUIPE enregistrent comme avant`, async () => {
    const app = await ouvrir(gabarit, 'radiale');
    try {
      await versJoueurs(app, 'lancer', 'radiale');
      const f = await app.ev(() => { const r = document.getElementById('field').getBoundingClientRect(); return { l: r.left, t: r.top }; });
      await app.page.mouse.click(f.l + 4, f.t + 4);   // voile (coin du terrain)
      await app.page.waitForTimeout(200); await app.settle();
      assert(await app.ev(() => pending !== null && radialIsOpen() && radialStage === 'players'), 'saisie et étage joueurs intacts');
      await app.clickSheet("choosePlayer('')"); await app.settle();
      let e = await app.ev(() => { const x = S.history[S.history.length - 1]; return { t: x.type, d: x.details }; });
      eq([e.t, e.d.attacker_player_id], ['lancer', undefined], '« ? »');
      await versJoueurs(app, 'faute', 'radiale'); await app.clickSheet("choosePlayer('__equipe__')"); await app.settle();
      e = await app.ev(() => { const x = S.history[S.history.length - 1]; return { t: x.type, d: x.details }; });
      eq([e.t, e.d.fault_scope, e.d.attacker_player_id], ['faute_directe', 'equipe', undefined], 'FAUTE D\'ÉQUIPE');
    } finally { await app.close(); }
  });

  await check(`${P}·2d radiale : fermeture courte après Annuler à l'étage joueurs (un glisser à 150 ms est accepté)`, async () => {
    const app = await ouvrir(gabarit, 'radiale', { launch: { anim: true } });
    try {
      await versJoueurs(app, 'lancer', 'radiale');
      await app.clickSheet('cancelPendingEvent()');
      await app.page.waitForTimeout(150);
      assert(await app.ev(() => !radialBusy()), 'couche fermée après 150 ms');
    } finally { await app.close(); }
  }, { calme: true });

  /* ---------- F28 : appui parasite sur ⌂ / TERMINER ---------- */
  const BOUTONS = { home: '[onclick="goHome()"]:visible', fin: '[onclick="finishBarTap()"]:visible' };
  async function centre(app, cle) {
    const b = await app.page.locator(BOUTONS[cle]).first().boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  async function tap(app, p) { if (phone) await app.page.touchscreen.tap(p.x, p.y); else await app.page.mouse.click(p.x, p.y); }
  /* Annuler (vrai bouton), puis aussitôt un appui sur ⌂ ou TERMINER. Retourne ce qui s'est passé ; `dansFenetre` dit si
     l'appui est bien tombé dans la fenêtre de ré-armement (lu dans le navigateur, avant le gestionnaire du bouton). */
  async function annulerPuisTaper(app, saisie, cle, genre) {
    await versJoueurs(app, genre, saisie);
    const p = await centre(app, cle);
    await app.ev(() => { window.__dansFenetre = null; document.addEventListener('click', () => { window.__dansFenetre = Date.now() < undoBlockedUntil; }, { capture: true, once: true }); });
    await app.clickSheet('cancelPendingEvent()');
    /* ⌂ et TERMINER sont déjà refusés tant que la couche radiale se ferme (radialBusy) : l'appui visé est celui qui arrive juste après sa fermeture. */
    await app.page.waitForFunction(() => !radialBusy() && !document.getElementById('sheet').classList.contains('closing'), null, { timeout: 4000, polling: 'raf' });
    const cibleTouchee = await app.page.evaluate(([x, y, sel]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest(sel)); }, [p.x, p.y, BOUTONS[cle].replace(':visible', '')]);
    await tap(app, p);
    return { dansFenetre: await app.ev(() => window.__dansFenetre), cibleTouchee, feuille: await app.ev(() => document.getElementById('sheet').classList.contains('open')), ecran: await app.ev(() => currentScreen()) };
  }
  for (const saisie of ['feuille', 'radiale']) for (const [cle, nom] of [['home', '⌂ Accueil'], ['fin', 'TERMINER']]) for (const genre of ['lancer', 'faute']) {
    await check(`${P}·3 ${saisie}, ${genre} : un appui sur ${nom} juste après « Annuler » (fenêtre de ré-armement) n'ouvre aucune feuille et ne navigue pas ; après la fenêtre, il fonctionne`, async () => {
      const app = await ouvrir(gabarit, saisie);
      try {
        await app.lancer({ target: await cible(app), caught: true, player: 'Gris_p1' });   // match non vide : ⌂ demanderait confirmation
        let r = null;
        for (let essai = 0; essai < 4; essai++) {
          r = await annulerPuisTaper(app, saisie, cle, genre);
          if (r.dansFenetre === true && r.cibleTouchee) break;
          await app.settle(); await app.page.waitForTimeout(450);   // appui tombé hors fenêtre (machine lente) ou sur la couche qui se ferme : on recommence
          if (await app.ev(() => document.getElementById('sheet').classList.contains('open'))) { await app.ev(() => closeSheet()); await app.settle(); }
        }
        assert(r.dansFenetre === true && r.cibleTouchee, 'l\'appui n\'est jamais tombé dans la fenêtre sur le bouton visé ' + JSON.stringify(r));
        await app.page.waitForTimeout(60);
        eq([r.feuille, r.ecran, await rien(app)], [false, 'match', false], `appui parasite sur ${nom} : feuille ouverte ou navigation`);
        // après la fenêtre : fonctionne
        await app.page.waitForFunction(() => Date.now() >= undoBlockedUntil + 20, null, { timeout: 4000, polling: 10 });
        await app.settle();
        const p = await centre(app, cle);
        await tap(app, p); await app.page.waitForTimeout(100);
        if (cle === 'home') assert(await app.ev(() => /QUITTER LE MATCH EN COURS/.test(document.querySelector('#sheet .sheet-title').textContent)), 'après la fenêtre, ⌂ ouvre la confirmation');
        else assert(await app.ev(() => document.getElementById('sheet').classList.contains('open') && /TERMINER/.test(document.querySelector('#sheet .sheet-title').textContent)), 'après la fenêtre, TERMINER ouvre sa feuille');
        assert(app.errors.length === 0, app.errors.join(' | '));
      } finally { await app.close(); }
    });
  }

  await check(`${P}·4 ↶ garde son comportement : ignoré dans la fenêtre qui suit Annuler, actif après`, async () => {
    for (const saisie of ['feuille', 'radiale']) {
      const app = await ouvrir(gabarit, saisie);
      try {
        await app.lancer({ target: await cible(app), caught: true, player: 'Gris_p1' });
        const n = await app.ev(() => S.history.length);
        await versJoueurs(app, 'lancer', saisie);
        await app.clickSheet('cancelPendingEvent()');
        await app.ev(() => undoTap());
        eq(await app.ev(() => S.history.length), n, saisie + ' : ↶ ignoré dans la fenêtre');
        await app.settle();
        await app.undo();
        eq(await app.ev(() => S.history.length), n - 1, saisie + ' : ↶ actif après la fenêtre');
      } finally { await app.close(); }
    }
  });

  await check(`${P}·5 R15 intact : ⌂ sur un match vide, sans appui récent, retourne à l'accueil sans confirmation`, async () => {
    const app = await ouvrir(gabarit, 'feuille');
    try {
      await app.page.waitForTimeout(600); await app.settle();
      await app.page.locator(BOUTONS.home).first().click();
      await app.page.waitForTimeout(150);
      eq([await app.ev(() => currentScreen()), await rien(app)], ['home', false], 'accueil sans feuille');
    } finally { await app.close(); }
  });
}
