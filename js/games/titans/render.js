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
import { rr } from '../common/canvas-fx.js';
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
  g.fillStyle = fill; g.fill();
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
  g.globalAlpha = a; g.fillStyle = color;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.globalAlpha = a * 0.6;
  g.beginPath(); g.arc(x, y, r * 1.6, 0, TAU); g.fill();
  g.globalAlpha = 1;
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

function drawPine(g, x, base, h, c, dark, trunk) {
  const w = h * 0.5;
  g.fillStyle = trunk; g.fillRect(x - w * 0.07, base - h * 0.16, w * 0.14, h * 0.16);
  for (let i = 0; i < 3; i++) {
    const top = base - h + i * h * 0.27, bot = top + h * 0.4, hw = (w / 2) * (0.55 + 0.225 * i);
    g.fillStyle = c; g.beginPath(); g.moveTo(x, top); g.lineTo(x + hw, bot); g.lineTo(x - hw, bot); g.closePath(); g.fill();
    g.fillStyle = dark; g.beginPath(); g.moveTo(x, top); g.lineTo(x + hw, bot); g.lineTo(x, bot); g.closePath(); g.fill();
  }
}

function drawTower(g, it, sx, base, hpx, ly) {
  const x0 = Math.round(sx - it.w / 2), top = Math.round(base - hpx);
  g.fillStyle = ly.color; g.fillRect(x0, top, it.w, hpx + 4);
  g.fillStyle = ly.edge; g.fillRect(x0, top, 2, hpx + 4); g.fillRect(x0 + it.w - 2, top, 2, hpx + 4); g.fillRect(x0, top, it.w, 3);
  if (it.roof === 1) { g.fillStyle = ly.edge; g.fillRect(sx - 1, top - 12, 2, 12); g.fillStyle = '#ff4d4d'; g.fillRect(sx - 2, top - 14, 4, 3); }
  else if (it.roof === 2) { g.fillStyle = ly.color; g.fillRect(x0 + it.w * 0.25, top - 7, it.w * 0.5, 7); g.fillStyle = ly.edge; g.fillRect(x0 + it.w * 0.25, top - 7, it.w * 0.5, 2); }
  const cw = (it.w - 8) / it.cols, rh = (hpx - 14) / it.rows;
  for (let i = 0; i < it.wins.length; i++) {
    const w = it.wins[i];
    g.fillStyle = ly.lit[w[2]];
    g.fillRect(x0 + 4 + w[0] * cw + 1, top + 8 + w[1] * rh + 1, cw - 3, rh - 3.5);
  }
  if (it.sign) {
    g.globalAlpha = 0.3; g.fillStyle = it.sign; g.fillRect(x0 + it.w * 0.1, top + hpx * 0.1 - 3, it.w * 0.8, 13);
    g.globalAlpha = 1; g.fillRect(x0 + it.w * 0.15, top + hpx * 0.1, it.w * 0.7, 6);
  }
}

function drawLayer(g, L, ly, sc, t) {
  const { W, groundTop: gt } = L;
  const off = (sc * ly.speed) % PERIOD;
  const base = gt + 2;
  if (ly.kind === 'stars') {
    g.fillStyle = '#fff';
    for (const it of ly.items) {
      g.globalAlpha = 0.45 + 0.45 * Math.sin(t * 2 + it.p);
      g.fillRect(Math.round(it.x * W / PERIOD), Math.round(it.y * gt), 2, 2);
    }
    g.globalAlpha = 1;
    return;
  }
  for (const it of ly.items) {
    const sx = wrapX(it.x, off);
    if (sx > W + 60) continue;
    if (ly.kind === 'clouds') {
      const s = it.s * L.ui, y = it.y * gt;
      g.fillStyle = ly.shade; g.fillRect(sx - 22 * s, y + 4 * s, 44 * s, 5 * s);
      g.fillStyle = ly.color;
      g.beginPath();
      g.moveTo(sx - 5 * s, y); g.arc(sx - 14 * s, y, 9 * s, 0, TAU);
      g.moveTo(sx + 12 * s, y - 5 * s); g.arc(sx, y - 5 * s, 12 * s, 0, TAU);
      g.moveTo(sx + 23 * s, y); g.arc(sx + 14 * s, y, 9 * s, 0, TAU);
      g.fill();
      g.fillRect(sx - 22 * s, y, 44 * s, 5 * s);
    } else if (ly.kind === 'hills') {
      g.fillStyle = ly.color;
      g.beginPath(); g.ellipse(sx, base, it.w / 2, it.h * gt, 0, Math.PI, TAU); g.fill();
    } else if (ly.kind === 'pines') {
      drawPine(g, sx, base + 6, it.h * gt, ly.color, ly.dark, ly.trunk);
    } else if (ly.kind === 'towers') {
      drawTower(g, it, sx, base, it.h * gt, ly);
    } else if (ly.kind === 'lamps') {
      const ph = Math.min(78, gt * 0.4);
      g.fillStyle = ly.pole;
      g.fillRect(sx - 1.5, base + 8 - ph, 3, ph);
      g.fillRect(sx - 1.5, base + 8 - ph, 12, 3);
      g.fillStyle = ly.glow; g.fillRect(sx + 7, base + 11 - ph, 7, 4);
      glow(g, sx + 10, base + 14 - ph, 9, ly.glow, 0.22);
    }
  }
}

