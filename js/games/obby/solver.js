// 못깨는 타워: section solver. Proves a section pattern can be cleared by forward SIMULATION with the real
// jump-map physics (stepPlayer), not by geometry guesses. Pure, no DOM.
//
// Search: A* over "snapshot" nodes, ordered by elapsed time + weight * (height still to climb / 450 px/s).
//   node A = standing on a platform  (key: platform, x bin [x relative to the platform for moving ones],
//            ice speed bin, moving-platform phase bin, crumble standing-time bin)
//   node B = just bounced off a spring (airborne, vy = SPRING_V)
// Transitions are input macros simulated tick by tick (dt = 1/60) with stepPlayer on a working copy of the
// platforms (moving platforms follow x = baseX + sin(time*speed + phase)*range, the same rule as the game):
//   ground macro  hold left/right until moved 8/24/60px (max 5 s), or 'none' for 8/24/50 ticks (wait / slide / ride a belt;
//                 only where that can matter: moving platforms, ice, conveyor, wind). Walking onto an adjacent
//                 platform ends the macro there; walking off / crumbling continues as a fall.
//   jump macro    press jump, then an air policy: hold d1 for h ticks then d2 (full hold, release, late
//                 start, reversal), optional air (double) jump press at 12/20/28 ticks
//                 -> ends on the first landing on ANOTHER platform (node A) or a spring bounce (node B)
// A transition fails on a spike 'hit', when the player drops 120px below its start (or 60px below the
// lowest platform) or after 3 s in the air. A crumble platform can be stood on < CRUMBLE_SEC in total (its
// standing time is in the node) and is treated as gone once left (the gone-mask travels with the node but is
// not part of the key: merging can only lose routes, never invent one). Goal = standing on the exit rest.
//
// Modes: 'fastest' (default; weight 2 -> near-optimal time; moving-platform sections are solved for
// `phaseSamples` (3) start phases and fastestSec is their mean, worstSec the max) and 'any' (weight 3, one
// start phase: a quick solvability proof - with a static entry platform you can always wait for any phase).
//
// Bounds: x bins 20px, ice speed bins 40px/s, phase bins 8 per period (moving platforms of
// one section share one speed), crumble bins 0.1 s, at most `maxNodes` (default 2500) expansions and
// `maxTime` (default 60 s) of simulated time per search; at most 31 crumble platforms per section. Results
// are cached per (platform data, env, jitter, mode, options) for the life of the process. Only platforms in
// the vertical band a transition can reach are simulated. The test suite additionally memoises results in
// tests/fixtures (tests/obby-cache.mjs, keyed by a hash of this file + the physics + the platform data).
//
// Robust mode (solveSectionRobust): a transition only counts when it still lands on the same platform with
// the jump press delayed / advanced by `timingMs`, the start x shifted by +-`xPx`, and (when used) the air
// jump press and the air-control release shifted by +-`timingMs`. "Advanced" is modelled by running the
// world clock (moving platforms, crumble time) that much earlier; "delayed" by standing still first.
import { stepPlayer, createPlayer } from '../jump/world.js';
import { SECTION_H, sectionPlatforms } from './sections.js';

export const DT = 1 / 60;
const XBIN = 20, VXBIN = 40, PHASE_BINS = 8, CRBIN = 0.1;
const MAX_AIR_TICKS = 180;
const MAX_DROP = 120;         // a transition fails once the player is 120px below where it started
const CLIMB_PX_PER_SEC = 450; // optimistic climb speed for the A* heuristic

const AIR_POLICIES = (() => {
  const out = [];
  for (const d of [-1, 0, 1]) out.push({ d1: d, h: Infinity, d2: d });
  for (const d of [-1, 1]) {
    for (const h of [8, 16, 24, 34]) out.push({ d1: d, h, d2: 0 });   // hold then release (precise landing)
    for (const h of [10, 20]) out.push({ d1: 0, h, d2: d });         // straight up, then sideways
    out.push({ d1: d, h: 16, d2: -d });                                // reverse in the air
  }
  return out;
})();
const DJ_TICKS = [null, 12, 20, 28];
const GROUND_MOVES = [8, 24, 60];  // walk until moved this many px (or 5 s): works against belts / wind
const MAX_WALK_TICKS = 300;
const GROUND_WAITS = [8, 24, 50];

