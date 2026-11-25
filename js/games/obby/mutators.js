// 못깨는 타워: mutator runtime (pure logic, no DOM). One mutator per hard-mode run.
// All tuning numbers of the six mutators live here (spec §6: "조정 상수는 한 곳에").
import { MUTATORS, envFor, applyCrumbleAll } from './tower.js';
import { WIND_SPEED } from '../jump/world.js';

// 🌊 water: starts WATER.startBelow px below the spawn, waits WATER.delay s, then rises WATER.speed px/s.
export const WATER = Object.freeze({ startBelow: 300, delay: 5, speed: 28 });
// ⏱ jump power: every JUMP_CYCLE_SEC the jump scale changes to a different value of JUMP_SCALES.
// Kept mild (0.8 / 1.0 / 1.1, = envFor('jumppower-low'/'jumppower-high')): a bigger jump would reach the next
// walkway floor 180px up and skip whole floors; a smaller one changes timing, not routes. Every pattern is
// proven clearable at 0.8 and 1.1 and never faster than 65% of its normal time (tests/obby-nontrivial.test.js).
// 🪶 low gravity is envFor('lowgravity') = gravityScale 0.85: floatier, wider arcs, harder to stop precisely,
// but still well short of skipping a floor (same proofs).
export const JUMP_CYCLE_SEC = 10;
export const JUMP_SCALES = Object.freeze([0.8, 1, 1.1]);
// 🤝 shake: camera offset amplitude (px) + a horizontal drift (wind env) re-randomised every `interval` s.
export const SHAKE = Object.freeze({ amp: 2, interval: 0.35, maxVx: 30 });
// 💨 wind: constant push, one direction per run.
export const WIND_VX = WIND_SPEED; // 45 px/s

export const MUTATOR_BY_KIND = new Map(MUTATORS.map((m) => [m.kind, m]));

const BANNER_TITLE = {
  water: '물이 차올라요!',
  shake: '손이 떨려요!',
  lowgravity: '무중력이에요!',
  jumppower: '점프력이 바뀌어요!',
  crumbleAll: '발판이 무너져요!',
  wind: '바람이 불어요!',
};

// Attempt-start announcement: { title: '🌊 물이 차올라요!', sub: <metadata description> } (null for none).
export function mutatorBanner(kind) {
  const m = MUTATOR_BY_KIND.get(kind);
  if (!m) return null;
  return { title: `${m.emoji} ${BANNER_TITLE[kind] || m.label + '!'}`, sub: m.description, label: m.label, emoji: m.emoji };
}

// One mutator kind chosen with the rng (every MUTATORS entry is compatible: buildTower skips patterns
// flagged incompatible with it).
export function pickMutator(rng) {
  return MUTATORS[Math.min(MUTATORS.length - 1, Math.floor(rng() * MUTATORS.length))].kind;
}

// 🌊 water surface height (world px, y up) at attempt time t.
export function waterLevel(t, spawnY = 0, cfg = WATER) {
  return spawnY - cfg.startBelow + Math.max(0, t - cfg.delay) * cfg.speed;
}

// ⏱ deterministic schedule: period 0 is 1.0, every later period a different scale picked with the rng.
// at(t) -> { scale, index, remaining (s until the next change), next (the upcoming scale) }.
export function createJumpSchedule(rng, cycle = JUMP_CYCLE_SEC, scales = JUMP_SCALES) {
  const seq = [1];
  const ensure = (n) => {
    while (seq.length <= n) {
      const prev = seq[seq.length - 1];
      const others = scales.filter((s) => s !== prev);
      seq.push(others[Math.min(others.length - 1, Math.floor(rng() * others.length))]);
    }
  };
  return {
    at(t) {
      const tt = Math.max(0, t);
      const index = Math.floor(tt / cycle);
      ensure(index + 1);
      return { scale: seq[index], index, remaining: (index + 1) * cycle - tt, next: seq[index + 1] };
    },
  };
}

// 🤝 shake: drift vx in [-maxVx, maxVx], re-randomised every `interval` s; camera offset |x|,|y| <= amp.
export function createShakeDrift(rng, cfg = SHAKE) {
  let timer = 0;
  const roll = () => (rng() * 2 - 1) * cfg.maxVx;
  const d = {
    vx: 0,
    reset() { timer = 0; d.vx = roll(); },
    update(dt) {
      timer += dt;
      while (timer >= cfg.interval) { timer -= cfg.interval; d.vx = roll(); }
      return d.vx;
    },
    offset(t) {
      return { x: cfg.amp * Math.sin(t * 43.1) * Math.cos(t * 7.3), y: cfg.amp * Math.sin(t * 37.7 + 1.3) * 0.8 };
    },
  };
  d.vx = roll();
  return d;
}

// Platforms of a run with the mutator applied (🧱 crumbleAll -> applyCrumbleAll; others untouched copies).
export function preparePlatforms(kind, platforms) {
  return kind === 'crumbleAll' ? applyCrumbleAll(platforms) : platforms.map((p) => ({ ...p }));
}

const FULL = (vx) => ({ wind: [{ y0: -Infinity, y1: Infinity, vx }] });

// Per-run runtime. kind = a MUTATORS kind or 'none'. reset() at every attempt start, update(dt) every tick,
// env() = the stepPlayer env for this tick.
export function createMutatorRuntime(kind = 'none', rng = Math.random) {
  const meta = MUTATOR_BY_KIND.get(kind) || null;
  const rt = {
    kind: meta ? kind : 'none',
    meta,
    t: 0,
    windDir: 0,
    jump: null,
    shake: null,
    reset() {
      rt.t = 0;
      if (rt.shake) rt.shake.reset();
    },
    update(dt) {
      rt.t += dt;
      if (rt.shake) rt.shake.update(dt);
    },
    env() {
      switch (rt.kind) {
        case 'lowgravity': return envFor('lowgravity');
        case 'jumppower': return { jumpScale: rt.jumpInfo().scale };
        case 'wind': return FULL(rt.windDir * WIND_VX);
        case 'shake': return FULL(rt.shake.vx);
        default: return {};
      }
    },
    jumpInfo() { return rt.jump ? rt.jump.at(rt.t) : { scale: 1, index: 0, remaining: Infinity, next: 1 }; },
    waterY(spawnY = 0) { return rt.kind === 'water' ? waterLevel(rt.t, spawnY) : -Infinity; },
    cameraOffset() { return rt.shake ? rt.shake.offset(rt.t) : { x: 0, y: 0 }; },
  };
  if (rt.kind === 'wind') rt.windDir = rng() < 0.5 ? -1 : 1;
  if (rt.kind === 'jumppower') rt.jump = createJumpSchedule(rng);
  if (rt.kind === 'shake') rt.shake = createShakeDrift(rng);
  return rt;
}
