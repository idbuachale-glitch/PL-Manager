// App shell: screens, bottom tab bar, bottom sheet layer.

import { h, cx } from './dom.js';
import { loadData, game, ui, subscribe } from './store.js';
import { NewGame } from './screens/newgame.js';
import { Home } from './screens/home.js';
import { Squad } from './screens/squad.js';
import { League } from './screens/league.js';
import { Tactics } from './screens/tactics.js';
import { Icon as LineIcon } from './components/icons.js';

const TABS = [
  ['home', 'Home'], ['squad', 'Squad'], ['tactics', 'Tactics'], ['transfers', 'Transfers'], ['league', 'League'],
];

const root = document.getElementById('app');
const scrollMemory = {};

const Icon = (name) => LineIcon(name, 24, 'tab-ic');

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
    tactics: () => Tactics(render),
    transfers: () => Placeholder('Transfers', 'Buying and selling players between Premier League clubs is coming soon. For now, make the most of the squad you have.'),
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
