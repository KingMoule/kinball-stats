/* VIS-1 : pastilles d'équipe, possession « allumée », flèche du glissé, barres du % de victoire en fin de période. Détail : tests/docs/VIS1.md. */
import { launch, assert, eq } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];

/* Liseré et halo de chaque bloc d'équipe, et contenu du pseudo-élément ::after (l'ancienne barre de possession). */
const chips = () => [...document.querySelectorAll('#scoreboard .team-chip')].map(c => {
  const cs = getComputedStyle(c);
  return { t: (c.className.match(/chip-(\w+)/) || [])[1], dot: !!c.querySelector('.poss-dot'), shadow: cs.boxShadow, after: getComputedStyle(c, '::after').content };
});

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] VIS1`;

  await check(`${P}·1 blocs d'équipe : liseré blanc sur Bleu, Gris et Noir ; seule l'équipe qui a le ballon est allumée (liseré plein et halo), point gardé, plus de barre sous le nom ; l'allumage suit la possession`, async () => {
    const app = await launch(gabarit);
    try {
      await app.startMatch({ format: '9_11' });
      await app.initialPossession('Bleu');
      const lu = (c, ou) => {
        assert(/rgba\(255, 255, 255, 0\.6\) 0px 0px 0px 2px inset|rgb\(255, 255, 255\) 0px 0px 0px 3px inset/.test(c.shadow), `${ou} ${c.t} : liseré blanc absent (${c.shadow})`);
        eq(c.after, 'none', `${ou} ${c.t} : aucun ::after (barre de possession retirée)`);
        const allume = /rgb\(255, 255, 255\) 0px 0px 0px 3px inset/.test(c.shadow) && /0px 0px 12px 2px/.test(c.shadow);
        eq(allume, c.dot, `${ou} ${c.t} : allumé si et seulement s'il porte le point de possession (${c.shadow})`);
      };
      let r = await app.ev(chips);
      eq(r.map(c => c.t), ['bleu', 'gris', 'noir'], 'trois blocs');
      eq(r.filter(c => c.dot).map(c => c.t), ['bleu'], 'point de possession sur Bleu');
      r.forEach(c => lu(c, 'départ'));
      await app.lancer({ target: 'Gris', caught: false });   // échappé : Gris reprend le ballon
      r = await app.ev(chips);
      eq(r.filter(c => c.dot).map(c => c.t), ['gris'], 'point de possession sur Gris');
      r.forEach(c => lu(c, 'après échappé'));
      await app.lancer({ target: 'Noir', caught: false });
      r = await app.ev(chips);
      eq(r.filter(c => c.dot).map(c => c.t), ['noir'], 'point de possession sur Noir');
      r.forEach(c => lu(c, 'Noir au ballon'));
      assert(!app.errors.length, app.errors.join('\n'));
    } finally { await app.close(); }
  });

  await check(`${P}·2 flèche du glissé à la couleur de l'équipe qui lance (vrai geste pour Bleu et Gris ; Noir cernée de blanc)`, async () => {
    const app = await launch(gabarit);
    try {
      await app.startMatch({ format: '9_11' });
      await app.initialPossession('Bleu');
      const fleche = async () => {
        const a = await app._pt([0.3, 0.3]), b = await app._pt([0.7, 0.7]), m = app.page.mouse;
        await m.move(a.x, a.y); await m.down(); await m.move(b.x, b.y, { steps: 3 });
        const f = await app.ev(() => {
          const L = [...document.querySelectorAll('#dragLayer line')];
          return { po: S.possession, lignes: L.map(l => [l.getAttribute('stroke'), l.getAttribute('stroke-width'), !!l.getAttribute('marker-end')]),
            depart: document.querySelector('#dragLayer circle').getAttribute('fill'),
            pointe: [document.querySelector('#dragLayer marker path').getAttribute('fill'), document.querySelector('#dragLayer marker path').getAttribute('stroke')] };
        });
        await m.up();
        await app.clickSheet('cancelPendingEvent()'); await app.settle();
        await app.page.waitForFunction(() => Date.now() >= abandonTap.t + SHEET_DOUBLE_MS + 10, null, { timeout: 4000, polling: 10 });
        return f;
      };
      const attendu = { Bleu: '#2F6BFF', Gris: '#8B93A1', Noir: '#08090C' };
      let f = await fleche();
      eq(f, { po: 'Bleu', lignes: [[attendu.Bleu, '5', true]], depart: attendu.Bleu, pointe: [attendu.Bleu, null] }, 'Bleu');
      await app.lancer({ target: 'Gris', caught: false });
      f = await fleche();
      eq(f, { po: 'Gris', lignes: [[attendu.Gris, '5', true]], depart: attendu.Gris, pointe: [attendu.Gris, null] }, 'Gris');
      await app.lancer({ target: 'Noir', caught: false });
      f = await fleche();
      eq(f, { po: 'Noir', lignes: [['white', '9', false], [attendu.Noir, '5', true]], depart: attendu.Noir, pointe: [attendu.Noir, 'white'] }, 'Noir : contour blanc sous la ligne et autour de la pointe');
      assert(!app.errors.length, app.errors.join('\n'));
    } finally { await app.close(); }
  });

  if (gabarit === 'tablette') await check(`${P}·3 % de victoire : aucun calcul pendant le message de fin de période (S déjà dans la suivante) ; le calcul de la nouvelle période part à la fin du message`, async () => {
    const app = await launch(gabarit);
    try {
      await app.ev(() => { WP.seedFixed = 77; });
      await app.startMatch({ format: 'duel11' });
      await app.initialPossession('Bleu');
      await app.ev(() => {
        WP.minK = 1; window.__req = [];
        const o = window.wpRequest;
        window.wpRequest = function () { window.__req.push({ pev: !!periodEndView, periode: S.period, tr: wpTransition() }); return o.apply(this, arguments); };
      });
      for (let i = 0; i < 40; i++) {
        const s = await app.ev(() => ({ po: S.possession, p: S.period }));
        if (s.p === 2) break;
        await app.lancer({ target: s.po === 'Bleu' ? 'Gris' : 'Bleu', caught: false });
      }
      const r = await app.ev(() => ({ req: window.__req, periode: S.period, pev: periodEndView, res: WP.result && WP.result.sig === wpSig() }));
      eq(r.periode, 2, 'période 2 atteinte');
      eq(r.pev, null, 'message de fin terminé');
      eq(r.req.filter(q => q.pev), [], 'aucune demande de calcul pendant le message de fin');
      const dernier = r.req[r.req.length - 1];
      assert(dernier && dernier.periode === 2 && !dernier.pev, 'une demande pour la période 2, après le message : ' + JSON.stringify(r.req.slice(-3)));
      await app.page.waitForFunction(() => !WP.inFlight && WP.result && WP.result.sig === wpSig(), null, { timeout: 8000, polling: 20 });
      assert(!app.errors.length, app.errors.join('\n'));
    } finally { await app.close(); }
  });
}
