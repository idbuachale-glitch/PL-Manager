// Simulates the rest of the season several times off the main thread and averages the final table.
import { playSeason, table } from '../engine/season.js';

self.onmessage = (e) => {
  const { state, runs } = e.data;
  const totals = {};
  for (let i = 0; i < runs; i++) {
    const s = structuredClone(state);
    s.seed = (state.seed + 7919 * (i + 1)) >>> 0;
    s.userClub = null;                        // the AI plays our matches in the prediction
    playSeason(s);
    table(s).forEach((r, pos) => {
      const t = (totals[r.code] ??= { code: r.code, pos: 0, pts: 0, best: 20, worst: 1 });
      t.pos += pos + 1; t.pts += r.pts;
      t.best = Math.min(t.best, pos + 1); t.worst = Math.max(t.worst, pos + 1);
    });
    self.postMessage({ progress: (i + 1) / runs });
  }
  const rows = Object.values(totals).map((t) => ({ ...t, pos: t.pos / runs, pts: Math.round(t.pts / runs) }))
    .sort((a, b) => a.pos - b.pos);
  self.postMessage({ done: rows });
};
