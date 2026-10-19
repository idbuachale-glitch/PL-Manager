// Squad: pick the XI on a pitch (tap a spot, then a player) and browse player cards.

import { h, cx } from '../dom.js';
import { game, ui, userSquad, userLineup, userFormation, placeInSlot, bestXI } from '../store.js';
import { Crest, Attr, FitnessBar, FormArrow, StatusIcon, Sheet } from '../components/common.js';
import { PlayerProfile } from '../components/profile.js';
import { slotScore, isAvailable } from '../../engine/lineup.js';

// Spot on the pitch for each slot, per formation: [x%, y%] with y=0 at the opponent's goal.
const BACK4 = [[50, 91], [12, 70], [37, 75], [63, 75], [88, 70]];
export const PITCH = {
  '4-3-3': [...BACK4, [50, 57], [27, 45], [73, 45], [15, 21], [50, 13], [85, 21]],
  '4-2-3-1': [...BACK4, [34, 57], [66, 57], [15, 33], [50, 36], [85, 33], [50, 13]],
  '4-4-2': [...BACK4, [12, 44], [37, 50], [63, 50], [88, 44], [35, 15], [65, 15]],
  '3-5-2': [[50, 91], [24, 74], [50, 77], [76, 74], [10, 47], [30, 45], [50, 57], [70, 45], [90, 47], [35, 15], [65, 15]],
  '5-3-2': [[50, 91], [8, 61], [28, 74], [50, 77], [72, 74], [92, 61], [27, 45], [50, 54], [73, 45], [35, 15], [65, 15]],
};
const SLOT_NAMES = { GK: 'GK', CB: 'CB', FB: 'FB', WB: 'WB', DM: 'DM', CM: 'CM', AM: 'AM', W: 'W', ST: 'ST' };
const POS_ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
const SORTS = { position: 'Position', rating: 'Rating', form: 'Form', fitness: 'Fitness' };
let filter = 'ALL';

export function Squad(rerender) {
  const lu = userLineup();
  const formation = userFormation();
  const inXI = new Map(lu.slots.map((s, i) => [s.player?.id, i]));
  const pick = ui.squadPick;

  let players = userSquad();
  if (filter !== 'ALL') players = players.filter((p) => p.pos === filter);
  const sorters = {
    position: (a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.overall - a.overall,
    rating: (a, b) => b.overall - a.overall,
    form: (a, b) => (b.dyn.form - a.dyn.form) || b.overall - a.overall,
    fitness: (a, b) => b.dyn.condition - a.dyn.condition,
  };
  players = [...players].sort(sorters[ui.squadSort]);
  // When choosing for a spot, best fits for that spot go first.
  if (pick != null) {
    const slot = lu.slots[pick].slot;
    players = [...players].sort((a, b) => (isAvailable(b) - isAvailable(a)) || slotScore(b, slot) - slotScore(a, slot));
  }

  const onRow = (p) => {
    if (pick != null) {
      if (!isAvailable(p)) return;
      placeInSlot(pick, p.id); ui.squadPick = null; rerender();
    } else {
      ui.sheet = () => Sheet(PlayerProfile(p), () => { ui.sheet = null; rerender(); }, { title: p.name });
      rerender();
    }
  };

  return h('main', { class: 'screen squad' },
    h('header', { class: 'bar' },
      h('h1', null, 'Squad', h('span', { class: 'sub' }, `${userSquad().length} players, ${userSquad().filter((p) => !isAvailable(p)).length} unavailable`)),
      h('span', { class: 'chip-static' }, formation),
      h('button', { class: 'btn-small', onClick: () => { ui.squadPick = null; bestXI(); rerender(); } }, 'Best XI')),

    h('div', { class: 'pitch', role: 'group', 'aria-label': 'Starting eleven' },
      h('div', { class: 'pitch-lines', 'aria-hidden': 'true' }, h('span', { class: 'pl-half' }), h('span', { class: 'pl-circle' }), h('span', { class: 'pl-box top' }), h('span', { class: 'pl-box bottom' })),
      lu.slots.map((s, i) => {
        const [x, y] = PITCH[formation][i];
        const p = s.player;
        return h('button', {
          class: cx('token', pick === i && 'picked', p && !isAvailable(p) && 'unavail', !p && 'empty'),
          style: { left: `${x}%`, top: `${y}%` },
          onClick: () => { ui.squadPick = pick === i ? null : i; rerender(); },
          'aria-label': `${SLOT_NAMES[s.slot]}: ${p ? p.webName : 'empty'}`,
        },
        p ? Attr(p.overall, 'token-ovr') : h('span', { class: 'attr a-low token-ovr' }, '+'),
        h('span', { class: 'token-name' }, p ? p.webName : SLOT_NAMES[s.slot]),
        p ? h('span', { class: 'token-fit' }, h('span', { style: { width: `${p.dyn.condition}%` }, class: p.dyn.condition < 75 ? 'low' : '' })) : null);
      })),

    pick != null
      ? h('p', { class: 'pick-hint active' }, `Now pick who plays ${SLOT_NAMES[lu.slots[pick].slot]}. Best fits are at the top.`,
        h('button', { class: 'link', onClick: () => { ui.squadPick = null; rerender(); } }, 'Cancel'))
      : h('p', { class: 'pick-hint muted' }, 'Tap a shirt on the pitch to swap that player. Tap anyone below to see their profile.'),

    h('div', { class: 'filters' },
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by position' },
        ['ALL', 'GK', 'DEF', 'MID', 'FWD'].map((f) => h('button', { class: cx('chip', filter === f && 'on'), onClick: () => { filter = f; rerender(); } }, f === 'ALL' ? 'All' : f))),
      h('label', { class: 'sort' }, h('span', { class: 'muted small' }, 'Sort'),
        h('select', { onChange: (e) => { ui.squadSort = e.target.value; rerender(); } },
          Object.entries(SORTS).map(([k, v]) => h('option', { value: k, selected: ui.squadSort === k }, v))))),

    h('ul', { class: 'player-list' }, players.map((p) => h('li', null,
      h('button', { class: cx('prow', inXI.has(p.id) && 'in-xi', !isAvailable(p) && 'unavail'), onClick: () => onRow(p) },
        Attr(p.overall, 'prow-ovr'),
        h('span', { class: 'prow-main' },
          h('span', { class: 'prow-name' }, p.webName, StatusIcon(p)),
          h('span', { class: 'prow-sub muted small' },
            inXI.has(p.id) ? h('span', { class: 'xi-tag' }, SLOT_NAMES[lu.slots[inXI.get(p.id)].slot]) : null,
            `${p.pos}, age ${p.age}`)),
        FormArrow(p.dyn.form),
        FitnessBar(p.dyn.condition))))));
}
