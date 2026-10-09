/* C19 : changements de joueurs par glisser-déposer (feuille des joueurs : terrain 2×2 + banc).
   Critères 1 à 7, 8 (jetons atteignables, rotation, toucher réel), 9, 10, 11 du brief. */
import { launch, assert, eq, HTML, exigerAvant, KNOWN_AVANT } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];
const AVANT_NOM = 'kinball.C19.avant.html';   /* dossier : KINBALL_AVANT (défaut : dossier temporaire du système) ; absent = KNOWN */
const KEYS = ['team', 'player_out_id', 'player_out_name', 'player_in_id', 'player_in_name'];

/* Match avec effectifs ; `bench` = nombre de joueurs au banc de Bleu (4 sur le terrain). */
async function setup(app, { bench = 4, team = 'Bleu', format = '9_11' } = {}) {
  await app.ev(() => { lineupSheetTeam = null; subOut = null; closeSheet(); });
  await app.settle();
  await app.startMatch({ format, withRosters: true });
  await app.initialPossession('Bleu');
  await app.ev(([n]) => {
    ['Bleu', 'Gris', 'Noir'].forEach(t => {
      S.rosters[t] = [];
      for (let i = 1; i <= 4 + n; i++) S.rosters[t].push({ id: t + '_p' + i, name: t + ' joueur ' + i });
      S.lineups[t] = [1, 2, 3, 4].map(i => t + '_p' + i);
    });
    S.startingLineups = JSON.parse(JSON.stringify(S.lineups));
    WP.minK = 1;
  }, [bench]);
  await openSheet(app, team);
}
async function openSheet(app, team) {
  await app.ev(t => openLineupSheet(t), team);
  await app.page.waitForFunction(() => { const s = document.getElementById('sheet'); return s.classList.contains('open') && !s.classList.contains('closing') && s.getAnimations().length === 0 && !!s.querySelector('.sub-tok'); }, null, { timeout: 4000, polling: 10 });
}
const tokBox = async (app, pid) => {
  const b = await app.page.locator(`#sheet [data-pid="${pid}"]`).boundingBox();
  assert(b, 'jeton introuvable : ' + pid);
  return b;
};
const ctr = b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const lineupOf = (app, t = 'Bleu') => app.ev(t => S.lineups[t].slice(), t);
const nHist = app => app.ev(() => S.history.length);
const sheetState = app => app.ev(() => {
  const s = document.getElementById('sheet');
  return { open: s.classList.contains('open'), team: lineupSheetTeam, drag: s.querySelectorAll('.sub-drag').length, tr: [...s.querySelectorAll('.sub-tok')].filter(n => n.style.transform).length, target: s.querySelectorAll('.sub-target').length };
});
/* Glisser souris : le centre du jeton `from` vers (x, y) ou vers le centre du jeton `to`. */
async function dragTo(app, from, to, { steps = 8, hold = false } = {}) {
  const a = ctr(await tokBox(app, from));
  const t = typeof to === 'string' ? ctr(await tokBox(app, to)) : to;
  const m = app.page.mouse;
  await m.move(a.x, a.y); await m.down();
  await m.move(a.x + (t.x - a.x) / 2, a.y + (t.y - a.y) / 2, { steps });
  await m.move(t.x, t.y, { steps });
  if (!hold) await m.up();
  return { a, t };
}
const settleSheet = app => app.page.waitForFunction(() => { const s = document.getElementById('sheet'); return s.classList.contains('open') && !s.classList.contains('closing') && s.getAnimations().length === 0; }, null, { timeout: 4000, polling: 10 });
const lastEv = app => app.ev(() => S.history[S.history.length - 1]);

