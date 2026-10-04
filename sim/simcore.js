/* ============================================================
   Kin-Ball Stats — moteur de simulation (C13-A)
   JavaScript pur, sans DOM, sans dépendance extérieure.
   Tout tient dans KBSimFactory() : KBSimFactory.toString() suffit
   à fabriquer un Web Worker. Voir README.md.
   ============================================================ */
function KBSimFactory(){
  'use strict';

  /* ---- Constantes (toutes documentées dans le README) ---- */
  var CONST = {
    WINDOW: 35,            // fenêtre glissante : 35 dernières actions offensives (cahier)
    FAULT_PRIOR: 0.05,     // prior de faute directe (cahier)
    PRIOR_WEIGHT: 6,       // poids du prior en lancers virtuels (cahier)
    DEFAULT_OFF: 0.35,     // % échappé par défaut si aucun lancer dans le match (choix de l'Orchestrator)
    PERIODS_TO_WIN: 4,     // périodes pour gagner le match (cahier ; non codé dans l'app)
    MAX_ACTIONS: 5000,     // plafond d'actions par simulation (garde-fou)
    TIE_TARGET: 'coin',    // égalité entre les deux adversaires : tirage à parts égales
    DUEL_RESTART: 'holder-else-coin', // reprise du duel : porteur après l'action s'il est en jeu, sinon tirage
    ORDER: ['Bleu', 'Gris', 'Noir']   // ordre canonique (celui de l'app pour les égalités)
  };

  /* ---- Générateur à graine : mulberry32 ---- */
  function mulberry32(seed){
    var a = seed >>> 0;
    return function(){
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function canon(teams){
    var out = [];
    for(var i = 0; i < CONST.ORDER.length; i++){
      if(teams.indexOf(CONST.ORDER[i]) >= 0) out.push(CONST.ORDER[i]);
    }
    return out;
  }
  function validFmt(fmt, teams){
    if(!fmt || !fmt.periodAt) return false;          // format libre : pas de simulation
    if(!teams || (teams.length !== 2 && teams.length !== 3)) return false;
    return true;
  }
  function ctxOf(fmt, n){
    return { n: n, elimAt: fmt.eliminationAt || 0, periodAt: fmt.periodAt, fmtTeams: fmt.teams, anomalies: 0 };
  }

  /* ---- Un pas de règles (miroir de awardFaultPoints / checkPeriodState / finishPeriod) ----
     État interne : {sc:[pointages], pw:[périodes], el:index éliminé ou -1, duel:bool, ps:index porteur, lw:dernier gagnant}
     kind : 0 = faute directe de A ; 1 = lancer A -> T échappé ; 2 = lancer A -> T attrapé.
     Retour : 0 rien, 1 élimination, 2 fin de période (st.lw = gagnante). */
  function step(st, c, A, kind, T, rand){
    var sc = st.sc, n = c.n, i;
    if(kind === 2){ st.ps = T; return 0; }
    if(kind === 0){
      for(i = 0; i < n; i++) if(i !== A && i !== st.el) sc[i]++;
    } else {
      for(i = 0; i < n; i++) if(i !== T && i !== st.el) sc[i]++;
      st.ps = T;
    }
    var mx = sc[0];
    for(i = 1; i < n; i++) if(sc[i] > mx) mx = sc[i];
    // (a) élimination : trois équipes, hors duel, format qui la prévoit
    if(!st.duel && c.elimAt && n > 2 && mx >= c.elimAt){
      var lo = sc[0];
      for(i = 1; i < n; i++) if(sc[i] < lo) lo = sc[i];
      var first = -1, cnt = 0;
      for(i = 0; i < n; i++) if(sc[i] === lo){ cnt++; if(first < 0) first = i; }
      if(cnt > 1) c.anomalies++;                     // « impossible » selon l'utilisateur
      st.el = first; st.duel = true;
      if(st.ps === st.el){                           // le porteur est l'éliminé : tirage entre les deux restantes
        var rest = [];
        for(i = 0; i < n; i++) if(i !== st.el) rest.push(i);
        st.ps = rest[rand() < 0.5 ? 0 : 1];
      }
      return 1;
    }
    // (b) fin de période sur seuil
    if(mx >= c.periodAt){
      var w = -1;
      for(i = 0; i < n; i++) if(i !== st.el && sc[i] >= c.periodAt){ w = i; break; }
      if(w < 0) return 0;
      st.pw[w]++;
      for(i = 0; i < n; i++) sc[i] = 0;
      if(st.el >= 0) st.ps = st.el;
      else { st.ps = (w === 0 ? 1 : 0); }
      st.el = -1;
      st.duel = (c.fmtTeams === 2);
      st.lw = w;
      return 2;
    }
    return 0;
  }

  /* ---- Simulation ---- */
  function run(o){
    o = o || {};
    var teams = o.teams, fmt = o.fmt;
    if(!validFmt(fmt, teams)) return null;
    var T = canon(teams), n = T.length;
    if(n !== teams.length) return null;
    var n_sims = o.n === undefined ? 1000 : (o.n | 0);
    var ptw = o.periodsToWin || CONST.PERIODS_TO_WIN;
    var seed = o.seed === undefined ? 1 : o.seed;
    var rand = mulberry32(seed);
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    var s0 = o.state || {};
    var sc0 = [], pw0 = [], i, j;
    for(i = 0; i < n; i++){
      sc0.push(((s0.scores || {})[T[i]]) | 0);
      pw0.push(((s0.periodWins || {})[T[i]]) | 0);
    }
    var el0 = s0.eliminated ? T.indexOf(s0.eliminated) : -1;
    var duel0 = !!s0.duelActive || el0 >= 0;
    var ps0 = s0.possession ? T.indexOf(s0.possession) : -1;
    if(ps0 === el0 && el0 >= 0) ps0 = -1;

    var res = { n: n_sims, match: {}, period: {}, unfinished: 0, anomalies: 0, ms: 0 };
    for(i = 0; i < n; i++){ res.match[T[i]] = 0; res.period[T[i]] = 0; }

    // Une équipe a déjà gagné le match : 100 % pour elle, sans simuler.
    for(i = 0; i < n; i++){
      if(pw0[i] >= ptw){
        res.match[T[i]] = n_sims; res.period[T[i]] = n_sims;
        res.ms = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0;
        return res;
      }
    }

    // Paramètres en tableaux
    var P = o.params || {};
    var fault = [], h2h = [];
    for(i = 0; i < n; i++){
      fault.push(P.fault && P.fault[T[i]] !== undefined ? P.fault[T[i]] : CONST.FAULT_PRIOR);
      var row = [];
      for(j = 0; j < n; j++){
        var v = (P.h2h && P.h2h[T[i]] && P.h2h[T[i]][T[j]] !== undefined) ? P.h2h[T[i]][T[j]] : CONST.DEFAULT_OFF;
        row.push(v);
      }
      h2h.push(row);
    }

    var c = ctxOf(fmt, n);
    var maxA = CONST.MAX_ACTIONS;
    var st = { sc: new Array(n), pw: new Array(n), el: -1, duel: false, ps: -1, lw: -1 };

    for(var s = 0; s < n_sims; s++){
      for(i = 0; i < n; i++){ st.sc[i] = sc0[i]; st.pw[i] = pw0[i]; }
      st.el = el0; st.duel = duel0; st.lw = -1;
      st.ps = ps0;
      if(st.ps < 0){                                 // possession inconnue : tirage parmi les équipes en jeu
        var pool = [];
        for(i = 0; i < n; i++) if(i !== st.el) pool.push(i);
        st.ps = pool[Math.floor(rand() * pool.length)];
      }
      var periodW = -1, matchW = -1, acts = 0;
      while(acts < maxA){
        acts++;
        var A = st.ps, kind, tgt = -1;
        if(rand() < fault[A]){ kind = 0; }
        else {
          // cible : parmi les autres équipes en jeu, celle au plus haut pointage ; égalité = tirage
          var best = -1, bv = -1, tie = false;
          for(i = 0; i < n; i++){
            if(i === A || i === st.el) continue;
            if(st.sc[i] > bv){ bv = st.sc[i]; best = i; tie = false; }
            else if(st.sc[i] === bv){ tie = true; if(rand() < 0.5) best = i; }
          }
          tgt = best;
          kind = (rand() < h2h[A][tgt]) ? 1 : 2;
        }
        var r = step(st, c, A, kind, tgt, rand);
        if(r === 2){
          if(periodW < 0) periodW = st.lw;
          if(st.pw[st.lw] >= ptw){ matchW = st.lw; break; }
        }
      }
      if(matchW < 0){ res.unfinished++; continue; }
      res.match[T[matchW]]++;
      res.period[T[periodW]]++;
    }
    res.anomalies = c.anomalies;
    res.ms = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0;
    return res;
  }

  /* ---- Pas de règles pour une action réelle ---- */
  function apply(state, fmt, teams, action){
    if(!validFmt(fmt, teams) || !action || !state) return null;
    var T = canon(teams), n = T.length, i;
    if(n !== teams.length) return null;
    var sc = [], pw = [];
    for(i = 0; i < n; i++){
      sc.push((state.scores || {})[T[i]] | 0);
      pw.push((state.periodWins || {})[T[i]] | 0);
    }
    var el = state.eliminated ? T.indexOf(state.eliminated) : -1;
    var st = { sc: sc, pw: pw, el: el, duel: !!state.duelActive || el >= 0, ps: state.possession ? T.indexOf(state.possession) : -1, lw: -1 };
    var A, tgt = -1, kind;
    if(action.type === 'faute'){
      A = T.indexOf(action.team); kind = 0;
    } else if(action.type === 'lancer'){
      A = T.indexOf(action.attacker); tgt = T.indexOf(action.target);
      kind = action.caught ? 2 : 1;
      if(tgt < 0 || tgt === A || tgt === el) return null;
    } else return null;
    if(A < 0 || A === el) return null;
    st.ps = A;
    var c = ctxOf(fmt, n);
    // Tirage de reprise du duel : déterministe dans apply (première équipe restante) ;
    // l'appelant peut imposer le choix de l'utilisateur via action.restart.
    var rand = function(){ return 0; };
    var r = step(st, c, A, kind, tgt, rand);
    if(r === 1 && action.restart){
      var rs = T.indexOf(action.restart);
      if(rs >= 0 && rs !== st.el) st.ps = rs;
    }
    var out = { scores: {}, periodWins: {}, eliminated: st.el >= 0 ? T[st.el] : null, duelActive: st.duel, possession: T[st.ps] };
    var k;
    for(k in (state.scores || {})) out.scores[k] = state.scores[k];
    for(k in (state.periodWins || {})) out.periodWins[k] = state.periodWins[k];
    for(i = 0; i < n; i++){ out.scores[T[i]] = st.sc[i]; out.periodWins[T[i]] = st.pw[i]; }
    Object.defineProperty(out, 'info', { enumerable: false, value: {
      elimination: r === 1, periodFinished: r === 2,
      periodWinner: r === 2 ? T[st.lw] : null,
      anomalies: c.anomalies
    }});
    return out;
  }

  /* ---- Paramètres à partir de l'historique ---- */
  function params(history, teams){
    var T = canon(teams || []);
    var W = CONST.WINDOW, PW = CONST.PRIOR_WEIGHT;
    var acts = {}, pair = {}, counts = {}, i, j;
    for(i = 0; i < T.length; i++){
      acts[T[i]] = [];                                // codes : 0 attrapé, 1 échappé, 2 faute
      pair[T[i]] = {};
      for(j = 0; j < T.length; j++) if(i !== j) pair[T[i]][T[j]] = { throws: 0, escaped: 0 };
    }
    var totThrows = 0, totEsc = 0;
    var h = history || [];
    for(var k = 0; k < h.length; k++){
      var ev = h[k];
      if(!ev) continue;
      var d = ev.details || {};
      if(ev.type === 'lancer'){
        var a = d.attacker;
        if(!acts[a]) continue;
        var esc;
        if(d.result === 'échappé') esc = 1; else if(d.result === 'attrapé') esc = 0; else continue;
        acts[a].push(esc);
        totThrows++; totEsc += esc;
        if(pair[a][d.target]){ pair[a][d.target].throws++; pair[a][d.target].escaped += esc; }
      } else if(ev.type === 'faute_directe'){
        var f = ev.before && ev.before.possession;
        if(acts[f]) acts[f].push(2);
      }
    }
    var pool = totThrows > 0 ? totEsc / totThrows : CONST.DEFAULT_OFF;
    var out = { h2h: {}, fault: {}, overall: {}, confidence: {}, counts: {} };
    for(i = 0; i < T.length; i++){
      var t = T[i], list = acts[t], tail = list.slice(Math.max(0, list.length - W));
      var wF = 0, wT = 0, wE = 0, aF = 0, aT = 0, aE = 0, q;
      for(q = 0; q < tail.length; q++){ if(tail[q] === 2) wF++; else { wT++; wE += tail[q]; } }
      for(q = 0; q < list.length; q++){ if(list[q] === 2) aF++; else { aT++; aE += list[q]; } }
      out.fault[t] = (wF + CONST.FAULT_PRIOR * PW) / (tail.length + PW);
      out.overall[t] = (wE + pool * PW) / (wT + PW);
      out.confidence[t] = Math.min(1, tail.length / W);
      out.h2h[t] = {};
      var pc = {};
      for(j = 0; j < T.length; j++){
        if(i === j) continue;
        var p = pair[t][T[j]];
        out.h2h[t][T[j]] = (p.escaped + out.overall[t] * PW) / (p.throws + PW);
        pc[T[j]] = { throws: p.throws, escaped: p.escaped };
      }
      out.counts[t] = {
        actions: list.length, faults: aF, throws: aT, escaped: aE,
        window: { actions: tail.length, faults: wF, throws: wT, escaped: wE },
        pairs: pc
      };
    }
    return out;
  }

  return { params: params, run: run, apply: apply, CONST: CONST };
}
if(typeof module !== 'undefined') module.exports = KBSimFactory;
