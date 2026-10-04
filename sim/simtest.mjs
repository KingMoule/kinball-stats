import {createRequire} from 'module';
import {fileURLToPath} from 'url';
import path from 'path';
const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const Factory = require(path.join(dir, 'simcore.js'));
const K = Factory();
const F911 = {id:'9_11', teams:3, eliminationAt:9, periodAt:11};
const F1113 = {id:'11_13', teams:3, eliminationAt:11, periodAt:13};
const D11 = {id:'duel11', teams:2, eliminationAt:null, periodAt:11};
const D13 = {id:'duel13', teams:2, eliminationAt:null, periodAt:13};
const LIB = {id:'libre3', teams:3, eliminationAt:null, periodAt:null};
const T3 = ['Bleu','Gris','Noir'];
let fails = 0;
const ok = (name, cond, info='') => { if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(info?'  ['+info+']':'')); };
const z = () => ({Bleu:0,Gris:0,Noir:0});
const st0 = (o={}) => Object.assign({scores:z(), periodWins:z(), eliminated:null, duelActive:false, possession:null}, o);
const flat = (teams, off=0.35, fa=0.05) => {
  const h2h={}, fault={}, overall={}, confidence={};
  teams.forEach(a=>{ fault[a]=fa; overall[a]=off; confidence[a]=1; h2h[a]={}; teams.forEach(b=>{ if(a!==b) h2h[a][b]=off; }); });
  return {h2h, fault, overall, confidence};
};
const pct = (r,k,t) => 100*r[k][t]/r.n;
const R = (o) => K.run(Object.assign({fmt:F911, teams:T3, state:st0(), params:flat(T3), n:1000, seed:7}, o));

