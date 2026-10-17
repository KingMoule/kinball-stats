/* TERRAIN : tracé du terrain de saisie d'après la maquette (docs/maquettes/terrain-3x3.png). Détail : tests/docs/TERRAIN.md. */
import { launch, assert, eq } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];

/* Style de #field, contenu des deux SVG du terrain, et position de chaque ligne de la grille lue par fieldPoint
   au centre de son rectangle à l'écran (indépendant de lib._pt et de la rotation). */
const trace = () => {
  const f = document.getElementById('field'), cs = getComputedStyle(f);
  const fond = f.querySelector(':scope > svg'), grille = document.getElementById('gridLayer');
  const centre = el => { const q = el.getBoundingClientRect(); return fieldPoint({ clientX: q.left + q.width / 2, clientY: q.top + q.height / 2 }); };
  const lignes = [...grille.querySelectorAll('line')].map(l => {
    const p = centre(l), v = l.getAttribute('x1') === l.getAttribute('x2');
    return { v, pos: v ? p.nx : p.ny, long: v ? (+l.getAttribute('y2') - +l.getAttribute('y1')) / 400 : (+l.getAttribute('x2') - +l.getAttribute('x1')) / 400 };
  });
  const c = fond.querySelector('circle'), cq = c.getBoundingClientRect(), fq = f.getBoundingClientRect();
  return {
    border: cs.borderTopWidth, padding: cs.paddingTop, overflow: cs.overflow, transform: cs.transform, radius: cs.borderTopLeftRadius, fond: cs.backgroundImage,
    formes: [...fond.children].map(e => e.tagName.toLowerCase()), lignes,
    cercle: { d: cq.width / (fq.width / 3), centre: centre(c), fill: c.getAttribute('fill') },
    liseré: (() => { const r = fond.querySelector('rect'); return { x: +r.getAttribute('x'), w: +r.getAttribute('width'), rx: +r.getAttribute('rx'), stroke: r.getAttribute('stroke') }; })(),
    grilleBoite: [grille.offsetWidth, grille.offsetHeight, f.offsetWidth, f.offsetHeight],
    vides: ['duelTag', 'advTag'].map(id => { const e = document.getElementById(id); return e.textContent === '' ? getComputedStyle(e).display : 'plein'; })
  };
};

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] TERRAIN`;

  await check(`${P}·1 tracé : boîte nue (ni bordure, ni padding, ni transform, ni overflow:hidden), fond vert en dégradé, coins arrondis, liseré, grille 3×3 aux tiers lus par fieldPoint, cercle central ≈ 70 % d'une case, aucune autre ligne, pas de pastille vide`, async () => {
    const app = await launch(gabarit);
    try {
      await app.startMatch({ format: '9_11' });
      await app.initialPossession('Bleu');
      const t = await app.ev(trace);
      eq(t.border, '0px', 'bordure de #field'); eq(t.padding, '0px', 'padding de #field'); eq(t.transform, 'none', 'transform de #field');
      eq(t.overflow, 'visible', 'overflow de #field (les menus des coins ne sont pas coupés)');
      assert(parseFloat(t.radius) >= 10, 'coins arrondis : ' + t.radius);
      assert(/linear-gradient/.test(t.fond), 'fond en dégradé : ' + t.fond);
      eq(t.formes.join(','), 'rect,circle', 'le fond ne trace que le liseré et le cercle');
      assert(t.liseré.x > 0 && t.liseré.x <= 10 && Math.abs(t.liseré.x * 2 + t.liseré.w - 400) < 0.01 && t.liseré.rx > 0, 'liseré centré, arrondi : ' + JSON.stringify(t.liseré));
      eq(t.lignes.length, 4, 'quatre lignes de grille');
      const tiers = v => t.lignes.filter(l => l.v === v).map(l => l.pos).sort();
      for (const v of [true, false]) {
        const p = tiers(v); eq(p.length, 2, (v ? 'verticales' : 'horizontales'));
        assert(Math.abs(p[0] - 1 / 3) < 0.004 && Math.abs(p[1] - 2 / 3) < 0.004, `${v ? 'verticales' : 'horizontales'} aux tiers : ${p.map(x => x.toFixed(4))}`);
      }
      t.lignes.forEach(l => assert(l.long > 0.95, 'ligne d\'un bord du liseré à l\'autre : ' + l.long));
      assert(t.cercle.d > 0.6 && t.cercle.d < 0.8, 'diamètre du cercle / case : ' + t.cercle.d.toFixed(3));
      assert(Math.abs(t.cercle.centre.nx - 0.5) < 0.004 && Math.abs(t.cercle.centre.ny - 0.5) < 0.004, 'cercle au centre');
      eq(t.cercle.fill, 'none', 'cercle sans remplissage');
      eq(t.grilleBoite.slice(0, 2).join(','), t.grilleBoite.slice(2).join(','), '#gridLayer couvre #field');
      eq(t.vides.join(','), 'none,none', 'étiquettes vides (duel, mode avancé) masquées');
      await app.shot(`${process.env.KINBALL_SORTIE || '/tmp'}/TERRAIN-${gabarit}.png`);
      assert(!app.errors.length, app.errors.join('\n'));
    } finally { await app.close(); }
  });

  await check(`${P}·2 un geste à 4 px de chaque côté d'une ligne dessinée tombe dans la case dessinée (lancer : colonne ; faute : rangée)`, async () => {
    const app = await launch(gabarit);
    try {
      await app.startMatch({ format: '9_11' });
      await app.initialPossession('Bleu');
      const m = app.page.mouse;
      /* Rectangles à l'écran des lignes de la grille (sans rotation : x pour une verticale, y pour une horizontale). */
      const L = await app.ev(() => [...document.querySelectorAll('#gridLayer line')].map(l => { const q = l.getBoundingClientRect(); return { v: l.getAttribute('x1') === l.getAttribute('x2'), x: q.left + q.width / 2, y: q.top + q.height / 2 }; }));
      const v1 = L.filter(l => l.v).sort((a, b) => a.x - b.x)[0], h2 = L.filter(l => !l.v).sort((a, b) => a.y - b.y)[1];
      const zones = [];
      for (const dx of [-4, 4]) {
        const tgt = await app.ev(() => ATEAMS().filter(x => x !== S.possession)[0]);
        await m.move(v1.x + dx, v1.y - 30); await m.down(); await m.move(v1.x + dx + 60, v1.y + 60, { steps: 2 }); await m.up();
        await app.clickSheet(`pickResult('${tgt}',true)`); await app._pickPlayer(); await app.settle();
        zones.push(await app.ev(() => { const d = S.history[S.history.length - 1].details; return zoneIndex(d.start_norm[0], d.start_norm[1]); }));
      }
      for (const dy of [-4, 4]) {
        await m.move(h2.x + 40, h2.y + dy); await m.down(); await m.up();
        await app.clickSheet(`pickFault('APPEL')`); await app._pickPlayer(); await app.settle();
        zones.push(await app.ev(() => { const d = S.history[S.history.length - 1].details; return zoneIndex(d.position_norm[0], d.position_norm[1]); }));
      }
      eq(zones.map(z => z % 3).slice(0, 2).join(','), '0,1', 'colonnes de part et d\'autre de la première verticale : ' + zones);
      eq(zones.map(z => Math.floor(z / 3)).slice(2).join(','), '1,2', 'rangées de part et d\'autre de la seconde horizontale : ' + zones);
      assert(!app.errors.length, app.errors.join('\n'));
    } finally { await app.close(); }
  });

  if (gabarit === 'telephone') await check(`${P}·3 verrou portrait (uiRotation ±90°) : la grille dessinée reste aux tiers du repère de fieldPoint`, async () => {
    for (const ori of [90, -90]) {
      const app = await launch('telephone');
      try {
        await app.page.addInitScript(o => { Object.defineProperty(window, 'orientation', { get: () => o, configurable: true }); }, ori);
        await app.startMatch({ format: '9_11' }); await app.initialPossession('Gris');
        await app.page.setViewportSize({ width: 844, height: 390 });
        await app.page.evaluate(o => { try { Object.defineProperty(window, 'orientation', { get: () => o, configurable: true }); } catch (_) {} applyPhoneOrientation(); }, ori);
        eq(Math.abs(await app.ev(() => uiRotation)), 90, 'verrou actif');
        const t = await app.ev(trace);
        for (const v of [true, false]) {
          const p = t.lignes.filter(l => l.v === v).map(l => l.pos).sort();
          assert(Math.abs(p[0] - 1 / 3) < 0.004 && Math.abs(p[1] - 2 / 3) < 0.004, `${ori}° ${v ? 'verticales' : 'horizontales'} aux tiers : ${p.map(x => x.toFixed(4))}`);
        }
        assert(!app.errors.length, app.errors.join('\n'));
      } finally { await app.close(); }
    }
  });

  if (gabarit === 'tablette') await check(`${P}·4 heat map inchangée : fieldLinesSVG garde son tracé (cadre, quatre lignes pointillées, carré central)`, async () => {
    const app = await launch(gabarit);
    try {
      const h = await app.ev(() => { const d = document.createElement('div'); d.innerHTML = `<svg>${fieldLinesSVG()}</svg>`; return { rect: d.querySelectorAll('rect').length, pointilles: d.querySelectorAll('[stroke-dasharray]').length, x: [...d.querySelectorAll('line')].map(l => l.getAttribute('x1')).join(',') }; });
      eq(h.rect, 2, 'cadre et carré central'); eq(h.pointilles, 5, 'quatre lignes et le carré pointillés'); eq(h.x, '72,328,4,4', 'lignes à 72 et 328');
    } finally { await app.close(); }
  });
}