const INPUTS = [-1, 0, 1].map((d) => [false, true].map((jump) => Object.freeze({ left: d < 0, right: d > 0, jump, canJump: true })));

const cache = new Map();

function makeCtx(platforms, env, startIndex, goalIndex) {
  const plats = platforms.map((p, i) => ({ ...p, _i: i }));
  const movers = plats.filter((p) => p.type === 'moving');
  const speeds = [...new Set(movers.map((p) => p.speed))];
  const period = movers.length ? (2 * Math.PI) / speeds[0] : 0;
  const crumbleBit = new Map();
  plats.forEach((p, i) => { if (p.type !== 'spike' && p.surface === 'crumble') crumbleBit.set(i, crumbleBit.size); });
  const solids = plats.filter((p) => p.type !== 'spike');
  const floorY = Math.min(...solids.map((p) => p.y)) - 60;
  const hasWind = !!(env && env.wind && env.wind.some((z) => z.vx));
  return { plats, work: plats.map((p) => ({ ...p })), movers, period,
    localCache: new Map(),
    sinBuf: new Float64Array(movers.length), cosBuf: new Float64Array(movers.length),
    sinStep: movers.map((m) => Math.sin(m.speed * DT)), cosStep: movers.map((m) => Math.cos(m.speed * DT)), multiSpeed: speeds.length > 1, crumbleBit, floorY, env: env || {}, hasWind, startIndex, goalIndex, goalY: plats[goalIndex].y };
}

function moverX(p, t) { return p.baseX + Math.sin(t * p.speed + p.phase) * p.range; }

function resetWork(ctx, t, mask, startPi, cr) {
  const { plats, work } = ctx;
  for (let i = 0; i < plats.length; i++) {
    const p = plats[i], w = work[i];
    w.x = p.type === 'moving' ? moverX(p, t) : p.x;
    w.dx = 0;
    w.crumbleT = i === startPi ? cr : 0;
    const bit = ctx.crumbleBit.get(i);
    w.gone = bit !== undefined && ((mask >>> bit) & 1) === 1;
  }
}

function restorePlayer(ctx, n) {
  const s = createPlayer(n.x, n.y);
  s.vx = n.vx; s.vy = n.vy; s.onGround = n.onGround; s.ground = n.onGround ? ctx.work[n.pi] : null;
  s.airJumped = n.airJumped; s.coyote = 0; s.jumpBuf = 0;
  return s;
}

function snapshot(s, pi, t, mask, cr, kind) {
  return { kind, pi, x: s.x, y: s.y, vx: s.vx || 0, vy: s.vy, onGround: s.onGround, airJumped: s.airJumped, t, mask, cr };
}

function nodeKey(ctx, n) {
  const p = ctx.plats[n.pi];
  const rel = p.type === 'moving' ? n.x - moverX(p, n.t) : n.x;
  let ph = 0;
  if (ctx.movers.length) {
    ph = ctx.multiSpeed ? Math.floor(n.t / 0.25) : Math.floor((((n.t % ctx.period) + ctx.period) % ctx.period) / ctx.period * PHASE_BINS);
  }
  // the crumbled-platform mask is NOT part of the key: merging can only lose routes (never invent one)
  return `${n.kind}${n.pi}|${Math.round(rel / XBIN)}|${Math.round(n.vx / VXBIN)}|${ph}|${Math.round(n.cr / CRBIN)}`;
}

