// Match engine and season tests.  Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickLineup, bestFormation } from '../engine/lineup.js';
import { simulateMatch } from '../engine/match.js';
import { PRESETS } from '../engine/tactics.js';
import { createSeason, playSeason, table, leaders } from '../engine/season.js';

const DATA = new URL('../data/', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, DATA), 'utf8'));
const players = load('players.json');
const clubs = load('clubs.json').clubs.map((c) => ({ code: c.fplCode, short: c.short, name: c.name }));
const fixtures = load('fixtures.json');

const squad = (short) => players.filter((p) => p.teamShort === short);
const side = (short, tactics = PRESETS.Balanced, formation) => {
  const sq = squad(short);
  return { code: short, lineup: pickLineup(sq, formation ?? bestFormation(sq)), tactics };
};

// Plays the same fixture many times and averages the numbers.
function many(home, away, n = 300) {
  const t = { hg: 0, ag: 0, hs: 0, as: 0, hxg: 0, axg: 0, hposs: 0, hCond: 0, hw: 0 };
  for (let i = 0; i < n; i++) {
    const r = simulateMatch({ home: home(), away: away(), seed: 10_000 + i });
    t.hg += r.homeGoals; t.ag += r.awayGoals;
    t.hs += r.stats.home.shots; t.as += r.stats.away.shots;
    t.hxg += r.stats.home.xg; t.axg += r.stats.away.xg;
    t.hposs += r.stats.home.possession;
    if (r.homeGoals > r.awayGoals) t.hw++;
    const hp = r.players.filter((p) => p.team === 'home' && p.minutes >= 89);
    t.hCond += hp.reduce((s, p) => s + p.condition, 0) / Math.max(1, hp.length);
  }
  for (const k of Object.keys(t)) t[k] /= n;
  return t;
}

test('same seed replays the same match', () => {
  const a = simulateMatch({ home: side('ARS'), away: side('LIV'), seed: 42 });
  const b = simulateMatch({ home: side('ARS'), away: side('LIV'), seed: 42 });
  assert.deepEqual(a.events, b.events);
  assert.equal(a.homeGoals, b.homeGoals);
});

test('seasons look like the Premier League', () => {
  let goals = 0, games = 0, home = 0, away = 0;
  const champs = [], topScorers = [], bigThreePos = [];
  const t0 = Date.now();
  for (let i = 0; i < 6; i++) {
    const s = playSeason(createSeason({ players, clubs, fixtures, seed: 77 + i }));
    for (const f of s.fixtures) {
      goals += f.result.homeGoals + f.result.awayGoals; games++;
      if (f.result.homeGoals > f.result.awayGoals) home++;
      if (f.result.homeGoals < f.result.awayGoals) away++;
    }
    const t = table(s);
    champs.push(t[0].pts);
    topScorers.push(leaders(s, 'goals', 1)[0].season.goals);
    for (const short of ['MCI', 'ARS', 'LIV']) bigThreePos.push(t.findIndex((r) => r.short === short) + 1);
  }
  const perSeasonMs = (Date.now() - t0) / 6;
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const gpg = goals / games;
  assert.ok(gpg > 2.4 && gpg < 3.0, `goals per game ${gpg.toFixed(2)}`);
  assert.ok(home / games > away / games + 0.05, 'home advantage');
  assert.ok(avg(champs) > 75 && avg(champs) < 98, `champions points ${avg(champs)}`);
  assert.ok(avg(topScorers) > 18 && avg(topScorers) < 38, `top scorer ${avg(topScorers)}`);
  assert.ok(avg(bigThreePos) < 5, `strongest squads finish near the top (avg ${avg(bigThreePos)})`);
  assert.ok(perSeasonMs < 5000, `a season simulates in a few seconds (${perSeasonMs.toFixed(0)} ms)`);
});

test('attacking mentality creates more chances for both sides', () => {
  const att = many(() => side('CHE', { ...PRESETS.Balanced, mentality: 90 }), () => side('BRE'));
  const def = many(() => side('CHE', { ...PRESETS.Balanced, mentality: 10 }), () => side('BRE'));
  assert.ok(att.hs > def.hs * 1.15, `own shots ${att.hs.toFixed(1)} vs ${def.hs.toFixed(1)}`);
  assert.ok(att.as > def.as * 1.05, `opponent shots ${att.as.toFixed(1)} vs ${def.as.toFixed(1)}`);
});

test('high pressing tires players and leaves space behind', () => {
  const press = many(() => side('CHE', { ...PRESETS.Balanced, pressing: 95 }), () => side('BRE', PRESETS['Counter attack']));
  const low = many(() => side('CHE', { ...PRESETS.Balanced, pressing: 10 }), () => side('BRE', PRESETS['Counter attack']));
  assert.ok(press.hCond < low.hCond - 5, `end condition ${press.hCond.toFixed(0)} vs ${low.hCond.toFixed(0)}`);
  assert.ok(press.as > low.as, `opponent shots ${press.as.toFixed(1)} vs ${low.as.toFixed(1)}`);
});

test('direct tempo works better against a high line', () => {
  const vsHigh = many(() => side('BRE', { ...PRESETS.Balanced, tempo: 95 }), () => side('MUN', PRESETS['High press']));
  const patientVsHigh = many(() => side('BRE', { ...PRESETS.Balanced, tempo: 10 }), () => side('MUN', PRESETS['High press']));
  assert.ok(vsHigh.hs > patientVsHigh.hs * 1.1, `shots ${vsHigh.hs.toFixed(1)} vs ${patientVsHigh.hs.toFixed(1)}`);
  assert.ok(patientVsHigh.hposs > vsHigh.hposs, 'patient tempo keeps more of the ball');
});

test('wide play works against narrow teams', () => {
  const narrowOpp = { ...PRESETS.Balanced, width: 5 };
  const wide = many(() => side('NEW', { ...PRESETS.Balanced, width: 95 }), () => side('BHA', narrowOpp));
  const narrow = many(() => side('NEW', { ...PRESETS.Balanced, width: 50 }), () => side('BHA', narrowOpp));
  assert.ok(wide.hs > narrow.hs * 1.05, `shots ${wide.hs.toFixed(1)} vs ${narrow.hs.toFixed(1)}`);
});

test('three centre-backs against two strikers lowers chance quality', () => {
  const vs352 = many(() => side('LEE', PRESETS.Balanced, '4-4-2'), () => side('FUL', PRESETS.Balanced, '5-3-2'));
  const vs433 = many(() => side('LEE', PRESETS.Balanced, '4-4-2'), () => side('FUL', PRESETS.Balanced, '4-3-3'));
  const perShot = (t) => t.hxg / t.hs;
  assert.ok(perShot(vs352) < perShot(vs433), `xG per shot ${perShot(vs352).toFixed(3)} vs ${perShot(vs433).toFixed(3)}`);
});
