// Titan Rush renderer: procedural Canvas 2D arena (no assets). Logical width 360, logical height = ctx.height (200..640).
// Everything scales with H (layoutOf) so nothing stretches or overlaps. save()/restore() are balanced; no gradients,
// no shadowBlur -> cheap enough for phones.
//
// API
//   const fx = createFx(rng?)            transient effects (slashes, damage numbers, gold pops, banner, flashes...)
//   fxEvent(fx, ev, s)                   feed ONE logic event ({type,...}); s = logic state (for hero position)
//   fxEvents(fx, events, s)              feed a list
//   fxUpdate(fx, dt, s)                  age effects, scroll the parallax, ally bolts in the boss phase
//   fxReset(fx)
//   drawTitans(g, W, H, view, fx, t)     view = { s: logicState, hints: null | 'wave' | 'boss' }; t = game seconds
//   boss fight events: bossPhase (PHASE banner) projectileRemoved / projectileTap (pops) shieldDown / shieldUp (shield break / re-form)
//   events handled: hit (weak / crit / ally / overdrive) kill goldGain heroHit (heart:true red, heart:false = energy hit,
//   yellow) energyHit noEnergy (rate-limited hint '문제를 풀어요!') overdrive miss upgrade bossStart/Clear/Timeout gameOver
//   layoutOf(W, H)                       pixel layout (ground line, character scales)
//   fmtNum(n)                            1234 -> '1.2K'
import { rr, safeRadialGlow } from '../common/canvas-fx.js';
import { BOSS_X, BOSS_TIME, SWING_TIME, BOSS_PHASE_AT, PROJ_SPAWN_R, PROJ_SPAWN_L, BIG_HP } from './logic.js';
import { biomeAt, PERIOD } from './themes.js';

const TAU = Math.PI * 2;
const OL = '#1b1340';
const FONT = 'Galmuri11, "Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (p) => 1 - (1 - p) * (1 - p);

export function fmtNum(n) {
  n = Math.max(0, Math.round(Number(n) || 0));
  if (n < 1000) return String(n);
  const u = ['K', 'M', 'B', 'T'];
  let v = n, i = -1;
  while (v >= 1000 && i < 3) { v /= 1000; i++; }
  return (v < 10 ? Number(v.toFixed(1)) : Math.round(v)) + u[i];
}

export function layoutOf(W, H) {
  const cu = clamp(H / 260, 0.66, 1.3);         // character scale
  const bu = Math.min(cu, 1.1);                // boss scale
  const ui = clamp(H / 300, 0.85, 1.15);        // text / bar scale
  const gh = clamp(H * 0.22, 46, 110);          // ground band height
  const groundTop = H - gh;
  return { W, H, cu, bu, ui, gh, groundTop, feetY: groundTop + gh * 0.42 };
}

// ---------------------------------------------------------------- fx
export function createFx(rng = Math.random) {
  return {
    rng, slashes: [], nums: [], golds: [], puffs: [], bolts: [], flash: {}, bossFlash: 0, heroFlash: 0,
    shake: 0, banner: null, fade: 0, over: 0, land: 0, burst: null, vig: 0, boltT: 0, ally: 0, lvl: 0,
    scroll: 0, lastBiome: -1, lastKillX: 0.5, koT: 0, hint: null, vigColor: '#ff2a4a',
    pops: [], shieldBreak: 0, shieldForm: 0, phaseFlash: 0,
  };
}
export function fxReset(fx) {
  Object.assign(fx, createFx(fx.rng));
}

const cap = (arr, n) => { while (arr.length > n) arr.shift(); };
const BANNERS = {
  boss: { text: '⚠ BOSS BATTLE', color: '#c4162e', dur: 1.9, big: true },
  over: { text: '⚡ OVERDRIVE!', sub: '5연속 정답! 모든 적에게 번개!', color: '#2a6bff', dur: 1.3 },
  time: { text: 'TIME OVER!', sub: '보스가 밀어냈어요', color: '#c4162e', dur: 1.3 },
  ko: { text: 'GAME OVER', color: '#3a2a8a', dur: 3, big: true },
};
const PHASE_BANNERS = [null,
  { text: '⚠ PHASE 2', sub: '연속 발사! 왼쪽도 조심!', color: '#b85a00', dur: 1.5, big: true },
  { text: '⚠ PHASE 3', sub: '분노! 양쪽에서 날아와요!', color: '#8a0e2e', dur: 1.7, big: true },
];

export function fxEvent(fx, ev, s) {
  const r = fx.rng;
  switch (ev.type) {
    case 'stageStart': {
      const b = biomeAt(ev.biome);
      fx.banner = { text: `STAGE ${ev.stage}`, sub: `${b.icon} ${b.name}`, color: '#3a2a8a', dur: 1.5, t: 0 };
      if (fx.lastBiome >= 0 && fx.lastBiome !== ev.biome) fx.fade = 1;
      fx.lastBiome = ev.biome;
      break;
    }
    case 'bossStart':
      fx.banner = { ...BANNERS.boss, sub: biomeAt(s ? s.biome : 0).boss.name, t: 0 };
      fx.land = 0.55;
      break;
    case 'bossClear':
      fx.burst = { t: 0, life: 0.9 };
      fx.shake = Math.max(fx.shake, 0.4);
      break;
    case 'hit': {
      if (ev.source === 'ally') {
        fx.bolts.push({ from: fx.ally++ % 2 ? 'mage' : 'archer', x: ev.boss ? BOSS_X : ev.x, boss: !!ev.boss, t: 0, life: 0.2 });
        cap(fx.bolts, 8);
      } else if (ev.source !== 'overdrive') {
        const dir = ev.boss ? -1 : (ev.x < 0.5 ? -1 : 1);
        fx.slashes.push({ x: ev.boss ? BOSS_X : ev.x, boss: !!ev.boss, dir, crit: !!ev.crit, weak: !!ev.weak, t: 0, life: ev.crit ? 0.26 : ev.weak ? 0.12 : 0.18, jy: (r() - 0.5) * 20, rot: (r() - 0.5) * 0.5 });
        cap(fx.slashes, 10);
      }
      fx.nums.push({
        x: ev.boss ? BOSS_X : ev.x, boss: !!ev.boss, text: fmtNum(ev.dmg), crit: !!ev.crit,
        kind: ev.source === 'ally' ? 'ally' : ev.source === 'overdrive' ? 'over' : ev.weak ? 'weak' : 'tap',
        t: 0, life: ev.crit ? 0.95 : 0.7, jx: (r() - 0.5) * 2, jy: r() * 12,
      });
      cap(fx.nums, 22);
      if (ev.boss) fx.bossFlash = 0.1;
      else if (ev.id != null) fx.flash[ev.id] = 0.1;
      if (ev.crit) fx.shake = Math.max(fx.shake, 0.12);
      break;
    }
    case 'kill':
      fx.lastKillX = ev.x;
      fx.puffs.push({ x: ev.x, t: 0, life: 0.4 });
      cap(fx.puffs, 8);
      break;
    case 'goldGain':
      fx.golds.push({ x: ev.source === 'boss' ? BOSS_X : fx.lastKillX, boss: ev.source === 'boss', text: '+' + fmtNum(ev.amount), t: 0, life: 0.9 });
      cap(fx.golds, 8);
      break;
    case 'heroHit': // heart:false = the hit was paid with energy (yellow, gentler); otherwise a heart is lost (red)
      if (ev.heart === false) { fx.heroFlash = 0.4; fx.shake = Math.max(fx.shake, 0.2); fx.vig = 0.35; fx.vigColor = '#ffb703'; }
      else { fx.heroFlash = 0.55; fx.shake = Math.max(fx.shake, 0.3); fx.vig = 0.45; fx.vigColor = '#ff2a4a'; }
      break;
    case 'energyHit':
      fx.nums.push({ x: s ? s.hero.x : 0.5, hero: true, text: `-${ev.cost}⚡`, kind: 'energy', t: 0, life: 0.9, jx: 0, jy: 0 });
      cap(fx.nums, 22);
      break;
    case 'noEnergy': // the shell throttles the sound; the hint is rate-limited here (show again only after 0.5 s)
      if (!fx.hint || fx.hint.t > 0.5) fx.hint = { t: 0, life: 1.1 };
      break;
    case 'bossPhase': {
      const pb = PHASE_BANNERS[clamp(ev.n - 1, 1, 2)];
      fx.banner = { ...pb, t: 0 };
      fx.phaseFlash = 0.55; fx.shake = Math.max(fx.shake, 0.35);
      break;
    }
    case 'projectileRemoved':
      fx.pops.push({ x: ev.x, side: ev.side, big: !!ev.big, by: ev.by, t: 0, life: ev.by === 'hit' ? 0.5 : 0.36 });
      cap(fx.pops, 10);
      break;
    case 'projectileTap': // first tap of a 2-HP shot: a crack spark
      if (!ev.removed) { fx.pops.push({ x: ev.x, side: ev.side, big: true, by: 'crack', t: 0, life: 0.22 }); cap(fx.pops, 10); }
      break;
    case 'shieldDown':
      fx.shieldBreak = 0.45;
      fx.nums.push({ x: BOSS_X, boss: true, text: '💥 공격!', kind: 'win', t: 0, life: 0.9, jx: 0, jy: 0 });
      cap(fx.nums, 22);
      break;
    case 'shieldUp':
      fx.shieldForm = 0.4;
      break;
    case 'overdrive':
      fx.banner = { ...BANNERS.over, t: 0 };
      fx.over = 0.7; fx.shake = Math.max(fx.shake, 0.25);
      break;
    case 'miss':
      fx.nums.push({ x: s ? clamp(s.hero.x + (ev.dir === 'left' ? -0.12 : ev.dir === 'right' ? 0.12 : 0), 0.05, 0.95) : 0.5, hero: true, text: 'MISS', kind: 'miss', t: 0, life: 0.5, jx: 0, jy: 0 });
      cap(fx.nums, 22);
      break;
    case 'upgrade':
      fx.lvl = 0.6;
      fx.nums.push({ x: s ? s.hero.x : 0.5, hero: true, text: `${ev.kind === 'sword' ? '⚔' : '🛡'} Lv.${ev.level}`, kind: 'lvl', t: 0, life: 1, jx: 0, jy: 0 });
      cap(fx.nums, 22);
      break;
    case 'bossTimeout':
      fx.banner = { ...BANNERS.time, t: 0 };
      break;
    case 'gameOver':
      fx.banner = { ...BANNERS.ko, t: 0 };
      fx.koT = 0.001;
      break;
    default:
  }
}
export function fxEvents(fx, events, s) {
  for (const ev of events) fxEvent(fx, ev, s);
}

