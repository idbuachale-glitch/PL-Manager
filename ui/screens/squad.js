// Squad: pick the XI on a pitch (tap a spot, then a player) and browse player cards.

import { h, cx } from '../dom.js';
import { game, ui, userSquad, userLineup, userFormation, placeInSlot, bestXI, toBench, toReserves, BENCH_SIZE } from '../store.js';
import { Crest, Attr, FitnessBar, FormArrow, StatusIcon, Sheet } from '../components/common.js';
import { PlayerProfile } from '../components/profile.js';
import { slotScore, isAvailable } from '../../engine/lineup.js';
import { familiarity, fitLevel, positionsOf, SLOT_LABEL } from '../../engine/positions.js';

export const slotRating = (p, slot) => Math.max(1, Math.round((p.overallExact ?? p.overall) * familiarity(p, slot)));
export const posText = (p) => { const q = positionsOf(p); return [...q.natural, ...q.secondary.map((x) => x.toLowerCase())].join(' '); };
const FIT_TEXT = { natural: 'Natural position', secondary: 'Can play here', unfamiliar: 'Out of position', wrong: 'Badly out of position' };

// Spot on the pitch for each slot, per formation: [x%, y%] with y=0 at the opponent's goal.
const BACK4 = [[50, 92], [12, 68], [36, 73], [64, 73], [88, 68]];
export const PITCH = {
  '4-3-3': [...BACK4, [50, 53], [27, 41], [73, 41], [15, 20], [50, 12], [85, 20]],
  '4-2-3-1': [...BACK4, [32, 54], [68, 54], [14, 32], [50, 34], [86, 32], [50, 12]],
  '4-4-2': [...BACK4, [12, 42], [37, 47], [63, 47], [88, 42], [35, 14], [65, 14]],
  '3-5-2': [[50, 92], [22, 71], [50, 73], [78, 71], [10, 47], [30, 45], [50, 57], [70, 45], [90, 47], [35, 15], [65, 15]],
  '5-3-2': [[50, 92], [9, 58], [29, 71], [50, 73], [71, 71], [91, 58], [27, 45], [50, 54], [73, 45], [35, 15], [65, 15]],
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

  const pickSlot = pick != null ? lu.slots[pick].slot : null;
  const benchIds = new Set(lu.bench.map((p) => p.id));
  const keep = (p) => filter === 'ALL' || p.pos === filter;
  const sorters = {
    position: (a, b) => posKey(a) - posKey(b) || b.overallExact - a.overallExact,
    rating: (a, b) => b.overallExact - a.overallExact,
    form: (a, b) => (b.dyn.form - a.dyn.form) || b.overallExact - a.overallExact,
    fitness: (a, b) => b.dyn.condition - a.dyn.condition,
  };
  const order = pickSlot
    ? (a, b) => slotScore(b, pickSlot) - slotScore(a, pickSlot)   // best fits for the chosen spot first
    : sorters[ui.squadSort];
  const squad = userSquad();
  const xiPlayers = lu.slots.map((x) => x.player).filter(Boolean);
  const sections = {
    xi: xiPlayers.filter(keep),
    bench: lu.bench.filter(keep).sort(order),
    reserves: squad.filter((p) => isAvailable(p) && !inXI.has(p.id) && !benchIds.has(p.id)).filter(keep).sort(order),
    out: squad.filter((p) => !isAvailable(p)).filter(keep).sort(order),
  };
  if (pickSlot) sections.xi = [...sections.xi].filter((p) => lu.slots[pick].player?.id !== p.id).sort(order);

  const openProfile = (p) => {
    const where = inXI.has(p.id) ? 'xi' : benchIds.has(p.id) ? 'bench' : isAvailable(p) ? 'reserves' : 'out';
    const close = () => { ui.sheet = null; rerender(); };
    const benchFull = lu.bench.length >= BENCH_SIZE;
    const actions = h('div', { class: 'profile-actions' },
      where === 'xi' ? h('p', { class: 'muted small' }, 'In your starting XI. Tap his shirt on the pitch to replace him.') : null,
      where === 'bench' ? h('button', { class: 'btn-soft', onClick: () => { toReserves(p.id); close(); } }, 'Move to reserves') : null,
      where === 'reserves' ? h('button', { class: 'btn-primary', disabled: benchFull, onClick: () => { toBench(p.id); close(); } },
        benchFull ? `Bench is full (${BENCH_SIZE})` : 'Add to bench') : null,
      where === 'reserves' && benchFull ? h('p', { class: 'muted small' }, 'Move someone off the bench first.') : null,
      where === 'out' ? h('p', { class: 'muted small' }, p.dyn.injuredFor > 0 ? 'Injured, so he cannot be picked yet.' : 'Suspended, so he cannot be picked yet.') : null);
    ui.sheet = () => Sheet(h('div', null, actions, PlayerProfile(p)), close, { title: p.name });
    rerender();
  };

  const onRow = (p) => {
    if (pick != null) {
      if (!isAvailable(p)) return;
      placeInSlot(pick, p.id); ui.squadPick = null; rerender();
    } else openProfile(p);
  };

  const row = (p, where) => {
    const slot = where === 'xi' && !pickSlot ? lu.slots[inXI.get(p.id)].slot : null;
    const lvl = pickSlot ? fitLevel(p, pickSlot) : slot ? fitLevel(p, slot) : null;
    const rating = pickSlot ? slotRating(p, pickSlot) : slot ? slotRating(p, slot) : p.overall;
    return h('li', null,
      h('button', { class: cx('prow', !isAvailable(p) && 'unavail'), onClick: () => onRow(p) },
        Attr(rating, 'prow-ovr'),
        h('span', { class: 'prow-main' },
          h('span', { class: 'prow-name' }, p.webName, StatusIcon(p)),
          h('span', { class: 'prow-sub muted small' },
            slot ? h('span', { class: cx('xi-tag', `xt-${lvl}`) }, slot) : where === 'bench' && !pickSlot ? h('span', { class: 'sub-tag' }, 'SUB') : null,
            pickSlot ? h('span', { class: `fit-label fl-${lvl}` }, FIT_TEXT[lvl])
              : slot && lvl !== 'natural' ? h('span', { class: `fit-label fl-${lvl}` }, `${FIT_TEXT[lvl]} (${posText(p)})`)
                : `${posText(p)}, age ${p.age}`)),
        FormArrow(p.dyn.form),
        FitnessBar(p.dyn.condition)));
  };

  const section = (key, title, note) => {
    const list = sections[key];
    if (!list.length && (key === 'out' || filter !== 'ALL')) return null;
    return h('section', { class: 'psec' },
      h('header', { class: 'psec-head' }, h('h2', null, title), h('span', { class: 'muted small' }, note)),
      list.length ? h('ul', { class: 'player-list' }, list.map((p) => row(p, key)))
        : h('p', { class: 'muted small psec-empty' }, key === 'bench' ? 'No substitutes picked. Add players from the reserves.' : 'Nobody here.'));
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
        const lvl = p ? fitLevel(p, s.slot) : null;
        return h('button', {
          class: cx('token', p && `fit-${lvl}`, pick === i && 'picked', p && !isAvailable(p) && 'unavail', !p && 'empty'),
          style: { left: `${x}%`, top: `${y}%` },
          onClick: () => { ui.squadPick = pick === i ? null : i; rerender(); },
          'aria-label': `${SLOT_NAMES[s.slot]}: ${p ? `${p.webName}, ${FIT_TEXT[lvl].toLowerCase()}` : 'empty'}`,
        },
        h('span', { class: 'token-slot' }, s.slot),
        p ? Attr(slotRating(p, s.slot), 'token-ovr') : h('span', { class: 'attr a-low token-ovr' }, '+'),
        h('span', { class: 'token-name' }, p ? p.webName : SLOT_NAMES[s.slot]),
        p ? h('span', { class: 'token-fit' }, h('span', { style: { width: `${p.dyn.condition}%` }, class: p.dyn.condition < 75 ? 'low' : '' })) : null);
      })),

    pick != null
      ? h('p', { class: 'pick-hint active' }, `Now pick who plays ${SLOT_NAMES[lu.slots[pick].slot]}. Best fits are at the top.`,
        h('button', { class: 'link', onClick: () => { ui.squadPick = null; rerender(); } }, 'Cancel'))
      : h('p', { class: 'pick-hint muted' }, 'Tap a shirt on the pitch to swap that player. Numbers on the pitch are ratings in that position.'),
    h('div', { class: 'keys' },
      h('div', { class: 'fit-key small' },
        h('span', { class: 'key-title' }, 'Shirt edge'),
        h('span', null, h('i', { class: 'fk fit-natural' }), 'Natural'),
        h('span', null, h('i', { class: 'fk fit-secondary' }), 'Can play'),
        h('span', null, h('i', { class: 'fk fit-unfamiliar' }), 'Out of position')),
      h('div', { class: 'fit-key small' },
        h('span', { class: 'key-title' }, 'Rating'),
        h('span', { class: 'attr a-elite' }, '16+'), h('span', null, 'Elite'),
        h('span', { class: 'attr a-good' }, '13–15'), h('span', null, 'Good'),
        h('span', { class: 'attr a-ok' }, '9–12'), h('span', null, 'Average'),
        h('span', { class: 'attr a-low' }, '1–8'), h('span', null, 'Weak'))),

    h('div', { class: 'filters' },
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by position' },
        ['ALL', 'GK', 'DEF', 'MID', 'FWD'].map((f) => h('button', { class: cx('chip', filter === f && 'on'), onClick: () => { filter = f; rerender(); } }, f === 'ALL' ? 'All' : f))),
      pickSlot ? null : h('label', { class: 'sort' }, h('span', { class: 'muted small' }, 'Sort'),
        h('select', { onChange: (e) => { ui.squadSort = e.target.value; rerender(); } },
          Object.entries(SORTS).map(([k, v]) => h('option', { value: k, selected: ui.squadSort === k }, v))))),

    pickSlot
      ? [section('bench', 'Bench', 'best fits first'), section('reserves', 'Reserves', 'best fits first'), section('xi', 'Swap with a starter', 'they trade places')]
      : [section('xi', 'Starting XI', formation), section('bench', 'Bench', `${lu.bench.length} of ${BENCH_SIZE}`), section('reserves', 'Reserves', `${sections.reserves.length}`), section('out', 'Unavailable', 'injured or suspended')]);
}

const SLOT_ORDER = { GK: 0, CB: 1, FB: 2, WB: 3, DM: 4, CM: 5, AM: 6, W: 7, ST: 8 };
const posKey = (p) => SLOT_ORDER[positionsOf(p).natural[0]] ?? 9;