// 1. Déterminisme
{ const a=R({}), b=R({}); const c=R({seed:99});
  ok('1a même graine -> résultat identique', JSON.stringify(a.match)===JSON.stringify(b.match) && JSON.stringify(a.period)===JSON.stringify(b.period));
  const gap = Math.max(...T3.map(t=>Math.abs(pct(a,'match',t)-pct(c,'match',t))));
  ok('1b autre graine -> écart match < 6 points', gap<6, 'écart '+gap.toFixed(1));
}
// 2. Symétrie
{ const r=R({n:20000, seed:3});
  const ps=T3.map(t=>pct(r,'match',t));
  ok('2a symétrie 3 équipes entre 30 et 37 %', ps.every(p=>p>=30&&p<=37), ps.map(p=>p.toFixed(1)).join(' / '));
  const pa = {h2h:{Bleu:{Gris:0.6,Noir:0.6},Gris:{Bleu:0.3,Noir:0.3},Noir:{Bleu:0.3,Gris:0.3}}, fault:{Bleu:.05,Gris:.05,Noir:.05}};
  const perm = {h2h:{Gris:{Noir:0.6,Bleu:0.6},Noir:{Gris:0.3,Bleu:0.3},Bleu:{Gris:0.3,Noir:0.3}}, fault:{Bleu:.05,Gris:.05,Noir:.05}};
  const r1=R({params:pa,n:20000,seed:5}), r2=R({params:perm,n:20000,seed:6});
  const d=Math.max(Math.abs(pct(r1,'match','Bleu')-pct(r2,'match','Gris')),Math.abs(pct(r1,'match','Gris')-pct(r2,'match','Noir')),Math.abs(pct(r1,'match','Noir')-pct(r2,'match','Bleu')));
  ok('2b permuter les emplacements permute les résultats (écart < 2 pts)', d<2, 'écart '+d.toFixed(2)+' ; Bleu '+pct(r1,'match','Bleu').toFixed(1)+'% -> Gris '+pct(r2,'match','Gris').toFixed(1)+'%');
}
// 3. Dominance
{ const base=R({n:5000}); const p=flat(T3); p.h2h.Bleu.Gris=0.55; p.h2h.Bleu.Noir=0.55;
  const up=R({n:5000,params:p});
  ok('3a h2h plus haut -> % match plus haut', pct(up,'match','Bleu')>pct(base,'match','Bleu')+3, pct(base,'match','Bleu').toFixed(1)+' -> '+pct(up,'match','Bleu').toFixed(1));
  const q=flat(T3); q.fault.Bleu=0.25; const dn=R({n:5000,params:q});
  ok('3b faute plus haute -> % match plus bas', pct(dn,'match','Bleu')<pct(base,'match','Bleu')-3, pct(base,'match','Bleu').toFixed(1)+' -> '+pct(dn,'match','Bleu').toFixed(1));
}
// 4. États limites
{ const D=['Bleu','Gris'];
  const r=K.run({fmt:D11,teams:D,state:st0({scores:{Bleu:10,Gris:10,Noir:0},periodWins:{Bleu:3,Gris:0,Noir:0},duelActive:true,possession:'Bleu'}),params:flat(D),n:2000,seed:1});
  ok('4a duel 3 périodes + 10/10 : équipe dominante > 85 %', pct(r,'match','Bleu')>85, pct(r,'match','Bleu').toFixed(1)+'%');
  const e=R({n:2000,state:st0({scores:{Bleu:9,Gris:4,Noir:2},eliminated:'Noir',duelActive:true,possession:'Bleu'})});
  ok('4b éliminée : période 0 %, match > 0 %', e.period.Noir===0 && e.match.Noir>0, 'match Noir '+pct(e,'match','Noir').toFixed(1)+'%');
  ok('4c match + unfinished = n', Object.values(e.match).reduce((a,b)=>a+b,0)+e.unfinished===e.n);
  ok('4d somme period = n - unfinished', Object.values(e.period).reduce((a,b)=>a+b,0)===e.n-e.unfinished);
  const w=R({state:st0({periodWins:{Bleu:4,Gris:1,Noir:0}})});
  ok('4e équipe déjà à periodsToWin : 100 %', w.match.Bleu===w.n && w.match.Gris===0);
  const u=R({n:500,state:st0({scores:{Bleu:5,Gris:5,Noir:5}})});
  ok('4f possession nulle : tirée à chaque simulation, tout se termine', u && u.unfinished===0 && u.n===500);
}
// 5. Fidélité des règles
{ const ap=(s,f,tm,a)=>K.apply(s,f,tm,a);
  const th=(attacker,target,caught)=>({type:'lancer',attacker,target,caught});
  // 9/11 : échappés successifs. Bleu lance sur Gris (échappé) -> +1 à Bleu et Noir.
  let s=st0({possession:'Bleu'}); let evs=0;
  s=ap(s,F911,T3,th('Bleu','Gris',false)); // B1 G0 N1, ball Gris
  ok('5a échappé : +1 aux autres équipes dont l\'attaquant, ballon à la cible', s.scores.Bleu===1&&s.scores.Noir===1&&s.scores.Gris===0&&s.possession==='Gris');
  ok('5b attrapé : aucun point, ballon à la cible', (t=>t.scores.Bleu===1&&t.possession==='Noir')(ap(s,F911,T3,th('Gris','Noir',true))));
  ok('5c faute : +1 aux autres, A garde le ballon', (t=>t.scores.Bleu===2&&t.scores.Noir===2&&t.scores.Gris===0&&t.possession==='Gris')(ap(s,F911,T3,{type:'faute',team:'Gris'})));
  // Suite à la main : Bleu et Noir gagnent à tour de rôle, Gris reste bas. Parité vérifiée à chaque pas.
  let ok_par=true; s=st0({possession:'Bleu'}); let elimAtStep=null, elimTeam=null;
  const seq=[['faute','Gris'],['faute','Gris'],['faute','Gris'],['faute','Gris'],['faute','Gris'],['faute','Gris'],['faute','Gris'],['faute','Gris'],['faute','Gris']];
  for(const [,t] of seq){ s.possession=t; const n=ap(s,F911,T3,{type:'faute',team:t}); s=n;
    if(!s.eliminated){ const tot=s.scores.Bleu+s.scores.Gris+s.scores.Noir; if(tot%2) ok_par=false; }
    if(s.eliminated && !elimAtStep){ elimAtStep=Math.max(...T3.map(x=>s.scores[x])); elimTeam=s.eliminated; } }
  ok('5d 9/11 : élimination à 9 points, de l\'équipe la plus basse (Gris à 0)', elimAtStep===9 && elimTeam==='Gris', 'max '+elimAtStep+' éliminé '+elimTeam);
  ok('5e total des points pair hors duel', ok_par);
  ok('5f élimination : duel actif, porteur éliminé -> reprise sur une équipe en jeu', s.duelActive && s.possession!=='Gris', 'ballon '+s.possession);
  ok('5g élimination de A par son propre ballon échappé : on ne s\'arrête pas là (pas de fin de période à l\'élimination)', s.periodWins.Bleu===0&&s.periodWins.Noir===0);
  // Duel : Bleu 9 / Noir 8, Noir fait faute -> Bleu 10 ; encore -> 11 gagne
  let d={scores:{Bleu:9,Gris:2,Noir:8},periodWins:{Bleu:1,Gris:0,Noir:0},eliminated:'Gris',duelActive:true,possession:'Noir'};
  d=ap(d,F911,T3,{type:'faute',team:'Noir'}); ok('5h duel : faute -> +1 seulement à l\'adversaire (10)', d.scores.Bleu===10&&d.scores.Noir===8);
  d=ap(d,F911,T3,th('Noir','Bleu',false)); // Noir échappe : +1 à Noir seulement
  ok('5i duel : échappé -> +1 à l\'attaquant (le seul non-cible)', d.scores.Noir===9&&d.scores.Bleu===10&&d.possession==='Bleu');
  d=ap(d,F911,T3,{type:'faute',team:'Noir'});
  ok('5j fin de période à 11', d.info.periodFinished && d.info.periodWinner==='Bleu' && d.periodWins.Bleu===2);
  ok('5k remise à zéro des pointages', T3.every(t=>d.scores[t]===0));
  ok('5l ballon à l\'éliminée (3 équipes), élimination levée, duel levé', d.possession==='Gris'&&d.eliminated===null&&d.duelActive===false);
  // 11/13
  let q=st0({scores:{Bleu:10,Gris:6,Noir:10},possession:'Bleu'});
  q=ap(q,F1113,T3,{type:'faute',team:'Bleu'}); // Gris 7, Noir 11 -> élim de Gris? max 11
  ok('5m 11/13 : élimination à 11, de la plus basse (Gris)', q.eliminated==='Gris'&&q.duelActive&&q.scores.Noir===11);
  q={scores:{Bleu:12,Gris:3,Noir:11},periodWins:z(),eliminated:'Gris',duelActive:true,possession:'Noir'};
  q=ap(q,F1113,T3,{type:'faute',team:'Noir'});
  ok('5n 11/13 : fin de période à 13', q.info.periodFinished && q.info.periodWinner==='Bleu');
  // Duel 11 et 13 (2 équipes)
  const D=['Bleu','Gris'];
  let u={scores:{Bleu:0,Gris:10,Noir:0},periodWins:z(),eliminated:null,duelActive:true,possession:'Bleu'};
  u=ap(u,D11,D,{type:'faute',team:'Bleu'});
  ok('5o duel 11 : fin de période à 11, ballon au perdant, duel reste actif', u.info.periodFinished&&u.periodWins.Gris===1&&u.possession==='Bleu'&&u.duelActive===true);
  let u2={scores:{Bleu:11,Gris:12,Noir:0},periodWins:z(),eliminated:null,duelActive:true,possession:'Bleu'};
  const u3=ap({...u2,scores:{Bleu:12,Gris:5,Noir:0}},D13,D,{type:'faute',team:'Gris'});
  ok('5p duel 13 : 12 n\'est pas une fin ; 13 l\'est', !ap({...u2,scores:{Bleu:11,Gris:5,Noir:0}},D13,D,{type:'faute',team:'Gris'}).info.periodFinished && u3.info.periodWinner==='Bleu');
  const u4=ap({scores:{Bleu:12,Gris:5,Noir:0},periodWins:z(),eliminated:null,duelActive:true,possession:'Gris'},D13,D,{type:'faute',team:'Gris'});
  ok('5q duel 13 : fin à 13', u4.info.periodFinished && u4.info.periodWinner==='Bleu');
  ok('5r action invalide (cible éliminée) -> null', ap({scores:{Bleu:9,Gris:2,Noir:8},periodWins:z(),eliminated:'Gris',duelActive:true,possession:'Noir'},F911,T3,th('Noir','Gris',false))===null);
  // 200 000 simulations : aucune anomalie d'égalité au plus bas
  const a1=R({n:100000,seed:11}), a2=R({n:100000,seed:12,fmt:F1113});
  ok('5s aucune anomalie sur 200 000 simulations (9/11 + 11/13)', a1.anomalies+a2.anomalies===0, 'anomalies '+(a1.anomalies+a2.anomalies));
}
// 6. Lissage
{ const p=K.params([],T3);
  ok('6a historique vide : fault 0.05', T3.every(t=>Math.abs(p.fault[t]-0.05)<1e-12));
  ok('6b historique vide : h2h 0.35 partout', T3.every(a=>T3.every(b=>a===b||Math.abs(p.h2h[a][b]-0.35)<1e-12)));
  ok('6c historique vide : confidence 0', T3.every(t=>p.confidence[t]===0));
  const L=(a,t,r)=>({type:'lancer',before:{possession:a},details:{attacker:a,target:t,result:r}});
  const h6=[]; for(let i=0;i<6;i++) h6.push(L('Bleu','Gris','échappé'));
  for(let i=0;i<6;i++) h6.push(L('Bleu','Noir','attrapé'));
  const p6=K.params(h6,T3);
  ok('6d 6 échappés contre une cible : h2h entre overall et 1 (strict)', p6.h2h.Bleu.Gris>p6.overall.Bleu && p6.h2h.Bleu.Gris<1, p6.overall.Bleu.toFixed(3)+' < '+p6.h2h.Bleu.Gris.toFixed(3)+' < 1');
  ok('6e h2h vers l\'autre cible tiré vers overall (pas de données)', Math.abs(p6.h2h.Gris.Noir-p6.overall.Gris)<1e-12 && p6.overall.Gris===0.5);
  // 60 actions : 25 premières (fautes) très différentes des 35 dernières (attrapés)
  const first=[], last=[];
  for(let i=0;i<25;i++) first.push({type:'faute_directe',before:{possession:'Bleu'},details:{}});
  for(let i=0;i<35;i++) last.push(L('Bleu','Gris','attrapé'));
  const pw=K.params(first.concat(last),T3), pl=K.params(last,T3);
  ok('6f fenêtre : fault et overall ne voient que les 35 dernières', Math.abs(pw.fault.Bleu-pl.fault.Bleu)<1e-12 && Math.abs(pw.overall.Bleu-pl.overall.Bleu)<1e-12, 'fault '+pw.fault.Bleu.toFixed(4));
  ok('6g confidence = 1 à 35 actions', pw.confidence.Bleu===1 && pl.confidence.Bleu===1);
  const e25=[]; for(let i=0;i<25;i++) e25.push(L('Bleu','Gris','échappé'));
  const ph=K.params(e25.concat(last),T3), pn=K.params(last,T3);
  ok('6h h2h compte tout l\'historique (25 échappés hors fenêtre comptent)', ph.h2h.Bleu.Gris>pn.h2h.Bleu.Gris+0.1, pn.h2h.Bleu.Gris.toFixed(3)+' -> '+ph.h2h.Bleu.Gris.toFixed(3));
  ok('6i counts bruts présents', ph.counts.Bleu.throws===60 && ph.counts.Bleu.window.throws===35 && ph.counts.Bleu.pairs.Gris.escaped===25);
}
// 7. Format libre
ok('7 format libre -> null', K.run({state:st0(),fmt:LIB,teams:T3,params:flat(T3),n:10})===null);
// 8. Performance
{ R({n:200}); const r=R({n:1000}); ok('8 1000 simulations depuis 9/11 en < 150 ms', r.ms<150, r.ms.toFixed(1)+' ms'); console.log('   perf mesurée : '+r.ms.toFixed(1)+' ms'); }
// 9. Autonomie de KBSimFactory
{ const src=Factory.toString(); const K2=new Function('return ('+src+')()')();
  const a=K2.run({state:st0(),fmt:F911,teams:T3,params:flat(T3),n:1000,seed:7}), b=R({});
  ok('9 KBSimFactory.toString() évalué seul fonctionne et donne les mêmes résultats', a && JSON.stringify(a.match)===JSON.stringify(b.match)); }

