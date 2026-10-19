// Simulates whole seasons in the console.
//   node scripts/sim-season.mjs            -> one season: final table and top scorers
//   node scripts/sim-season.mjs 50         -> 50 seasons: averages (goals per game, home wins, ...)

import { readFileSync } from 'node:fs';
import { createSeason, playSeason, table, leaders } from '../engine/season.js';

const DATA = new URL('../data/', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, DATA), 'utf8'));
export const players = load('players.json');
export const clubs = load('clubs.json').clubs.map((c) => ({ code: c.fplCode, short: c.short, name: c.name }));
export const fixtures = load('fixtures.json');

export function runSeason(seed) {
  return playSeason(createSeason({ players, clubs, fixtures, seed }));
}

export function seasonSummary(state) {
  let goals = 0, games = 0, home = 0, draw = 0, away = 0;
  for (const f of state.fixtures) {
    if (!f.result) continue;
    const { homeGoals: h, awayGoals: a } = f.result;
    goals += h + a; games++;
    if (h > a) home++; else if (h === a) draw++; else away++;
  }
  return { goals, games, home, draw, away, table: table(state), scorers: leaders(state, 'goals', 10) };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const n = Number(process.argv[2] || 1);
  const pad = (s, w) => String(s).padEnd(w);
  if (n === 1) {
    const t0 = Date.now();
    const s = runSeason(Number(process.argv[3] || 2026));
    const sum = seasonSummary(s);
    console.log(`Simulated season in ${Date.now() - t0} ms. ${(sum.goals / sum.games).toFixed(2)} goals per game. `
      + `Home wins ${(100 * sum.home / sum.games).toFixed(0)}%, draws ${(100 * sum.draw / sum.games).toFixed(0)}%, away wins ${(100 * sum.away / sum.games).toFixed(0)}%.\n`);
    console.log(' #  Club  P   W   D   L   GF  GA  GD   Pts');
    sum.table.forEach((r, i) => console.log(`${pad(i + 1, 3)}${pad(r.short, 6)}${pad(r.p, 4)}${pad(r.w, 4)}${pad(r.d, 4)}${pad(r.l, 4)}${pad(r.gf, 4)}${pad(r.ga, 4)}${pad((r.gd > 0 ? '+' : '') + r.gd, 5)}${r.pts}`));
    console.log('\nTop scorers');
    sum.scorers.forEach((p, i) => console.log(`${pad(i + 1, 3)}${pad(p.webName, 18)}${pad(p.teamShort, 5)}${p.season.goals} goals, ${p.season.assists} assists`));
    const a = leaders(s, 'assists', 5);
    console.log('\nTop assists');
    a.forEach((p, i) => console.log(`${pad(i + 1, 3)}${pad(p.webName, 18)}${pad(p.teamShort, 5)}${p.season.assists}`));
  } else {
    const pos = {}; let goals = 0, games = 0, home = 0, draw = 0, away = 0;
    const topScorer = [], champPts = [], relPts = [];
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      const sum = seasonSummary(runSeason(1000 + i));
      goals += sum.goals; games += sum.games; home += sum.home; draw += sum.draw; away += sum.away;
      sum.table.forEach((r, j) => { (pos[r.short] ??= []).push(j + 1); });
      topScorer.push(sum.scorers[0]?.season.goals ?? 0);
      champPts.push(sum.table[0].pts); relPts.push(sum.table[17].pts);
    }
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    console.log(`${n} seasons in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    console.log(`Goals per game ${(goals / games).toFixed(2)} | home ${(100 * home / games).toFixed(1)}% draw ${(100 * draw / games).toFixed(1)}% away ${(100 * away / games).toFixed(1)}%`);
    console.log(`Champions avg ${avg(champPts).toFixed(0)} pts | 18th place avg ${avg(relPts).toFixed(0)} pts | top scorer avg ${avg(topScorer).toFixed(1)} goals (range ${Math.min(...topScorer)}-${Math.max(...topScorer)})`);
    console.log('\nAverage finishing position (best, worst):');
    Object.entries(pos).sort((a, b) => avg(a[1]) - avg(b[1]))
      .forEach(([k, v]) => console.log(`${pad(k, 5)} ${avg(v).toFixed(1).padStart(4)}  (${Math.min(...v)}-${Math.max(...v)})  titles ${v.filter((x) => x === 1).length}`));
  }
}
