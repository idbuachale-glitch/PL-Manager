// Game data, the current save, and the actions screens call.

import { createSeason, playFixture, playGameweek, advanceWeek, table, squadOf } from '../engine/season.js';
export { squadOf };
import { pickLineup } from '../engine/lineup.js';
import { PRESETS } from '../engine/tactics.js';
import { makeNews } from './lib/news.js';
import { squadStrength } from '../engine/ai.js';

const SAVE_KEY = 'plm.save.1';
const listeners = new Set();

export const data = { players: [], clubs: [], fixtures: [], clubByCode: new Map() };
export let game = null;           // the season state (saved)
export const ui = { tab: 'home', sheet: null, squadSort: 'position', squadPick: null, leagueView: 'table', fixturesGw: null };

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const notify = () => { for (const fn of listeners) fn(); };

export async function loadData() {
  const get = (f) => fetch(new URL(`../data/${f}`, import.meta.url)).then((r) => r.json());
  const [players, clubs, fixtures] = await Promise.all([get('players.json'), get('clubs.json'), get('fixtures.json')]);
  data.players = players;
  data.clubs = clubs.clubs.map((c) => ({ code: c.fplCode, short: c.short, name: c.name, colours: c.colours, crest: c.crest }));
  data.fixtures = fixtures;
  data.clubByCode = new Map(data.clubs.map((c) => [c.code, c]));
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) game = JSON.parse(saved);
    if (game && !game.board) { game.board = makeBoard(game.userClub); game.welcomed = true; }
    if (game) syncSquads();
    // Bring hand-set positions from the latest data into older saves.
    if (game) for (const p of data.players) if (p.positions && game.players[p.id]) game.players[p.id].positions = p.positions;
  } catch { game = null; }
}

export const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch (e) { console.warn('Save failed', e); } };
export const club = (code) => data.clubByCode.get(code);

export function newGame(userClub, difficulty = 'normal') {
  game = createSeason({ players: data.players, clubs: data.clubs, fixtures: data.fixtures, seed: Date.now() % 1e9, userClub });
  game.difficulty = difficulty;
  game.user = { tactics: { ...PRESETS.Balanced }, lineup: null };
  game.news = makeNews(game, null);
  game.prevPositions = {};
  game.board = makeBoard(userClub);
  game.lastResult = null;
  autoPickUserXI();
  ui.tab = 'home';
  save(); notify();
}

export function quitToMenu() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
  game = null; ui.sheet = null; notify();
}

// ----- User's line-up -----
export const userSquad = () => squadOf(game, game.userClub);
export const userFormation = () => game.user.lineup?.formation ?? game.clubs[game.userClub].formation;

export function userLineup() {
  const formation = userFormation();
  const locked = (game.user.lineup?.ids ?? []).map((playerId, index) => ({ index, playerId })).filter((x) => x.playerId);
  return pickLineup(userSquad(), formation, { locked, rotation: 0 });
}

export function autoPickUserXI() {
  const lu = pickLineup(userSquad(), userFormation(), { rotation: 1 });
  game.user.lineup = { formation: lu.formation, ids: lu.slots.map((s) => s.player?.id ?? null) };
}

export function bestXI() { autoPickUserXI(); save(); notify(); }

// Put player into slot index (swapping if he was already in the XI).
export function placeInSlot(index, playerId) {
  const ids = [...(game.user.lineup?.ids ?? userLineup().slots.map((s) => s.player?.id ?? null))];
  const from = ids.indexOf(playerId);
  if (from >= 0) ids[from] = ids[index];
  ids[index] = playerId;
  game.user.lineup = { formation: userFormation(), ids };
  save(); notify();
}

// ----- Fixtures -----
export const userFixtures = () => game.fixtures.filter((f) => f.home === game.userClub || f.away === game.userClub);
export const nextUserFixture = () => userFixtures().find((f) => !f.result) ?? null;
export const seasonOver = () => game.gw > game.maxGw;

export function positions() {
  return Object.fromEntries(table(game).map((r, i) => [r.code, i + 1]));
}

