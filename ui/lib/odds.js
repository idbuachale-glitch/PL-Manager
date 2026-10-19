// Projections for the next match (win chance, chances, possession, fatigue), computed in a worker.
// Also scouting: the opponent's likely style, key player and a suggestion.

import { aiSide, fixtureSeed } from '../../engine/season.js';
import { createMatch } from '../../engine/match.js';
import { PRESETS } from '../../engine/tactics.js';
import { game, userLineup } from '../store.js';

let worker = null, seq = 0;
const pending = new Map();
const cache = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../odds-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const cb = pending.get(e.data.id); pending.delete(e.data.id); cb?.(e.data); };
  }
  return worker;
}

// Both sides for a fixture, with the user's current line-up and the given tactics.
export function sidesFor(f, tactics = game.user.tactics) {
  const seed = fixtureSeed(game, f);
  const userIsHome = f.home === game.userClub;
  const user = { code: game.userClub, lineup: userLineup(), tactics };
  const opp = userIsHome ? aiSide(game, f.away, f.home, false, seed + 2) : aiSide(game, f.home, f.away, true, seed + 1);
  return { home: userIsHome ? user : opp, away: userIsHome ? opp : user, userKey: userIsHome ? 'home' : 'away', opp };
}

export function projection(f, tactics = game.user.tactics, runs = 80) {
  const lu = userLineup();
  const key = JSON.stringify([game.seed, f.id, game.gw, tactics, lu.formation, lu.slots.map((s) => s.player?.id)]);
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  const { home, away, userKey } = sidesFor(f, tactics);
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, (res) => { cache.set(key, res); resolve(res); });
    getWorker().postMessage({ id, home, away, runs, userKey });
  });
}

// Attack / midfield / defence for both sides (as the engine sees them at kick-off).
export function comparison(f) {
  const { home, away, userKey } = sidesFor(f);
  const m = createMatch({ home, away, seed: 1 });
  const uh = m.units('home'), ua = m.units('away');
  const us = userKey === 'home' ? uh : ua, them = userKey === 'home' ? ua : uh;
  return [
    ['Attack', 0.55 * us.attack + 0.45 * us.creation, 0.55 * them.attack + 0.45 * them.creation],
    ['Midfield', us.control, them.control],
    ['Defence', us.defence, them.defence],
    ['Goalkeeper', us.gk, them.gk],
  ];
}

const nearestPreset = (t) => {
  let best = 'Balanced', bestD = Infinity;
  for (const [name, p] of Object.entries(PRESETS)) {
    const d = (p.mentality - t.mentality) ** 2 + (p.pressing - t.pressing) ** 2 + (p.tempo - t.tempo) ** 2 + (p.width - t.width) ** 2;
    if (d < bestD) { best = name; bestD = d; }
  }
  return best;
};

export function scout(f) {
  const { home, away, userKey, opp } = sidesFor(f);
  const m = createMatch({ home, away, seed: 1 });
  const oppKey = userKey === 'home' ? 'away' : 'home';
  const u = m.units(oppKey), us = m.units(userKey);
  const key = opp.lineup.slots.map((s) => s.player).filter(Boolean).sort((a, b) => b.overall - a.overall)[0];
  const style = nearestPreset(opp.tactics);
  const tips = [];
  if (u.defPace < 10.5 && us.attPace > u.defPace + 1) tips.push('Their centre-backs are slow. A quick, direct tempo can get in behind.');
  if (opp.tactics.pressing >= 70) tips.push('They press high. Direct passing beats the press and finds the space behind it.');
  if (opp.tactics.width <= 35) tips.push('They play narrow. Push the width up to attack the flanks.');
  if (u.control > us.control + 1.5) tips.push('They are stronger in midfield. An extra central midfielder (4-2-3-1 or 3-5-2) helps keep the ball.');
  if (opp.tactics.mentality >= 70) tips.push('They come forward a lot. Sit a little deeper and hit them on the counter.');
  if (style === 'Park the bus') tips.push('Expect them to sit deep. Be patient and go wide to stretch them.');
  if (!tips.length) tips.push(u.defence > us.attack + 1.5 ? 'A tight defence. Patient build-up should create better chances.' : 'No obvious weakness. A balanced approach is a safe choice.');
  return { style, key, tip: tips[0], oppCode: opp.code, units: u };
}