function age(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    e.t += dt;
    if (e.t >= e.life) list.splice(i, 1);
  }
}
export function fxUpdate(fx, dt, s) {
  age(fx.pops, dt);
  fx.shieldBreak = Math.max(0, fx.shieldBreak - dt);
  fx.shieldForm = Math.max(0, fx.shieldForm - dt);
  fx.phaseFlash = Math.max(0, fx.phaseFlash - dt);
  age(fx.slashes, dt); age(fx.nums, dt); age(fx.golds, dt); age(fx.puffs, dt); age(fx.bolts, dt);
  if (fx.hint) { fx.hint.t += dt; if (fx.hint.t >= fx.hint.life) fx.hint = null; }
  for (const k in fx.flash) { fx.flash[k] -= dt; if (fx.flash[k] <= 0) delete fx.flash[k]; }
  fx.bossFlash = Math.max(0, fx.bossFlash - dt);
  fx.heroFlash = Math.max(0, fx.heroFlash - dt);
  fx.shake = Math.max(0, fx.shake - dt);
  fx.fade = Math.max(0, fx.fade - dt * 1.6);
  fx.over = Math.max(0, fx.over - dt);
  fx.vig = Math.max(0, fx.vig - dt);
  fx.lvl = Math.max(0, fx.lvl - dt);
  if (fx.koT > 0) fx.koT += dt;
  if (fx.land > 0) {
    fx.land -= dt;
    if (fx.land <= 0) { fx.land = 0; fx.shake = Math.max(fx.shake, 0.3); fx.puffs.push({ x: BOSS_X, t: 0, life: 0.5, big: true }); }
  }
  if (fx.burst) { fx.burst.t += dt; if (fx.burst.t >= fx.burst.life) fx.burst = null; }
  if (fx.banner) { fx.banner.t += dt; if (fx.banner.t >= fx.banner.dur) fx.banner = null; }
  if (s) {
    const mv = s.phase === 'wave' ? 1 : s.phase === 'boss' ? 0.3 : 0;
    fx.scroll += dt * mv;
    if (s.phase === 'boss' && s.allyLv > 0 && !s.over && fx.land <= 0 && s.boss && !s.boss.shielded) {
      fx.boltT -= dt;
      if (fx.boltT <= 0) {
        fx.boltT = 0.45;
        fx.bolts.push({ from: fx.ally++ % 2 && s.allyLv >= 5 ? 'mage' : 'archer', x: BOSS_X, boss: true, t: 0, life: 0.2 });
        cap(fx.bolts, 8);
      }
    }
  }
}

// ---------------------------------------------------------------- text helpers
const fontCache = new Map();
function setFont(g, size) {
  const k = Math.max(6, Math.round(size));
  let f = fontCache.get(k);
  if (!f) { f = `900 ${k}px ${FONT}`; fontCache.set(k, f); }
  g.font = f;
}
function text(g, s, x, y, size, fill, align = 'center', stroke = OL) {
  setFont(g, size);
  g.textAlign = align;
  g.textBaseline = 'middle';
  if (stroke) { g.lineWidth = Math.max(2, size * 0.24); g.strokeStyle = stroke; g.strokeText(s, x, y); }
  g.fillStyle = fill;
  g.fillText(s, x, y);
}
function measure(g, s, size) {
  setFont(g, size);
  const m = g.measureText(s);
  return (m && m.width) || String(s).length * size * 0.9;
}

// ---------------------------------------------------------------- shape helpers
function blob(g, x, y, rx, ry, fill, lw = 2) {
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU);
  g.fillStyle = fill; g.fill();
  if (lw) { g.lineWidth = lw; g.strokeStyle = OL; g.stroke(); }
}
function poly(g, p, fill, lw = 2) {
  g.beginPath(); g.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) { g.lineWidth = lw; g.strokeStyle = OL; g.stroke(); }
}
function box(g, x, y, w, h, fill, lw = 2, r = 0) {
  if (r > 0) rr(g, x, y, w, h, r); else { g.beginPath(); g.rect(x, y, w, h); }
  g.fillStyle = fill; g.fill();
  if (lw) { g.lineWidth = lw; g.strokeStyle = OL; g.stroke(); }
}
function limb(g, x0, y0, x1, y1, w, fill) { // outlined thick round line
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
  g.strokeStyle = OL; g.lineWidth = w + 4; g.stroke();
  g.strokeStyle = fill; g.lineWidth = w; g.stroke();
  g.lineCap = 'butt';
}
function limb2(g, x0, y0, x1, y1, x2, y2, w, fill) { // two-segment leg
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2);
  g.strokeStyle = OL; g.lineWidth = w + 4; g.stroke();
  g.strokeStyle = fill; g.lineWidth = w; g.stroke();
  g.lineCap = 'butt';
}
function shadow(g, x, y, rx, ry) {
  g.globalAlpha = 0.28; g.fillStyle = '#000';
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
  g.globalAlpha = 1;
}
function glow(g, x, y, r, color, a) {
  if (!(r > 0) || a <= 0) return;
  g.save();
  g.globalAlpha = clamp(a, 0, 1);
  safeRadialGlow(g, x, y, r * 1.65, color, 'rgba(0,0,0,0)');
  g.globalAlpha = clamp(a * 0.55, 0, 1);
  g.fillStyle = color;
  g.beginPath(); g.arc(x, y, r * 0.65, 0, TAU); g.fill();
  g.restore();
}
function gradY(g, x0, y0, y1, stops) {
  if (typeof g.createLinearGradient === 'function' && Math.abs(y1 - y0) > 0.5) {
    const gr = g.createLinearGradient(x0, y0, x0, y1);
    if (gr && typeof gr.addColorStop === 'function') {
      for (const [off, col] of stops) gr.addColorStop(off, col);
      return gr;
    }
  }
  return stops[0][1];
}
function zig(g, x0, y0, x1, y1, segs, seed, amp) {
  g.beginPath(); g.moveTo(x0, y0);
  for (let i = 1; i < segs; i++) {
    const k = i / segs;
    const n = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    g.lineTo(x0 + (x1 - x0) * k + ((n - Math.floor(n)) - 0.5) * amp, y0 + (y1 - y0) * k);
  }
  g.lineTo(x1, y1);
}

// ---------------------------------------------------------------- background
const wrapX = (x, off) => ((x - off) % PERIOD + PERIOD) % PERIOD - 70;

function drawCumulusCloud(g, x, y, s, topCol, botCol) {
  const hw = 24 * s;
  const h = 16 * s;
  g.save();
  g.beginPath();
  g.moveTo(x - hw + 5 * s, y + 4 * s);
  g.quadraticCurveTo(x - hw - 2 * s, y + 4 * s, x - hw + 1 * s, y - 2 * s);
  g.arc(x - 12 * s, y - 2 * s, 9 * s, Math.PI * 0.92, Math.PI * 1.72);
  g.arc(x - 1 * s, y - 7 * s, 11.5 * s, Math.PI * 1.08, Math.PI * 1.92);
  g.arc(x + 12 * s, y - 2 * s, 8.5 * s, Math.PI * 1.25, Math.PI * 0.08);
  g.quadraticCurveTo(x + hw + 2 * s, y + 4 * s, x + hw - 5 * s, y + 4 * s);
  g.closePath();
  g.fillStyle = gradY(g, x, y - h, y + 5 * s, [[0, topCol], [0.68, topCol], [1, botCol]]);
  g.fill();
  g.globalAlpha = 0.5;
  g.strokeStyle = '#ffffff';
  g.lineWidth = Math.max(1, 1.4 * s);
  g.stroke();
  g.restore();
}

function drawPine(g, x, base, h, c, dark, trunk) {
  const w = h * 0.54;
  // ground contact shadow
  g.globalAlpha = 0.18;
  g.fillStyle = '#153824';
  g.beginPath(); g.ellipse(x, base - 1, w * 0.36, 3.2, 0, 0, TAU); g.fill();
  g.globalAlpha = 1;
  // trunk + sunlit bark edge
  const tw = Math.max(3, w * 0.14);
  g.fillStyle = trunk; g.fillRect(x - tw / 2, base - h * 0.2, tw, h * 0.2);
  g.fillStyle = 'rgba(255,220,170,.28)'; g.fillRect(x - tw / 2, base - h * 0.2, Math.max(1, tw * 0.35), h * 0.2);
  // 4 layered boughs with slight curve
  for (let i = 0; i < 4; i++) {
    const top = base - h + i * h * 0.21;
    const bot = top + h * 0.33;
    const hw = (w / 2) * (0.42 + 0.2 * i);
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(x, top);
    g.quadraticCurveTo(x + hw * 0.65, (top + bot) * 0.55, x + hw, bot);
    g.quadraticCurveTo(x, bot + 3, x - hw, bot);
    g.quadraticCurveTo(x - hw * 0.65, (top + bot) * 0.55, x, top);
    g.closePath();
    g.fill();
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(x, top);
    g.quadraticCurveTo(x + hw * 0.65, (top + bot) * 0.55, x + hw, bot);
    g.quadraticCurveTo(x + hw * 0.35, bot + 2, x, bot + 1.5);
    g.closePath();
    g.fill();
  }
}

function drawTower(g, it, sx, base, hpx, ly, t) {
  const x0 = Math.round(sx - it.w / 2), top = Math.round(base - hpx);
  g.fillStyle = gradY(g, x0, top, base, [[0, ly.color], [1, ly.edge]]);
  g.fillRect(x0, top, it.w, hpx + 4);
  // subtle vertical glass sheen & frame edges
  g.globalAlpha = 0.12; g.fillStyle = '#b6c2ff';
  g.fillRect(x0 + 3, top + 3, Math.max(3, it.w * 0.22), hpx);
  g.globalAlpha = 1;
  g.fillStyle = ly.edge; g.fillRect(x0, top, 2, hpx + 4); g.fillRect(x0 + it.w - 2, top, 2, hpx + 4); g.fillRect(x0, top, it.w, 3);
  if (it.roof === 1) {
    g.fillStyle = ly.edge; g.fillRect(sx - 1, top - 14, 2, 14);
    const blink = 0.55 + 0.45 * Math.sin(t * 4 + it.x);
    glow(g, sx, top - 15, 4.5, '#ff4d6d', 0.45 * blink);
    g.fillStyle = '#ff6b8b'; g.fillRect(sx - 1.5, top - 16, 3, 3);
  } else if (it.roof === 2) {
    g.fillStyle = ly.color; g.fillRect(x0 + it.w * 0.22, top - 8, it.w * 0.56, 8);
    g.fillStyle = ly.edge; g.fillRect(x0 + it.w * 0.22, top - 8, it.w * 0.56, 2);
  }
  const cw = (it.w - 8) / it.cols, rh = (hpx - 14) / it.rows;
  for (let i = 0; i < it.wins.length; i++) {
    const w = it.wins[i];
    const wx = x0 + 4 + w[0] * cw + 1, wy = top + 8 + w[1] * rh + 1;
    const ww = Math.max(2, cw - 3), wh = Math.max(2, rh - 3.5);
    g.fillStyle = ly.lit[w[2]];
    g.fillRect(wx, wy, ww, wh);
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.fillRect(wx, wy, ww, Math.max(1, wh * 0.3));
  }
  if (it.sign) {
    const sw = it.w * 0.74, sh = 7, sx0 = x0 + (it.w - sw) / 2, sy0 = top + hpx * 0.1;
    g.globalAlpha = 0.28; g.fillStyle = it.sign; rr(g, sx0 - 3, sy0 - 3, sw + 6, sh + 6, 4); g.fill();
    g.globalAlpha = 1; rr(g, sx0, sy0, sw, sh, 2.5); g.fill();
    g.fillStyle = 'rgba(255,255,255,.7)'; rr(g, sx0 + 2, sy0 + 1.5, sw - 4, 2, 1); g.fill();
  }
}

