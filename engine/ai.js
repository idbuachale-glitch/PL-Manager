// How computer-controlled managers pick tactics and react during matches.

import { PRESETS } from './tactics.js';
import { makeRng } from './rng.js';

// Average overall of a squad's best eleven available players.
export function squadStrength(squad) {
  const top = squad.filter((p) => !(p.dyn?.injuredFor > 0) && !(p.dyn?.suspendedFor > 0))
    .map((p) => p.overallExact ?? p.overall).sort((a, b) => b - a).slice(0, 11);
  return top.length ? top.reduce((a, b) => a + b, 0) / top.length : 8;
}

// Pre-match tactics from how strong we are compared with the opponent.
export function chooseTactics(ours, theirs, isHome, seed) {
  const rng = makeRng(seed);
  const edge = ours - theirs + (isHome ? 0.6 : -0.3);
  let base;
  if (edge > 2.5) base = rng.chance(0.5) ? PRESETS['Possession'] : PRESETS['High press'];
  else if (edge > 0.8) base = rng.chance(0.6) ? PRESETS['Possession'] : PRESETS['Balanced'];
  else if (edge > -0.8) base = PRESETS['Balanced'];
  else if (edge > -2.5) base = rng.chance(0.6) ? PRESETS['Counter attack'] : PRESETS['Balanced'];
  else base = rng.chance(0.5) ? PRESETS['Park the bus'] : PRESETS['Counter attack'];
  // A little variety so every club doesn't play identically.
  const j = () => rng.int(-8, 8);
  const c = (v) => Math.max(0, Math.min(100, v));
  return {
    mentality: c(base.mentality + j()), pressing: c(base.pressing + j()),
    tempo: c(base.tempo + j()), width: c(base.width + j()),
  };
}

// Called every minute for an AI-managed side: chase or protect the score, and use subs.
export function aiInMatch(m, key, start) {
  const s = m.sides[key];
  const min = m.rawMinute;
  const [hg, ag] = m.score;
  const diff = key === 'home' ? hg - ag : ag - hg;

  if (min === 60 || min === 75) {
    const t = { ...s.tactics };
    if (diff < 0) { t.mentality = Math.min(95, t.mentality + 20); t.tempo = Math.min(90, t.tempo + 10); }
    else if (diff > 0 && min === 75) { t.mentality = Math.max(15, t.mentality - 20); t.pressing = Math.max(20, t.pressing - 15); }
    else if (diff === 0 && min === 75) t.mentality = Math.min(80, start.mentality + 10);
    if (t.mentality !== s.tactics.mentality || t.tempo !== s.tactics.tempo || t.pressing !== s.tactics.pressing) m.setTactics(key, t);
  }

  // Substitutions: replace the most tired outfield players at 60, 70 and 80 minutes.
  if ((min === 60 || min === 70 || min === 80) && s.subsLeft > 1) {
    const tired = s.onPitch.filter((x) => x.slot !== 'GK' && x.st.condition < 72)
      .sort((a, b) => a.st.condition - b.st.condition).slice(0, min === 60 ? 2 : 1);
    for (const x of tired) {
      const want = x.player.pos;
      const inB = s.bench.filter((b) => b.player.pos !== 'GK')
        .sort((a, b) => (b.player.pos === want) - (a.player.pos === want) || b.player.overall - a.player.overall)[0];
      if (inB && s.subsLeft > 1) m.substitute(key, x.player.id, inB.player.id);
    }
  }
}
