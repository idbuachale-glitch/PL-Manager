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
      // FPL defensive contributions, scaled by each position's own target (defenders 10,
      // midfielders and forwards 12 per game), plus tackles which count the same for everyone.
      outfield: { defcon_norm: 0.6, tackles: 0.4 },
      GK: { clean_sheet_rate: 0.50, goals_prevented: 0.50 },
    },
    goalkeeping: { goals_prevented: 0.40, clean_sheet_rate: 0.35, saves: 0.25 },
  },

  // Defenders also get up to ±3 Defending from how well their team defended
  // (clean sheets and goals conceded per 90, compared with other defenders).
  defenderTeamBonus: { range: 3, weights: { clean_sheet_rate: 0.5, goals_conceded_low: 0.5 } },

  // Share of every stat-based ability taken from price, so one odd season can't
  // give a star a silly low number. Keepers get more, because their stats are noisier.
  abilityPriceBlend: { outfield: 0.25, GK: 0.45 },

  // Free data only measures chance creation, not general passing, so centre-backs look worse
  // passers than they are. These are added to Passing by position.
  passingBonus: { GK: 0, DEF: 3, MID: 0, FWD: 1 },

  // Pace: no free data measures speed, so it is an estimate (editable in the app).
  pace: {
    base: { GK: 8, DEF: 12, MID: 12, FWD: 13 },
    threatBonus: 4,            // up to ±2 from attacking threat, outfield only
    ageAdjust: [[23, 1.5], [27, 1], [30, 0], [32, -1], [99, -2]], // [up to age, change]
  },

  // Stamina: based on how much a player started, plus age.
  stamina: {
    base: 7, startsForMax: 34, range: 10,
    ageAdjust: [[29, 1], [32, 0], [99, -1]],
    noDataValue: 11,
  },

  // Goalkeepers have no meaningful passing stats, so their passing comes from price.
  gkPassingFromPrice: true,

  // Overall = weighted average of abilities, then compared with others in the same position,
  // so it means "how good for his position" (abilities themselves stay on one shared scale).
  // Each position has one or more roles; a player is rated in whichever role suits him best,
  // so a holding midfielder isn't marked down for not scoring.
  overallRoles: {
    GK: { keeper: { goalkeeping: 0.80, passing: 0.10, stamina: 0.10 } },
    DEF: {
      centreBack: { defending: 0.60, passing: 0.15, pace: 0.10, stamina: 0.15 },
      fullBack: { defending: 0.35, passing: 0.30, pace: 0.20, stamina: 0.15 },
    },
    MID: {
      attacking: { passing: 0.35, attack: 0.30, pace: 0.15, stamina: 0.10, defending: 0.10 },
      holding: { defending: 0.45, passing: 0.30, stamina: 0.20, pace: 0.05 },
    },
    FWD: { striker: { attack: 0.50, pace: 0.20, passing: 0.15, stamina: 0.15 } },
  },
  defconTarget: { GK: 10, DEF: 10, MID: 12, FWD: 12 },

  // Lift for players at stronger clubs, measured by the club's squad value (sum of the
  // 15 highest start-of-season FPL prices). Stronger squads make individual stats look worse
  // for some roles, and FM rates players at big clubs higher. In overall points per spread.
  clubStrengthBonus: { squadSize: 15, perSd: 1.0, min: -1, max: 1.5 },
  // Overall scale for regular players (by percentile within position): the weakest regular
  // starter is about 9-10, a median one about 13, the best 19-20. Fringe players with few
  // minutes are blended toward their price estimate, so youngsters can sit lower.
  overallCurve: { base: 9, range: 11, power: 1.3 },
  overallPriceBlend: 0.25,     // 25% of overall from start-of-season price, so one odd season can't sink a star

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

// Match engine. Calibrated so a Premier League season averages about 2.7 goals a game,
// about 44% home wins, 24% draws and 32% away wins.
export const MATCH = {
  stoppage: { firstHalf: [1, 4], secondHalf: [2, 7] },
  homeAdvantage: { shots: 1.08, away: 0.95, possession: 0.02 },

  // Possession: who has the ball each minute.
  possession: {
    perControlPoint: 0.03,     // per point of midfield control difference
    perExtraCentralMid: 0.025, // formation matchup: extra body in central midfield
    patientTempo: 0.05, press: 0.03, narrow: 0.03,
    min: 0.28, max: 0.72,
  },

  // Chances: chance per minute of possession that the attack ends in a shot.
  shotRate: 0.212,
  qualitySensitivity: 0.075,    // per point of attack-vs-defence difference
  shotRateMax: 0.6,

  // Shot quality (xG).
  xg: { base: 0.1, sensitivity: 0.03, min: 0.02, max: 0.8 },
  finishingPerPoint: 0.04,     // shooter's Attack vs 13
  goalkeepingPerPoint: 0.05,   // keeper vs 12
  assistedShare: 0.8,

  penaltyPerMinute: 0.0027,    // about 0.25 a match
  penaltyXg: 0.78,
  cornerPerMinute: 0.035,      // plus corners from saved and blocked shots
  cornerFromShot: 0.3,
  cornerShot: { chance: 0.22, xg: 0.07 },

  fouls: { perMinute: 0.24, defenderShare: 0.6, yellowPerFoul: 0.16, straightRedPerFoul: 0.004 },
  injuryPerPlayerMinute: 0.00012,
  redCardPenalty: 0.12,        // each missing player cuts attack and defence by 12%

  // Fatigue: condition (0–100) lost per minute, more with pressing and fast tempo, less with stamina.
  fatigue: { perMinute: 0.24, press: 0.6, tempo: 0.15, staminaRef: 12, perStaminaPoint: 0.05 },
  conditionEffect: 0.18,       // at condition 0 a player plays at 82% of his ratings

  // How tactics change chances. See the stage-2 notes in README for what each one does.
  tactics: {
    mentalityOwn: 0.25,        // attacking mentality: more shots for you...
    mentalityOpp: 0.12,        // ...and more for the opponent (gaps at the back)
    pressTurnovers: 0.10,      // high press: extra chances from winning the ball high
    pressSpaceBehind: 0.12,    // but leaves space behind for the opponent
    pressSpaceXg: 0.06,
    directBase: 0.06, directVsHighLine: 0.18, directPacePerPoint: 0.04,
    patientShots: 0.05, patientXg: 0.12,
    wideVsNarrow: 0.15,
    spareDefenderXg: 0.92, outnumberedXg: 1.06,
  },
};