function drawLayer(g, L, ly, sc, t) {
  const { W, groundTop: gt } = L;
  const off = (sc * ly.speed) % PERIOD;
  const base = gt + 2;
  if (ly.kind === 'stars') {
    g.fillStyle = '#fff';
    for (const it of ly.items) {
      g.globalAlpha = 0.35 + 0.55 * Math.sin(t * 2.2 + it.p);
      const sz = (it.p > 4 ? 2.2 : 1.5);
      g.fillRect(Math.round(it.x * W / PERIOD), Math.round(it.y * gt), sz, sz);
    }
    g.globalAlpha = 1;
    return;
  }
  for (const it of ly.items) {
    const sx = wrapX(it.x, off);
    if (sx > W + 70) continue;
    if (ly.kind === 'clouds') {
      drawCumulusCloud(g, sx, it.y * gt, it.s * L.ui, ly.color, ly.shade);
    } else if (ly.kind === 'hills') {
      const hr = it.h * gt;
      g.fillStyle = gradY(g, sx, base - hr, base, [[0, ly.color], [1, ly.shade || ly.color]]);
      g.beginPath(); g.ellipse(sx, base, it.w / 2, hr, 0, Math.PI, TAU); g.fill();
      g.globalAlpha = 0.22; g.strokeStyle = '#ffffff'; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(sx, base, it.w / 2, hr, 0, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      g.globalAlpha = 1;
    } else if (ly.kind === 'pines') {
      drawPine(g, sx, base + 6, it.h * gt, ly.color, ly.dark, ly.trunk);
    } else if (ly.kind === 'towers') {
      drawTower(g, it, sx, base, it.h * gt, ly, t);
    } else if (ly.kind === 'lamps') {
      const ph = Math.min(80, gt * 0.42);
      const topY = base + 8 - ph;
      // curved streetlamp neck
      g.strokeStyle = ly.pole; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(sx, base + 6);
      g.lineTo(sx, topY + 10);
      g.quadraticCurveTo(sx, topY, sx + 10, topY);
      g.stroke();
      g.lineCap = 'butt';
      // cone of warm streetlamp light onto ground
      g.globalAlpha = 0.11;
      g.fillStyle = ly.glow;
      g.beginPath();
      g.moveTo(sx + 8, topY + 3);
      g.lineTo(sx + 28, base);
      g.lineTo(sx - 8, base);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
      glow(g, sx + 10, topY + 4, 9, ly.glow, 0.3);
      box(g, sx + 6, topY - 1, 9, 4, ly.glow, 1.2, 2);
    }
  }
}

function drawSun(g, L, b) {
  const s = b.sun;
  if (!s) return;
  const r = s.r * L.ui, x = s.x * L.W, y = s.y * L.groundTop;
  g.save();
  g.globalAlpha = 0.5;
  safeRadialGlow(g, x, y, r * 2.5, s.halo, 'rgba(255,255,255,0)');
  g.globalAlpha = 1;
  g.fillStyle = gradY(g, x, y - r, y + r, [[0, '#ffffff'], [0.35, s.color], [1, s.halo]]);
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  if (b.id === 'neon') {
    // subtle synthwave scan slits on lower half of moon
    g.fillStyle = b.sky[1];
    for (let i = 0; i < 3; i++) {
      const sy = y + r * (0.28 + i * 0.22);
      g.fillRect(x - r, sy, r * 2, 1.3 + i * 0.4);
    }
  }
  g.restore();
}

function drawGround(g, L, b, sc) {
  const gr = b.ground, { W, H, groundTop: y, gh, ui } = L;
  const off = (sc * 34) % 44;
  g.fillStyle = gradY(g, 0, y, H, [[0, gr.dirt], [0.65, gr.dirtDark], [1, '#120b24']]);
  g.fillRect(0, y, W, H - y);
  g.fillStyle = gr.edge; g.fillRect(0, y - 2, W, 2);
  if (gr.pattern === 'grass') {
    const th = 9 * ui;
    g.fillStyle = gradY(g, 0, y, y + th, [[0, gr.topLight], [0.45, gr.top], [1, gr.tuft]]);
    g.fillRect(0, y, W, th);
    g.fillStyle = gr.dirtDark; g.fillRect(0, y + th, W, 2.5);
    for (let x = -off; x < W + 44; x += 44) {
      // curved grass tuft
      g.fillStyle = gr.top;
      g.beginPath();
      g.moveTo(x + 4, y + 1); g.lineTo(x + 7, y - 6); g.lineTo(x + 10, y + 1);
      g.moveTo(x + 9, y + 1); g.lineTo(x + 13, y - 4); g.lineTo(x + 16, y + 1);
      g.fill();
      // rounded pebbles & soil texture
      g.fillStyle = gr.dirtLight; rr(g, x + 7, y + gh * 0.46, 13, 4.5, 2); g.fill();
      g.fillStyle = gr.dirtDark; rr(g, x + 23, y + gh * 0.68, 15, 5, 2.5); g.fill();
      rr(g, x + 3, y + gh * 0.78, 8, 3.5, 1.5); g.fill();
    }
  } else {
    const th = gh * 0.24;
    g.fillStyle = gradY(g, 0, y, y + th, [[0, gr.topLight], [0.4, gr.top], [1, gr.dirt]]);
    g.fillRect(0, y, W, th);
    // glowing neon curb & ground bounce
    g.fillStyle = gr.neon; g.fillRect(0, y - 2, W, 2);
    g.globalAlpha = 0.16; g.fillRect(0, y, W, 8); g.globalAlpha = 1;
    g.fillStyle = gr.dirtLight; g.fillRect(0, y + th, W, 2);
    for (let x = -off; x < W + 44; x += 44) {
      g.fillStyle = gr.tuft; rr(g, x + 2, y + gh * 0.58, 22, 4, 2); g.fill();
      g.globalAlpha = 0.15; g.fillStyle = gr.neon; rr(g, x + 20, y + gh * 0.78, 18, 4, 2); g.fill(); g.globalAlpha = 1;
    }
  }
}

function drawBackground(g, L, b, sc, t) {
  const stops = b.sky.map((col, idx) => [b.sky.length > 1 ? idx / (b.sky.length - 1) : 0, col]);
  g.fillStyle = gradY(g, 0, 0, L.groundTop, stops);
  g.fillRect(0, 0, L.W, L.groundTop + 2);
  // horizon atmosphere veil
  g.globalAlpha = b.id === 'neon' ? 0.18 : 0.24;
  g.fillStyle = b.id === 'neon' ? '#ff9ad0' : '#ffffff';
  g.fillRect(0, L.groundTop * 0.74, L.W, L.groundTop * 0.26 + 2);
  g.globalAlpha = 1;
  drawSun(g, L, b);
  for (const ly of b.layers) drawLayer(g, L, ly, sc, t);
  drawGround(g, L, b, sc);
}

// ---------------------------------------------------------------- characters (local origin = feet centre, +x = facing)
const SWORD_TIERS = [
  { lv: 1, blade: '#dce6f7', dark: '#8fa4cc', hi: '#ffffff', guard: '#ffd23f', gem: '#ff4d6d' },
  { lv: 5, blade: '#76c8ff', dark: '#2b7cc4', hi: '#e8f8ff', guard: '#ffd23f', gem: '#3ad6ff' },
  { lv: 10, blade: '#ffd23f', dark: '#d97a00', hi: '#fff8c8', guard: '#ff4d6d', gem: '#7cf0ff' },
];
const swordTier = (lv) => (lv >= 10 ? SWORD_TIERS[2] : lv >= 5 ? SWORD_TIERS[1] : SWORD_TIERS[0]);

function drawHero(g, x, y, k, o) {
  g.save();
  g.translate(x, y);
  if (o.ko) g.rotate(o.face * 0.9 * Math.min(1, o.ko * 3));
  g.scale(o.face * k, k);
  if (o.blink) g.globalAlpha = 0.45;
  const swinging = o.swing >= 0;
  const bob = o.ko ? 0 : Math.sin(o.t * 7) * 1.4;
  const lean = swinging ? 0.14 * Math.sin(o.swing * Math.PI) : 0;
  shadow(g, 0, 1, 16, 4);
  if (o.aura) glow(g, 0, -20, 26, '#7cf0ff', 0.28);

  g.save();
  g.rotate(lean);
  // flowing crimson scarf / cape tail behind hero
  const w1 = Math.sin(o.t * 10) * 2.4 + (swinging ? -3 : 0);
  const w2 = Math.cos(o.t * 10) * 2.2;
  poly(g, [-7, -20 + bob, -22, -16 + bob + w1, -26, -11 + bob + w2, -15, -9 + bob + w1 * 0.5, -6, -15 + bob], '#d62843', 1.8);
  poly(g, [-8, -20 + bob, -20, -16 + bob + w1, -18, -14 + bob + w1], '#ff6b80', 0);

  // boots (armored leather)
  box(g, -9.5, -8, 7.5, 8, '#6b3b16', 1.8, 3);
  box(g, 1.5, -8, 7.5, 8, '#6b3b16', 1.8, 3);
  g.fillStyle = '#a8652c'; g.fillRect(-8, -6.5, 4.5, 2); g.fillRect(3, -6.5, 4.5, 2);

  // tunic torso + gold belt + shoulder armor pad
  box(g, -9.5, -21 + bob, 19, 14, '#2f5fd0', 2, 5);
  g.fillStyle = '#5c8cff'; g.fillRect(-7.5, -19.5 + bob, 5, 8);
  box(g, -10, -11 + bob, 20, 3.6, '#7a4419', 1.4, 1);
  box(g, -2.5, -11.5 + bob, 5, 4.6, '#ffd23f', 1.2, 1);
  blob(g, -7, -18 + bob, 4.5, 3.8, '#cfd8ec', 1.6);

  // head + hair + headband
  blob(g, 1, -29 + bob, 11.5, 10.5, '#ffd9a8', 2.2);
  g.fillStyle = '#ffb59e'; g.globalAlpha *= 0.65;
  g.beginPath(); g.ellipse(-4.5, -25.5 + bob, 2.2, 1.3, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(8, -25.5 + bob, 2.2, 1.3, 0, 0, TAU); g.fill();
  g.globalAlpha = o.blink ? 0.45 : 1;

  // spiky brown hair crown
  poly(g, [-11, -32 + bob, -13, -40 + bob, -5, -37 + bob, -2, -43 + bob, 3, -38 + bob, 9, -42 + bob, 11, -35 + bob, 13, -33 + bob, 8, -32 + bob], '#4a2914', 2);
  // headband + fluttering ribbon tail
  box(g, -10.5, -35 + bob, 22.5, 4.2, '#e8324a', 1.6, 1.5);
  poly(g, [-10.5, -33 + bob, -20, -35 + bob + w1 * 0.7, -18, -30 + bob + w2 * 0.7, -10.5, -31 + bob], '#e8324a', 1.4);

  // expressive eyes & mouth
  if (o.ko) {
    g.strokeStyle = OL; g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(-2, -31); g.lineTo(2, -26); g.moveTo(2, -31); g.lineTo(-2, -26);
    g.moveTo(6, -31); g.lineTo(10, -26); g.moveTo(10, -31); g.lineTo(6, -26);
    g.stroke();
  } else {
    box(g, -2.5, -31.5 + bob, 5, 6.2, '#fff', 1.3, 2);
    box(g, 5.5, -31.5 + bob, 5, 6.2, '#fff', 1.3, 2);
    g.fillStyle = OL; g.fillRect(0.2, -29.5 + bob, 2.3, 3.6); g.fillRect(8.2, -29.5 + bob, 2.3, 3.6);
    g.fillStyle = '#fff'; g.fillRect(0.4, -29.5 + bob, 1.1, 1.3); g.fillRect(8.4, -29.5 + bob, 1.1, 1.3);
    // determined brow & grin
    g.strokeStyle = OL; g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-3, -32.8 + bob); g.lineTo(2.5, -31.5 + bob);
    g.moveTo(5.5, -31.5 + bob); g.lineTo(11, -32.8 + bob);
    g.moveTo(1.5, -23 + bob); g.quadraticCurveTo(4.5, -21.5 + bob, 7.5, -23.5 + bob);
    g.stroke();
  }

  if (o.flash > 0) {
    g.save();
    g.globalAlpha = Math.min(0.6, o.flash);
    blob(g, 0.5, -21 + bob, 13, 18, '#ff2a4a', 0);
    g.restore();
  }

  // sword arm + tiered beveled blade
  blob(g, 9.5, -16 + bob, 3.8, 3.2, '#ffd9a8', 1.6);
  const tier = swordTier(o.swordLv), L = 25 + Math.min(11, o.swordLv * 0.75);
  g.save();
  g.translate(11.5, -16 + bob);
  g.rotate(swinging ? -2.0 + ease(o.swing) * 3.05 : -1.05 + Math.sin(o.t * 4) * 0.06);
  if (o.swordLv >= 5) glow(g, 14 + L * 0.4, 0, 12, tier.blade, 0.25);
  box(g, -4.5, -1.7, 6, 3.4, '#7a4419', 1.4, 1);
  blob(g, -4.5, 0, 2.3, 2.3, tier.guard, 1.2);
  poly(g, [1.5, -6.5, 4.8, -5.5, 4.8, 5.5, 1.5, 6.5], tier.guard, 1.6);
  blob(g, 3.2, 0, 1.8, 1.8, tier.gem, 0.8);
  // upper sunlit blade edge + lower shaded edge
  poly(g, [4.8, -3.4, 4.8 + L, -3.2, 9.5 + L, 0, 4.8, 0], tier.hi, 0);
  poly(g, [4.8, 0, 9.5 + L, 0, 4.8 + L, 3.2, 4.8, 3.4], tier.dark, 0);
  poly(g, [4.8, -3.4, 4.8 + L, -3.2, 9.5 + L, 0, 4.8 + L, 3.2, 4.8, 3.4], null, 1.8);
  g.fillStyle = tier.blade; g.fillRect(5.5, -1.2, L - 2, 2.4);
  g.restore();
  g.restore();
  g.restore();
}

function drawAlly(g, kind, x, y, k, face, t, ph) {
  g.save();
  g.translate(x, y);
  g.scale(face * k, k);
  const bob = Math.sin(t * 5 + ph) * 1.2;
  shadow(g, 0, 1, 12, 3.2);
  if (kind === 'archer') {
    // quiver + arrow feathers
    box(g, -11, -24 + bob, 5.5, 13, '#7a4419', 1.5, 2);
    g.fillStyle = '#ff6b8b'; g.fillRect(-10.5, -27 + bob, 2, 3); g.fillRect(-7.5, -27 + bob, 2, 3);
    // cape & green tunic
    poly(g, [-10, -14 + bob, -4, -22 + bob, 7, -18 + bob, 8, -3 + bob, -9, -3 + bob], '#2e9c4c', 2);
    box(g, -5.5, -6, 4.5, 6, '#5c3616', 1.4, 2); box(g, 1.5, -6, 4.5, 6, '#5c3616', 1.4, 2);
    // hooded head + face
    blob(g, 1, -21 + bob, 8.2, 7.6, '#39b859', 2);
    blob(g, 2.5, -20.5 + bob, 5.2, 4.8, '#ffd9a8', 1.4);
    g.fillStyle = OL; g.fillRect(2.2, -21.8 + bob, 1.8, 2.8); g.fillRect(5.5, -21.8 + bob, 1.8, 2.8);
    // recurve bow + arrow
    g.strokeStyle = '#8a5a2b'; g.lineWidth = 2.6; g.beginPath(); g.arc(8.5, -15 + bob, 10, -1.25, 1.25); g.stroke();
    g.strokeStyle = '#e8f0ff'; g.lineWidth = 1.1; g.beginPath();
    g.moveTo(8.5 + 10 * Math.cos(-1.25), -15 + bob + 10 * Math.sin(-1.25));
    g.lineTo(6.5, -15 + bob);
    g.lineTo(8.5 + 10 * Math.cos(1.25), -15 + bob + 10 * Math.sin(1.25));
    g.stroke();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(6.5, -15 + bob); g.lineTo(20, -15 + bob); g.stroke();
  } else if (kind === 'mage') {
    // staff + glowing mana gem
    g.strokeStyle = '#6b3e1b'; g.lineWidth = 2.8; g.beginPath(); g.moveTo(11, -1); g.lineTo(11, -28 + bob); g.stroke();
    glow(g, 11, -30 + bob, 6 + Math.sin(t * 6) * 1.2, '#7cf0ff', 0.65);
    poly(g, [11, -35 + bob, 14.5, -30 + bob, 11, -25 + bob, 7.5, -30 + bob], '#bffaff', 1.4);
    // mystic robe + gold trim
    poly(g, [-9, -3 + bob * 0.3, -6, -19 + bob, 6, -19 + bob, 9, -3 + bob * 0.3], '#7a49e6', 2);
    g.fillStyle = '#ffd23f'; g.fillRect(-6, -10 + bob * 0.5, 12, 2);
    // face + pointed wizard hat
    blob(g, 1, -22 + bob, 6, 5.2, '#ffd9a8', 1.6);
    g.fillStyle = OL; g.fillRect(1, -23.2 + bob, 1.8, 2.6); g.fillRect(4.5, -23.2 + bob, 1.8, 2.6);
    poly(g, [-10, -25 + bob, 0, -42 + bob, 10, -25 + bob], '#572cb8', 2);
    box(g, -12.5, -26.5 + bob, 25, 3.6, '#431f96', 1.6, 1.8);
    g.fillStyle = '#ffd23f'; g.fillRect(-1.5, -33 + bob, 3, 3);
  } else {
    // knight: armored boots, plate torso, crested helm, shield & lance
    box(g, -7, -6, 5, 6, '#5c6684', 1.5, 2); box(g, 2, -6, 5, 6, '#5c6684', 1.5, 2);
    box(g, -9, -20 + bob, 18, 14, '#8d9cc2', 2, 4);
    g.fillStyle = '#cfd8ec'; g.fillRect(-6, -18 + bob, 5, 9);
    // lance tip behind shield
    g.strokeStyle = '#dfe6f5'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(6, -14 + bob); g.lineTo(18, -28 + bob); g.stroke();
    // helmet + crimson plume
    poly(g, [-3, -34 + bob, -10, -40 + bob, -1, -39 + bob, 4, -34 + bob], '#e8324a', 1.4);
    box(g, -9, -33 + bob, 18, 14, '#cfd8ec', 2, 5);
    g.fillStyle = OL; g.fillRect(-1, -27 + bob, 10, 3.2);
    g.fillStyle = '#7cf0ff'; g.fillRect(2, -26.4 + bob, 5, 1.8);
    // kite shield
    poly(g, [5, -21 + bob, 16, -21 + bob, 15, -9 + bob, 10.5, -4 + bob, 6, -9 + bob], '#2962d8', 2);
    g.fillStyle = '#ffd23f'; g.fillRect(9.5, -19 + bob, 2, 11); g.fillRect(7, -15 + bob, 7, 2);
  }
  g.restore();
}

function drawWolf(g, x, y, k, face, t, ph, p, flash) {
  g.save();
  g.translate(x, y);
  g.scale(face * k, k);
  const run = t * 13 + ph, bob = -Math.abs(Math.sin(run)) * 2.4;
  shadow(g, 0, 1, 18, 4);
  for (let i = 0; i < 4; i++) {
    const lx = [-11, -5, 7, 12][i], sw = Math.sin(run + i * 1.6) * 5;
    limb2(g, lx, -10 + bob, lx + sw * 0.4, -5.5, lx + sw, -1.5, 3.6, i % 2 ? p.body : p.dark);
    blob(g, lx + sw, -1, 2.8, 1.8, p.dark, 1.2);
  }
  // bushy curved tail
  poly(g, [-14, -15 + bob, -28, -26 + Math.sin(run) * 3 + bob, -24, -15 + bob, -16, -11 + bob], p.dark, 2);
  poly(g, [-17, -15 + bob, -26, -24 + Math.sin(run) * 3 + bob, -22, -16 + bob], p.belly, 0);
  // arched torso + shaded belly + back fur ridge
  poly(g, [-16, -12 + bob, -12, -22 + bob, 4, -24 + bob, 15, -18 + bob, 12, -8 + bob, -12, -8 + bob], p.body, 2.2);
  blob(g, 0, -10 + bob, 11, 4.2, p.belly, 0);
  poly(g, [-9, -22 + bob, -5, -28 + bob, -1, -23 + bob, 4, -29 + bob, 7, -22 + bob], p.dark, 1.6);
  // neck ruff + sculpted wolf head & ears
  poly(g, [8, -25 + bob, 10, -37 + bob, 17, -26 + bob], p.dark, 1.8);
  poly(g, [14, -25 + bob, 17, -34 + bob, 21, -24 + bob], p.body, 1.6);
  poly(g, [8, -22 + bob, 15, -27 + bob, 23, -24 + bob, 32, -18 + bob, 22, -12 + bob, 10, -13 + bob], p.body, 2.2);
  blob(g, 31, -18.5 + bob, 2.3, 1.9, OL, 0);
  // open jaw & fangs
  poly(g, [20, -14 + bob, 29, -15 + bob, 24, -10 + bob, 17, -11 + bob], '#6a1828', 1.4);
  poly(g, [22, -14.5 + bob, 23.8, -10.5 + bob, 25.5, -14.5 + bob], '#fff', 1);
  // fierce eye + glint
  poly(g, [15, -23.5 + bob, 22, -23 + bob, 20, -19 + bob], p.eye, 1.4);
  g.fillStyle = '#c4162e'; g.fillRect(19, -22.2 + bob, 2, 2.3);
  if (flash > 0) {
    g.save(); g.globalAlpha = 0.72;
    blob(g, 3, -15 + bob, 16, 9, '#fff', 0); blob(g, 19, -19 + bob, 9, 7.5, '#fff', 0);
    g.restore();
  }
  g.restore();
}

function drawMechWolf(g, x, y, k, face, t, ph, p, flash) {
  g.save();
  g.translate(x, y);
  g.scale(face * k, k);
  const run = t * 13 + ph, bob = -Math.abs(Math.sin(run)) * 1.8;
  shadow(g, 0, 1, 18, 4);
  for (let i = 0; i < 4; i++) {
    const lx = [-10, -4, 7, 13][i], sw = Math.sin(run + i * 1.6) * 4.5;
    limb2(g, lx, -10 + bob, lx + sw * 0.4 + 2, -5.5, lx + sw * 1.2, -1, 3.4, i % 2 ? p.plate : p.dark);
    box(g, lx + sw * 1.2 - 3, -3, 6, 3, p.plate, 1.2, 1);
  }
  // twin plasma thruster + flame
  const fl = 10 + Math.sin(t * 34 + ph) * 3.5;
  poly(g, [-16, -24 + bob, -16 - fl, -20.5 + bob, -16, -17 + bob], p.flame, 1.4);
  poly(g, [-16, -22.2 + bob, -16 - fl * 0.55, -20.5 + bob, -16, -18.8 + bob], '#fff8b8', 0);
  box(g, -18, -27 + bob, 11, 11, '#24295c', 1.8, 2.5);
  box(g, -14, -30 + bob, 3.5, 4, p.accent, 1.2, 1);
  // armored cyber torso
  poly(g, [-15, -13 + bob, -13, -24 + bob, 10, -24 + bob, 14, -15 + bob, 11, -8 + bob, -12, -8 + bob], p.body, 2.2);
  poly(g, [-12, -23 + bob, 9, -23 + bob, 12, -19 + bob, -13, -19 + bob], p.plate, 0);
  g.fillStyle = p.glow; g.fillRect(-10, -16 + bob, 18, 2.2);
  // cyber head + glowing optic visor
  poly(g, [9, -27 + bob, 11, -38 + bob, 17, -27 + bob], p.plate, 1.8);
  poly(g, [10, -27 + bob, 23, -26 + bob, 32, -19 + bob, 30, -13 + bob, 19, -12 + bob, 10, -15 + bob], p.body, 2.2);
  poly(g, [21, -14 + bob, 23, -10 + bob, 25, -14 + bob], '#e8ecff', 1.1);
  poly(g, [26, -14 + bob, 28, -10.5 + bob, 29.8, -14.5 + bob], '#e8ecff', 1.1);
  glow(g, 19.5, -21 + bob, 4, p.glow, 0.55);
  poly(g, [14, -23.5 + bob, 24, -22.5 + bob, 22, -18.5 + bob, 15, -19.5 + bob], p.glow, 1.2);
  if (flash > 0) {
    g.save(); g.globalAlpha = 0.72;
    box(g, -15, -24 + bob, 30, 16, '#fff', 0, 6);
    g.restore();
  }
  g.restore();
}

function hpBar(g, x, y, w, h, ratio) {
  ratio = clamp(ratio, 0, 1);
  rr(g, x - w / 2 - 1.5, y - 1.5, w + 3, h + 3, 3);
  g.fillStyle = OL; g.fill();
  rr(g, x - w / 2, y, w, h, 2);
  g.fillStyle = '#31234f'; g.fill();
  if (ratio > 0) {
    rr(g, x - w / 2, y, Math.max(2, w * ratio), h, 2);
    g.fillStyle = ratio > 0.5 ? '#5ce05c' : ratio > 0.25 ? '#ffd23f' : '#ff4d4d';
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.fillRect(x - w / 2 + 1, y, Math.max(1, w * ratio - 2), Math.max(1, h * 0.35));
  }
}

// boss: ancient forest giant. Local origin = feet centre, faces -x (toward the hero).
function drawGiant(g, p, t, o) {
  const idle = Math.sin(t * 2) * 1.6;
  shadow(g, -4, 2, 62, 8);
  // back gnarled arm
  limb2(g, 34, -96 + idle, 50, -76 + idle, 55, -56, 15, p.barkDark);
  // flared trunk-root legs
  poly(g, [-35, 0, -30, -38, -10, -38, -12, 0], p.bark, 2.5);
  poly(g, [10, 0, 10, -38, 30, -38, 35, 0], p.bark, 2.5);
  blob(g, -24, 0, 19, 5.5, p.barkDark, 2); blob(g, 22, 0, 19, 5.5, p.barkDark, 2);

  // tapered ancient tree trunk torso (broad shoulders -> narrower waist)
  poly(g, [-48, -106 + idle, -34, -124 + idle, 34, -124 + idle, 48, -104 + idle, 37, -32, -37, -32], p.bark, 3);
  // bark grain & sunlit edge
  g.fillStyle = p.barkDark;
  for (let i = 0; i < 5; i++) g.fillRect(-30 + i * 14, -108 + idle, 3, 66 - (i % 2) * 10);
  g.globalAlpha = 0.45; g.fillStyle = p.barkLight;
  poly(g, [-45, -104 + idle, -34, -120 + idle, -26, -120 + idle, -35, -36], p.barkLight, 0);
  g.globalAlpha = 1;

  // chest glowing forest rune core
  const coreCol = o.rage ? '#ff5a3a' : o.phase === 1 ? '#ffb02a' : '#8cff5a';
  glow(g, -4, -48 + idle, 12 + Math.sin(t * 5) * 1.5, coreCol, 0.42);
  poly(g, [-4, -57 + idle, 4, -48 + idle, -4, -39 + idle, -12, -48 + idle], coreCol, 1.8);
  poly(g, [-4, -53 + idle, 0, -48 + idle, -4, -43 + idle, -8, -48 + idle], '#ffffff', 0);

  if (o.flash > 0) {
    g.save(); g.globalAlpha = 0.65;
    poly(g, [-48, -106 + idle, -34, -124 + idle, 34, -124 + idle, 48, -104 + idle, 37, -32, -37, -32], '#fff', 0);
    g.restore();
  }

  // mossy shoulder pads
  blob(g, -33, -114 + idle, 16, 7, p.moss, 1.8); blob(g, 31, -114 + idle, 15, 7, p.moss, 1.8);
  // carved face: fierce glowing eyes + craggy brow + jagged bark jaw
  const ec = o.rage ? '#ff5a3a' : o.phase === 1 ? '#ffb02a' : p.eye;
  glow(g, -18, -88 + idle, 9, ec, 0.35); glow(g, 12, -88 + idle, 9, ec, 0.35);
  poly(g, [-29, -93 + idle, -9, -86 + idle, -14, -79 + idle, -27, -82 + idle], ec, 2);
  poly(g, [25, -93 + idle, 5, -86 + idle, 10, -79 + idle, 23, -82 + idle], ec, 2);
  g.fillStyle = OL; g.fillRect(-18, -87 + idle, 4, 5); g.fillRect(10, -87 + idle, 4, 5);
  limb(g, -34, -102 + idle, -8, -93 + idle, 5.5, p.barkDark);
  limb(g, 28, -102 + idle, 2, -93 + idle, 5.5, p.barkDark);
  poly(g, [-25, -67 + idle, -12, -62 + idle, 0, -69 + idle, 12, -62 + idle, 25, -67 + idle, 18, -51 + idle, 0, -47 + idle, -18, -51 + idle], '#2a1208', 2.4);
  poly(g, [-15, -63 + idle, -11, -55 + idle, -7, -63 + idle], '#f1e6c8', 1.2);
  poly(g, [5, -63 + idle, 9, -55 + idle, 13, -63 + idle], '#f1e6c8', 1.2);

  // lush crown of leaves + branch horns
  poly(g, [-26, -122 + idle, -42, -146 + idle, -30, -140 + idle, -18, -124 + idle], p.barkDark, 2);
  poly(g, [22, -122 + idle, 38, -144 + idle, 27, -138 + idle, 16, -124 + idle], p.barkDark, 2);
  const lc = [[-34, -124, 15], [-16, -135, 17], [6, -139, 17], [28, -130, 15], [40, -116, 12]];
  for (const c of lc) blob(g, c[0], c[1] + idle, c[2], c[2] * 0.85, p.leaf, 2.4);
  for (const c of lc) blob(g, c[0] - 4, c[1] - 4 + idle, c[2] * 0.45, c[2] * 0.35, p.leafLight, 0);
  blob(g, -12, -138 + idle, 3.2, 3.2, '#ffe14d', 1.2);
  blob(g, 20, -133 + idle, 3, 3, '#ff85a8', 1.2);

  // front heavy fist + claws toward hero
  const sw = Math.sin(t * 2.4) * 5 + (o.rage ? Math.sin(t * 14) * 4 : 0);
  limb2(g, -40, -98 + idle, -58, -80 + idle + sw * 0.4, -72, -62 + sw, 17, p.bark);
  blob(g, -74, -60 + sw, 12, 11, p.bark, 2.5);
  blob(g, -71, -64 + sw, 5.5, 4.5, p.moss, 1.2);
  limb(g, -80, -67 + sw, -90, -75 + sw, 3.6, p.barkDark);
  limb(g, -82, -59 + sw, -92, -59 + sw, 3.6, p.barkDark);
  limb(g, -80, -52 + sw, -89, -46 + sw, 3.6, p.barkDark);
}

// boss: mecha wolf titan. Drawn facing +x, caller mirrors it.
function drawMechBoss(g, p, t, o) {
  const idle = Math.sin(t * 2.2) * 1.4, w = Math.sin(t * 2.2) * 3;
  shadow(g, 4, 2, 64, 8);
  for (let i = 0; i < 4; i++) {
    const lx = [-35, -18, 16, 33][i], sw = (i % 2 ? w : -w);
    limb2(g, lx, -44 + idle, lx + sw * 0.4 + 6, -22, lx + sw, -2, 11.5, i % 2 ? p.plate : p.dark);
    box(g, lx + sw - 9, -6, 18, 6, p.dark, 2, 2.5);
  }
  // articulated cyber tail
  limb2(g, -50, -64 + idle, -67, -75 + idle, -78 + Math.sin(t * 3) * 3, -95 + idle, 6.5, p.plate);
  glow(g, -78 + Math.sin(t * 3) * 3, -97 + idle, 7, p.accent, 0.35);
  blob(g, -78 + Math.sin(t * 3) * 3, -97 + idle, 6.5, 6.5, p.accent, 2.2);
  // dorsal rocket pod + animated plasma plume
  const fl = 16 + Math.sin(t * 30) * 4.5;
  poly(g, [-56, -86 + idle, -56 - fl, -80 + idle, -56, -73 + idle], p.flame, 1.8);
  poly(g, [-56, -83 + idle, -56 - fl * 0.55, -80 + idle, -56, -76 + idle], '#fff5b0', 0);
  box(g, -61, -93 + idle, 23, 23, '#252960', 2.4, 4);
  box(g, -55, -99 + idle, 8, 7, p.accent, 1.6, 2);

  // beveled cyber hull torso
  poly(g, [-54, -64 + idle, -46, -88 + idle, 42, -88 + idle, 49, -60 + idle, 40, -34 + idle, -46, -34 + idle], p.body, 3);
  poly(g, [-45, -86 + idle, 40, -86 + idle, 44, -76 + idle, -48, -76 + idle], p.plate, 0);
  g.fillStyle = p.accent; g.fillRect(-44, -49 + idle, 84, 3.5);
  // glowing chest arc-reactor core
  const rc = o.rage ? '#ff3a3a' : o.phase === 1 ? '#ffb02a' : p.glow2;
  glow(g, 8, -62 + idle, 13, rc, 0.48);
  blob(g, 8, -62 + idle, 9.5, 9.5, p.dark, 2);
  blob(g, 8, -62 + idle, 6, 6, rc, 1.2);
  blob(g, 8, -62 + idle, 2.8, 2.8, '#ffffff', 0);
  // cooling vents
  g.fillStyle = p.dark;
  for (let i = 0; i < 3; i++) g.fillRect(-34 + i * 11, -72 + idle, 5, 17);
  if (o.flash > 0) {
    g.save(); g.globalAlpha = 0.65;
    poly(g, [-54, -64 + idle, -46, -88 + idle, 42, -88 + idle, 49, -60 + idle, 40, -34 + idle, -46, -34 + idle], '#fff', 0);
    g.restore();
  }
  // shoulder plasma cannon
  box(g, -8, -106 + idle, 38, 12, p.dark, 2.4, 3);
  box(g, 26, -108 + idle, 10, 16, p.plate, 2, 3);
  glow(g, 38, -100 + idle, 6 + Math.sin(t * 8) * 1.8, p.glow2, 0.52);

  // angular mecha wolf head + hinged jaw
  poly(g, [38, -94 + idle, 41, -114 + idle, 57, -94 + idle], p.plate, 2.2);
  poly(g, [37, -92 + idle, 72, -79 + idle, 82, -64 + idle, 60, -54 + idle, 37, -58 + idle], p.body, 3);
  poly(g, [45, -56 + idle, 82, -56 + idle, 71, -39 + idle, 43, -46 + idle], p.dark, 2.6);
  for (let i = 0; i < 3; i++) poly(g, [52 + i * 9, -56 + idle, 55 + i * 9, -48 + idle, 58 + i * 9, -56 + idle], '#e8ecff', 1.4);
  const ec = o.rage ? '#ff3a3a' : o.phase === 1 ? '#ffb02a' : p.glow;
  glow(g, 58, -76 + idle, 8, ec, 0.45);
  poly(g, [50, -82 + idle, 69, -77 + idle, 54, -70 + idle], ec, 2);
  g.fillStyle = p.accent; g.fillRect(40, -80 + idle, 6, 3);
}

// ---------------------------------------------------------------- hud pieces
function pill(g, x, y, w, h, fill = 'rgba(20,10,60,.68)', border = 'rgba(255,255,255,.18)') {
  rr(g, x, y, w, h, h / 2);
  g.fillStyle = fill; g.fill();
  g.strokeStyle = border; g.lineWidth = 1.2; g.stroke();
}

function drawTopHud(g, L, s, b, fx, t) {
  const { W, ui } = L;
  const ph = 19 * ui, y0 = 5;
  const lab = `${b.icon} STAGE ${s.stage}`;
  const lw = measure(g, lab, 11 * ui) + 18;
  pill(g, 8, y0, lw, ph);
  text(g, lab, 8 + lw / 2, y0 + ph / 2 + 0.5, 11 * ui, '#fff', 'center', null);
  if (s.phase === 'wave' && s.wave) {
    const wl = `⚔ ${s.wave.killed}/${s.wave.target}`;
    const ww = measure(g, wl, 11 * ui) + 18;
    pill(g, W - 8 - ww, y0, ww, ph);
    text(g, wl, W - 8 - ww / 2, y0 + ph / 2 + 0.5, 11 * ui, '#ffd23f', 'center', null);
  }
  if (s.phase === 'boss' && s.boss) {
    const bd = b.boss, bar = 15 * ui, by = y0 + ph + 5, bx = 10, bw = W - 20;
    rr(g, bx - 2.5, by - 2.5, bw + 5, bar + 5, 5);
    g.fillStyle = OL; g.fill();
    rr(g, bx, by, bw, bar, 3.5);
    g.fillStyle = '#33173a'; g.fill();
    const r = clamp(s.boss.hp / s.boss.maxHp, 0, 1);
    const pi = clamp(s.boss.phaseIdx | 0, 0, 2);
    const barCols = [['#ff5978', '#c81c44'], ['#ff9b3d', '#d6530a'], ['#d455ff', '#871cc8']][pi];
    if (r > 0) {
      rr(g, bx, by, Math.max(4, bw * r), bar, 3.5);
      g.fillStyle = gradY(g, bx, by, by + bar, [[0, barCols[0]], [1, barCols[1]]]);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.32)';
      rr(g, bx + 1, by + 1, Math.max(2, bw * r - 2), bar * 0.34, 2);
      g.fill();
    }
    g.fillStyle = OL; // phase notches at 2/3 and 1/3 of the boss HP
    for (const th of BOSS_PHASE_AT) g.fillRect(Math.round(bx + bw * th) - 1.5, by - 2, 3, bar + 4);
    g.fillStyle = '#fff';
    for (const th of BOSS_PHASE_AT) g.fillRect(Math.round(bx + bw * th) - 0.5, by, 1, bar);
    text(g, bd.name, bx + 6, by + bar / 2 + 0.5, 10 * ui, '#fff', 'left');
    text(g, `P${pi + 1}`, bx + 12 + measure(g, bd.name, 10 * ui), by + bar / 2 + 0.5, 9 * ui, ['#ffe27a', '#ffd08a', '#e8b0ff'][pi], 'left');
    text(g, fmtNum(s.boss.hp), bx + bw - 6, by + bar / 2 + 0.5, 10 * ui, '#fff', 'right');
    const th = 7 * ui, ty = by + bar + 5, tw = bw - 38;
    const tr = clamp(s.boss.timeLeft / BOSS_TIME, 0, 1);
    rr(g, bx - 2, ty - 2, tw + 4, th + 4, 4);
    g.fillStyle = OL; g.fill();
    rr(g, bx, ty, tw, th, 2.5);
    g.fillStyle = '#262448'; g.fill();
    const low = s.boss.timeLeft < 8;
    if (tr > 0) {
      rr(g, bx, ty, Math.max(3, tw * tr), th, 2.5);
      g.fillStyle = low ? (Math.floor(t * 6) % 2 ? '#ff4d4d' : '#ffd0d0') : tr > 0.5 ? '#5ce05c' : '#ffd23f';
      g.fill();
    }
    text(g, `${Math.ceil(s.boss.timeLeft)}s`, bx + bw, ty + th / 2, 11 * ui, low ? '#ff9a9a' : '#fff', 'right');
    drawBossStatus(g, L, s, ty + th + 6, t);
  }
}

