// Picking a starting XI and bench for a formation.
// A player object is the rated player from data/players.json, optionally with `dyn`
// (live state: condition 0–100, form, injured/suspended counters).

import { FORMATIONS, SLOT_WEIGHTS } from './tactics.js';
import { familiarity } from './positions.js';

export const isAvailable = (p) => !(p.dyn?.injuredFor > 0) && !(p.dyn?.suspendedFor > 0);

// How good a player is in a slot (abilities that matter there x position familiarity), ignoring fitness.
export function slotScore(p, slot) {
  const fit = familiarity(p, slot);
  const w = SLOT_WEIGHTS[slot];
  let s = 0, ws = 0;
  for (const [k, wt] of Object.entries(w)) { s += wt * (p.attrs[k] ?? 6); ws += wt; }
  return (s / ws) * fit;
}

// Pick-time score: slot quality, reduced for tired players so AI clubs rotate.
function pickScore(p, slot, rotation = 1) {
  const cond = p.dyn?.condition ?? 100;
  const tiredPenalty = cond < 85 ? (85 - cond) * 0.12 * rotation : 0;
  return slotScore(p, slot) - tiredPenalty;
}

export function pickLineup(squad, formation, { rotation = 1, locked = [] } = {}) {
  const slots = FORMATIONS[formation];
  const pool = squad.filter(isAvailable);
  const used = new Set();
  const xi = new Array(slots.length).fill(null);

  // Players the manager has fixed in a slot first.
  for (const { index, playerId } of locked) {
    const p = pool.find((x) => x.id === playerId);
    if (p && !used.has(p.id)) { xi[index] = p; used.add(p.id); }
  }

  // Fill the scarcest slots first (keeper, then strikers, centre-backs, ...).
  const order = slots.map((s, i) => i).filter((i) => !xi[i])
    .sort((a, b) => candidates(pool, slots[a]).length - candidates(pool, slots[b]).length);
  for (const i of order) {
    const slot = slots[i];
    let best = null, bestScore = -Infinity;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      const s = pickScore(p, slot, rotation);
      if (s > bestScore) { best = p; bestScore = s; }
    }
    if (best) { xi[i] = best; used.add(best.id); }
  }

  const bench = pool.filter((p) => !used.has(p.id))
    .sort((a, b) => benchValue(b) - benchValue(a));
  // Make sure a keeper is on the bench if there is one.
  const benchKeeper = bench.find((p) => p.pos === 'GK');
  const outfield = bench.filter((p) => p !== benchKeeper).slice(0, benchKeeper ? 8 : 9);
  return {
    formation,
    slots: slots.map((slot, i) => ({ slot, player: xi[i] })),
    bench: benchKeeper ? [benchKeeper, ...outfield] : outfield,
  };
}

const candidates = (pool, slot) => pool.filter((p) => familiarity(p, slot) >= 0.95);
const benchValue = (p) => p.overall + (p.dyn?.condition ?? 100) / 50;

// Sum of slot scores, used to choose a formation that suits the squad.
export function lineupStrength(lineup) {
  return lineup.slots.reduce((s, { slot, player }) => s + (player ? slotScore(player, slot) : 0), 0);
}

export function bestFormation(squad, { prefer = {} } = {}) {
  let best = null, bestScore = -Infinity;
  for (const f of Object.keys(FORMATIONS)) {
    const score = lineupStrength(pickLineup(squad, f, { rotation: 0 })) + (prefer[f] ?? 0);
    if (score > bestScore) { best = f; bestScore = score; }
  }
  return best;
}
