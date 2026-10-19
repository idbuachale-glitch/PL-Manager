// Home: matchday card, board, fixtures, squad status, table snapshot, last result, news.

import { h, cx } from '../dom.js';
import { game, ui, club, nextUserFixture, playNextMatch, simRestOfSeason, positions, squadOf, quitToMenu, userFixtures, save, BOARD_GOALS } from '../store.js';
import { Crest, FormDots, fmtDate, fmtTime, Sheet } from '../components/common.js';
import { Icon } from '../components/icons.js';
import { table } from '../../engine/season.js';
import { squadStrength } from '../../engine/ai.js';
import { assistantTip } from '../lib/news.js';
import { projection, comparison } from '../lib/odds.js';

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] ?? 'th'}`;
const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? 'Good morning, boss' : hr < 18 ? 'Good afternoon, boss' : 'Good evening, boss'; };

export function Card(icon, title, body, action) {
  return h('section', { class: 'card' },
    h('header', { class: 'card-head' },
      h('span', { class: 'card-ic' }, Icon(icon, 18)),
      h('h2', null, title),
      action ? h('button', { class: 'card-act', onClick: action.onClick }, action.label, Icon('chevron', 16)) : null),
    body);
}

export function Home(rerender) {
  const f = nextUserFixture();
  const t = table(game);
  const pos = positions();
  const me = t.find((r) => r.code === game.userClub);
  const go = (tab, extra) => () => { ui.tab = tab; Object.assign(ui, extra ?? {}); rerender(); };

  return h('main', { class: 'screen home' },
    h('header', { class: 'top' },
      Crest(game.userClub, 40),
      h('div', null,
        h('p', { class: 'muted small' }, greeting()),
        h('h1', { class: 'club-title' }, club(game.userClub).name),
        h('p', { class: 'muted small' }, me.p ? `${ordinal(pos[game.userClub])} in the league with ${me.pts} points` : 'Your first season starts soon'))),

    !game.welcomed ? Welcome(rerender) : null,
    f ? Matchday(f, t, pos, rerender, go) : SeasonDone(t),
    BoardCard(),
    f ? ComingUp() : null,
    SquadStatus(go),
    me.p ? TableSnap(t, go) : null,
    game.lastResult ? LastResult(rerender) : null,
    NewsCard(),

    h('div', { class: 'home-foot' },
      f ? h('button', { class: 'link', onClick: () => { if (confirm('Simulate every remaining match, including yours?')) { simRestOfSeason(); rerender(); } } }, 'Simulate the rest of the season') : null,
      h('button', { class: 'link danger', onClick: () => { if (confirm('Start a new game? Your current season will be deleted.')) quitToMenu(); } }, 'Start a new game')));
}

function Welcome(rerender) {
  const steps = [
    ['squad', 'Pick your team', 'Squad tab: tap a spot on the pitch, then a player.'],
    ['tactics', 'Choose your style', 'Tactics tab: formation, presets and four sliders.'],
    ['play', 'Play the match', 'Tap Play next match below. Your assistant will help.'],
  ];
  return h('section', { class: 'welcome' },
    h('h2', null, `Welcome to ${club(game.userClub).name}`),
    h('p', { class: 'muted' }, 'Three things to know before your first match:'),
    h('ol', { class: 'steps' }, steps.map(([ic, title, text]) => h('li', null,
      h('span', { class: 'step-ic' }, Icon(ic, 18)),
      h('span', null, h('strong', null, title), h('span', { class: 'muted small block' }, text))))),
    h('button', { class: 'btn-soft', onClick: () => { game.welcomed = true; save(); rerender(); } }, 'Got it'));
}

function Matchday(f, t, pos, rerender, go) {
  const row = (code) => t.find((r) => r.code === code);
  const home = row(f.home), away = row(f.away);
  const userIsHome = f.home === game.userClub;
  const opp = userIsHome ? f.away : f.home;
  const side = (code, r) => h('div', { class: 'nm-side' },
    Crest(code, 68),
    h('span', { class: 'nm-name' }, club(code).name),
    h('span', { class: 'nm-sub' }, r.p ? ordinal(pos[code]) : ' '),
    r.form.length ? FormDots(r.form) : null);

  // Win chances arrive from the worker.
  const odds = h('div', { class: 'nm-odds' }, h('div', { class: 'wdl wdl-loading' }), h('p', { class: 'nm-odds-l' }, 'Working out your chances…'));
  projection(f).then((r) => {
    const pct = (x) => `${Math.round(x * 100)}%`;
    odds.replaceChildren(
      h('div', { class: 'wdl', role: 'img', 'aria-label': `Win ${pct(r.win)}, draw ${pct(r.draw)}, loss ${pct(r.loss)}` },
        h('span', { class: 'wdl-w', style: { flex: r.win } }), h('span', { class: 'wdl-d', style: { flex: r.draw } }), h('span', { class: 'wdl-l', style: { flex: r.loss } })),
      h('div', { class: 'wdl-labels on-pitch' },
        h('span', null, h('strong', null, pct(r.win)), ' win'), h('span', null, h('strong', null, pct(r.draw)), ' draw'), h('span', null, h('strong', null, pct(r.loss)), ' loss')));
  });

  const cmp = comparison(f);
  const strengths = { us: squadStrength(squadOf(game, game.userClub)), them: squadStrength(squadOf(game, opp)) };

  return h('section', { class: 'next-match', 'aria-label': 'Next match' },
    h('p', { class: 'nm-when' }, `Gameweek ${f.gw}, ${userIsHome ? 'home' : 'away'}`),
    h('p', { class: 'nm-date' }, `${fmtDate(f.kickoff)} at ${fmtTime(f.kickoff)}`),
    h('div', { class: 'nm-teams' }, side(f.home, home), h('span', { class: 'nm-v' }, 'v'), side(f.away, away)),
    odds,
    h('div', { class: 'cmp' }, cmp.map(([label, us, them]) => {
      const a = userIsHome ? us : them, b = userIsHome ? them : us;
      const share = a / (a + b);
      return h('div', { class: 'cmp-row' },
        h('span', { class: cx('cmp-v', a >= b && 'lead') }, a.toFixed(1)),
        h('span', { class: 'cmp-bar' },
          h('span', { class: 'cmp-l', style: { width: `${share * 100}%` } }),
          h('span', { class: 'cmp-label' }, label)),
        h('span', { class: cx('cmp-v', b > a && 'lead') }, b.toFixed(1)));
    })),
    h('div', { class: 'nm-tip' }, h('span', { class: 'tip-ic' }, Icon('chat', 16)), h('p', null, assistantTip(game, f, strengths))),
    h('button', {
      class: 'btn-play',
      onClick: () => {
        const out = playNextMatch();
        if (out) ui.sheet = () => ResultSheet(out);
        rerender();
      },
    }, Icon('play', 18, 'ic-fill'), ' Play next match'),
    h('button', { class: 'btn-onpitch', onClick: go('tactics') }, 'Adjust tactics first'));
}

function BoardCard() {
  const b = game.board;
  if (!b) return null;
  const c = b.confidence;
  const mood = c >= 80 ? 'Delighted' : c >= 60 ? 'Happy' : c >= 45 ? 'Content' : c >= 25 ? 'Worried' : 'Losing patience';
  return Card('board', 'The board', h('div', { class: 'board' },
    h('p', null, 'Season target: ', h('strong', null, BOARD_GOALS[b.goal].text)),
    h('div', { class: 'meter', role: 'meter', 'aria-valuenow': c, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Board confidence' },
      h('span', { class: cx('meter-fill', c < 25 ? 'bad' : c < 45 ? 'warn' : ''), style: { width: `${c}%` } })),
    h('p', { class: 'muted small' }, `Confidence: ${mood}`)));
}

function ComingUp() {
  const ranked = Object.keys(game.clubs).map((c) => [Number(c), squadStrength(squadOf(game, Number(c)))]).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const next = userFixtures().filter((x) => !x.result).slice(0, 5);
  const diff = (code) => { const r = ranked.indexOf(code); return r < 4 ? 'hard' : r < 9 ? 'tough' : r < 15 ? 'fair' : 'easy'; };
  return Card('calendar', 'Coming up', h('ul', { class: 'upcoming' }, next.map((x) => {
    const home = x.home === game.userClub;
    const opp = home ? x.away : x.home;
    return h('li', { class: cx('upc', `d-${diff(opp)}`) },
      Crest(opp, 32),
      h('span', { class: 'up-n' }, club(opp).short),
      h('span', { class: 'up-ha' }, home ? 'Home' : 'Away'),
      h('span', { class: 'up-gw muted' }, `GW${x.gw}`));
  })), null);
}

function SquadStatus(go) {
  const squad = squadOf(game, game.userClub);
  const injured = squad.filter((p) => p.dyn.injuredFor > 0);
  const banned = squad.filter((p) => p.dyn.suspendedFor > 0);
  const tired = squad.filter((p) => !p.dyn.injuredFor && p.dyn.condition < 75).sort((a, b) => a.dyn.condition - b.dyn.condition);
  const line = (icon, cls, label, list, extra) => list.length ? h('li', { class: 'ss-row' },
    h('span', { class: cx('ss-ic', cls) }, Icon(icon, 16)),
    h('span', null, h('strong', null, `${list.length} ${label}`), h('span', { class: 'muted small block' }, list.slice(0, 4).map(extra).join(', ') + (list.length > 4 ? ' and more' : '')))) : null;
  const rows = [
    line('medical', 'inj', injured.length === 1 ? 'injured' : 'injured', injured, (p) => `${p.webName} (${p.dyn.injuredFor} wk)`),
    line('card', 'ban', 'suspended', banned, (p) => p.webName),
    line('battery', 'tired', tired.length === 1 ? 'needs a rest' : 'need a rest', tired, (p) => `${p.webName} ${Math.round(p.dyn.condition)}%`),
  ].filter(Boolean);
  return Card('squad', 'Squad status',
    rows.length ? h('ul', { class: 'ss' }, rows) : h('p', { class: 'good-news' }, 'Everyone is fit and available.'),
    { label: 'Squad', onClick: go('squad') });
}

function TableSnap(t, go) {
  const i = t.findIndex((r) => r.code === game.userClub);
  const start = Math.max(0, Math.min(t.length - 5, i - 2));
  return Card('league', 'League table', h('ol', { class: 'snap' }, t.slice(start, start + 5).map((r, k) => h('li', { class: cx(r.code === game.userClub && 'me') },
    h('span', { class: 'snap-pos' }, start + k + 1), Crest(r.code, 22), h('span', { class: 'snap-n' }, r.name),
    h('span', { class: 'muted small' }, `${r.gd > 0 ? '+' : ''}${r.gd}`), h('span', { class: 'snap-pts' }, r.pts)))),
  { label: 'Full table', onClick: go('league', { leagueView: 'table' }) });
}

function LastResult(rerender) {
  const { fixture: f, result: r } = game.lastResult;
  const home = f.home === game.userClub;
  const us = home ? r.homeGoals : r.awayGoals, them = home ? r.awayGoals : r.homeGoals;
  const outcome = us > them ? 'win' : us < them ? 'loss' : 'draw';
  return Card('whistle', 'Last result', h('button', { class: cx('last', `o-${outcome}`), onClick: () => { ui.sheet = () => ResultSheet(game.lastResult); rerender(); } },
    Crest(f.home, 28), h('span', { class: 'last-n' }, club(f.home).short),
    h('span', { class: 'last-score' }, `${r.homeGoals}–${r.awayGoals}`),
    h('span', { class: 'last-n' }, club(f.away).short), Crest(f.away, 28),
    h('span', { class: 'last-tag' }, outcome === 'win' ? 'Won' : outcome === 'loss' ? 'Lost' : 'Drew')), null);
}

function NewsCard() {
  return Card('news', 'News', h('ul', { class: 'news' }, game.news.slice(0, 5).map((n) => h('li', { class: cx('news-item', `k-${n.kind}`) },
    h('span', { class: 'news-dot', 'aria-hidden': 'true' }),
    h('p', null, n.text, h('span', { class: 'muted small block' }, n.gw ? `Gameweek ${n.gw}` : 'Pre-season'))))), null);
}

function SeasonDone(t) {
  const champ = t[0];
  return h('section', { class: 'next-match done' },
    h('p', { class: 'nm-when' }, 'Season complete'),
    h('div', { class: 'nm-teams one' }, h('div', { class: 'nm-side' }, Crest(champ.code, 76), h('span', { class: 'nm-name' }, `${champ.name} are champions`))),
    h('p', { class: 'nm-date' }, 'Awards and next season arrive in a later update.'));
}

// Instant result for now; the live match day screen replaces this in stage 5.
export function ResultSheet({ fixture: f, result: r, others }) {
  const close = () => { ui.sheet = null; document.dispatchEvent(new Event('rerender')); };
  const goals = (team) => r.events.filter((e) => e.type === 'goal' && e.team === team)
    .map((e) => `${game.players[e.player]?.webName ?? ''} ${e.minute}'${e.extra ? `+${e.extra}` : ''}${e.kind === 'penalty' ? ' (pen)' : ''}`);
  const motm = game.players[r.motm];
  const s = r.stats;
  const home = f.home === game.userClub;
  const us = home ? r.homeGoals : r.awayGoals, them = home ? r.awayGoals : r.homeGoals;
  const headline = us > them ? 'Three points!' : us < them ? 'A defeat this time' : 'A point apiece';
  return Sheet(h('div', { class: 'result' },
    h('p', { class: cx('result-head', us > them ? 'win' : us < them ? 'loss' : 'draw') }, headline),
    h('p', { class: 'muted small center' }, `Full time, gameweek ${f.gw}`),
    h('div', { class: 'score-row' },
      h('div', { class: 'sr-side' }, Crest(f.home, 52), h('span', null, club(f.home).short)),
      h('div', { class: 'sr-score' }, `${r.homeGoals}`, h('span', { class: 'sr-dash' }, '–'), `${r.awayGoals}`),
      h('div', { class: 'sr-side' }, Crest(f.away, 52), h('span', null, club(f.away).short))),
    h('div', { class: 'scorers' },
      h('ul', null, goals('home').map((g) => h('li', null, g))),
      h('ul', { class: 'right' }, goals('away').map((g) => h('li', null, g)))),
    h('div', { class: 'mini-stats' },
      statLine('Possession', `${s.home.possession}%`, `${s.away.possession}%`),
      statLine('Shots', s.home.shots, s.away.shots),
      statLine('On target', s.home.onTarget, s.away.onTarget),
      statLine('Expected goals', s.home.xg.toFixed(1), s.away.xg.toFixed(1))),
    motm ? h('p', { class: 'motm' }, Icon('star', 18, 'ic-star'), ' Player of the match: ', h('strong', null, motm.webName)) : null,
    others?.length ? h('h3', null, 'Around the league') : null,
    h('ul', { class: 'others' }, (others ?? []).map((o) => h('li', null,
      Crest(o.home, 22), h('span', { class: 'o-name' }, club(o.home).short),
      h('span', { class: 'o-score' }, `${o.homeGoals}–${o.awayGoals}`),
      h('span', { class: 'o-name right' }, club(o.away).short), Crest(o.away, 22)))),
    h('button', { class: 'btn-primary', onClick: close }, 'Continue')), close, { title: 'Result' });
}

const statLine = (label, a, b) => h('div', { class: 'stat-line' }, h('span', null, a), h('span', { class: 'muted small' }, label), h('span', null, b));