// small pill under the timer: what the boss is doing right now (shield / telegraph / damage window + its countdown)
function drawBossStatus(g, L, s, y, t) {
  const { ui } = L, b = s.boss, c = b.cycle;
  if (!c || s.over) return;
  const h = 17 * ui;
  let label, fill, col = '#fff', frac = -1;
  if (!b.shielded) { label = '💥 지금 공격!'; fill = 'rgba(170,30,60,.92)'; col = '#fff3a0'; frac = clamp(c.windowLeft / Math.max(0.01, c.windowTotal), 0, 1); }
  else if (c.state === 'telegraph') { label = '⚠ 공격 준비!'; fill = Math.floor(t * 8) % 2 ? 'rgba(165,92,0,.92)' : 'rgba(110,60,0,.92)'; col = '#ffe27a'; }
  else { label = '🛡 날아오는 걸 탭!'; fill = 'rgba(20,75,130,.9)'; col = '#bff3ff'; }
  const w = measure(g, label, 11 * ui) + 18;
  pill(g, 8, y, w, h, fill, 'rgba(255,255,255,.26)');
  text(g, label, 8 + w / 2, y + h / 2 + 0.5, 11 * ui, col, 'center', null);
  if (frac >= 0) {
    rr(g, 8, y + h + 2, w, 5 * ui + 2, 3); g.fillStyle = OL; g.fill();
    if (frac > 0) { rr(g, 9, y + h + 3, Math.max(2, (w - 2) * frac), 5 * ui, 2); g.fillStyle = '#ffd23f'; g.fill(); }
  }
}

