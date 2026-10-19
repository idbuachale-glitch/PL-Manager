// Turns last season's real stats into FM-style 1–20 ratings.
// Pure functions, no I/O: runs in Node (data build) and in the browser (editor re-rating).

import { RATINGS as DEFAULT_RATINGS, VALUE as DEFAULT_VALUE } from './config.js';

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
const PER90_STATS = [
  'expected_goals', 'goals_scored', 'threat', 'expected_assists', 'creativity',
  'assists', 'defensive_contribution', 'influence', 'saves',
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

  for (const pos of POSITIONS) {
    const group = players.filter((p) => p.pos === pos);
    if (!group.length) continue;
    const pool = group.filter((p) => p.stats && p.stats.minutes >= R.poolMinMinutes[pos]);

    // Pool averages and spreads for every stat.
    const dist = {};
    for (const key of [...PER90_STATS, 'clean_sheet_rate', 'goals_prevented', 'goals_conceded_low']) {
      dist[key] = meanSd(pool.map((p) => p.stats[key]));
    }
    const z = (p, key) => {
      const d = dist[key], v = p.stats?.[key];
      return d && v !== null && v !== undefined ? clamp((v - d.mean) / d.sd, -3, 3) : null;
    };
    const composite = (p, weights) => {
      let sum = 0, wsum = 0;
      for (const [key, w] of Object.entries(weights)) {
        const zz = z(p, key);
        if (zz !== null) { sum += w * zz; wsum += w; }
      }
      return wsum ? sum / wsum : null;
    };

    // Which weights each ability uses for this position.
    const abilityWeights = {
      passing: R.abilities.passing,
      defending: pos === 'GK' ? R.abilities.defending.GK : pos === 'DEF' ? R.abilities.defending.DEF : R.abilities.defending.outfield,
    };
    if (pos === 'GK') abilityWeights.goalkeeping = R.abilities.goalkeeping;
    else abilityWeights.attack = R.abilities.attack;
    if (pos === 'GK' && R.gkPassingFromPrice) delete abilityWeights.passing;

    // Pool composites, sorted, for percentiles.
    const poolSorted = {};
    for (const [ability, w] of Object.entries(abilityWeights)) {
      poolSorted[ability] = pool.map((p) => composite(p, w)).filter((x) => x !== null).sort((a, b) => a - b);
    }
    const threatPool = pool.map((p) => p.stats.threat).filter((x) => x !== null).sort((a, b) => a - b);
    const pricesSorted = group.map((p) => p.price).sort((a, b) => a - b);

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
      for (const [ability, weights] of Object.entries(abilityWeights)) {
        const c = p.stats ? composite(p, weights) : null;
        const statLevel = c === null ? priceLevel : curve(percentile(poolSorted[ability], c));
        const ww = c === null ? 0 : w;
        const pb = R.abilityPriceBlend[pos === 'GK' ? 'GK' : 'outfield'];
        attrs[ability] = (1 - pb) * (ww * statLevel + (1 - ww) * priceLevel) + pb * priceLevel;
      }
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

    // Stretch the overall around the position average.
    const posMean = rated.reduce((s, r) => s + r.raw, 0) / rated.length;
    for (const r of rated) {
      const stretched = posMean + (r.raw - posMean) * R.overallStretch;
      const overall = clamp((1 - R.overallPriceBlend) * stretched + R.overallPriceBlend * r.priceLevel, R.scale.min, R.scale.max);

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
