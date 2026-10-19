// Finds a working crest image URL for every club and saves it in data/clubs.json.
// Run with: node scripts/fetch-crests.mjs   (Node 18+, needs internet: run locally or in GitHub Actions)
//
// Order tried for each club:
//   1. FPL badge images, using the team's permanent `code` from bootstrap-static
//   2. TheSportsDB team search (strBadge field)
// A URL is only kept if it really returns an image. Only URLs are stored - no image files.

import { readFile, writeFile } from 'node:fs/promises';

const CLUBS_FILE = new URL('../data/clubs.json', import.meta.url);
const FPL_BOOTSTRAP = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const SPORTSDB_SEARCH = 'https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=';
const UA = { 'User-Agent': 'pl-manager-data-fetch (GitHub Actions)' };

// Candidate FPL badge patterns, newest first. The first one that returns an image wins.
const FPL_BADGE_PATTERNS = [
  (code) => `https://resources.premierleague.com/premierleague25/badges/${code}.svg`,
  (code) => `https://resources.premierleague.com/premierleague/badges/100/t${code}@x2.png`,
  (code) => `https://resources.premierleague.com/premierleague/badges/70/t${code}.png`,
];

// Names differ between sources ("Spurs" vs "Tottenham Hotspur"), so match loosely.
const norm = (s) => s.toLowerCase()
  .replace(/\b(fc|afc|city|town|united|utd|hotspur|and|&)\b/g, '')
  .replace(/[^a-z]/g, '');

async function isImage(url) {
  try {
    const res = await fetch(url, { headers: UA, redirect: 'follow' });
    const type = res.headers.get('content-type') || '';
    return {
      ok: res.ok && type.startsWith('image/'),
      // If the host allows cross-site use, crests can go on the shareable season image.
      corsOk: res.headers.get('access-control-allow-origin') === '*',
    };
  } catch {
    return { ok: false, corsOk: false };
  }
}

async function fplCodes() {
  try {
    const res = await fetch(FPL_BOOTSTRAP, { headers: UA });
    const data = await res.json();
    return data.teams.map((t) => ({ name: t.name, short: t.short_name, code: t.code }));
  } catch (e) {
    console.warn('Could not reach FPL, using codes already in clubs.json:', e.message);
    return [];
  }
}

async function sportsDbBadge(name) {
  try {
    const res = await fetch(SPORTSDB_SEARCH + encodeURIComponent(name), { headers: UA });
    const data = await res.json();
    const team = (data.teams || []).find((t) => t.strSport === 'Soccer' && norm(t.strTeam) === norm(name))
      || (data.teams || []).find((t) => t.strSport === 'Soccer');
    return team?.strBadge || null;
  } catch {
    return null;
  }
}

const file = JSON.parse(await readFile(CLUBS_FILE, 'utf8'));
const fplTeams = await fplCodes();
const report = [];

for (const club of file.clubs) {
  // Prefer FPL's live code over the hand-entered one.
  const live = fplTeams.find((t) => t.short === club.short || norm(t.name) === norm(club.name));
  if (live) club.fplCode = live.code;

  let found = null;
  if (club.fplCode != null) {
    for (const pattern of FPL_BADGE_PATTERNS) {
      const url = pattern(club.fplCode);
      const check = await isImage(url);
      if (check.ok) { found = { url, source: 'fpl', ...check }; break; }
    }
  }
  if (!found) {
    const url = await sportsDbBadge(club.name);
    if (url) {
      const check = await isImage(url);
      if (check.ok) found = { url, source: 'thesportsdb', ...check };
    }
  }

  club.crest = found ? found.url : null;
  club.crestCorsOk = found ? found.corsOk : false;
  report.push(`${club.short}  ${found ? found.source.padEnd(11) : 'MISSING    '} ${club.crest ?? '(fallback badge will be used)'}`);
}

await writeFile(CLUBS_FILE, JSON.stringify(file, null, 2) + '\n');
console.log(report.join('\n'));
const missing = file.clubs.filter((c) => !c.crest).length;
console.log(`\n${20 - missing}/20 crests found${missing ? `, ${missing} will use the fallback badge` : ''}.`);