function drawSun(g, L, b) {
  const s = b.sun;
  if (!s) return;
  const r = s.r * L.ui, x = s.x * L.W, y = s.y * L.groundTop;
  g.globalAlpha = 0.28; g.fillStyle = s.halo;
  g.beginPath(); g.arc(x, y, r * 1.7, 0, TAU); g.fill();
  g.globalAlpha = 1; g.fillStyle = s.color;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

function drawGround(g, L, b, sc) {
  const gr = b.ground, { W, H, groundTop: y, gh, ui } = L;
  const off = (sc * 34) % 44;
  g.fillStyle = gr.dirt; g.fillRect(0, y, W, H - y);
  g.fillStyle = gr.edge; g.fillRect(0, y - 2, W, 2);
  if (gr.pattern === 'grass') {
    g.fillStyle = gr.top; g.fillRect(0, y, W, 8 * ui);
    g.fillStyle = gr.topLight; g.fillRect(0, y, W, 3 * ui);
    g.fillStyle = gr.dirtDark; g.fillRect(0, y + 8 * ui, W, 2);
    for (let x = -off; x < W + 44; x += 44) {
      g.fillStyle = gr.tuft; g.fillRect(x + 6, y - 3, 3, 3); g.fillRect(x + 9, y - 5, 3, 5);
      g.fillStyle = gr.dirtDark; g.fillRect(x, y + gh * 0.55, 18, 4); g.fillRect(x + 24, y + gh * 0.82, 12, 4);
      g.fillStyle = gr.dirtLight; g.fillRect(x + 8, y + gh * 0.68, 14, 3);
    }
  } else {
    g.fillStyle = gr.top; g.fillRect(0, y, W, gh * 0.22);
    g.fillStyle = gr.topLight; g.fillRect(0, y, W, 3 * ui);
    g.globalAlpha = 0.5; g.fillStyle = gr.neon; g.fillRect(0, y - 2, W, 2); g.globalAlpha = 1;
    g.fillStyle = gr.dirtLight; g.fillRect(0, y + gh * 0.22, W, 2);
    for (let x = -off; x < W + 44; x += 44) {
      g.fillStyle = gr.tuft; g.fillRect(x, y + gh * 0.62, 24, 4);
      g.fillStyle = gr.dirtDark; g.fillRect(x + 28, y + gh * 0.84, 10, 3);
    }
  }
}

function drawBackground(g, L, b, sc, t) {
  const n = b.sky.length, bh = L.groundTop / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = b.sky[i];
    g.fillRect(0, Math.floor(i * bh), L.W, Math.ceil(bh) + 1);
  }
  drawSun(g, L, b);
  for (const ly of b.layers) drawLayer(g, L, ly, sc, t);
  drawGround(g, L, b, sc);
}

// ---------------------------------------------------------------- characters (local origin = feet centre, +x = facing)
const SWORD_TIERS = [
  { lv: 1, blade: '#dfe6f5', hi: '#ffffff', guard: '#ffd23f' },
  { lv: 5, blade: '#8fd0ff', hi: '#e6f6ff', guard: '#ffd23f' },
  { lv: 10, blade: '#ffd23f', hi: '#fff6c2', guard: '#ff6b8b' },
];
const swordTier = (lv) => (lv >= 10 ? SWORD_TIERS[2] : lv >= 5 ? SWORD_TIERS[1] : SWORD_TIERS[0]);

