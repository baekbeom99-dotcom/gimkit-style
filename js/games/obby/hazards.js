// 못깨는 타워: elimination hazards beyond the plain spike (pure, no DOM).
// Every hazard is a platform entry with `type: 'spike'` (so the jump-map physics, the solver and the tests already
// treat it as "touching = the attempt ends") plus a `hz` kind and optional geometry / timing:
//   hz: 'lava'    static lethal strip (pool): { x, y, w, h = 16 }.
//   hz: 'laser'   beam that is ON for `on` s of every `period` s (world clock t + phase): { x, y, w, h = 8, period, on,
//                 phase }; OFF = `off: true` (harmless). `warn` is true for LASER_WARN s before it switches on.
//   hz: 'saw'     patrolling saw blade, 30x30, along a line: axis 'x' (default): x = baseX + sin(t*speed + phase)*range,
//                 axis 'y': y = baseY + sin(...)*range (y = the blade's bottom); like moving platforms the position
//                 is a pure function of the world clock t.
//   hz: 'crusher' block hanging from the ceiling that drops periodically: { x, w, h, y = bottom when slammed down,
//                 rise = px it hangs higher while raised, period, phase }. Cycle (start of period = raised): raised for
//                 `period - CRUSHER_FALL - CRUSHER_DOWN - CRUSHER_RISE`, falls in CRUSHER_FALL s, stays down
//                 CRUSHER_DOWN s, rises in CRUSHER_RISE s. `warn` is true for CRUSHER_WARN s before the fall.
// The world clock t is the attempt time (game simT, solver time): applyHazard(p, t) sets p.x / p.y / p.off / p.warn
// for the dynamic kinds. The lethal test is exactly stepPlayer's spike test (see touchesHazard).
import { PLAYER_HALF_W, PLAYER_H, SPIKE_H } from '../jump/world.js';

export const HAZARD_KINDS = Object.freeze(['lava', 'laser', 'saw', 'crusher']);
export const LASER_WARN = 0.4;
export const CRUSHER_FALL = 0.12;
export const CRUSHER_DOWN = 0.45;
export const CRUSHER_RISE = 0.6;
export const CRUSHER_WARN = 0.45;
export const SAW_SIZE = 30;

const mod = (a, b) => ((a % b) + b) % b;
export const hazardHeight = (p) => p.h ?? SPIKE_H;
export const isHazard = (p) => p.type === 'spike';
export const isDynamicHazard = (p) => p.type === 'spike' && (p.hz === 'laser' || p.hz === 'saw' || p.hz === 'crusher');
// cycle length (s) of a dynamic hazard (saw: one full sine period)
export const hazardCycle = (p) => (p.hz === 'saw' ? (2 * Math.PI) / p.speed : p.period);

export function laserIsOn(p, t) { return mod(t + (p.phase || 0), p.period) < p.on; }

export function crusherUpTime(p) { return p.period - CRUSHER_FALL - CRUSHER_DOWN - CRUSHER_RISE; }
// bottom y of the crusher block at world time t
export function crusherY(p, t) {
  const c = mod(t + (p.phase || 0), p.period), up = crusherUpTime(p), r = p.rise;
  if (c < up) return p.y + r;
  if (c < up + CRUSHER_FALL) { const e = (c - up) / CRUSHER_FALL; return p.y + r * (1 - e * e); }
  if (c < up + CRUSHER_FALL + CRUSHER_DOWN) return p.y;
  const e = (c - up - CRUSHER_FALL - CRUSHER_DOWN) / CRUSHER_RISE;
  return p.y + r * (e * e * (3 - 2 * e));
}

// Sets the time-dependent state of a dynamic hazard. `w` carries the static parameters (p.y of a crusher / y-saw is
// its anchor, so the solver keeps `base` fields on its work copies: baseY / y0). Static hazards are left alone.
export function applyHazard(w, t) {
  if (w.hz === 'saw') {
    const s = Math.sin(t * w.speed + w.phase);
    if (w.axis === 'y') w.y = w.baseY + s * w.range;
    else w.x = w.baseX + s * w.range;
  } else if (w.hz === 'laser') {
    w.off = !laserIsOn(w, t);
    w.warn = w.off && mod(t + (w.phase || 0), w.period) >= w.period - LASER_WARN;
  } else if (w.hz === 'crusher') {
    if (w.y0 === undefined) w.y0 = w.y;
    const src = { y: w.y0, rise: w.rise, period: w.period, phase: w.phase };
    w.y = crusherY(src, t);
    const c = mod(t + (w.phase || 0), w.period), up = crusherUpTime(w);
    w.warn = c >= up - CRUSHER_WARN && c < up;
  }
}

// Advance every dynamic hazard of a platform list to world time t (game side).
export function updateHazards(platforms, t) {
  for (const p of platforms) if (isDynamicHazard(p)) applyHazard(p, t);
}

// stepPlayer's spike test, for finding out WHICH hazard killed the player (fail text / sfx).
export function touchesHazard(s, p) {
  return p.type === 'spike' && !p.off &&
    s.x + PLAYER_HALF_W > p.x + 3 && s.x - PLAYER_HALF_W < p.x + p.w - 3 &&
    s.y < p.y + hazardHeight(p) && s.y + PLAYER_H > p.y;
}
// failure reason of a hit: 'spike' | 'lava' | 'laser' | 'saw' | 'crusher'
export function hitReason(s, platforms) {
  for (const p of platforms) if (touchesHazard(s, p)) return p.hz || 'spike';
  return 'spike';
}
