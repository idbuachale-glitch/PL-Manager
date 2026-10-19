// A whole Premier League season: fixtures, results, table, fitness, injuries, suspensions, form.
// Pure data in, pure data out (the state object is plain JSON, so it can be saved as-is).

import { makeRng, hashString } from './rng.js';
import { pickLineup, bestFormation } from './lineup.js';
import { simulateMatch, createMatch } from './match.js';
import { chooseTactics, squadStrength, aiInMatch } from './ai.js';

export const SEASON = {
  recoveryPerWeek: 30,            // condition regained between gameweeks
  injuryWeeks: [1, 1, 1, 2, 2, 3, 4, 6],   // picked at random: mostly short
  yellowBans: { 5: 1, 10: 2, 15: 3 },
  straightRedBan: 3, secondYellowBan: 1,
  formWeight: 0.3,                // how fast form follows match ratings
  formationPreference: { '4-3-3': 0.4, '4-2-3-1': 0.4, '4-4-2': 0.1, '3-5-2': 0, '5-3-2': 0 },
};

export function createSeason({ players, clubs, fixtures, seed = 1, userClub = null, label = '2026/27' }) {
  const state = {
    label, seed, userClub, gw: 1,
    maxGw: Math.max(...fixtures.map((f) => f.gw)),
    players: {},
    clubs: {},
    fixtures: fixtures.map((f) => ({ id: f.id, gw: f.gw, kickoff: f.kickoff, home: f.home, away: f.away, result: null })),
  };
  for (const c of clubs) {
    state.clubs[c.code] = { code: c.code, short: c.short, name: c.name, playerIds: [], formation: null, tactics: null };
  }
  for (const p of players) {
    if (!state.clubs[p.teamCode]) continue;
    state.players[p.id] = {
      ...p,
      dyn: { condition: 100, form: 6.5, injuredFor: 0, suspendedFor: 0, seasonYellows: 0 },
      season: { apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, cleanSheets: 0, yellows: 0, reds: 0, ratingSum: 0, motm: 0 },
    };
    state.clubs[p.teamCode].playerIds.push(p.id);
  }
  for (const club of Object.values(state.clubs)) {
    club.formation = bestFormation(squadOf(state, club.code), { prefer: SEASON.formationPreference });
  }
  return state;
}

export const squadOf = (state, code) => state.clubs[code].playerIds.map((id) => state.players[id]);

// Line-up and tactics for an AI club in a given fixture.
export function aiSide(state, code, opponentCode, isHome, seed) {
  const squad = squadOf(state, code);
  const lineup = pickLineup(squad, state.clubs[code].formation);
  const tactics = chooseTactics(squadStrength(squad), squadStrength(squadOf(state, opponentCode)), isHome, seed);
  return { code, lineup, tactics };
}

export const fixtureSeed = (state, f) => hashString(`${state.seed}:${state.label}:${f.id}`);

// Live match for a fixture (the match screen drives it); AI sides get their in-match brain via aiStep.
export function startFixture(state, f, { userSide = null } = {}) {
  const seed = fixtureSeed(state, f);
  const home = f.home === state.userClub && userSide ? { code: f.home, ...userSide } : aiSide(state, f.home, f.away, true, seed + 1);
  const away = f.away === state.userClub && userSide ? { code: f.away, ...userSide } : aiSide(state, f.away, f.home, false, seed + 2);
  const m = createMatch({ home, away, seed });
  const starts = { home: { ...home.tactics }, away: { ...away.tactics } };
  const aiKeys = ['home', 'away'].filter((k) => !(userSide && (k === 'home' ? f.home : f.away) === state.userClub));
  return { match: m, aiStep: () => { for (const k of aiKeys) aiInMatch(m, k, starts[k]); } };
}

export function playFixture(state, f, opts = {}) {
  const { match, aiStep } = startFixture(state, f, opts);
  while (!match.finished) { match.step(); aiStep(); }
  const result = match.result();
  applyResult(state, f, result);
  return result;
}

export function applyResult(state, f, result) {
  const rng = makeRng(`${result.seed}:after`);
  f.result = {
    homeGoals: result.homeGoals, awayGoals: result.awayGoals, stats: result.stats,
    scorers: result.events.filter((e) => e.type === 'goal').map((e) => ({ team: e.team, player: e.player, minute: e.minute, assist: e.assist, kind: e.kind })),
    motm: result.motm,
  };
  for (const r of result.players) {
    const p = state.players[r.id];
    if (!p) continue;
    const s = p.season, d = p.dyn;
    s.apps++; s.minutes += r.minutes; s.goals += r.goals; s.assists += r.assists;
    if (r.minutes >= 45) s.starts++;
    if (r.cleanSheet) s.cleanSheets++;
    s.yellows += r.yellow; s.ratingSum += r.rating;
    if (result.motm === r.id) s.motm++;
    d.condition = r.condition;
    d.form = (1 - SEASON.formWeight) * d.form + SEASON.formWeight * r.rating;
    if (r.injured) d.injuredFor = rng.weighted(SEASON.injuryWeeks, () => 1);
    if (r.red) {
      s.reds++;
      d.suspendedFor += r.yellow >= 2 ? SEASON.secondYellowBan : SEASON.straightRedBan;
    } else if (r.yellow) {
      d.seasonYellows += r.yellow;
      const ban = SEASON.yellowBans[d.seasonYellows];
      if (ban) d.suspendedFor += ban;
    }
  }
}

// After a gameweek: recovery, injuries heal, bans served.
export function advanceWeek(state, playedCodes) {
  for (const p of Object.values(state.players)) {
    const d = p.dyn;
    d.condition = Math.min(100, d.condition + SEASON.recoveryPerWeek);
    if (d.injuredFor > 0) d.injuredFor--;
    if (d.suspendedFor > 0 && playedCodes.has(p.teamCode)) d.suspendedFor--;
  }
  state.gw++;
}

// Plays every unplayed fixture of the current gameweek (the user's too, unless skipUser).
export function playGameweek(state, { skipUser = false } = {}) {
  const results = [];
  const played = new Set();
  for (const f of state.fixtures.filter((x) => x.gw === state.gw && !x.result)) {
    if (skipUser && (f.home === state.userClub || f.away === state.userClub)) continue;
    results.push(playFixture(state, f));
    played.add(f.home); played.add(f.away);
  }
  if (!skipUser) advanceWeek(state, played);
  return results;
}

export function playSeason(state) {
  while (state.gw <= state.maxGw) playGameweek(state);
  return state;
}

export function table(state) {
  const rows = Object.fromEntries(Object.values(state.clubs).map((c) => [c.code, {
    code: c.code, short: c.short, name: c.name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [],
  }]));
  for (const f of state.fixtures) {
    if (!f.result) continue;
    const h = rows[f.home], a = rows[f.away], hg = f.result.homeGoals, ag = f.result.awayGoals;
    h.p++; a.p++; h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
    if (hg > ag) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L'); }
    else if (hg < ag) { a.w++; h.l++; a.pts += 3; h.form.push('L'); a.form.push('W'); }
    else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
  }
  return Object.values(rows)
    .map((r) => ({ ...r, gd: r.gf - r.ga, form: r.form.slice(-5) }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.short.localeCompare(y.short));
}

export function leaders(state, key, n = 10) {
  return Object.values(state.players)
    .filter((p) => p.season[key] > 0)
    .sort((a, b) => b.season[key] - a.season[key] || a.season.minutes - b.season.minutes)
    .slice(0, n);
}