function drawBanner(g, L, bn) {
  const { W, H, ui } = L;
  const p = bn.t / bn.dur, tin = Math.min(1, bn.t / 0.22), tout = clamp((bn.dur - bn.t) / 0.25, 0, 1);
  const h = (bn.big ? 48 : bn.sub ? 40 : 32) * ui, y = H * 0.3 - h / 2;
  const ox = (1 - ease(tin)) * -W;
  g.save();
  g.globalAlpha = tout;
  g.translate(ox, 0);
  g.fillStyle = OL; g.fillRect(-4, y - 3, W + 8, h + 6);
  g.fillStyle = gradY(g, 0, y, y + h, [[0, bn.color], [1, '#1b1340']]); g.fillRect(-4, y, W + 8, h);
  g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(-4, y, W + 8, h * 0.28);
  g.fillStyle = 'rgba(255,210,63,.55)'; g.fillRect(-4, y, W + 8, 2); g.fillRect(-4, y + h - 2, W + 8, 2);
  if (bn.big) { g.fillStyle = 'rgba(255,230,80,.35)'; for (let i = -1; i < 12; i++) g.fillRect(i * 34 + (p * 40) % 34, y + h - 6, 17, 4); }
  const pop = 1 + 0.12 * Math.max(0, 1 - bn.t * 6);
  text(g, bn.text, W / 2, y + (bn.sub ? h * 0.38 : h / 2), (bn.big ? 24 : 18) * ui * pop, '#fff');
  if (bn.sub) text(g, bn.sub, W / 2, y + h * 0.78, 11 * ui, '#ffe27a');
  g.restore();
}