// Plays the user's next match instantly and the rest of that gameweek (live match day comes in stage 5).
export function playNextMatch() {
  const f = nextUserFixture();
  if (!f) return null;
  game.prevPositions = positions();
  // Catch up any earlier gameweeks with no user fixture.
  while (game.gw < f.gw) playGameweek(game);
  const lu = userLineup();
  const result = playFixture(game, f, { userSide: { lineup: lu, tactics: game.user.tactics } });
  const others = playGameweek(game, { skipUser: true });
  const played = new Set(game.fixtures.filter((x) => x.gw === game.gw).flatMap((x) => [x.home, x.away]));
  advanceWeek(game, played);
  // Keep the saved XI but drop anyone now injured or banned (they get auto-replaced at kick-off).
  game.news = [...makeNews(game, { fixture: f, result, others }), ...game.news].slice(0, 30);
  updateBoard(f, result);
  game.lastResult = { fixture: f, result, others };
  save(); notify();
  return { fixture: f, result, others };
}

export function simRestOfSeason() {
  game.prevPositions = positions();
  while (!seasonOver()) {
    const f = nextUserFixture();
    if (f && f.gw === game.gw) playNextMatch();
    else { playGameweek(game); }
  }
  save(); notify();
}

// ----- Tactics -----
export function setTactics(t) { game.user.tactics = { ...game.user.tactics, ...t }; save(); notify(); }
export function setFormation(formation) {
  const lu = pickLineup(userSquad(), formation, { rotation: 1 });
  game.user.lineup = { formation, ids: lu.slots.map((s) => s.player?.id ?? null) };
  save(); notify();
}

// ----- Board -----
export const BOARD_GOALS = {
  title: { text: 'Win the league', target: 1 },
  top4: { text: 'Finish in the top four', target: 4 },
  europe: { text: 'Finish in the top seven', target: 7 },
  mid: { text: 'Finish in the top half', target: 10 },
  survive: { text: 'Avoid relegation', target: 17 },
};

function makeBoard(code) {
  const ranked = data.clubs.map((c) => [c.code, squadStrength(data.players.filter((p) => p.teamCode === c.code))])
    .sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const rank = ranked.indexOf(code) + 1;
  const goal = rank <= 2 ? 'title' : rank <= 5 ? 'top4' : rank <= 8 ? 'europe' : rank <= 13 ? 'mid' : 'survive';
  return { goal, rank, confidence: 65 };
}

function updateBoard(f, r) {
  const b = game.board;
  if (!b) return;
  const home = f.home === game.userClub;
  const us = home ? r.homeGoals : r.awayGoals, them = home ? r.awayGoals : r.homeGoals;
  const oppRank = (() => {
    const ranked = Object.keys(game.clubs).map((c) => [c, squadStrength(squadOf(game, Number(c)))]).sort((a, c) => c[1] - a[1]).map(([c]) => Number(c));
    return ranked.indexOf(home ? f.away : f.home) + 1;
  })();
  const favourite = b.rank < oppRank;
  let d = us > them ? (favourite ? 3 : 6) : us < them ? (favourite ? -6 : -3) : (favourite ? -1 : 2);
  const pos = positions()[game.userClub];
  const target = BOARD_GOALS[b.goal].target;
  if (game.gw > 6) d += pos <= target ? 1 : -1;
  b.confidence = Math.max(0, Math.min(100, b.confidence + d));
}

// Keep a save's squads in line with the latest real-world data: players who have left the
// Premier League are removed, new signings join their club, and moves between clubs follow.
function syncSquads() {
  const fresh = new Map(data.players.map((p) => [p.id, p]));
  let changed = false;
  for (const [id, p] of Object.entries(game.players)) {
    const f = fresh.get(Number(id));
    if (!f) {
      delete game.players[id];
      changed = true;
    } else if (f.teamCode !== p.teamCode) {
      p.teamCode = f.teamCode; p.teamShort = f.teamShort; changed = true;
    }
  }
  for (const f of data.players) {
    if (!game.players[f.id] && game.clubs[f.teamCode]) {
      game.players[f.id] = {
        ...f,
        dyn: { condition: 100, form: 6.5, injuredFor: 0, suspendedFor: 0, seasonYellows: 0 },
        season: { apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, cleanSheets: 0, yellows: 0, reds: 0, ratingSum: 0, motm: 0 },
      };
      changed = true;
    }
  }
  if (!changed) return;
  for (const c of Object.values(game.clubs)) c.playerIds = [];
  for (const p of Object.values(game.players)) game.clubs[p.teamCode]?.playerIds.push(p.id);
  if (game.user?.lineup) game.user.lineup.ids = game.user.lineup.ids.map((id) => (game.players[id] ? id : null));
  save();
}