function drawHero(g, x, y, k, o) {
  g.save();
  g.translate(x, y);
  if (o.ko) g.rotate(o.face * 0.9 * Math.min(1, o.ko * 3));
  g.scale(o.face * k, k);
  if (o.blink) g.globalAlpha = 0.45;
  const bob = o.ko ? 0 : Math.sin(o.t * 7) * 1.3;
  shadow(g, 0, 1, 15, 3.5);
  if (o.aura) { glow(g, 0, -17, 22, '#7cf0ff', 0.22); }
  // feet
  blob(g, -6, -2, 5, 3, '#c85a10', 1.6); blob(g, 7, -2, 5, 3, '#c85a10', 1.6);
  // sword arm behind body is drawn after the body
  blob(g, 0, -17 + bob, 14, 13, '#ff9a2e', 2.4);
  blob(g, -3, -21 + bob, 7, 5, '#ffc680', 0);
  if (o.flash > 0) { g.globalAlpha = Math.min(0.6, o.flash); blob(g, 0, -17 + bob, 14, 13, '#ff2a4a', 0); g.globalAlpha = o.blink ? 0.45 : 1; }
  // headband
  g.fillStyle = '#e8324a'; g.fillRect(-12.5, -28 + bob, 25, 4);
  poly(g, [-12, -27 + bob, -20, -24 + bob + Math.sin(o.t * 9) * 1.5, -12, -24 + bob], '#e8324a', 1.4);
  // face
  if (o.ko) {
    g.strokeStyle = OL; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-1, -21); g.lineTo(4, -16); g.moveTo(4, -21); g.lineTo(-1, -16); g.moveTo(6, -21); g.lineTo(11, -16); g.moveTo(11, -21); g.lineTo(6, -16); g.stroke();
  } else {
    box(g, -1, -22 + bob, 6, 7, '#fff', 1.4); box(g, 7, -22 + bob, 6, 7, '#fff', 1.4);
    g.fillStyle = OL; g.fillRect(2.4, -19 + bob, 2.6, 4); g.fillRect(10.4, -19 + bob, 2.6, 4);
    g.strokeStyle = OL; g.lineWidth = 1.6; g.beginPath(); g.moveTo(3, -11 + bob); g.lineTo(9, -11 + bob); g.stroke();
  }
  // arm + sword
  blob(g, 11, -12 + bob, 4, 3, '#ff9a2e', 1.6);
  const tier = swordTier(o.swordLv), L = 24 + Math.min(10, o.swordLv * 0.7);
  g.save();
  g.translate(14, -12 + bob);
  g.rotate(o.swing >= 0 ? -1.9 + ease(o.swing) * 2.9 : -1.1 + Math.sin(o.t * 4) * 0.06);
  box(g, -3, -1.6, 5, 3.2, '#8a5a2b', 1.4);
  box(g, 1, -5.5, 3.2, 11, tier.guard, 1.6);
  poly(g, [4, -3, 4 + L, -3, 8 + L, 0, 4 + L, 3, 4, 3], tier.blade, 1.8);
  g.fillStyle = tier.hi; g.fillRect(5, -1.6, L - 2, 1.4);
  g.restore();
  g.restore();
}

function drawAlly(g, kind, x, y, k, face, t, ph) {
  g.save();
  g.translate(x, y);
  g.scale(face * k, k);
  const bob = Math.sin(t * 5 + ph) * 1.2;
  shadow(g, 0, 1, 11, 3);
  if (kind === 'archer') {
    box(g, -10, -22 + bob, 5, 12, '#8a5a2b', 1.4); // quiver
    blob(g, 0, -13 + bob, 9.5, 9, '#58c46a', 2.2);
    poly(g, [-9, -17 + bob, 0, -30 + bob, 9, -17 + bob], '#2f8f45', 2);
    blob(g, 2, -15 + bob, 5.4, 4.6, '#ffd9a8', 1.4);
    g.fillStyle = OL; g.fillRect(2, -16 + bob, 1.8, 2.6); g.fillRect(5.4, -16 + bob, 1.8, 2.6);
    g.strokeStyle = '#8a5a2b'; g.lineWidth = 2.4; g.beginPath(); g.arc(8, -12 + bob, 9, -1.3, 1.3); g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.moveTo(8 + 9 * Math.cos(-1.3), -12 + bob + 9 * Math.sin(-1.3)); g.lineTo(8 + 9 * Math.cos(1.3), -12 + bob + 9 * Math.sin(1.3)); g.stroke();
  } else if (kind === 'mage') {
    g.strokeStyle = '#8a5a2b'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(11, -2); g.lineTo(11, -26 + bob); g.stroke();
    glow(g, 11, -28 + bob, 4 + Math.sin(t * 6) * 0.8, '#7cf0ff', 0.55);
    blob(g, 11, -28 + bob, 3.2, 3.2, '#d6fbff', 1.2);
    blob(g, 0, -12 + bob, 9.5, 9, '#9b6bff', 2.2);
    blob(g, 2, -14 + bob, 5.4, 4.6, '#ffd9a8', 1.4);
    g.fillStyle = OL; g.fillRect(2, -15 + bob, 1.8, 2.6); g.fillRect(5.4, -15 + bob, 1.8, 2.6);
    poly(g, [-10, -19 + bob, 0, -37 + bob, 10, -19 + bob], '#6a3fd0', 2);
    box(g, -12, -20 + bob, 24, 3.5, '#5230b0', 1.6);
    g.fillStyle = '#ffd23f'; g.fillRect(-1, -29 + bob, 3, 3);
  } else {
    blob(g, 0, -13 + bob, 10.5, 10, '#9aa8c8', 2.2);
    box(g, -9, -27 + bob, 18, 13, '#cfd8ec', 2, 5);
    g.fillStyle = OL; g.fillRect(-2, -22 + bob, 11, 3);
    g.fillStyle = '#e8324a'; g.fillRect(-2, -32 + bob, 4, 6);
    box(g, 7, -19 + bob, 9, 14, '#3a70d8', 2, 3);
    g.fillStyle = '#ffd23f'; g.fillRect(10.5, -17 + bob, 2, 10); g.fillRect(8.5, -13 + bob, 6, 2);
  }
  g.restore();
}