function drawHints(g, L, view, t) {
  const { W, H, ui } = L;
  const a = view.hints === 'boss' ? 0.9 : 0.45 + 0.3 * Math.sin(t * 5);
  g.globalAlpha = a;
  if (view.hints === 'wave') {
    g.fillStyle = 'rgba(255,255,255,.35)';
    for (let y = H * 0.18; y < L.groundTop - 6; y += 14) g.fillRect(W / 2 - 1, y, 2, 7);
    text(g, '◀ TAP', W * 0.22, H * 0.42, 16 * ui, '#fff');
    text(g, 'TAP ▶', W * 0.78, H * 0.42, 16 * ui, '#fff');
  } else if (view.hints === 'boss') {
    text(g, view.s.boss && view.s.boss.shielded ? '👆 투사체를 탭해서 없애요!' : '👆 지금 연타!', W * 0.4, H * 0.2 + 56 * ui, 13 * ui, '#fff');
  }
  g.globalAlpha = 1;
}

function drawNoEnergyHint(g, L, hint, t) {
  const { W, H, ui } = L;
  const q = hint.t / hint.life, a = q < 0.7 ? 1 : (1 - q) / 0.3;
  const pop = 1 + 0.25 * Math.max(0, 1 - hint.t * 8);
  g.globalAlpha = a;
  const y = H * 0.36 - ease(Math.min(1, q * 1.5)) * 8 * ui;
  const w = measure(g, '⚡ 문제를 풀어요!', 15 * ui) + 22;
  pill(g, W / 2 - w / 2, y - 13 * ui, w, 26 * ui, 'rgba(120,20,40,.82)');
  text(g, '⚡ 문제를 풀어요!', W / 2, y + 0.5, 15 * ui * pop, '#ffe27a');
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------- main
export function drawTitans(g, W, H, view, fx, t) {
  const s = view.s;
  const L = layoutOf(W, H);
  const b = biomeAt(s.biome);
  const { cu, bu, feetY } = L;
  const boss = s.boss, pe = b.enemy, pb = b.boss;
  g.save();
  g.beginPath(); g.rect(0, 0, W, H); g.clip();
  g.lineJoin = 'round';
  if (fx.shake > 0) g.translate((Math.sin(t * 90) * 3) * Math.min(1, fx.shake * 3), (Math.cos(t * 77) * 2.5) * Math.min(1, fx.shake * 3));
  drawBackground(g, L, b, fx.scroll, t);

  // boss
  if (boss && s.phase === 'boss') {
    const bx = boss.x * W;
    let by = feetY;
    if (fx.land > 0) { const q = fx.land / 0.55; by -= q * q * (feetY + 170); }
    g.save();
    g.translate(bx, by);
    const pi = clamp(boss.phaseIdx | 0, 0, 2), cyc = boss.cycle;
    const rage = boss.timeLeft < 8 || pi === 2;
    const tele = cyc && cyc.state === 'telegraph' ? clamp(cyc.t / Math.max(0.01, cyc.dur), 0, 1) : 0;
    g.restore(); g.save(); // aura is drawn in world space, behind the body
    if (fx.land <= 0) drawAura(g, L, b, pi, tele, t);
    g.translate(bx, by);
    if (rage) g.translate(Math.sin(t * 40) * 1.2, 0);
    const bo = { flash: fx.bossFlash > 0 ? 1 : 0, rage, phase: pi };
    if (pb.kind === 'mech') { g.translate(-16 * bu, 0); g.scale(-bu, bu); drawMechBoss(g, pb, t, bo); } else { g.scale(bu, bu); drawGiant(g, pb, t, bo); }
    g.restore();
    if (fx.land <= 0) drawBossFx(g, L, s, b, fx, t, tele);
  }

  // allies, enemies, hero
  const hx = s.hero.x * W, face = s.hero.facing === 'left' ? -1 : 1;
  if (s.allyLv >= 10) drawAlly(g, 'knight', hx, feetY - 30 * cu, cu * 0.7, face, t, 2);
  if (s.allyLv >= 1) drawAlly(g, 'archer', hx - 27 * cu, feetY - 10 * cu, cu * 0.74, face, t, 0);
  if (s.allyLv >= 5) drawAlly(g, 'mage', hx + 27 * cu, feetY - 10 * cu, cu * 0.74, face, t, 1);
  const ek = cu * 0.8, fn = pe.kind === 'mechwolf' ? drawMechWolf : drawWolf;
  for (const e of s.enemies) {
    const ex = e.x * W;
    fn(g, ex, feetY, ek, e.side === 'left' ? 1 : -1, t, e.id * 1.7, pe, fx.flash[e.id] > 0 ? 1 : 0);
    hpBar(g, ex, feetY - 44 * ek, 28 * ek, Math.max(3, 4.5 * ek), e.hp / e.maxHp);
  }
  const od = s.buffs && s.buffs.overdrive > 0;
  drawHero(g, hx, feetY, cu, {
    face, t, swordLv: s.swordLv, swing: s.hero.swing > 0 ? 1 - s.hero.swing / SWING_TIME : -1,
    flash: fx.heroFlash, blink: s.hero.invincible > 0 && Math.floor(t * 20) % 2 === 0, aura: od || fx.lvl > 0,
    ko: s.over ? fx.koT : 0,
  });

  drawProjectiles(g, L, s, b, fx, t, hx);
  drawEffects(g, L, s, fx, t, hx);
  if (od || fx.over > 0) drawLightning(g, L, s, fx, t, hx);
  g.restore();

  // overlays (not shaken)
  if (fx.phaseFlash > 0) { g.globalAlpha = Math.min(0.4, fx.phaseFlash * 0.7); g.fillStyle = '#ff5a2a'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
  if (fx.fade > 0) { g.globalAlpha = Math.min(1, fx.fade); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
  if (fx.vig > 0) {
    g.globalAlpha = Math.min(0.5, fx.vig); g.fillStyle = fx.vigColor || '#ff2a4a';
    g.fillRect(0, 0, W, 12); g.fillRect(0, H - 12, W, 12); g.fillRect(0, 0, 12, H); g.fillRect(W - 12, 0, 12, H);
    g.globalAlpha = 1;
  }
  if (view.hints && !s.over) drawHints(g, L, view, t);
  if (fx.hint && !s.over) drawNoEnergyHint(g, L, fx.hint, t);
  drawTopHud(g, L, s, b, fx, t);
  if (fx.banner) drawBanner(g, L, fx.banner);
}

// ---------------------------------------------------------------- boss fight: aura, shield, telegraph, projectiles
const bossCenter = (L) => ({ cx: BOSS_X * L.W - 18 * L.bu, cy: L.feetY - 76 * L.bu, rx: 80 * L.bu, ry: 80 * L.bu });
const muzzleOf = (L, b) => ({ x: PROJ_SPAWN_R * L.W, y: L.feetY - (b.boss.kind === 'mech' ? 98 : 60) * L.bu });
const heroLaneY = (L) => L.feetY - 22 * L.cu;

function ellipse(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); }

function drawAura(g, L, b, pi, tele, t) {
  if (pi === 0 && tele <= 0) return;
  const { cx, cy, rx } = bossCenter(L), col = b.aura[pi];
  const pulse = 0.5 + 0.5 * Math.sin(t * (pi === 2 ? 9 : 5));
  const a = clamp((pi === 0 ? 0 : 0.22 + 0.1 * pi + 0.08 * pulse) + tele * 0.35, 0, 0.85);
  g.save();
  g.globalAlpha = a;
  safeRadialGlow(g, cx, cy, rx * (1.35 + 0.12 * pulse), col, 'rgba(0,0,0,0)');
  g.restore();
}

function warnMark(g, x, y, k, t) {
  if (Math.floor(t * 8) % 2) return;
  poly(g, [x, y - 11 * k, x + 11 * k, y + 8 * k, x - 11 * k, y + 8 * k], '#ffd23f', 2);
  text(g, '!', x, y + 1 * k, 11 * k, OL, 'center', null);
}

// shield bubble / break / re-form, muzzle charge and the side warnings of the coming volley
function drawBossFx(g, L, s, b, fx, t, tele) {
  const boss = s.boss, c = boss.cycle, pi = clamp(boss.phaseIdx | 0, 0, 2);
  const { cx, cy, rx, ry } = bossCenter(L);
  const col = b.shield;
  if (boss.shielded) {
    g.save();
    g.globalAlpha = 0.13 + 0.05 * Math.sin(t * 3); g.fillStyle = col;
    ellipse(g, cx, cy, rx, ry); g.fill();
    g.globalAlpha = 0.85; g.strokeStyle = col; g.lineWidth = 3;
    if (g.setLineDash) { g.setLineDash([12, 7]); g.lineDashOffset = -t * 26; }
    ellipse(g, cx, cy, rx, ry); g.stroke();
    if (g.setLineDash) g.setLineDash([]);
    g.globalAlpha = 0.5; g.strokeStyle = '#fff'; g.lineWidth = 2; // glint
    g.beginPath(); g.arc(cx, cy, rx * 0.86, Math.PI * 1.15, Math.PI * 1.45); g.stroke();
    g.globalAlpha = 1;
    g.restore();
    if (fx.shieldForm > 0) {
      const q = 1 - fx.shieldForm / 0.4;
      g.globalAlpha = 1 - q; g.strokeStyle = '#fff'; g.lineWidth = 5 * (1 - q) + 1;
      ellipse(g, cx, cy, rx * (1.5 - 0.5 * ease(q)), ry * (1.5 - 0.5 * ease(q))); g.stroke();
      g.globalAlpha = 1;
    }
  } else if (fx.shieldBreak > 0) {
    const q = 1 - fx.shieldBreak / 0.45;
    g.globalAlpha = 1 - q; g.strokeStyle = col; g.lineWidth = 5 * (1 - q) + 1;
    ellipse(g, cx, cy, rx * (1 + 0.5 * ease(q)), ry * (1 + 0.5 * ease(q))); g.stroke();
    g.fillStyle = '#fff';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.2, r = 1 + 0.7 * ease(q);
      g.fillRect(cx + Math.cos(a) * rx * r - 3, cy + Math.sin(a) * ry * r - 3, 6 * (1 - q) + 2, 6 * (1 - q) + 2);
    }
    g.globalAlpha = 1;
  }
  if (tele > 0) {
    const m = muzzleOf(L, b), pr = c.preview || { right: true, left: false };
    const aura = b.aura[pi];
    if (pr.right !== false) {
      glow(g, m.x, m.y, (5 + 13 * tele) * L.bu, aura, 0.35 + 0.45 * tele);
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.globalAlpha = 0.8 * (1 - tele * 0.5);
      ellipse(g, m.x, m.y, (30 - 22 * tele) * L.bu, (30 - 22 * tele) * L.bu); g.stroke(); // charge ring shrinks onto the muzzle
      g.globalAlpha = 1;
      warnMark(g, m.x - 6, m.y - 26 * L.bu - 6, L.ui, t);
    }
    if (pr.left) warnMark(g, 18, heroLaneY(L) - 30 * L.cu, L.ui * 1.1, t);
  }
}

// y of a projectile on its lane: from the muzzle (right) / the left edge down to the hero's chest
function laneY(L, b, side, x, hx) {
  if (side === 'left') return heroLaneY(L) - 6 * L.cu;
  const m = muzzleOf(L, b), q = clamp((PROJ_SPAWN_R * L.W - x) / Math.max(1, PROJ_SPAWN_R * L.W - hx), 0, 1);
  return m.y + (heroLaneY(L) - m.y) * q;
}

function drawProjectileBody(g, kind, spec, r, dir, t, id) {
  const ang = dir < 0 ? Math.PI : 0;
  g.save();
  if (kind === 'leaf') {
    g.rotate(ang + Math.sin(t * 12 + id) * 0.18);
    poly(g, [r * 1.25, 0, r * 0.2, -r * 0.7, -r * 1.0, 0, r * 0.2, r * 0.7], spec.body, 2);
    g.strokeStyle = spec.vein; g.lineWidth = 1.5; g.beginPath(); g.moveTo(r * 1.0, 0); g.lineTo(-r * 0.9, 0); g.stroke();
    poly(g, [-r * 1.0, 0, -r * 1.5, -r * 0.35, -r * 1.5, r * 0.35], spec.dark, 1.4);
  } else if (kind === 'thorn') {
    g.rotate(t * 2.5 + id);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      poly(g, [Math.cos(a - 0.2) * r * 0.7, Math.sin(a - 0.2) * r * 0.7, Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3, Math.cos(a + 0.2) * r * 0.7, Math.sin(a + 0.2) * r * 0.7], spec.spike, 1.4);
    }
    blob(g, 0, 0, r * 0.82, r * 0.82, spec.body, 2.2);
    blob(g, -r * 0.2, -r * 0.2, r * 0.3, r * 0.3, spec.spike, 0);
  } else if (kind === 'orb') {
    glow(g, 0, 0, r * 1.05, spec.ring, 0.3);
    blob(g, 0, 0, r * 0.9, r * 0.9, spec.body, 2.2);
    g.strokeStyle = spec.ring; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r * 0.62, t * 6 + id, t * 6 + id + 4); g.stroke();
    blob(g, 0, 0, r * 0.32, r * 0.32, spec.core, 0);
  } else { // rocket
    g.rotate(ang);
    const fl = r * (0.9 + 0.35 * Math.sin(t * 34 + id));
    poly(g, [-r * 1.0, -r * 0.3, -r * 1.0 - fl, 0, -r * 1.0, r * 0.3], spec.flame, 1.4);
    poly(g, [-r * 0.7, -r * 0.55, -r * 1.25, -r * 1.0, -r * 1.25, 0], spec.dark, 1.4);
    poly(g, [-r * 0.7, r * 0.55, -r * 1.25, r * 1.0, -r * 1.25, 0], spec.dark, 1.4);
    box(g, -r * 1.0, -r * 0.55, r * 1.55, r * 1.1, spec.body, 2.2, 3);
    poly(g, [r * 0.55, -r * 0.55, r * 1.35, 0, r * 0.55, r * 0.55], spec.nose, 2);
    g.fillStyle = '#fff'; g.fillRect(-r * 0.4, -r * 0.2, r * 0.5, r * 0.22);
  }
  g.restore();
}

