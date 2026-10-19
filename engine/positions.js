// Natural positions and familiarity. FPL only gives GK / DEF / MID / FWD, so each player's
// natural and secondary slots are worked out from his role and abilities.

import { SLOT_FIT } from './tactics.js';

export const FAMILIARITY = {
  natural: 1.0,
  secondary: 0.95,
  sameGroup: 0.88,      // e.g. a winger played in central midfield
  crossGroupScale: 0.9, // other groups: SLOT_FIT value x this (e.g. a defender at DM: 0.85 x 0.9)
  unsuitable: 0.6,      // e.g. a striker at centre-back
  outfieldInGoal: 0.35,
  keeperOutfield: 0.4,
};

const SLOT_GROUP = { GK: 'GK', CB: 'DEF', FB: 'DEF', WB: 'DEF', DM: 'MID', CM: 'MID', AM: 'MID', W: 'MID', ST: 'FWD' };
export const SLOT_LABEL = { GK: 'Goalkeeper', CB: 'Centre-back', FB: 'Full-back', WB: 'Wing-back', DM: 'Holding midfield', CM: 'Central midfield', AM: 'Attacking midfield', W: 'Winger', ST: 'Striker' };

const memo = new Map();

// Per-90 numbers from last season (null if he barely played).
function per90(p) {
  const l = p.lastSeason;
  if (!l || !(l.minutes >= 600)) return null;
  const n = l.minutes / 90;
  return { threat: (l.threat ?? 0) / n, creativity: (l.creativity ?? 0) / n, defcon: (l.defensive_contribution ?? 0) / n, xg: (l.expected_goals ?? 0) / n };
}

export function positionsOf(p) {
  if (p.positions?.natural) return { natural: p.positions.natural, secondary: p.positions.secondary ?? [] };   // set by hand
  const key = `${p.id}:${p.role}:${p.attrs.attack}:${p.attrs.passing}:${p.attrs.pace}:${p.attrs.defending}`;
  if (memo.has(key)) return memo.get(key);
  const a = p.attrs;
  const s = per90(p);
  let natural, secondary;
  if (p.pos === 'GK') { natural = ['GK']; secondary = []; }
  else if (p.pos === 'DEF') {
    const wide = s ? s.creativity >= 11 || s.threat >= 11 : p.role === 'fullBack';
    if (wide) { natural = ['FB', 'WB']; secondary = (s ? s.defcon >= 8.5 : a.defending >= 13) ? ['CB'] : []; }
    else { natural = ['CB']; secondary = a.pace >= 14 && (s ? s.creativity >= 8 : a.passing >= 12) ? ['FB'] : []; }
  } else if (p.pos === 'MID') {
    if (s) {
      const winger = () => { natural = ['W']; secondary = s.creativity >= 25 ? ['AM'] : s.xg >= 0.3 ? ['ST'] : ['AM']; };
      const wideProfile = s.threat >= 15 && s.defcon <= 8 && a.pace >= 13;   // attacks a lot, defends little: plays wide
      if (s.threat >= 30) winger();
      else if (s.creativity >= 30 && s.threat >= 15 && !(s.defcon < 6 && a.pace >= 14)) { natural = ['AM']; secondary = ['CM', ...(a.pace >= 14 ? ['W'] : [])]; }
      else if (s.threat >= 22 || wideProfile) winger();
      else if (s.defcon >= 10.5 && s.threat < 12) { natural = s.creativity >= 20 ? ['DM', 'CM'] : ['DM']; secondary = s.creativity >= 20 ? [] : ['CM']; }
      else { natural = ['CM']; secondary = [...(s.defcon >= 8 ? ['DM'] : []), ...(s.creativity >= 22 ? ['AM'] : [])]; }
    } else { natural = ['CM']; secondary = ['AM', 'DM', 'W']; }   // no data: a flexible central midfielder
  } else {
    natural = ['ST'];
    secondary = s
      ? [...(s.creativity >= 12 && a.pace >= 14 ? ['W'] : []), ...(s.creativity >= 14 ? ['AM'] : [])]
      : [...(a.pace >= 15 ? ['W'] : []), ...(a.passing >= 12 ? ['AM'] : [])];
  }
  const out = { natural, secondary };
  memo.set(key, out);
  return out;
}

const famCache = new WeakMap();   // player object -> { slot: familiarity }

export function familiarity(p, slot) {
  let c = famCache.get(p);
  if (!c) { c = {}; famCache.set(p, c); }
  return c[slot] ?? (c[slot] = computeFamiliarity(p, slot));
}

function computeFamiliarity(p, slot) {
  const { natural, secondary } = positionsOf(p);
  if (natural.includes(slot)) return FAMILIARITY.natural;
  if (secondary.includes(slot)) return FAMILIARITY.secondary;
  if (slot === 'GK') return FAMILIARITY.outfieldInGoal;
  if (p.pos === 'GK') return FAMILIARITY.keeperOutfield;
  if (SLOT_GROUP[slot] === p.pos) return FAMILIARITY.sameGroup;
  const fit = SLOT_FIT[slot]?.[p.pos] ?? 0;
  return fit ? fit * FAMILIARITY.crossGroupScale : FAMILIARITY.unsuitable;
}

// 'natural' | 'secondary' | 'unfamiliar' | 'wrong'
export function fitLevel(p, slot) {
  const f = familiarity(p, slot);
  return f >= 1 ? 'natural' : f >= FAMILIARITY.secondary ? 'secondary' : f >= 0.8 ? 'unfamiliar' : 'wrong';
}