function drawWolf(g, x, y, k, face, t, ph, p, flash) {
  g.save();
  g.translate(x, y);
  g.scale(face * k, k);
  const run = t * 13 + ph, bob = -Math.abs(Math.sin(run)) * 2;
  shadow(g, 0, 1, 17, 3.5);
  for (let i = 0; i < 4; i++) {
    const lx = [-10, -5, 7, 12][i], sw = Math.sin(run + i * 1.6) * 4.5;
    limb(g, lx, -9 + bob, lx + sw, -1.5, 3.4, i % 2 ? p.body : p.dark);
  }
  poly(g, [-13, -16 + bob, -26, -25 + Math.sin(run) * 2.5 + bob, -19, -11 + bob], p.body, 2);
  blob(g, 0, -14 + bob, 15.5, 8.6, p.body, 2.2);
  blob(g, 1, -11 + bob, 10, 4, p.belly, 0);
  poly(g, [-9, -21 + bob, -6, -27 + bob, -3, -21 + bob], p.dark, 1.5);
  poly(g, [-3, -22 + bob, 0, -28 + bob, 3, -22 + bob], p.dark, 1.5);
  poly(g, [10, -24 + bob, 11, -34 + bob, 17, -25 + bob], p.dark, 1.8);
  blob(g, 15, -19 + bob, 8.5, 7.5, p.body, 2.2);
  poly(g, [20, -22 + bob, 30, -18 + bob, 20, -13 + bob], p.body, 2);
  blob(g, 29, -18.4 + bob, 2, 1.8, OL, 0);
  poly(g, [22, -13.5 + bob, 23.6, -9.5 + bob, 25.4, -14 + bob], '#fff', 1.2);
  poly(g, [14, -23.5 + bob, 20.5, -23 + bob, 19, -19.5 + bob], p.eye, 1.4);
  g.fillStyle = '#c4162e'; g.fillRect(18, -22.5 + bob, 1.8, 2.2);
  if (flash > 0) { g.globalAlpha = 0.7; blob(g, 0, -14 + bob, 15.5, 8.6, '#fff', 0); blob(g, 15, -19 + bob, 8.5, 7.5, '#fff', 0); g.globalAlpha = 1; }
  g.restore();
}

