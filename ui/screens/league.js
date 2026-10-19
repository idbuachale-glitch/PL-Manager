// League: table, player stats, fixtures by gameweek, and a final-table prediction.

import { h, cx } from '../dom.js';
import { game, ui, club } from '../store.js';
import { Crest, FormDots, Sheet, fmtDate, fmtTime } from '../components/common.js';
import { PlayerProfile } from '../components/profile.js';
import { table, leaders } from '../../engine/season.js';

const VIEWS = { table: 'Table', stats: 'Stats', fixtures: 'Fixtures' };

export function League(rerender) {
  return h('main', { class: 'screen league' },
    h('header', { class: 'bar' }, h('h1', null, 'League')),
    h('div', { class: 'seg wide', role: 'tablist' },
      Object.entries(VIEWS).map(([k, v]) => h('button', {
        class: cx('seg-btn', ui.leagueView === k && 'on'), role: 'tab', 'aria-selected': ui.leagueView === k ? 'true' : 'false',
        onClick: () => { ui.leagueView = k; rerender(); },
      }, v))),
    ui.leagueView === 'table' ? TableView(rerender) : ui.leagueView === 'stats' ? StatsView(rerender) : FixturesView(rerender));
}

function TableView(rerender) {
  const t = table(game);
  const prev = game.prevPositions ?? {};
  return h('div', null,
    h('div', { class: 'tbl', role: 'table', 'aria-label': 'League table' },
      h('div', { class: 'tr th', role: 'row' },
        h('span', { class: 'c-pos' }, '#'), h('span', { class: 'c-club' }, 'Club'),
        h('span', { class: 'c-n' }, 'P'), h('span', { class: 'c-n' }, 'GD'), h('span', { class: 'c-pts' }, 'Pts')),
      t.map((r, i) => {
        const was = prev[r.code];
        const move = was && r.p ? was - (i + 1) : 0;
        return h('div', { class: cx('tr', r.code === game.userClub && 'me', i === 3 && 'cut-ucl', i === 16 && 'cut-rel'), role: 'row' },
          h('span', { class: 'c-pos' }, i + 1,
            move > 0 ? h('span', { class: 'mv up', 'aria-label': `up ${move}` }, '▲') : move < 0 ? h('span', { class: 'mv down', 'aria-label': `down ${-move}` }, '▼') : h('span', { class: 'mv' }, '')),
          h('span', { class: 'c-club' }, Crest(r.code, 22),
            h('span', { class: 'c-name' }, h('span', null, r.short), r.form.length ? FormDots(r.form) : null)),
          h('span', { class: 'c-n' }, r.p), h('span', { class: 'c-n' }, r.gd > 0 ? `+${r.gd}` : r.gd),
          h('span', { class: 'c-pts' }, r.pts));
      })),
    h('p', { class: 'legend muted small' }, h('span', { class: 'lg lg-ucl' }), 'Champions League places', h('span', { class: 'lg lg-rel' }), 'Relegation'),
    h('button', { class: 'btn-ghost full', onClick: () => predict(rerender) }, 'Predict the final table'));
}

function StatsView(rerender) {
  const list = (title, key, unit) => {
    const rows = leaders(game, key, 10).filter((p) => key !== 'cleanSheets' || p.pos === 'GK');
    return h('section', { class: 'leaders' },
      h('h2', null, title),
      rows.length ? h('ol', null, rows.map((p, i) => h('li', null,
        h('button', { class: 'lrow', onClick: () => { ui.sheet = () => Sheet(PlayerProfile(p), () => { ui.sheet = null; rerender(); }); rerender(); } },
          h('span', { class: 'l-rank muted' }, i + 1), Crest(p.teamCode, 20),
          h('span', { class: 'l-name' }, p.webName),
          h('span', { class: 'l-val' }, p.season[key], h('span', { class: 'muted small' }, ` ${unit}`)))))) : h('p', { class: 'muted' }, 'No games played yet.'));
  };
  return h('div', null, list('Top scorers', 'goals', 'goals'), list('Assists', 'assists', 'assists'), list('Clean sheets', 'cleanSheets', 'clean sheets'));
}

function FixturesView(rerender) {
  const gw = ui.fixturesGw ?? Math.min(game.gw, game.maxGw);
  const list = game.fixtures.filter((f) => f.gw === gw);
  const go = (d) => { ui.fixturesGw = Math.max(1, Math.min(game.maxGw, gw + d)); rerender(); };
  return h('div', null,
    h('div', { class: 'gw-step' },
      h('button', { class: 'btn-icon', onClick: () => go(-1), disabled: gw <= 1, 'aria-label': 'Previous gameweek' }, '‹'),
      h('span', { class: 'gw-label' }, `Gameweek ${gw}`),
      h('button', { class: 'btn-icon', onClick: () => go(1), disabled: gw >= game.maxGw, 'aria-label': 'Next gameweek' }, '›')),
    h('ul', { class: 'fixtures' }, list.map((f) => h('li', { class: cx('fx', (f.home === game.userClub || f.away === game.userClub) && 'me') },
      h('span', { class: 'fx-team' }, h('span', { class: 'fx-n' }, club(f.home).short), Crest(f.home, 24)),
      f.result
        ? h('span', { class: 'fx-score' }, `${f.result.homeGoals}–${f.result.awayGoals}`)
        : h('span', { class: 'fx-time muted small' }, fmtDate(f.kickoff, { day: 'numeric', month: 'short' }), h('br'), fmtTime(f.kickoff)),
      h('span', { class: 'fx-team away' }, Crest(f.away, 24), h('span', { class: 'fx-n' }, club(f.away).short))))));
}

function predict(rerender) {
  const RUNS = 12;
  let progress = 0, rows = null;
  const close = () => { worker.terminate(); ui.sheet = null; rerender(); };
  const view = () => Sheet(h('div', { class: 'predict' },
    h('h2', null, 'Predicted final table'),
    rows ? h('p', { class: 'muted small' }, `Average of ${RUNS} simulations of the remaining matches.`) : null,
    rows
      ? h('ol', { class: 'pred' }, rows.map((r, i) => h('li', { class: cx(r.code === game.userClub && 'me') },
        h('span', { class: 'l-rank muted' }, i + 1), Crest(r.code, 20), h('span', { class: 'l-name' }, club(r.code).name),
        h('span', { class: 'muted small' }, r.best === r.worst ? `${r.best}` : `${r.best}–${r.worst}`),
        h('span', { class: 'l-val' }, r.pts))))
      : h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': Math.round(progress * 100) },
        h('span', { style: { width: `${progress * 100}%` } })),
    h('button', { class: 'btn-primary', onClick: close }, rows ? 'Done' : 'Cancel')), close);
  const worker = new Worker(new URL('../predict-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    if (e.data.progress != null) progress = e.data.progress;
    if (e.data.done) rows = e.data.done;
    rerender();
  };
  worker.postMessage({ state: JSON.parse(JSON.stringify(game)), runs: RUNS });
  ui.sheet = view;
  rerender();
}
