/* C24 : feuilles de possession rouvertes à la reprise, jeton glissé non coupé, fin de période reprise.
   A  (F29) un retour sur l'écran de match pendant « QUI COMMENCE AU BALLON ? » / « DUEL — QUI REPREND LE BALLON ? »
      rouvre la feuille : par navHome()+navTo('match'), par le retour depuis les stats (navBack), par une page neuve
      qui charge l'état (équivalent d'un rechargement) ; aucune feuille rouverte en archive, match terminé,
      saisie en cours ou fenêtre de fin de période ; le démarrage d'un match ne change ni S ni le nombre de save() ;
   B  (F35) .sub-pitch n'a plus overflow:hidden, géométrie de la feuille au repos identique à la référence ;
   C  (F26) un état enregistré dans la fenêtre de fin de période (pointage au seuil, aucun minuteur) est mené à terme
      UNE SEULE fois à la reprise, pour les deux formes d'état enregistré (faute : période pas encore comptée ;
      lancer échappé : déjà comptée) ; historique vide : on ne touche à rien.
   Contrôle négatif : KINBALL_HTML=<kinball.C24.avant.html copié à la racine du dépôt> KINBALL_ONLY=C24 node tests/run.mjs
   Captures dans SORTIE/captures/C24/. */
import fs from 'node:fs';
import path from 'node:path';
import { launch, assert, eq, diff, SORTIE, exigerAvant, KNOWN_AVANT } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];
const AVANT_NOM = 'kinball.C24.avant.html';   /* dossier : KINBALL_AVANT ; absent = KNOWN */
const CAPT = path.join(SORTIE, 'captures', 'C24');

/* ---------- aides ---------- */
const sheetState = app => app.ev(() => {
  const sh = document.getElementById('sheet');
  return {
    open: sh.classList.contains('open'),
    calls: [...sh.querySelectorAll('[onclick]')].map(b => b.getAttribute('onclick')),
    title: (sh.querySelector('.sheet-title') || {}).textContent || '',
  };
});
const waitSheet = (app, call) => app.page.waitForFunction(c => {
  const sh = document.getElementById('sheet');
  return sh.classList.contains('open') && !!sh.querySelector(`[onclick="${c}"]`);
}, call, { timeout: 4000, polling: 10 });
/* Sortir de l'écran de match puis y revenir, comme l'accueil puis « Reprendre » (S reste en mémoire). */
const homeAndBack = app => app.ev(() => { navHome(); navTo('match'); });
/* Page neuve qui charge l'état `s` : équivalent d'un rechargement suivi de « Reprendre ». */
async function freshWith(gabarit, s, opts = {}) {
  const app = await launch(gabarit, opts);
  await app.ev(snap => { S = JSON.parse(snap); navStack = ['home']; navTo('match'); }, JSON.stringify(s));
  return app;
}
/* Un match à 9/11 amené par de vrais gestes jusqu'à l'élimination de Noir : la feuille du duel est ouverte. */
async function toDuelStart(app) {
  await app.startMatch({ format: '9_11' });
  await app.initialPossession('Gris');
  await app.ev(() => { S.scores = { Bleu: 8, Gris: 3, Noir: 1 }; renderScoreboard(); });
  await app.faute({ code: 'APPEL' });         // Gris fautif : Bleu 9, Noir 2 → Noir éliminé
  await waitSheet(app, 'undo()');
  assert(await app.awaitingDuel(), 'la feuille du duel devait être attendue');
}
const NORM = s => { const c = JSON.parse(JSON.stringify(s)); delete c.id; delete c.createdAt; delete c.matchName; delete c.authorId; (c.history || []).forEach(e => { delete e.at; }); return c; };   /* authorId : identité locale propre à chaque navigateur */