function drawMechWolf(g, x, y, k, face, t, ph, p, flash) {
  g.save();
  g.translate(x, y);
  g.scale(face * k, k);
  const run = t * 13 + ph, bob = -Math.abs(Math.sin(run)) * 1.6;
  shadow(g, 0, 1, 17, 3.5);
  for (let i = 0; i < 4; i++) {
    const lx = [-10, -5, 7, 12][i], sw = Math.sin(run + i * 1.6) * 4.5;
    limb2(g, lx, -10 + bob, lx + sw * 0.4 + 2, -5, lx + sw * 1.2, -1, 3.2, i % 2 ? p.plate : p.dark);
  }
  // rocket pack + flame
  const fl = 9 + Math.sin(t * 34 + ph) * 3;
  poly(g, [-15, -23 + bob, -15 - fl, -20.5 + bob, -15, -17 + bob], p.flame, 1.4);
  poly(g, [-15, -22 + bob, -15 - fl * 0.55, -20.5 + bob, -15, -19 + bob], '#fff3a0', 0);
  box(g, -17, -26 + bob, 11, 11, '#2b2f66', 1.8, 2);
  box(g, -13, -29 + bob, 3, 4, p.accent, 1.2);
  box(g, -15, -22 + bob, 15.5 * 2 - 4, 15, p.body, 2.2, 6);
  g.fillStyle = p.plate; g.fillRect(-12, -21 + bob, 24, 3);
  g.fillStyle = p.accent; g.fillRect(-12, -15 + bob, 24, 2);
  g.fillStyle = p.dark; g.fillRect(-4, -20 + bob, 2, 7); g.fillRect(2, -20 + bob, 2, 7);
  poly(g, [9, -27 + bob, 11, -36 + bob, 17, -27 + bob], p.plate, 1.8);
  poly(g, [11, -26 + bob, 22, -26 + bob, 31, -19 + bob, 30, -13 + bob, 20, -12 + bob, 10, -14 + bob], p.body, 2.2);
  poly(g, [21, -14 + bob, 23, -10 + bob, 25, -14 + bob], '#e8ecff', 1.2);
  poly(g, [26, -14 + bob, 28, -10.5 + bob, 29.6, -14.5 + bob], '#e8ecff', 1.2);
  glow(g, 19, -21 + bob, 3.5, p.glow, 0.5);
  poly(g, [14, -23.5 + bob, 22, -23 + bob, 21, -19 + bob, 15, -19.5 + bob], p.glow, 1.2);
  if (flash > 0) { g.globalAlpha = 0.7; box(g, -15, -22 + bob, 26, 15, '#fff', 0, 6); g.globalAlpha = 1; }
  g.restore();
}

function hpBar(g, x, y, w, h, ratio) {
  ratio = clamp(ratio, 0, 1);
  g.fillStyle = OL; g.fillRect(x - w / 2 - 1.5, y - 1.5, w + 3, h + 3);
  g.fillStyle = '#3a2a5a'; g.fillRect(x - w / 2, y, w, h);
  g.fillStyle = ratio > 0.5 ? '#5ce05c' : ratio > 0.25 ? '#ffd23f' : '#ff4d4d';
  g.fillRect(x - w / 2, y, w * ratio, h);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x - w / 2, y, w * ratio, Math.max(1, h * 0.35));
}

// boss: forest giant. Local origin = feet centre, faces -x (toward the hero).
function drawGiant(g, p, t, o) {
  const idle = Math.sin(t * 2) * 1.5;
  shadow(g, -4, 2, 58, 7);
  limb(g, 34, -96 + idle, 54, -58, 15, p.bark); // back arm
  box(g, -32, -36, 23, 38, p.bark, 2.5, 8); box(g, 8, -36, 23, 38, p.bark, 2.5, 8);
  blob(g, -22, 0, 17, 5, p.barkDark, 2); blob(g, 20, 0, 17, 5, p.barkDark, 2);
  box(g, -44, -120 + idle, 88, 92, p.bark, 3, 22);
  g.fillStyle = p.barkDark;
  for (let i = 0; i < 5; i++) g.fillRect(-32 + i * 15, -104 + idle, 3, 62 - (i % 2) * 8);
  g.globalAlpha = 0.45; g.fillStyle = p.barkLight; g.fillRect(-40, -108 + idle, 9, 66); g.globalAlpha = 1;
  if (o.flash > 0) { g.globalAlpha = 0.65; box(g, -44, -120 + idle, 88, 92, '#fff', 0, 22); g.globalAlpha = 1; }
  blob(g, -30, -112 + idle, 14, 6, p.moss, 1.6); blob(g, 28, -112 + idle, 13, 6, p.moss, 1.6);
  // face
  const ec = o.rage ? '#ff5a3a' : o.phase === 1 ? '#ffb02a' : p.eye;
  glow(g, -18, -86 + idle, 8, ec, 0.28); glow(g, 12, -86 + idle, 8, ec, 0.28);
  poly(g, [-28, -91 + idle, -9, -84 + idle, -14, -77 + idle, -26, -80 + idle], ec, 2);
  poly(g, [24, -91 + idle, 5, -84 + idle, 10, -77 + idle, 22, -80 + idle], ec, 2);
  g.fillStyle = OL; g.fillRect(-18, -85 + idle, 4, 5); g.fillRect(10, -85 + idle, 4, 5);
  limb(g, -33, -100 + idle, -8, -92 + idle, 5, p.barkDark); limb(g, 27, -100 + idle, 2, -92 + idle, 5, p.barkDark);
  poly(g, [-24, -62 + idle, -12, -57 + idle, 0, -65 + idle, 12, -57 + idle, 24, -62 + idle, 18, -46 + idle, 0, -41 + idle, -18, -46 + idle], '#2a1208', 2.4);
  poly(g, [-14, -58 + idle, -10, -50 + idle, -6, -58 + idle], '#f1e6c8', 1.2);
  poly(g, [4, -58 + idle, 8, -50 + idle, 12, -58 + idle], '#f1e6c8', 1.2);
  // crown of leaves
  const lc = [[-34, -122, 15], [-16, -132, 16], [6, -137, 16], [28, -128, 15], [40, -114, 12]];
  for (const c of lc) blob(g, c[0], c[1] + idle, c[2], c[2] * 0.85, p.leaf, 2.4);
  for (const c of lc) blob(g, c[0] - 4, c[1] - 4 + idle, c[2] * 0.45, c[2] * 0.35, p.leafLight, 0);
  poly(g, [-4, -142 + idle, 0, -156 + idle, 5, -142 + idle], p.leafDark, 1.8);
  // front arm (toward the hero)
  const sw = Math.sin(t * 2.4) * 5 + (o.rage ? Math.sin(t * 14) * 4 : 0);
  limb(g, -38, -96 + idle, -70, -62 + sw, 16, p.bark);
  blob(g, -73, -60 + sw, 11, 10, p.bark, 2.5);
  limb(g, -78, -66 + sw, -88, -74 + sw, 3.5, p.barkDark); limb(g, -80, -58 + sw, -90, -58 + sw, 3.5, p.barkDark); limb(g, -78, -52 + sw, -87, -46 + sw, 3.5, p.barkDark);
}

