/* Banc d'essai Kin-Ball Stats — bibliothèque commune.
   Les gestes passent par de vrais événements de pointeur sur #field et de
   vrais clics dans #sheet : c'est l'interface qu'on teste. Les sélecteurs
   s'appuient sur les noms de fonctions des onclick (stables), pas sur les
   textes des boutons. */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
/* Racine du dépôt, résolue par rapport à l'emplacement de ce fichier (tests/lib.mjs). */
export const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let playwright;
try { playwright = require('playwright'); }
catch (e) {
  /* Playwright : d'abord NODE_PATH, puis le chemin d'installation global actuel. */
  const essais = [...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean), path.join(os.homedir(), '.npm-global', 'lib', 'node_modules')];
  for (const d of essais) {
    try { playwright = createRequire(path.join(d, '/'))('playwright'); break; } catch {}
  }
  if (!playwright) throw new Error('Playwright introuvable (NODE_PATH ou chemin global)');
}
const { chromium } = playwright;

/* Fichier testé : index.html du dépôt, sauf si KINBALL_HTML est donné. */
export const HTML = process.env.KINBALL_HTML || path.join(DEPOT, 'index.html');
/* Mesures et captures : jamais dans le dépôt (KINBALL_SORTIE, défaut : dossier « kinball-sortie » du dossier temporaire du système). */
export const SORTIE = process.env.KINBALL_SORTIE || path.join(os.tmpdir(), 'kinball-sortie');
/* Sauvegardes « d'avant » des chantiers (KINBALL_AVANT, défaut : dossier « kinball-avant » du dossier temporaire du système). */
export const AVANT_DIR = process.env.KINBALL_AVANT || path.join(os.tmpdir(), 'kinball-avant');
/* Moteur de simulation embarqué, dans le dépôt. */
export const SIMCORE = path.join(DEPOT, 'sim', 'simcore.js');
/* Chemin d'une sauvegarde d'avant, ou null si le fichier est absent. */
export function avantPath(nom) { const f = path.join(AVANT_DIR, nom); return fs.existsSync(f) ? f : null; }
/* Erreur signalant l'absence d'une sauvegarde d'avant ; avec { known, knownErr: AvantAbsent }
   seule cette erreur est affichée KNOWN, tout autre échec reste un FAIL. */
export class AvantAbsent extends Error { constructor(nom) { super('sauvegarde d\'avant absente (' + nom + ')'); } }
export const KNOWN_AVANT = { known: 'sauvegarde d\'avant absente', knownErr: AvantAbsent };
export function exigerAvant(nom) { const f = avantPath(nom); if (!f) throw new AvantAbsent(nom); return f; }
export const GABARITS = {
  tablette:  { viewport: { width: 1180, height: 820 } },
  telephone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
};
export const TEAMS = ['Bleu', 'Gris', 'Noir'];

const SCALE = Number(process.env.KINBALL_TIMESCALE || 20);
const INIT = (scale) => {
  window.__timers = 0;
  const st = window.setTimeout.bind(window), ct = window.clearTimeout.bind(window);
  const live = new Set();
  window.setTimeout = (fn, d, ...a) => {
    if (!(typeof d === 'number' && d >= 400 && d < 1600)) return st(fn, d, ...a);
    const id = st(() => { if (live.delete(id)) window.__timers--; fn(...a); }, d / scale);
    live.add(id); window.__timers++;
    return id;
  };
  window.clearTimeout = id => { if (live.delete(id)) window.__timers--; ct(id); };
};
const IGNORED = /net::ERR_|Failed to load resource/i;