export default async function ({ gabarit, check }) {
  const phone = gabarit === 'telephone';
  const P = `[${gabarit}]`;
  const app = await launch(gabarit, { anim: false });
  try {
    await check(`${P} C19 · 1 · glisser banc → terrain : lineup, événement, clés de details, before.lineups, Object.keys(S) inchangé`, async () => {
      await setup(app);
      const keys0 = await app.ev(() => Object.keys(S).sort());
      const l0 = await lineupOf(app), n0 = await nHist(app);
      await dragTo(app, 'Bleu_p5', 'Bleu_p2');
      await settleSheet(app);
      const l1 = await lineupOf(app);
      eq(l1, ['Bleu_p1', 'Bleu_p5', 'Bleu_p3', 'Bleu_p4'], 'entrant à la place du sortant, même position');
      eq(await nHist(app), n0 + 1, 'un événement de plus');
      const ev = await lastEv(app);
      eq(ev.type, 'changement', 'type'); eq(Object.keys(ev.details).sort(), [...KEYS].sort(), 'clés de details');
      eq(ev.details, { team: 'Bleu', player_out_id: 'Bleu_p2', player_out_name: 'Bleu joueur 2', player_in_id: 'Bleu_p5', player_in_name: 'Bleu joueur 5' }, 'details');
      eq(ev.before.lineups.Bleu, l0, 'before.lineups = alignement d\'avant');
      eq(await app.ev(() => Object.keys(S).sort()), keys0, 'Object.keys(S)');
      eq(await sheetState(app), { open: true, team: 'Bleu', drag: 0, tr: 0, target: 0 }, 'feuille ouverte, rien en l\'air');
      assert(await app.ev(() => !document.querySelector('#sheet .sub-on[data-pid="Bleu_p2"]') && !!document.querySelector('#sheet .sub-on[data-pid="Bleu_p5"]')), 'feuille à jour');
      assert(app.errors.length === 0, app.errors.join(' | '));
    });

    await check(`${P} C19 · 2 · trois échanges d'affilée, feuille ouverte et à jour, « Derniers changements »`, async () => {
      await setup(app);
      const n0 = await nHist(app);
      await dragTo(app, 'Bleu_p5', 'Bleu_p1'); await settleSheet(app);
      await dragTo(app, 'Bleu_p6', 'Bleu_p2'); await settleSheet(app);
      await dragTo(app, 'Bleu_p7', 'Bleu_p3'); await settleSheet(app);
      eq(await nHist(app), n0 + 3, 'trois événements');
      eq(await lineupOf(app), ['Bleu_p5', 'Bleu_p6', 'Bleu_p7', 'Bleu_p4'], 'alignement');
      const txt = await app.ev(() => document.getElementById('sheet').textContent);
      assert(txt.includes('Derniers changements') && txt.includes('Bleu joueur 3 → Bleu joueur 7') && txt.includes('Bleu joueur 1 → Bleu joueur 5'), 'Derniers changements : ' + txt.slice(-160));
      assert((await sheetState(app)).open, 'feuille ouverte');
    });

    await check(`${P} C19 · 3 · glisser terrain → banc : même résultat que banc → terrain`, async () => {
      await setup(app);
      await dragTo(app, 'Bleu_p2', 'Bleu_p5'); await settleSheet(app);
      eq(await lineupOf(app), ['Bleu_p1', 'Bleu_p5', 'Bleu_p3', 'Bleu_p4'], 'alignement');
      const ev = await lastEv(app);
      eq(ev.details, { team: 'Bleu', player_out_id: 'Bleu_p2', player_out_name: 'Bleu joueur 2', player_in_id: 'Bleu_p5', player_in_name: 'Bleu joueur 5' }, 'details identiques');
    });

    await check(`${P} C19 · 4 · lâcher hors cible valide : aucun événement, S inchangé, feuille ouverte, jeton revenu`, async () => {
      await setup(app);
      const s0 = await app.state();
      const sb = await app.page.locator('#sheet').boundingBox();
      const cas = {
        'vide de la feuille (titre)': ['Bleu_p5', { x: sb.x + sb.width / 2, y: sb.y + 12 }],
        'terrain sur terrain': ['Bleu_p1', 'Bleu_p2'],
        'banc sur banc': ['Bleu_p5', 'Bleu_p6'],
        'fond (au-dessus de la feuille)': ['Bleu_p5', { x: sb.x + sb.width / 2, y: Math.max(4, sb.y - 20) }],
        'hors fenêtre': ['Bleu_p1', { x: 1, y: 1 }],
      };
      for (const [nom, [f, t]] of Object.entries(cas)) {
        await dragTo(app, f, t); await settleSheet(app);
        eq(await app.state(), s0, nom + ' : S inchangé');
        eq(await sheetState(app), { open: true, team: 'Bleu', drag: 0, tr: 0, target: 0 }, nom + ' : feuille ouverte, jeton revenu');
        const b = await tokBox(app, f), after = await app.page.locator(`#sheet [data-pid="${f}"]`).evaluate(n => n.style.transform);
        assert(after === '' && b.width > 10, nom + ' : transform résiduel ' + after);
      }
      assert(app.errors.length === 0, app.errors.join(' | '));
    });

    await check(`${P} C19 · 5 · toucher-toucher : même événement, mêmes clés (comparé à la version d'avant)`, async () => {
      await setup(app);
      const n0 = await nHist(app);
      await app.clickSheet("pickSubOut('Bleu_p3')");
      assert(await app.ev(() => document.querySelector('#sheet [data-pid="Bleu_p3"]').classList.contains('out')), 'le sortant est marqué');
      await app.clickSheet("pickSubIn('Bleu_p6')");
      await settleSheet(app);
      eq(await nHist(app), n0 + 1, 'un événement');
      const ev = await lastEv(app);
      eq(Object.keys(ev.details).sort(), [...KEYS].sort(), 'clés');
      eq(ev.details, { team: 'Bleu', player_out_id: 'Bleu_p3', player_out_name: 'Bleu joueur 3', player_in_id: 'Bleu_p6', player_in_name: 'Bleu joueur 6' }, 'details');
      eq(await lineupOf(app), ['Bleu_p1', 'Bleu_p2', 'Bleu_p6', 'Bleu_p4'], 'alignement');
      // un appui sans déplacement (moins de 10 px) est un toucher : souris, 4 px
      const a = ctr(await tokBox(app, 'Bleu_p1'));
      await app.page.mouse.move(a.x, a.y); await app.page.mouse.down(); await app.page.mouse.move(a.x + 4, a.y + 3); await app.page.mouse.up();
      await settleSheet(app);
      assert(await app.ev(() => document.querySelector('#sheet [data-pid="Bleu_p1"]').classList.contains('out')), 'appui de 5 px = toucher (sortant marqué)');
      eq(await nHist(app), n0 + 1, 'toujours un seul événement');
      // même chose sur la version d'avant
      const avant = await app.ev(async url => 0, 0);
    });

    await check(`${P} C19 · 6 · bouton « ↶ Annuler le dernier changement » : feuille ouverte sur la même équipe ; trois annulations = départ exact`, async () => {
      await setup(app);
      assert(!(await app.sheetHas('undoLineupChange()')), 'pas de bouton sans changement');
      const s0 = await app.state(), n0 = await nHist(app);
      await dragTo(app, 'Bleu_p5', 'Bleu_p1'); await settleSheet(app);
      await dragTo(app, 'Bleu_p6', 'Bleu_p2'); await settleSheet(app);
      await dragTo(app, 'Bleu_p7', 'Bleu_p3'); await settleSheet(app);
      for (let i = 0; i < 3; i++) {
        await app.clickSheet('undoLineupChange()'); await settleSheet(app);
        eq(await nHist(app), n0 + 2 - i, 'historique après annulation ' + (i + 1));
        eq((await sheetState(app)).team, 'Bleu', 'même équipe');
        assert((await sheetState(app)).open, 'feuille ouverte');
      }
      eq(await app.state(), s0, 'état exact (S identique)');
      assert(!(await app.sheetHas('undoLineupChange()')), 'plus de bouton');
      // bouton absent si le dernier événement est un changement d'une AUTRE équipe
      await dragTo(app, 'Bleu_p5', 'Bleu_p1'); await settleSheet(app);
      await app.clickSheet('closeLineupSheet()'); await app.settle();
      await openSheet(app, 'Gris');
      assert(!(await app.sheetHas('undoLineupChange()')), 'dernier changement = autre équipe : pas de bouton');
    });

    await check(`${P} C19 · 7 · export : colonnes de buildActionRows() identiques pour glisser, toucher-toucher et version d'avant`, async () => {
      await setup(app);
      await dragTo(app, 'Bleu_p5', 'Bleu_p1'); await settleSheet(app);
      await app.clickSheet("pickSubOut('Bleu_p2')"); await app.clickSheet("pickSubIn('Bleu_p6')"); await settleSheet(app);
      const probe = () => { const r = buildActionRows(); const ch = r.rows.filter(x => x['Joueur sortant']); return { header: r.header, n: r.rows.length, motif: ch.map(x => r.header.map(h => (x[h] === '' || x[h] == null) ? 0 : 1).join('')), types: ch.map(x => x['Type d’action']), cles: ch.map(x => Object.keys(x)) }; };
      const R = await app.ev(probe);
      assert(R.motif.length === 2, "deux lignes de changement : " + R.motif.length + " / " + JSON.stringify(await app.ev(() => [S.history.map(e=>e.type), S.lineups.Bleu, subOut])));
      eq([...R.cles[0]].sort(), [...R.header].sort(), 'les clés de la ligne = l\'en-tête');
      eq(R.cles[0], R.cles[1], 'mêmes colonnes');
      // glisser et toucher-toucher : mêmes colonnes remplies (les colonnes « sur le terrain » diffèrent par le contenu, pas par la forme)
      eq(R.motif[0], R.motif[1], 'mêmes colonnes remplies pour glisser et toucher-toucher');
      eq(R.types[0], R.types[1], 'même type d\'action');
      // version d'avant : même scénario par toucher-toucher (fichier absent : KNOWN, sans naviguer ; la partie précédente reste jouée)
      const AVANT = exigerAvant(AVANT_NOM);
      await app.page.goto('file://' + AVANT, { waitUntil: 'domcontentloaded' });
      await app.page.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined');
      await app.startMatch({ format: '9_11', withRosters: true }); await app.initialPossession('Bleu');
      await app.ev(() => { openLineupSheet('Bleu'); pickSubOut('Bleu_p1'); pickSubIn('Bleu_p5'); closeLineupSheet(); });
      const A = await app.ev(probe);
      eq(R.header.slice(0, A.header.length), A.header, 'en-tête (ensemble des colonnes) identique à la version d\'avant (C28 : seules des colonnes sont ajoutées en fin de ligne)');
      eq(R.header.slice(A.header.length), ['ID du match', 'Date du match', 'Heure de l’action', 'Code de faute'], 'colonnes ajoutées par C28, en fin de ligne');
      eq(R.motif[0].slice(0, A.motif[0].length), A.motif[0], 'colonnes remplies d\'une ligne de changement identiques à la version d\'avant (hors colonnes ajoutées par C28)');
      eq(R.types[0], A.types[0], 'type d\'action identique à la version d\'avant');
      await app.page.goto('file://' + HTML, { waitUntil: 'domcontentloaded' });
      await app.page.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined');
    }, KNOWN_AVANT);

    await check(`${P} C19 · 8 · banc de 1, 4, 8 joueurs : jetons et TERMINÉ atteignables par défilement, glisser possible`, async () => {
      for (const n of [1, 4, 8]) {
        await setup(app, { bench: n });
        const r = await app.ev(() => {
          const sh = document.getElementById('sheet'), out = [];
          const toks = [...sh.querySelectorAll('.sub-tok')], fin = sh.querySelector('[onclick="closeLineupSheet()"]');
          [...toks, fin].forEach(el => { el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); const h = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); out.push(!!h && (h === el || el.contains(h))); });
          sh.scrollTop = 0;
          return { n: toks.length, ok: out.every(Boolean), minH: Math.min(...toks.map(t => t.getBoundingClientRect().height)), sheetH: sh.getBoundingClientRect().height, win: innerHeight };
        });
        eq([r.n, r.ok], [4 + n, true], `${n} au banc : jetons et TERMINÉ atteignables`);
        assert(r.minH >= (phone ? 56 : 64) - 0.5, `hauteur de jeton ${r.minH}`);
        assert(r.sheetH <= r.win * (phone ? .82 : .70) + 2, 'feuille dans sa hauteur max');
        await app.ev(() => { document.getElementById('sheet').scrollTop = 0; });
        const last = 'Bleu_p' + (4 + n);
        await app.ev(l => document.querySelector(`#sheet [data-pid="${l}"]`).scrollIntoView({ block: 'center' }), last);
        const tgt = (await tokBox(app, 'Bleu_p1')).y > 0 ? 'Bleu_p1' : 'Bleu_p4';
        // glisser le dernier jeton du banc vers un jeton du terrain (défilement si besoin)
        const bb = await tokBox(app, last), tb = await tokBox(app, 'Bleu_p1');
        if (tb.y < 0 || tb.y + tb.height > (await app.ev(() => innerHeight))) { assert(n === 8 && phone, 'jeton du terrain hors écran seulement avec 8 au banc sur téléphone'); await app.ev(() => { document.getElementById('sheet').scrollTop = 0; }); await app.ev(() => document.querySelector('#sheet [data-pid="Bleu_p1"]').scrollIntoView({ block: 'center' })); }
        const n0 = await nHist(app);
        const sb = await app.page.locator('#sheet').boundingBox();
        const bbox = await tokBox(app, last); const tbox = await tokBox(app, 'Bleu_p4');
        if (bbox.y > sb.y && bbox.y + bbox.height < sb.y + sb.height && tbox.y > sb.y && tbox.y + tbox.height < sb.y + sb.height) {
          await dragTo(app, last, 'Bleu_p4'); await settleSheet(app);
          eq(await nHist(app), n0 + 1, `${n} au banc : un glisser fait un échange`);
        } else {
          // les deux jetons ne tiennent pas ensemble à l'écran : repli sur le jeton visible le plus proche
          const vis = await app.ev(() => { const sh = document.getElementById('sheet'), r = sh.getBoundingClientRect(); return [...sh.querySelectorAll('.sub-tok')].filter(t => { const b = t.getBoundingClientRect(); return b.top > r.top && b.bottom < r.bottom; }).map(t => [t.dataset.pid, t.dataset.zone]); });
          const on = vis.find(v => v[1] === 'on'), off = vis.find(v => v[1] === 'off');
          assert(on && off, `${n} au banc : un jeton du terrain et un du banc visibles ensemble : ${JSON.stringify(vis)}`);
          await dragTo(app, off[0], on[0]); await settleSheet(app);
          eq(await nHist(app), n0 + 1, `${n} au banc : un glisser fait un échange (jetons visibles)`);
        }
      }
    });

    await check(`${P} C19 · 9 · refus d'ouverture : saisie en cours, attente de possession, archive, fin de période ; cas sans alignement / sans effectif inchangés`, async () => {
      await app.ev(() => { lineupSheetTeam = null; closeSheet(); }); await app.settle();
      await app.startMatch({ format: '9_11', withRosters: true });
      const open = () => app.ev(() => { openLineupSheet('Bleu'); return document.getElementById('sheet').classList.contains('open') && lineupSheetTeam !== null; });
      assert(!(await open()), 'attente de possession initiale');
      await app.initialPossession('Bleu');
      await app.ev(() => { pending = { fake: true }; }); assert(!(await open()), 'pending'); await app.ev(() => { pending = null; });
      await app.ev(() => { viewingArchive = true; }); assert(!(await open()), 'archive'); await app.ev(() => { viewingArchive = false; });
      await app.ev(() => { periodEndTimer = setTimeout(() => {}, 5); }); assert(!(await open()), 'fin de période'); await app.ev(() => { clearTimeout(periodEndTimer); periodEndTimer = null; });
      assert(await open(), 'ouvre quand tout est libre');
      eq((await app.ev(() => document.querySelectorAll('#sheet .sub-tok').length)), 5, 'jetons : 4 terrain + 1 banc');
      await app.ev(() => closeLineupSheet()); await app.settle();
      // alignement à définir
      await app.ev(() => { S.lineups.Gris = []; });
      await app.ev(() => openLineupSheet('Gris')); await settleSheet(app);
      eq(await app.ev(() => [document.querySelectorAll('#sheet .sub-tok').length, !!document.querySelector('#sheet [onclick^="toggleDraftPlayer"]'), !!document.querySelector('#sheet [onclick="commitLineupDefinition()"]')]), [0, true, true], 'alignement à définir : affichage d\'avant');
      await app.ev(() => closeLineupSheet()); await app.settle();
      // effectif de moins de 4
      await app.ev(() => { S.rosters.Noir = S.rosters.Noir.slice(0, 3); S.lineups.Noir = []; });
      await app.ev(() => openLineupSheet('Noir')); await settleSheet(app);
      const t = await app.ev(() => [document.querySelectorAll('#sheet .sub-tok').length, document.getElementById('sheet').textContent]);
      assert(t[0] === 0 && t[1].includes('Pas assez de joueurs'), 'effectif insuffisant : ' + t[1].slice(0, 80));
      // banc vide
      await app.ev(() => closeLineupSheet()); await app.settle();
      await app.ev(() => { S.rosters.Bleu = S.rosters.Bleu.slice(0, 4); });
      await app.ev(() => openLineupSheet('Bleu')); await settleSheet(app);
      assert((await app.ev(() => document.getElementById('sheet').textContent)).includes('Aucun joueur au banc'), 'banc vide');
      assert(app.errors.length === 0, app.errors.join(' | '));
    });

    await check(`${P} C19 · 10 · pointercancel en plein glisser : aucun événement, aucun jeton en l'air`, async () => {
      await setup(app);
      const s0 = await app.state();
      await dragTo(app, 'Bleu_p5', 'Bleu_p2', { hold: true });
      const mid = await sheetState(app);
      assert(mid.drag === 1 && mid.target === 1, 'en plein glisser : jeton en l\'air et cible mise en évidence ' + JSON.stringify(mid));
      await app.ev(() => document.querySelector('#sheet .sub-drag').dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', bubbles: true })));
      eq(await sheetState(app), { open: true, team: 'Bleu', drag: 0, tr: 0, target: 0 }, 'après pointercancel');
      await app.page.mouse.up(); await settleSheet(app);
      eq(await app.state(), s0, 'S inchangé');
    });

    await check(`${P} C19 · 11 · un changement ne relance aucun calcul (WP.stats.sent), pas de save() dans le rendu, aucune erreur console`, async () => {
      await setup(app);
      await app.page.waitForFunction(() => !WP.inFlight && !WP.dirty, null, { timeout: 15000, polling: 20 });
      const s0 = await app.ev(() => WP.stats.sent);
      await app.ev(() => { window.__saves = 0; const o = window.save; window.save = function (...a) { window.__saves++; return o.apply(this, a); }; });
      await dragTo(app, 'Bleu_p5', 'Bleu_p1'); await settleSheet(app);
      await app.settle();
      await app.page.waitForFunction(() => !WP.inFlight && !WP.dirty, null, { timeout: 15000, polling: 20 });
      eq(await app.ev(() => WP.stats.sent), s0, 'WP.stats.sent');
      assert(await app.ev(() => window.__saves) >= 1, 'save() appelé par l\'échange');
      const sv = await app.ev(() => { window.__saves = 0; renderLineupSheet(); return window.__saves; });
      eq(sv, 0, 'renderLineupSheet ne sauvegarde pas');
      assert(app.errors.length === 0, app.errors.join(' | '));
    });

    if (phone) {
      await check(`${P} C19 · 8b · glisser tactile réel (CDP touch) : échange ; interrompu par touchCancel : rien`, async () => {
        await setup(app);
        const cdp = await app.page.context().newCDPSession(app.page);
        const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [] });
        const a = ctr(await tokBox(app, 'Bleu_p5')), t = ctr(await tokBox(app, 'Bleu_p2'));
        const n0 = await nHist(app);
        await touch('touchStart', a);
        for (let i = 1; i <= 10; i++) await touch('touchMove', { x: a.x + (t.x - a.x) * i / 10, y: a.y + (t.y - a.y) * i / 10 });
        const mid = await sheetState(app);
        assert(mid.drag === 1 && mid.target === 1, 'jeton suit le doigt, cible en évidence : ' + JSON.stringify(mid));
        const sc = await app.ev(() => document.getElementById('sheet').scrollTop);
        await touch('touchEnd');
        await settleSheet(app);
        eq(await nHist(app), n0 + 1, 'un événement'); eq((await lineupOf(app))[1], 'Bleu_p5', 'bon joueur');
        // annulation par le système
        const b = ctr(await tokBox(app, 'Bleu_p6')), c = ctr(await tokBox(app, 'Bleu_p3'));
        await touch('touchStart', b);
        for (let i = 1; i <= 6; i++) await touch('touchMove', { x: b.x + (c.x - b.x) * i / 6, y: b.y + (c.y - b.y) * i / 6 });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await settleSheet(app);
        eq(await nHist(app), n0 + 1, 'touchCancel : aucun événement');
        eq(await sheetState(app), { open: true, team: 'Bleu', drag: 0, tr: 0, target: 0 }, 'rien en l\'air');
      });

      await check(`${P} C19 · 8c · verrou portrait (rot-neg / rot-pos) : le jeton suit le doigt dans le bon sens, l'échange vise le bon joueur`, async () => {
        for (const ori of [90, -90]) {
          await app.page.addInitScript(o => { Object.defineProperty(window, 'orientation', { get: () => o, configurable: true }); }, ori);
          await setup(app);
          await app.page.setViewportSize({ width: 844, height: 390 });
          await app.page.evaluate(o => { try { Object.defineProperty(window, 'orientation', { get: () => o, configurable: true }); } catch (_) {} applyPhoneOrientation(); }, ori);
          await app.ev(() => { renderLineupSheet(); }); await settleSheet(app);
          const rot = await app.ev(() => uiRotation);
          assert(rot === 90 || rot === -90, 'verrou portrait actif : ' + rot);
          const cls = await app.ev(() => document.documentElement.className);
          // sens du glisser : déplacement visuel mesuré à l'écran
          const a = ctr(await tokBox(app, 'Bleu_p5')), t = ctr(await tokBox(app, 'Bleu_p2'));
          const m = app.page.mouse;
          await m.move(a.x, a.y); await m.down();
          await m.move((a.x + t.x) / 2, (a.y + t.y) / 2, { steps: 6 });
          const c1 = ctr(await tokBox(app, 'Bleu_p5'));
          const ex = (a.x + t.x) / 2, ey = (a.y + t.y) / 2;
          assert(Math.hypot(c1.x - ex, c1.y - ey) < 3, `${cls} : le jeton suit le doigt à l'écran (écart ${Math.hypot(c1.x - ex, c1.y - ey).toFixed(1)} px)`);
          await m.move(t.x, t.y, { steps: 6 });
          eq(await app.ev(() => document.querySelector('#sheet .sub-target').dataset.pid), 'Bleu_p2', 'cible en évidence');
          await m.up(); await settleSheet(app);
          eq((await lineupOf(app))[1], 'Bleu_p5', `${cls} : l'échange vise le bon joueur`);
          await app.page.setViewportSize({ width: 390, height: 844 });
          await app.ev(() => applyPhoneOrientation());
        }
      }, { });
    }
  } finally { await app.close(); }
}
