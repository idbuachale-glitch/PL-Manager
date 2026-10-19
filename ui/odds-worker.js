// Plays the next fixture many times with the given line-ups and tactics and reports averages.
import { simulateMatch } from '../engine/match.js';

self.onmessage = (e) => {
  const { id, home, away, runs, userKey } = e.data;
  const t = { w: 0, d: 0, l: 0, gf: 0, ga: 0, sf: 0, sa: 0, xgf: 0, xga: 0, poss: 0, cond: 0 };
  const opp = userKey === 'home' ? 'away' : 'home';
  for (let i = 0; i < runs; i++) {
    const r = simulateMatch({ home, away, seed: 900_000 + i * 7919 });
    const us = userKey === 'home' ? r.homeGoals : r.awayGoals;
    const them = userKey === 'home' ? r.awayGoals : r.homeGoals;
    if (us > them) t.w++; else if (us === them) t.d++; else t.l++;
    t.gf += us; t.ga += them;
    t.sf += r.stats[userKey].shots; t.sa += r.stats[opp].shots;
    t.xgf += r.stats[userKey].xg; t.xga += r.stats[opp].xg;
    t.poss += r.stats[userKey].possession;
    const full = r.players.filter((p) => p.team === userKey && p.minutes >= 89);
    t.cond += full.length ? full.reduce((s, p) => s + p.condition, 0) / full.length : 70;
  }
  const n = runs;
  self.postMessage({
    id,
    win: t.w / n, draw: t.d / n, loss: t.l / n,
    goalsFor: t.gf / n, goalsAgainst: t.ga / n, shotsFor: t.sf / n, shotsAgainst: t.sa / n,
    xgFor: t.xgf / n, xgAgainst: t.xga / n, possession: t.poss / n, condition: t.cond / n,
  });
};