// Runs one macro from node n. jit = { xOff, delay, adv, djShift, hShift } (ticks / px). Returns
// { end: 'land'|'spring'|'fail'|'self', node? }.
function simulate(ctx, n, macro, jit) {
  const adv = jit ? jit.adv || 0 : 0;
  const delay = jit ? jit.delay || 0 : 0;
  const worldT0 = n.t - adv * DT;
  resetWork(ctx, worldT0, n.mask, n.pi, Math.max(0, n.cr - adv * DT));
  const s = restorePlayer(ctx, n);
  if (jit && jit.xOff) s.x += jit.xOff;
  const env = ctx.env;
  const work = ctx.work;
  const local = localPlatforms(ctx, n.y);
  // moving platforms: x = baseX + sin(t*speed + phase)*range, advanced per tick by an angle-addition
  // recurrence (no Math.sin in the inner loop)
  const movers = ctx.movers, nm = movers.length;
  const sn = ctx.sinBuf, cs = ctx.cosBuf;
  for (let k = 0; k < nm; k++) {
    const a = worldT0 * movers[k].speed + movers[k].phase;
    sn[k] = Math.sin(a); cs[k] = Math.cos(a);
  }
  const start = work[n.pi];
  const ground = macro.type === 'ground';
  const walkTicks = ground ? (macro.dist ? MAX_WALK_TICKS : macro.ticks) : 0;
  const x0 = s.x;
  const total = ground ? walkTicks + MAX_AIR_TICKS : MAX_AIR_TICKS + delay;
  const h = macro.h + (jit ? jit.hShift || 0 : 0);
  const dj = macro.dj == null ? null : macro.dj + (jit ? jit.djShift || 0 : 0);
  let airborne = false; // ground macro: walked off an edge / the platform crumbled -> now falling
  for (let i = 0; i < total; i++) {
    for (let k = 0; k < nm; k++) {
      const m = movers[k], w = work[m._i];
      const s1 = sn[k] * ctx.cosStep[k] + cs[k] * ctx.sinStep[k];
      cs[k] = cs[k] * ctx.cosStep[k] - sn[k] * ctx.sinStep[k];
      sn[k] = s1;
      const nx = m.baseX + s1 * m.range;
      w.dx = nx - w.x;
      w.x = nx;
    }
    let dir = 0, jump = false;
    if (macro.type === 'ground') dir = macro.dir;
    else {
      const k = i - delay;
      if (k < 0) dir = 0;
      else {
        dir = k < h ? macro.d1 : macro.d2;
        if (macro.type === 'jump' && k === 0) jump = true;
        if (dj !== null && k === dj) jump = true;
      }
    }
    const ev = stepPlayer(s, INPUTS[dir + 1][jump ? 1 : 0], DT, local, env).events;
    let hit = false, sprang = false, landed = false;
    for (let e = 0; e < ev.length; e++) {
      const v = ev[e];
      if (v === 'hit') hit = true; else if (v === 'sprang') sprang = true; else if (v === 'landed') landed = true;
    }
    if (hit) return { end: 'fail' };
    if (s.y < ctx.floorY || s.y < n.y - MAX_DROP) return { end: 'fail' };
    const t = n.t + (i + 1) * DT;
    if (ground && !airborne) {
      if (s.onGround && s.ground !== start) {
        // walked straight onto an adjacent platform at the same height (walkway segments, moving joints)
        return { end: 'land', node: snapshot(s, s.ground._i, t, maskAfterLeaving(ctx, n), 0, 'A') };
      }
      if (!s.onGround && !sprang) { airborne = true; continue; }
      if (i + 1 >= walkTicks || (macro.dist && Math.abs(s.x - x0) >= macro.dist)) return { end: 'land', node: snapshot(s, n.pi, t, n.mask, start.crumbleT || 0, 'A') };
      continue;
    }
    if (sprang) {
      const pi = s.landedOn._i;
      const mask = maskAfterLeaving(ctx, n);
      return { end: 'spring', node: snapshot(s, pi, t, mask, 0, 'B') };
    }
    if (landed) {
      const pi = s.ground._i;
      if (pi === n.pi && n.kind === 'A') return { end: 'self' };
      const mask = maskAfterLeaving(ctx, n);
      return { end: 'land', node: snapshot(s, pi, t, mask, 0, 'A') };
    }
  }
  return { end: 'fail' };
}

// Only platforms in the vertical band a transition can touch (MAX_DROP below .. spring + air jump above)
// are handed to stepPlayer: identical results, far fewer collision checks in tall sections.
const BAND_BELOW = MAX_DROP + 40, BAND_ABOVE = 380;
function localPlatforms(ctx, y) {
  const key = Math.floor(y / 10);
  let arr = ctx.localCache.get(key);
  if (!arr) {
    const lo = key * 10 - BAND_BELOW, hi = key * 10 + 10 + BAND_ABOVE;
    arr = ctx.work.filter((p) => p.y >= lo && p.y <= hi);
    ctx.localCache.set(key, arr);
  }
  return arr;
}

function maskAfterLeaving(ctx, n) {
  const bit = ctx.crumbleBit.get(n.pi);
  return bit === undefined || n.kind !== 'A' ? n.mask : (n.mask | (1 << bit)) >>> 0;
}

