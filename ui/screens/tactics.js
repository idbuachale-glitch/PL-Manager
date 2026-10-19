// Tactics: formation, presets, four sliders, opponent scouting and a live projection.

import { h, cx } from '../dom.js';
import { game, ui, club, nextUserFixture, setTactics, setFormation, userFormation } from '../store.js';
import { Crest, Attr } from '../components/common.js';
import { FORMATIONS, PRESETS } from '../../engine/tactics.js';
import { PITCH } from './squad.js';
import { projection, scout } from '../lib/odds.js';

const SLIDERS = [
  {
    key: 'mentality', name: 'Mentality', low: 'Defensive', high: 'Attacking',
    words: ['Very defensive', 'Defensive', 'Balanced', 'Attacking', 'All-out attack'],
    says: [
      'Men behind the ball. Fewer chances at both ends.',
      'Careful. Fewer chances for both sides.',
      'A normal balance between attack and defence.',
      'More players forward. More chances for you, and some more for them.',
      'Everyone forward. Lots of chances at both ends.',
    ],
  },
  {
    key: 'pressing', name: 'Pressing', low: 'Low', high: 'High',
    words: ['Stand off', 'Low', 'Medium', 'High', 'Relentless'],
    says: [
      'Let them have the ball. Saves energy, gives up territory.',
      'Press occasionally. Players stay fresh.',
      'Press at sensible moments.',
      'Win the ball high up for quick chances. Tires players and leaves space behind.',
      'Hunt the ball everywhere. Big energy cost and space behind the line.',
    ],
  },
  {
    key: 'tempo', name: 'Tempo', low: 'Patient', high: 'Direct',
    words: ['Very patient', 'Patient', 'Mixed', 'Direct', 'Very direct'],
    says: [
      'Keep the ball and wait for a clear opening. Fewer, better chances.',
      'Build up carefully. More possession.',
      'Mix short passing with balls forward.',
      'Get it forward quickly. Strong against high lines and slow defenders.',
      'Straight at goal. More shots, less possession, more tiring.',
    ],
  },
  {
    key: 'width', name: 'Width', low: 'Narrow', high: 'Wide',
    words: ['Very narrow', 'Narrow', 'Normal', 'Wide', 'Very wide'],
    says: [
      'Crowd the middle. Helps keep the ball in midfield.',
      'Play through the centre.',
      'Use the whole pitch when it makes sense.',
      'Stretch them using the flanks. Strong against narrow teams.',
      'Hug the touchline. Most dangerous against teams that play narrow.',
    ],
  },
];
const band = (v) => Math.min(4, Math.floor(v / 20.01));

export function Tactics(rerender) {
  const f = nextUserFixture();
  const t = game.user.tactics;
  const formation = userFormation();
  const activePreset = Object.entries(PRESETS).find(([, p]) => ['mentality', 'pressing', 'tempo', 'width'].every((k) => p[k] === t[k]))?.[0];

  const proj = h('div', { class: 'proj-body' }, h('p', { class: 'muted small' }, 'Working out the odds…'));
  if (f) projection(f, t).then((res) => { if (proj.isConnected || true) proj.replaceChildren(...ProjView(res, f)); });

  return h('main', { class: 'screen tactics' },
    h('header', { class: 'bar' }, h('h1', null, 'Tactics', h('span', { class: 'sub' }, 'Set up how your team plays. Changes save straight away.'))),

    f ? OpponentCard(f) : h('p', { class: 'muted' }, 'No matches left this season.'),

    f ? h('section', { class: 'proj', 'aria-live': 'polite' },
      h('h2', null, 'If you played them now'),
      proj) : null,

    h('section', { class: 'tsec' },
      h('h2', null, 'Formation'),
      h('div', { class: 'formations' }, Object.keys(FORMATIONS).map((fm) => h('button', {
        class: cx('fm', formation === fm && 'on'), onClick: () => { if (fm !== formation) { setFormation(fm); rerender(); } },
        'aria-pressed': formation === fm ? 'true' : 'false',
      }, MiniPitch(fm), h('span', null, fm))))),

    h('section', { class: 'tsec' },
      h('h2', null, 'Quick styles'),
      h('div', { class: 'presets' }, Object.entries(PRESETS).map(([name, p]) => h('button', {
        class: cx('preset', activePreset === name && 'on'), onClick: () => { setTactics(p); rerender(); },
      }, name)))),

    h('section', { class: 'tsec' },
      h('h2', null, 'Your style'),
      SLIDERS.map((s) => Slider(s, t[s.key], rerender))));
}

