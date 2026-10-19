// Formations, slots, presets and the four tactic sliders.
// Sliders are stored 0–100 (50 = neutral) and used inside the engine as -1..+1.

// Slot types: GK keeper, CB centre-back, FB full-back, WB wing-back, DM holding mid,
// CM central mid, AM attacking mid (central), W winger, ST striker.
export const FORMATIONS = {
  '4-3-3':   ['GK', 'FB', 'CB', 'CB', 'FB', 'DM', 'CM', 'CM', 'W', 'ST', 'W'],
  '4-2-3-1': ['GK', 'FB', 'CB', 'CB', 'FB', 'DM', 'DM', 'W', 'AM', 'W', 'ST'],
  '4-4-2':   ['GK', 'FB', 'CB', 'CB', 'FB', 'W', 'CM', 'CM', 'W', 'ST', 'ST'],
  '3-5-2':   ['GK', 'CB', 'CB', 'CB', 'WB', 'CM', 'DM', 'CM', 'WB', 'ST', 'ST'],
  '5-3-2':   ['GK', 'WB', 'CB', 'CB', 'CB', 'WB', 'CM', 'DM', 'CM', 'ST', 'ST'],
};

// Which FPL positions can play each slot, and how well (1 = natural).
export const SLOT_FIT = {
  GK: { GK: 1 },
  CB: { DEF: 1, MID: 0.75 },
  FB: { DEF: 1, MID: 0.85 },
  WB: { DEF: 1, MID: 0.9 },
  DM: { MID: 1, DEF: 0.85 },
  CM: { MID: 1, DEF: 0.7, FWD: 0.7 },
  AM: { MID: 1, FWD: 0.9 },
  W:  { MID: 1, FWD: 0.82 },
  ST: { FWD: 1, MID: 0.8 },
};

// How much each ability matters in each slot (for picking the best player for it).
export const SLOT_WEIGHTS = {
  GK: { goalkeeping: 0.85, passing: 0.05, stamina: 0.10 },
  CB: { defending: 0.60, passing: 0.15, pace: 0.10, stamina: 0.15 },
  FB: { defending: 0.35, passing: 0.30, pace: 0.20, stamina: 0.15 },
  WB: { defending: 0.25, passing: 0.30, pace: 0.25, stamina: 0.20 },
  DM: { defending: 0.45, passing: 0.30, stamina: 0.20, pace: 0.05 },
  CM: { passing: 0.40, defending: 0.20, attack: 0.20, stamina: 0.20 },
  AM: { passing: 0.40, attack: 0.40, pace: 0.10, stamina: 0.10 },
  W:  { attack: 0.35, passing: 0.30, pace: 0.25, stamina: 0.10 },
  ST: { attack: 0.60, pace: 0.20, passing: 0.10, stamina: 0.10 },
};

export const NEUTRAL = { mentality: 50, pressing: 50, tempo: 50, width: 50 };

export const PRESETS = {
  'Balanced':       { mentality: 50, pressing: 50, tempo: 50, width: 50 },
  'Park the bus':   { mentality: 10, pressing: 15, tempo: 40, width: 30 },
  'Counter attack': { mentality: 30, pressing: 30, tempo: 85, width: 55 },
  'Possession':     { mentality: 60, pressing: 60, tempo: 15, width: 55 },
  'High press':     { mentality: 65, pressing: 90, tempo: 65, width: 55 },
  'All-out attack': { mentality: 95, pressing: 75, tempo: 70, width: 75 },
};

// 0–100 slider -> -1..+1
export const norm = (v) => Math.max(-1, Math.min(1, ((v ?? 50) - 50) / 50));

export function normTactics(t = NEUTRAL) {
  return { m: norm(t.mentality), p: norm(t.pressing), t: norm(t.tempo), w: norm(t.width) };
}

// Counts used by formation matchups.
export function shape(formation) {
  const slots = FORMATIONS[formation];
  const n = (types) => slots.filter((s) => types.includes(s)).length;
  return {
    centreBacks: n(['CB']),
    centralMids: n(['DM', 'CM', 'AM']),
    wide: n(['FB', 'WB', 'W']),
    strikers: n(['ST']),
  };
}
