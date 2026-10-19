// Game data, the current save, and the actions screens call.

import { createSeason, playFixture, playGameweek, advanceWeek, table, squadOf } from '../engine/season.js';
export { squadOf };
import { pickLineup } from '../engine/lineup.js';
import { PRESETS } from '../engine/tactics.js';
import { makeNews } from './lib/news.js';

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
