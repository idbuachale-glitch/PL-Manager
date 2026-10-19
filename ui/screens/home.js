// Home: next match, play button, league position, news and a tip.

import { h, cx } from '../dom.js';
import { game, ui, club, nextUserFixture, playNextMatch, simRestOfSeason, positions, squadOf, quitToMenu } from '../store.js';
import { Crest, FormDots, fmtDate, fmtTime, Sheet } from '../components/common.js';
import { table } from '../../engine/season.js';
import { squadStrength } from '../../engine/ai.js';
import { assistantTip } from '../lib/news.js';

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] ?? 'th'}`;

export function Home(rerender) {
  const f = nextUserFixture();
  const t = table(game);
  const row = (code) => t.find((r) => r.code === code);
  const pos = positions();
  const me = row(game.userClub);
  const played = me.p > 0;

  const strengths = f ? {
    us: squadStrength(squadOf(game, game.userClub)),
    them: squadStrength(squadOf(game, f.home === game.userClub ? f.away : f.home)),
  } : null;

  return h('main', { class: 'screen home' },
    h('header', { class: 'top' },
      Crest(game.userClub, 34),
      h('div', null,
        h('h1', { class: 'club-title' }, club(game.userClub).name),
        h('p', { class: 'muted small' }, played ? `${ordinal(pos[game.userClub])} in the table, ${me.pts} pts from ${me.p} games` : 'Season 2026/27, not started'))),

    f ? NextMatch(f, row, pos, rerender) : SeasonDone(t),

    f ? h('div', { class: 'quick' },
      h('button', { class: 'btn-ghost', onClick: () => { if (confirm('Simulate every remaining match, including yours?')) { simRestOfSeason(); rerender(); } } }, 'Sim rest of season')) : null,

    h('section', { class: 'tip' },
      h('span', { class: 'tip-who' }, 'Assistant'),
      h('p', null, assistantTip(game, f, strengths ?? { us: 0, them: 0 }))),

    h('section', { class: 'news' },
      h('h2', null, 'News'),
      h('ul', null, game.news.slice(0, 4).map((n) => h('li', { class: cx('news-item', `k-${n.kind}`) },
        h('span', { class: 'news-gw muted small' }, n.gw ? `GW${n.gw}` : 'Pre-season'),
        h('p', null, n.text))))),

    h('div', { class: 'settings-row' },
      h('button', { class: 'link danger', onClick: () => { if (confirm('Start a new game? Your current season will be deleted.')) quitToMenu(); } }, 'Start a new game')));
}

function NextMatch(f, row, pos, rerender) {
  const home = row(f.home), away = row(f.away);
  const side = (code, r) => h('div', { class: 'nm-side' },
    Crest(code, 64),
    h('span', { class: 'nm-name' }, club(code).name),
    r.p ? h('span', { class: 'muted small' }, ordinal(pos[code])) : null,
    r.form.length ? FormDots(r.form) : null);

  return h('section', { class: 'next-match', 'aria-label': 'Next match' },
    h('p', { class: 'nm-when' }, `Gameweek ${f.gw}`, h('span', { class: 'muted' }, ` ${fmtDate(f.kickoff)}, ${fmtTime(f.kickoff)}`)),
    h('div', { class: 'nm-teams' }, side(f.home, home), h('span', { class: 'nm-v' }, 'v'), side(f.away, away)),
    h('button', {
      class: 'btn-play',
      onClick: () => {
        const out = playNextMatch();
        if (out) { ui.sheet = () => ResultSheet(out); }
        rerender();
      },
    }, 'Play next match'));
}

function SeasonDone(t) {
  const champ = t[0];
  return h('section', { class: 'next-match done' },
    h('p', { class: 'nm-when' }, 'Season complete'),
    h('div', { class: 'nm-teams' }, h('div', { class: 'nm-side' }, Crest(champ.code, 72), h('span', { class: 'nm-name' }, `${champ.name} are champions`))),
    h('p', { class: 'muted center' }, 'End-of-season awards and the next season arrive in a later update.'));
}

// Instant result for now; the live match day screen replaces this in stage 5.
export function ResultSheet({ fixture: f, result: r, others }) {
  const close = () => { ui.sheet = null; document.dispatchEvent(new Event('rerender')); };
  const goals = (team) => r.events.filter((e) => e.type === 'goal' && e.team === team)
    .map((e) => `${game.players[e.player]?.webName ?? ''} ${e.minute}'${e.extra ? `+${e.extra}` : ''}${e.kind === 'penalty' ? ' (pen)' : ''}`);
  const motm = game.players[r.motm];
  const s = r.stats;
  return Sheet(h('div', { class: 'result' },
    h('p', { class: 'muted small center' }, `Full time, gameweek ${f.gw}`),
    h('div', { class: 'score-row' },
      h('div', { class: 'sr-side' }, Crest(f.home, 48), h('span', null, club(f.home).short)),
      h('div', { class: 'sr-score' }, `${r.homeGoals}`, h('span', { class: 'sr-dash' }, '–'), `${r.awayGoals}`),
      h('div', { class: 'sr-side' }, Crest(f.away, 48), h('span', null, club(f.away).short))),
    h('div', { class: 'scorers' },
      h('ul', null, goals('home').map((g) => h('li', null, g))),
      h('ul', { class: 'right' }, goals('away').map((g) => h('li', null, g)))),
    h('div', { class: 'mini-stats' },
      statLine('Possession', `${s.home.possession}%`, `${s.away.possession}%`),
      statLine('Shots', s.home.shots, s.away.shots),
      statLine('On target', s.home.onTarget, s.away.onTarget),
      statLine('xG', s.home.xg.toFixed(1), s.away.xg.toFixed(1))),
    motm ? h('p', { class: 'motm' }, 'Player of the match: ', h('strong', null, motm.webName)) : null,
    h('h3', null, 'Other results'),
    h('ul', { class: 'others' }, others.map((o) => h('li', null,
      Crest(o.home, 20), h('span', { class: 'o-name' }, club(o.home).short),
      h('span', { class: 'o-score' }, `${o.homeGoals}–${o.awayGoals}`),
      h('span', { class: 'o-name right' }, club(o.away).short), Crest(o.away, 20)))),
    h('button', { class: 'btn-primary', onClick: close }, 'Continue')), close, { title: 'Result' });
}

const statLine = (label, a, b) => h('div', { class: 'stat-line' }, h('span', null, a), h('span', { class: 'muted small' }, label), h('span', null, b));
