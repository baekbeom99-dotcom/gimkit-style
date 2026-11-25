// Test helper (not a test file): memoises 못깨는 타워 solver results in tests/fixtures/obby-*.json so the
// proofs over every pattern x mutator do not re-run minutes of simulation on every `npm test`.
// The key is a SHA-256 of (solver.js source + jump/world.js source + the exact platform data + options),
// so ANY change to the physics, the solver or a pattern is a cache miss and is solved for real; a hit is
// therefore equivalent to re-running the solver. Misses are written back when the test process exits
// (entries not used by that run are dropped). Delete the fixture files to force a full re-proof.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { solvePlatforms, solveSectionRobust } from '../js/games/obby/solver.js';
import { sectionPlatforms } from '../js/games/obby/sections.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(fileURLToPath(new URL(p, root)), 'utf8');
const VERSION = createHash('sha256').update(read('js/games/obby/solver.js')).update(read('js/games/jump/world.js')).digest('hex');
const json = (v) => JSON.stringify(v, (k, x) => (x === Infinity ? 'Inf' : x === -Infinity ? '-Inf' : x));

export function solverCache(name) {
  const dir = fileURLToPath(new URL('tests/fixtures/', root));
  const file = dir + `obby-${name}.json`;
  let old = {};
  try { if (existsSync(file)) old = JSON.parse(readFileSync(file, 'utf8')); } catch { old = {}; }
  const used = {};
  let misses = 0;
  process.on('exit', () => {
    if (!misses && Object.keys(used).length === Object.keys(old).length) return;
    try { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify(used, null, 0) + '\n'); } catch { /* read-only: fine */ }
  });
  const summarise = (r) => ({
    solvable: r.solvable, fastestSec: Number.isFinite(r.fastestSec) ? r.fastestSec : null, worstSec: r.worstSec ?? null,
    steps: r.path ? r.path.length : 0, endsAtExit: !!(r.path && r.path.length && r.path[r.path.length - 1].to === 1),
    margin: r.margin,
  });
  function memo(kind, platforms, opts, run) {
    const key = createHash('sha256').update(VERSION).update(kind).update(json(platforms)).update(json(opts)).digest('hex');
    if (!(key in old)) { misses++; old[key] = summarise(run()); }
    used[key] = old[key];
    return old[key];
  }
  return {
    // solveSection-equivalent on a pattern: { solvable, fastestSec, worstSec, steps, endsAtExit, margin }
    section: (pattern, opts = {}) => memo('section', sectionPlatforms(pattern), opts,
      () => solvePlatforms(sectionPlatforms(pattern), { startIndex: 0, goalIndex: 1, ...opts })),
    platforms: (platforms, opts = {}) => memo('platforms', platforms, opts,
      () => solvePlatforms(platforms, { startIndex: 0, goalIndex: 1, ...opts })),
    robust: (pattern, opts = {}) => memo('robust', sectionPlatforms(pattern), opts, () => solveSectionRobust(pattern, opts)),
    get misses() { return misses; },
  };
}
