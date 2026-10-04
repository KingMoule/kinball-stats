/* Banc d'essai Kin-Ball Stats : node tests/run.mjs
   KINBALL_HTML=<fichier>  : tester une autre copie de l'app
   KINBALL_BAIL=1          : s'arrêter au premier échec
   KINBALL_ONLY=smoke,undo : ne lancer que ces suites (ou ids de scénarios)
   KINBALL_GABARIT=tablette: un seul gabarit */
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { Reporter, GABARITS, HTML } from './lib.mjs';

import { spawn } from 'node:child_process';

const dir = path.dirname(fileURLToPath(import.meta.url));
const rep = new Reporter({ bail: !!process.env.KINBALL_BAIL });
const check = rep.check.bind(rep);
const only = (process.env.KINBALL_ONLY || '').split(',').filter(Boolean);
const gabs = (process.env.KINBALL_GABARIT || Object.keys(GABARITS).join(',')).split(',');

/* Plusieurs gabarits : un processus fils par gabarit, en parallèle, sortie
   regroupée dans l'ordre (c'est ce qui tient le banc sous deux minutes). */
if (gabs.length > 1) {
  const t0 = Date.now();
  console.log(`Banc d'essai Kin-Ball — ${HTML}`);
  const runs = gabs.map(g => new Promise(res => {
    const p = spawn(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, KINBALL_GABARIT: g, KINBALL_CHILD: '1' } });
    let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('close', code => res({ out, code }));
  }));
  let total = 0, ok = 0, fails = 0, known = 0, code = 0;
  for (const r of await Promise.all(runs)) {
    for (const l of r.out.split('\n')) {
      if (l.startsWith('@@RESULT ')) r.ok_ = true;
      if (l.startsWith('@@RESULT ')) { const j = JSON.parse(l.slice(9)); total += j.total; ok += j.ok; fails += j.fails; known += j.known; }
      else if (l.trim() && !l.startsWith("Banc d'essai") && !l.startsWith('ÉCHEC —') && !l.startsWith('OK —') && !l.startsWith('Arrêt au premier')) console.log(l);
    }
    if (r.code) code = 1;
    if (!r.ok_) { fails++; total++; console.log('FAIL  processus de test interrompu (aucun résultat) :\n' + r.out.split('\n').slice(0, 8).map(x => '      ' + x).join('\n')); }
  }
  console.log(`\n${fails ? 'ÉCHEC' : 'OK'} — ${ok}/${total} vérifications passées, ${fails} échec(s)${known ? `, ${known} défaut(s) connu(s)` : ''} en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(code || (fails ? 1 : 0));
}

const suites = ['smoke', 'undo', 'fuzz'].map(n => ({ id: n, file: path.join(dir, n + '.mjs') }));
const scenDir = path.join(dir, 'scenarios');
try {
  readdirSync(scenDir).filter(f => f.endsWith('.mjs')).sort()
    .forEach(f => suites.push({ id: f.replace(/\.mjs$/, ''), file: path.join(scenDir, f) }));
} catch {}

const t0 = Date.now();
if (!process.env.KINBALL_CHILD) console.log(`Banc d'essai Kin-Ball — ${HTML}`);
try {
  for (const g of gabs) {
    for (const s of suites) {
      if (only.length && !only.includes(s.id)) continue;
      const mod = await import(pathToFileURL(s.file).href);
      if (mod.gabarits && !mod.gabarits.includes(g)) continue;
      try { await (mod.default || mod.run)({ gabarit: g, check, GABARITS }); }
      catch (e) {
        if (e.bail) throw e;
        await check(`[${g}] ${s.id} · exécution de la suite`, async () => { throw e; });   // erreur inattendue = échec nommé
      }
    }
  }
} catch (e) { if (!e.bail) throw e; console.log('Arrêt au premier échec (KINBALL_BAIL).'); }

const ok = rep.rows.filter(r => r.ok).length;
console.log(`\n${rep.fails ? 'ÉCHEC' : 'OK'} — ${ok}/${rep.rows.length} vérifications passées, ${rep.fails} échec(s)${rep.known ? `, ${rep.known} défaut(s) connu(s)` : ''} en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log('@@RESULT ' + JSON.stringify({ total: rep.rows.length, ok, fails: rep.fails, known: rep.known }));
process.exit(rep.fails ? 1 : 0);