export default async function ({ gabarit, check }) {
  fs.mkdirSync(CAPT, { recursive: true });
  const P = `[${gabarit}] C24`;

  /* ----- Volet A ----- */
  await check(`${P}·1 QUI COMMENCE AU BALLON ? : feuille rouverte après accueil puis retour, le choix fonctionne`, async () => {
    const app = await launch(gabarit);
    try {
      await app.startMatch({ format: '9_11' });
      await waitSheet(app, "chooseInitialPossession('Bleu')");
      await homeAndBack(app);
      await waitSheet(app, "chooseInitialPossession('Bleu')");
      const st = await sheetState(app);
      assert(/COMMENCE/i.test(st.title), 'titre : ' + st.title);
      eq(await app.ev(() => S.sheetDismissable), false, 'feuille non fermable');
      await app.shot(path.join(CAPT, `${gabarit}-possession-rouverte.png`));
      await app.initialPossession('Bleu');
      const s = await app.state();
      eq(s.possession, 'Bleu', 'possession'); eq(s.awaitingInitial, false, 'awaitingInitial');
      assert(app.errors.length === 0, app.errors.join(' | '));
    } finally { await app.close(); }
  });

  await check(`${P}·2 DUEL — QUI REPREND LE BALLON ? : feuille rouverte (avec ↶), le choix fonctionne`, async () => {
    const app = await launch(gabarit);
    try {
      await toDuelStart(app);
      await homeAndBack(app);
      await waitSheet(app, 'undo()');
      const st = await sheetState(app);
      assert(st.calls.some(c => c.startsWith('chooseDuelStart(')), 'boutons d\'équipe : ' + st.calls);
      assert(!st.calls.includes("chooseDuelStart('Noir')"), 'l\'équipe éliminée ne reprend pas');
      await app.shot(path.join(CAPT, `${gabarit}-duel-rouvert.png`));
      await app.duelStart('Bleu');
      const s = await app.state();
      eq(s.possession, 'Bleu', 'possession'); eq(s.awaitingDuelStart, false, 'awaitingDuelStart');
      assert(app.errors.length === 0, app.errors.join(' | '));
    } finally { await app.close(); }
  });

  await check(`${P}·3 retour depuis les stats (navBack) : les deux feuilles reviennent`, async () => {
    const app = await launch(gabarit);
    try {
      await app.startMatch({ format: '9_11' });
      await waitSheet(app, "chooseInitialPossession('Bleu')");
      await app.ev(() => { openStats(); });
      await app.ev(() => navBack());
      await waitSheet(app, "chooseInitialPossession('Bleu')");
      await app.initialPossession('Bleu');
    } finally { await app.close(); }
    const app2 = await launch(gabarit);
    try {
      await toDuelStart(app2);
      await app2.ev(() => { openStats(); });
      await app2.ev(() => navBack());
      await waitSheet(app2, 'undo()');
      await app2.duelStart('Gris');
      assert(app2.errors.length === 0, app2.errors.join(' | '));
    } finally { await app2.close(); }
  });

  await check(`${P}·4 page neuve qui charge l'état (équivalent d'un rechargement) : les deux feuilles reviennent`, async () => {
    const a = await launch(gabarit);
    let s1, s2;
    try {
      await a.startMatch({ format: '9_11' });
      s1 = await a.ev(() => JSON.parse(JSON.stringify(S)));
    } finally { await a.close(); }
    const b = await freshWith(gabarit, s1);
    try {
      await waitSheet(b, "chooseInitialPossession('Gris')");
      await b.initialPossession('Gris');
      eq((await b.state()).possession, 'Gris', 'possession');
      assert(b.errors.length === 0, b.errors.join(' | '));
    } finally { await b.close(); }
    const c = await launch(gabarit);
    try {
      await toDuelStart(c);
      s2 = await c.ev(() => JSON.parse(JSON.stringify(S)));
    } finally { await c.close(); }
    const d = await freshWith(gabarit, s2);
    try {
      await waitSheet(d, 'undo()');
      await d.duelStart('Gris');
      assert(d.errors.length === 0, d.errors.join(' | '));
    } finally { await d.close(); }
  });

  await check(`${P}·5 aucune feuille rouverte : archive, match terminé, saisie en cours, fenêtre de fin de période, rien d'attendu`, async () => {
    const app = await launch(gabarit);
    try {
      await app.startMatch({ format: '9_11' });
      await waitSheet(app, "chooseInitialPossession('Bleu')");
      const cas = [
        ['archive consultée', () => { viewingArchive = true; }, () => { viewingArchive = false; }],
        ['match terminé', () => { S.status = 'completed'; }, () => { S.status = 'in_progress'; }],
        ['saisie en cours', () => { pending = { type: 'faute_directe', details: {}, before: snapshotBefore() }; }, () => { pending = null; }],
        ['fin de période en cours', () => { periodEndTimer = 1; }, () => { periodEndTimer = null; }],
      ];
      for (const [nom, poser, lever] of cas) {
        await app.ev(() => { navHome(); });
        await app.page.waitForFunction(() => document.getElementById('sheet').getAnimations().length === 0 && !document.getElementById('sheet').classList.contains('closing'));
        await app.ev(poser);
        await app.ev(() => { navTo('match'); });
        await app.page.waitForTimeout(80);
        eq((await sheetState(app)).open, false, `feuille ouverte malgré : ${nom}`);
        await app.ev(lever);
      }
      /* les refus levés, une nouvelle entrée rouvre la feuille ; une fois la possession choisie, plus rien n'est attendu */
      await homeAndBack(app);
      await waitSheet(app, "chooseInitialPossession('Bleu')");
      await app.initialPossession('Bleu');
      await homeAndBack(app);
      await app.page.waitForTimeout(80);
      eq((await sheetState(app)).open, false, 'feuille ouverte alors que rien n\'est attendu');
      assert(app.errors.length === 0, app.errors.join(' | '));
    } finally { await app.close(); }
  });

  await check(`${P}·6 démarrage d'un match : S et nombre de save() identiques à la référence`, async () => {
    const ref = exigerAvant(AVANT_NOM);
    const run = async opts => {
      const app = await launch(gabarit, opts);
      try {
        await app.ev(() => { window.__n = 0; const o = window.save; window.save = function (...a) { window.__n++; return o.apply(this, a); }; });
        await app.startMatch({ format: '9_11', name: 'c24' });
        await waitSheet(app, "chooseInitialPossession('Bleu')");
        const n = await app.ev(() => window.__n);
        return { n, s: NORM(await app.state()), calls: (await sheetState(app)).calls };
      } finally { await app.close(); }
    };
    const a = await run({ html: ref }), b = await run({});
    eq(b.n, a.n, 'nombre de save()');
    const d = diff(a.s, b.s); assert(!d, 'S diffère : ' + d);
    eq(JSON.stringify(b.calls), JSON.stringify(a.calls), 'contenu de la feuille');
  }, KNOWN_AVANT);

  /* ----- Volet B ----- */
  await check(`${P}·7 .sub-pitch visible (jeton glissé non coupé), géométrie de la feuille au repos identique à la référence`, async () => {
    const ref = exigerAvant(AVANT_NOM);
    const mesure = async opts => {
      const app = await launch(gabarit, opts);
      try {
        await app.startMatch({ format: '9_11', withRosters: true });
        await app.initialPossession('Bleu');
        await app.ev(() => openLineupSheet('Bleu'));
        await app.page.waitForSelector('#sheet .sub-pitch');
        await app.settle();
        const m = await app.ev(() => {
          const r = e => { const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(v => Math.round(v * 10) / 10); };
          const sh = document.getElementById('sheet');
          return {
            overflow: getComputedStyle(sh.querySelector('.sub-pitch')).overflow,
            pitch: r(sh.querySelector('.sub-pitch')),
            toks: [...sh.querySelectorAll('.sub-tok')].map(r),
            sheet: r(sh),
          };
        });
        /* capture en plein glisser : un jeton du terrain tiré vers le banc */
        const t = await app.page.locator('#sheet .sub-tok[data-zone="on"]').first().boundingBox();
        const bench = await app.page.locator('#sheet .sub-tok[data-zone="off"]').first().boundingBox();
        const mo = app.page.mouse;
        await mo.move(t.x + t.width / 2, t.y + t.height / 2); await mo.down();
        await mo.move(bench.x + bench.width / 2, bench.y + bench.height / 2, { steps: 6 });
        m.dragOutside = await app.ev(() => {
          const tk = document.querySelector('#sheet .sub-tok.sub-drag'), p = document.querySelector('#sheet .sub-pitch');
          if (!tk) return null;
          const a = tk.getBoundingClientRect(), b = p.getBoundingClientRect();
          return a.bottom > b.bottom || a.top < b.top || a.left < b.left || a.right > b.right;
        });
        if (!opts.html) await app.shot(path.join(CAPT, `${gabarit}-jeton-en-vol.png`));
        await mo.up();
        return m;
      } finally { await app.close(); }
    };
    const a = await mesure({ html: ref }), b = await mesure({});
    eq(b.overflow, 'visible', 'overflow de .sub-pitch');
    assert(a.overflow !== 'visible', 'la référence aurait dû être coupée (overflow ' + a.overflow + ')');
    assert(b.dragOutside === true, 'le jeton glissé devait sortir du cadre du terrain pendant le glisser');
    eq(JSON.stringify(b.pitch), JSON.stringify(a.pitch), 'cadre du petit terrain');
    eq(JSON.stringify(b.toks), JSON.stringify(a.toks), 'jetons au repos');
    eq(JSON.stringify(b.sheet), JSON.stringify(a.sheet), 'feuille');
  }, KNOWN_AVANT);

  /* ----- Volet C ----- */
  /* Joue de vrais gestes jusqu'à une fin de période et rapporte (1) l'état écrit par le premier save() de l'action
     (celui de commitEvent : c'est lui qui peut survivre à un rechargement dans la fenêtre de 1,4 s), (2) l'état final. */
  async function jusquaFin(chemin) {
    const app = await launch(gabarit);
    try {
      const cfg = chemin === 'elim'
        ? { format: '9_11', poss: 'Bleu', elim: 'Noir', scores: { Bleu: 10, Gris: 4, Noir: 2 } }
        : { format: 'duel11', poss: chemin === 'faute' ? 'Gris' : 'Bleu', elim: null, scores: { Bleu: 10, Gris: 4, Noir: 0 } };
      await app.startMatch({ format: cfg.format });
      await app.initialPossession('Bleu');
      await app.ev(([sc, po, el]) => {
        S.scores = sc; S.possession = po;
        if (el) { S.eliminated = el; S.duelActive = true; S.awaitingDuelStart = false; }
        renderScoreboard();
        window.__saves = []; const o = window.save; window.save = function (...a) { window.__saves.push(JSON.parse(JSON.stringify(S))); return o.apply(this, a); };
      }, [cfg.scores, cfg.poss, cfg.elim]);
      if (chemin === 'faute') await app.faute({ code: 'APPEL' });
      else await app.lancer({ target: 'Gris', caught: false });
      await app.settle();
      const saves = await app.ev(() => window.__saves);
      return { snap: saves[0], final: await app.state() };
    } finally { await app.close(); }
  }
  const CLES = ['period', 'periodWins', 'scores', 'possession', 'eliminated', 'duelActive', 'awaitingDuelStart', 'stopped'];
  const cles = s => JSON.stringify(CLES.map(k => s[k]));
  for (const [i, chemin] of [[8, 'faute'], [9, 'echappe'], [10, 'elim']]) {
    await check(`${P}·${i} fin de période reprise (état enregistré par ${chemin === 'faute' ? 'une faute' : chemin === 'echappe' ? 'un ballon échappé' : 'un ballon échappé en duel après élimination'}) : menée à terme une seule fois`, async () => {
      const { snap, final } = await jusquaFin(chemin);
      assert(snap, 'aucun save() capté');
      eq(snap.scores.Bleu, snap.format.periodAt, 'l\'état enregistré devrait être au seuil');
      eq(final.period, 2, 'période finale (jeu normal)');
      const app = await freshWith(gabarit, snap);
      try {
        await app.page.waitForFunction(() => typeof periodEndTimer !== 'undefined' && periodEndTimer === null && S.period === 2, null, { timeout: 8000, polling: 20 });
        await app.settle();
        const s = await app.state();
        eq(s.periodWins.Bleu, 1, 'Bleu : une seule période gagnée');
        eq(s.period, 2, 'période');
        eq(cles(s), cles(final), 'état repris = état du jeu normal');
        assert(app.errors.length === 0, app.errors.join(' | '));
        /* l'état repris, rechargé une seconde fois, ne recompte rien */
        await homeAndBack(app); await app.page.waitForTimeout(80); await app.settle();
        eq(cles(await app.state()), cles(final), 'second retour : rien de plus');
      } finally { await app.close(); }
    });
  }

  await check(`${P}·11 historique vide au seuil : état indécidable, on ne touche à rien`, async () => {
    const a = await launch(gabarit);
    let s;
    try {
      await a.startMatch({ format: 'duel11' }); await a.initialPossession('Bleu');
      await a.ev(() => { S.scores = { Bleu: 11, Gris: 4, Noir: 0 }; });
      s = await a.ev(() => JSON.parse(JSON.stringify(S)));
    } finally { await a.close(); }
    const app = await freshWith(gabarit, s);
    try {
      await app.page.waitForTimeout(150); await app.settle();
      const t = await app.state();
      eq(t.periodWins.Bleu, 0, 'aucune période comptée'); eq(t.period, 1, 'période inchangée'); eq(t.scores.Bleu, 11, 'pointage inchangé');
      eq((await sheetState(app)).open, false, 'aucune feuille');
    } finally { await app.close(); }
  });
}
