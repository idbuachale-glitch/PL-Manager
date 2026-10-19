// App shell: screens, bottom tab bar, bottom sheet layer.

import { h, cx } from './dom.js';
import { loadData, game, ui, subscribe } from './store.js';
import { NewGame } from './screens/newgame.js';
import { Home } from './screens/home.js';
import { Squad } from './screens/squad.js';
import { League } from './screens/league.js';

const ICONS = {
  home: 'M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  squad: 'M8.5 4 5 6 3 10l3 1.5V20h12v-8.5L21 10l-2-4-3.5-2a3.5 3.5 0 0 1-7 0z',
  tactics: 'M4 4h16v16H4zM12 4v16M4 12h4M16 12h4M9 17l2-2M13 15l2 2M15 7l-3 3',
  transfers: 'M5 8h12l-3-3M19 16H7l3 3',
  league: 'M5 5h14M5 9.5h14M5 14h14M5 18.5h9',
};
const TABS = [
  ['home', 'Home'], ['squad', 'Squad'], ['tactics', 'Tactics'], ['transfers', 'Transfers'], ['league', 'League'],
];

const root = document.getElementById('app');
const scrollMemory = {};

function Icon(name) {
  const svg = h('svg', { viewBox: '0 0 24 24', width: 24, height: 24, 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  svg.append(h('path', { svg: true, d: ICONS[name] }));
  return svg;
}

function Placeholder(title, text) {
  return h('main', { class: 'screen' },
    h('header', { class: 'bar' }, h('h1', null, title)),
    h('div', { class: 'empty' }, h('p', null, text)));
}


export function render() {
  const scroller = root.querySelector('.scroller');
  if (scroller) scrollMemory[root.dataset.tab] = scroller.scrollTop;
  const sheetEl = root.querySelector('.sheet');
  const sheetScroll = sheetEl ? sheetEl.scrollTop : 0;

  root.replaceChildren();
  if (!game) {
    root.dataset.tab = 'new';
    root.append(h('div', { class: 'scroller' }, NewGame(render)));
    return;
  }

  const screens = {
    home: () => Home(render),
    squad: () => Squad(render),
    tactics: () => Placeholder('Tactics', 'Formations, the four tactic sliders and presets arrive in the next update. Your team plays a balanced style for now.'),
    transfers: () => Placeholder('Transfers', 'Buying and selling between Premier League clubs arrives in a later update.'),
    league: () => League(render),
  };
  root.dataset.tab = ui.tab;
  const scrollerEl = h('div', { class: 'scroller' }, screens[ui.tab]());
  root.append(scrollerEl,
    h('nav', { class: 'tabbar', 'aria-label': 'Main' },
      TABS.map(([k, label]) => h('button', {
        class: cx('tab', ui.tab === k && 'on'), 'aria-current': ui.tab === k ? 'page' : null,
        onClick: () => { if (ui.tab !== k) { ui.tab = k; ui.squadPick = null; render(); } else scrollerEl.scrollTo({ top: 0, behavior: 'smooth' }); },
      }, Icon(k), h('span', null, label)))));
  scrollerEl.scrollTop = scrollMemory[ui.tab] ?? 0;

  if (ui.sheet) {
    const s = ui.sheet();
    root.append(s);
    const panel = s.querySelector('.sheet');
    if (panel) panel.scrollTop = sheetScroll;
  }
}

document.addEventListener('rerender', render);
subscribe(render);

loadData().then(render).catch((e) => {
  root.replaceChildren(h('div', { class: 'empty' }, h('p', null, 'Could not load the game data. Check your connection and reload.'), h('p', { class: 'muted small' }, String(e))));
});
