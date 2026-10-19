// Short weekly headlines.

import { table } from '../../engine/season.js';

const name = (game, code) => game.clubs[code]?.name ?? '';
const pname = (game, id) => game.players[id]?.webName ?? '';

export function makeNews(game, ctx) {
  const items = [];
  const gw = ctx?.fixture?.gw ?? 0;
  const user = game.userClub;

  if (!ctx) {
    const first = game.fixtures.find((f) => f.home === user || f.away === user);
    if (first) {
      const home = first.home === user;
      items.push({ gw: 0, kind: 'club', text: `Season opener: ${name(game, user)} ${home ? 'host' : 'visit'} ${name(game, home ? first.away : first.home)}.` });
    }
    items.push({ gw: 0, kind: 'league', text: 'The 2026/27 Premier League season is about to begin.' });
    return items;
  }

  // Our result.
  const { fixture: f, result: r, others } = ctx;
  const home = f.home === user;
  const us = home ? r.homeGoals : r.awayGoals, them = home ? r.awayGoals : r.homeGoals;
  const opp = name(game, home ? f.away : f.home);
  const ourScorers = r.events.filter((e) => e.type === 'goal' && e.team === (home ? 'home' : 'away')).map((e) => pname(game, e.player));
  const scorerText = ourScorers.length ? ` Goals: ${[...new Set(ourScorers)].map((n) => `${n}${ourScorers.filter((x) => x === n).length > 1 ? ` (${ourScorers.filter((x) => x === n).length})` : ''}`).join(', ')}.` : '';
  const verb = us > them ? (us - them >= 3 ? 'thrash' : 'beat') : us < them ? 'lose to' : 'draw with';
  items.push({ gw, kind: us > them ? 'win' : us < them ? 'loss' : 'draw', text: `${name(game, user)} ${verb} ${opp} ${us}–${them}.${scorerText}` });

  // Biggest result elsewhere.
  const big = [...others].sort((a, b) => Math.abs(b.homeGoals - b.awayGoals) - Math.abs(a.homeGoals - a.awayGoals))[0];
  if (big && Math.abs(big.homeGoals - big.awayGoals) >= 3) {
    const winner = big.homeGoals > big.awayGoals ? big.home : big.away;
    const loser = winner === big.home ? big.away : big.home;
    items.push({ gw, kind: 'league', text: `${name(game, winner)} hit ${Math.max(big.homeGoals, big.awayGoals)} past ${name(game, loser)}.` });
  }

  // Hat-tricks.
  for (const res of [r, ...others]) {
    const counts = {};
    for (const e of res.events) if (e.type === 'goal') counts[e.player] = (counts[e.player] ?? 0) + 1;
    for (const [id, n] of Object.entries(counts)) if (n >= 3) items.push({ gw, kind: 'league', text: `Hat-trick for ${pname(game, id)}.` });
  }

  // Our injuries and bans.
  for (const p of r.players) {
    const pl = game.players[p.id];
    if (pl?.teamCode !== user) continue;
    if (p.injured) items.push({ gw, kind: 'injury', text: `${pl.webName} is injured and will miss about ${pl.dyn.injuredFor} ${pl.dyn.injuredFor === 1 ? 'week' : 'weeks'}.` });
    if (p.red) items.push({ gw, kind: 'ban', text: `${pl.webName} was sent off and is suspended for ${pl.dyn.suspendedFor} ${pl.dyn.suspendedFor === 1 ? 'match' : 'matches'}.` });
    else if (pl.dyn.suspendedFor > 0 && p.yellow) items.push({ gw, kind: 'ban', text: `${pl.webName} picks up a ban for collecting yellow cards.` });
  }

  // Top of the table.
  const t = table(game);
  if (gw >= 3) items.push({ gw, kind: 'league', text: `${t[0].name} lead the table on ${t[0].pts} points${t[1] ? `, ${t[0].pts - t[1].pts} ahead of ${t[1].name}` : ''}.` });
  return items;
}

// One short tip from the assistant manager about the next match.
export function assistantTip(game, nextFixture, strengths) {
  if (!nextFixture) return 'The season is over. Well played.';
  const user = game.userClub;
  const squad = game.clubs[user].playerIds.map((id) => game.players[id]);
  const tired = squad.filter((p) => p.dyn.condition < 75 && !p.dyn.injuredFor);
  const out = squad.filter((p) => p.dyn.injuredFor > 0 || p.dyn.suspendedFor > 0);
  const opp = nextFixture.home === user ? nextFixture.away : nextFixture.home;
  const diff = strengths.us - strengths.them;
  if (tired.length >= 2) return `${tired.slice(0, 2).map((p) => p.webName).join(' and ')} are tired. Consider resting them.`;
  if (out.length >= 3) return `${out.length} players are unavailable. Check the line-up before kick-off.`;
  if (diff > 1.5) return `${game.clubs[opp].name} are weaker on paper. Take the game to them.`;
  if (diff < -1.5) return `${game.clubs[opp].name} are stronger. A compact, counter-attacking approach could work.`;
  return `This one looks even. Small details will decide it.`;
}