function Slider(s, value, rerender) {
  const word = h('span', { class: 'sl-word' }, s.words[band(value)]);
  const says = h('p', { class: 'sl-says muted small' }, s.says[band(value)]);
  const input = h('input', {
    type: 'range', min: 0, max: 100, step: 5, value, class: 'sl', 'aria-label': s.name,
    'aria-valuetext': s.words[band(value)],
    style: { '--fill': `${value}%` },
    onInput: (e) => {
      const v = Number(e.target.value);
      word.textContent = s.words[band(v)];
      says.textContent = s.says[band(v)];
      e.target.style.setProperty('--fill', `${v}%`);
    },
    onChange: (e) => { setTactics({ [s.key]: Number(e.target.value) }); rerender(); },
  });
  return h('div', { class: 'slider' },
    h('div', { class: 'sl-head' }, h('span', { class: 'sl-name' }, s.name), word),
    input,
    h('div', { class: 'sl-ends muted small' }, h('span', null, s.low), h('span', null, s.high)),
    says);
}

function MiniPitch(fm) {
  const svg = h('svg', { viewBox: '0 0 68 80', width: 54, height: 64, 'aria-hidden': 'true' });
  svg.append(h('rect', { svg: true, x: 1, y: 1, width: 66, height: 78, rx: 5, class: 'mp-bg' }));
  svg.append(h('line', { svg: true, x1: 1, y1: 40, x2: 67, y2: 40, class: 'mp-line' }));
  for (const [x, y] of PITCH[fm]) svg.append(h('circle', { svg: true, cx: (x / 100) * 68, cy: (y / 100) * 80, r: 3.6, class: 'mp-dot' }));
  return svg;
}

function OpponentCard(f) {
  const sc = scout(f);
  const home = f.home === game.userClub;
  return h('section', { class: 'opp' },
    h('div', { class: 'opp-head' },
      Crest(sc.oppCode, 44),
      h('div', null,
        h('p', { class: 'muted small' }, `Next: gameweek ${f.gw}, ${home ? 'at home' : 'away'}`),
        h('h2', null, club(sc.oppCode).name))),
    h('dl', { class: 'opp-facts' },
      h('div', null, h('dt', { class: 'muted small' }, 'Likely style'), h('dd', null, sc.style)),
      sc.key ? h('div', null, h('dt', { class: 'muted small' }, 'Key player'), h('dd', null, sc.key.webName, ' ', Attr(sc.key.overall))) : null),
    h('p', { class: 'opp-tip' }, sc.tip));
}

function ProjView(r, f) {
  const pct = (x) => `${Math.round(x * 100)}%`;
  return [
    h('div', { class: 'wdl', role: 'img', 'aria-label': `Win ${pct(r.win)}, draw ${pct(r.draw)}, loss ${pct(r.loss)}` },
      h('span', { class: 'wdl-w', style: { flex: r.win } }),
      h('span', { class: 'wdl-d', style: { flex: r.draw } }),
      h('span', { class: 'wdl-l', style: { flex: r.loss } })),
    h('div', { class: 'wdl-labels' },
      h('span', null, h('strong', null, pct(r.win)), ' win'),
      h('span', null, h('strong', null, pct(r.draw)), ' draw'),
      h('span', null, h('strong', null, pct(r.loss)), ' loss')),
    h('div', { class: 'proj-grid' },
      projStat('Shots', r.shotsFor.toFixed(0), r.shotsAgainst.toFixed(0)),
      projStat('Expected goals', r.xgFor.toFixed(1), r.xgAgainst.toFixed(1)),
      projStat('Possession', `${Math.round(r.possession)}%`, `${Math.round(100 - r.possession)}%`),
      h('div', { class: 'pstat' }, h('span', { class: 'muted small' }, 'Fitness at full time'),
        h('span', { class: cx('pv', r.condition < 55 ? 'bad' : r.condition < 65 ? 'warn' : '') }, `${Math.round(r.condition)}%`))),
    h('p', { class: 'muted small' }, `Based on 80 simulated matches against ${club(f.home === game.userClub ? f.away : f.home).short}. Change anything above and this updates.`),
  ];
}

const projStat = (label, us, them) => h('div', { class: 'pstat' },
  h('span', { class: 'muted small' }, label),
  h('span', { class: 'pv' }, us, h('span', { class: 'pv-them muted' }, ` v ${them}`)));
