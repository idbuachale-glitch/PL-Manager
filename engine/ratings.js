// Turns last season's real stats into FM-style 1–20 ratings.
// Pure functions, no I/O: runs in Node (data build) and in the browser (editor re-rating).

import { RATINGS as DEFAULT_RATINGS, VALUE as DEFAULT_VALUE } from './config.js';

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
const PER90_STATS = [
  'expected_goals', 'goals_scored', 'threat', 'expected_assists', 'creativity',
  'assists', 'tackles', 'clearances_blocks_interceptions', 'defensive_contribution', 'influence', 'saves',
];

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lookup = (table, age) => table.find(([upTo]) => age <= upTo)[1];
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// Deterministic 0–1 value per player, so "random" potential is the same on every rebuild.
function hash01(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

export function ageOn(birthDate, onDate) {
  if (!birthDate) return null;
  const b = new Date(birthDate), d = new Date(onDate);
  let age = d.getFullYear() - b.getFullYear();
  if (d < new Date(d.getFullYear(), b.getMonth(), b.getDate())) age -= 1;
  return age;
}

// Per-90 numbers and rates from a season's totals.
function deriveStats(last) {
  if (!last || !num(last.minutes)) return null;
  const mins = num(last.minutes);
  const n90 = mins / 90;
  const out = { minutes: mins, starts: num(last.starts) };
  for (const key of PER90_STATS) {
    const v = num(last[key]);
    out[key] = v === null ? null : v / n90;
  }
  const cs = num(last.clean_sheets);
  out.clean_sheet_rate = cs === null ? null : cs / n90;
  const xgc = num(last.expected_goals_conceded), gc = num(last.goals_conceded);
  out.goals_prevented = xgc === null || gc === null ? null : (xgc - gc) / n90;
  out.goals_conceded_low = gc === null ? null : -gc / n90;
  return out;
}

function meanSd(values) {
  const v = values.filter((x) => x !== null);
  if (v.length < 2) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)) || 1;
  return { mean, sd };
}

// Share of the pool below x (ties count half).
function percentile(sortedPool, x) {
  if (!sortedPool.length) return 0.5;
  let below = 0, equal = 0;
  for (const v of sortedPool) { if (v < x) below++; else if (v === x) equal++; }
  return (below + equal / 2) / sortedPool.length;
}