// boss: mech wolf. Drawn facing +x, caller mirrors it.
function drawMechBoss(g, p, t, o) {
  const idle = Math.sin(t * 2.2) * 1.3, w = Math.sin(t * 2.2) * 3;
  shadow(g, 4, 2, 62, 7);
  for (let i = 0; i < 4; i++) {
    const lx = [-34, -18, 16, 32][i], sw = (i % 2 ? w : -w);
    limb2(g, lx, -44 + idle, lx + sw * 0.4 + 6, -22, lx + sw, -2, 11, i % 2 ? p.plate : p.dark);
    blob(g, lx + sw, -1, 8, 3.2, p.dark, 1.8);
  }
  // tail
  limb2(g, -50, -64 + idle, -66, -74 + idle, -76 + Math.sin(t * 3) * 3, -94 + idle, 6, p.plate);
  blob(g, -76 + Math.sin(t * 3) * 3, -96 + idle, 7, 7, p.accent, 2.2);
  // rocket pods + flame
  const fl = 14 + Math.sin(t * 30) * 4;
  poly(g, [-56, -86 + idle, -56 - fl, -80 + idle, -56, -73 + idle], p.flame, 1.8);
  poly(g, [-56, -83 + idle, -56 - fl * 0.55, -80 + idle, -56, -76 + idle], '#fff3a0', 0);
  box(g, -60, -92 + idle, 22, 22, '#2b2f66', 2.4, 4);
  box(g, -54, -98 + idle, 7, 7, p.accent, 1.6);
  // body
  box(g, -52, -86 + idle, 98, 50, p.body, 3, 16);
  g.fillStyle = p.plate; g.fillRect(-46, -84 + idle, 86, 7);
  g.fillStyle = p.accent; g.fillRect(-46, -50 + idle, 86, 4);
  g.fillStyle = p.dark;
  for (let i = 0; i < 4; i++) g.fillRect(-30 + i * 14, -74 + idle, 6, 18);
  if (o.flash > 0) { g.globalAlpha = 0.65; box(g, -52, -86 + idle, 98, 50, '#fff', 0, 16); g.globalAlpha = 1; }
  g.fillStyle = p.glow2; for (let i = 0; i < 3; i++) g.fillRect(-44 + i * 6, -42 + idle, 3, 3);
  // shoulder cannon
  box(g, -6, -104 + idle, 36, 11, p.dark, 2.4, 3);
  box(g, 26, -106 + idle, 9, 15, p.plate, 2, 3);
  glow(g, 37, -98 + idle, 5 + Math.sin(t * 8) * 1.5, p.glow2, 0.45);
  // head
  poly(g, [40, -94 + idle, 42, -112 + idle, 56, -94 + idle], p.plate, 2.2);
  poly(g, [38, -92 + idle, 70, -78 + idle, 80, -64 + idle, 60, -54 + idle, 38, -58 + idle], p.body, 3);
  poly(g, [46, -56 + idle, 80, -56 + idle, 70, -40 + idle, 44, -46 + idle], p.dark, 2.6); // jaw
  for (let i = 0; i < 3; i++) poly(g, [52 + i * 9, -56 + idle, 55 + i * 9, -48 + idle, 58 + i * 9, -56 + idle], '#e8ecff', 1.4);
  const ec = o.rage ? '#ff3a3a' : o.phase === 1 ? '#ffb02a' : p.glow;
  glow(g, 58, -76 + idle, 7, ec, 0.4);
  poly(g, [50, -82 + idle, 68, -77 + idle, 54, -70 + idle], ec, 2);
  g.fillStyle = p.accent; g.fillRect(40, -80 + idle, 6, 3);
}