function macrosFor(ctx, n) {
  const out = [];
  const djs = DJ_TICKS;
  for (const pol of AIR_POLICIES) {
    for (const dj of djs) out.push({ type: n.kind === 'A' ? 'jump' : 'air', d1: pol.d1, h: pol.h, d2: pol.d2, dj });
  }
  if (n.kind === 'A') {
    for (const d of [-1, 1]) for (const dist of GROUND_MOVES) out.push({ type: 'ground', dir: d, dist });
    const p = ctx.plats[n.pi];
    if (ctx.movers.length || p.surface === 'ice' || p.surface === 'conveyor' || ctx.hasWind) {
      for (const ticks of GROUND_WAITS) out.push({ type: 'ground', dir: 0, ticks });
    }
  }
  return out;
}

function jitterVariants(macro, jitter) {
  const k = Math.round((jitter.timingMs || 0) / 1000 / DT);
  const x = jitter.xPx || 0;
  const v = [];
  if (x) v.push({ xOff: x }, { xOff: -x });
  if (k) {
    if (macro.type === 'jump') v.push({ delay: k }, { adv: k });
    if (macro.dj != null) v.push({ djShift: k }, { djShift: -Math.min(k, macro.dj - 1) });
    if (Number.isFinite(macro.h) && macro.h > 0) v.push({ hShift: k }, { hShift: -Math.min(k, macro.h) });
  }
  return v;
}

function robustOk(ctx, n, macro, res, jitter) {
  for (const jit of jitterVariants(macro, jitter)) {
    const r = simulate(ctx, n, macro, jit);
    if (r.end !== res.end || r.node.pi !== res.node.pi) return false;
  }
  return true;
}