export function buildRatings(rawPlayers, { ratings = DEFAULT_RATINGS, value = DEFAULT_VALUE, referenceDate } = {}) {
  const R = ratings;
  const curve = (p) => clamp(R.curve.base + R.curve.range * clamp(p, 0, 1) ** R.curve.power, R.scale.min, R.scale.max);
  const players = rawPlayers.map((p) => ({ ...p, stats: deriveStats(p.last) }));
  const out = [];

  const STAT_KEYS = [...PER90_STATS, 'clean_sheet_rate', 'goals_prevented', 'goals_conceded_low'];
  const inPool = (p) => p.stats && p.stats.minutes >= R.poolMinMinutes[p.pos];
  const makeDist = (pool) => Object.fromEntries(STAT_KEYS.map((k) => [k, meanSd(pool.map((p) => p.stats[k]))]));
  const makeComposite = (dist, zCap = 3) => (p, weights) => {
    let sum = 0, wsum = 0;
    for (const [key, w] of Object.entries(weights)) {
      const d = dist[key], v = p.stats?.[key];
      if (d && v !== null && v !== undefined) { sum += w * clamp((v - d.mean) / d.sd, -zCap, zCap); wsum += w; }
    }
    return wsum ? sum / wsum : null;
  };
  const sortedComposites = (pool, composite, weights) =>
    pool.map((p) => composite(p, weights)).filter((x) => x !== null).sort((a, b) => a - b);

  // Shared outfield scale for Attack, Passing and Defending.
  const outfieldPool = players.filter((p) => p.pos !== 'GK' && inPool(p));
  const outfieldComposite = makeComposite(makeDist(outfieldPool), 5);
  const outfieldWeights = {
    attack: R.abilities.attack,
    passing: R.abilities.passing,
    defending: R.abilities.defending.outfield,
  };
  // Shared abilities use standardised composites (not percentiles) so the top end doesn't bunch up.
  const outfieldLevel = Object.fromEntries(Object.entries(outfieldWeights).map(([a, w]) => {
    const ms = meanSd(outfieldPool.map((p) => outfieldComposite(p, w)));
    const sc = R.sharedScale[a];
    return [a, (c) => clamp(sc.centre + sc.perSd * (c - ms.mean) / ms.sd, R.scale.min, R.scale.max)];
  }));
  const threatPool = outfieldPool.map((p) => p.stats.threat).filter((x) => x !== null).sort((a, b) => a - b);

  for (const pos of POSITIONS) {
    const group = players.filter((p) => p.pos === pos);
    if (!group.length) continue;
    const pool = group.filter(inPool);
    const posComposite = makeComposite(makeDist(pool));

    // Each ability: which weights, which comparison (shared outfield or within position).
    const abilities = {};
    if (pos === 'GK') {
      const within = (w) => { const sorted = sortedComposites(pool, posComposite, w); return { weights: w, composite: posComposite, level: (c) => curve(percentile(sorted, c)) }; };
      abilities.goalkeeping = within(R.abilities.goalkeeping);
      abilities.defending = within(R.abilities.defending.GK);
      if (!R.gkPassingFromPrice) abilities.passing = within(R.abilities.passing);
    } else {
      for (const [a, w] of Object.entries(outfieldWeights)) abilities[a] = { weights: w, composite: outfieldComposite, level: outfieldLevel[a] };
    }
    const teamBonusSorted = pos === 'DEF' ? sortedComposites(pool, posComposite, R.defenderTeamBonus.weights) : null;

    // Typical level of each ability for this position (median of regular players),
    // used as the starting point for players with little or no data.
    const typical = {};
    for (const [a, ab] of Object.entries(abilities)) {
      const levels = pool.map((p) => ab.composite(p, ab.weights)).filter((x) => x !== null)
        .map((c) => ab.level(c)).sort((x, y) => x - y);
      typical[a] = levels.length ? levels[levels.length >> 1] : curve(0.5);
    }
    const pricesSorted = group.map((p) => p.price).sort((a, b) => a - b);
    const mid = curve(0.5);

    const rated = group.map((p) => {
      const age = ageOn(p.birthDate, referenceDate);
      const ageUsed = age ?? R.defaultAge;
      const mins = p.stats?.minutes ?? 0;
      const w = Math.min(1, mins / R.shrink.fullMinutes) ** R.shrink.power;
      const priceP = percentile(pricesSorted, p.price);
      const priceLevel = curve(0.5 + (priceP - 0.5) * R.priceEstimate.pullToMiddle);
      const estimated = [];
      if (!p.stats) estimated.push('all');
      if (age === null) estimated.push('age');

      const attrs = {};
      const pb = R.abilityPriceBlend[pos === 'GK' ? 'GK' : 'outfield'];
      for (const [ability, ab] of Object.entries(abilities)) {
        const prior = clamp(typical[ability] + R.priceEstimate.spread * (priceLevel - mid), R.scale.min, R.scale.max);
        const c = p.stats ? ab.composite(p, ab.weights) : null;
        const statLevel = c === null ? prior : ab.level(c);
        const ww = c === null ? 0 : w;
        attrs[ability] = (1 - pb) * (ww * statLevel + (1 - ww) * prior) + pb * prior;
      }
      if (teamBonusSorted && p.stats) {
        const tc = posComposite(p, R.defenderTeamBonus.weights);
        if (tc !== null) attrs.defending += w * R.defenderTeamBonus.range * 2 * (percentile(teamBonusSorted, tc) - 0.5);
      }
      for (const a of Object.keys(abilities)) attrs[a] = clamp(attrs[a], R.scale.min, R.scale.max);
      if (pos === 'GK' && R.gkPassingFromPrice) { attrs.passing = priceLevel; estimated.push('passing'); }

      // Pace (estimated).
      let pace = R.pace.base[pos] + lookup(R.pace.ageAdjust, ageUsed);
      if (pos !== 'GK') {
        const tp = p.stats?.threat != null ? percentile(threatPool, p.stats.threat) : 0.5;
        pace += R.pace.threatBonus * ((w * tp + (1 - w) * 0.5) - 0.5);
      }
      attrs.pace = clamp(pace, R.scale.min, R.scale.max);
      estimated.push('pace');

      // Stamina.
      const starts = p.stats ? (p.stats.starts ?? mins / 80) : null;
      const stamina = starts === null
        ? R.stamina.noDataValue
        : R.stamina.base + R.stamina.range * Math.min(1, starts / R.stamina.startsForMax);
      attrs.stamina = clamp(stamina + lookup(R.stamina.ageAdjust, ageUsed), R.scale.min, R.scale.max);

      const ow = R.overallWeights[pos];
      const raw = Object.entries(ow).reduce((s, [k, wt]) => s + wt * attrs[k], 0)
        / Object.values(ow).reduce((a, b) => a + b, 0);
      return { p, age, ageUsed, mins, priceLevel, attrs, raw, estimated };
    });

    // Overall: compare each player's weighted average with regular players in the same position.
    const rawPool = rated.filter((r) => r.mins >= R.poolMinMinutes[pos]).map((r) => r.raw).sort((a, b) => a - b);
    for (const r of rated) {
      const overall = clamp((1 - R.overallPriceBlend) * curve(percentile(rawPool, r.raw)) + R.overallPriceBlend * r.priceLevel, R.scale.min, R.scale.max);

      const jitter = (hash01(r.p.code ?? r.p.id) * 2 - 1) * R.potentialJitter;
      const potential = clamp(Math.max(overall, overall + lookup(R.potentialAgeBonus, r.ageUsed) + jitter), R.scale.min, R.scale.max);

      const V = value;
      const adjPrice = r.p.price + (V.positionPriceBoost?.[pos] ?? 0);
      const base = V.price.factor * Math.max(0.5, adjPrice - V.price.offset) ** V.price.power;
      const val = base * lookup(V.ageFactor, r.ageUsed) * (1 + V.potentialFactorPerPoint * (potential - overall));

      const { stats, last, ...rest } = r.p;
      out.push({
        ...rest,
        age: r.ageUsed,
        attrs: Object.fromEntries(Object.entries(r.attrs).map(([k, v]) => [k, Math.round(v)])),
        overall: Math.round(overall),
        overallExact: Math.round(overall * 10) / 10,
        potential: Math.round(potential),   // hidden in the app
        value: Math.round(val / V.roundTo) * V.roundTo,
        minutesLastSeason: r.mins,
        lastSeason: last ?? null,
        estimated: r.estimated,
      });
    }
  }
  return out;
}