export async function launch(gabarit = 'tablette', opts = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(GABARITS[gabarit]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !IGNORED.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('pageerror', e => { if (!IGNORED.test(String(e))) errors.push('pageerror: ' + (e.stack || e)); });
  /* Les délais de l'app (message éclair 550 ms, fin de période 1 400 ms,
     armement 500 ms) sont raccourcis d'un facteur SCALE (défaut 20) et suivis :
     l'ordre relatif des minuteries est conservé, et settle() attend qu'il n'en
     reste aucune. KINBALL_TIMESCALE=1 donne les vrais délais (plus lent). */
  await page.addInitScript(INIT, opts.timescale || SCALE);   // C23 : opts.timescale = facteur de délais propre à cette page (1 = vrais délais)
  await page.goto(opts.url || ('file://' + (opts.html || HTML)), { waitUntil: 'domcontentloaded' });   // M03 : opts.url (page servie en http) / opts.html (copie de l'app)
  await page.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined');
  /* Sans animation de la feuille par défaut ; on la garde avec KINBALL_ANIM=1
     ou launch(gabarit, { anim: true }) (le scénario C22 en a besoin : c'est
     pendant la descente de 220 ms que les appuis fantômes se produisent). */
  if (!(process.env.KINBALL_ANIM || opts.anim)) await page.addStyleTag({ content: '#sheet{transition:none !important}' });
  return new App(browser, page, errors, gabarit);
}

const sel = {
  sheetBtn: (call) => `#sheet [onclick="${call}"]`,
};

export class App {
  constructor(browser, page, errors, gabarit) {
    this.browser = browser; this.page = page; this.errors = errors; this.gabarit = gabarit;
  }
  async close() { await this.browser.close(); }
  isPhone() { return this.page.evaluate(() => document.documentElement.classList.contains('phone')); }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }

  /* Copie de S sans les champs qui ne sont pas de l'état de jeu :
     updatedAt (horodatage de sauvegarde) et sheetDismissable (drapeau de
     feuille d'interface, non restauré par Annuler). */
  async state() {
    return this.page.evaluate(() => {
      const c = JSON.parse(JSON.stringify(S));
      delete c.updatedAt; delete c.sheetDismissable;
      if (c.pendingPeriodWinner == null) delete c.pendingPeriodWinner;   // clé résiduelle (null) = absente
      return c;
    });
  }
  /* Laisse passer `ms` millisecondes de temps de l'app (raccourci par SCALE). */
  async tick(ms) { await this.page.waitForTimeout(Math.ceil(ms / SCALE) + 15); }
  /* Interface au repos : plus aucune minuterie de l'app en cours (message
     éclair 550 ms, fin de période 1 400 ms…), feuille au repos (fin de sa
     transition de fermeture : sinon elle intercepte encore les appuis), et aucun message éclair
     affiché (une feuille de choix peut rester ouverte, c'est normal). */
  async settle() {
    await this.page.waitForFunction(() => window.__timers === 0
      && document.getElementById('sheet').getAnimations().length === 0
      && !document.getElementById('sheet').classList.contains('closing'), null, { timeout: 8000, polling: 10 });
    const bad = await this.page.evaluate(() => {
      const sh = document.getElementById('sheet');
      return sh.classList.contains('open') && !!sh.querySelector('.msg-center');
    });
    if (bad) throw new Error('un message éclair est resté affiché');
  }
  async sheetOpen() { return this.page.evaluate(() => document.getElementById('sheet').classList.contains('open')); }
  async sheetHas(call) { return (await this.page.locator(sel.sheetBtn(call)).count()) > 0; }
  /* Clic sur un bouton de la feuille, comme le ferait une personne : on
     attend que la feuille soit ouverte, au repos (ni montée ni descente) et
     que l'appui ne soit pas un « double appui » au sens de l'app (même point
     qu'un appui reçu il y a moins de SHEET_DOUBLE_MS). Puis clic SANS force :
     Playwright vérifie que le bouton reçoit bien l'appui. Les variables de
     l'app ajoutées par C22B sont lues avec typeof : le banc tourne aussi sur
     une ancienne copie. */
  async clickSheet(call) {
    const s = sel.sheetBtn(call);
    await this.page.waitForFunction((s) => {
      const sh = document.getElementById('sheet');
      if (!sh.classList.contains('open') || sh.classList.contains('closing') || sh.getAnimations().length) return false;
      const b = sh.querySelector(s); if (!b) return false;
      if (typeof sheetLastTap !== 'undefined' && typeof SHEET_DOUBLE_MS !== 'undefined') {
        const r = b.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
        if (Date.now() - sheetLastTap.t < SHEET_DOUBLE_MS + 20 && Math.hypot(x - sheetLastTap.x, y - sheetLastTap.y) < SHEET_DOUBLE_PX + 4) return false;
      }
      return true;
    }, s, { timeout: 4000, polling: 10 });
    await this.page.locator(s).first().click({ timeout: 4000, noWaitAfter: true });
  }

  /* Nouveau match par l'interface : écran, format, noms, bouton COMMENCER.
     withRosters : injecte 4+1 joueurs par équipe et l'alignement (fixture),
     pour exercer la feuille « qui a lancé ? ». */
  async startMatch({ format = '9_11', names = {}, excluded = 'Noir', withRosters = false, name = 'banc_essai' } = {}) {
    const p = this.page;
    await p.evaluate(() => { navHome(); openNewMatch(); });
    const teams = await p.evaluate(f => FORMATS[f].teams, format);
    await p.evaluate(([n, f, ex]) => { setFormatTeams(n); setFormatPreset(f); if (n === 2) setExcludedTeam(ex); }, [teams, format, excluded]);
    await p.fill('#matchName', name);
    for (const t of TEAMS) {
      if (await p.locator('#teamFree' + t).isVisible()) await p.fill('#teamFree' + t, names[t] || t);
    }
    await p.locator('[onclick="startMatch()"]').click();
    await p.waitForFunction(() => S.id && S.awaitingInitial);
    if (withRosters) {
      await p.evaluate(() => {
        TEAMS.forEach(t => {
          S.rosters[t] = [1, 2, 3, 4, 5].map(i => ({ id: t + '_p' + i, name: t + ' joueur ' + i }));
          S.lineups[t] = [1, 2, 3, 4].map(i => t + '_p' + i);
        });
        S.startingLineups = JSON.parse(JSON.stringify(S.lineups));
      });
    }
  }
  async initialPossession(team) {
    await this.clickSheet(`chooseInitialPossession('${team}')`);
    await this.settle();
  }

  /* Coordonnées normalisées [0..1] du terrain. */
  async _pt(n) {
    const b = await this.page.locator('#field').boundingBox();
    if (!b) throw new Error('#field invisible');
    return { x: b.x + n[0] * b.width, y: b.y + n[1] * b.height };
  }
  async _pickPlayer(player) {
    if (await this.page.locator('#sheet .player-pick-row').count()) {
      await this.clickSheet(`choosePlayer('${player || ''}')`);
    }
  }
  async lancer({ from = [0.3, 0.3], to = [0.7, 0.7], target, caught = false, player } = {}) {
    const a = await this._pt(from), b = await this._pt(to), m = this.page.mouse;
    await m.move(a.x, a.y); await m.down();
    await m.move(b.x, b.y, { steps: 2 }); await m.up();
    await this.clickSheet(`pickResult('${target}',${caught ? 'true' : 'false'})`);
    await this._pickPlayer(player);
    await this.settle();
  }
  /* C20 : glisser puis DÉF ILL de l'équipe visée (aucune feuille de joueur ensuite). */
  async defIll({ from = [0.3, 0.3], to = [0.7, 0.7], target } = {}) {
    const a = await this._pt(from), b = await this._pt(to), m = this.page.mouse;
    await m.move(a.x, a.y); await m.down();
    await m.move(b.x, b.y, { steps: 2 }); await m.up();
    await this.clickSheet(`pickDefIll('${target}')`);
    await this.settle();
  }
  async _tap(at) {
    const a = await this._pt(at), m = this.page.mouse;
    await m.move(a.x, a.y); await m.down(); await m.up();
  }
  async faute({ at = [0.5, 0.5], code = 'APPEL', player } = {}) {
    await this._tap(at);
    await this.clickSheet(`pickFault('${code}')`);
    await this._pickPlayer(player);
    await this.settle();
  }
  async reprise({ at = [0.5, 0.5], team } = {}) {
    await this._tap(at);
    await this.clickSheet('pickReprise()');
    await this.clickSheet(`applyReprise('${team}')`);
    await this.settle();
  }
  /* Appui sur le terrain puis abandon de la saisie (aucun événement). */
  async abandon({ at = [0.5, 0.5] } = {}) {
    await this._tap(at);
    await this.clickSheet('cancelPendingEvent()');
    await this.settle();
  }
  async duelStart(team) {
    await this.clickSheet(`chooseDuelStart('${team}')`);
    await this.settle();
  }
  async awaitingDuel() { return this.page.evaluate(() => !!S.awaitingDuelStart); }
  /* ↶ du ruban (tablette) ou de la barre (téléphone) : on attend la fin du
     réarmement de ↶ (UNDO_REARM_MS après un appui dans une feuille), puis clic sans force. */
  async undo() {
    await this.page.waitForFunction(() => typeof undoBlockedUntil === 'undefined' || Date.now() >= undoBlockedUntil + 10, null, { timeout: 4000, polling: 10 });
    await this.page.locator('#undoBtn:visible, #undoBtnPhone:visible').first().click({ timeout: 4000, noWaitAfter: true });
    await this.settle();
  }
  /* ↶ placé DANS la feuille (feuille du duel) : bouton `undo()` de #sheet. */
  async undoInSheet() { await this.clickSheet('undo()'); await this.settle(); }
  async openStatsTab(id) {
    const phone = await this.isPhone();
    if (!(await this.page.locator('#statsBody').isVisible())) {
      await this.page.locator(phone ? '#matchBar [onclick="openStats()"]' : '.icon-btn.stats').first().click();
    }
    await this.page.locator(`.stat-tab[onclick="setStatTab('match','${id}')"]`).click();
    return this.page.evaluate(() => {
      const body = document.getElementById('statsBody').cloneNode(true);
      const row = body.querySelector('.stat-tabs-row'); if (row) row.remove();
      return { text: body.textContent.trim(), rich: !!body.querySelector('table,svg,canvas,.heat,[class*=grid]'), html: body.innerHTML.length };
    });
  }
  async backToMatch() { await this.page.evaluate(() => navBack()); }
  async shot(path) { await this.page.screenshot({ path }); }
}