function drawProjectiles(g, L, s, b, fx, t, hx) {
  if (s.phase !== 'boss' || !s.projectiles) return;
  const { W, feetY, bu, ui } = L, pj = b.proj;
  const ps = Math.max(0.85, bu);
  for (const p of s.projectiles) {
    const x = p.x * W, y = laneY(L, b, p.side, x, hx), dir = p.side === 'right' ? -1 : 1, r = (p.big ? 23 : 16) * ps;
    // ground marker: danger lane towards the hero + shadow under the shot
    g.globalAlpha = 0.2; g.fillStyle = pj.trail;
    g.fillRect(Math.min(x, hx), feetY + 3, Math.abs(x - hx), 3 * ui);
    g.globalAlpha = 0.3; g.fillStyle = '#000';
    ellipse(g, x, feetY + 4, r * 0.9, r * 0.22); g.fill();
    // trail (3 fading dots behind)
    for (let i = 1; i <= 3; i++) {
      g.globalAlpha = 0.4 - i * 0.1; g.fillStyle = pj.trail;
      ellipse(g, x - dir * i * r * 0.8, y, r * (0.7 - i * 0.13), r * (0.7 - i * 0.13)); g.fill();
    }
    g.globalAlpha = 1;
    // echo rift where a left shot enters
    if (p.side === 'left' && p.age < 0.5) {
      const q = p.age / 0.5;
      g.globalAlpha = 1 - q; g.strokeStyle = pj.glow; g.lineWidth = 3;
      ellipse(g, PROJ_SPAWN_L * W + 6, y, (6 + 14 * q) * ps, (12 + 16 * q) * ps); g.stroke();
      g.globalAlpha = 1;
    }
    glow(g, x, y, r * 0.95, pj.glow, 0.3);
    g.save();
    g.translate(x, y);
    drawProjectileBody(g, p.big ? pj.big.kind : pj.small.kind, p.big ? pj.big : pj.small, r, dir, t, p.id);
    g.restore();
    // tap ring (pulses) so the target is obvious on a phone
    g.globalAlpha = 0.7 + 0.3 * Math.sin(t * 9 + p.id); g.strokeStyle = OL; g.lineWidth = 5;
    ellipse(g, x, y, r * 1.5, r * 1.5); g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 2.5;
    ellipse(g, x, y, r * 1.5, r * 1.5); g.stroke();
    g.globalAlpha = 1;
    if (p.big) { // HP pips
      for (let i = 0; i < BIG_HP; i++) { g.fillStyle = i < p.hp ? '#ffd23f' : '#3a2a5a'; g.fillRect(x - 8 + i * 9, y - r * 1.45 - 8, 7, 5); }
    }
  }
  // pops (removed / cracked / hit)
  for (const pop of fx.pops) {
    const q = pop.t / pop.life, x = pop.x * W, y = laneY(L, b, pop.side, x, hx), r = (pop.big ? 23 : 16) * ps;
    const hit = pop.by === 'hit';
    g.globalAlpha = 1 - q;
    g.strokeStyle = hit ? '#ff9d1f' : pj.glow; g.lineWidth = (hit ? 6 : 4) * (1 - q) + 1;
    ellipse(g, x, y, r * (0.7 + (hit ? 2 : 1.4) * ease(q)), r * (0.7 + (hit ? 2 : 1.4) * ease(q))); g.stroke();
    g.fillStyle = hit ? '#fff3a0' : '#fff';
    const n = pop.by === 'crack' ? 4 : 7;
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + pop.x * 9; g.fillRect(x + Math.cos(a) * r * (0.6 + 1.6 * ease(q)) - 2, y + Math.sin(a) * r * (0.6 + 1.6 * ease(q)) - 2, 4, 4); }
    g.globalAlpha = 1;
  }
}

