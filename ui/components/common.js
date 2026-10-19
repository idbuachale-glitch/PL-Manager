// Shared bits: crests, attribute numbers, fitness bars, form dots, bottom sheet.

import { h, cx } from '../dom.js';
import { club } from '../store.js';

// Club crest from its image link; falls back to a badge in club colours with initials.
export function Crest(code, size = 28) {
  const c = club(code);
  const fallback = () => {
    const [bg, fg] = c?.colours ?? ['#2B3B4A', '#F1F3EC'];
    return h('span', {
      class: 'crest crest-fallback',
      style: { width: `${size}px`, height: `${size}px`, background: bg, color: fg, fontSize: `${Math.round(size * 0.36)}px`, borderColor: fg },
      'aria-label': c?.name ?? '',
    }, (c?.short ?? '?').slice(0, 3));
  };
  if (!c?.crest) return fallback();
  const img = h('img', { class: 'crest', src: c.crest, width: size, height: size, alt: c.name, loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
  return img;
}

// FM-style colour for a 1–20 ability.
export const attrClass = (v) => (v >= 16 ? 'a-elite' : v >= 13 ? 'a-good' : v >= 9 ? 'a-ok' : 'a-low');

export const Attr = (v, cls = '') => h('span', { class: cx('attr', attrClass(v), cls) }, v);

export function FitnessBar(cond) {
  const c = Math.round(cond);
  return h('span', { class: 'fit', title: `Fitness ${c}%`, 'aria-label': `Fitness ${c}%` },
    h('span', { class: cx('fit-fill', c < 70 ? 'fit-low' : c < 85 ? 'fit-mid' : ''), style: { width: `${c}%` } }));
}

export const FormArrow = (form) =>
  form > 6.9 ? h('span', { class: 'arrow up', title: 'In form' }, '▲')
    : form < 6.1 ? h('span', { class: 'arrow down', title: 'Out of form' }, '▼')
      : h('span', { class: 'arrow flat', title: 'Steady' }, '–');

export const FormDots = (form) => h('span', { class: 'dots' },
  form.map((r) => h('span', { class: cx('dot', r === 'W' ? 'dot-w' : r === 'L' ? 'dot-l' : 'dot-d'), title: r })));

export function StatusIcon(p) {
  if (p.dyn?.injuredFor > 0) return h('span', { class: 'status inj', title: `Injured: ${p.dyn.injuredFor} wk` }, '+');
  if (p.dyn?.suspendedFor > 0) return h('span', { class: 'status ban', title: `Suspended: ${p.dyn.suspendedFor}` }, '');
  return null;
}

// Bottom sheet. close() is called on backdrop tap.
export function Sheet(content, close, { title } = {}) {
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title ?? 'Details' },
    h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
    content);
  return h('div', { class: 'sheet-wrap', onClick: (e) => { if (e.target === e.currentTarget) close(); } }, panel);
}

export const money = (m) => (m >= 1 ? `£${m % 1 ? m.toFixed(1) : m}m` : `£${Math.round(m * 1000)}k`);
export const posLabel = { GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'FWD' };
export const fmtDate = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', opts) : 'Date to be confirmed';
export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
