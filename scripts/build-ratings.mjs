// Builds FM-style 1–20 ratings from data/players-raw.json and writes data/players.json.
// Also writes data/rating-sample.md: 30 well-known players (the most expensive in FPL) to sanity-check.
// Run with: node scripts/build-ratings.mjs   (no internet needed)

import { readFile, writeFile } from 'node:fs/promises';
import { buildRatings } from '../engine/ratings.js';

const DATA = new URL('../data/', import.meta.url);
const SEASON_START = '2026-08-21';       // ages are worked out on the first day of the season
const SAMPLE = { GK: 5, DEF: 8, MID: 10, FWD: 7 };

const raw = JSON.parse(await readFile(new URL('players-raw.json', DATA), 'utf8'));
const teams = JSON.parse(await readFile(new URL('teams.json', DATA), 'utf8'));
const players = buildRatings(raw, { referenceDate: SEASON_START, teams });
await writeFile(new URL('players.json', DATA), JSON.stringify(players));

const sample = Object.entries(SAMPLE).flatMap(([pos, n]) =>
  players.filter((p) => p.pos === pos).sort((a, b) => b.price - a.price || b.overallExact - a.overallExact).slice(0, n));

const rows = sample.map((p) => {
  const a = p.attrs;
  const first = p.pos === 'GK' ? `GK ${a.goalkeeping}` : `${a.attack}`;
  const flag = p.estimated.includes('all') ? ' *' : '';
  return `| ${p.webName}${flag} | ${p.teamShort} | ${p.pos} | ${p.age} | **${p.overall}** | ${first} | ${a.passing} | ${a.defending} | ${a.pace} | ${a.stamina} | ${p.minutesLastSeason} | £${p.value}m |`;
});

const md = [
  '# Rating check: 30 well-known players',
  '',
  'All ratings are out of 20, FM style. Atk = Attack (Goalkeeping for keepers), Pas = Passing, Def = Defending, Pac = Pace (estimated), Sta = Stamina.',
  '`*` = no Premier League stats last season, so rated from FPL price, position and age.',
  '',
  '| Player | Club | Pos | Age | Ovr | Atk | Pas | Def | Pac | Sta | Mins 25/26 | Value |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows,
  '',
  `Rated ${players.length} players. ${players.filter((p) => p.estimated.includes('all')).length} had no Premier League stats last season. `
    + `${players.filter((p) => p.estimated.includes('age')).length} had no birth date (age set to 26).`,
].join('\n');

await writeFile(new URL('rating-sample.md', DATA), md + '\n');
console.log(md);
