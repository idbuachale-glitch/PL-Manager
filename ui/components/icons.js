// Small line icons (24px grid).
import { h } from '../dom.js';

const PATHS = {
  home: 'M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  squad: 'M8.5 4 5 6 3 10l3 1.5V20h12v-8.5L21 10l-2-4-3.5-2a3.5 3.5 0 0 1-7 0z',
  tactics: 'M4 4h16v16H4zM12 4v16M4 12h4M16 12h4M9 17l2-2M13 15l2 2M15 7l-3 3',
  transfers: 'M5 8h12l-3-3M19 16H7l3 3',
  league: 'M5 5h14M5 9.5h14M5 14h14M5 18.5h9',
  board: 'M4 20V9l8-5 8 5v11M9 20v-6h6v6',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  medical: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
  card: 'M7 3h10v18H7z',
  battery: 'M3 8h15v8H3zM21 11v2M6 11v2',
  news: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 12h7M7 15h4',
  whistle: 'M3 12a5 5 0 1 0 10 0 5 5 0 0 0-10 0M13 10h8v4h-6M8 7V3',
  chat: 'M4 5h16v11H9l-5 4z',
  trophy: 'M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8',
  chevron: 'M9 6l6 6-6 6',
  star: 'M12 4l2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8z',
  play: 'M8 5v14l11-7z',
};

export function Icon(name, size = 20, cls = 'ic') {
  const svg = h('svg', { viewBox: '0 0 24 24', width: size, height: size, class: cls, 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  svg.append(h('path', { svg: true, d: PATHS[name] }));
  return svg;
}