// Tableau pour relecture humaine
if(process.argv.includes('--table')){
  const rows=[
    ['Début de match 9/11, parité', R({n:20000,seed:21})],
    ['8-8-6 (Bleu a le ballon)', R({n:20000,seed:22,state:st0({scores:{Bleu:8,Gris:8,Noir:6},possession:'Bleu'})})],
    ['Duel 10-9, Bleu mène (Noir éliminé)', R({n:20000,seed:23,state:st0({scores:{Bleu:10,Gris:9,Noir:3},eliminated:'Noir',duelActive:true,possession:'Gris'})})],
    ['2 périodes partout (pointage 0-0-0)', R({n:20000,seed:24,state:st0({periodWins:{Bleu:2,Gris:2,Noir:2},possession:'Bleu'})})],
    ['Bleu 3 périodes, 5-0-0 hors duel', R({n:20000,seed:25,state:st0({scores:{Bleu:5,Gris:0,Noir:0},periodWins:{Bleu:3,Gris:1,Noir:0},possession:'Gris'})})],
  ];
  console.log('\nÉtat | match B/G/N | période B/G/N');
  rows.forEach(([n,r])=>console.log(n+' | '+T3.map(t=>pct(r,'match',t).toFixed(1)).join('/')+' | '+T3.map(t=>pct(r,'period',t).toFixed(1)).join('/')+' | unfinished '+r.unfinished));
}
console.log(fails?`\n${fails} ÉCHEC(S)`:'\nTOUT PASSE');
process.exit(fails?1:0);
