/* C13B : pourcentage de victoire en direct (moteur embarqué, Web Worker, deux barres par équipe).
   Couvre les critères 1 à 13 du brief. Mesures de durée écrites dans audit/C13B-mesures-<gabarit>.json. */
import fs from 'node:fs';
import { launch, assert, eq, rng, diff, HTML, SORTIE, SIMCORE, exigerAvant, KNOWN_AVANT } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];
const AVANT_NOM = 'kinball.C13B.avant.html';   /* dossier : KINBALL_AVANT (défaut : dossier temporaire du système) ; absent = KNOWN */
const wait = app => app.page.waitForFunction(() => !WP.inFlight && !WP.dirty, null, { timeout: 15000, polling: 20 });
const wp = app => app.ev(() => ({
  mode: WP.mode, stats: { ...WP.stats }, inFlight: WP.inFlight, dirty: WP.dirty, err: WP.lastError, hasResult: !!WP.result,
  bars: [...document.querySelectorAll('#scoreboard .wp')].map(e => ({ t: e.dataset.team, m: e.dataset.match, p: e.dataset.period, o: e.style.opacity,
    nm: e.querySelectorAll('.wp-m').length, np: e.querySelectorAll('.wp-p').length })),
}));
/* Journal de toutes les demandes (charge utile copiée) : installé avant la première demande. */
const logger = app => app.ev(() => {
  window.__log = [];
  const o = window.wpLaunch;
  window.wpLaunch = function () { o(); window.__log.push(JSON.parse(JSON.stringify(WP.cur))); };
});
const log = app => app.ev(() => window.__log);

/* Un geste de la mini-grammaire : F faute directe de la possession ; E[>Équipe] lancer échappé ;
   A[>Équipe] lancer attrapé ; R reprise de jeu ; U annuler ; D:Équipe choix de reprise du duel ;
   S changement de joueur (alignements injectés par startMatch withRosters). */
async function jouer(app, seq) {
  for (const tok of seq.split(/\s+/).filter(Boolean)) {
    const info = await app.ev(() => ({ po: S.possession, el: S.eliminated, teams: ATEAMS() }));
    const [op, arg] = tok.split(/[>:]/);
    const other = () => arg || info.teams.find(t => t !== info.po && t !== info.el);
    if (op === 'F') await app.faute({});
    else if (op === 'E') await app.lancer({ target: other(), caught: false });
    else if (op === 'A') await app.lancer({ target: other(), caught: true });
    else if (op === 'R') await app.reprise({ team: info.po });
    else if (op === 'U') await app.undo();
    else if (op === 'D') await app.duelStart(arg);
    else if (op === 'S') {
      await app.ev(() => { openLineupSheet('Bleu'); pickSubOut('Bleu_p1'); pickSubIn('Bleu_p5'); closeLineupSheet(); });
      await app.settle();
    } else throw new Error('geste inconnu ' + tok);
    await wait(app);
  }
}
const sentOf = async app => (await wp(app)).stats.sent;

const FAKE_SLOW = () => {
  window.__fw = { posts: [], inst: null };
  window.Worker = class { constructor() { window.__fw.inst = this; } postMessage(p) { window.__fw.posts.push(p); } terminate() {} };
  window.__fwReply = i => { const p = window.__fw.posts[i]; const acc = wpCompute(KBSim, p, 0, p.slices, null); window.__fw.inst.onmessage({ data: wpPack(acc, p, 'worker') }); };
};

