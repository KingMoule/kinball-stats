/* Modèle indépendant des règles de pointage, écrit ici et non extrait de
   l'app. Règles (cahier des charges) : une faute directe OU un ballon
   échappé donne 1 point à chaque AUTRE équipe en jeu ; à 3 équipes, la plus
   basse est éliminée quand une équipe atteint le seuil d'élimination
   (duel ensuite) ; la période est gagnée au second seuil ; remise à zéro. */
import { TEAMS, rng, diff } from './lib.mjs';

export const FMT = {
  '9_11':  { teams: 3, elimAt: 9,  periodAt: 11 },
  '11_13': { teams: 3, elimAt: 11, periodAt: 13 },
  'duel11': { teams: 2, elimAt: null, periodAt: 11 },
  'duel13': { teams: 2, elimAt: null, periodAt: 13 },
};

export class Model {
  constructor(format, excluded = 'Noir') {
    this.f = FMT[format];
    this.teams = this.f.teams === 2 ? TEAMS.filter(t => t !== excluded) : TEAMS.slice();
    this.scores = { Bleu: 0, Gris: 0, Noir: 0 };
    this.wins = { Bleu: 0, Gris: 0, Noir: 0 };
    this.period = 1; this.elim = null; this.duel = this.f.teams === 2;
    this.awaitingDuel = false; this.possession = null;
    this.events = 0;               // actions validées (lancer, faute, reprise)
    this.stack = [];
    this.log = { eliminations: 0, periodEnds: 0, reprises: 0, lancers: 0, fautes: 0, echappes: 0 };
  }
  snap() { return JSON.stringify([this.scores, this.wins, this.period, this.elim, this.duel, this.awaitingDuel, this.possession, this.events]); }
  _restore(s) { [this.scores, this.wins, this.period, this.elim, this.duel, this.awaitingDuel, this.possession, this.events] = JSON.parse(s); }
  inPlay() { return this.teams.filter(t => t !== this.elim); }
  /* Retourne 'elim' | 'periode' | null. */
  _faultBy(team) {
    this.inPlay().forEach(t => { if (t !== team) this.scores[t] += 1; });
    const max = Math.max(...this.teams.map(t => this.scores[t]));
    if (!this.duel && this.f.elimAt && this.teams.length > 2 && max >= this.f.elimAt) {
      const low = Math.min(...this.teams.map(t => this.scores[t]));
      const lows = this.teams.filter(t => this.scores[t] === low);
      if (lows.length !== 1) throw new Error('MODÈLE : égalité au plus bas à l’élimination ' + JSON.stringify(this.scores));
      this.elim = lows[0]; this.duel = true; this.awaitingDuel = true;
      this.log.eliminations++;
      return 'elim';
    }
    if (this.f.periodAt && max >= this.f.periodAt) {
      const w = this.inPlay().find(t => this.scores[t] >= this.f.periodAt);
      if (w) {
        this.wins[w] += 1; this.period += 1;
        this.scores = { Bleu: 0, Gris: 0, Noir: 0 };
        if (this.elim) this.possession = this.elim;
        else this.possession = this.teams.find(t => t !== w);
        this.elim = null; this.duel = this.f.teams === 2; this.awaitingDuel = false;
        this.log.periodEnds++;
        return 'periode';
      }
    }
    return null;
  }
  initial(team) { this.possession = team; }
  lancer(target, caught) {
    this.stack.push(this.snap());
    const atk = this.possession; this.events++; this.log.lancers++;
    if (!caught) {
      this.log.echappes++;
      const r = this._faultBy(target);
      if (r === 'periode') return r;      // la possession est fixée par la fin de période
      if (r === 'elim') return r;         // possession fixée au choix du duel
    }
    this.possession = target;
    void atk;
  }
  faute() {
    this.stack.push(this.snap());
    this.events++; this.log.fautes++;
    return this._faultBy(this.possession);
  }
  reprise(team) { this.stack.push(this.snap()); this.events++; this.log.reprises++; this.possession = team; }
  duelStart(team) { this.possession = team; this.awaitingDuel = false; }
  undo() { this._restore(this.stack.pop()); }
  expected() {
    return { scores: this.scores, periodWins: this.wins, period: this.period, eliminated: this.elim,
             duelActive: this.duel, awaitingDuelStart: this.awaitingDuel,
             possession: this.awaitingDuel ? undefined : this.possession, history: this.events };
  }
}

/* Compare l'état réel de l'app au modèle ; renvoie null ou un message. */
export function compare(S, m) {
  const e = m.expected();
  const a = { scores: S.scores, periodWins: S.periodWins, period: S.period, eliminated: S.eliminated,
              duelActive: S.duelActive, awaitingDuelStart: S.awaitingDuelStart, possession: S.possession,
              history: S.history.length };
  if (e.possession === undefined) { delete e.possession; delete a.possession; }
  const d = diff(a, e);
  return d && d.replace(': ', ' (app ≠ modèle) : ');
}

/* Choix d'une action légale (graine fixe), coordonnées et choix de duel
   compris : l'action est rejouable à l'identique. Les lancers visent une
   équipe en jeu autre que celle au ballon. */
const CODES = ['APPEL', 'M1C', 'EXT', 'PENTE', 'TROP COURT', 'DÉPL ILL', 'TROP TEMPS', 'OFF ILL'];
function pt(r) { return [0.1 + r() * 0.8, 0.1 + r() * 0.8]; }
export function pickAction(m, r) {
  const x = r();
  const others = m.inPlay().filter(t => t !== m.possession);
  const duel = Math.floor(r() * 2);          // indice du candidat au duel
  if (x < 0.07) return { t: 'reprise', team: m.inPlay()[Math.floor(r() * m.inPlay().length)], at: pt(r), duel };
  if (x < 0.30) return { t: 'faute', code: CODES[Math.floor(r() * 8)], at: pt(r), duel };
  const target = others[Math.floor(r() * others.length)];
  let from, to;
  do { from = pt(r); to = pt(r); } while (Math.hypot((to[0] - from[0]) * 600, (to[1] - from[1]) * 600) < 60);
  return { t: 'lancer', target, caught: r() < 0.6, from, to, duel };
}

/* Joue l'action sur l'app ET sur le modèle. opts.manualDuel : ne pas choisir
   le duel (l'appelant le fait). Retourne la résolution du modèle. */
export async function play(app, m, a, opts = {}) {
  let res;
  /* Avec alignements injectés : feuille « qui a lancé / fait la faute ? » —
     joueur 1 de l'équipe au ballon, « ? » ou, pour EXT, faute d'équipe. */
  let player = opts.player;
  if (opts.rosters) player = a.duel === 0 ? m.possession + '_p1' : (a.t === 'faute' && a.code === 'EXT' ? '__equipe__' : '');
  if (a.t === 'lancer') {
    await app.lancer({ from: a.from, to: a.to, target: a.target, caught: a.caught, player });
    res = m.lancer(a.target, a.caught);
  } else if (a.t === 'faute') {
    await app.faute({ at: a.at, code: a.code, player });
    res = m.faute();
  } else {
    await app.reprise({ at: a.at, team: a.team });
    m.reprise(a.team);
  }
  if (m.awaitingDuel && !opts.manualDuel) await playDuel(app, m, a);
  return res;
}
export async function playDuel(app, m, a) {
  const c = m.inPlay();
  const team = c[a.duel % c.length];
  await app.duelStart(team); m.duelStart(team);
  return team;
}
