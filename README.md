# PL Manager

A mobile-first Premier League manager game, inspired by Football Manager but much simpler. Free, offline-capable, hosted on GitHub Pages.

## Data
- **Update player data** workflow (Actions tab) fetches squads, fixtures and last season's stats, builds FM-style 1–20 ratings and finds club crests. It runs every Tuesday and can be run by hand.
- All rating formulas and weightings: `engine/config.js`.

## Match engine (stage 2)
- `engine/match.js` plays a match minute by minute from a seed, so any match can be replayed. `engine/season.js` runs the 380 fixtures, table, fitness, injuries and bans. `engine/ai.js` picks AI tactics and subs.
- `npm run sim` prints a simulated final table and top scorers; `npm run sim 30` averages 30 seasons. `npm test` runs the realism and tactics tests.
- What the tactics do:
  - **Mentality**: attacking creates more chances for you and, less so, for the opponent.
  - **Pressing**: high press wins the ball higher (more chances) but tires players faster and leaves space behind.
  - **Tempo**: direct gets more shots, especially against high lines and slow defenders; patient keeps the ball and creates better chances.
  - **Width**: wide play creates extra chances against narrow teams; narrow play helps keep the ball in midfield.
  - **Formation**: more central midfielders = more possession; a spare centre-back against the strikers lowers their chance quality.
- All numbers live in `engine/config.js` (MATCH).

## Credits
- Squads, prices and fixtures: Fantasy Premier League.
- Last-season stats: [vaastav/Fantasy-Premier-League](https://github.com/vaastav/Fantasy-Premier-League) (MIT licence).
- Not affiliated with the Premier League or any club.