function drawLightning(g, L, s, fx, t, hx) {
  const { W, feetY, groundTop } = L;
  const seed = Math.floor(t * 24);
  const strong = fx.over > 0;
  g.lineJoin = 'round';
  const n = strong ? 3 : 1;
  for (let i = 0; i < n; i++) {
    let tx = hx;
    if (s.enemies.length) tx = s.enemies[(seed + i) % s.enemies.length].x * W;
    else if (s.boss) tx = s.boss.x * W;
    const sx = strong ? tx + (i - 1) * 40 : hx + (seed % 2 ? 18 : -18);
    const x0 = strong ? sx : hx, y0 = strong ? 0 : feetY - 46 * L.cu;
    zig(g, x0, y0, tx, strong ? feetY - 10 : feetY - 30 * L.cu, 7, seed + i * 3, strong ? 26 : 14);
    g.globalAlpha = 0.6; g.strokeStyle = '#3a8bff'; g.lineWidth = strong ? 7 : 4; g.stroke();
    g.globalAlpha = 1; g.strokeStyle = '#fff'; g.lineWidth = strong ? 2.5 : 1.5; g.stroke();
  }
  if (strong) { g.globalAlpha = Math.min(0.35, fx.over * 0.5); g.fillStyle = '#bfe4ff'; g.fillRect(0, 0, W, groundTop); g.globalAlpha = 1; }
}

function allyAt(L, s, from) {
  const hx = s.hero.x * L.W;
  return from === 'mage' ? [hx + 27 * L.cu, L.feetY - 28 * L.cu] : [hx - 27 * L.cu, L.feetY - 20 * L.cu];
}

function drawEffects(g, L, s, fx, t) {
  const { W, ui, cu, bu, feetY } = L;
  // enemy poofs / boss landing dust
  for (const p of fx.puffs) {
    const q = p.t / p.life, px = p.x * W, n = p.big ? 8 : 6, R = (p.big ? 46 : 22) * cu * ease(q);
    g.globalAlpha = 1 - q; g.fillStyle = p.big ? '#e8dcc4' : '#fff';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, r = (p.big ? 7 : 5) * cu * (1 - q * 0.5);
      g.beginPath(); g.arc(px + Math.cos(a) * R, feetY - (p.big ? 6 : 16) * cu + Math.sin(a) * R * (p.big ? 0.25 : 0.7), r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }
  // boss clear burst
  if (fx.burst) {
    const q = fx.burst.t / fx.burst.life, bx = BOSS_X * W, by = feetY - 70 * bu;
    g.globalAlpha = 1 - q; g.strokeStyle = '#ffd23f'; g.lineWidth = 6 * (1 - q) + 1;
    g.beginPath(); g.arc(bx, by, 20 + 80 * ease(q), 0, TAU); g.stroke();
    g.fillStyle = '#fff6a8';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.3, r = 12 + 90 * ease(q);
      g.fillRect(bx + Math.cos(a) * r - 3, by + Math.sin(a) * r * 0.8 - 3, 6, 6);
    }
    g.globalAlpha = 1;
  }
  // ally bolts
  for (const b of fx.bolts) {
    const q = b.t / b.life, [ax, ay] = allyAt(L, s, b.from);
    const tx = b.x * W, ty = b.boss ? feetY - 70 * bu : feetY - 22 * cu;
    const px = ax + (tx - ax) * q, py = ay + (ty - ay) * q;
    if (b.from === 'mage') { glow(g, px, py, 4 * cu, '#7cf0ff', 0.7); g.fillStyle = '#fff'; g.fillRect(px - 1.5, py - 1.5, 3, 3); }
    else {
      const d = Math.atan2(ty - ay, tx - ax);
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(px - Math.cos(d) * 9, py - Math.sin(d) * 9); g.lineTo(px, py); g.stroke();
      g.strokeStyle = '#8a5a2b'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(px - Math.cos(d) * 9, py - Math.sin(d) * 9); g.lineTo(px - Math.cos(d) * 4, py - Math.sin(d) * 4); g.stroke();
    }
  }
  // slashes (tapered razor crescent + bright core + spark flares)
  for (const sl of fx.slashes) {
    const q = sl.t / sl.life, cx = sl.x * W + (sl.boss ? -34 * bu : 0), cy = (sl.boss ? feetY - 70 * bu : feetY - 22 * cu) + sl.jy * (sl.boss ? 1 : 0.3);
    const R = (sl.crit ? 38 : sl.weak ? 18 : 26) * (sl.boss ? bu : cu) * (0.72 + 0.48 * q);
    const w = (sl.crit ? 11 : sl.weak ? 3.5 : 7) * (1 - q) + 1.5;
    const a0 = sl.dir > 0 ? -1.95 + sl.rot : Math.PI + 0.15 - sl.rot;
    const a1 = sl.dir > 0 ? -0.15 + sl.rot : Math.PI + 1.95 - sl.rot;
    const mid = (a0 + a1) * 0.5;
    const ix = cx - Math.cos(mid) * w, iy = cy - Math.sin(mid) * w;
    g.save();
    g.globalAlpha = 1 - q * q;
    g.fillStyle = sl.crit ? '#ff7a1a' : sl.weak ? '#a39ac8' : '#7ac8ff';
    g.beginPath();
    g.arc(cx, cy, R, a0, a1);
    g.arc(ix, iy, R, a1, a0, true);
    g.closePath();
    g.fill();
    g.fillStyle = sl.crit ? '#fff6b0' : sl.weak ? '#e8e4f8' : '#ffffff';
    g.beginPath();
    g.arc(cx, cy, R - w * 0.25, a0 + 0.12, a1 - 0.12);
    g.arc(cx - Math.cos(mid) * w * 0.45, cy - Math.sin(mid) * w * 0.45, R - w * 0.25, a1 - 0.12, a0 + 0.12, true);
    g.closePath();
    g.fill();
    if (sl.crit) {
      g.fillStyle = '#fff3a0';
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + sl.rot * 3, dist = R * (0.55 + q * 0.85);
        g.fillRect(cx + Math.cos(a) * dist - 2, cy + Math.sin(a) * dist - 2, 4, 4);
      }
    }
    g.restore();
  }
  // gold pops (faceted shiny coin + glint)
  for (const gp of fx.golds) {
    const q = gp.t / gp.life, px = gp.x * W, py = (gp.boss ? feetY - 100 * bu : feetY - 34 * cu) - ease(q) * 30 * ui;
    g.globalAlpha = q < 0.7 ? 1 : (1 - q) / 0.3;
    const tw = measure(g, gp.text, 11 * ui);
    const x0 = clamp(px - tw / 2 - 6 * ui, 8, W - tw - 24 * ui);
    const cx = x0 + 5.5 * ui, cr = 5.5 * ui;
    blob(g, cx, py, cr, cr, '#ffd23f', 1.6);
    blob(g, cx - cr * 0.25, py - cr * 0.25, cr * 0.42, cr * 0.42, '#fff8c2', 0);
    g.fillStyle = '#d98c00'; g.fillRect(cx - 1 * ui, py - 2.3 * ui, 2 * ui, 4.6 * ui);
    text(g, gp.text, x0 + 13 * ui, py + 0.5, 11 * ui, '#ffe27a', 'left');
    g.globalAlpha = 1;
  }
  // damage numbers
  for (const n of fx.nums) {
    const q = n.t / n.life;
    const px = clamp(n.x * W + n.jx * 14 + (n.boss ? -30 * bu : 0), 38, W - 38);
    const base = n.boss ? feetY - 92 * bu : n.hero ? feetY - 56 * cu : feetY - 40 * cu;
    const py = base - ease(Math.min(1, q * 1.3)) * 30 * ui - n.jy;
    g.globalAlpha = q < 0.7 ? 1 : (1 - q) / 0.3;
    const pop = 1 + 0.55 * Math.max(0, 1 - q * 7);
    if (n.crit) {
      text(g, 'CRITICAL!', px, py - 15 * ui, 10 * ui, '#ff9a2e');
      text(g, n.text, px, py, 20 * ui * pop, '#ffd23f');
    } else if (n.kind === 'ally') text(g, n.text, px, py, 11 * ui * pop, '#9ff5d0');
    else if (n.kind === 'over') text(g, n.text, px, py, 17 * ui * pop, '#8fd0ff');
    else if (n.kind === 'miss') text(g, n.text, px, py, 11 * ui, '#d0c8ee');
    else if (n.kind === 'weak') text(g, n.text, px, py, 10 * ui, '#b8b0d8');
    else if (n.kind === 'energy') text(g, n.text, px, py - 4 * ui, 16 * ui * pop, '#ffd23f');
    else if (n.kind === 'lvl') text(g, n.text, px, py - 6 * ui, 15 * ui * pop, '#7cf0ff');
    else if (n.kind === 'win') text(g, n.text, px, py, 16 * ui * pop, '#ffe27a');
    else text(g, n.text, px, py, 14 * ui * pop, '#fff');
    g.globalAlpha = 1;
  }
}