/* ---------- Vérifications ---------- */
export class Reporter {
  constructor({ bail = false } = {}) { this.rows = []; this.bail = bail; this.fails = 0; this.known = 0; }
  async check(name, fn, opts = {}) {
    const t0 = Date.now();
    let err = null;
    try { await fn(); } catch (e) { err = e; }
    const ms = Date.now() - t0;
    if (!err) { this.rows.push({ name, ok: true }); console.log(`PASS  ${name}  (${ms} ms)`); return true; }
    const msg = String(err && err.message || err).split('\n')[0];
    if (opts.known && (!opts.knownErr || err instanceof opts.knownErr)) { this.known++; this.rows.push({ name, ok: true, known: true }); console.log(`KNOWN ${name} — défaut connu : ${opts.known} [${msg}]`); return true; }
    this.fails++; this.rows.push({ name, ok: false, msg });
    console.log(`FAIL  ${name}\n      ${msg}`);
    if (this.bail) { const e = new Error('bail'); e.bail = true; throw e; }
    return false;
  }
}
export function assert(c, msg) { if (!c) throw new Error(msg || 'assertion fausse'); }
export function eq(a, b, msg) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${msg || 'différence'} — attendu ${y}, obtenu ${x}`);
}
export function diff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = diff(a[k], b[k], path + '.' + k); if (d) return d;
    }
  }
  return `${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
}
/* Générateur pseudo-aléatoire à graine (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
