// Minute-by-minute match engine. No UI code: the match screen and the season simulator both drive it.
//
//   const m = createMatch({ home, away, seed });   // home/away: { code, lineup, tactics }
//   while (!m.finished) m.step();                  // one minute per step; returns that minute's events
//   m.setTactics('home', {...}); m.substitute('away', outId, inId);
//   m.result();
//
// Same seed + same inputs + same changes at the same minutes = the same match.

import { MATCH as DEFAULT_MATCH } from './config.js';
import { makeRng } from './rng.js';
import { normTactics, shape } from './tactics.js';

const SLOT_UNITS = {
  //       attack creation control defence
  GK: [0, 0.05, 0, 0],
  CB: [0.05, 0.15, 0.2, 1.0],
  FB: [0.1, 0.4, 0.2, 0.7],
  WB: [0.25, 0.5, 0.3, 0.6],
  DM: [0.1, 0.5, 1.0, 0.7],
  CM: [0.3, 0.8, 1.0, 0.3],
  AM: [0.7, 1.0, 0.8, 0.1],
  W: [0.7, 0.8, 0.4, 0.1],
  ST: [1.0, 0.3, 0.2, 0.05],
};
const SHOOTER_WEIGHT = { ST: 0.9, W: 1.0, AM: 0.95, CM: 0.55, DM: 0.22, WB: 0.25, FB: 0.18, CB: 0.2, GK: 0 };
const HEADER_WEIGHT = { CB: 1.0, ST: 1.0, DM: 0.4, CM: 0.4, W: 0.3, AM: 0.3, FB: 0.3, WB: 0.3, GK: 0 };
const ASSIST_WEIGHT = { AM: 1.0, W: 1.0, CM: 0.7, FB: 0.55, WB: 0.7, ST: 0.5, DM: 0.35, CB: 0.15, GK: 0.02 };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function createMatch({ home, away, seed = 1, config = DEFAULT_MATCH, neutral = false }) {
  const C = config;
  const rng = makeRng(seed);
  const stoppage1 = rng.int(...C.stoppage.firstHalf);
  const stoppage2 = rng.int(...C.stoppage.secondHalf);
  const totalMinutes = 90 + stoppage1 + stoppage2;

  const side = (s, isHome) => ({
    code: s.code,
    isHome: isHome && !neutral,
    formation: s.lineup.formation,
    tactics: { ...s.tactics },
    // On the pitch: { slot, player, state }
    onPitch: s.lineup.slots.filter((x) => x.player).map(({ slot, player }) => ({ slot, player, st: newState(player) })),
    bench: s.lineup.bench.map((player) => ({ player, st: newState(player) })),
    subsLeft: 5,
    goals: 0, shots: 0, onTarget: 0, xg: 0, corners: 0, fouls: 0, yellows: 0, reds: 0, possessionMins: 0,
  });
  const newState = (p) => ({
    condition: p.dyn?.condition ?? 100, minutes: 0, goals: 0, assists: 0, shots: 0, onTarget: 0, saves: 0,
    yellow: 0, red: false, injured: false, rating: 6.3, cameOn: null, wentOff: null,
  });

  const sides = { home: side(home, true), away: side(away, false) };
  const allStates = new Map();
  for (const s of Object.values(sides)) for (const x of [...s.onPitch, ...s.bench]) allStates.set(x.player.id, { ...x, side: s });

  const events = [];
  const momentum = [];          // per-minute xG difference (home minus away), for the momentum bar
  let minute = 0;
  let finished = false;
  let half = 1;

  const other = (k) => (k === 'home' ? 'away' : 'home');
  const eff = (x, key) => {
    const base = x.player.attrs[key] ?? 6;
    const formBonus = clamp(((x.player.dyn?.form ?? 6.5) - 6.5) * 0.4, -0.8, 0.8);
    return (base + formBonus) * (1 - C.conditionEffect * (1 - x.st.condition / 100));
  };

  function units(k) {
    const s = sides[k];
    const sum = [0, 0, 0, 0], wsum = [0, 0, 0, 0];
    const keys = ['attack', 'passing', null, 'defending'];
    let attPace = 0, attPaceN = 0, defPace = 0, defPaceN = 0, gk = 8;
    for (const x of s.onPitch) {
      const w = SLOT_UNITS[x.slot];
      for (let i = 0; i < 4; i++) {
        if (!w[i]) continue;
        const v = i === 2 ? (eff(x, 'passing') + eff(x, 'defending')) / 2 : eff(x, keys[i]);
        sum[i] += w[i] * v; wsum[i] += w[i];
      }
      if (['ST', 'W', 'AM'].includes(x.slot)) { attPace += eff(x, 'pace'); attPaceN++; }
      if (x.slot === 'CB') { defPace += eff(x, 'pace'); defPaceN++; }
      if (x.slot === 'GK') gk = eff(x, 'goalkeeping');
    }
    const missing = 11 - s.onPitch.length;
    const man = 1 - C.redCardPenalty * missing;
    const avg = (i) => (wsum[i] ? sum[i] / wsum[i] : 6);
    return {
      attack: avg(0) * man, creation: avg(1) * man, control: avg(2) * man, defence: avg(3) * man,
      attPace: attPaceN ? attPace / attPaceN : 11, defPace: defPaceN ? defPace / defPaceN : 11, gk,
      shape: shape(s.formation), missing,
    };
  }

  function possessionHome(uh, ua, th, ta) {
    const P = C.possession;
    let p = 0.5
      + P.perControlPoint * (uh.control - ua.control)
      + P.perExtraCentralMid * (uh.shape.centralMids - ua.shape.centralMids)
      + P.patientTempo * (ta.t - th.t) / 2
      + P.press * (th.p - ta.p) / 2
      + P.narrow * (ta.w - th.w) / 2;
    if (sides.home.isHome) p += C.homeAdvantage.possession;
    return clamp(p, P.min, P.max);
  }

  // Shot chance and quality multipliers from the tactical matchup.
  function tacticalMultipliers(ua, ud, ta, td) {
    const T = C.tactics;
    const lineHighD = (td.p + td.m) / 2;
    let shot = (1 + T.mentalityOwn * ta.m) * (1 + T.mentalityOpp * td.m);
    shot *= 1 + T.pressTurnovers * Math.max(0, ta.p);
    shot *= 1 + T.pressSpaceBehind * Math.max(0, td.p) * (ta.t > 0 ? 1 + ta.t : 0.5);
    let xg = 1 + T.pressSpaceXg * Math.max(0, td.p);
    if (ta.t > 0) {
      shot *= 1 + ta.t * (T.directBase + T.directVsHighLine * Math.max(0, lineHighD)
        + T.directPacePerPoint * (ua.attPace - ud.defPace));
    } else {
      shot *= 1 + T.patientShots * ta.t;    // fewer shots...
      xg *= 1 - T.patientXg * ta.t;          // ...but better ones
    }
    if (ta.w > 0 && td.w < 0) shot *= 1 + T.wideVsNarrow * ta.w * -td.w;
    if (ud.shape.centreBacks >= ua.shape.strikers + 2) xg *= T.spareDefenderXg;
    else if (ud.shape.centreBacks <= ua.shape.strikers) xg *= T.outnumberedXg;
    return { shot: Math.max(0.2, shot), xg };
  }

  const pickWeighted = (s, weights, attr, exclude) => rng.weighted(
    s.onPitch.filter((x) => x !== exclude),
    (x) => (weights[x.slot] ?? 0) * (Math.max(1, eff(x, attr)) / 12) ** 0.6,
  );

  function addEvent(e) { const ev = { minute: displayMinute(), ...e }; events.push(ev); return ev; }
  const displayMinute = () => (half === 1 ? Math.min(minute, 45) : Math.max(46, Math.min(minute - stoppage1, 90)));
  const extra = () => (half === 1 && minute > 45 ? minute - 45 : half === 2 && minute - stoppage1 > 90 ? minute - stoppage1 - 90 : 0);

  function shot(k, xgValue, kind, shooter) {
    const s = sides[k], d = sides[other(k)];
    const ud = units(other(k));
    shooter = shooter ?? pickWeighted(s, kind === 'header' ? HEADER_WEIGHT : SHOOTER_WEIGHT, kind === 'header' ? 'defending' : 'attack');
    if (!shooter) return [];
    s.shots++; s.xg += xgValue; shooter.st.shots++;
    const finishing = Math.exp(C.finishingPerPoint * (eff(shooter, 'attack') - 13));
    const keeping = Math.exp(-C.goalkeepingPerPoint * (ud.gk - 12));
    const pGoal = clamp(xgValue * finishing * keeping, 0.005, 0.95);
    const keeper = d.onPitch.find((x) => x.slot === 'GK');
    const out = [];
    if (rng.chance(pGoal)) {
      s.goals++; s.onTarget++; shooter.st.goals++; shooter.st.onTarget++;
      let assister = null;
      if (kind !== 'penalty' && rng.chance(C.assistedShare)) {
        assister = pickWeighted(s, ASSIST_WEIGHT, 'passing', shooter);
        if (assister) assister.st.assists++;
      }
      out.push(addEvent({ type: 'goal', team: k, player: shooter.player.id, assist: assister?.player.id ?? null, xg: round2(xgValue), kind, extra: extra() }));
    } else {
      const saved = rng.chance(clamp(0.3 + xgValue * 0.5, 0, 0.75));
      if (saved) { s.onTarget++; shooter.st.onTarget++; if (keeper) keeper.st.saves++; }
      out.push(addEvent({ type: saved ? 'save' : 'miss', team: k, player: shooter.player.id, keeper: saved ? keeper?.player.id : null, xg: round2(xgValue), kind, extra: extra() }));
      if (kind !== 'penalty' && rng.chance(saved ? C.cornerFromShot : C.cornerFromShot * 0.6)) out.push(...corner(k));
    }
    return out;
  }

  function corner(k) {
    sides[k].corners++;
    const out = [addEvent({ type: 'corner', team: k })];
    if (rng.chance(C.cornerShot.chance)) out.push(...shot(k, C.cornerShot.xg * rng.range(0.5, 1.6), 'header'));
    return out;
  }

  function foul(k) {
    const s = sides[k];
    const offender = rng.weighted(s.onPitch, (x) => (x.slot === 'GK' ? 0.05 : 1) * (1 + 0.3 * Math.max(0, normTactics(s.tactics).p)));
    if (!offender) return [];
    s.fouls++;
    const out = [];
    if (rng.chance(C.fouls.straightRedPerFoul)) {
      out.push(sendOff(k, offender, 'red'));
    } else if (rng.chance(C.fouls.yellowPerFoul)) {
      s.yellows++; offender.st.yellow++;
      if (offender.st.yellow >= 2) out.push(sendOff(k, offender, 'second-yellow'));
      else out.push(addEvent({ type: 'yellow', team: k, player: offender.player.id }));
    }
    return out;
  }

  function sendOff(k, x, how) {
    const s = sides[k];
    s.reds++; x.st.red = true; x.st.wentOff = minute;
    s.onPitch = s.onPitch.filter((y) => y !== x);
    // If the keeper goes, an outfield player goes in goal.
    if (x.slot === 'GK' && s.onPitch.length) {
      const stand = s.onPitch.reduce((a, b) => (eff(a, 'defending') < eff(b, 'defending') ? a : b));
      stand.slot = 'GK';
    }
    return addEvent({ type: 'red', team: k, player: x.player.id, how });
  }

  function injury(k, x) {
    x.st.injured = true;
    const ev = addEvent({ type: 'injury', team: k, player: x.player.id });
    // Forced substitution if possible, otherwise play on with ten.
    const s = sides[k];
    const sub = bestBenchFor(k, x.slot);
    if (sub && s.subsLeft > 0) doSub(k, x, sub, true);
    else { x.st.wentOff = minute; s.onPitch = s.onPitch.filter((y) => y !== x); }
    return ev;
  }

  function bestBenchFor(k, slot) {
    const s = sides[k];
    let best = null, bestScore = -Infinity;
    for (const b of s.bench) {
      const fit = slot === 'GK' ? (b.player.pos === 'GK' ? 1 : 0) : b.player.pos === 'GK' ? 0 : 1;
      if (!fit) continue;
      const score = b.player.overall + (b.player.pos === slotPos(slot) ? 3 : 0);
      if (score > bestScore) { best = b; bestScore = score; }
    }
    return best;
  }
  const slotPos = (slot) => ({ GK: 'GK', CB: 'DEF', FB: 'DEF', WB: 'DEF', DM: 'MID', CM: 'MID', AM: 'MID', W: 'MID', ST: 'FWD' }[slot]);

  function doSub(k, outX, inB, forced = false) {
    const s = sides[k];
    s.subsLeft--;
    outX.st.wentOff = minute;
    inB.st.cameOn = minute;
    const entry = { slot: outX.slot, player: inB.player, st: inB.st };
    s.onPitch = s.onPitch.map((y) => (y === outX ? entry : y));
    s.bench = s.bench.filter((b) => b !== inB);
    allStates.set(inB.player.id, { ...entry, side: s });
    return addEvent({ type: 'sub', team: k, playerOut: outX.player.id, playerIn: inB.player.id, forced });
  }

  function step() {
    if (finished) return [];
    minute++;
    const before = events.length;
    if (half === 1 && minute === 46 + stoppage1) {
      half = 2;
      addEvent({ type: 'half-time' });
    }

    const uh = units('home'), ua = units('away');
    const th = normTactics(sides.home.tactics), ta = normTactics(sides.away.tactics);
    const k = rng.chance(possessionHome(uh, ua, th, ta)) ? 'home' : 'away';
    const d = other(k);
    sides[k].possessionMins++;
    const uA = k === 'home' ? uh : ua, uD = k === 'home' ? ua : uh;
    const tA = k === 'home' ? th : ta, tD = k === 'home' ? ta : th;
    const xgBefore = sides.home.xg - sides.away.xg;

    // Fouls (mostly by the side without the ball).
    if (rng.chance(C.fouls.perMinute)) foul(rng.chance(C.fouls.defenderShare) ? d : k);

    // Penalty.
    const dominance = Math.exp(C.qualitySensitivity * ((0.55 * uA.attack + 0.45 * uA.creation) - uD.defence));
    if (rng.chance(C.penaltyPerMinute * dominance)) {
      const taker = sides[k].onPitch.reduce((a, b) => (eff(a, 'attack') > eff(b, 'attack') ? a : b), sides[k].onPitch[0]);
      addEvent({ type: 'penalty', team: k, player: taker?.player.id });
      shot(k, C.penaltyXg, 'penalty', taker);
    } else {
      // Open play.
      const mult = tacticalMultipliers(uA, uD, tA, tD);
      const home = sides[k].isHome ? C.homeAdvantage.shots : sides[d].isHome ? C.homeAdvantage.away : 1;
      const pShot = clamp(C.shotRate * dominance * mult.shot * home, 0, C.shotRateMax);
      if (rng.chance(pShot)) {
        const base = C.xg.base * Math.exp(C.xg.sensitivity * ((0.55 * uA.attack + 0.45 * uA.creation) - uD.defence)) * mult.xg;
        const xgValue = clamp(base * -Math.log(1 - rng.next() * 0.999), C.xg.min, C.xg.max);
        shot(k, xgValue, 'open');
      } else if (rng.chance(C.cornerPerMinute)) {
        corner(k);
      }
    }

    // Fatigue and injuries.
    for (const key of ['home', 'away']) {
      const s = sides[key];
      const t = normTactics(s.tactics);
      for (const x of [...s.onPitch]) {
        x.st.minutes++;
        const F = C.fatigue;
        const drain = F.perMinute * (1 + F.press * Math.max(0, t.p)) * (1 + F.tempo * Math.max(0, t.t))
          * (1 + F.perStaminaPoint * (F.staminaRef - (x.player.attrs.stamina ?? 11)));
        x.st.condition = Math.max(0, x.st.condition - drain * (x.slot === 'GK' ? 0.3 : 1));
        if (rng.chance(C.injuryPerPlayerMinute * (1 + (100 - x.st.condition) / 50))) injury(key, x);
      }
    }

    momentum.push(round2(sides.home.xg - sides.away.xg - xgBefore));
    if (minute >= totalMinutes) {
      finished = true;
      addEvent({ type: 'full-time' });
    }
    return events.slice(before);
  }

  function result() {
    const players = [];
    const hg = sides.home.goals, ag = sides.away.goals;
    for (const [id, x] of allStates) {
      const st = x.st;
      if (st.minutes === 0 && st.cameOn === null) continue;
      const k = x.side === sides.home ? 'home' : 'away';
      const conceded = k === 'home' ? ag : hg;
      const scored = k === 'home' ? hg : ag;
      const pos = x.player.pos;
      let r = 6.3 + (pos === 'FWD' ? 1.0 : 1.2) * st.goals + 0.7 * st.assists + 0.1 * st.onTarget + 0.15 * st.saves;
      if (conceded === 0 && st.minutes >= 60) r += pos === 'GK' || pos === 'DEF' ? 0.6 : pos === 'MID' ? 0.2 : 0;
      if (pos === 'GK' || pos === 'DEF') r -= Math.min(1.2, 0.25 * conceded);
      r += scored > conceded ? 0.3 : scored < conceded ? -0.2 : 0;
      r -= 0.3 * Math.min(1, st.yellow) + (st.red ? 1.5 : 0);
      r += (makeRng(`${seed}:${id}`).next() - 0.5) * 0.6;
      players.push({
        id, team: k, minutes: st.minutes, goals: st.goals, assists: st.assists, shots: st.shots,
        saves: st.saves, yellow: st.yellow, red: st.red, injured: st.injured,
        condition: Math.round(st.condition), rating: Math.round(clamp(r, 4, 10) * 10) / 10,
        cleanSheet: conceded === 0 && st.minutes >= 60,
      });
    }
    const motm = players.reduce((a, b) => (b.rating > (a?.rating ?? 0) ? b : a), null);
    const stat = (s) => ({
      goals: s.goals, shots: s.shots, onTarget: s.onTarget, xg: round2(s.xg),
      corners: s.corners, fouls: s.fouls, yellows: s.yellows, reds: s.reds,
    });
    const poss = sides.home.possessionMins + sides.away.possessionMins || 1;
    return {
      seed, home: sides.home.code, away: sides.away.code, homeGoals: hg, awayGoals: ag,
      stats: {
        home: { ...stat(sides.home), possession: Math.round(100 * sides.home.possessionMins / poss) },
        away: { ...stat(sides.away), possession: Math.round(100 * sides.away.possessionMins / poss) },
      },
      events, momentum, players, motm: motm?.id ?? null,
    };
  }

  return {
    get minute() { return displayMinute(); },
    get rawMinute() { return minute; },
    get finished() { return finished; },
    get score() { return [sides.home.goals, sides.away.goals]; },
    sides,
    step,
    result,
    units,
    setTactics(k, t) { sides[k].tactics = { ...sides[k].tactics, ...t }; addEvent({ type: 'tactics', team: k, tactics: { ...sides[k].tactics } }); },
    substitute(k, outId, inId) {
      const s = sides[k];
      const outX = s.onPitch.find((x) => x.player.id === outId);
      const inB = s.bench.find((b) => b.player.id === inId);
      if (!outX || !inB || s.subsLeft <= 0) return null;
      return doSub(k, outX, inB);
    },
  };
}

const round2 = (x) => Math.round(x * 100) / 100;

// Plays a whole match with an optional per-minute hook (used by AI managers).
export function simulateMatch(opts, onMinute) {
  const m = createMatch(opts);
  while (!m.finished) {
    m.step();
    if (onMinute) onMinute(m);
  }
  return m.result();
}
