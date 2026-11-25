// 못깨는 타워: attempt state machine + progress rules (pure logic, no DOM).
// phases: 'idle' -> 'playing' -> 'failed' -> ('needsQuiz' ->) 'playing' ... -> 'cleared'.
// An attempt = one try from the spawn (or the last checkpoint in practice mode) until a fail; each attempt
// costs 1 energy at its start. beginAttempt() decides: enough energy -> 'start', else -> 'quiz'
// (so the quiz only ever opens between attempts).
import { PX_PER_M, PLAYER_HALF_W } from '../jump/world.js';

export const FAIL_SEC = 0.8;            // fail beat before the next attempt
export const BEST_TIME_KEY = 'gimkit-energy:obby:besttime';

export const metersAt = (y) => Math.max(0, Math.floor(y / PX_PER_M));

// 1-based number of the section the height y is in (standing on a rest platform = the next section's
// entry; clamped to the last section).
export function sectionAt(y, sections) {
  if (!sections.length) return 1;
  for (const s of sections) if (y < s.y1) return s.index + 1;
  return sections.length;
}

// mm:ss (minutes are not capped at 2 digits).
export function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function createAttempts({ mode = 'practice', tower }) {
  return {
    mode,
    tower,
    phase: 'idle',
    attempts: 0,
    respawn: { x: tower.spawn.x, y: tower.spawn.y, section: 1, platformIndex: 0 },
    checkpoint: -1,          // index into tower.checkpoints of the last reached one
    attemptMaxY: tower.spawn.y,
    runMaxY: tower.spawn.y,
    attemptSection: 1,
    bestSection: 1,
    time: 0,                 // time in the current attempt
    runTime: 0,              // total climbing time of the run (all attempts)
    failT: 0,
    failReason: null,
    last: null,              // { section, best, meters, reason } of the last ended attempt
  };
}

// Between attempts (idle / failed beat over / needsQuiz): 'start' (caller spends 1 energy) or 'quiz'.
export function beginAttempt(st, energyValue) {
  if (st.phase === 'cleared' || st.phase === 'playing') return null;
  if (!(energyValue >= 1)) { st.phase = 'needsQuiz'; return 'quiz'; }
  st.phase = 'playing';
  st.attempts += 1;
  st.time = 0;
  st.failT = 0;
  st.failReason = null;
  st.attemptMaxY = st.respawn.y;
  st.attemptSection = sectionAt(st.respawn.y, st.tower.sections);
  return 'start';
}

// Per playing tick: time + height progress + checkpoints by height reached. Returns events ['checkpoint'].
export function track(st, player, dt = 0) {
  const ev = [];
  if (st.phase !== 'playing') return ev;
  st.time += dt;
  st.runTime += dt;
  if (player.y > st.attemptMaxY) st.attemptMaxY = player.y;
  if (player.y > st.runMaxY) st.runMaxY = player.y;
  st.attemptSection = Math.max(st.attemptSection, sectionAt(st.attemptMaxY, st.tower.sections));
  st.bestSection = Math.max(st.bestSection, st.attemptSection);
  if (st.mode === 'practice') {
    const cps = st.tower.checkpoints;
    for (let i = st.checkpoint + 1; i < cps.length; i++) {
      if (st.attemptMaxY < cps[i].y) break;
      st.checkpoint = i;
      const p = st.tower.platforms[cps[i].platformIndex];
      st.respawn = { x: p ? p.x + p.w / 2 : st.tower.spawn.x, y: cps[i].y, section: cps[i].section + 1, platformIndex: cps[i].platformIndex };
      ev.push('checkpoint');
    }
  }
  return ev;
}

// The attempt ends (fall / spike / water). Returns { section, best, meters, reason }.
export function failAttempt(st, reason = 'fall') {
  if (st.phase !== 'playing') return st.last;
  st.phase = 'failed';
  st.failT = 0;
  st.failReason = reason;
  st.last = { section: st.attemptSection, best: st.bestSection, meters: metersAt(st.runMaxY), reason };
  return st.last;
}

// Fail beat timer; true once the beat is over (the caller then calls beginAttempt).
export function tickFail(st, dt) {
  if (st.phase !== 'failed') return false;
  st.failT += dt;
  return st.failT >= FAIL_SEC;
}

// Standing on (or reaching) the goal platform on top of the tower.
export function isCleared(player, tower) {
  if (player.onGround && player.ground && player.ground.feature === 'goal') return true;
  const goal = tower.platforms.find((p) => p.feature === 'goal');
  if (!goal || player.y < goal.y) return false;
  return player.x + PLAYER_HALF_W >= goal.x && player.x - PLAYER_HALF_W <= goal.x + goal.w && player.vy <= 0;
}

export function clearRun(st) {
  if (st.phase !== 'playing') return false;
  st.phase = 'cleared';
  st.attemptSection = st.tower.sections.length;
  st.bestSection = st.tower.sections.length;
  st.runMaxY = Math.max(st.runMaxY, st.tower.height);
  return true;
}

// Best clear time (s) in localStorage (per mode: hard = BEST_TIME_KEY, practice = BEST_TIME_KEY + ':practice').
export function bestTimeKey(mode) { return mode === 'practice' ? BEST_TIME_KEY + ':practice' : BEST_TIME_KEY; }
export function getBestTime(mode, storage = globalThis.localStorage) {
  try {
    const n = Number(storage.getItem(bestTimeKey(mode)));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch { return 0; }
}
export function saveBestTime(mode, sec, storage = globalThis.localStorage) {
  const prev = getBestTime(mode, storage);
  const s = Math.max(1, Math.round(sec));
  const isNew = !prev || s < prev;
  if (isNew) { try { storage.setItem(bestTimeKey(mode), String(s)); } catch { /* ignore */ } }
  return { best: isNew ? s : prev, prev, isNew };
}
