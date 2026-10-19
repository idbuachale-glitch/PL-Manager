// Player profile shown in a bottom sheet.

import { h } from '../dom.js';
import { Crest, Attr, FitnessBar, FormArrow, money, attrClass } from './common.js';

const ATTR_LABELS = {
  attack: 'Attack', goalkeeping: 'Goalkeeping', passing: 'Passing', defending: 'Defending', pace: 'Pace', stamina: 'Stamina',
};
const ROLE_LABELS = {
  keeper: 'Goalkeeper', centreBack: 'Centre-back', fullBack: 'Full-back', attacking: 'Attacking midfielder',
  holding: 'Holding midfielder', striker: 'Striker',
};

export function PlayerProfile(p) {
  const order = p.pos === 'GK' ? ['goalkeeping', 'passing', 'defending', 'pace', 'stamina'] : ['attack', 'passing', 'defending', 'pace', 'stamina'];
  const last = p.lastSeason;
  const s = p.season;
  const est = p.estimated ?? [];
  const avgRating = s?.apps ? (s.ratingSum / s.apps).toFixed(2) : '–';

  return h('div', { class: 'profile' },
    h('div', { class: 'profile-head' },
      Crest(p.teamCode, 44),
      h('div', { class: 'profile-id' },
        h('h2', null, p.name),
        h('p', { class: 'muted' }, `${ROLE_LABELS[p.role] ?? p.pos}, age ${p.age}`)),
      h('div', { class: 'profile-ovr' }, Attr(p.overall, 'attr-xl'), h('span', { class: 'muted small' }, 'Overall'))),

    h('div', { class: 'profile-meta' },
      metaItem('Value', money(p.value)),
      metaItem('Fitness', h('span', { class: 'meta-fit' }, FitnessBar(p.dyn?.condition ?? 100))),
      metaItem('Form', h('span', null, FormArrow(p.dyn?.form ?? 6.5), ' ', (p.dyn?.form ?? 6.5).toFixed(1))),
      p.dyn?.injuredFor > 0 ? metaItem('Injured', `${p.dyn.injuredFor} wk`) : null,
      p.dyn?.suspendedFor > 0 ? metaItem('Banned', `${p.dyn.suspendedFor} match${p.dyn.suspendedFor > 1 ? 'es' : ''}`) : null),

    h('section', { class: 'attrs' },
      order.map((k) => h('div', { class: 'attr-row' },
        h('span', { class: 'attr-name' }, ATTR_LABELS[k], est.includes(k) || (k === 'pace') ? h('span', { class: 'est', title: 'Estimated' }, ' est.') : null),
        h('span', { class: 'attr-bar' }, h('span', { class: `attr-fill ${attrClass(p.attrs[k])}`, style: { width: `${(p.attrs[k] / 20) * 100}%` } })),
        Attr(p.attrs[k])))),

    est.includes('all') ? h('p', { class: 'note' }, 'No Premier League minutes last season, so these ratings are estimated from price, position and age.') : null,
    est.includes('manual') ? h('p', { class: 'note' }, 'Ratings adjusted by hand.') : null,

    h('h3', null, 'This season'),
    statGrid([
      ['Apps', s?.apps ?? 0], ['Goals', s?.goals ?? 0], ['Assists', s?.assists ?? 0],
      ['Avg rating', avgRating], ['Clean sheets', s?.cleanSheets ?? 0], ['Cards', `${s?.yellows ?? 0}/${s?.reds ?? 0}`],
    ]),

    h('h3', null, 'Last season (2025/26)'),
    last && last.minutes ? statGrid([
      ['Minutes', last.minutes], ['Goals', last.goals_scored ?? 0], ['Assists', last.assists ?? 0],
      ['xG', fix(last.expected_goals)], ['xA', fix(last.expected_assists)], ['Clean sheets', last.clean_sheets ?? 0],
      ...(p.pos === 'GK' ? [['Saves', last.saves ?? 0]] : [['Def. actions', last.defensive_contribution ?? '–']]),
      ['Yellow cards', last.yellow_cards ?? 0], ['Red cards', last.red_cards ?? 0],
    ]) : h('p', { class: 'muted' }, 'Did not play in the Premier League.'));
}

const fix = (v) => (v == null ? '–' : Number(v).toFixed(1));
const metaItem = (label, value) => h('div', { class: 'meta' }, h('span', { class: 'muted small' }, label), h('span', { class: 'meta-v' }, value));
const statGrid = (pairs) => h('div', { class: 'stat-grid' },
  pairs.map(([k, v]) => h('div', { class: 'stat' }, h('span', { class: 'stat-v' }, v), h('span', { class: 'muted small' }, k))));
