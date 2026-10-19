// Downloads current squads, fixtures and last season's stats, and saves them as bundled JSON in /data.
// Run with: node scripts/fetch-data.mjs   (Node 20+, needs internet: runs in GitHub Actions)
//
// Sources:
//   - Official Fantasy Premier League API: squads, prices, positions, birth dates, fixtures,
//     and each player's last-season totals ("history_past").
//   - vaastav/Fantasy-Premier-League (MIT licence): last-season players_raw.csv, used to fill
//     any stat missing from history_past, and as a backup if a player request fails.

import { writeFile, mkdir } from 'node:fs/promises';

const FPL = 'https://fantasy.premierleague.com/api';
const LAST_SEASON = '2025/26';
const VAASTAV_CSV = 'https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2025-26/players_raw.csv';
const HEADERS = { 'User-Agent': 'pl-manager-data-fetch (GitHub Actions)' };
const POS = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };   // element_type 5 (managers) is skipped
const STAT_KEYS = [
  'minutes', 'starts', 'goals_scored', 'assists', 'clean_sheets', 'goals_conceded', 'saves',
  'penalties_saved', 'expected_goals', 'expected_assists', 'expected_goals_conceded',
  'creativity', 'threat', 'influence', 'defensive_contribution', 'tackles',
  'clearances_blocks_interceptions', 'recoveries', 'yellow_cards', 'red_cards', 'total_points',
];
const DATA = new URL('../data/', import.meta.url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (i === tries) throw new Error(`${url}: ${e.message}`);
      await sleep(1000 * i);
    }
  }
}

// Small CSV parser (handles quoted fields with commas).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const pickStats = (src) => {
  const out = {};
  for (const k of STAT_KEYS) {
    const v = src?.[k];
    out[k] = v === undefined || v === null || v === '' ? null : Number(v);
  }
  return out;
};

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}

console.log('Fetching FPL bootstrap-static…');
const boot = await getJson(`${FPL}/bootstrap-static/`);
const fixturesRaw = await getJson(`${FPL}/fixtures/`);

let vaastav = new Map();
try {
  const res = await fetch(VAASTAV_CSV, { headers: HEADERS });
  if (res.ok) {
    vaastav = new Map(parseCsv(await res.text()).map((r) => [Number(r.code), r]));
    console.log(`vaastav ${LAST_SEASON}: ${vaastav.size} players`);
  } else console.warn(`vaastav CSV not available (HTTP ${res.status}); using FPL only`);
} catch (e) { console.warn('vaastav CSV failed:', e.message); }

const teamById = new Map(boot.teams.map((t) => [t.id, t]));
const elements = boot.elements.filter((e) => POS[e.element_type]);
console.log(`Fetching last-season history for ${elements.length} players…`);

let failed = 0;
const players = await mapLimit(elements, 6, async (e, i) => {
  let hist = null;
  try {
    const summary = await getJson(`${FPL}/element-summary/${e.id}/`);
    hist = summary?.history_past?.find((h) => h.season_name === LAST_SEASON) ?? null;
  } catch { failed++; }
  const csvRow = vaastav.get(e.code);
  let last = hist ? pickStats(hist) : null;
  if (last && csvRow) {                              // fill gaps from vaastav
    const extra = pickStats(csvRow);
    for (const k of STAT_KEYS) if (last[k] === null && extra[k] !== null) last[k] = extra[k];
  } else if (!last && csvRow && Number(csvRow.minutes) > 0) {
    last = pickStats(csvRow);                        // backup if FPL had nothing
  }
  if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${elements.length}`);
  const team = teamById.get(e.team);
  return {
    id: e.id,
    code: e.code,
    name: `${e.first_name} ${e.second_name}`.trim(),
    webName: e.web_name,
    teamCode: team.code,
    teamShort: team.short_name,
    pos: POS[e.element_type],
    price: e.now_cost / 10,
    birthDate: e.birth_date ?? null,
    status: e.status,
    last,
  };
});

const teams = boot.teams.map((t) => ({
  id: t.id, code: t.code, name: t.name, short: t.short_name,
  strength: t.strength,
  strengthAttackHome: t.strength_attack_home, strengthAttackAway: t.strength_attack_away,
  strengthDefenceHome: t.strength_defence_home, strengthDefenceAway: t.strength_defence_away,
  strengthOverallHome: t.strength_overall_home, strengthOverallAway: t.strength_overall_away,
}));

const fixtures = fixturesRaw
  .filter((f) => f.event)
  .map((f) => ({
    id: f.id, gw: f.event, kickoff: f.kickoff_time,
    home: teamById.get(f.team_h).code, away: teamById.get(f.team_a).code,
  }))
  .sort((a, b) => a.gw - b.gw || String(a.kickoff).localeCompare(String(b.kickoff)));

await mkdir(DATA, { recursive: true });
await writeFile(new URL('players-raw.json', DATA), JSON.stringify(players));
await writeFile(new URL('teams.json', DATA), JSON.stringify(teams, null, 2));
await writeFile(new URL('fixtures.json', DATA), JSON.stringify(fixtures));
await writeFile(new URL('meta.json', DATA), JSON.stringify({
  fetchedAt: new Date().toISOString(), lastSeason: LAST_SEASON,
  players: players.length, withLastSeason: players.filter((p) => p.last).length,
  withBirthDate: players.filter((p) => p.birthDate).length, fixtures: fixtures.length,
  credits: ['Fantasy Premier League', 'vaastav/Fantasy-Premier-League (MIT)'],
}, null, 2));

console.log(`Saved ${players.length} players (${players.filter((p) => p.last).length} with ${LAST_SEASON} stats), `
  + `${teams.length} teams, ${fixtures.length} fixtures. Failed player requests: ${failed}.`);