// Minimal binary heap keyed by f.
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(v) {
    const a = this.a; a.push(v);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

function search(ctx, t0, startX, opts) {
  const jitter = opts.jitter;
  const maxNodes = opts.maxNodes ?? 2500;
  const maxTime = opts.maxTime ?? 60;
  const sp = ctx.plats[ctx.startIndex];
  const start = { kind: 'A', pi: ctx.startIndex, x: startX ?? sp.x + sp.w / 2, y: sp.y, vx: 0, vy: 0, onGround: true, airJumped: false, t: t0, mask: 0, cr: 0, parent: null, macro: null };
  const weight = opts.mode === 'any' ? 3 : (opts.weight ?? 2);
  const heur = (n) => weight * Math.max(0, ctx.goalY - n.y) / CLIMB_PX_PER_SEC;
  const heap = new Heap();
  const closed = new Set();
  start.f = t0 + heur(start);
  heap.push(start);
  let expanded = 0;
  while (heap.size) {
    const n = heap.pop();
    if (n.kind === 'A' && n.pi === ctx.goalIndex) return { node: n, expanded };
    const key = nodeKey(ctx, n);
    if (closed.has(key)) continue;
    closed.add(key);
    if (++expanded > maxNodes || n.t - t0 > maxTime) break;
    for (const m of macrosFor(ctx, n)) {
      const r = simulate(ctx, n, m, null);
      if (r.end === 'fail' || r.end === 'self') continue;
      const c = r.node;
      if (closed.has(nodeKey(ctx, c))) continue;
      if (jitter && m.type !== 'ground' && !robustOk(ctx, n, m, r, jitter)) continue;
      c.parent = n; c.macro = m;
      c.f = c.t + heur(c);
      heap.push(c);
    }
  }
  return { node: null, expanded };
}

function describePath(ctx, goal, t0) {
  const steps = [];
  for (let n = goal; n && n.parent; n = n.parent) {
    const m = n.macro;
    steps.push({
      action: m.type === 'ground' ? (m.dir ? (m.dir < 0 ? 'walkLeft' : 'walkRight') : 'wait') : m.type === 'jump' ? 'jump' : 'springAir',
      from: n.parent.pi, to: n.pi, t: +(n.parent.t - t0).toFixed(3), x: +n.parent.x.toFixed(1),
      macro: { ...m }, land: { x: +n.x.toFixed(1), y: n.y, t: +(n.t - t0).toFixed(3) },
    });
  }
  return steps.reverse();
}

function startTimes(ctx, opts) {
  if (opts.startTimes) return opts.startTimes;
  if (!ctx.movers.length || opts.mode === 'any') return [0];
  const k = opts.phaseSamples ?? 3;
  const T = ctx.multiSpeed ? 6 : ctx.period;
  return Array.from({ length: k }, (_, i) => (T * i) / k);
}

// Low-level: solve over an explicit platform list (indices of the start / goal platforms).
// opts: { env, jitter:{timingMs,xPx}, startX, startTimes:[s], phaseSamples, maxNodes, maxTime }
export function solvePlatforms(platforms, { startIndex = 0, goalIndex = 1, ...opts } = {}) {
  const ctx = makeCtx(platforms, opts.env, startIndex, goalIndex);
  const times = startTimes(ctx, opts);
  let worst = 0, sum = 0, best = null, expanded = 0;
  for (const t0 of times) {
    const r = search(ctx, t0, opts.startX, opts);
    expanded += r.expanded;
    if (!r.node) return { solvable: false, fastestSec: Infinity, path: [], expanded, failedStartTime: t0, margin: { timingMs: 0, xPx: 0 } };
    const dt = r.node.t - t0;
    sum += dt; worst = Math.max(worst, dt);
    if (!best || dt < best.dt) best = { dt, node: r.node, t0 };
  }
  return {
    solvable: true,
    fastestSec: +(sum / times.length).toFixed(2),      // mean over the sampled start phases
    worstSec: +worst.toFixed(2),
    path: describePath(ctx, best.node, best.t0),
    expanded,
    margin: { timingMs: opts.jitter ? opts.jitter.timingMs || 0 : 0, xPx: opts.jitter ? opts.jitter.xPx || 0 : 0 },
  };
}

function cacheKey(pattern, opts) {
  return JSON.stringify([pattern.platforms, opts.env || null, opts.jitter || null, opts.mode || 'fastest', opts.startTimes || null, opts.phaseSamples || null, opts.maxNodes || null, opts.maxTime || null],
    (k, v) => (v === Infinity ? 'Inf' : v === -Infinity ? '-Inf' : v));
}

// solveSection(pattern, opts?) -> { solvable, fastestSec, path, margin:{timingMs,xPx} } (+ worstSec, expanded)
// pattern = a SECTIONS entry (relative coords; the entry/exit rest platforms are added here).
// opts = { env (stepPlayer env), jitter, phaseSamples, startTimes, maxNodes, maxTime }.
export function solveSection(pattern, opts = {}) {
  const key = cacheKey(pattern, opts);
  if (cache.has(key)) return cache.get(key);
  const res = solvePlatforms(sectionPlatforms(pattern), { startIndex: 0, goalIndex: 1, ...opts });
  cache.set(key, res);
  return res;
}

// solveSectionRobust(pattern, { envs=[{}], jitter={timingMs:80,xPx:8}, findMax=false })
//   -> { solvable, fastestSec, path, margin:{timingMs,xPx}, perEnv:[result] }
// solvable = a jitter-proof route exists under EVERY env. margin = the jitter that was proven; with
// findMax, the largest level of MARGIN_LADDER (all envs) is searched and reported instead.
export const MARGIN_LADDER = [
  { timingMs: 20, xPx: 2 }, { timingMs: 40, xPx: 4 }, { timingMs: 50, xPx: 5 }, { timingMs: 60, xPx: 6 },
  { timingMs: 80, xPx: 8 }, { timingMs: 100, xPx: 10 }, { timingMs: 120, xPx: 12 },
];
export function solveSectionRobust(pattern, { envs = [{}], jitter = { timingMs: 80, xPx: 8 }, findMax = false, ...rest } = {}) {
  const run = (jit) => {
    const perEnv = envs.map((env) => solveSection(pattern, { ...rest, env, jitter: jit }));
    return { solvable: perEnv.every((r) => r.solvable), perEnv };
  };
  if (!findMax) {
    const r = run(jitter);
    const first = r.perEnv[0];
    return { solvable: r.solvable, fastestSec: first.fastestSec, path: first.path, margin: r.solvable ? { ...jitter } : { timingMs: 0, xPx: 0 }, perEnv: r.perEnv };
  }
  let best = null;
  for (const lv of MARGIN_LADDER) {
    const r = run(lv);
    if (!r.solvable) break;
    best = { lv, r };
  }
  if (!best) return { solvable: false, fastestSec: Infinity, path: [], margin: { timingMs: 0, xPx: 0 }, perEnv: [] };
  const first = best.r.perEnv[0];
  return { solvable: true, fastestSec: first.fastestSec, path: first.path, margin: { ...best.lv }, perEnv: best.r.perEnv };
}

export { SECTION_H };