// ---------------------------------------------------------------- hud pieces
function pill(g, x, y, w, h, fill = 'rgba(20,10,60,.62)') {
  rr(g, x, y, w, h, h / 2);
  g.fillStyle = fill; g.fill();
}

function drawTopHud(g, L, s, b, fx, t) {
  const { W, ui } = L;
  const ph = 18 * ui, y0 = 5;
  const lab = `${b.icon} STAGE ${s.stage}`;
  const lw = measure(g, lab, 11 * ui) + 16;
  pill(g, 8, y0, lw, ph);
  text(g, lab, 8 + lw / 2, y0 + ph / 2 + 0.5, 11 * ui, '#fff', 'center', null);
  if (s.phase === 'wave' && s.wave) {
    const wl = `⚔ ${s.wave.killed}/${s.wave.target}`;
    const ww = measure(g, wl, 11 * ui) + 16;
    pill(g, W - 8 - ww, y0, ww, ph);
    text(g, wl, W - 8 - ww / 2, y0 + ph / 2 + 0.5, 11 * ui, '#ffd23f', 'center', null);
  }
  if (s.phase === 'boss' && s.boss) {
    const bd = b.boss, bar = 14 * ui, by = y0 + ph + 5, bx = 10, bw = W - 20;
    g.fillStyle = OL; g.fillRect(bx - 2.5, by - 2.5, bw + 5, bar + 5);
    g.fillStyle = '#3a1a3a'; g.fillRect(bx, by, bw, bar);
    const r = clamp(s.boss.hp / s.boss.maxHp, 0, 1);
    const pi = clamp(s.boss.phaseIdx | 0, 0, 2);
    g.fillStyle = ['#ff4d6d', '#ff8a2a', '#c43cff'][pi]; g.fillRect(bx, by, bw * r, bar);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(bx, by, bw * r, bar * 0.33);
    g.fillStyle = OL; // phase notches at 2/3 and 1/3 of the boss HP
    for (const th of BOSS_PHASE_AT) g.fillRect(Math.round(bx + bw * th) - 1.5, by - 2.5, 3, bar + 5);
    g.fillStyle = '#fff';
    for (const th of BOSS_PHASE_AT) g.fillRect(Math.round(bx + bw * th) - 0.5, by, 1, bar);
    text(g, bd.name, bx + 6, by + bar / 2 + 0.5, 10 * ui, '#fff', 'left');
    text(g, `P${pi + 1}`, bx + 12 + measure(g, bd.name, 10 * ui), by + bar / 2 + 0.5, 9 * ui, ['#ffe27a', '#ffd08a', '#e8b0ff'][pi], 'left');
    text(g, fmtNum(s.boss.hp), bx + bw - 6, by + bar / 2 + 0.5, 10 * ui, '#fff', 'right');
    const th = 7 * ui, ty = by + bar + 5, tw = bw - 38;
    const tr = clamp(s.boss.timeLeft / BOSS_TIME, 0, 1);
    g.fillStyle = OL; g.fillRect(bx - 2, ty - 2, tw + 4, th + 4);
    g.fillStyle = '#2a2a4a'; g.fillRect(bx, ty, tw, th);
    const low = s.boss.timeLeft < 8;
    g.fillStyle = low ? (Math.floor(t * 6) % 2 ? '#ff4d4d' : '#ffd0d0') : tr > 0.5 ? '#5ce05c' : '#ffd23f';
    g.fillRect(bx, ty, tw * tr, th);
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
  if (!b.shielded) { label = '💥 지금 공격!'; fill = 'rgba(170,30,60,.9)'; col = '#fff3a0'; frac = clamp(c.windowLeft / Math.max(0.01, c.windowTotal), 0, 1); }
  else if (c.state === 'telegraph') { label = '⚠ 공격 준비!'; fill = Math.floor(t * 8) % 2 ? 'rgba(160,90,0,.9)' : 'rgba(110,60,0,.9)'; col = '#ffe27a'; }
  else { label = '🛡 날아오는 걸 탭!'; fill = 'rgba(20,70,120,.88)'; col = '#bff3ff'; }
  const w = measure(g, label, 11 * ui) + 18;
  pill(g, 8, y, w, h, fill);
  text(g, label, 8 + w / 2, y + h / 2 + 0.5, 11 * ui, col, 'center', null);
  if (frac >= 0) {
    g.fillStyle = OL; g.fillRect(8, y + h + 2, w, 5 * ui + 2);
    g.fillStyle = '#ffd23f'; g.fillRect(9, y + h + 3, (w - 2) * frac, 5 * ui);
  }
}

function drawBanner(g, L, bn) {
  const { W, H, ui } = L;
  const p = bn.t / bn.dur, tin = Math.min(1, bn.t / 0.22), tout = clamp((bn.dur - bn.t) / 0.25, 0, 1);
  const h = (bn.big ? 46 : bn.sub ? 38 : 30) * ui, y = H * 0.3 - h / 2;
  const ox = (1 - ease(tin)) * -W;
  g.save();
  g.globalAlpha = tout;
  g.translate(ox, 0);
  g.fillStyle = OL; g.fillRect(-4, y - 3, W + 8, h + 6);
  g.fillStyle = bn.color; g.fillRect(-4, y, W + 8, h);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(-4, y, W + 8, h * 0.3);
  if (bn.big) { g.fillStyle = 'rgba(255,230,80,.35)'; for (let i = -1; i < 12; i++) g.fillRect(i * 34 + (p * 40) % 34, y + h - 5, 17, 5); }
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
  const { cx, cy, rx, ry } = bossCenter(L), col = b.aura[pi];
  const pulse = 0.5 + 0.5 * Math.sin(t * (pi === 2 ? 9 : 5));
  g.fillStyle = col;
  g.globalAlpha = (pi === 0 ? 0 : 0.1 + 0.06 * pi + 0.05 * pulse) + tele * 0.22;
  ellipse(g, cx, cy, rx * 1.18, ry * 1.12); g.fill();
  g.globalAlpha = (pi === 0 ? 0 : 0.07 + 0.04 * pi) + tele * 0.16;
  ellipse(g, cx, cy, rx * 1.38, ry * 1.3); g.fill();
  g.globalAlpha = 1;
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
  // slashes
  for (const sl of fx.slashes) {
    const q = sl.t / sl.life, cx = sl.x * W + (sl.boss ? -34 * bu : 0), cy = (sl.boss ? feetY - 70 * bu : feetY - 22 * cu) + sl.jy * (sl.boss ? 1 : 0.3);
    const R = (sl.crit ? 36 : sl.weak ? 17 : 25) * (sl.boss ? bu : cu) * (0.7 + 0.5 * q);
    const a0 = sl.dir > 0 ? -1.9 + sl.rot : Math.PI + 0.2 - sl.rot, a1 = sl.dir > 0 ? -0.2 + sl.rot : Math.PI + 1.9 - sl.rot;
    g.globalAlpha = 1 - q * q;
    g.lineCap = 'round';
    g.strokeStyle = sl.crit ? '#ff7a1a' : sl.weak ? '#a39ac8' : '#9fd8ff'; g.lineWidth = (sl.crit ? 9 : sl.weak ? 3 : 6) * (1 - q) + 1;
    g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
    g.strokeStyle = sl.crit ? '#fff3a0' : sl.weak ? '#d8d2ee' : '#fff'; g.lineWidth = (sl.crit ? 4.5 : sl.weak ? 1.5 : 3) * (1 - q) + 0.5;
    g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
    if (sl.crit) {
      g.fillStyle = '#fff3a0';
      for (let i = 0; i < 5; i++) { const a = i * 1.26 + sl.rot * 3; g.fillRect(cx + Math.cos(a) * R * (0.5 + q) - 2, cy + Math.sin(a) * R * (0.5 + q) - 2, 4, 4); }
    }
    g.lineCap = 'butt';
    g.globalAlpha = 1;
  }
  // gold pops
  for (const gp of fx.golds) {
    const q = gp.t / gp.life, px = gp.x * W, py = (gp.boss ? feetY - 100 * bu : feetY - 34 * cu) - ease(q) * 30 * ui;
    g.globalAlpha = q < 0.7 ? 1 : (1 - q) / 0.3;
    const tw = measure(g, gp.text, 11 * ui);
    const x0 = clamp(px - tw / 2 - 5 * ui, 8, W - tw - 22 * ui);
    blob(g, x0 + 5 * ui, py, 5 * ui, 5 * ui, '#ffd23f', 1.6);
    g.fillStyle = '#ff9d1f'; g.fillRect(x0 + 4 * ui, py - 2.2 * ui, 2 * ui, 4.4 * ui);
    text(g, gp.text, x0 + 12 * ui, py + 0.5, 11 * ui, '#ffe27a', 'left');
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

