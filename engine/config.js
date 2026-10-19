// Every rating formula and weighting lives here, so it can be tuned in one place.
// Abilities and the overall rating use an FM-style 1–20 scale.

export const RATINGS = {
  season: '2025/26',          // last season: the only source of stats for ratings
  scale: { min: 1, max: 20 },

  // Percentile (0–1) within position -> 1–20.
  // About 11 for an average Premier League player, 15–16 for the top quarter,
  // 18 for the top 10%, 19–20 for the very best.
  curve: { base: 6, range: 14, power: 1.5 },

  // Only players with at least this many minutes form the comparison pool.
  poolMinMinutes: { GK: 900, DEF: 450, MID: 450, FWD: 450 },

  // Small-sample shrink: weight on the player's own stats = min(1, minutes / full) ^ power.
  // 1,500+ minutes = all own stats. 500 minutes = about 11% own stats, 89% starting estimate.
  shrink: { fullMinutes: 1500, power: 2 },

  // Starting estimate for players with little or no Premier League data last season:
  // their FPL price, compared with others in the same position, put through the curve
  // and pulled toward the middle so nobody gets an extreme rating from price alone.
  priceEstimate: { pullToMiddle: 0.75, spread: 0.6 },

  // Shared outfield scale: rating = centre + perSd x (how many spreads above the outfield average).
  // Spreads the top end so elite players separate (Haaland vs a mid-table striker).
  // Separate settings per ability, tuned so a typical Premier League striker has Attack ~14
  // and only the very best reach 19–20.
  sharedScale: {
    attack: { centre: 9, perSd: 2.2 },
    passing: { centre: 10, perSd: 2.6 },
    defending: { centre: 10, perSd: 2.6 },
  },

  // Stats behind each ability (all per 90 minutes unless marked as a rate).
  // Weights are added up from standardised scores, then turned into a percentile.
  // Attack, Passing and Defending compare ALL outfield players on one shared scale (like FM),
  // so a striker's Attack is naturally higher than a centre-back's.
  abilities: {
    attack: { expected_goals: 0.45, goals_scored: 0.25, threat: 0.30 },
    passing: { expected_assists: 0.40, creativity: 0.40, assists: 0.20 },
    defending: {
      // Tackles + clearances/blocks/interceptions count the same way for every position.
      outfield: { tackles: 0.5, clearances_blocks_interceptions: 0.5 },
      GK: { clean_sheet_rate: 0.50, goals_prevented: 0.50 },
    },
    goalkeeping: { goals_prevented: 0.40, clean_sheet_rate: 0.35, saves: 0.25 },
  },

  // Defenders also get up to ±2 Defending from how well their team defended
  // (clean sheets and goals conceded per 90, compared with other defenders).
  defenderTeamBonus: { range: 2, weights: { clean_sheet_rate: 0.5, goals_conceded_low: 0.5 } },

  // Share of every stat-based ability taken from price, so one odd season can't
  // give a star a silly low number. Keepers get more, because their stats are noisier.
  abilityPriceBlend: { outfield: 0.20, GK: 0.35 },

  // Pace: no free data measures speed, so it is an estimate (editable in the app).
  pace: {
    base: { GK: 8, DEF: 12, MID: 12, FWD: 13 },
    threatBonus: 4,            // up to ±2 from attacking threat, outfield only
    ageAdjust: [[23, 1.5], [27, 1], [30, 0], [32, -1.5], [99, -3]], // [up to age, change]
  },

  // Stamina: based on how much a player started, plus age.
  stamina: {
    base: 7, startsForMax: 34, range: 10,
    ageAdjust: [[29, 1], [32, 0], [99, -2]],
    noDataValue: 11,
  },

  // Goalkeepers have no meaningful passing stats, so their passing comes from price.
  gkPassingFromPrice: true,

  // Overall = weighted average of abilities, then compared with others in the same position,
  // so it means "how good for his position" (abilities themselves stay on one shared scale).
  overallWeights: {
    GK: { goalkeeping: 0.80, passing: 0.10, stamina: 0.10 },
    DEF: { defending: 0.50, passing: 0.15, pace: 0.15, stamina: 0.15, attack: 0.05 },
    MID: { passing: 0.35, attack: 0.25, defending: 0.15, stamina: 0.15, pace: 0.10 },
    FWD: { attack: 0.45, pace: 0.20, passing: 0.15, stamina: 0.15, defending: 0.05 },
  },
  overallPriceBlend: 0.15,     // 15% of overall from price, to catch odd outliers

  // Hidden potential: overall + age bonus, ±1 random (fixed per player), capped at 20.
  potentialAgeBonus: [[18, 4], [19, 3.5], [20, 3], [21, 2.5], [22, 2], [23, 1], [24, 0.5], [99, 0]],
  potentialJitter: 1,

  defaultAge: 26,              // used only if a birth date is missing (flagged as estimated)
};

export const VALUE = {
  // Value in £m = factor * (FPL price - offset) ^ power  ->  £4.5m ≈ £3m, £8m ≈ £33m, £15m ≈ £150m
  price: { factor: 3, offset: 3.5, power: 1.6 },
  // FPL prices keepers and defenders lower than their transfer value, so lift them first.
  positionPriceBoost: { GK: 2.0, DEF: 1.0, MID: 0, FWD: 0 },
  ageFactor: [[21, 1.25], [24, 1.15], [27, 1.0], [29, 0.8], [30, 0.65], [32, 0.5], [99, 0.35]],
  potentialFactorPerPoint: 0.05, // +5% per point of potential above current overall
  roundTo: 0.5,
};
