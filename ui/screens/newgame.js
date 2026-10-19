// Start screen: choose a club and difficulty.

import { h, cx } from '../dom.js';
import { data, newGame } from '../store.js';
import { Crest } from '../components/common.js';
import { squadStrength } from '../../engine/ai.js';

let picked = null;
let difficulty = 'normal';

export function NewGame(rerender) {
  const clubs = [...data.clubs].sort((a, b) => a.name.localeCompare(b.name));
  const strength = (code) => squadStrength(data.players.filter((p) => p.teamCode === code));
  const ranked = [...data.clubs].map((c) => [c.code, strength(c.code)]).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const tier = (code) => {
    const i = ranked.indexOf(code);
    return i < 3 ? 'Title contender' : i < 7 ? 'Chasing Europe' : i < 15 ? 'Mid-table' : 'Fighting relegation';
  };

  return h('main', { class: 'newgame' },
    h('header', { class: 'ng-head' },
      h('h1', { class: 'wordmark' }, 'PL Manager'),
      h('p', { class: 'muted' }, 'Premier League 2026/27. Pick your club.')),
    h('ul', { class: 'club-grid' },
      clubs.map((c) => h('li', null,
        h('button', {
          class: cx('club-pick', picked === c.code && 'picked'),
          onClick: () => { picked = c.code; rerender(); },
          'aria-pressed': picked === c.code ? 'true' : 'false',
        },
        Crest(c.code, 40),
        h('span', { class: 'club-name' }, c.name),
        h('span', { class: 'muted small' }, tier(c.code)))))),
    h('div', { class: 'ng-foot' },
      h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Difficulty' },
        ['easy', 'normal', 'hard'].map((d) => h('button', {
          class: cx('seg-btn', difficulty === d && 'on'), role: 'radio', 'aria-checked': difficulty === d ? 'true' : 'false',
          onClick: () => { difficulty = d; rerender(); },
        }, d[0].toUpperCase() + d.slice(1)))),
      h('button', {
        class: 'btn-primary', disabled: !picked,
        onClick: () => newGame(picked, difficulty),
      }, picked ? `Manage ${data.clubByCode.get(picked).name}` : 'Choose a club')));
}
