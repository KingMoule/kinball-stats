/* M02 — Coquille statique : enveloppe retirée, polices et xlsx embarqués, manifest.
   Critères 1, 3, 4, 5, 6 du brief M02. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launch, assert, eq, DEPOT, HTML, SORTIE } from '../lib.mjs';
const require = createRequire(import.meta.url);

export default async function ({ gabarit, check }) {
  const app = await launch(gabarit);
  const p = app.page;
  /* Écoute complète (sans le filtre IGNORED du banc) puis rechargement : la
     nouvelle référence est « 0 requête http(s), 0 requête en échec, 0 erreur console ». */
  const requetes = [], echecs = [], erreurs = [];
  p.on('request', r => requetes.push(r.url()));
  p.on('requestfailed', r => echecs.push(r.url() + ' ' + (r.failure() && r.failure().errorText)));
  p.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });
  p.on('pageerror', e => erreurs.push('pageerror: ' + (e.stack || e)));
  try {
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined');
    await p.evaluate(() => Promise.all(['400','500','600','700'].map(w => document.fonts.load(w + ' 14px Inter'))
      .concat(['600','700','800'].map(w => document.fonts.load(w + ' 14px "Barlow Condensed"')))));
    const dossier = path.join(SORTIE, 'captures', 'M02');
    fs.mkdirSync(dossier, { recursive: true });

    await check(`[${gabarit}] M02·1 un seul doctype/html/head/body ; title, metas, manifest, icône dans document.head`, async () => {
      const src = fs.readFileSync(HTML, 'utf8');
      eq((src.match(/<!doctype/gi) || []).length, 1, 'doctypes dans le source');
      eq((src.match(/<html[\s>]/gi) || []).length, 1, '<html> dans le source');
      eq((src.match(/<head[\s>]/gi) || []).length, 1, '<head> dans le source');
      eq((src.match(/<body[\s>]/gi) || []).length, 1, '<body> dans le source');
      eq((src.match(/<\/html>/gi) || []).length, 1, '</html> dans le source');
      eq((src.match(/<script(?![^>]*\ssrc=)[^>]*>/gi) || []).length, 1, 'scripts en ligne');
      const r = await p.evaluate(() => ({
        doctype: document.doctype && document.doctype.name,
        title: document.head.querySelector('title') && document.head.querySelector('title').textContent,
        charset: !!document.head.querySelector('meta[charset]'),
        viewport: document.head.querySelector('meta[name=viewport]') && document.head.querySelector('meta[name=viewport]').content,
        theme: !!document.head.querySelector('meta[name=theme-color]'),
        manifest: document.head.querySelector('link[rel=manifest]') && document.head.querySelector('link[rel=manifest]').getAttribute('href'),
        icone: document.head.querySelector('link[rel=apple-touch-icon]') && document.head.querySelector('link[rel=apple-touch-icon]').getAttribute('href'),
        enCorps: document.body.querySelectorAll('title,meta,link,style[data-x]').length,
        htmlLang: document.documentElement.lang,
        compat: document.compatMode,
      }));
      eq(r.doctype, 'html', 'doctype'); eq(r.compat, 'CSS1Compat', 'mode standard');
      eq(r.title, 'Kin-Ball — Statistiques', 'title');
      assert(r.charset && r.theme, 'meta charset / theme-color dans le head');
      assert(/viewport-fit=cover/.test(r.viewport), 'viewport : ' + r.viewport);
      eq(r.manifest, 'manifest.webmanifest', 'lien manifest relatif');
      eq(r.icone, 'icons/apple-touch-icon-180.png', 'icône relative');
      eq(r.enCorps, 0, 'title/meta/link dans le body');
      eq(r.htmlLang, 'fr', 'lang');
    });

    await check(`[${gabarit}] M02·2 0 requête http(s), 0 requête en échec, 0 erreur console`, async () => {
      const http = requetes.filter(u => /^https?:/i.test(u));
      eq(http.length, 0, 'requêtes http(s) : ' + http.join(' '));
      eq(echecs.length, 0, 'requêtes en échec : ' + echecs.join(' | '));
      eq(erreurs.length, 0, erreurs.join(' | '));
      assert(requetes.some(u => /vendor\/xlsx\.full\.min\.js$/.test(u)), 'xlsx demandé depuis vendor/');
    });

    await check(`[${gabarit}] M02·3 les 7 graisses de police sont chargées depuis fonts/`, async () => {
      const faces = await p.evaluate(() => [...document.fonts].map(f => ({ fam: f.family.replace(/["']/g, ''), w: f.weight, st: f.status })));
      const attendu = ['Inter:400', 'Inter:500', 'Inter:600', 'Inter:700', 'Barlow Condensed:600', 'Barlow Condensed:700', 'Barlow Condensed:800'];
      const vus = faces.filter(f => f.st === 'loaded').map(f => f.fam + ':' + f.w).sort();
      eq(JSON.stringify(vus), JSON.stringify(attendu.slice().sort()), 'faces chargées : ' + JSON.stringify(faces));
      const woff = requetes.filter(u => /\.woff2$/.test(u));
      eq(woff.length, 7, 'fichiers woff2 demandés : ' + woff.join(' '));
      assert(woff.every(u => /\/fonts\/[a-z-]+-latin-\d+-normal\.woff2$/.test(u)), 'tous sous fonts/');
      for (const u of woff) assert(fs.existsSync(decodeURIComponent(new URL(u).pathname)), 'fichier présent : ' + u);
    });

    await check(`[${gabarit}] M02·4 XLSX 0.18.5 embarqué ; exportXLSX produit un classeur relisible aux bons noms de feuilles`, async () => {
      const v = await p.evaluate(() => ({ t: typeof XLSX, v: XLSX.version }));
      eq(v.t, 'object', 'typeof XLSX'); eq(v.v, '0.18.5', 'XLSX.version');
      await app.startMatch({ format: '9_11' });
      await app.initialPossession('Bleu');
      await app.lancer({ from: [.2, .3], to: [.7, .6], target: 'Gris', caught: false });
      await p.evaluate(() => {   // note les feuilles que le code construit
        window.__feuilles = [];
        const f = XLSX.utils.book_append_sheet;
        XLSX.utils.book_append_sheet = function (wb, ws, nom) { window.__feuilles.push(nom); return f.apply(this, arguments); };
      });
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.evaluate(() => exportXLSX())]);
      assert(/\.xlsx$/.test(dl.suggestedFilename()), 'nom : ' + dl.suggestedFilename());
      const f = path.join(SORTIE, 'M02-export-' + gabarit + '.xlsx');
      await dl.saveAs(f);
      const X = require(path.join(DEPOT, 'vendor', 'xlsx.full.min.js'));
      const wb = X.read(fs.readFileSync(f), { type: 'buffer' });
      const construits = await p.evaluate(() => window.__feuilles);
      assert(construits.length >= 5, 'feuilles construites : ' + construits.join(','));
      eq(JSON.stringify(wb.SheetNames), JSON.stringify(construits), 'noms de feuilles relus');
      for (const n of ['Match', 'Actions', 'Équipes', 'Zones']) assert(wb.SheetNames.includes(n), 'feuille ' + n);
      const act = X.utils.sheet_to_json(wb.Sheets['Actions'], { header: 1 });
      assert(act.length >= 2, 'la feuille Actions a au moins une ligne de données');
      fs.unlinkSync(f);
    });

    await check(`[${gabarit}] M02·5 manifest valide ; chaque icône existe à la taille déclarée`, async () => {
      const m = JSON.parse(fs.readFileSync(path.join(DEPOT, 'manifest.webmanifest'), 'utf8'));
      eq(m.name, 'Kin-Ball — Statistiques'); eq(m.short_name, 'Kin-Ball'); eq(m.lang, 'fr');
      eq(m.start_url, './'); eq(m.scope, './'); eq(m.display, 'standalone');
      eq(m.background_color, '#0B1220'); eq(m.theme_color, '#0B1220');
      assert(!('orientation' in m), 'pas de champ orientation');
      eq(m.icons.length, 3, 'icônes');
      assert(m.icons.some(i => i.purpose === 'maskable'), 'une icône maskable');
      for (const i of m.icons) {
        assert(!/^\/|^[a-z]+:/i.test(i.src), 'chemin relatif : ' + i.src);
        const b = fs.readFileSync(path.join(DEPOT, i.src));
        eq(b.slice(1, 4).toString(), 'PNG', 'signature ' + i.src);
        eq(b.readUInt32BE(16) + 'x' + b.readUInt32BE(20), i.sizes, 'taille de ' + i.src);
      }
      const a = fs.readFileSync(path.join(DEPOT, 'icons/apple-touch-icon-180.png'));
      eq(a.readUInt32BE(16) + 'x' + a.readUInt32BE(20), '180x180', 'taille apple-touch-icon');
    });

    await p.screenshot({ path: path.join(dossier, `M02-${gabarit}-final.png`) });
  } finally { await app.close(); }
}