export default async function ({ gabarit, check: check0 }) {
  const P = `[${gabarit}] C13B`;
  const phone = gabarit === 'telephone';
  const mesures = { gabarit };
  const apps = [];
  /* Un navigateur par vérification : on ferme tout sauf le premier à la fin de chacune. */
  const chk = async (n, f, o) => { if (process.env.C13B_ONLY && !new RegExp(process.env.C13B_ONLY).test(n)) return; try { await check0(n, f, o); } finally { while (apps.length > 1) { try { await apps.pop().close(); } catch {} } } };
  const open = async (opts) => { const a = await launch(gabarit, opts); apps.push(a); await a.ev(() => { if (typeof WP !== 'undefined' && 'minK' in WP) WP.minK = 1; }); return a; };   // C23 : seuil abaissé à 1 (ces tests ont été écrits pour un premier calcul au 3e événement)
  const nouveau = async (app, format, o = {}) => {
    await app.startMatch({ format, ...o });
    await app.initialPossession('Bleu');
  };
  try {
    const app = await open();
    await app.ev(() => { WP.seedFixed = 4242; });
    await logger(app);

    /* ---- 1. moteur identique au fichier du moteur ---- */
    await chk(`${P} · 1 · KBSimFactory.toString() identique à sim/simcore.js (octet pour octet)`, async () => {
      const lines = fs.readFileSync(SIMCORE, 'utf8').split('\n');
      const attendu = lines.slice(6, 292).join('\n');
      const lu = await app.ev(() => KBSimFactory.toString());
      assert(lu === attendu, 'texte différent (' + lu.length + ' / ' + attendu.length + ' caractères)');
      assert(fs.readFileSync(HTML, 'utf8').includes(attendu), 'le fichier ne contient pas le texte du moteur');
    });

    /* ---- 2 et 3. formats, parts égales, première tranche ---- */
    await chk(`${P} · 2/3 · 9_11 : un .wp par équipe, deux barres, parts égales et opacité 0,4 avant tout calcul`, async () => {
      await nouveau(app, '9_11');
      const s = await wp(app);
      eq(s.bars.length, 3, 'nombre de .wp');
      s.bars.forEach(b => { eq([b.nm, b.np], [1, 1], 'deux barres'); eq([b.m, b.p, b.o], ['33.3', '33.3', '0.4'], 'parts égales ' + b.t); });
      eq(s.stats.sent, 0, 'aucune demande');
    });
    await chk(`${P} · 3 · 1 et 2 événements marquants : toujours parts égales, 0 demande ; le 3e : 1 demande puis barres = résultat`, async () => {
      await jouer(app, 'F');
      await jouer(app, 'E');
      let s = await wp(app);
      eq(s.stats.sent, 0, 'sent après 2 marquants'); s.bars.forEach(b => eq([b.m, b.p, b.o], ['33.3', '33.3', '0.4'], 'parts égales'));
      await jouer(app, 'F');
      s = await wp(app);
      eq(s.stats.sent, 1, 'sent après le 3e'); eq(s.mode, 'worker', 'mode'); eq(s.stats.applied, 1, 'appliqué');
      const att = await app.ev(() => ATEAMS().map(t => [t, (100 * WP.result.match[t] / (WP.result.n - WP.result.unfinished)).toFixed(1), (100 * WP.result.period[t] / (WP.result.n - WP.result.unfinished)).toFixed(1)]));
      eq(s.bars.map(b => [b.t, b.m, b.p]), att, 'barres = résultat');
      assert(s.bars.some(b => Number(b.o) > 0.4), 'opacité > 0,4 après calcul (au moins une équipe a des données)');
      eq(await app.ev(() => WP.result.n), 1000, 'n');
      eq(await app.ev(() => WP.result.via), 'worker', 'via');
    });

    /* ---- 4. déclencheurs (une même partie 9/11 : élimination, duel, fin de période) ---- */
    await chk(`${P} · 4 · déclencheurs : attrapé / reprise / changement n'envoient rien ; tranche de 3 ; élimination, duel, fin de période`, async () => {
      const a = await open();
      await a.ev(() => { WP.seedFixed = 4242; });
      await logger(a);
      await nouveau(a, '9_11', { withRosters: true });
      /* Bleu lance sur Noir et l'échappe (Bleu et Gris +1), Noir rend le ballon à Bleu en l'attrapant :
         Noir ne marque jamais, c'est lui qui sera éliminé. */
      await jouer(a, 'E>Noir A>Bleu');               // 1 événement marquant
      eq(await sentOf(a), 0, 'avant 3');
      await jouer(a, 'A>Gris R S');                  // ballon attrapé, reprise de jeu, changement de joueur
      eq(await sentOf(a), 0, 'attrapé / reprise / changement : aucune demande');
      await a.reprise({ team: 'Bleu' }); await wait(a);   // Bleu reprend le ballon
      eq(await sentOf(a), 0, 'reprise : aucune demande');
      await jouer(a, 'E>Noir A>Bleu E>Noir');        // 2e et 3e marquants
      eq(await sentOf(a), 1, 'tranche de 3');
      let L = await log(a);
      eq(L[0].history.length, 6, 'historique allégé : 3 échappés + 3 attrapés (ni reprise ni changement)');
      assert(L[0].history.every(e => e.type === 'faute_directe' || e.type === 'lancer'), 'jamais d’alignement ni de reprise envoyés');
      for (let i = 0; i < 5; i++) await jouer(a, 'A>Bleu E>Noir');   // 4e … 8e marquants (tranche à 6)
      eq(await sentOf(a), 2, 'tranches de 3 : K = 3 puis 6');
      await jouer(a, 'A>Bleu');
      await a.lancer({ target: 'Noir', caught: false }); await a.settle();   // 9e : Noir (0) éliminé
      eq(await a.ev(() => [S.awaitingDuelStart, S.eliminated, S.scores.Bleu, S.scores.Gris]), [true, 'Noir', 9, 9], 'élimination de Noir');
      const nAvant = await sentOf(a);
      await a.page.waitForTimeout(200);
      eq(await sentOf(a), nAvant, 'aucun calcul pendant awaitingDuelStart');
      eq(nAvant, 2, 'toujours 2 demandes');
      await jouer(a, 'D:Bleu');
      eq(await sentOf(a), nAvant + 1, 'un calcul au choix de reprise du duel');
      L = await log(a);
      const dernier = L[L.length - 1];
      eq([dernier.state.eliminated, dernier.state.duelActive, dernier.state.possession], ['Noir', true, 'Bleu'], 'état du calcul de duel');
      /* barre de période de l'éliminé = 0 ; barre de match = celle du résultat */
      let s = await wp(a);
      const bn = s.bars.find(b => b.t === 'Noir');
      eq(bn.p, '0.0', 'Noir éliminé : barre de période');
      eq(bn.m, await a.ev(() => (100 * WP.result.match.Noir / (WP.result.n - WP.result.unfinished)).toFixed(1)), 'Noir éliminé : barre de match = résultat de la simulation');
      mesures.eliminated_match_bar = bn.m;
      /* en duel : chaque événement marquant */
      const n1 = await sentOf(a);
      await jouer(a, 'F');                           // Gris fait une faute : Noir passe à 10
      eq(await sentOf(a), n1 + 1, 'duel : un événement marquant = une demande');
      await jouer(a, 'A');                           // attrapé en duel : rien
      eq(await sentOf(a), n1 + 2, 'duel : attrapé = une demande (C23 : le porteur change)');
      /* Noir (10) a le ballon après l'attrapé : ses deux fautes donnent Gris 10 puis 11 → fin de période */
      await jouer(a, 'F');
      eq(await a.ev(() => S.period), 1, 'encore la période 1 à 10');
      await jouer(a, 'F');
      eq(await a.ev(() => S.period), 2, 'période 2 atteinte');
      L = await log(a);
      /* aucune demande n'a jamais été faite sur un état de transition (pointage >= 11) */
      assert(L.every(p => Math.max(...Object.values(p.state.scores)) < 11), 'une demande est partie pendant la transition de fin de période');
      const fin = L[L.length - 1];
      eq(Object.values(fin.state.scores), [0, 0, 0], 'fin de période : pointages remis à zéro');
      eq(JSON.parse(fin.sig)[2], 2, 'fin de période : période 2 dans l’état envoyé');
      eq(fin.state.eliminated, null, 'fin de période : plus d’éliminé');
      s = await wp(a);
      assert(Number(s.bars.find(b => b.t === 'Noir').p) > 0, 'Noir : barre de période revenue à la normale');
      assert(s.bars.every(b => Number(b.p) > 0), 'toutes les barres de période > 0 à la période suivante');
      assert(a.errors.length === 0, a.errors.join(' | '));
    });

    await chk(`${P} · 4 · Annuler : une demande immédiate à chaque annulation ; retour au début = parts égales sans calcul`, async () => {
      const a = await open();
      await a.ev(() => { WP.seedFixed = 4242; });
      await logger(a);
      await nouveau(a, '9_11');
      await jouer(a, 'F F F');
      eq(await sentOf(a), 1, 'avant annulation');
      await jouer(a, 'U');
      eq(await sentOf(a), 2, 'annulation 1');
      let L = await log(a);
      eq(L[1].history.length, 2, 'le calcul porte sur l’état annulé (2 événements)');
      await jouer(a, 'U');
      eq(await sentOf(a), 3, 'annulation 2');
      await jouer(a, 'U');
      eq(await sentOf(a), 3, 'retour au début : aucun calcul');
      const s = await wp(a);
      s.bars.forEach(b => eq([b.m, b.p, b.o], ['33.3', '33.3', '0.4'], 'parts égales après retour au début'));
      eq(await a.ev(() => WP.result), null, 'résultat vidé');
      assert(a.errors.length === 0, a.errors.join(' | '));
    });

    await chk(`${P} · 4 · fin de période décidée à la main sans événement marquant : un calcul part`, async () => {
      const a = await open();
      await logger(a);
      await nouveau(a, '9_11');
      await a.ev(() => endPeriodManually('Gris'));
      await a.settle(); await wait(a);
      eq(await sentOf(a), 1, 'une demande');
      const L = await log(a);
      eq([L[0].state.periodWins.Gris, JSON.parse(L[0].sig)[2], L[0].history.length], [1, 2, 0], 'une période d’avance pour Gris, période 2, historique vide');
      assert(await a.ev(() => WP.result && WP.result.n === 1000), 'résultat appliqué');
      assert(a.errors.length === 0, a.errors.join(' | '));
    });

    /* ---- 2. formats sans seuil et formats duel ---- */
    for (const f of ['libre3', 'duelL']) {
      await chk(`${P} · 2 · ${f} : aucun .wp, aucune demande`, async () => {
        const a = await open();
        await nouveau(a, f);
        await jouer(a, 'F F F F');
        const s = await wp(a);
        eq(s.bars.length, 0, 'aucun .wp'); eq(s.stats.sent, 0, 'sent'); eq(s.mode, null, 'aucun Worker créé');
        assert(a.errors.length === 0, a.errors.join(' | '));
      });
    }
    for (const f of ['11_13', 'duel11', 'duel13']) {
      await chk(`${P} · 2/3/4 · ${f} : un .wp par équipe en jeu, deux barres ; ${f.startsWith('duel') ? 'calcul à chaque événement marquant dès le début' : 'tranche de 3'}`, async () => {
        const a = await open();
        await logger(a);
        await nouveau(a, f);
        const n = f === '11_13' ? 3 : 2;
        let s = await wp(a);
        eq(s.bars.length, n, 'nombre de .wp'); s.bars.forEach(b => eq([b.nm, b.np], [1, 1], 'deux barres'));
        const egal = (100 / n).toFixed(1);
        s.bars.forEach(b => eq([b.m, b.p, b.o], [egal, egal, '0.4'], 'parts égales'));
        if (f === '11_13') { await jouer(a, 'F F'); eq(await sentOf(a), 0, '2 marquants'); await jouer(a, 'F'); eq(await sentOf(a), 1, '3 marquants'); }
        else {
          await jouer(a, 'F');
          eq(await sentOf(a), 1, 'duel : 1er marquant = 1 demande');
          await jouer(a, 'A');
          eq(await sentOf(a), 2, 'attrapé : une demande (C23 : le porteur change)');
          await jouer(a, 'F');
          eq(await sentOf(a), 3, 'duel : 2e marquant = 3 demandes');
        }
        s = await wp(a);
        assert(s.stats.applied >= 1 && s.bars.some(b => Number(b.o) > 0.4), 'barres mises à jour');
        const tot = s.bars.reduce((x, b) => x + Number(b.m), 0);
        assert(Math.abs(tot - 100) < 0.5 || (await a.ev(() => WP.result.unfinished)) > 0, 'la somme des chances de match vaut ~100 % (' + tot + ')');
        assert(a.errors.length === 0, a.errors.join(' | '));
      });
    }

    /* ---- 5. déterminisme ---- */
    await chk(`${P} · 5 · déterminisme : graine fixée, rejeu identique, action/Annuler/même action, somme des 10 tranches`, async () => {
      const seq = 'F E F E F F';
      const a = await open(); await a.ev(() => { WP.seedFixed = 777; }); await logger(a);
      await nouveau(a, '9_11'); await jouer(a, seq);
      const r1 = await a.ev(() => JSON.parse(JSON.stringify(WP.result)));
      const b = await open(); await b.ev(() => { WP.seedFixed = 777; });
      await nouveau(b, '9_11'); await jouer(b, seq);
      const r2 = await b.ev(() => JSON.parse(JSON.stringify(WP.result)));
      eq([r2.match, r2.period, r2.unfinished], [r1.match, r1.period, r1.unfinished], 'même enchaînement, même graine');
      /* somme des 10 tranches recalculée dans la page avec les mêmes entrées */
      const L = await log(a), dernier = L[L.length - 1];
      const somme = await a.ev(p => { const acc = wpCompute(KBSim, p, 0, p.slices, null); return { match: acc.match, period: acc.period, unfinished: acc.unfinished, n: acc.n }; }, dernier);
      eq([somme.match, somme.period, somme.unfinished, somme.n], [r1.match, r1.period, r1.unfinished, r1.n], 'résultat affiché = somme des tranches');
      /* tranche à tranche à la main avec KBSim.run */
      const manuel = await a.ev(p => {
        const prm = KBSim.params(p.history, p.teams); const m = {}, pe = {}; p.teams.forEach(t => { m[t] = 0; pe[t] = 0; });
        for (let i = 0; i < 10; i++) { const r = KBSim.run({ state: p.state, fmt: p.fmt, teams: p.teams, params: prm, n: 100, seed: p.seed + i }); p.teams.forEach(t => { m[t] += r.match[t]; pe[t] += r.period[t]; }); }
        return { m, pe };
      }, dernier);
      eq([manuel.m, manuel.pe], [r1.match, r1.period], 'somme manuelle de 10 appels de KBSim.run');
      /* action, Annuler, même action : barres identiques */
      const b6 = (await wp(a)).bars;
      await jouer(a, 'U');
      const bU = (await wp(a)).bars;
      await jouer(a, 'F');
      const b6b = (await wp(a)).bars;
      eq(b6b, b6, 'action / Annuler / même action : mêmes barres');
      assert(JSON.stringify(bU) !== JSON.stringify(b6), 'après Annuler, les barres portent sur l’état annulé');
      assert(a.errors.length === 0 && b.errors.length === 0, a.errors.concat(b.errors).join(' | '));
    });

    /* ---- 6. Worker et repli : mêmes victoires, trois pannes ---- */
    const seq6 = 'F E F E F F';
    let refWorker = null;
    await chk(`${P} · 6 · Worker : résultat de référence (mode worker)`, async () => {
      const a = await open(); await a.ev(() => { WP.seedFixed = 555; });
      await nouveau(a, '9_11'); await jouer(a, seq6);
      const s = await wp(a); eq(s.mode, 'worker', 'mode'); eq(s.stats.fallbacks, 0, 'aucun repli');
      refWorker = await a.ev(() => ({ match: WP.result.match, period: WP.result.period, unfinished: WP.result.unfinished }));
    });
    const pannes = {
      'Worker absent (undefined)': () => { window.Worker = undefined; },
      'constructeur Worker qui lève une exception': () => { window.Worker = function () { throw new Error('boom'); }; },
      'Worker qui émet error': () => { window.Worker = class { constructor() { setTimeout(() => this.onerror && this.onerror({ preventDefault() {} }), 0); } postMessage() {} terminate() {} }; },
      'Worker muet (délai de garde)': () => { window.Worker = class { postMessage() {} terminate() {} }; },
    };
    for (const [nom, fn] of Object.entries(pannes)) {
      await chk(`${P} · 6 · repli synchrone : ${nom} : mode sync, barres mises à jour, mêmes victoires, aucune erreur console`, async () => {
        const a = await open(); await a.ev(() => { WP.seedFixed = 555; });
        await a.ev(fn);
        await nouveau(a, '9_11'); await jouer(a, seq6);
        const s = await wp(a);
        eq(s.mode, 'sync', 'mode'); eq(s.stats.fallbacks, 1, 'un repli'); eq(s.stats.sent, 2, 'sent (K=3 et K=6)'); eq(s.stats.applied, 2, 'demandes jamais perdues');
        eq(await a.ev(() => WP.result.via), 'sync', 'via');
        const r = await a.ev(() => ({ match: WP.result.match, period: WP.result.period, unfinished: WP.result.unfinished }));
        eq(r, refWorker, 'mêmes victoires que le Worker');
        assert(s.bars.some(b => Number(b.o) > 0.4), 'barres mises à jour');
        assert(a.errors.length === 0, a.errors.join(' | '));
      });
    }

    /* ---- 7. recalcul obsolète ---- */
    await chk(`${P} · 7 · calcul obsolète : réponse jetée, une seule relance, jamais un résultat d'un autre état ; 10 annulations enchaînées`, async () => {
      const a = await open(); await a.ev(() => { WP.seedFixed = 9; });
      await a.ev(FAKE_SLOW); await logger(a);
      await nouveau(a, '9_11');
      /* F E F : le 3e marquant lance un calcul (le faux Worker ne répond pas) ; 8 lancers attrapés
         (ni point ni demande) donnent 11 événements pour 10 annulations enchaînées. */
      const tgt = async () => (await a.ev(() => ATEAMS().find(t => t !== S.possession)));
      await a.faute({});
      await a.lancer({ target: await tgt(), caught: false });
      await a.faute({});
      let s = await wp(a);
      eq([s.stats.sent, s.inFlight, await a.ev(() => window.__fw.posts.length)], [1, true, 1], 'un calcul en vol');
      /* 8 lancers attrapés (ni point ni demande), injectés directement dans l'historique pour tenir sous
         le délai de garde du Worker (2,5 s) ; les annulations passent par undo() lui-même. */
      await a.ev(() => { for (let i = 0; i < 8; i++) { const before = snapshotBefore(); S.history.push({ type: 'lancer', details: { attacker: S.possession, target: ATEAMS().find(t => t !== S.possession), result: 'attrapé' }, before }); } });
      eq(await a.ev(() => S.history.length), 11, 'historique');
      for (let i = 0; i < 10; i++) {
        await a.ev(() => undo());
        const q = await wp(a);
        assert(q.stats.sent === 1 && (await a.ev(() => window.__fw.posts.length)) === 1 && q.inFlight && q.mode === 'worker', 'au plus un calcul en vol, une relance en attente (annulation ' + i + ') ' + JSON.stringify(q.stats));
      }
      /* la réponse du calcul périmé arrive : jetée, une relance */
      await a.ev(() => window.__fwReply(0));
      s = await wp(a);
      eq([s.stats.dropped, s.stats.applied, s.stats.sent, s.inFlight, s.hasResult], [1, 0, 2, true, false], 'réponse jetée, une relance, rien d’appliqué');
      eq(await a.ev(() => window.__fw.posts.length), 2, 'deux demandes au total');
      /* une réponse arrive pour la relance : appliquée, calculée sur l'état courant */
      await a.ev(() => window.__fwReply(1));
      s = await wp(a);
      eq([s.stats.applied, s.inFlight], [1, false], 'relance appliquée');
      eq(await a.ev(() => WP.result.sig === wpSig()), true, 'le résultat affiché porte sur l’état courant');
      assert(a.errors.length === 0, a.errors.join(' | '));
    });

    /* ---- 8. équipe éliminée : couvert en 4 ; ici le retour à la normale est vérifié sur 11_13 ---- */

    /* ---- 9. rejeu des règles (150 actions par format, vrais gestes) ---- */
    for (const f of ['9_11', '11_13', 'duel11']) {
      await chk(`${P} · 9 · rejeu des règles : 150 actions aléatoires en ${f}, KBSim.apply = app à chaque pas`, async () => {
        const a = await open();
        await nouveau(a, f);
        const r = rng(f.length * 1000 + 13);
        const ecarts = [];
        for (let i = 0; i < 150 && ecarts.length < 3; i++) {
          const before = await a.ev(() => ({ scores: { ...S.scores }, periodWins: { ...S.periodWins }, eliminated: S.eliminated, duelActive: S.duelActive, possession: S.possession, teams: ATEAMS(), per: S.period }));
          const faute = r() < 0.2;
          const cibles = before.teams.filter(t => t !== before.possession && t !== before.eliminated);
          const target = cibles[Math.floor(r() * cibles.length)];
          const caught = r() < 0.4;
          const action = faute ? { type: 'faute', team: before.possession } : { type: 'lancer', attacker: before.possession, target, caught };
          if (faute) await a.faute({}); else await a.lancer({ target, caught });
          let restart;
          if (await a.awaitingDuel()) {
            const elim = await a.ev(() => S.eliminated);
            const ok = before.teams.filter(t => t !== elim);
            restart = ok[Math.floor(r() * ok.length)];
            await a.duelStart(restart);
          }
          await a.settle();
          const res = await a.ev(([b, act, restart]) => {
            const fm = getFormat(S);
            const st = { scores: b.scores, periodWins: b.periodWins, eliminated: b.eliminated, duelActive: b.duelActive, possession: b.possession };
            const n = KBSim.apply(st, { teams: fm.teams, eliminationAt: fm.eliminationAt, periodAt: fm.periodAt }, b.teams, Object.assign({}, act, restart ? { restart } : {}));
            const pick = o => ({ scores: b.teams.map(t => o.scores[t]), periodWins: b.teams.map(t => o.periodWins[t]), eliminated: o.eliminated, duelActive: !!o.duelActive, possession: o.possession });
            return { attendu: n ? pick(n) : null, app: pick(S) };
          }, [before, action, restart]);
          if (JSON.stringify(res.attendu) !== JSON.stringify(res.app))
            ecarts.push(`pas ${i} (${JSON.stringify(action)}${restart ? ' reprise ' + restart : ''}) avant=${JSON.stringify({ s: before.scores, pw: before.periodWins, el: before.eliminated, d: before.duelActive, po: before.possession })} moteur=${JSON.stringify(res.attendu)} app=${JSON.stringify(res.app)}`);
        }
        if (ecarts.length) throw new Error('écart moteur / app : ' + ecarts.join(' || '));
        const s = await wp(a);
        assert(a.errors.length === 0 && s.err === null, a.errors.join(' | ') + ' ' + s.err);
      });
    }

    /* ---- 10. appui sur une barre / sur le bloc ---- */
    await chk(`${P} · 10 · appui sur une barre : feuille de détail (non calibrée) ; ailleurs : changements ; rien pendant une saisie`, async () => {
      const a = await open(); await a.ev(() => { WP.seedFixed = 5; });
      await nouveau(a, '9_11', { withRosters: true });
      await jouer(a, 'F F F');
      const tape = async sel => { const l = a.page.locator(sel).first(); if (phone) await l.tap({ timeout: 4000 }); else await l.click({ timeout: 4000 }); };
      await tape('.team-chip:nth-child(2) .wp');
      assert(await a.sheetOpen(), 'feuille ouverte');
      const txt = await a.ev(() => document.getElementById('sheet').textContent);
      assert(/victoires sur 1000/.test(txt) && /non calibrée/.test(txt) && /4 périodes/.test(txt) && /action n° 3/.test(txt), 'contenu du détail : ' + txt.slice(0, 120));
      eq(await a.ev(() => lineupSheetTeam), null, 'la feuille des changements ne s’ouvre pas');
      await a.ev(() => closeSheet()); await a.settle();
      await tape('.team-chip:nth-child(2) .tname');
      eq(await a.ev(() => lineupSheetTeam), 'Gris', 'appui ailleurs : feuille des changements');
      await a.ev(() => closeLineupSheet()); await a.settle();
      /* saisie en cours (pending) : aucun des deux */
      await a.ev(() => { beginEvent('faute_directe', {}); });
      await a.ev(() => { document.querySelector('.wp').click(); document.querySelector('.team-chip .tname').click(); });
      eq(await a.ev(() => [document.getElementById('sheet').classList.contains('open'), lineupSheetTeam]), [false, null], 'rien pendant pending');
      await a.ev(() => { pending = null; });
      /* attente de possession initiale */
      const b = await open();
      await b.startMatch({ format: '9_11', withRosters: true });
      await b.ev(() => { const sh = document.getElementById('sheet'); const t = sh.innerHTML; document.querySelector('.wp').click(); document.querySelector('.team-chip .tname').click(); });
      eq(await b.ev(() => lineupSheetTeam), null, 'rien pendant awaitingInitial');
      assert(!(await b.ev(() => /CHANCES DE VICTOIRE/.test(document.getElementById('sheet').textContent))), 'pas de détail pendant awaitingInitial');
      assert(a.errors.length === 0 && b.errors.length === 0, a.errors.concat(b.errors).join(' | '));
    });

    /* ---- 11. fin de match, archive, reprise ---- */
    await chk(`${P} · 11 · fin de match : plus de .wp ; archive : aucun .wp ; match repris : barres recalculées sans action de plus`, async () => {
      const a = await open(); await a.ev(() => { WP.seedFixed = 5; });
      await nouveau(a, '9_11'); await jouer(a, 'F F F F');
      const rec = await a.ev(() => JSON.parse(JSON.stringify(S)));
      /* reprise : nouvelle page, enregistrement injecté pour la seule durée du test (la base du banc est vide) */
      const b = await open(); await b.ev(() => { WP.seedFixed = 5; });
      /* R4 : le premier instantané de la base (asynchrone, après launch()) remplace MATCHES_DB ; s'il arrive après
         l'injection, l'enregistrement disparaît et resumeMatch() ne reprend rien (« barres après reprise : 0 »).
         On attend donc la base prête (backupChecked, comme M11) avant d'injecter, et on vérifie que la reprise a eu lieu. */
      await b.page.waitForFunction(() => backupChecked && !(window.KBSite && KBSite.baseIncomplete && KBSite.baseIncomplete()), null, { timeout: 8000, polling: 20 });
      await b.ev(r => { MATCHES_DB.push(r); }, rec);
      await b.ev(() => { navHome(); resumeMatch(); });
      eq(await b.ev(() => [S.id, currentScreen()]), [rec.id, 'match'], 'match repris (S et écran)');
      await wait(b);
      let s = await wp(b);
      eq(s.bars.length, 3, 'barres après reprise'); eq(s.stats.sent, 1, 'un calcul sur le match repris'); eq(s.stats.applied, 1, 'appliqué');
      eq(await b.ev(() => S.history.length), 4, 'aucune action de plus');
      /* archive : on consulte une copie terminée */
      await b.ev(r => { const c = JSON.parse(JSON.stringify(r)); c.id = 'arch_test'; c.status = 'completed'; MATCHES_DB.push(c); viewArchivedMatchStats('arch_test'); }, rec);
      await b.ev(() => renderScoreboard());
      eq(await b.ev(() => [viewingArchive, document.querySelectorAll('#scoreboard .wp').length]), [true, 0], 'archive : aucun .wp');
      await b.ev(() => exitArchiveView());
      /* fin de match */
      await b.ev(() => { navHome(); resumeMatch(); });
      await wait(b);
      eq(await b.ev(() => document.querySelectorAll('#scoreboard .wp').length), 3, 'retour de l’archive : barres de nouveau');
      await b.ev(() => finishMatchNow());
      eq(await b.ev(() => document.querySelectorAll('#scoreboard .wp').length), 0, 'match terminé : aucun .wp');
      assert(a.errors.length === 0 && b.errors.length === 0, a.errors.concat(b.errors).join(' | '));
    });

    /* ---- 12. données : identiques à la version d'avant ---- */
    await chk(`${P} · 12 · données : S, S.history, buildActionRows() identiques à la version d'avant ; nombre d'appels de save() identique`, async () => {
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
          /* les coordonnées normalisées dépendent de la taille du terrain au 1e-9 près : on arrondit à 1e-5 */
          const arr = o => JSON.parse(JSON.stringify(o), (k, v) => typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e5) / 1e5 : v);
          const c = arr(S); delete c.id; delete c.createdAt; delete c.updatedAt; delete c.sheetDismissable;
          delete c.authorId; c.history.forEach(e => { delete e.at; });   /* C28 : heure des événements, propre à chaque partie ; l'identité de l'appareil aussi */
          const NOUV = ['ID du match', 'Date du match', 'Heure de l’action', 'Code de faute'];   /* C28 : colonnes ajoutées en fin de ligne */
          const rr = arr(buildActionRows()); rr.header = rr.header.filter(h => !NOUV.includes(h)); rr.rows.forEach(x => { NOUV.forEach(k => { delete x[k]; }); delete x['Saisi par']; });
          return { S: c, keys: Object.keys(S), rows: rr, saves: window.__saves };
        });
        return out;
      };
      const avant = await jouerComplet(AVANT), apres = await jouerComplet(null);
      eq(apres.keys, avant.keys, 'Object.keys(S)');
      { const d = diff(apres.S, avant.S); assert(!d, 'S (hors id et dates) : ' + d); }
      { const d = diff(apres.rows, avant.rows); assert(!d, 'buildActionRows() : ' + d); }
      eq(apres.saves, avant.saves, 'nombre d’appels de save()');
      assert(avant.S.history.length > 10 && avant.S.period >= 2 && JSON.stringify(avant.rows).length > 2000, 'partie non triviale');
    }, KNOWN_AVANT);

    /* ---- 13. saisie non retardée ---- */
    await chk(`${P} · 13 · saisie non retardée : Worker (aucune tâche longue) et repli (aucune tranche > 50 ms), aussi avec CPU ×4`, async () => {
      /* R4 : une durée réelle compte aussi le temps où le fil a été privé de processeur par un AUTRE processus (autre gabarit,
         autre Chromium) : une seule tranche préemptée suffisait à faire échouer la vérification sous charge (66,7 et 96,9 ms
         observés, contre 9 à 41 ms au calme). La mesure entière (page neuve, donc code froid comme pour l'utilisateur) est
         refaite au plus 2 fois quand elle dépasse 50 ms, et chaque essai doit tenir TOUTES les bornes : un code réellement
         trop lent dépasse à chaque essai, la borne de 50 ms n'est pas relâchée. Les essais refusés figurent dans le message. */
      const mesurer = async (rate, mode) => {
          const a = await open(); await a.ev(() => { WP.seedFixed = 3; });
          if (mode === 'sync') await a.ev(() => { window.Worker = undefined; });
          const cdp = await a.page.context().newCDPSession(a.page);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate });
          await a.ev(() => {
            window.__long = []; window.__slices = []; window.__main = [];
            try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) {}
            /* tout le code du fil principal propre à C13B : wpSync (appelé par le rendu) et wpOnReply (message du Worker) */
            ['wpSync', 'wpOnReply'].forEach(n => { const o = window[n]; window[n] = function (...x) { const t = performance.now(); try { return o.apply(this, x); } finally { window.__main.push(performance.now() - t); } }; });
          });
          if (mode === 'sync') await a.ev(() => { const o = window.wpCompute; window.wpCompute = function (...x) { const t = performance.now(); const r = o.apply(this, x); window.__slices.push(performance.now() - t); return r; }; });
          await nouveau(a, '9_11'); await jouer(a, 'F E F E F F');
          await a.page.waitForTimeout(300); await wait(a);   // R4 : calcul réellement terminé (sous charge, 300 ms ne suffisaient pas toujours)
          const m = await a.ev(() => ({ long: window.__long, maxMain: Math.round(Math.max(0, ...window.__main) * 10) / 10, maxSlice: Math.round(Math.max(0, ...window.__slices) * 10) / 10, nSlices: window.__slices.length, mode: WP.mode, calcMs: WP.result && WP.result.ms }));
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
          return m;
      };
      for (const rate of [1, 4]) {
        for (const mode of ['worker', 'sync']) {
          const refuses = [];
          let m;
          for (let essai = 1; essai <= 3; essai++) {
            m = await mesurer(rate, mode);
            if (m.maxMain < 50 && (mode !== 'sync' || m.maxSlice < 50)) break;
            if (essai < 3) refuses.push({ maxMain: m.maxMain, maxSlice: m.maxSlice });
          }
          if (refuses.length) m.essaisRefuses = refuses;
          mesures[`${mode}_x${rate}`] = m;
          const autres = refuses.length ? ` ; essais précédents : ${JSON.stringify(refuses)}` : '';
          assert(m.mode === mode, 'mode ' + m.mode);
          assert(m.maxMain < 50, `code C13B du fil principal : ${m.maxMain} ms (${mode}, CPU ×${rate}) ; tâches longues de la page : ${m.long}${autres}`);
          if (mode === 'sync') { assert(m.nSlices >= 20, 'tranches mesurées ' + m.nSlices); assert(m.maxSlice < 50, `tranche de ${m.maxSlice.toFixed(1)} ms (CPU ×${rate})${autres}`); }
          else eq(m.nSlices, 0, 'aucun calcul sur le fil principal quand le Worker fonctionne');
        }
      }
      console.log(`  mesures C13B [${gabarit}] : ` + JSON.stringify(mesures));
    }, { calme: true });   // R5 : mesure de durée réelle, jouée dans la phase finale « au calme » (un seul processus)

    /* ---- mise en page ---- */
    await chk(`${P} · mise en page : ruban +${phone ? 20 : 16} px au plus, zone d'appui ≥ 22 px, aucun recouvrement, terrain carré et entier`, async () => {
      const a = await open();
      await nouveau(a, '9_11');
      const m = await a.ev(() => {
        const sb = document.getElementById('scoreboard'), r0 = sb.getBoundingClientRect().height;
        const chip = sb.querySelector('.team-chip'), cr = chip.getBoundingClientRect();
        const w = chip.querySelector('.wp').getBoundingClientRect(), bar = chip.querySelector('.wp-m').getBoundingClientRect();
        const content = [...chip.querySelectorAll('.tscore,.twins,.tname')].map(e => e.getBoundingClientRect().bottom);
        const f = document.getElementById('field').getBoundingClientRect();
        const bars = [...sb.querySelectorAll('.wp')]; const saved = bars.map(e => [e.parentNode, e]);
        bars.forEach(e => e.remove());
        const r1 = sb.getBoundingClientRect().height;
        saved.forEach(([p, e]) => p.appendChild(e));
        return { r0, r1, wh: w.height, ww: w.width, cw: cr.width, barBottomGap: cr.bottom - bar.bottom, contentMax: Math.max(...content), barTop: bar.top, fw: f.width, fh: f.height, fb: f.bottom, vh: innerHeight };
      });
      assert(m.r0 - m.r1 <= (phone ? 20 : 16) + 0.5, `le ruban grandit de ${m.r0 - m.r1} px`);
      assert(m.wh >= 22 && Math.abs(m.ww - m.cw) < 1, `zone d'appui ${m.ww}×${m.wh}`);
      assert(m.barBottomGap >= 4 && m.contentMax <= m.barTop + 0.5, `recouvrement : écart bas ${m.barBottomGap}, contenu ${m.contentMax} / barres ${m.barTop}`);
      assert(Math.abs(m.fw - m.fh) < 1.5 && m.fb <= m.vh, `terrain ${m.fw}×${m.fh}, bas ${m.fb} / ${m.vh}`);
      mesures.ruban = { croissance: +(m.r0 - m.r1).toFixed(1), zone: [m.ww, m.wh] };
    });

    fs.mkdirSync(SORTIE, { recursive: true });
    { const f = `${SORTIE}/C13B-mesures-${gabarit}.json`;   // R5 : deux phases (parallèle, calme) écrivent ce fichier : on fusionne
      let avant = {}; if (process.env.KINBALL_PHASE === 'calme') { try { avant = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {} }
      fs.writeFileSync(f, JSON.stringify({ ...avant, ...mesures }, null, 1)); }
  } finally {
    for (const a of apps) { try { await a.close(); } catch {} }
  }
}
